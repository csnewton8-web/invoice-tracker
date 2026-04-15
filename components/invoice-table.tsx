"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

const currencyOptions = [
  "GBP",
  "EUR",
  "USD",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "DKK",
  "HKD",
  "INR",
  "JPY",
  "NOK",
  "NZD",
  "SEK",
  "SGD",
  "ZAR",
];

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
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const router = useRouter();

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

  async function save(
    id: string,
    field: string,
    invoice: InvoiceRecord,
    incomingValue?: string
  ) {
    let finalValue: string | number | null =
      incomingValue !== undefined ? incomingValue : value;

    if (field === "due_date" || field === "invoice_date") {
      const newDate = parseLocalDate(String(finalValue));

      const issueDate =
        field === "invoice_date"
          ? newDate
          : parseLocalDate(invoice.invoice_date);

      const dueDate =
        field === "due_date"
          ? newDate
          : parseLocalDate(invoice.due_date);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (field === "invoice_date" && newDate && newDate > today) {
        setEditing(null);
        setTimeout(() => {
          alert("Invoice issue date cannot be in the future");
        }, 0);
        return;
      }

      if (issueDate && dueDate && dueDate < issueDate) {
        setEditing(null);
        setTimeout(() => {
          alert("Due date cannot be earlier than invoice issue date");
        }, 0);
        return;
      }
    }

    if (field === "total") {
      finalValue =
        String(finalValue).trim() === "" ? null : Number(finalValue);

      if (finalValue !== null && Number.isNaN(finalValue)) {
        alert("Please enter a valid number for Total.");
        return;
      }
    }

    if (field === "currency") {
      finalValue = String(finalValue).trim().toUpperCase();
    }

    const res = await fetch("/api/invoices/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, field, value: finalValue }),
    });

    if (!res.ok) {
      alert("Could not save your change.");
      return;
    }

    setEditing(null);
    router.refresh();
  }

  function editableTextCell(
    id: string,
    field: "supplier" | "invoice_number",
    current: string | null,
    invoice: InvoiceRecord
  ) {
    const key = `${id}-${field}`;

    if (editing === key) {
      return (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(id, field, invoice)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(id, field, invoice);
            if (e.key === "Escape") setEditing(null);
          }}
          className="w-full rounded border px-2 py-1 text-sm"
        />
      );
    }

    return (
      <span
        className="cursor-pointer"
        onClick={() => {
          setEditing(key);
          setValue(current ?? "");
        }}
      >
        {current || "—"}
      </span>
    );
  }

  function editableNumberCell(
    id: string,
    current: number | null,
    invoice: InvoiceRecord
  ) {
    const key = `${id}-total`;

    if (editing === key) {
      return (
        <input
          type="number"
          step="0.01"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(id, "total", invoice)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(id, "total", invoice);
            if (e.key === "Escape") setEditing(null);
          }}
          className="w-full rounded border px-2 py-1 text-sm"
        />
      );
    }

    return (
      <span
        className="cursor-pointer"
        onClick={() => {
          setEditing(key);
          setValue(current != null ? String(current) : "");
        }}
      >
        {current != null ? String(current) : "—"}
      </span>
    );
  }

  function editableDateCell(
    id: string,
    field: "invoice_date" | "due_date",
    current: string | null,
    invoice: InvoiceRecord
  ) {
    const key = `${id}-${field}`;

    if (editing === key) {
      return (
        <input
          type="date"
          autoFocus
          value={current || ""}
          onChange={(e) => {
            const selectedDate = e.target.value;

            const updatedInvoice: InvoiceRecord =
              field === "invoice_date"
                ? { ...invoice, invoice_date: selectedDate }
                : { ...invoice, due_date: selectedDate };

            save(id, field, updatedInvoice, selectedDate);
          }}
          onKeyDown={(e) => {
            e.preventDefault();
          }}
          onPaste={(e) => e.preventDefault()}
          className="rounded border px-2 py-1 text-sm"
        />
      );
    }

    return (
      <span
        className="cursor-pointer"
        onClick={() => {
          setEditing(key);
          setValue(current || "");
        }}
      >
        {formatDateUK(current)}
      </span>
    );
  }

  function editableCurrencyCell(
    id: string,
    current: string | null,
    invoice: InvoiceRecord
  ) {
    const key = `${id}-currency`;

    if (editing === key) {
      return (
        <select
          autoFocus
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(id, "currency", invoice)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">Select</option>
          <option value="GBP">GBP (£)</option>
          <option value="EUR">EUR (€)</option>
          <option value="USD">USD ($)</option>
          <optgroup label="Other currencies">
            {currencyOptions
              .filter((c) => !["GBP", "EUR", "USD"].includes(c))
              .sort()
              .map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
          </optgroup>
        </select>
      );
    }

    return (
      <span
        className="cursor-pointer"
        onClick={() => {
          setEditing(key);
          setValue(current || "");
        }}
      >
        {current || "—"}
      </span>
    );
  }

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
                  {editableTextCell(invoice.id, "supplier", invoice.supplier, invoice)}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {editableTextCell(
                    invoice.id,
                    "invoice_number",
                    invoice.invoice_number,
                    invoice
                  )}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {editableDateCell(
                    invoice.id,
                    "invoice_date",
                    invoice.invoice_date,
                    invoice
                  )}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {editableDateCell(
                    invoice.id,
                    "due_date",
                    invoice.due_date,
                    invoice
                  )}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {editableCurrencyCell(invoice.id, invoice.currency, invoice)}
                </td>

                <td className="border-b p-4 whitespace-nowrap align-top">
                  {editableNumberCell(invoice.id, invoice.total, invoice)}
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