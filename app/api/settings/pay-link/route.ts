import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { canManageCompanySettings } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function isValidPayLinkUrl(value: string) {
  if (!value) return true;

  try {
    const url = new URL(value);

    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data, error } = await supabase
      .from("user_app_settings")
      .select("user_id, company_id, pay_link_url, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load pay link:", error);
      return jsonError("Failed to load payment link", 500);
    }

    return NextResponse.json({
      pay_link_url: data?.[0]?.pay_link_url || "",
    });
  } catch (error: unknown) {
    console.error("Pay link GET error:", error);
    return jsonError("Load failed", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, user, role } = await requireCurrentCompany(req);

    if (!canManageCompanySettings(role)) {
      return jsonError("You do not have permission to manage payment settings", 403);
    }

    const body = await req.json();

    const payLinkUrl =
      typeof body.payLinkUrl === "string" ? body.payLinkUrl.trim() : "";

    if (!isValidPayLinkUrl(payLinkUrl)) {
      return jsonError("Payment link must be a valid HTTPS URL", 400);
    }

    const { data: existingRows, error: fetchError } = await supabase
      .from("user_app_settings")
      .select("user_id, company_id, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("Failed to check existing pay link settings:", fetchError);
      return jsonError("Could not load payment settings", 500);
    }

    if (!existingRows || existingRows.length === 0) {
      const { error: insertError } = await supabase
        .from("user_app_settings")
        .insert({
          user_id: user.id,
          company_id: companyId,
          pay_link_url: payLinkUrl,
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Failed to create pay link setting:", insertError);
        return jsonError("Could not save payment settings", 500);
      }

      return NextResponse.json({ success: true });
    }

    const { error: updateError } = await supabase
      .from("user_app_settings")
      .update({
        pay_link_url: payLinkUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    if (updateError) {
      console.error("Failed to update pay link setting:", updateError);
      return jsonError("Could not save payment settings", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Pay link POST error:", error);
    return jsonError("Save failed", 500);
  }
}