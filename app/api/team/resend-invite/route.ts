import { NextRequest, NextResponse } from "next/server";

import { requireCurrentCompany } from "@/lib/current-company";
import { canManageTeam } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildInviteEmailHtml({
  companyName,
  inviterName,
  role,
  inviteUrl,
}: {
  companyName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}) {
  const safeCompanyName = escapeHtml(companyName);
  const safeInviterName = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);

  return `
    <div style="margin:0;padding:0;background:#020817;font-family:Arial,sans-serif;color:#ffffff;">
      <div style="max-width:620px;margin:0 auto;padding:32px 20px;">
        <div style="border:1px solid #1e293b;background:#0f172a;border-radius:28px;padding:32px;">
          <div style="display:inline-block;border:1px solid rgba(59,130,246,.3);background:rgba(59,130,246,.12);color:#bfdbfe;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">
            FlashFox
          </div>

          <h1 style="margin:24px 0 0;font-size:28px;line-height:1.2;color:#ffffff;">
            You’ve been invited to join ${safeCompanyName}
          </h1>

          <p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#cbd5e1;">
            ${safeInviterName} invited you to join <strong style="color:#ffffff;">${safeCompanyName}</strong>
            as a <strong style="color:#ffffff;">${safeRole}</strong>.
          </p>

          <p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#cbd5e1;">
            Accept the invitation to access the workspace and start using FlashFox.
          </p>

          <div style="margin:28px 0;">
            <a href="${inviteUrl}" style="display:inline-block;background:#ffffff;color:#020817;text-decoration:none;border-radius:16px;padding:14px 22px;font-size:14px;font-weight:700;">
              Accept invitation
            </a>
          </div>

          <div style="border-top:1px solid #1e293b;margin-top:28px;padding-top:20px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
              This invitation expires in 7 days. If you were not expecting this invitation, you can safely ignore this email.
            </p>

            <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b;word-break:break-all;">
              If the button does not work, copy and paste this link into your browser:<br />
              ${inviteUrl}
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function sendInviteEmail({
  to,
  from,
  subject,
  html,
  text,
}: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to resend invite email:", errorText);
    throw new Error("Invitation could not be resent");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role, user } =
      await requireCurrentCompany(req);

    if (!canManageTeam(role)) {
      return jsonError(
        "You do not have permission to manage team invitations",
        403
      );
    }

    const body = await req.json();

    const invitationId =
      typeof body.invitationId === "string" ? body.invitationId : "";

    if (!invitationId) {
      return jsonError("Invitation ID is required", 400);
    }

    const { data: invitation, error } = await supabase
      .from("company_invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("company_id", companyId)
      .single();

    if (error || !invitation) {
      return jsonError("Invitation not found", 404);
    }

    if (invitation.accepted_at) {
      return jsonError("Invitation has already been accepted", 400);
    }

    if (
      invitation.expires_at &&
      new Date(invitation.expires_at) < new Date()
    ) {
      return jsonError("Invitation has expired", 400);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is not configured");
    }

    const inviteUrl = `${appUrl}/invite/accept?token=${invitation.token}`;

    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single();

    const companyName = company?.name || "your company";
    const inviterName =
      user.user_metadata?.full_name || user.email || "Someone";

    const from = process.env.EMAIL_FROM;

    if (!from) {
      throw new Error("EMAIL_FROM is not configured");
    }

    await sendInviteEmail({
      from,
      to: invitation.email,
      subject: `You've been invited to join ${companyName} on FlashFox`,
      html: buildInviteEmailHtml({
        companyName,
        inviterName,
        role: invitation.role,
        inviteUrl,
      }),
      text: `${inviterName} invited you to join ${companyName} on FlashFox as a ${invitation.role}.\n\nAccept invitation: ${inviteUrl}\n\nThis invitation expires in 7 days.`,
    });

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: "team_invite_resent",
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
    console.error("Resend invite route error:", error);

    return jsonError(
      error instanceof Error ? error.message : "Failed to resend invitation",
      500
    );
  }
}