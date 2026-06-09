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
      label: `Overdue ${Math.abs(diffDays)}d`,
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
    label: `Due ${diffDays}d`,
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

function StatusBadge({
  label,
  status,
}: {
  label: string;
  status: "paid" | "overdue" | "due" | "future" | "unknown";
}) {
  if (status === "unknown") return <span>-</span>;

  const className =
    status === "paid"
      ? "bg-green-100 text-green-700"
      : status === "overdue"
        ? "bg-red-100 text-red-700"
        : status === "due"
          ? "bg-yellow-100 text-yellow-700"
          : "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-medium ${className}`}
    >
      {label}
    </span>
  );
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

  const hasPayLink = Boolean(payLinkUrl);

  return (
    <div className="rounded-3xl border border-blue-500/40 bg-white shadow-lg shadow-blue-500/10">
      <div className="max-h-[600px] overflow-y-auto rounded-3xl">
        <table className="w-full table-fixed text-[13px] leading-5 text-slate-900">
          <colgroup>
            <col className="w-[42px]" />
            <col className="w-[18%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
          </colgroup>

          <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 text-left text-[13px] font-semibold text-slate-700">
            <tr>
              <th className="px-2 py-4">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4"
                />
              </th>
              <th className="px-2 py-4">Supplier</th>
              <th className="px-2 py-4">Inv#</th>
              <th className="px-2 py-4">PO#</th>
              <th className="px-2 py-4">Issue Date</th>
              <th className="px-2 py-4">Due Date</th>
              <th className="px-2 py-4">Status</th>
              <th className="px-2 py-4">Currency</th>
              <th className="px-2 py-4 text-right">Total</th>
              <th className="px-2 py-4">Payment</th>
              <th className="px-2 py-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {invoices.map((invoice) => {
              const isSelected = selectedIds.includes(invoice.id);
              const isActive = invoice.id === selectedInvoiceId;
              const displayStatus = getDisplayStatus(invoice);
              const isOverdueUnpaid = displayStatus.status === "overdue";
              const isPaid = !!invoice.is_paid;

              const rowClassName = isActive
                ? "bg-blue-50"
                : isPaid
                  ? "bg-green-50"
                  : isOverdueUnpaid
                    ? "bg-red-50"
                    : "bg-white hover:bg-blue-50/60";

              return (
                <tr
                  key={invoice.id}
                  className={`border-t border-slate-200 transition ${rowClassName} ${
                    isActive
                      ? "outline outline-2 outline-inset outline-blue-500"
                      : ""
                  }`}
                >
                  <td className="px-2 py-4 align-middle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(invoice.id)}
                      className="h-4 w-4"
                    />
                  </td>

                  <td
                    className="truncate px-2 py-4 align-middle font-medium"
                    title={invoice.supplier || invoice.file_name || "-"}
                  >
                    {invoice.supplier || "-"}
                  </td>

                  <td
                    className="truncate px-2 py-4 align-middle"
                    title={invoice.invoice_number || "-"}
                  >
                    {invoice.invoice_number || "-"}
                  </td>

                  <td
                    className="truncate px-2 py-4 align-middle"
                    title={invoice.po_number || "-"}
                  >
                    {invoice.po_number || "-"}
                  </td>

                  <td className="whitespace-nowrap px-2 py-4 align-middle">
                    {formatDateUK(invoice.invoice_date)}
                  </td>

                  <td className="whitespace-nowrap px-2 py-4 align-middle">
                    {formatDateUK(invoice.due_date)}
                  </td>

                  <td className="px-2 py-4 align-middle">
                    <StatusBadge
                      label={displayStatus.label}
                      status={displayStatus.status}
                    />
                  </td>

                  <td className="whitespace-nowrap px-2 py-4 align-middle">
                    {invoice.currency || "-"}
                  </td>

                  <td className="whitespace-nowrap px-2 py-4 text-right align-middle tabular-nums">
                    {invoice.total != null ? invoice.total.toFixed(2) : "-"}
                  </td>

                  <td className="px-2 py-4 align-middle">
                    {invoice.is_paid ? (
                      <StatusBadge label="Paid" status="paid" />
                    ) : (
                      <span className="inline-flex whitespace-nowrap rounded-full bg-orange-100 px-2 py-1 text-[12px] font-medium text-orange-700">
                        Unpaid
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-4 text-right align-middle">
                    <div className="flex justify-end gap-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(invoice.id)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        View
                      </button>

                      {hasPayLink ? (
                        <a
                          href={payLinkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          Pay
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Add a payment link in Advanced tools to enable this button."
                          className="cursor-not-allowed rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-medium text-slate-400 opacity-70"
                        >
                          Pay
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {invoices.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
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