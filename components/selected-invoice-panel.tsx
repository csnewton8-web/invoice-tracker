"use client";

import { useEffect, useState } from "react";

type Invoice = {
  id: string;
  supplier?: string | null;
  invoice_number?: string | null;
  po_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  total?: number | null;
  currency?: string | null;
  is_paid?: boolean | null;
  notes?: string[] | null;
};

type Props = {
  invoice: Invoice | null;
  onUpdate: (id: string, field: string, value: any) => Promise<void> | void;
};

function parseLocalDate(value?: string | null) {
  if (!value) return "";
  return value.split("T")[0];
}

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

export default function SelectedInvoicePanel({ invoice, onUpdate }: Props) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) {
      setDraft(null);
      return;
    }

    setDraft(buildDraft(invoice));
  }, [invoice]);

  if (!invoice || !draft) {
    return (
      <div className="sticky top-4 rounded-2xl border bg-white p-3 text-sm text-slate-500">
        No invoice selected
      </div>
    );
  }

  const selectedInvoice = invoice;

  async function saveField(field: keyof DraftState) {
    if (!selectedInvoice || !draft) return;

    let value: any = draft[field];

    if (field === "total") {
      value = draft.total === "" ? null : parseFloat(draft.total);
      if (draft.total !== "" && Number.isNaN(value)) {
        return;
      }
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

  async function savePaidToggle() {
    await onUpdate(selectedInvoice.id, "is_paid", !selectedInvoice.is_paid);
  }

  return (
    <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Invoice Details</h2>
        <button
          onClick={savePaidToggle}
          className="rounded bg-blue-600 px-3 py-1 text-xs whitespace-nowrap text-white"
        >
          {selectedInvoice.is_paid ? "Mark Unpaid" : "Mark Paid"}
        </button>
      </div>

      <div className="text-xs font-medium text-slate-600">
        Status: {selectedInvoice.is_paid ? "Paid" : "Unpaid"}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Supplier</label>
          <input
            className="w-full rounded border p-2 text-sm"
            value={draft.supplier}
            onChange={(e) =>
              setDraft((prev) => (prev ? { ...prev, supplier: e.target.value } : prev))
            }
            onBlur={() => saveField("supplier")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">
            Invoice Number
          </label>
          <input
            className="w-full rounded border p-2 text-sm"
            value={draft.invoice_number}
            onChange={(e) =>
              setDraft((prev) =>
                prev ? { ...prev, invoice_number: e.target.value } : prev
              )
            }
            onBlur={() => saveField("invoice_number")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">PO Number</label>
          <input
            className="w-full rounded border p-2 text-sm"
            value={draft.po_number}
            onChange={(e) =>
              setDraft((prev) => (prev ? { ...prev, po_number: e.target.value } : prev))
            }
            onBlur={() => saveField("po_number")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">
            Invoice Date
          </label>
          <input
            type="date"
            className="w-full rounded border p-2 text-sm"
            value={draft.invoice_date}
            onChange={(e) =>
              setDraft((prev) =>
                prev ? { ...prev, invoice_date: e.target.value } : prev
              )
            }
            onBlur={() => saveField("invoice_date")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Due Date</label>
          <input
            type="date"
            className="w-full rounded border p-2 text-sm"
            value={draft.due_date}
            onChange={(e) =>
              setDraft((prev) => (prev ? { ...prev, due_date: e.target.value } : prev))
            }
            onBlur={() => saveField("due_date")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Total</label>
          <input
            type="number"
            className="w-full rounded border p-2 text-sm"
            value={draft.total}
            onChange={(e) =>
              setDraft((prev) => (prev ? { ...prev, total: e.target.value } : prev))
            }
            onBlur={() => saveField("total")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Currency</label>
          <input
            className="w-full rounded border p-2 text-sm"
            value={draft.currency}
            onChange={(e) =>
              setDraft((prev) => (prev ? { ...prev, currency: e.target.value } : prev))
            }
            onBlur={() => saveField("currency")}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Notes</label>
        <textarea
          rows={3}
          className="w-full rounded border p-2 text-sm"
          value={draft.notes}
          onChange={(e) =>
            setDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
          }
          onBlur={() => saveField("notes")}
        />
      </div>

      {savingField && (
        <div className="text-xs text-slate-500">Saving {savingField}...</div>
      )}
    </div>
  );
}