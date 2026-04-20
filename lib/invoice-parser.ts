import { openai } from "@/lib/openai";

export type ParsedInvoice = {
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  total: number | null;
  currency: string | null;
  confidence: number | null;
  extraction_method: "ai-pdf" | "ai-text" | "regex";
  notes: string[];
};

function normaliseDate(value: string | null): string | null {
  if (!value) return null;

  const cleaned = value.trim();

  let match = cleaned.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (match) {
    const [, dd, mm, yy] = match;
    const fullYear = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
    return `${fullYear}-${mm}-${dd}`;
  }

  match = cleaned.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
  }

  match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return cleaned;
  }

  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString().slice(0, 10);
}

function parseAmount(value: unknown): number | null {
  if (value == null) return null;

  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;

  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function detectCurrency(text: string): string | null {
  if (/\(GBP\)|\bGBP\b|£/i.test(text)) return "GBP";
  if (/\(EUR\)|\bEUR\b|€/i.test(text)) return "EUR";
  if (/\(USD\)|\bUSD\b|\$/i.test(text)) return "USD";
  return null;
}

function extractTopSupplier(lines: string[]): string | null {
  const top = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);

  const blacklist = [
    "invoice",
    "page",
    "date",
    "invoice no",
    "customer no",
    "file number",
  ];

  for (const line of top) {
    const lower = line.toLowerCase();
    if (blacklist.some((x) => lower.includes(x))) continue;
    if (line.length < 3) continue;

    if (
      /ltd|limited|gmbh|inc|llc|plc|uk|united kingdom|ceramics|engineering|transport/i.test(
        line
      ) ||
      /^[A-Z0-9&.,'()\- ]+$/.test(line)
    ) {
      return line.replace(/\s{2,}/g, " ").trim();
    }
  }

  return top[0] || null;
}

function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    /invoice\s*no\.?\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
    /invoice\s*number\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
    /invoice\s*#\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function extractInvoiceDate(text: string): string | null {
  const patterns = [
    /(?:^|\n)\s*date\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/i,
    /invoice\s*date\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = normaliseDate(match?.[1] || null);
    if (parsed) return parsed;
  }

  return null;
}

function extractDueDate(text: string): string | null {
  const patterns = [
    /due\s*date\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/i,
    /payment\s*due\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = normaliseDate(match?.[1] || null);
    if (parsed) return parsed;
  }

  return null;
}

function extractPaymentTerms(text: string): string | null {
  const match = text.match(/terms\s*[:\-]?\s*([A-Z0-9 \-]+)/i);
  return match?.[1]?.trim() || null;
}

function extractTotal(text: string): number | null {
  const explicitPatterns = [
    /total\s*(?:due)?\s*[:\-]?\s*(?:\(?[A-Z]{3}\)?)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /amount\s*due\s*[:\-]?\s*(?:\(?[A-Z]{3}\)?)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    const amount = parseAmount(match?.[1]);
    if (amount != null) return amount;
  }

  const lineMatches = Array.from(
    text.matchAll(/\(\s*(GBP|EUR|USD)\s*\)\s*([0-9]+(?:\.[0-9]{1,2})?)/gi)
  );

  if (lineMatches.length) {
    const sum = lineMatches.reduce((acc, match) => {
      return acc + (parseAmount(match[2]) || 0);
    }, 0);

    if (sum > 0) return Number(sum.toFixed(2));
  }

  const amounts = Array.from(
    text.matchAll(/\b([0-9]{1,6}(?:\.[0-9]{1,2})?)\b/g)
  )
    .map((m) => parseAmount(m[1]))
    .filter((x): x is number => x != null);

  if (!amounts.length) return null;
  return Math.max(...amounts);
}

function regexFallback(text: string): ParsedInvoice {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return {
    supplier: extractTopSupplier(lines),
    invoice_number: extractInvoiceNumber(text),
    invoice_date: extractInvoiceDate(text),
    due_date: extractDueDate(text),
    payment_terms: extractPaymentTerms(text),
    total: extractTotal(text),
    currency: detectCurrency(text),
    confidence: 0.65,
    extraction_method: "regex",
    notes: ["Regex fallback used"],
  };
}

function coerceParsed(data: any, method: ParsedInvoice["extraction_method"]): ParsedInvoice {
  return {
    supplier: data?.supplier ?? null,
    invoice_number: data?.invoice_number ?? null,
    invoice_date: normaliseDate(data?.invoice_date ?? null),
    due_date: normaliseDate(data?.due_date ?? null),
    payment_terms: data?.payment_terms ?? null,
    total: parseAmount(data?.total),
    currency: data?.currency ?? null,
    confidence: typeof data?.confidence === "number" ? data.confidence : 0.8,
    extraction_method: method,
    notes: Array.isArray(data?.notes) ? data.notes : [],
  };
}

function extractJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON found in model response");
  }
  return JSON.parse(match[0]);
}

export async function parseInvoice(text: string, fileName?: string): Promise<ParsedInvoice> {
  if (!text || !text.trim()) {
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
      model: "gpt-4o-mini",
      input: `Extract invoice data from this text and return ONLY valid JSON with keys:
supplier, invoice_number, invoice_date, due_date, payment_terms, total, currency, confidence, notes.

Rules:
- supplier = invoice issuer/sender
- dates must be YYYY-MM-DD if known
- total must be a number
- currency should be GBP/EUR/USD if possible
- notes must be an array
- unknown values should be null

File name: ${fileName || "unknown"}

Invoice text:
${text.slice(0, 12000)}`,
    });

    return coerceParsed(extractJsonObject(response.output_text), "ai-text");
  } catch (err) {
    console.warn("AI text parse failed, using regex fallback:", err);
    return regexFallback(text);
  }
}

export async function parseInvoiceFromPdf(
  buffer: Buffer,
  fileName?: string
): Promise<ParsedInvoice> {
  try {
    const base64 = buffer.toString("base64");

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Extract invoice data from this PDF and return ONLY valid JSON with keys:
supplier, invoice_number, invoice_date, due_date, payment_terms, total, currency, confidence, notes.

Rules:
- supplier = invoice issuer/sender, not the customer
- invoice_date and due_date must be YYYY-MM-DD if known
- total must be a number, not a string
- currency should be GBP, EUR, or USD if possible
- if unknown, use null
- confidence should be between 0 and 1
- notes must be an array of short strings

File name: ${fileName || "unknown"}`,
            },
            {
              type: "input_file",
              filename: fileName || "invoice.pdf",
              file_data: `data:application/pdf;base64,${base64}`,
            },
          ],
        },
      ],
    });

    return coerceParsed(extractJsonObject(response.output_text), "ai-pdf");
  } catch (err) {
    console.warn("AI PDF parse failed:", err);
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
      notes: ["AI PDF parse failed"],
    };
  }
}