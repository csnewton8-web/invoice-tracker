"use client";

import { InvoiceRecord } from "@/types/invoice";

function parseLocalDate(date: string | null) {
  if (!date) return null;

  const parts = date.split("-");
  if (parts.length !== 3) return new Date(date);

  const [year, month, day] = parts.map(Number);
  return new Date(year, month - 1, day);
}

function formatDateUK(date: string | null) {
  if (!date) return "—";
  const d = parseLocalDate(date);
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function formatMoney(total: number | null, currency: string | null) {
  if (total == null) return "—";
  return `${currency || ""} ${total}`;
}

function daysUntil(date: string | null) {
  if (!date) return null;

  const now = new Date();
  const due = parseLocalDate(date);

  if (!due || Number.isNaN(due.getTime())) return null;

  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function statusText(date: string | null) {
  const d = daysUntil(date);
  if (d === null) return "Unknown";
  if (d < 0) return `Overdue by ${Math.abs(d)} days`;
  return `Due in ${d} days`;
}

export function InvoiceTable({
  invoices,
  onViewInvoice,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  payLinkUrl,
  selectedInvoiceId,
}: {
  invoices: InvoiceRecord[];
  onViewInvoice: (id: string) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  payLinkUrl: string;
  selectedInvoiceId: string | null;
}) {
  if (!invoices.length) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600">
        No invoices found.
      </div>
    );
  }

  const allSelected =
    invoices.length > 0 &&
    invoices.every((inv) => selectedIds.includes(inv.id));

  return (
    <div className="max-h-[70vh] overflow-auto rounded-2xl border bg-white">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="text-left">
          <tr>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
              />
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              File name
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              Supplier
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              Invoice #
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              Invoice issue date
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              Due date
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              Currency
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              Total
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              Status
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              Payment status
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              Pay Link
            </th>
            <th className="sticky top-0 z-20 border-b bg-slate-50 p-4 whitespace-nowrap">
              View
            </th>
          </tr>
        </thead>

        <tbody>
          {invoices.map((invoice) => {
            const isSelected = selectedIds.includes(invoice.id);
            const isPaid = invoice.is_paid;
            const isViewed = selectedInvoiceId === invoice.id;

            return (
              <tr
                key={invoice.id}
                className={`${
                  isViewed
                    ? "bg-blue-50"
                    : isPaid
                    ? "bg-green-50"
                    : "bg-orange-50"
                }`}
              >
                <td className="border-b p-4 align-top">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(invoice.id)}
                  />
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {invoice.file_name || "—"}
                </td>

                <td className="border-b p-4 align-top">
                  {invoice.supplier || "—"}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {invoice.invoice_number || "—"}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {formatDateUK(invoice.invoice_date)}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {formatDateUK(invoice.due_date)}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {invoice.currency || "—"}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {formatMoney(invoice.total, invoice.currency)}
                </td>

                <td className="border-b p-4 align-top">
                  {statusText(invoice.due_date)}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {isPaid ? "Invoice paid" : "Not yet paid"}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  <button
                    onClick={() => {
                      if (!payLinkUrl) {
                        alert("No payment link configured.");
                        return;
                      }
                      window.open(payLinkUrl, "_blank", "noopener,noreferrer");
                    }}
                    className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-100"
                  >
                    Go Pay!
                  </button>
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  <button
                    onClick={() => onViewInvoice(invoice.id)}
                    className={`rounded-lg border px-3 py-1 text-sm ${
                      isViewed ? "bg-blue-500 text-white" : "hover:bg-slate-100"
                    }`}
                  >
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}