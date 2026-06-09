import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { createRequestClient } from "@/lib/supabase/request";
import { createAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500, code?: string) {
  return NextResponse.json(
    {
      error: message,
      ...(code ? { code } : {}),
    },
    { status }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { user, accessToken } = await requireAuthenticatedUser(req);

    if (!accessToken) {
      return jsonError("Unauthorized", 401, "unauthorized");
    }

    const supabase = createRequestClient(accessToken);
    const body = await req.json();

    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!token) {
      return jsonError(
        "Invitation token is required",
        400,
        "missing_token"
      );
    }

    const { data: invitation, error: inviteError } = await supabase
      .from("company_invitations")
      .select("id, company_id, email, role, accepted_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (inviteError) {
      console.error("Failed to load invitation:", inviteError);

      return jsonError(
        "Could not load invitation",
        500,
        "invite_lookup_failed"
      );
    }

    if (!invitation) {
      return jsonError(
        "Invitation not found. It may have been cancelled or replaced.",
        404,
        "invite_not_found"
      );
    }

    if (invitation.accepted_at) {
      return jsonError(
        "This invitation has already been accepted.",
        409,
        "invite_already_accepted"
      );
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return jsonError(
        "This invitation has expired. Please ask the workspace owner or admin to resend it.",
        410,
        "invite_expired"
      );
    }

    const invitedEmail = String(invitation.email).toLowerCase();
    const userEmail = user.email?.toLowerCase();

    if (!userEmail || userEmail !== invitedEmail) {
      return jsonError(
        "You must sign in with the email address this invitation was sent to.",
        403,
        "wrong_email"
      );
    }

    const { data: existingMembership, error: existingError } = await supabase
      .from("company_memberships")
      .select("id, is_active")
      .eq("company_id", invitation.company_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      console.error("Failed to check existing membership:", existingError);

      return jsonError(
        "Could not check membership",
        500,
        "membership_lookup_failed"
      );
    }

    if (existingMembership?.is_active) {
      return jsonError(
        "You are already a member of this company.",
        409,
        "already_member"
      );
    }

    if (existingMembership && !existingMembership.is_active) {
      const { error: reactivateError } = await supabase
        .from("company_memberships")
        .update({
          role: invitation.role,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingMembership.id);

      if (reactivateError) {
        console.error("Failed to reactivate membership:", reactivateError);

        return jsonError(
          "Could not accept invitation",
          500,
          "membership_reactivate_failed"
        );
      }
    } else {
      const { error: insertError } = await supabase
        .from("company_memberships")
        .insert({
          company_id: invitation.company_id,
          user_id: user.id,
          role: invitation.role,
          is_active: true,
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Failed to create membership:", insertError);

        return jsonError(
          "Could not accept invitation",
          500,
          "membership_create_failed"
        );
      }
    }

    const now = new Date().toISOString();

    const { error: updateInviteError } = await supabase
      .from("company_invitations")
      .update({
        accepted_at: now,
        updated_at: now,
      })
      .eq("id", invitation.id);

    if (updateInviteError) {
      console.error("Failed to mark invitation accepted:", updateInviteError);

      return jsonError(
        "Invitation accepted but could not update invite status",
        500,
        "invite_update_failed"
      );
    }

    await createAuditLog({
      supabase,
      companyId: invitation.company_id,
      userId: user.id,
      action: "team_invitation_accepted",
      entityType: "company_invitation",
      entityId: invitation.id,
      metadata: {
        email: invitedEmail,
        role: invitation.role,
      },
    });

    return NextResponse.json({
      success: true,
      companyId: invitation.company_id,
      role: invitation.role,
    });
  } catch (error: unknown) {
    console.error("Team accept route error:", error);

    return jsonError(
      error instanceof Error ? error.message : "Failed to accept invitation",
      500,
      "accept_invite_failed"
    );
  }
}