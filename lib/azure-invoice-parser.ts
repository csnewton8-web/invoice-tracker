import {
  AzureKeyCredential,
  DocumentAnalysisClient,
} from "@azure/ai-form-recognizer";
import type { ParsedInvoice } from "@/lib/invoice-parser";

function emptyAzureResult(notes: string[] = []): ParsedInvoice {
  return {
    supplier: null,
    invoice_number: null,
    po_number: null,
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
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;

  let currency: string | null = null;

  if (/£|\bGBP\b/i.test(content)) currency = "GBP";
  if (/€|\bEUR\b/i.test(content)) currency = "EUR";
  if (/\$|\bUSD\b/i.test(content)) currency = "USD";

  return {
    amount: Number.isNaN(amount) ? null : amount,
    currency,
  };
}

function cleanPoNumber(value: unknown): string | null {
  if (!value) return null;

  const cleaned = String(value)
    .replace(/[.,;:)]+$/, "")
    .trim();

  if (!cleaned) return null;
  if (cleaned.length > 50) return null;

  return cleaned;
}

function extractPoNumberFromText(text?: string | null): string | null {
  if (!text) return null;

  const labelledPatterns = [
    /\bP\.?\s*O\.?\s*(?:No\.?|Number|#)?\s*[:\-]?\s*((?:PO[-\s]?)?[A-Z0-9][A-Z0-9\-\/_.]{2,})\b/i,
    /\bPurchase\s+Order\s*(?:No\.?|Number|#)?\s*[:\-]?\s*((?:PO[-\s]?)?[A-Z0-9][A-Z0-9\-\/_.]{2,})\b/i,
    /\bCustomer\s+PO\s*(?:No\.?|Number|#)?\s*[:\-]?\s*((?:PO[-\s]?)?[A-Z0-9][A-Z0-9\-\/_.]{2,})\b/i,
    /\bYour\s+Ref(?:erence)?\s*[:\-]?\s*((?:PO[-\s]?)?[A-Z0-9][A-Z0-9\-\/_.]{2,})\b/i,
  ];

  for (const pattern of labelledPatterns) {
    const match = text.match(pattern);
    const value = cleanPoNumber(match?.[1]);

    if (value) return value;
  }

  const standalonePoMatches = text.match(
    /\bPO[-\s]?[A-Z0-9][A-Z0-9\-\/_.]{1,}\b/gi
  );

  if (standalonePoMatches?.length) {
    const cleaned = standalonePoMatches
      .map(cleanPoNumber)
      .filter((value): value is string => Boolean(value));

    if (cleaned.length) {
      return cleaned[0];
    }
  }

  return null;
}

function calculateDueDateFromTerms(
  invoiceDate: string | null,
  paymentTerms: string | null
): string | null {
  if (!invoiceDate || !paymentTerms) return null;

  const match =
    paymentTerms.match(/\bnet\s*(\d{1,3})\b/i) ||
    paymentTerms.match(/\bpayment\s+due\s+(\d{1,3})\s*days?\b/i) ||
    paymentTerms.match(
      /\b(\d{1,3})\s*days?\s*(?:from|after|following)?\s*(?:invoice|invoice date|date)?\b/i
    );

  if (!match?.[1]) return null;

  const days = Number(match[1]);

  if (!Number.isFinite(days) || days < 0 || days > 365) return null;

  const date = new Date(`${invoiceDate}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return null;

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
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

    const poField = getField(fields, [
      "PurchaseOrder",
      "PurchaseOrderNumber",
      "PurchaseOrderNo",
      "PONumber",
      "PO",
      "CustomerPO",
    ]);

    const poNumber =
      cleanPoNumber(
        getFieldText(fields, [
          "PurchaseOrder",
          "PurchaseOrderNumber",
          "PurchaseOrderNo",
          "PONumber",
          "PO",
          "CustomerPO",
        ])
      ) || extractPoNumberFromText(result.content || null);

    const invoiceDate = getFieldDate(fields, ["InvoiceDate"]);

    const paymentTerms = getFieldText(fields, [
      "PaymentTerm",
      "PaymentTerms",
      "Terms",
    ]);

    const explicitDueDate = getFieldDate(fields, [
      "DueDate",
      "PaymentDueDate",
    ]);

    const dueDate =
      explicitDueDate || calculateDueDateFromTerms(invoiceDate, paymentTerms);

    const currency =
      totalResult.currency ||
      getFieldText(fields, ["Currency", "CurrencyCode"])?.toUpperCase() ||
      null;

    const notes = [`Azure invoice extraction used for ${fileName || "invoice"}`];

    if (!explicitDueDate && dueDate && paymentTerms) {
      notes.push(`Due date calculated from payment terms: ${paymentTerms}`);
    }

    if (poNumber && !poField) {
      notes.push("PO number extracted from invoice text pattern matching");
    }

    return {
      supplier,
      invoice_number: invoiceNumber,
      po_number: poNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      payment_terms: paymentTerms,
      total: totalResult.amount,
      currency,
      confidence: averageConfidence([
        getField(fields, ["VendorName", "SupplierName", "MerchantName"]),
        getField(fields, ["InvoiceId", "InvoiceNumber", "InvoiceNo"]),
        poField,
        getField(fields, ["InvoiceDate"]),
        getField(fields, ["DueDate", "PaymentDueDate"]),
        totalField,
      ]),
      extraction_method: "azure-invoice",
      notes,
    };
  } catch (error: any) {
    console.warn("Azure invoice parse failed:", error);

    return emptyAzureResult([
      error?.message || "Azure invoice extraction failed",
    ]);
  }
}