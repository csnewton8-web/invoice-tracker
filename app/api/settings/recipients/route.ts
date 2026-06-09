import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { FREE_PLAN_MAX_INVOICES, isPaidPlan } from "@/lib/plans";
import { canManageReminders } from "@/lib/permissions";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

async function getInvoiceCount(supabase: any, companyId: string) {
  const { count, error } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (error) {
    console.error("Failed to count invoices for recipients:", error);
    throw new Error("Could not check invoice count");
  }

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

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data, error } = await supabase
      .from("notification_recipients")
      .select("id, email, name, is_active, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load notification recipients:", error);
      return jsonError("Failed to load recipients", 500);
    }

    return NextResponse.json({
      recipients: data || [],
    });
  } catch (error: unknown) {
    console.error("Recipients GET error:", error);
    return jsonError("Failed to load recipients", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (!canManageReminders(role)) {
      return jsonError("You do not have permission to manage recipients", 403);
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("plan, subscription_status")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      console.error("Failed to load company for recipients:", companyError);
      return jsonError("Company not found", 404);
    }

    const invoiceCount = await getInvoiceCount(supabase, companyId);

    const locked = recipientsAreLocked(
      company.plan,
      company.subscription_status,
      invoiceCount
    );

    if (locked) {
      return jsonError(
        `Alert recipients are included while your free workspace stays under ${FREE_PLAN_MAX_INVOICES} uploaded invoices. Upgrade to Starter to keep alerts active.`,
        403
      );
    }

    const body = await req.json();

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!email) {
      return jsonError("Email is required", 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return jsonError("Invalid email address", 400);
    }

    const { data: existing, error: existingError } = await supabase
      .from("notification_recipients")
      .select("id, is_active")
      .eq("company_id", companyId)
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      console.error("Failed to check existing recipient:", existingError);
      return jsonError("Could not check recipient", 500);
    }

    if (existing) {
      if (existing.is_active) {
        return jsonError("Recipient already exists", 409);
      }

      const { data, error } = await supabase
        .from("notification_recipients")
        .update({
          name: name || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, email, name, is_active, created_at")
        .single();

      if (error) {
        console.error("Failed to reactivate recipient:", error);
        return jsonError("Could not save recipient", 500);
      }

      return NextResponse.json({ recipient: data });
    }

    const { data, error } = await supabase
      .from("notification_recipients")
      .insert({
        company_id: companyId,
        email,
        name: name || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id, email, name, is_active, created_at")
      .single();

    if (error) {
      console.error("Failed to create recipient:", error);
      return jsonError("Could not save recipient", 500);
    }

    return NextResponse.json({ recipient: data });
  } catch (error: unknown) {
    console.error("Recipients POST error:", error);
    return jsonError("Failed to save recipient", 500);
  }
}