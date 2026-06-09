import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { canManageTeam, type CompanyRole } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES: CompanyRole[] = ["admin", "member", "viewer"];

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function isAllowedRole(value: string): value is CompanyRole {
  return ALLOWED_ROLES.includes(value as CompanyRole);
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role, user } = await requireCurrentCompany(req);

    if (!canManageTeam(role)) {
      return jsonError("You do not have permission to change team roles", 403);
    }

    const body = await req.json();

    const membershipId =
      typeof body.membershipId === "string" ? body.membershipId : "";

    const newRole =
      typeof body.role === "string" ? body.role.trim().toLowerCase() : "";

    if (!membershipId) {
      return jsonError("Membership ID is required", 400);
    }

    if (!isAllowedRole(newRole)) {
      return jsonError("Invalid role", 400);
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
      return jsonError("Cannot update an inactive team member", 400);
    }

    if (membership.role === "owner") {
      return jsonError("Owner role cannot be changed here", 403);
    }

    if (membership.user_id === user.id) {
      return jsonError("You cannot change your own role", 400);
    }

    if (role !== "owner" && membership.role === "admin") {
      return jsonError("Only the owner can change another admin's role", 403);
    }

    if (role !== "owner" && newRole === "admin") {
      return jsonError("Only the owner can promote users to admin", 403);
    }

    const { data, error: updateError } = await supabase
      .from("company_memberships")
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", membershipId)
      .eq("company_id", companyId)
      .select("id, user_id, role, is_active, created_at")
      .single();

    if (updateError || !data) {
      console.error("Failed to change team member role:", updateError);
      return jsonError("Could not change team member role", 500);
    }

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: "team_member_role_changed",
      entityType: "company_membership",
      entityId: membership.id,
      metadata: {
        target_user_id: membership.user_id,
        previous_role: membership.role,
        new_role: newRole,
      },
    });

    return NextResponse.json({
      success: true,
      membership: data,
    });
  } catch (error: unknown) {
    console.error("Team change-role route error:", error);
    return jsonError("Failed to change team role", 500);
  }
}