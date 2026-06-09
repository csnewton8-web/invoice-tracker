import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfText } from "@/lib/pdf";
import { parseInvoiceWithAzure } from "@/lib/azure-invoice-parser";
import {
  parseInvoice,
  parseInvoiceFromPdf,
  type ParsedInvoice,
} from "@/lib/invoice-parser";
import { getInvoiceLimitForPlan } from "@/lib/plans";
import { createAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_INVOICE_BUCKET = "invoices";
const PDF_MAGIC_BYTES = "%PDF-";
const INBOUND_ADDRESS = "invoices@flashfox.co.uk";

type ResendAttachment = {
  id: string;
  filename: string;
  content_type: string;
  content_disposition?: string;
  content_id?: string;
};

type ResendInboundEvent = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    attachments?: ResendAttachment[];
  };
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function extractEmailAddress(value: string | null | undefined) {
  if (!value) return "";

  const match = value.match(/<([^>]+)>/);
  const email = match ? match[1] : value;

  return email.trim().toLowerCase();
}

function sanitizeFilename(filename: string) {
  const fallback = "invoice.pdf";

  const sanitized = filename
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  if (!sanitized) return fallback;

  return sanitized.endsWith(".pdf") ? sanitized : `${sanitized}.pdf`;
}

function looksLikePdf(buffer: Buffer) {
  if (buffer.length < PDF_MAGIC_BYTES.length) return false;

  return (
    buffer.subarray(0, PDF_MAGIC_BYTES.length).toString("utf8") ===
    PDF_MAGIC_BYTES
  );
}

function hasUsefulFields(parsed: ParsedInvoice) {
  return Boolean(
    parsed.supplier ||
      parsed.invoice_number ||
      parsed.invoice_date ||
      parsed.due_date ||
      parsed.total != null ||
      parsed.currency
  );
}

function hasCoreHeaderFields(parsed: ParsedInvoice) {
  return Boolean(parsed.invoice_number && parsed.invoice_date && parsed.due_date);
}

function mergeParsedResults(
  first: ParsedInvoice,
  second: ParsedInvoice
): ParsedInvoice {
  return {
    supplier: first.supplier ?? second.supplier,
    invoice_number: first.invoice_number ?? second.invoice_number,
    invoice_date: first.invoice_date ?? second.invoice_date,
    due_date: first.due_date ?? second.due_date,
    payment_terms: first.payment_terms ?? second.payment_terms,
    total: first.total ?? second.total,
    currency: first.currency ?? second.currency,
    confidence: Math.max(first.confidence ?? 0, second.confidence ?? 0),
    extraction_method: first.extraction_method ?? second.extraction_method,
    notes: Array.from(
      new Set([...(first.notes || []), ...(second.notes || [])])
    ),
  };
}

async function safeDeleteUploadedFile({
  supabase,
  bucket,
  filePath,
}: {
  supabase: any;
  bucket: string;
  filePath: string;
}) {
  try {
    await supabase.storage.from(bucket).remove([filePath]);
  } catch (error) {
    console.error("Failed to clean up inbound invoice file:", error);
  }
}

async function getAttachmentDownloadUrl({
  emailId,
  attachmentId,
}: {
  emailId: string;
  attachmentId: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const res = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(
      emailId
    )}/attachments/${encodeURIComponent(attachmentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    }
  );

  const body = await res.json();

  if (!res.ok) {
    console.error("Resend attachment lookup failed:", body);
    throw new Error("Could not retrieve inbound email attachment");
  }

  if (!body.download_url) {
    throw new Error("Inbound attachment download URL was missing");
  }

  return body.download_url as string;
}

async function downloadAttachment(downloadUrl: string) {
  const res = await fetch(downloadUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Could not download inbound attachment");
  }

  const arrayBuffer = await res.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

async function parseInvoiceBuffer(buffer: Buffer, filename: string) {
  const rawText = await extractPdfText(buffer);

  let parsed: ParsedInvoice | null = null;

  const azureParsed = await parseInvoiceWithAzure(buffer, filename);

  if (hasUsefulFields(azureParsed)) {
    parsed = azureParsed;
  }

  if (!parsed && rawText && rawText.trim().length > 30) {
    const textParsed = await parseInvoice(rawText, filename);

    if (hasUsefulFields(textParsed)) {
      parsed = textParsed;
    }
  }

  if (!parsed || !hasCoreHeaderFields(parsed)) {
    const pdfParsed = await parseInvoiceFromPdf(buffer, filename);

    if (parsed && hasUsefulFields(parsed)) {
      parsed = mergeParsedResults(parsed, pdfParsed);
    } else {
      parsed = pdfParsed;
    }
  }

  return { parsed, rawText };
}

export async function POST(req: NextRequest) {
  const bucket = process.env.INVOICE_STORAGE_BUCKET || DEFAULT_INVOICE_BUCKET;

  try {
    const event = (await req.json()) as ResendInboundEvent;

    if (event.type !== "email.received") {
      return jsonResponse({ success: true, ignored: true, reason: "wrong_event" });
    }

    const emailId = event.data?.email_id;
    const fromEmail = extractEmailAddress(event.data?.from);
    const recipients = (event.data?.to || []).map(extractEmailAddress);
    const attachments = event.data?.attachments || [];

    if (!emailId) {
      return jsonResponse({ success: true, ignored: true, reason: "missing_email_id" });
    }

    if (!recipients.includes(INBOUND_ADDRESS)) {
      return jsonResponse({
        success: true,
        ignored: true,
        reason: "wrong_recipient",
        recipients,
      });
    }

    if (!fromEmail) {
      return jsonResponse({ success: true, ignored: true, reason: "missing_sender" });
    }

    const supabase = createAdminClient();

    const { data: sender, error: senderError } = await supabase
      .from("email_forwarding_senders")
      .select("company_id, user_id, email, is_active")
      .eq("email", fromEmail)
      .eq("is_active", true)
      .maybeSingle();

    if (senderError) {
      throw senderError;
    }

    if (!sender?.company_id || !sender?.user_id) {
      console.warn("Inbound email rejected: sender not approved", {
        fromEmail,
        emailId,
      });

      return jsonResponse({
        success: true,
        ignored: true,
        reason: "sender_not_approved",
        fromEmail,
      });
    }

    const pdfAttachments = attachments.filter(
      (attachment) =>
        attachment.id &&
        attachment.content_type === "application/pdf" &&
        attachment.filename?.toLowerCase().endsWith(".pdf")
    );

    if (!pdfAttachments.length) {
      return jsonResponse({
        success: true,
        ignored: true,
        reason: "no_pdf_attachments",
      });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, plan")
      .eq("id", sender.company_id)
      .single();

    if (companyError || !company) {
      throw companyError || new Error("Company not found");
    }

    const invoiceLimit = getInvoiceLimitForPlan(company.plan);

    if (invoiceLimit !== null) {
      const { count, error: countError } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("company_id", sender.company_id);

      if (countError) {
        throw countError;
      }

      if ((count || 0) >= invoiceLimit) {
        return jsonResponse({
          success: true,
          ignored: true,
          reason: "invoice_limit_reached",
        });
      }
    }

    const createdInvoices: any[] = [];
    const skippedAttachments: any[] = [];

    for (const attachment of pdfAttachments) {
      try {
        const safeFileName = sanitizeFilename(attachment.filename);
        const downloadUrl = await getAttachmentDownloadUrl({
          emailId,
          attachmentId: attachment.id,
        });

        const buffer = await downloadAttachment(downloadUrl);

        if (!looksLikePdf(buffer)) {
          skippedAttachments.push({
            filename: attachment.filename,
            reason: "not_valid_pdf",
          });
          continue;
        }

        const fingerprint = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex");

        const invoiceId = crypto.randomUUID();
        const filePath = `${sender.company_id}/invoices/${invoiceId}/${Date.now()}-${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, buffer, {
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { parsed, rawText } = await parseInvoiceBuffer(
          buffer,
          safeFileName
        );

        const invoiceRecord = {
          id: invoiceId,
          user_id: sender.user_id,
          company_id: sender.company_id,
          supplier: parsed?.supplier ?? null,
          invoice_number: parsed?.invoice_number ?? null,
          invoice_date: parsed?.invoice_date ?? null,
          due_date: parsed?.due_date ?? null,
          payment_terms: parsed?.payment_terms ?? null,
          total: parsed?.total ?? null,
          currency: parsed?.currency ?? null,
          confidence: parsed?.confidence ?? null,
          extraction_method: parsed?.extraction_method ?? "email_forward",
          fingerprint,
          file_name: safeFileName,
          file_path: filePath,
          file_size: buffer.length,
          raw_text: rawText ?? null,
          notes: [
            ...(parsed?.notes || []),
            `Received by email from ${fromEmail}`,
            `Email subject: ${event.data?.subject || "-"}`,
          ],
          is_paid: false,
          updated_at: new Date().toISOString(),
        };

        const { data: invoice, error: insertError } = await supabase
          .from("invoices")
          .insert(invoiceRecord)
          .select()
          .single();

        if (insertError) {
          await safeDeleteUploadedFile({
            supabase,
            bucket,
            filePath,
          });

          if (insertError.message?.toLowerCase().includes("duplicate")) {
            skippedAttachments.push({
              filename: safeFileName,
              reason: "duplicate_invoice",
            });
            continue;
          }

          throw insertError;
        }

        await createAuditLog({
          supabase,
          companyId: sender.company_id,
          userId: sender.user_id,
          action: "invoice_uploaded_by_email",
          entityType: "invoice",
          entityId: invoice.id,
          metadata: {
            supplier: invoice.supplier,
            invoice_number: invoice.invoice_number,
            total: invoice.total,
            currency: invoice.currency,
            file_name: invoice.file_name,
            file_size: invoice.file_size,
            from_email: fromEmail,
            email_id: emailId,
            attachment_id: attachment.id,
          },
        });

        createdInvoices.push(invoice);
      } catch (error) {
        console.error("Failed to process inbound attachment:", {
          attachment,
          error,
        });

        skippedAttachments.push({
          filename: attachment.filename,
          reason: error instanceof Error ? error.message : "processing_failed",
        });
      }
    }

    return jsonResponse({
      success: true,
      received: true,
      from: fromEmail,
      created: createdInvoices.length,
      skipped: skippedAttachments,
      invoices: createdInvoices.map((invoice) => ({
        id: invoice.id,
        supplier: invoice.supplier,
        invoice_number: invoice.invoice_number,
        total: invoice.total,
        currency: invoice.currency,
      })),
    });
  } catch (error) {
    console.error("Inbound email processing error:", error);

    return NextResponse.json(
      { error: "Inbound email processing failed" },
      { status: 500 }
    );
  }
}