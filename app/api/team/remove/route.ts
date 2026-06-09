import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { canManageTeam } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role, user } =
      await requireCurrentCompany(req);

    if (!canManageTeam(role)) {
      return jsonError(
        "You do not have permission to remove team members",
        403
      );
    }

    const body = await req.json();

    const membershipId =
      typeof body.membershipId === "string"
        ? body.membershipId
        : "";

    if (!membershipId) {
      return jsonError("Membership ID is required", 400);
    }

    const { data: membership, error: fetchError } = await supabase
      .from("company_memberships")
      .select("id, user_id, role, company_id, is_active")
      .eq("id", membershipId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (fetchError || !membership) {
      return jsonError("Team member not found", 404);
    }

    if (!membership.is_active) {
      return jsonError("Team member is already inactive", 400);
    }

    if (membership.role === "owner") {
      return jsonError(
        "Owner cannot be removed. Transfer ownership first.",
        403
      );
    }

    if (membership.user_id === user.id) {
      return jsonError("You cannot remove yourself", 400);
    }

    if (role !== "owner" && membership.role === "admin") {
      return jsonError(
        "Only the owner can remove another admin",
        403
      );
    }

    const { error: updateError } = await supabase
      .from("company_memberships")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", membershipId)
      .eq("company_id", companyId);

    if (updateError) {
      console.error("Failed to remove team member:", updateError);

      return jsonError("Could not remove team member", 500);
    }

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: "team_member_removed",
      entityType: "company_membership",
      entityId: membership.id,
      metadata: {
        removed_user_id: membership.user_id,
        removed_role: membership.role,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: unknown) {
    console.error("Team remove route error:", error);

    return jsonError("Failed to remove team member", 500);
  }
}