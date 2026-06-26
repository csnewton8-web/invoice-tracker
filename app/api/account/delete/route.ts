import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, user, role } = await requireCurrentCompany(req);

    if (role === "owner") {
      const { count: ownerCount, error: ownerCountError } = await supabase
        .from("company_memberships")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("role", "owner")
        .eq("is_active", true);

      if (ownerCountError) {
        console.error("Failed to count workspace owners:", ownerCountError);
        return jsonError("Could not check workspace ownership", 500);
      }

      if ((ownerCount || 0) <= 1) {
        return jsonError(
          "You are the only workspace owner. Transfer ownership or delete the workspace first.",
          409
        );
      }
    }

    const adminSupabase = createAdminClient();

    await adminSupabase
      .from("company_memberships")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    await adminSupabase.auth.admin.deleteUser(user.id);

    return NextResponse.json({
      ok: true,
      message: "User account deleted.",
    });
  } catch (error: any) {
    console.error("Delete account failed:", error);

    return jsonError(
      error?.message || "Failed to delete user account",
      error?.status || 500
    );
  }
}