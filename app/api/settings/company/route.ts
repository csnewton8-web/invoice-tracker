import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { canManageCompanySettings } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data, error } = await supabase
      .from("companies")
      .select("id, name, billing_email, invoice_upload_count")
      .eq("id", companyId)
      .single();

    if (error || !data) {
      console.error("Failed to load company settings:", error);
      return jsonError("Company not found", 404);
    }

    return NextResponse.json({ company: data });
  } catch (error: unknown) {
    console.error("Company settings GET error:", error);
    return jsonError("Failed to load company settings", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (!canManageCompanySettings(role)) {
      return jsonError("You do not have permission to manage company settings", 403);
    }

    const body = await req.json();

    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";

    const billingEmail =
      typeof body.billing_email === "string"
        ? body.billing_email.trim().toLowerCase()
        : "";

    if (!name) {
      return jsonError("Company name is required", 400);
    }

    if (billingEmail && !isValidEmail(billingEmail)) {
      return jsonError("Billing email is invalid", 400);
    }

    const { data, error } = await supabase
      .from("companies")
      .update({
        name,
        billing_email: billingEmail || null,
      })
      .eq("id", companyId)
      .select("id, name, billing_email, invoice_upload_count")
      .single();

    if (error || !data) {
      console.error("Failed to save company settings:", error);
      return jsonError("Failed to save settings", 500);
    }

    return NextResponse.json({ company: data });
  } catch (error: unknown) {
    console.error("Company settings PATCH error:", error);
    return jsonError("Failed to save company settings", 500);
  }
}