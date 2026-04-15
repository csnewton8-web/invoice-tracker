import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const invoiceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    supplier: { type: ["string", "null"] },
    invoice_number: { type: ["string", "null"] },
    invoice_date: { type: ["string", "null"] },
    due_date: { type: ["string", "null"] },
    payment_terms: { type: ["string", "null"] },
    total: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    confidence: { type: "number" },
    extraction_method: { type: "string" },
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "supplier",
    "invoice_number",
    "invoice_date",
    "due_date",
    "payment_terms",
    "total",
    "currency",
    "confidence",
    "extraction_method",
    "notes",
  ],
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }

    const fingerprint = `${file.name}-${file.size}`;

    const { data: existing } = await supabase
      .from("invoices")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("fingerprint", fingerprint)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "This PDF has already been uploaded." },
        { status: 409 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    const admin = getAdmin();
    const bucket = process.env.INVOICE_STORAGE_BUCKET || "invoices";
    const filePath = `${userData.user.id}/${Date.now()}-${file.name}`;

    const upload = await admin.storage.from(bucket).upload(filePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

    if (upload.error) {
      return NextResponse.json({ error: upload.error.message }, { status: 500 });
    }

    let extracted = {
      supplier: null as string | null,
      invoice_number: null as string | null,
      invoice_date: null as string | null,
      due_date: null as string | null,
      payment_terms: null as string | null,
      total: null as number | null,
      currency: null as string | null,
      confidence: 0.1,
      extraction_method: "upload-only",
      notes: ["AI extraction not run."],
    };

    try {
      const response = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: file.name,
                file_data: `data:application/pdf;base64,${base64}`,
              },
              {
                type: "input_text",
                text:
                  "Extract supplier invoice data. " +
                  "Return supplier, invoice number, invoice date, due date, payment terms, total, currency, confidence, extraction_method, and notes. " +
                  "Dates must be YYYY-MM-DD. " +
                  "If due date is not explicit but payment terms like Net 30 exist and invoice date exists, calculate the due date. " +
                  "If unsure, use null.",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "invoice_extraction",
            strict: true,
            schema: invoiceSchema,
          },
        },
      });

      const parsed = JSON.parse(response.output_text);

      extracted = {
        supplier: parsed.supplier ?? null,
        invoice_number: parsed.invoice_number ?? null,
        invoice_date: parsed.invoice_date ?? null,
        due_date: parsed.due_date ?? null,
        payment_terms: parsed.payment_terms ?? null,
        total: typeof parsed.total === "number" ? parsed.total : null,
        currency: parsed.currency ?? null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        extraction_method: parsed.extraction_method || "ai-pdf",
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      };
    } catch (error: any) {
      extracted = {
        supplier: null,
        invoice_number: null,
        invoice_date: null,
        due_date: null,
        payment_terms: null,
        total: null,
        currency: null,
        confidence: 0.1,
        extraction_method: "upload-only",
        notes: [
          error?.code === "insufficient_quota"
            ? "OpenAI quota exceeded. Upload saved but AI extraction was skipped."
            : "AI extraction failed. Upload saved without parsed invoice data.",
        ],
      };
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        user_id: userData.user.id,
        supplier: extracted.supplier,
        invoice_number: extracted.invoice_number,
        invoice_date: extracted.invoice_date,
        due_date: extracted.due_date,
        payment_terms: extracted.payment_terms,
        total: extracted.total,
        currency: extracted.currency,
        confidence: extracted.confidence,
        extraction_method: extracted.extraction_method,
        fingerprint,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        raw_text: null,
        notes: extracted.notes,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Invoice upload failed" }, { status: 500 });
  }
}