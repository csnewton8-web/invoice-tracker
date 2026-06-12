import type { SupabaseClient } from "@supabase/supabase-js";

type InvoiceInput = {
  companyId: string;
  supplier?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  total?: number | null;
  currency?: string | null;
  fingerprint?: string | null;
};

export type DuplicateResult = {
  duplicate_of_invoice_id: string | null;
  duplicate_confidence: number | null;
  duplicate_status: "none" | "possible";
};

function normaliseText(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || null;
}

function normaliseInvoiceNumber(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") || null;
}

function daysBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return null;

  const dateA = new Date(a);
  const dateB = new Date(b);

  if (Number.isNaN(dateA.getTime()) || Number.isNaN(dateB.getTime())) {
    return null;
  }

  return Math.abs(
    Math.round((dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24))
  );
}

function emptyDuplicateResult(): DuplicateResult {
  return {
    duplicate_of_invoice_id: null,
    duplicate_confidence: null,
    duplicate_status: "none",
  };
}

export async function detectDuplicateInvoice(
  supabase: SupabaseClient,
  invoice: InvoiceInput
): Promise<DuplicateResult> {
  const supplier = normaliseText(invoice.supplier);
  const invoiceNumber = normaliseInvoiceNumber(invoice.invoice_number);

  if (!invoice.companyId) {
    return emptyDuplicateResult();
  }

  try {
    // 1. Exact PDF fingerprint match
    if (invoice.fingerprint) {
      const { data, error } = await supabase
        .from("invoices")
        .select("id")
        .eq("company_id", invoice.companyId)
        .eq("fingerprint", invoice.fingerprint)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Duplicate fingerprint check failed:", error);
      }

      if (!error && data?.id) {
        return {
          duplicate_of_invoice_id: data.id,
          duplicate_confidence: 100,
          duplicate_status: "possible",
        };
      }
    }

    // 2. Same supplier + same invoice number
    if (supplier && invoiceNumber) {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, supplier, invoice_number")
        .eq("company_id", invoice.companyId)
        .not("supplier", "is", null)
        .not("invoice_number", "is", null)
        .limit(100);

      if (error) {
        console.error("Duplicate invoice number check failed:", error);
      }

      const match = !error
        ? data?.find((existing) => {
            return (
              normaliseText(existing.supplier) === supplier &&
              normaliseInvoiceNumber(existing.invoice_number) === invoiceNumber
            );
          })
        : null;

      if (match?.id) {
        return {
          duplicate_of_invoice_id: match.id,
          duplicate_confidence: 100,
          duplicate_status: "possible",
        };
      }
    }

    // 3. Softer match: same supplier + same total + invoice date within 7 days
    if (supplier && invoice.total != null) {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, supplier, total, invoice_date, currency")
        .eq("company_id", invoice.companyId)
        .eq("total", invoice.total)
        .limit(100);

      if (error) {
        console.error("Duplicate soft check failed:", error);
      }

      const match = !error
        ? data?.find((existing) => {
            const sameSupplier = normaliseText(existing.supplier) === supplier;
            const sameCurrency =
              !invoice.currency ||
              !existing.currency ||
              invoice.currency === existing.currency;

            const dateDiff = daysBetween(
              invoice.invoice_date,
              existing.invoice_date
            );

            return (
              sameSupplier &&
              sameCurrency &&
              dateDiff != null &&
              dateDiff <= 7
            );
          })
        : null;

      if (match?.id) {
        return {
          duplicate_of_invoice_id: match.id,
          duplicate_confidence: 85,
          duplicate_status: "possible",
        };
      }
    }

    return emptyDuplicateResult();
  } catch (error) {
    console.error("Duplicate detection crashed:", error);
    return emptyDuplicateResult();
  }
}