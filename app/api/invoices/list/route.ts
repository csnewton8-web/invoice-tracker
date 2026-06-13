import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { handleRouteError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVOICE_LIST_COLUMNS = [
  "id",
  "user_id",
  "company_id",
  "file_name",
  "supplier",
  "invoice_number",
  "po_number",
  "invoice_date",
  "due_date",
  "payment_terms",
  "total",
  "currency",
  "notes",
  "is_paid",
  "review_status",
  "reviewed_at",
  "reviewed_by",
  "duplicate_of_invoice_id",
  "duplicate_confidence",
  "duplicate_status",
  "created_at",
  "updated_at",
].join(", ");

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data: invoices, error } = await supabase
      .from("invoices")
      .select(INVOICE_LIST_COLUMNS)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(
        "id, name, plan, subscription_status, current_period_end, billing_email"
      )
      .eq("id", companyId)
      .single();

    if (companyError) {
      throw companyError;
    }

    return NextResponse.json({
      invoices: invoices || [],
      company,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to load invoices");
  }
}