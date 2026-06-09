import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { FREE_PLAN_MAX_INVOICES, isPaidPlan } from "@/lib/plans";

type Context = {
  params: Promise<{
    recipientId: string;
  }>;
};

async function getInvoiceCount(supabase: any, companyId: string) {
  const { count, error } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (error) throw error;
  return count || 0;
}

function recipientsAreLocked(
  plan: string | null | undefined,
  subscriptionStatus: string | null | undefined,
  invoiceCount: number
) {
  if (isPaidPlan(plan, subscriptionStatus)) {
    return false;
  }

  return invoiceCount >= FREE_PLAN_MAX_INVOICES;
}

export async function PATCH(req: NextRequest, context: Context) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("plan, subscription_status")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      throw new Error(companyError?.message || "Company not found");
    }

    const invoiceCount = await getInvoiceCount(supabase, companyId);
    const locked = recipientsAreLocked(
      company.plan,
      company.subscription_status,
      invoiceCount
    );

    if (locked) {
      return NextResponse.json(
        {
          error: `Alert recipients are included while your free workspace stays under ${FREE_PLAN_MAX_INVOICES} uploaded invoices. Upgrade to Starter to keep alerts active.`,
        },
        { status: 403 }
      );
    }

    const { recipientId } = await context.params;
    const body = await req.json();
    const isActive = Boolean(body.is_active);

    const { data, error } = await supabase
      .from("notification_recipients")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipientId)
      .eq("company_id", companyId)
      .select("id, email, name, is_active, created_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ recipient: data });
  } catch (e: any) {
    console.error("PATCH recipient error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("plan, subscription_status")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      throw new Error(companyError?.message || "Company not found");
    }

    const invoiceCount = await getInvoiceCount(supabase, companyId);
    const locked = recipientsAreLocked(
      company.plan,
      company.subscription_status,
      invoiceCount
    );

    if (locked) {
      return NextResponse.json(
        {
          error: `Alert recipients are included while your free workspace stays under ${FREE_PLAN_MAX_INVOICES} uploaded invoices. Upgrade to Starter to keep alerts active.`,
        },
        { status: 403 }
      );
    }

    const { recipientId } = await context.params;

    const { error } = await supabase
      .from("notification_recipients")
      .delete()
      .eq("id", recipientId)
      .eq("company_id", companyId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("DELETE recipient error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}