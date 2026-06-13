"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type ReviewStatus = "pending_review" | "approved" | "needs_attention";

type Invoice = {
  id: string;
  supplier?: string | null;
  supplier_id?: string | null;
  invoice_number?: string | null;
  po_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  total?: number | null;
  currency?: string | null;
  is_paid?: boolean | null;
  review_status?: ReviewStatus | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  notes?: string[] | null;
};

type SupplierOption = {
  id: string;
  name: string;
  normalized_name?: string | null;
};

type Props = {
  invoice: Invoice | null;
  onUpdate: (id: string, field: string, value: unknown) => Promise<void> | void;
};

type DraftState = {
  supplier: string;
  invoice_number: string;
  po_number: string;
  invoice_date: string;
  due_date: string;
  total: string;
  currency: string;
  notes: string;
};

const currencyOptions = [
  "GBP",
  "EUR",
  "USD",
  "AED",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "HKD",
  "HUF",
  "ILS",
  "INR",
  "JPY",
  "MXN",
  "NOK",
  "NZD",
  "PLN",
  "RON",
  "SAR",
  "SEK",
  "SGD",
  "TRY",
  "ZAR",
];

function parseLocalDate(value?: string | null) {
  if (!value) return "";
  return value.split("T")[0];
}

function buildDraft(invoice: Invoice): DraftState {
  return {
    supplier: invoice.supplier || "",
    invoice_number: invoice.invoice_number || "",
    po_number: invoice.po_number || "",
    invoice_date: parseLocalDate(invoice.invoice_date),
    due_date: parseLocalDate(invoice.due_date),
    total: invoice.total != null ? String(invoice.total) : "",
    currency: invoice.currency || "",
    notes: (invoice.notes || []).join("\n"),
  };
}

function formatMoney(total?: number | null, currency?: string | null) {
  if (total == null) return "—";

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 2,
    }).format(total);
  } catch {
    return `${currency || ""} ${total.toFixed(2)}`.trim();
  }
}

function formatReviewedAt(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getReviewStatusConfig(status?: ReviewStatus | null) {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        description: "This invoice has been reviewed and approved.",
        badgeClass:
          "border-emerald-500/20 bg-emerald-500/12 text-emerald-200",
        cardClass: "border-emerald-500/30 bg-emerald-500/10",
      };
    case "needs_attention":
      return {
        label: "Needs Attention",
        description: "This invoice needs correction or further checking.",
        badgeClass: "border-rose-500/20 bg-rose-500/12 text-rose-200",
        cardClass: "border-rose-500/30 bg-rose-500/10",
      };
    case "pending_review":
    default:
      return {
        label: "Pending Review",
        description: "Check the extracted data before approving this invoice.",
        badgeClass: "border-amber-500/20 bg-amber-500/12 text-amber-200",
        cardClass: "border-amber-500/30 bg-amber-500/10",
      };
  }
}

function FieldShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20";

const dateInputClass =
  "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition [color-scheme:dark] focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20";

export default function SelectedInvoicePanel({ invoice, onUpdate }: Props) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);

  async function loadSuppliers() {
    try {
      const {
        data: { session },
      } = await createClient().auth.getSession();

      if (!session?.access_token) {
        setSuppliers([]);
        return;
      }

      const res = await fetch("/api/suppliers", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const text = await res.text();
      const body = text ? JSON.parse(text) : null;

      if (!res.ok) {
        console.error("Failed to load suppliers:", body || text);
        setSuppliers([]);
        return;
      }

      setSuppliers(body?.suppliers || []);
    } catch (err) {
      console.error("Failed to load suppliers", err);
      setSuppliers([]);
    }
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  useEffect(() => {
    if (!invoice) {
      setDraft(null);
      return;
    }

    setDraft(buildDraft(invoice));
    setShowNotes(false);
    setSupplierDropdownOpen(false);
  }, [invoice]);

  const paymentLabel = useMemo(() => {
    if (!invoice) return "Unknown";
    if (invoice.is_paid) return "Paid";
    if (invoice.due_date) return "Open";
    return "Unpaid";
  }, [invoice]);

  const filteredSuppliers = useMemo(() => {
    const query = (draft?.supplier || "").trim().toLowerCase();

    if (!query) {
      return suppliers.slice(0, 8);
    }

    return suppliers
      .filter((supplier) => supplier.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [draft?.supplier, suppliers]);

  if (!invoice || !draft) {
    return (
      <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400 shadow-2xl shadow-black/10">
        No invoice selected
      </div>
    );
  }

  const selectedInvoice = invoice;
  const reviewStatus = selectedInvoice.review_status || "pending_review";
  const reviewConfig = getReviewStatusConfig(reviewStatus);
  const reviewedAt = formatReviewedAt(selectedInvoice.reviewed_at);

  async function saveSupplierValue(value: string | null) {
    if (!selectedInvoice) return;

    const supplier = value && value.trim() !== "" ? value.trim() : null;

    setSavingField("supplier");

    try {
      await onUpdate(selectedInvoice.id, "supplier", supplier);
      await loadSuppliers();
    } finally {
      setSavingField(null);
    }
  }

  async function saveField(field: keyof DraftState) {
    if (!selectedInvoice || !draft) return;

    let value: unknown = draft[field];

    if (field === "total") {
      value = draft.total === "" ? null : parseFloat(draft.total);
      if (draft.total !== "" && Number.isNaN(value)) return;
    }

    if (field === "currency") {
      value = draft.currency === "" ? null : draft.currency.toUpperCase();
    }

    if (field === "supplier") {
      await saveSupplierValue(draft.supplier);
      return;
    }

    if (field === "notes") {
      value =
        draft.notes.trim() === ""
          ? []
          : draft.notes.split("\n").map((line) => line.trimEnd());
    }

    if (field === "invoice_date" || field === "due_date") {
      value = value === "" ? null : value;
    }

    setSavingField(field);

    try {
      await onUpdate(selectedInvoice.id, field, value);
    } finally {
      setSavingField(null);
    }
  }

  async function selectSupplier(name: string) {
    setDraft((prev) => (prev ? { ...prev, supplier: name } : prev));
    setSupplierDropdownOpen(false);
    await saveSupplierValue(name);
  }

  async function savePaidToggle() {
    setSavingField("payment status");

    try {
      await onUpdate(selectedInvoice.id, "is_paid", !selectedInvoice.is_paid);
    } finally {
      setSavingField(null);
    }
  }

  async function saveReviewStatus(status: ReviewStatus) {
    setSavingField("review status");

    try {
      await onUpdate(selectedInvoice.id, "review_status", status);
    } finally {
      setSavingField(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-[30px] border border-blue-500/20 bg-slate-900 shadow-2xl shadow-blue-500/10">
      <div className="border-b border-slate-800 bg-slate-900 px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-blue-200">
              Selected invoice details
            </div>

            <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
              Review extracted invoice data
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Edit fields here, check the original PDF below, then approve the
              invoice when the data is correct.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[480px]">
            <div
              className={`rounded-2xl border px-3 py-2.5 ${reviewConfig.cardClass}`}
            >
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-300">
                Review Status
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {reviewConfig.label}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Payment
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {paymentLabel}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2.5">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Total
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {formatMoney(selectedInvoice.total, selectedInvoice.currency)}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <div
            className={`rounded-full border px-3 py-1 text-xs font-medium ${reviewConfig.badgeClass}`}
          >
            {reviewConfig.label}
          </div>

          <div
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              selectedInvoice.is_paid
                ? "border-emerald-500/20 bg-emerald-500/12 text-emerald-200"
                : "border-orange-500/20 bg-orange-500/12 text-orange-200"
            }`}
          >
            {selectedInvoice.is_paid ? "Paid" : "Unpaid"}
          </div>

          <button
            type="button"
            onClick={() => saveReviewStatus("approved")}
            disabled={savingField === "review status" || reviewStatus === "approved"}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Approve Invoice
          </button>

          <button
            type="button"
            onClick={() => saveReviewStatus("needs_attention")}
            disabled={
              savingField === "review status" ||
              reviewStatus === "needs_attention"
            }
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Needs Attention
          </button>

          {reviewStatus !== "pending_review" ? (
            <button
              type="button"
              onClick={() => saveReviewStatus("pending_review")}
              disabled={savingField === "review status"}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Reset Review
            </button>
          ) : null}

          <button
            type="button"
            onClick={savePaidToggle}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            {selectedInvoice.is_paid ? "Mark unpaid" : "Mark paid"}
          </button>

          <div className="text-xs text-slate-400">
            {savingField
              ? `Saving ${savingField}…`
              : "Changes save on field exit"}
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
          <div className="text-sm text-slate-300">{reviewConfig.description}</div>

          {reviewedAt ? (
            <div className="mt-1 text-xs text-slate-500">
              Last reviewed: {reviewedAt}
            </div>
          ) : (
            <div className="mt-1 text-xs text-slate-500">
              Not reviewed yet.
            </div>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FieldShell label="Supplier">
            <div className="relative">
              <input
                className={inputClass}
                value={draft.supplier}
                placeholder="Search or type supplier"
                onFocus={() => setSupplierDropdownOpen(true)}
                onChange={(e) => {
                  setDraft((prev) =>
                    prev ? { ...prev, supplier: e.target.value } : prev
                  );
                  setSupplierDropdownOpen(true);
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    setSupplierDropdownOpen(false);
                    saveField("supplier");
                  }, 150);
                }}
              />

              {supplierDropdownOpen ? (
                <div className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl shadow-black/40">
                  {filteredSuppliers.length > 0 ? (
                    filteredSuppliers.map((supplier) => (
                      <button
                        key={supplier.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectSupplier(supplier.name);
                        }}
                        className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-blue-500/20"
                      >
                        {supplier.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-400">
                      No saved suppliers match. Type the correct supplier name,
                      then click away to save it.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <p className="mt-1 text-[11px] text-slate-500">
              Search existing suppliers or type a new canonical supplier name.
            </p>
          </FieldShell>

          <FieldShell label="Invoice number">
            <input
              className={inputClass}
              value={draft.invoice_number}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, invoice_number: e.target.value } : prev
                )
              }
              onBlur={() => saveField("invoice_number")}
            />
          </FieldShell>

          <FieldShell label="PO number">
            <input
              className={inputClass}
              value={draft.po_number}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, po_number: e.target.value } : prev
                )
              }
              onBlur={() => saveField("po_number")}
            />
          </FieldShell>

          <FieldShell label="Currency">
            <select
              className={inputClass}
              value={draft.currency}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, currency: e.target.value } : prev
                )
              }
              onBlur={() => saveField("currency")}
            >
              <option value="">Select currency</option>
              {currencyOptions.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </FieldShell>

          <FieldShell label="Invoice date">
            <input
              type="date"
              className={dateInputClass}
              value={draft.invoice_date}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, invoice_date: e.target.value } : prev
                )
              }
              onBlur={() => saveField("invoice_date")}
            />
          </FieldShell>

          <FieldShell label="Due date">
            <input
              type="date"
              className={dateInputClass}
              value={draft.due_date}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, due_date: e.target.value } : prev
                )
              }
              onBlur={() => saveField("due_date")}
            />
          </FieldShell>

          <FieldShell label="Total">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={draft.total}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, total: e.target.value } : prev
                )
              }
              onBlur={() => saveField("total")}
            />
          </FieldShell>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <button
            type="button"
            onClick={() => setShowNotes((prev) => !prev)}
            className="flex w-full items-center gap-3 text-left"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10 text-sm font-semibold text-blue-200">
              {showNotes ? "−" : "+"}
            </span>

            <span>
              <span className="block text-sm font-semibold text-white">
                {showNotes ? "Hide notes" : "Add or review notes"}
              </span>
              <span className="block text-xs text-slate-400">
                Store payment follow-up context.
              </span>
            </span>
          </button>

          {showNotes ? (
            <div className="mt-3">
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Notes
              </label>
              <textarea
                rows={3}
                className={inputClass}
                value={draft.notes}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev ? { ...prev, notes: e.target.value } : prev
                  )
                }
                onBlur={() => saveField("notes")}
                placeholder="Add supplier follow-up or internal context."
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}