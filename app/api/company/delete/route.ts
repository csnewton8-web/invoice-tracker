import { NextRequest, NextResponse } from "next/server";
import {
  requireCurrentCompany,
  requireCompanyRole,
} from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    requireCompanyRole(role, ["owner"]);

    const { error } = await supabase
      .from("companies")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: "Deleted by workspace owner",
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);

    if (error) {
      console.error("Failed to delete company:", error);
      return jsonError("Failed to delete company", 500);
    }

    await supabase
      .from("company_memberships")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    await supabase
      .from("notification_recipients")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    await supabase
      .from("forwarding_senders")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    return NextResponse.json({
      ok: true,
      message: "Company account deleted.",
    });
  } catch (error: any) {
    return jsonError(
      error?.message || "Failed to delete company",
      error?.status || 500
    );
  }
}