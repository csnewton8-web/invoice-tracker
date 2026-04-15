import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resend } from "@/lib/email";

export async function GET() {
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const { data: users } = await supabase
    .from("user_app_settings")
    .select("*")
    .not("notification_email", "is", null);

  for (const user of users || []) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("*")
      .eq("user_id", user.user_id)
      .eq("due_date", today)
      .eq("is_paid", false);

    if (!invoices?.length) continue;

    const rows = invoices
      .map(
        (inv) => `
        <tr>
          <td>${inv.supplier || "-"}</td>
          <td>${inv.invoice_number || "-"}</td>
          <td>${inv.total || ""} ${inv.currency || ""}</td>
        </tr>
      `
      )
      .join("");

    await resend.emails.send({
      from: "Invoices <onboarding@resend.dev>",
      to: user.notification_email,
      subject: `Invoices due today (${invoices.length})`,
      html: `
        <h2>You have ${invoices.length} invoices due today</h2>
        <table border="1" cellpadding="6" cellspacing="0">
          <tr>
            <th>Supplier</th>
            <th>Invoice #</th>
            <th>Amount</th>
          </tr>
          ${rows}
        </table>
      `,
    });
  }

  return NextResponse.json({ success: true });
}