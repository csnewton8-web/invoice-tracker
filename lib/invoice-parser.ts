import { openai } from "@/lib/openai";
import { ExtractedInvoice } from "@/types/invoice";

function buildPrompt(text: string) {
  return `Extract structured data from this supplier invoice text.

Return valid JSON only in this exact shape:
{
  "supplier": string | null,
  "invoice_number": string | null,
  "invoice_date": string | null,
  "due_date": string | null,
  "payment_terms": string | null,
  "total": number | null,
  "currency": string | null,
  "confidence": number,
  "extraction_method": "ai",
  "notes": string[]
}

Rules:
- dates must be YYYY-MM-DD
- if due_date is not explicit but payment terms like Net 30 exist and invoice_date exists, calculate due_date
- currency must be a 3-letter code like GBP, USD, EUR
- confidence must be between 0 and 1
- if unsure, use null
- return JSON only, no markdown

Invoice text:
${text}`;
}

export async function extractInvoiceWithAI(text: string): Promise<ExtractedInvoice> {
  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    input: buildPrompt(text),
  });

  const parsed = JSON.parse(response.output_text) as ExtractedInvoice;

  return {
    supplier: parsed.supplier ?? null,
    invoice_number: parsed.invoice_number ?? null,
    invoice_date: parsed.invoice_date ?? null,
    due_date: parsed.due_date ?? null,
    payment_terms: parsed.payment_terms ?? null,
    total: typeof parsed.total === "number" ? parsed.total : null,
    currency: parsed.currency ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    extraction_method: "ai",
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
  };
}