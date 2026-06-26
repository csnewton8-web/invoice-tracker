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

    const body = await req.json().catch(() => ({}));
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "Deactivated by workspace owner";

    const { error } = await supabase
      .from("companies")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);

    if (error) {
      console.error("Failed to deactivate company:", error);
      return jsonError("Failed to deactivate company", 500);
    }

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
      message: "Company account deactivated.",
    });
  } catch (error: any) {
    return jsonError(
      error?.message || "Failed to deactivate company",
      error?.status || 500
    );
  }
}