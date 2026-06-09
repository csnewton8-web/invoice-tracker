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
    <a href="${escapeHtml(href)}"
      style="display:inline-block;background:${background};color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 14px;border-radius:10px;margin-right:8px;margin-top:10px;">
      ${escapeHtml(label)}
    </a>
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
    <div style="border:1px solid ${borderColor};border-radius:16px;padding:18px;margin:0 0 14px;background:#ffffff;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;padding-right:12px;">
            <div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:4px;">${supplier}</div>
            <div style="font-size:13px;color:#475569;line-height:1.5;">
              Invoice #${invoiceNumber}<br />
              Due date: ${dueDate}
            </div>
          </td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;">
            <div style="font-size:17px;font-weight:800;color:#0f172a;margin-bottom:8px;">${amount}</div>
            <span style="display:inline-block;background:${badgeBackground};color:${badgeColor};font-size:12px;font-weight:800;padding:6px 9px;border-radius:999px;">
              ${dueStatus}
            </span>
          </td>
        </tr>
      </table>

      <div style="margin-top:4px;">
        ${
          viewUrl
            ? buttonHtml("View invoice", viewUrl, "secondary")
            : `<span style="display:inline-block;font-size:12px;color:#64748b;margin-top:12px;margin-right:12px;">View link unavailable</span>`
        }
        ${
          payLinkUrl
            ? buttonHtml("Pay now", payLinkUrl, "primary")
            : `<span style="display:inline-block;font-size:12px;color:#64748b;margin-top:12px;">Payment link not set</span>`
        }
      </div>
    </div>
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
    <div style="margin-top:28px;">
      <h2 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0f172a;">
        ${escapeHtml(title)} (${items.length})
      </h2>
      ${items.map((item) => invoiceCardHtml(item, tone, payLinkUrl)).join("")}
    </div>
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
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:28px 18px;color:#0f172a;">
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden;">
          <div style="padding:26px 28px;background:#0f172a;color:#ffffff;">
            <div style="font-size:28px;font-weight:900;letter-spacing:-0.04em;margin-bottom:22px;color:#ffffff;">
              Flash<span style="color:#60a5fa;">Fox</span>
            </div>

            <h1 style="font-size:28px;line-height:1.2;margin:0 0 10px;color:#ffffff;">
              Invoice payment digest
            </h1>

            <p style="font-size:15px;line-height:1.6;color:#cbd5e1;margin:0;">
              Daily summary for <strong style="color:#ffffff;">${safeCompanyName}</strong>
            </p>
          </div>

          <div style="padding:24px 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:22px;">
              <tr>
                <td style="width:33.33%;padding:8px;">
                  <div style="background:#fee2e2;border-radius:14px;padding:14px;text-align:center;">
                    <div style="font-size:24px;font-weight:900;color:#991b1b;">${overdue.length}</div>
                    <div style="font-size:12px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:.04em;">Overdue</div>
                    <div style="font-size:12px;color:#991b1b;margin-top:4px;">${escapeHtml(
                      formatMoney(summaryCurrency, totalValue(overdue))
                    )}</div>
                  </div>
                </td>
                <td style="width:33.33%;padding:8px;">
                  <div style="background:#fef3c7;border-radius:14px;padding:14px;text-align:center;">
                    <div style="font-size:24px;font-weight:900;color:#92400e;">${dueToday.length}</div>
                    <div style="font-size:12px;font-weight:800;color:#92400e;text-transform:uppercase;letter-spacing:.04em;">Due today</div>
                    <div style="font-size:12px;color:#92400e;margin-top:4px;">${escapeHtml(
                      formatMoney(summaryCurrency, totalValue(dueToday))
                    )}</div>
                  </div>
                </td>
                <td style="width:33.33%;padding:8px;">
                  <div style="background:#dbeafe;border-radius:14px;padding:14px;text-align:center;">
                    <div style="font-size:24px;font-weight:900;color:#1e40af;">${thisWeekItems.length}</div>
                    <div style="font-size:12px;font-weight:800;color:#1e40af;text-transform:uppercase;letter-spacing:.04em;">Due this week</div>
                    <div style="font-size:12px;color:#1e40af;margin-top:4px;">${escapeHtml(
                      formatMoney(summaryCurrency, totalValue(thisWeekItems))
                    )}</div>
                  </div>
                </td>
              </tr>
            </table>

            <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 22px;">
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
                  <div style="text-align:center;margin-top:30px;">
                    <a href="${escapeHtml(dashboardUrl)}"
                      style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:13px 18px;border-radius:12px;">
                      Open FlashFox dashboard
                    </a>
                  </div>
                `
                : ""
            }

            <p style="margin:30px 0 0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;">
              This email was sent automatically by FlashFox.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  await resendClient.emails.send({
    from,
    to: cleanRecipients,
    subject,
    html,
  });
}