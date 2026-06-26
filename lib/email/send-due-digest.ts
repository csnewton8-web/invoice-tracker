import { resendClient } from "@/lib/email/resend";

type InvoiceDigestItem = {
  id?: string | null;
  invoice_id?: string | null;
  supplier: string | null;
  invoice_number: string | null;
  due_date: string | null;
  currency: string | null;
  total: number | null;
  view_url?: string | null;
};

type SendDueDigestParams = {
  to: string[];
  companyName: string;
  overdue: InvoiceDigestItem[];
  dueToday: InvoiceDigestItem[];
  dueThisWeek?: InvoiceDigestItem[];
  dueThisMonth?: InvoiceDigestItem[];
  dueNextMonth?: InvoiceDigestItem[];
  dueLater?: InvoiceDigestItem[];
  upcoming?: InvoiceDigestItem[];
  payLinkUrl?: string | null;
};

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(currency: string | null, total: number | null) {
  if (total == null) return "-";
  return `${currency || ""} ${Number(total).toFixed(2)}`.trim();
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function daysUntilDue(value: string | null) {
  if (!value) return null;

  const dueDate = new Date(`${value}T00:00:00`);
  const today = new Date();

  if (Number.isNaN(dueDate.getTime())) return null;

  today.setHours(0, 0, 0, 0);

  return Math.round(
    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function dueLabel(value: string | null) {
  const days = daysUntilDue(value);

  if (days == null) return "Due date unavailable";

  if (days < 0) {
    return `Overdue by ${Math.abs(days)} day${
      Math.abs(days) === 1 ? "" : "s"
    }`;
  }

  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";

  return `Due in ${days} days`;
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    ""
  ).replace(/\/$/, "");
}

function getInvoiceId(item: InvoiceDigestItem) {
  return item.id || item.invoice_id || null;
}

function getViewUrl(item: InvoiceDigestItem) {
  if (item.view_url) return item.view_url;

  const appBaseUrl = getAppBaseUrl();
  const invoiceId = getInvoiceId(item);

  if (!appBaseUrl || !invoiceId) return null;

  return `${appBaseUrl}/invoices?invoiceId=${encodeURIComponent(
    invoiceId
  )}#invoice-review`;
}

function totalValue(items: InvoiceDigestItem[]) {
  return items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
}

function buttonHtml(
  label: string,
  href: string,
  variant: "primary" | "secondary"
) {
  const background = variant === "primary" ? "#2563eb" : "#0f172a";

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="display:inline-table;margin:10px 8px 0 0;border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;">
      <tr>
        <td bgcolor="${background}" style="background:${background};padding:11px 16px;border-radius:10px;">
          <a href="${escapeHtml(href)}" target="_blank" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#ffffff;text-decoration:none;display:block;line-height:16px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function summaryBoxHtml(
  count: number,
  label: string,
  value: string,
  background: string,
  color: string
) {
  return `
    <td width="33.33%" valign="top" style="width:33.33%;padding:8px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${background}" style="width:100%;background:${background};border-collapse:separate;border-radius:14px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
        <tr>
          <td align="center" style="padding:18px 12px;font-family:Arial,Helvetica,sans-serif;text-align:center;">
            <div style="font-size:24px;font-weight:900;line-height:30px;color:${color};">${count}</div>
            <div style="font-size:12px;font-weight:800;line-height:16px;color:${color};text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(label)}</div>
            <div style="font-size:12px;line-height:16px;color:${color};margin-top:5px;">${escapeHtml(value)}</div>
          </td>
        </tr>
      </table>
    </td>
  `;
}

function invoiceCardHtml(
  item: InvoiceDigestItem,
  tone: "danger" | "warning" | "info" | "neutral",
  payLinkUrl?: string | null
) {
  const supplier = escapeHtml(item.supplier || "Unknown supplier");
  const invoiceNumber = escapeHtml(item.invoice_number || "-");
  const dueDate = escapeHtml(formatDate(item.due_date));
  const amount = escapeHtml(formatMoney(item.currency, item.total));
  const dueStatus = escapeHtml(dueLabel(item.due_date));
  const viewUrl = getViewUrl(item);

  const borderColor =
    tone === "danger"
      ? "#fecaca"
      : tone === "warning"
        ? "#fde68a"
        : tone === "info"
          ? "#bfdbfe"
          : "#e2e8f0";

  const badgeBackground =
    tone === "danger"
      ? "#fee2e2"
      : tone === "warning"
        ? "#fef3c7"
        : tone === "info"
          ? "#dbeafe"
          : "#f1f5f9";

  const badgeColor =
    tone === "danger"
      ? "#991b1b"
      : tone === "warning"
        ? "#92400e"
        : tone === "info"
          ? "#1e40af"
          : "#334155";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:16px;border-collapse:separate;margin:0 0 14px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
      <tr>
        <td style="padding:18px 22px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
            <tr>
              <td valign="top" style="vertical-align:top;padding:0 12px 0 0;">
                <div style="font-size:16px;font-weight:800;line-height:21px;color:#0f172a;margin:0 0 4px 0;">${supplier}</div>
                <div style="font-size:13px;line-height:20px;color:#475569;margin:0;">
                  Invoice #${invoiceNumber}<br />
                  Due date: ${dueDate}
                </div>
              </td>

              <td width="190" valign="top" align="right" style="width:190px;vertical-align:top;text-align:right;">
                <div style="font-size:17px;font-weight:800;line-height:22px;color:#0f172a;margin:0 0 10px 0;white-space:nowrap;">${amount}</div>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="right" bgcolor="${badgeBackground}" style="background:${badgeBackground};border-collapse:separate;border-radius:999px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                  <tr>
                    <td style="padding:7px 11px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;line-height:14px;color:${badgeColor};white-space:nowrap;">
                      ${dueStatus}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin-top:8px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
            <tr>
              <td>
                ${
                  viewUrl
                    ? buttonHtml("View invoice", viewUrl, "secondary")
                    : `<span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;color:#64748b;margin-top:12px;margin-right:12px;">View link unavailable</span>`
                }
                ${
                  payLinkUrl
                    ? buttonHtml("Pay now", payLinkUrl, "primary")
                    : `<span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;color:#64748b;margin-top:12px;">Payment link not set</span>`
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function sectionHtml(
  title: string,
  items: InvoiceDigestItem[],
  tone: "danger" | "warning" | "info" | "neutral",
  payLinkUrl?: string | null
) {
  if (!items.length) return "";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin-top:28px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif;padding:0;">
          <h2 style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:26px;color:#0f172a;font-weight:800;">
            ${escapeHtml(title)} (${items.length})
          </h2>
          ${items.map((item) => invoiceCardHtml(item, tone, payLinkUrl)).join("")}
        </td>
      </tr>
    </table>
  `;
}

export async function sendDueDigest({
  to,
  companyName,
  overdue,
  dueToday,
  dueThisWeek = [],
  dueThisMonth = [],
  dueNextMonth = [],
  dueLater = [],
  upcoming = [],
  payLinkUrl,
}: SendDueDigestParams) {
  const cleanRecipients = Array.from(
    new Set(to.map((email) => email.trim().toLowerCase()).filter(Boolean))
  );

  if (!cleanRecipients.length) return;

  const from = process.env.ALERT_FROM_EMAIL;

  if (!from) {
    throw new Error("Missing ALERT_FROM_EMAIL");
  }

  const thisWeekItems = dueThisWeek.length ? dueThisWeek : upcoming;

  const hasAnything =
    overdue.length ||
    dueToday.length ||
    thisWeekItems.length ||
    dueThisMonth.length ||
    dueNextMonth.length ||
    dueLater.length;

  if (!hasAnything) return;

  const safeCompanyName = escapeHtml(companyName);
  const subject = `Invoice payment digest for ${companyName}`;
  const appBaseUrl = getAppBaseUrl();
  const dashboardUrl = appBaseUrl ? `${appBaseUrl}/dashboard` : null;

  const allItems = [
    ...overdue,
    ...dueToday,
    ...thisWeekItems,
    ...dueThisMonth,
    ...dueNextMonth,
    ...dueLater,
  ];

  const summaryCurrency = allItems[0]?.currency || "GBP";

  const html = `
    <div style="margin:0;padding:0;background:#f8fafc;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="width:100%;background:#f8fafc;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
        <tr>
          <td align="center" style="padding:28px 18px;">

            <table role="presentation" width="760" cellspacing="0" cellpadding="0" border="0" align="center" style="width:760px;max-width:760px;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;border-collapse:separate;overflow:hidden;mso-table-lspace:0pt;mso-table-rspace:0pt;">
              <tr>
                <td align="left" bgcolor="#0f172a" style="padding:26px 28px;background:#0f172a;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 22px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                    <tr>
                      <td valign="middle" style="vertical-align:middle;padding:0 16px 0 0;">
                        <img src="https://invoice-tracker-lake-nine.vercel.app/logo/flashfox-icon.png" alt="FlashFox" width="68" height="68" border="0" style="display:block;width:68px;height:68px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
                      </td>
                      <td valign="middle" style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;">
                        <div style="font-size:32px;font-weight:900;line-height:34px;color:#ffffff;margin:0;">
                          Flash<span style="color:#60a5fa;">Fox</span>
                        </div>
                        <div style="font-size:12px;font-weight:700;line-height:16px;letter-spacing:0.18em;color:#fb923c;text-transform:uppercase;margin-top:8px;">
                          Fast. Smart. On Time.
                        </div>
                      </td>
                    </tr>
                  </table>

                  <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;margin:0 0 10px 0;color:#ffffff;font-weight:800;">
                    Invoice payment digest
                  </h1>

                  <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#cbd5e1;margin:0;">
                    Daily summary for <strong style="color:#ffffff;">${safeCompanyName}</strong>
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:24px 28px 30px 28px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#ffffff;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 22px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                    <tr>
                      ${summaryBoxHtml(
                        overdue.length,
                        "Overdue",
                        formatMoney(summaryCurrency, totalValue(overdue)),
                        "#fee2e2",
                        "#991b1b"
                      )}
                      ${summaryBoxHtml(
                        dueToday.length,
                        "Due today",
                        formatMoney(summaryCurrency, totalValue(dueToday)),
                        "#fef3c7",
                        "#92400e"
                      )}
                      ${summaryBoxHtml(
                        thisWeekItems.length,
                        "Due this week",
                        formatMoney(summaryCurrency, totalValue(thisWeekItems)),
                        "#dbeafe",
                        "#1e40af"
                      )}
                    </tr>
                  </table>

                  <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#475569;margin:0 0 22px 0;">
                    Use <strong>View invoice</strong> to open the invoice in FlashFox, or <strong>Pay now</strong> to open your saved payment link.
                  </p>

                  ${sectionHtml("Overdue", overdue, "danger", payLinkUrl)}
                  ${sectionHtml("Due today", dueToday, "warning", payLinkUrl)}
                  ${sectionHtml("Due this week", thisWeekItems, "info", payLinkUrl)}
                  ${sectionHtml("Due this month", dueThisMonth, "info", payLinkUrl)}
                  ${sectionHtml("Due next month", dueNextMonth, "neutral", payLinkUrl)}
                  ${sectionHtml("Due later", dueLater, "neutral", payLinkUrl)}

                  ${
                    dashboardUrl
                      ? `
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:separate;margin:30px auto 0 auto;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                          <tr>
                            <td align="center">
                              ${buttonHtml("Open FlashFox dashboard", dashboardUrl, "primary")}
                            </td>
                          </tr>
                        </table>
                      `
                      : ""
                  }

                  <p style="margin:30px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#64748b;text-align:center;">
                    This email was sent automatically by FlashFox.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </div>
  `;

  const result = await resendClient.emails.send({
    from,
    to: cleanRecipients,
    subject,
    html,
  });

  console.log("Resend email result:", result);

  if (result.error) {
    console.error("Resend email error:", result.error);
    throw new Error(result.error.message);
  }
}