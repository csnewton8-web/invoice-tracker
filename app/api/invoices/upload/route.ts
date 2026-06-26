import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireCurrentCompany } from "@/lib/current-company";
import { extractPdfText } from "@/lib/pdf";
import { parseInvoiceWithAzure } from "@/lib/azure-invoice-parser";
import {
  parseInvoice,
  parseInvoiceFromPdf,
  type ParsedInvoice,
} from "@/lib/invoice-parser";
import { getInvoiceLimitForPlan } from "@/lib/plans";
import { validateInvoiceFile } from "@/lib/upload-limits";
import { rateLimit } from "@/lib/rate-limit";
import { createAuditLog } from "@/lib/audit-log";
import { detectDuplicateInvoice } from "@/lib/duplicate-invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_INVOICE_BUCKET = "invoices";
const PDF_MAGIC_BYTES = "%PDF-";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function hasUsefulFields(parsed: ParsedInvoice) {
  return Boolean(
    parsed.supplier ||
      parsed.invoice_number ||
      parsed.po_number ||
      parsed.invoice_date ||
      parsed.due_date ||
      parsed.payment_terms ||
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
    po_number: first.po_number ?? second.po_number,
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
    console.error("Failed to clean up uploaded invoice file:", error);
  }
}

export async function POST(req: NextRequest) {
  const bucket = process.env.INVOICE_STORAGE_BUCKET || DEFAULT_INVOICE_BUCKET;

  try {
    const { user, supabase, companyId } = await requireCurrentCompany(req);

    const limiter = await rateLimit({
      key: `invoice-upload:${user.id}:${companyId}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });

    if (!limiter.success) {
      return NextResponse.json(
        { error: "Too many uploads. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(limiter.retryAfter ?? 60),
          },
        }
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("plan, is_active, deleted_at")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      console.error("Failed to load company plan:", companyError);
      return jsonError("Could not load company details", 500);
    }

    if (!company.is_active || company.deleted_at) {
      return jsonError(
        company.deleted_at
          ? "Workspace has been deleted"
          : "Workspace has been deactivated",
        403
      );
    }

    const invoiceLimit = getInvoiceLimitForPlan(company.plan);

    if (invoiceLimit !== null) {
      const { count, error: countError } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId);

      if (countError) {
        console.error("Failed to count invoices:", countError);
        return jsonError("Could not check invoice limit", 500);
      }

      if ((count || 0) >= invoiceLimit) {
        return jsonError(
          `Free plan limit reached. You can upload up to ${invoiceLimit} invoices on the Free plan.`,
          403
        );
      }
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("No file uploaded", 400);
    }

    const fileValidationError = validateInvoiceFile(file);

    if (fileValidationError) {
      return jsonError(fileValidationError, 400);
    }

    if (file.size === 0) {
      return jsonError("Empty files are not allowed", 400);
    }

    if (file.type && file.type !== "application/pdf") {
      return jsonError("Only PDF files are allowed", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!looksLikePdf(buffer)) {
      return jsonError("Uploaded file is not a valid PDF", 400);
    }

    const fingerprint = crypto.createHash("sha256").update(buffer).digest("hex");

    const { data: existingExactInvoice, error: exactDuplicateError } =
      await supabase
        .from("invoices")
        .select("id, supplier, invoice_number, po_number, file_name")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .eq("fingerprint", fingerprint)
        .limit(1)
        .maybeSingle();

    if (exactDuplicateError) {
      console.error("Exact duplicate check failed:", exactDuplicateError);
      return jsonError("Could not check whether this PDF already exists", 500);
    }

    if (existingExactInvoice?.id) {
      return NextResponse.json(
        {
          error: "This exact PDF has already been uploaded.",
          existingInvoice: existingExactInvoice,
        },
        { status: 409 }
      );
    }

    const invoiceId = crypto.randomUUID();
    const safeFileName = sanitizeFilename(file.name);
    const filePath = `${companyId}/invoices/${invoiceId}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Invoice PDF upload failed:", uploadError);
      return jsonError(
        `Could not upload invoice file: ${uploadError.message}`,
        500
      );
    }

    const rawText = await extractPdfText(buffer);

    let parsed: ParsedInvoice | null = null;

    const azureParsed = await parseInvoiceWithAzure(buffer, file.name);

    if (hasUsefulFields(azureParsed)) {
      parsed = azureParsed;
    }

    if (!parsed && rawText && rawText.trim().length > 30) {
      const textParsed = await parseInvoice(rawText, file.name);

      if (hasUsefulFields(textParsed)) {
        parsed = textParsed;
      }
    }

    if (!parsed || !hasCoreHeaderFields(parsed)) {
      const pdfParsed = await parseInvoiceFromPdf(buffer, file.name);

      if (parsed && hasUsefulFields(parsed)) {
        parsed = mergeParsedResults(parsed, pdfParsed);
      } else {
        parsed = pdfParsed;
      }
    }

    const duplicateResult = await detectDuplicateInvoice(supabase, {
      companyId,
      supplier: parsed?.supplier ?? null,
      invoice_number: parsed?.invoice_number ?? null,
      invoice_date: parsed?.invoice_date ?? null,
      due_date: parsed?.due_date ?? null,
      total: parsed?.total ?? null,
      currency: parsed?.currency ?? null,
      fingerprint,
    });

    const invoiceRecord = {
      id: invoiceId,
      user_id: user.id,
      company_id: companyId,
      supplier: parsed?.supplier ?? null,
      invoice_number: parsed?.invoice_number ?? null,
      po_number: parsed?.po_number ?? null,
      invoice_date: parsed?.invoice_date ?? null,
      due_date: parsed?.due_date ?? null,
      payment_terms: parsed?.payment_terms ?? null,
      total: parsed?.total ?? null,
      currency: parsed?.currency ?? null,
      confidence: parsed?.confidence ?? null,
      extraction_method: parsed?.extraction_method ?? null,
      fingerprint,
      duplicate_of_invoice_id: duplicateResult.duplicate_of_invoice_id,
      duplicate_confidence: duplicateResult.duplicate_confidence,
      duplicate_status: duplicateResult.duplicate_status,
      file_name: safeFileName,
      file_path: filePath,
      file_size: file.size ?? null,
      raw_text: rawText ?? null,
      notes: parsed?.notes ?? [],
      is_paid: false,
      updated_at: new Date().toISOString(),
    };

    const { data, error: insertError } = await supabase
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
        return jsonError("This invoice has already been uploaded.", 409);
      }

      console.error("Invoice database insert failed:", insertError);
      return jsonError(
        `Could not save invoice record: ${insertError.message}`,
        500
      );
    }

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: "invoice_uploaded",
      entityType: "invoice",
      entityId: data.id,
      metadata: {
        supplier: data.supplier,
        invoice_number: data.invoice_number,
        po_number: data.po_number,
        total: data.total,
        currency: data.currency,
        file_name: data.file_name,
        file_size: data.file_size,
        duplicate_status: data.duplicate_status,
        duplicate_confidence: data.duplicate_confidence,
        duplicate_of_invoice_id: data.duplicate_of_invoice_id,
      },
    });

    return NextResponse.json({
      success: true,
      invoice: data,
    });
  } catch (error: unknown) {
    console.error("Invoice upload error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown upload error";

    return jsonError(`Upload failed: ${message}`, 500);
  }
}