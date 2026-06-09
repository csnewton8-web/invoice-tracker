import {
  AzureKeyCredential,
  DocumentAnalysisClient,
} from "@azure/ai-form-recognizer";
import type { ParsedInvoice } from "@/lib/invoice-parser";

function emptyAzureResult(notes: string[] = []): ParsedInvoice {
  return {
    supplier: null,
    invoice_number: null,
    invoice_date: null,
    due_date: null,
    payment_terms: null,
    total: null,
    currency: null,
    confidence: 0.1,
    extraction_method: "azure-invoice",
    notes,
  };
}

function normaliseDate(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const cleaned = String(value).trim();

  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const uk = cleaned.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (uk) {
    const [, dd, mm, year] = uk;
    const yyyy = year.length === 2 ? `20${year}` : year;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  return null;
}

function getField(fields: Record<string, any> | undefined, names: string[]) {
  if (!fields) return null;

  for (const name of names) {
    const field = fields[name];

    if (field !== undefined && field !== null) {
      return field;
    }
  }

  return null;
}

function getFieldText(fields: Record<string, any> | undefined, names: string[]) {
  const field = getField(fields, names);

  if (!field) return null;

  if (typeof field.value === "string") return field.value.trim();
  if (typeof field.content === "string") return field.content.trim();

  if (field.value !== undefined && field.value !== null) {
    return String(field.value).trim();
  }

  return null;
}

function getFieldDate(fields: Record<string, any> | undefined, names: string[]) {
  const field = getField(fields, names);

  if (!field) return null;

  return normaliseDate(field.value ?? field.content);
}

function getCurrencyAmount(
  fields: Record<string, any> | undefined,
  names: string[]
) {
  const field = getField(fields, names);

  if (!field) {
    return {
      amount: null,
      currency: null,
    };
  }

  const value = field.value;

  if (typeof value === "number") {
    return {
      amount: value,
      currency: null,
    };
  }

  if (value && typeof value === "object") {
    return {
      amount:
        typeof value.amount === "number"
          ? value.amount
          : typeof value.value === "number"
            ? value.value
            : null,
      currency:
        typeof value.currencyCode === "string"
          ? value.currencyCode.toUpperCase()
          : typeof value.currency === "string"
            ? value.currency.toUpperCase()
            : null,
    };
  }

  const content = field.content ? String(field.content) : "";
  const amountMatch = content.match(/([0-9,]+(?:\.[0-9]{1,2})?)/);
  const amount = amountMatch
    ? Number(amountMatch[1].replace(/,/g, ""))
    : null;

  let currency: string | null = null;

  if (/£|\bGBP\b/i.test(content)) currency = "GBP";
  if (/€|\bEUR\b/i.test(content)) currency = "EUR";
  if (/\$|\bUSD\b/i.test(content)) currency = "USD";

  return {
    amount: Number.isNaN(amount) ? null : amount,
    currency,
  };
}

function averageConfidence(fields: Array<any | null>) {
  const scores = fields
    .map((field) => field?.confidence)
    .filter((value): value is number => typeof value === "number");

  if (!scores.length) return 0.8;

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export async function parseInvoiceWithAzure(
  buffer: Buffer,
  fileName?: string
): Promise<ParsedInvoice> {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !key) {
    return emptyAzureResult(["Azure Document Intelligence is not configured"]);
  }

  try {
    const client = new DocumentAnalysisClient(
      endpoint,
      new AzureKeyCredential(key)
    );

    const poller = await client.beginAnalyzeDocument(
      "prebuilt-invoice",
      buffer
    );

    const result = await poller.pollUntilDone();
    const document = result.documents?.[0];
    const fields = document?.fields as Record<string, any> | undefined;

    if (!fields) {
      return emptyAzureResult(["Azure returned no invoice fields"]);
    }

    const totalField = getField(fields, [
      "InvoiceTotal",
      "AmountDue",
      "SubTotal",
    ]);

    const totalResult = getCurrencyAmount(fields, [
      "InvoiceTotal",
      "AmountDue",
      "SubTotal",
    ]);

    const supplier = getFieldText(fields, [
      "VendorName",
      "SupplierName",
      "MerchantName",
    ]);

    const invoiceNumber = getFieldText(fields, [
      "InvoiceId",
      "InvoiceNumber",
      "InvoiceNo",
    ]);

    const invoiceDate = getFieldDate(fields, ["InvoiceDate"]);
    const dueDate = getFieldDate(fields, ["DueDate", "PaymentDueDate"]);

    const currency =
      totalResult.currency ||
      getFieldText(fields, ["Currency", "CurrencyCode"])?.toUpperCase() ||
      null;

    return {
      supplier,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      payment_terms: getFieldText(fields, ["PaymentTerm", "PaymentTerms"]),
      total: totalResult.amount,
      currency,
      confidence: averageConfidence([
        getField(fields, ["VendorName", "SupplierName", "MerchantName"]),
        getField(fields, ["InvoiceId", "InvoiceNumber", "InvoiceNo"]),
        getField(fields, ["InvoiceDate"]),
        getField(fields, ["DueDate", "PaymentDueDate"]),
        totalField,
      ]),
      extraction_method: "azure-invoice",
      notes: [`Azure invoice extraction used for ${fileName || "invoice"}`],
    };
  } catch (error: any) {
    console.warn("Azure invoice parse failed:", error);

    return emptyAzureResult([
      error?.message || "Azure invoice extraction failed",
    ]);
  }
}