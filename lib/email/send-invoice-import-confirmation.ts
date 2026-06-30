import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type ImportedInvoiceForEmail = {
  id: string;
  supplier?: string | null;
  invoice_number?: string | null;
  po_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  payment_terms?: string | null;
  total?: number | null;
  currency?: string | null;
  confidence?: number | null;
  duplicate_status?: string | null;
  duplicate_confidence?: number | null;
  duplicate_of_invoice_id?: string | null;
  file_name?: string | null;
};

type SendInvoiceImportConfirmationParams = {
  to: string;
  companyName?: string | null;
  invoices: ImportedInvoiceForEmail[];
};

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    "https://app.flashfox.co.uk"
  ).replace(/\/$/, "");
}

function getLogoUrl() {
  return `${getAppUrl()}/logo/flashfox-logo.png`;
}

function escapeHtml(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(total?: number | null, currency?: string | null) {
  if (total === null || total === undefined) return "—";

  const code = currency || "GBP";

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
    }).format(total);
  } catch {
    return `${total} ${code}`;
  }
}

function formatConfidence(confidence?: number | null) {
  if (confidence === null || confidence === undefined) return "Not available";

  const percentage = confidence <= 1 ? confidence * 100 : confidence;

  return `${Math.round(percentage)}%`;
}

function getConfidenceColour(confidence?: number | null) {
  if (confidence === null || confidence === undefined) {
    return "#6b7280";
  }

  const percentage = confidence <= 1 ? confidence * 100 : confidence;

  if (percentage >= 85) return "#047857";
  if (percentage >= 60) return "#b45309";

  return "#b91c1c";
}

function getDuplicateNotice(invoice: ImportedInvoiceForEmail) {
  if (!invoice.duplicate_status || invoice.duplicate_status === "none") {
    return "";
  }

  return `
    <div style="margin-top:14px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;color:#9a3412;font-size:13px;line-height:1.5;">
      <strong>Possible duplicate detected.</strong>
      Duplicate confidence: ${escapeHtml(formatConfidence(invoice.duplicate_confidence))}
    </div>
  `;
}

function fieldRows(invoice: ImportedInvoiceForEmail) {
  const confidence = formatConfidence(invoice.confidence);
  const confidenceColour = getConfidenceColour(invoice.confidence);

  const rows = [
    ["Supplier", invoice.supplier],
    ["Invoice number", invoice.invoice_number],
    ["PO number", invoice.po_number],
    ["Invoice date", invoice.invoice_date],
    ["Due date", invoice.due_date],
    ["Payment terms", invoice.payment_terms],
    ["Total", formatCurrency(invoice.total, invoice.currency)],
    ["Currency", invoice.currency],
  ];

  return rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #eef2f7;color:#374151;font-weight:700;width:34%;">
            ${escapeHtml(label)}
          </td>
          <td style="padding:12px 14px;border-bottom:1px solid #eef2f7;color:#111827;">
            ${escapeHtml(value)}
          </td>
          <td style="padding:12px 14px;border-bottom:1px solid #eef2f7;text-align:right;color:${confidenceColour};font-weight:700;white-space:nowrap;">
            ${escapeHtml(confidence)}
          </td>
        </tr>
      `
    )
    .join("");
}

function invoiceBlock(invoice: ImportedInvoiceForEmail, appUrl: string) {
  const invoiceUrl = `${appUrl}/invoices?invoiceId=${encodeURIComponent(
    invoice.id
  )}`;

  return `
    <div style="margin:22px 0 0;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
      <div style="padding:20px 22px;border-bottom:1px solid #eef2f7;">
        <p style="margin:0 0 6px;color:#6b7280;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
          Uploaded invoice
        </p>

        <h2 style="margin:0;color:#111827;font-size:20px;line-height:1.3;">
          ${escapeHtml(invoice.supplier || invoice.file_name || "Invoice uploaded")}
        </h2>

        <p style="margin:8px 0 0;color:#4b5563;font-size:14px;line-height:1.5;">
          Extraction confidence:
          <strong style="color:${getConfidenceColour(invoice.confidence)};">
            ${escapeHtml(formatConfidence(invoice.confidence))}
          </strong>
        </p>
      </div>

      <div style="padding:0 22px 22px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
          <thead>
            <tr>
              <th align="left" style="padding:12px 14px;border-bottom:1px solid #dbe4ef;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">
                Field
              </th>
              <th align="left" style="padding:12px 14px;border-bottom:1px solid #dbe4ef;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">
                Extracted value
              </th>
              <th align="right" style="padding:12px 14px;border-bottom:1px solid #dbe4ef;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody>
            ${fieldRows(invoice)}
          </tbody>
        </table>

        ${getDuplicateNotice(invoice)}

        <div style="margin-top:22px;">
          <a href="${escapeHtml(invoiceUrl)}" style="background:#111827;color:#ffffff;padding:13px 18px;border-radius:10px;text-decoration:none;display:inline-block;font-size:14px;font-weight:700;">
            View/edit invoice in Flashfox
          </a>
        </div>
      </div>
    </div>
  `;
}

export async function sendInvoiceImportConfirmation({
  to,
  companyName,
  invoices,
}: SendInvoiceImportConfirmationParams) {
  if (!invoices.length) return null;

  const from =
  process.env.INVOICE_EMAIL_FROM ||
  process.env.EMAIL_FROM ||
  "FlashFox <invoices@flashfox.co.uk>";
  const appUrl = getAppUrl();
  const logoUrl = getLogoUrl();

  return resend.emails.send({
    from,
    to,
    subject:
      invoices.length === 1
        ? "Invoice uploaded to Flashfox"
        : `${invoices.length} invoices uploaded to Flashfox`,
    html: `
      <!doctype html>
      <html>
        <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
          <div style="display:none;max-height:0;overflow:hidden;color:transparent;">
            Your invoice has been uploaded to Flashfox and the extracted fields are ready to review.
          </div>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;margin:0;padding:0;">
            <tr>
              <td align="center" style="padding:32px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;margin:0 auto;">
                  <tr>
                    <td style="padding:0 0 18px;text-align:center;">
                      <img src="${escapeHtml(logoUrl)}" alt="Flashfox" width="150" style="display:inline-block;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;" />
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#111827;border-radius:18px 18px 0 0;padding:30px 28px;text-align:left;">
                      <p style="margin:0 0 10px;color:#f97316;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
                        Upload confirmed
                      </p>

                      <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.25;">
                        ${
                          invoices.length === 1
                            ? "Your invoice has been uploaded"
                            : "Your invoices have been uploaded"
                        }
                      </h1>

                      <p style="margin:14px 0 0;color:#d1d5db;font-size:15px;line-height:1.6;">
                        Thanks — your forwarded invoice${
                          invoices.length > 1 ? "s have" : " has"
                        } been uploaded to ${escapeHtml(companyName || "Flashfox")}.
                        The extracted data is shown below so you can quickly check it before taking any further action.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#ffffff;border-radius:0 0 18px 18px;padding:24px 24px 28px;border:1px solid #e5e7eb;border-top:0;">
                      <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:14px;padding:14px 16px;color:#166534;font-size:14px;line-height:1.5;">
                        <strong>Upload successful.</strong>
                        The invoice ${
                          invoices.length === 1 ? "is" : "records are"
                        } now available in your Flashfox workspace.
                      </div>

                      ${invoices.map((invoice) => invoiceBlock(invoice, appUrl)).join("")}

                      <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
                        Please review any fields with low or missing confidence. This is an automated confirmation from Flashfox.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:18px 8px 0;text-align:center;color:#9ca3af;font-size:12px;line-height:1.5;">
                      © ${new Date().getFullYear()} Flashfox. This email was sent because an invoice was forwarded to invoices@flashfox.co.uk.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });
}