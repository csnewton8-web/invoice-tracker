import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireCurrentCompany } from "@/lib/current-company";
import { extractPdfText } from "@/lib/pdf";
import { parseInvoice, parseInvoiceFromPdf } from "@/lib/invoice-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, companyId } = await requireCurrentCompany(req);

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fingerprint = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    const bucket = process.env.INVOICE_STORAGE_BUCKET || "invoices";
    const safeFileName = file.name.replace(/[^\w.\-]+/g, "_");
    const invoiceId = crypto.randomUUID();
    const filePath = `${companyId}/invoices/${invoiceId}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const rawText = await extractPdfText(buffer);

    const parsed =
      rawText && rawText.trim().length > 20
        ? await parseInvoice(rawText, file.name)
        : await parseInvoiceFromPdf(buffer, file.name);

    const invoiceRecord = {
      id: invoiceId,
      user_id: user.id,
      company_id: companyId,
      supplier: parsed.supplier ?? null,
      invoice_number: parsed.invoice_number ?? null,
      invoice_date: parsed.invoice_date ?? null,
      due_date: parsed.due_date ?? null,
      payment_terms: parsed.payment_terms ?? null,
      total: parsed.total ?? null,
      currency: parsed.currency ?? null,
      confidence: parsed.confidence ?? null,
      extraction_method: parsed.extraction_method ?? null,
      fingerprint,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size ?? null,
      raw_text: rawText ?? null,
      notes: parsed.notes ?? [],
      is_paid: false,
      updated_at: new Date().toISOString(),
    };

    const { data, error: insertError } = await supabase
      .from("invoices")
      .insert(invoiceRecord)
      .select()
      .single();

    if (insertError) {
      if (insertError.message?.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { error: "This invoice has already been uploaded." },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      invoice: data,
    });
  } catch (error: any) {
    console.error("Invoice create error:", error);
    return NextResponse.json(
      { error: error?.message || "Upload failed" },
      { status: 500 }
    );
  }
}