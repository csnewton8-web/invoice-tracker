import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { resend } from "@/lib/email";

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getAdminSupabase();
    const today = new Date().toISOString().split("T")[0];

    const { data: users, error: usersError } = await supabase
      .from("user_app_settings")
      .select("user_id, notification_email")
      .not("notification_email", "is", null);

    if (usersError) {
      throw new Error(usersError.message);
    }

    for (const user of users || []) {
      if (!user.notification_email) continue;

      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("supplier, invoice_number, total, currency, due_date, is_paid")
        .eq("user_id", user.user_id)
        .eq("due_date", today)
        .eq("is_paid", false);

      if (invoicesError) {
        throw new Error(invoicesError.message);
      }

      if (!invoices?.length) continue;

      const rows = invoices
        .map(
          (inv) => `
            <tr>
              <td style="padding:8px;border:1px solid #ddd;">${inv.supplier || "-"}</td>
              <td style="padding:8px;border:1px solid #ddd;">${inv.invoice_number || "-"}</td>
              <td style="padding:8px;border:1px solid #ddd;">${inv.total ?? ""} ${inv.currency || ""}</td>
            </tr>
          `
        )
        .join("");

      await resend.emails.send({
        from: "Invoices <onboarding@resend.dev>",
        to: user.notification_email,
        subject: `Invoices due today (${invoices.length})`,
        html: `
          <h2>You have ${invoices.length} invoice${invoices.length === 1 ? "" : "s"} due today</h2>
          <table style="border-collapse:collapse;">
            <tr>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;">Supplier</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;">Invoice #</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;">Amount</th>
            </tr>
            ${rows}
          </table>
        `,
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("send-due-invoices cron error:", error);
    return res.status(500).json({
      error: error?.message || "Cron failed",
    });
  }
}