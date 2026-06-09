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
      return jsonError("You do not have permission to cancel invitations", 403);
    }

    const body = await req.json();

    const invitationId =
      typeof body.invitationId === "string" ? body.invitationId : "";

    if (!invitationId) {
      return jsonError("Invitation ID is required", 400);
    }

    const { data: invitation, error: fetchError } = await supabase
      .from("company_invitations")
      .select("id, email, role, company_id, accepted_at")
      .eq("id", invitationId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (fetchError) {
      console.error("Failed to fetch invitation:", fetchError);
      return jsonError(fetchError.message, 500);
    }

    if (!invitation) {
      return jsonError("Invitation not found", 404);
    }

    if (invitation.accepted_at) {
      return jsonError("Cannot cancel an accepted invitation", 400);
    }

    const { error: deleteError } = await supabase
      .from("company_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("company_id", companyId);

    if (deleteError) {
      console.error("Failed to cancel invitation:", deleteError);
      return jsonError(deleteError.message, 500);
    }

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: "team_invite_cancelled",
      entityType: "company_invitation",
      entityId: invitation.id,
      metadata: {
        invited_email: invitation.email,
        invited_role: invitation.role,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: unknown) {
    console.error("Cancel invite route error:", error);

    return jsonError(
      error instanceof Error ? error.message : "Failed to cancel invitation",
      500
    );
  }
}