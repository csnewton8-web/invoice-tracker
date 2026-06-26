import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, onboarding_completed")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json(
        { error: companyError?.message || "Company not found" },
        { status: 500 }
      );
    }

    const { count: invoiceCount, error: invoiceError } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    if (invoiceError) {
      return NextResponse.json(
        { error: invoiceError.message || "Failed to count invoices" },
        { status: 500 }
      );
    }

    const hasInvoices = (invoiceCount || 0) > 0;

    if (hasInvoices && !company.onboarding_completed) {
      await supabase
        .from("companies")
        .update({ onboarding_completed: true })
        .eq("id", companyId);
    }

    if (!company.onboarding_completed && !hasInvoices) {
      return NextResponse.json({ destination: "/onboarding" });
    }

    return NextResponse.json({ destination: "/invoices" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to decide login destination" },
      { status: 500 }
    );
  }
}