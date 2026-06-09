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
        "You do not have permission to manage invitations",
        403
      );
    }

    const body = await req.json();

    const invitationId =
      typeof body.invitationId === "string"
        ? body.invitationId
        : "";

    if (!invitationId) {
      return jsonError("Invitation ID is required", 400);
    }

    const { data: invitation, error: fetchError } = await supabase
      .from("company_invitations")
      .select("id, email, role, accepted_at")
      .eq("id", invitationId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (fetchError || !invitation) {
      return jsonError("Invitation not found", 404);
    }

    if (invitation.accepted_at) {
      return jsonError(
        "Accepted invitations cannot be cancelled",
        400
      );
    }

    const { error: deleteError } = await supabase
      .from("company_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("company_id", companyId);

    if (deleteError) {
      console.error("Failed to cancel invitation:", deleteError);

      return jsonError(
        "Could not cancel invitation",
        500
      );
    }

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: "team_invitation_cancelled",
      entityType: "company_invitation",
      entityId: invitation.id,
      metadata: {
        email: invitation.email,
        role: invitation.role,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: unknown) {
    console.error("Cancel invitation route error:", error);

    return jsonError(
      "Failed to cancel invitation",
      500
    );
  }
}