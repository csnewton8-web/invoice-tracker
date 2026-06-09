import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { canManageBilling } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (!canManageBilling(role)) {
      return jsonError("You do not have permission to view billing", 403);
    }

    const { data, error } = await supabase
      .from("companies")
      .select(
        "id, name, billing_email, plan, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_status, current_period_end"
      )
      .eq("id", companyId)
      .single();

    if (error || !data) {
      console.error("Failed to load billing status:", error);
      return jsonError("Failed to load billing status", 500);
    }

    const { count, error: countError } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId);

    if (countError) {
      console.error("Failed to count invoices for billing status:", countError);
      return jsonError("Failed to load billing usage", 500);
    }

    return NextResponse.json({
      company: {
        ...data,
        invoice_count: count || 0,
      },
    });
  } catch (error: unknown) {
    console.error("Billing status GET error:", error);
    return jsonError("Failed to load billing status", 500);
  }
}