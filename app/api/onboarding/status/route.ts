import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { isPaidPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(
        "id, plan, subscription_status, invoice_upload_count, onboarding_completed"
      )
      .eq("id", companyId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json(
        { error: companyError?.message || "Company not found" },
        { status: 500 }
      );
    }

    const { count: invoiceCount } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId);

    const { count: recipientCount } = await supabase
      .from("notification_recipients")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_active", true);

    const { data: notificationSettings } = await supabase
      .from("notification_settings")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();

    const paid = isPaidPlan(company.plan, company.subscription_status);

    const uploaded_first_invoice = (invoiceCount || 0) > 0;
    const added_alert_recipient = (recipientCount || 0) > 0;
    const configured_reminder_schedule = Boolean(notificationSettings?.id);
    const reviewed_billing = paid;

    const allStepsComplete =
      uploaded_first_invoice &&
      added_alert_recipient &&
      configured_reminder_schedule &&
      reviewed_billing;

    if (allStepsComplete && !company.onboarding_completed) {
      await supabase
        .from("companies")
        .update({ onboarding_completed: true })
        .eq("id", companyId);
    }

    return NextResponse.json({
      show_onboarding:
        !company.onboarding_completed && (invoiceCount || 0) < 3,

      onboarding_completed:
        company.onboarding_completed || allStepsComplete || false,

      onboarding: {
        uploaded_first_invoice,
        added_alert_recipient,
        configured_reminder_schedule,
        reviewed_billing,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load onboarding status" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data, error } = await supabase
      .from("companies")
      .update({ onboarding_completed: true })
      .eq("id", companyId)
      .select("id, onboarding_completed")
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to finish onboarding" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      onboarding_completed: data?.onboarding_completed ?? true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to finish onboarding" },
      { status: 500 }
    );
  }
}