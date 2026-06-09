import { resendClient } from "@/lib/email/resend";

type SendTeamInviteParams = {
  email: string;
  companyName: string;
  inviterName?: string | null;
  role: string;
  inviteUrl: string;
};

export async function sendTeamInvite({
  email,
  companyName,
  inviterName,
  role,
  inviteUrl,
}: SendTeamInviteParams) {
  const from = process.env.EMAIL_FROM;

  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }

  return resendClient.emails.send({
    from,
    to: email,
    subject: `You've been invited to join ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Team invitation</h2>

        <p>
          ${inviterName || "Someone"} invited you to join
          <strong>${companyName}</strong>
          as a <strong>${role}</strong>.
        </p>

        <p>
          Click the button below to accept your invitation:
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
}