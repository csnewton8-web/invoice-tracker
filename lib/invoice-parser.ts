import { openai } from "@/lib/openai";
import { toFile } from "openai/uploads";

export type ParsedInvoice = {
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  total: number | null;
  currency: string | null;
  confidence: number | null;
  extraction_method: "ai-pdf" | "ai-text" | "regex" | "azure-invoice";
  notes: string[];
};

function normaliseText(text: string) {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function normaliseDate(value: unknown): string | null {
  if (!value) return null;

  const cleaned = String(value).trim().replace(/\./g, "/");

  let match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (match) {
    const [, dd, mm, yy] = match;
    const fullYear = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
    return `${fullYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, yyyy, mm, dd] = match;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  return null;
}

function parseAmount(value: unknown): number | null {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function cleanInvoiceNumber(value: unknown): string | null {
  if (!value) return null;

  const cleaned = String(value)
    .replace(/^invoice\s*(no|number|#)?\s*:?\s*/i, "")
    .trim();

  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();

  if (
    lower.includes("issue") ||
    lower.includes("page") ||
    lower.includes("vat") ||
    lower.includes("sort") ||
    lower.includes("account") ||
    lower.includes("bank") ||
    lower.includes("terms") ||
    lower.includes("delivery") ||
    lower.includes("order") ||
    lower.includes("job") ||
    cleaned.length > 40
  ) {
    return null;
  }

  if (!/[0-9]/.test(cleaned)) return null;

  return cleaned;
}

function isValidDate(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const year = date.getFullYear();
  return year >= 2020 && year <= 2100;
}

function valueFromAliases(data: any, keys: string[]) {
  for (const key of keys) {
    const value = data?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return null;
}

function coerceParsed(data: any, method: ParsedInvoice["extraction_method"]): ParsedInvoice {
  const invoiceNumber = cleanInvoiceNumber(
    valueFromAliases(data, ["invoice_number", "invoiceNumber", "invoice_no", "invoiceNo", "invoice"])
  );

  const invoiceDate = normaliseDate(
    valueFromAliases(data, ["invoice_date", "invoiceDate", "date"])
  );

  const dueDate = normaliseDate(
    valueFromAliases(data, ["due_date", "dueDate", "payment_due_date", "paymentDueDate", "payment_due"])
  );

  const confidenceValue = valueFromAliases(data, ["confidence"]);

  return {
    supplier: valueFromAliases(data, ["supplier", "vendor", "issuer"]) ?? null,
    invoice_number: invoiceNumber,
    invoice_date: isValidDate(invoiceDate) ? invoiceDate : null,
    due_date: isValidDate(dueDate) ? dueDate : null,
    payment_terms: valueFromAliases(data, ["payment_terms", "paymentTerms", "terms"]) ?? null,
    total: parseAmount(valueFromAliases(data, ["total", "invoice_total", "amount_due", "total_due"])),
    currency: valueFromAliases(data, ["currency", "currency_code"])
      ? String(valueFromAliases(data, ["currency", "currency_code"])).toUpperCase()
      : null,
    confidence:
      typeof confidenceValue === "number"
        ? confidenceValue
        : confidenceValue === "high"
          ? 0.9
          : confidenceValue === "medium"
            ? 0.65
            : confidenceValue === "low"
              ? 0.35
              : 0.8,
    extraction_method: method,
    notes: Array.isArray(data?.notes) ? data.notes : [],
  };
}

function mergeParsed(first: ParsedInvoice, second: ParsedInvoice): ParsedInvoice {
  return {
    supplier: first.supplier ?? second.supplier,
    invoice_number: first.invoice_number ?? second.invoice_number,
    invoice_date: first.invoice_date ?? second.invoice_date,
    due_date: first.due_date ?? second.due_date,
    payment_terms: first.payment_terms ?? second.payment_terms,
    total: first.total ?? second.total,
    currency: first.currency ?? second.currency,
    confidence: Math.max(first.confidence ?? 0, second.confidence ?? 0),
    extraction_method: first.extraction_method,
    notes: Array.from(new Set([...(first.notes || []), ...(second.notes || [])])),
  };
}

function mergeHeaderOverGeneral(header: ParsedInvoice, general: ParsedInvoice): ParsedInvoice {
  return {
    supplier: header.supplier ?? general.supplier,
    invoice_number: header.invoice_number,
    invoice_date: header.invoice_date,
    due_date: header.due_date,
    payment_terms: header.payment_terms ?? general.payment_terms,
    total: header.total ?? general.total,
    currency: header.currency ?? general.currency,
    confidence: Math.max(header.confidence ?? 0, general.confidence ?? 0),
    extraction_method: "ai-pdf",
    notes: Array.from(new Set([...(header.notes || []), ...(general.notes || [])])),
  };
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      console.error("AI response did not contain JSON:", text);
      throw new Error("No JSON found in model response");
    }

    return JSON.parse(match[0]);
  }
}

export async function parseInvoice(text: string, fileName?: string): Promise<ParsedInvoice> {
  const cleaned = normaliseText(text);

  if (!cleaned) {
    return {
      supplier: null,
      invoice_number: null,
      invoice_date: null,
      due_date: null,
      payment_terms: null,
      total: null,
      currency: null,
      confidence: 0.1,
      extraction_method: "regex",
      notes: ["No text extracted from PDF"],
    };
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-4o",
      text: {
        format: {
          type: "json_object",
        },
      },
      input: `Extract invoice data from this invoice text.

Return JSON only with keys:
supplier, invoice_number, invoice_date, due_date, payment_terms, total, currency, confidence, notes.

Rules:
- Extract only from the current invoice text provided below.
- Do not use examples, memory, previous invoices, or inferred values.
- supplier is the invoice sender/issuer.
- invoice_number is the value beside labels such as Invoice No, Invoice Number, Invoice #, Inv No, Bill No, Tax Invoice No.
- invoice_date is the value beside labels such as Invoice Date, Date, Tax Date.
- due_date is the value beside labels such as Due Date, Payment Due Date, Payment due date.
- total is the final amount payable including VAT/tax where present.
- currency must be a 3-letter ISO code.
- dates must be YYYY-MM-DD.
- unknown values must be null.
- notes must be an array.

File name: ${fileName || "unknown"}

Invoice text:
${cleaned.slice(0, 12000)}`,
    });

    return coerceParsed(safeJsonParse(response.output_text), "ai-text");
  } catch (err) {
    console.warn("AI text parse failed:", err);

    return {
      supplier: null,
      invoice_number: null,
      invoice_date: null,
      due_date: null,
      payment_terms: null,
      total: null,
      currency: null,
      confidence: 0.1,
      extraction_method: "regex",
      notes: ["AI text parse failed"],
    };
  }
}

export async function parseInvoiceFromPdf(
  buffer: Buffer,
  fileName?: string
): Promise<ParsedInvoice> {
  const emptyResult: ParsedInvoice = {
    supplier: null,
    invoice_number: null,
    invoice_date: null,
    due_date: null,
    payment_terms: null,
    total: null,
    currency: null,
    confidence: 0.1,
    extraction_method: "ai-pdf",
    notes: ["AI PDF parse failed"],
  };

  try {
    const uploadedFile = await openai.files.create({
      file: await toFile(buffer, fileName || "invoice.pdf", {
        type: "application/pdf",
      }),
      purpose: "user_data",
    });

    async function runPrompt(prompt: string): Promise<ParsedInvoice> {
      const response = await openai.responses.create({
        model: "gpt-4o",
        text: {
          format: {
            type: "json_object",
          },
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt,
              },
              {
                type: "input_file",
                file_id: uploadedFile.id,
              },
            ],
          },
        ],
      });

      console.log("AI PDF extraction raw response:", response.output_text);

      return coerceParsed(safeJsonParse(response.output_text), "ai-pdf");
    }

    const generalPrompt = `Extract invoice data from the uploaded invoice PDF.

Return JSON only with keys:
supplier, invoice_number, invoice_date, due_date, payment_terms, total, currency, confidence, notes.

Rules:
- Extract only from the uploaded PDF.
- Do not use examples, memory, previous invoices, or inferred values.
- Do not copy values from any prompt text.
- supplier is the invoice sender/issuer.
- invoice_number is the visible value beside labels such as Invoice No, Invoice Number, Invoice #, Inv No, Bill No, Tax Invoice No.
- invoice_date is the visible value beside labels such as Invoice Date, Date, Tax Date.
- due_date is the visible value beside labels such as Due Date, Payment Due Date, Payment due date.
- total is the final payable amount including VAT/tax where present.
- currency must be a 3-letter ISO code.
- dates must be YYYY-MM-DD.
- If a field is not visible, return null.
- notes must be an array.

File name: ${fileName || "unknown"}`;

    const headerPrompt = `Extract only the labelled invoice identifier and date fields from the uploaded PDF.

Return JSON only with keys:
supplier, invoice_number, invoice_date, due_date, payment_terms, total, currency, confidence, notes.

Rules:
- Extract only from the uploaded PDF.
- Do not use examples, memory, previous invoices, or inferred values.
- Do not guess.
- Do not copy dates or numbers from this prompt.
- Find the main invoice details/header area.
- invoice_number must be the visible value beside a label such as Invoice No, Invoice Number, Invoice #, Inv No, Bill No, Tax Invoice No.
- invoice_date must be the visible value beside a label such as Invoice Date, Date, Tax Date.
- due_date must be the visible value beside a label such as Due Date, Payment Due Date, Payment due date.
- Do not use footer references, issue numbers, VAT numbers, account numbers, bank details, sort codes, delivery numbers, order numbers, job numbers, PO numbers, or page numbers.
- Return dates as YYYY-MM-DD.
- Use null only if the field is not visible.
- Include supplier, total and currency if clearly visible, otherwise null.
- notes must be an array.

File name: ${fileName || "unknown"}`;

    const generalPass = await runPrompt(generalPrompt);

    if (
      generalPass.invoice_number &&
      generalPass.invoice_date &&
      generalPass.due_date
    ) {
      return generalPass;
    }

    const headerPass = await runPrompt(headerPrompt);

    return mergeHeaderOverGeneral(headerPass, generalPass);
  } catch (err) {
    console.warn("AI PDF parse failed:", err);
    return emptyResult;
  }
}