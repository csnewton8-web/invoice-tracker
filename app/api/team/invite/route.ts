import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { requireCurrentCompany } from "@/lib/current-company";
import { canManageTeam } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["admin", "member", "viewer"];

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendInviteEmail({
  to,
  from,
  subject,
  html,
}: {
  to: string;
  from: string;
  subject: string;
  html: string;
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
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to send invite email:", errorText);
    throw new Error("Invitation was created but email could not be sent");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role, user } =
      await requireCurrentCompany(req);

    if (!canManageTeam(role)) {
      return jsonError(
        "You do not have permission to invite team members",
        403
      );
    }

    const body = await req.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const inviteRole =
      typeof body.role === "string"
        ? body.role.trim().toLowerCase()
        : "member";

    if (!email) {
      return jsonError("Email is required", 400);
    }

    if (!isValidEmail(email)) {
      return jsonError("Invalid email address", 400);
    }

    if (!ALLOWED_ROLES.includes(inviteRole)) {
      return jsonError("Invalid role", 400);
    }

    const { data: existingMembership } = await supabase
      .from("company_memberships")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .limit(1);

    if (existingMembership && existingMembership.length > 0) {
      const { data: users } = await supabase.auth.admin.listUsers();

      const matchedUser = users.users.find(
        (u) => u.email?.toLowerCase() === email
      );

      if (matchedUser) {
        const { data: alreadyMember } = await supabase
          .from("company_memberships")
          .select("id")
          .eq("company_id", companyId)
          .eq("user_id", matchedUser.id)
          .eq("is_active", true)
          .maybeSingle();

        if (alreadyMember) {
          return jsonError(
            "This user is already a member of the company",
            409
          );
        }
      }
    }

    const { data: existingInvite } = await supabase
      .from("company_invitations")
      .select("id")
      .eq("company_id", companyId)
      .eq("email", email)
      .is("accepted_at", null)
      .maybeSingle();

    if (existingInvite) {
      return jsonError(
        "An active invitation already exists for this email",
        409
      );
    }

    const token = crypto.randomBytes(32).toString("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data, error } = await supabase
      .from("company_invitations")
      .insert({
        company_id: companyId,
        email,
        role: inviteRole,
        token,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Failed to create invitation:", error);

      return jsonError(
        error?.message || "Could not create invitation",
        500
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    const inviteUrl = appUrl
      ? `${appUrl}/invite/accept?token=${token}`
      : `/invite/accept?token=${token}`;

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
      to: email,
      subject: `You've been invited to join ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Team invitation</h2>

          <p>
            ${inviterName} invited you to join
            <strong>${companyName}</strong>
            as a <strong>${inviteRole}</strong>.
          </p>

          <p>
            <a
              href="${inviteUrl}"
              style="
                background:#111827;
                color:white;
                padding:12px 20px;
                border-radius:8px;
                text-decoration:none;
                display:inline-block;
              "
            >
              Accept invitation
            </a>
          </p>

          <p>This invitation expires in 7 days.</p>
        </div>
      `,
    });

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: "team_member_invited",
      entityType: "company_invitation",
      entityId: data.id,
      metadata: {
        invited_email: email,
        invited_role: inviteRole,
      },
    });

    const isDev = process.env.NODE_ENV !== "production";

    return NextResponse.json({
      success: true,
      invitation: {
        id: data.id,
        email: data.email,
        role: data.role,
        expires_at: data.expires_at,
      },
      ...(isDev ? { invite_url: inviteUrl } : {}),
    });
  } catch (error: unknown) {
    console.error("Team invite route error:", error);

    return jsonError(
      error instanceof Error ? error.message : "Failed to create invitation",
      500
    );
  }
}