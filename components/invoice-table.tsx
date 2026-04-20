"use client";

import { InvoiceRecord } from "@/types/invoice";

type Props = {
  invoices: InvoiceRecord[];
  selectedIds: string[];
  selectedInvoiceId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onViewInvoice: (id: string) => void;
  payLinkUrl?: string;
};

function formatDateUK(date?: string | null) {
  if (!date) return "-";

  const d = new Date(date);
  if (isNaN(d.getTime())) return date;

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}-${month}-${year}`;
}

function getDueInfo(date?: string | null) {
  if (!date) return { label: "-", status: "unknown" as const };

  const today = new Date();
  const due = new Date(date);

  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) {
    return {
      label: `Overdue by ${Math.abs(diffDays)} day${
        Math.abs(diffDays) !== 1 ? "s" : ""
      }`,
      status: "overdue" as const,
    };
  }

  if (diffDays === 0) {
    return {
      label: "Due today",
      status: "due" as const,
    };
  }

  return {
    label: `Due in ${diffDays} day${diffDays !== 1 ? "s" : ""}`,
    status: "future" as const,
  };
}

function getDisplayStatus(invoice: InvoiceRecord) {
  if (invoice.is_paid) {
    return {
      label: "Paid",
      status: "paid" as const,
    };
  }

  return getDueInfo(invoice.due_date ?? null);
}

export function InvoiceTable({
  invoices,
  selectedIds,
  selectedInvoiceId,
  onToggleSelect,
  onToggleSelectAll,
  onViewInvoice,
  payLinkUrl,
}: Props) {
  const allSelected =
    invoices.length > 0 &&
    invoices.every((invoice) => selectedIds.includes(invoice.id));

  return (
    <div className="rounded-2xl border bg-white">
      <div className="max-h-[520px] overflow-y-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-10 border-b bg-slate-50 text-left font-semibold text-slate-600">
            <tr>
              <th className="w-[30px] px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                />
              </th>
              <th className="max-w-[120px] px-2 py-1.5">File</th>
              <th className="max-w-[120px] px-2 py-1.5">Supplier</th>
              <th className="w-[90px] px-2 py-1.5">Inv #</th>
              <th className="w-[90px] px-2 py-1.5">PO</th>
              <th className="w-[90px] px-2 py-1.5">Issue</th>
              <th className="w-[90px] px-2 py-1.5">Due</th>
              <th className="w-[130px] px-2 py-1.5">Status</th>
              <th className="w-[60px] px-2 py-1.5">Curr</th>
              <th className="w-[80px] px-2 py-1.5 text-right">Total</th>
              <th className="w-[80px] px-2 py-1.5">Payment</th>
              <th className="w-[90px] px-2 py-1.5 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {invoices.map((invoice) => {
              const isSelected = selectedIds.includes(invoice.id);
              const isActive = invoice.id === selectedInvoiceId;

              const displayStatus = getDisplayStatus(invoice);
              const isOverdueUnpaid = displayStatus.status === "overdue";
              const isPaid = !!invoice.is_paid;

              return (
                <tr
                  key={invoice.id}
                  className={`border-t ${
                    isPaid
                      ? "bg-green-50"
                      : isOverdueUnpaid
                      ? "bg-red-50"
                      : "hover:bg-slate-50"
                  } ${isActive ? "outline outline-2 outline-blue-400" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(invoice.id)}
                    />
                  </td>

                  <td className="max-w-[120px] truncate px-2 py-1.5">
                    {invoice.file_name || "-"}
                  </td>

                  <td className="max-w-[120px] truncate px-2 py-1.5">
                    {invoice.supplier || "-"}
                  </td>

                  <td className="px-2 py-1.5">
                    {invoice.invoice_number || "-"}
                  </td>

                  <td className="px-2 py-1.5">
                    {invoice.po_number || "-"}
                  </td>

                  <td className="px-2 py-1.5">
                    {formatDateUK(invoice.invoice_date)}
                  </td>

                  <td className="px-2 py-1.5">
                    {formatDateUK(invoice.due_date)}
                  </td>

                  <td className="px-2 py-1.5">
                    {displayStatus.status === "paid" && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">
                        {displayStatus.label}
                      </span>
                    )}

                    {displayStatus.status === "overdue" && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                        {displayStatus.label}
                      </span>
                    )}

                    {displayStatus.status === "due" && (
                      <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-700">
                        {displayStatus.label}
                      </span>
                    )}

                    {displayStatus.status === "future" && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                        {displayStatus.label}
                      </span>
                    )}

                    {displayStatus.status === "unknown" && "-"}
                  </td>

                  <td className="px-2 py-1.5">
                    {invoice.currency || "-"}
                  </td>

                  <td className="px-2 py-1.5 text-right">
                    {invoice.total != null ? invoice.total.toFixed(2) : "-"}
                  </td>

                  <td className="px-2 py-1.5">
                    {invoice.is_paid ? (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">
                        Paid
                      </span>
                    ) : (
                      <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">
                        Unpaid
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(invoice.id)}
                        className="rounded border px-2 py-0.5 text-[10px] hover:bg-slate-100"
                      >
                        View
                      </button>

                      {payLinkUrl && (
                        <a
                          href={payLinkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border px-2 py-0.5 text-[10px] hover:bg-slate-100"
                        >
                          Pay
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {invoices.length === 0 && (
              <tr>
                <td
                  colSpan={12}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  No invoices found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}