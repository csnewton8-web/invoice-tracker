"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InvoiceRecord } from "@/types/invoice";
import { InvoiceTable } from "@/components/invoice-table";
import { PdfViewer } from "@/components/pdf-viewer";
import { PayLinkSettings } from "@/components/pay-link-settings";
import { NotificationSettings } from "@/components/notification-settings";
import { RecipientSettings } from "@/components/recipient-settings";
import SelectedInvoicePanel from "@/components/selected-invoice-panel";
import { createClient } from "@/lib/supabase/browser";

function parseLocalDate(date: string | null) {
  if (!date) return null;
  const parts = date.split("-");
  if (parts.length !== 3) return new Date(date);
  const [year, month, day] = parts.map(Number);
  return new Date(year, month - 1, day);
}

function dueStatusOf(invoice: InvoiceRecord) {
  if (invoice.is_paid) return "paid";
  if (!invoice.due_date) return "unknown";

  const now = new Date();
  const due = parseLocalDate(invoice.due_date);

  if (!due || Number.isNaN(due.getTime())) return "unknown";

  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.round(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "overdue";
  return "future";
}

type Props = {
  invoices: InvoiceRecord[];
};

export function InvoiceWorkspace({ invoices: initialInvoices }: Props) {
  const selectedPanelRef = useRef<HTMLDivElement | null>(null);
  const supabase = createClient();

  const [invoices, setInvoices] = useState(initialInvoices);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    initialInvoices[0]?.id || null
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [payLinkUrl, setPayLinkUrl] = useState("");

  const [deleting, setDeleting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markingUnpaid, setMarkingUnpaid] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [dueStatusFilter, setDueStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due_date_old_to_new");

  useEffect(() => {
    setInvoices(initialInvoices);
  }, [initialInvoices]);

  useEffect(() => {
    async function loadPayLink() {
      try {
        const res = await fetch("/api/settings/pay-link");
        const body = await res.json();
        if (res.ok) {
          setPayLinkUrl(body.pay_link_url || "");
        }
      } catch {
        // ignore
      }
    }

    loadPayLink();
  }, []);

  const supplierOptions = useMemo(() => {
    return Array.from(
      new Set(
        invoices
          .map((invoice) => invoice.supplier?.trim())
          .filter((x): x is string => Boolean(x))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  const currencyOptions = useMemo(() => {
    return Array.from(
      new Set(
        invoices
          .map((invoice) => invoice.currency?.trim())
          .filter((x): x is string => Boolean(x))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  const filteredAndSortedInvoices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = invoices.filter((invoice) => {
      if (supplierFilter !== "all" && invoice.supplier !== supplierFilter) {
        return false;
      }

      if (paymentStatusFilter === "paid" && !invoice.is_paid) {
        return false;
      }

      if (paymentStatusFilter === "unpaid" && invoice.is_paid) {
        return false;
      }

      if (currencyFilter !== "all" && invoice.currency !== currencyFilter) {
        return false;
      }

      const dueStatus = dueStatusOf(invoice);

      if (dueStatusFilter === "overdue" && dueStatus !== "overdue") {
        return false;
      }

      if (dueStatusFilter === "future" && dueStatus !== "future") {
        return false;
      }

      if (normalizedSearch) {
        const haystack = [
          invoice.file_name,
          invoice.supplier,
          invoice.invoice_number,
          invoice.po_number,
          invoice.currency,
          invoice.total,
          invoice.invoice_date,
          invoice.due_date,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "due_date_old_to_new": {
          const aDate = a.due_date || "9999-12-31";
          const bDate = b.due_date || "9999-12-31";
          return aDate.localeCompare(bDate);
        }
        case "due_date_new_to_old": {
          const aDate = a.due_date || "0000-01-01";
          const bDate = b.due_date || "0000-01-01";
          return bDate.localeCompare(aDate);
        }
        case "supplier_az":
          return (a.supplier || "").localeCompare(b.supplier || "");
        case "supplier_za":
          return (b.supplier || "").localeCompare(a.supplier || "");
        case "value_desc":
          return (b.total || 0) - (a.total || 0);
        case "value_asc":
          return (a.total || 0) - (b.total || 0);
        default:
          return 0;
      }
    });
  }, [
    invoices,
    searchTerm,
    supplierFilter,
    paymentStatusFilter,
    currencyFilter,
    dueStatusFilter,
    sortBy,
  ]);

  useEffect(() => {
    if (!invoices.length) {
      setSelectedInvoiceId(null);
      return;
    }

    if (selectedInvoiceId && invoices.some((i) => i.id === selectedInvoiceId)) {
      return;
    }

    setSelectedInvoiceId(invoices[0].id);
  }, [invoices, selectedInvoiceId]);

  const selectedInvoice = useMemo(() => {
    if (!selectedInvoiceId) return null;
    return invoices.find((i) => i.id === selectedInvoiceId) || null;
  }, [invoices, selectedInvoiceId]);

  async function getAccessToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("You must be logged in.");
    }

    return session.access_token;
  }

  async function updateInvoice(id: string, field: string, value: any) {
    const previousInvoices = invoices;

    setInvoices((prev) =>
      prev.map((inv) => (inv.id === id ? { ...inv, [field]: value } : inv))
    );

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/invoices/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id,
          [field]: value,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Update failed");
      }

      if (body.invoice) {
        setInvoices((prev) =>
          prev.map((inv) => (inv.id === id ? { ...inv, ...body.invoice } : inv))
        );
      }
    } catch (e) {
      setInvoices(previousInvoices);
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  function handleViewInvoice(id: string) {
    setSelectedInvoiceId(id);

    requestAnimationFrame(() => {
      setTimeout(() => {
        selectedPanelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    const visibleIds = filteredAndSortedInvoices.map((i) => i.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length) return;

    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected invoice(s)?`
    );
    if (!confirmed) return;

    setDeleting(true);

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/invoices/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invoiceIds: selectedIds }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Delete failed");

      setInvoices((prev) => prev.filter((inv) => !selectedIds.includes(inv.id)));
      setSelectedIds([]);

      if (selectedInvoiceId && selectedIds.includes(selectedInvoiceId)) {
        setSelectedInvoiceId(null);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function setPaidStatus(isPaid: boolean) {
    if (!selectedIds.length) return;

    if (isPaid) setMarkingPaid(true);
    else setMarkingUnpaid(true);

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/invoices/mark-paid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invoiceIds: selectedIds, isPaid }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Update failed");

      setInvoices((prev) =>
        prev.map((inv) =>
          selectedIds.includes(inv.id) ? { ...inv, is_paid: isPaid } : inv
        )
      );
      setSelectedIds([]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setMarkingPaid(false);
      setMarkingUnpaid(false);
    }
  }

  function clearFilters() {
    setSearchTerm("");
    setSupplierFilter("all");
    setPaymentStatusFilter("all");
    setCurrencyFilter("all");
    setDueStatusFilter("all");
    setSortBy("due_date_old_to_new");
  }

  function exportToCSV() {
    if (!filteredAndSortedInvoices.length) {
      alert("No invoices to export");
      return;
    }

    const headers = [
      "File",
      "Supplier",
      "Invoice Number",
      "PO Number",
      "Issue Date",
      "Due Date",
      "Currency",
      "Total",
      "Payment Status",
    ];

    const rows = filteredAndSortedInvoices.map((inv) => [
      inv.file_name || "",
      inv.supplier || "",
      inv.invoice_number || "",
      inv.po_number || "",
      inv.invoice_date || "",
      inv.due_date || "",
      inv.currency || "",
      inv.total ?? "",
      inv.is_paid ? "Paid" : "Unpaid",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "invoices_export.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PayLinkSettings onSaved={setPayLinkUrl} />
      <NotificationSettings />
      <RecipientSettings />

      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Filter and sort invoices</h2>
          <p className="mt-1 text-sm text-slate-600">
            Narrow down the invoice list by supplier, payment status, currency,
            due status, and sorting preferences.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search supplier, invoice #, PO no., file name..."
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Filter by supplier
              </label>
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="all">All suppliers</option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier} value={supplier}>
                    {supplier}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Filter by payment status
              </label>
              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Filter by currency
              </label>
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="all">All currencies</option>
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Filter by due status
              </label>
              <select
                value={dueStatusFilter}
                onChange={(e) => setDueStatusFilter(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="future">Due in future</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Sort by
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="due_date_old_to_new">Due date (old to new)</option>
                <option value="due_date_new_to_old">Due date (new to old)</option>
                <option value="supplier_az">Supplier A–Z</option>
                <option value="supplier_za">Supplier Z–A</option>
                <option value="value_desc">Value high to low</option>
                <option value="value_asc">Value low to high</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Clear filters
            </button>

            <button
              type="button"
              onClick={exportToCSV}
              className="rounded-xl border bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              Export CSV
            </button>

            <span className="text-xs text-slate-500">
              Exports all invoices currently shown in the table (filters & sorting applied)
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPaidStatus(true)}
          disabled={!selectedIds.length || markingPaid || markingUnpaid}
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-700 disabled:opacity-50"
        >
          {markingPaid ? "Marking..." : `Mark as paid (${selectedIds.length})`}
        </button>

        <button
          type="button"
          onClick={() => setPaidStatus(false)}
          disabled={!selectedIds.length || markingPaid || markingUnpaid}
          className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-700 disabled:opacity-50"
        >
          {markingUnpaid ? "Updating..." : `Mark as unpaid (${selectedIds.length})`}
        </button>

        <button
          type="button"
          onClick={deleteSelected}
          disabled={!selectedIds.length || deleting}
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 disabled:opacity-50"
        >
          {deleting ? "Deleting..." : `Delete selected (${selectedIds.length})`}
        </button>
      </div>

      <InvoiceTable
        invoices={filteredAndSortedInvoices}
        selectedIds={selectedIds}
        selectedInvoiceId={selectedInvoiceId}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onViewInvoice={handleViewInvoice}
        payLinkUrl={payLinkUrl}
      />

      <div ref={selectedPanelRef}>
        <SelectedInvoicePanel
          invoice={selectedInvoice}
          onUpdate={updateInvoice}
        />
      </div>

      {selectedInvoice && (
        <PdfViewer
          invoiceId={selectedInvoice.id}
          fileName={selectedInvoice.file_name || null}
        />
      )}
    </div>
  );
}