import { Resend } from "resend";

type InvoiceDigestItem = {
  supplier: string | null;
  invoice_number: string | null;
  due_date: string | null;
  currency: string | null;
  total: number | null;
};

type SendDueDigestParams = {
  to: string[];
  companyName: string;
  overdue: InvoiceDigestItem[];
  dueToday: InvoiceDigestItem[];
  upcoming: InvoiceDigestItem[];
};

const resend = new Resend(process.env.RESEND_API_KEY);

function formatMoney(currency: string | null, total: number | null) {
  if (total == null) return "-";
  return `${currency || ""} ${Number(total).toFixed(2)}`.trim();
}

function sectionHtml(
  title: string,
  items: InvoiceDigestItem[],
  colorClass: string
) {
  if (!items.length) return "";

  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${item.supplier || "-"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${item.invoice_number || "-"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${item.due_date || "-"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${formatMoney(item.currency, item.total)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <h2 style="margin:24px 0 12px;font-size:18px;" class="${colorClass}">${title} (${items.length})</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Supplier</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Invoice #</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Due date</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

export async function sendDueDigest({
  to,
  companyName,
  overdue,
  dueToday,
  upcoming,
}: SendDueDigestParams) {
  if (!to.length) return;

  const from = process.env.ALERT_FROM_EMAIL;
  if (!from) {
    throw new Error("Missing ALERT_FROM_EMAIL");
  }

  const hasAnything = overdue.length || dueToday.length || upcoming.length;
  if (!hasAnything) return;

  const subject = `Invoice payment digest for ${companyName}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px;color:#0f172a;">
      <h1 style="font-size:24px;margin-bottom:8px;">Invoice payment digest</h1>
      <p style="font-size:14px;color:#475569;margin-bottom:24px;">
        Daily summary for <strong>${companyName}</strong>
      </p>

      ${sectionHtml("Overdue", overdue, "overdue")}
      ${sectionHtml("Due today", dueToday, "due")}
      ${sectionHtml("Due in next 7 days", upcoming, "upcoming")}

      <p style="margin-top:24px;font-size:12px;color:#64748b;">
        This email was sent automatically by your invoice tracker.
      </p>
    </div>
  `;

  await resend.emails.send({
    from,
    to,
    subject,
    html,
  });
}