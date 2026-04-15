"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InvoiceRecord } from "@/types/invoice";
import { InvoiceTable } from "@/components/invoice-table";
import { PdfViewer } from "@/components/pdf-viewer";
import { PayLinkSettings } from "@/components/pay-link-settings";
import { NotificationSettings } from "@/components/notification-settings";
import { useRouter } from "next/navigation";

function parseLocalDate(date: string | null) {
  if (!date) return null;

  const parts = date.split("-");
  if (parts.length !== 3) return new Date(date);

  const [year, month, day] = parts.map(Number);
  return new Date(year, month - 1, day);
}

function dueStatusOf(invoice: InvoiceRecord) {
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
  if (diffDays <= 7) return "due_soon";
  return "upcoming";
}

export function InvoiceWorkspace({ invoices }: { invoices: InvoiceRecord[] }) {
  const router = useRouter();
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const defaultInvoice = useMemo(() => {
    return invoices.length > 0 ? invoices[0] : null;
  }, [invoices]);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    defaultInvoice?.id || null
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markingUnpaid, setMarkingUnpaid] = useState(false);
  const [payLinkUrl, setPayLinkUrl] = useState("");

  const [supplierFilter, setSupplierFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [dueStatusFilter, setDueStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due_date_asc");

  useEffect(() => {
    if (!selectedInvoiceId && defaultInvoice?.id) {
      setSelectedInvoiceId(defaultInvoice.id);
    }
  }, [defaultInvoice, selectedInvoiceId]);

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

      if (dueStatusFilter === "due_soon" && dueStatus !== "due_soon") {
        return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "due_date_asc": {
          const aDate = a.due_date || "9999-12-31";
          const bDate = b.due_date || "9999-12-31";
          return aDate.localeCompare(bDate);
        }

        case "supplier_asc": {
          return (a.supplier || "").localeCompare(b.supplier || "");
        }

        case "value_desc": {
          return (b.total || 0) - (a.total || 0);
        }

        case "value_asc": {
          return (a.total || 0) - (b.total || 0);
        }

        default:
          return 0;
      }
    });

    return sorted;
  }, [
    invoices,
    supplierFilter,
    paymentStatusFilter,
    currencyFilter,
    dueStatusFilter,
    sortBy,
  ]);

  useEffect(() => {
    if (
      filteredAndSortedInvoices.length > 0 &&
      !filteredAndSortedInvoices.some((x) => x.id === selectedInvoiceId)
    ) {
      setSelectedInvoiceId(filteredAndSortedInvoices[0].id);
    }

    if (filteredAndSortedInvoices.length === 0) {
      setSelectedInvoiceId(null);
    }
  }, [filteredAndSortedInvoices, selectedInvoiceId]);

  const selectedInvoice = useMemo(() => {
    return (
      filteredAndSortedInvoices.find((x) => x.id === selectedInvoiceId) ||
      filteredAndSortedInvoices[0] ||
      null
    );
  }, [filteredAndSortedInvoices, selectedInvoiceId]);

  function toggleSelect(invoiceId: string) {
    setSelectedIds((prev) =>
      prev.includes(invoiceId)
        ? prev.filter((id) => id !== invoiceId)
        : [...prev, invoiceId]
    );
  }

  function toggleSelectAll() {
    const visibleIds = filteredAndSortedInvoices.map((invoice) => invoice.id);
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
      const res = await fetch("/api/invoices/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invoiceIds: selectedIds }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Delete failed");
      }

      setSelectedIds([]);
      setSelectedInvoiceId(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function setPaidStatus(isPaid: boolean) {
    if (!selectedIds.length) return;

    if (isPaid) {
      setMarkingPaid(true);
    } else {
      setMarkingUnpaid(true);
    }

    try {
      const res = await fetch("/api/invoices/mark-paid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invoiceIds: selectedIds, isPaid }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Update failed");
      }

      setSelectedIds([]);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setMarkingPaid(false);
      setMarkingUnpaid(false);
    }
  }

  function handleViewInvoice(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);

    setTimeout(() => {
      viewerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  return (
    <div className="space-y-6">
      <PayLinkSettings onSaved={setPayLinkUrl} />

      {/* ✅ NEW: Notification settings */}
      <NotificationSettings />

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

      {/* Filters */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="all">All suppliers</option>
            {supplierOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="all">All</option>
            <option value="paid">Invoice paid</option>
            <option value="unpaid">Not yet paid</option>
          </select>

          <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="all">All currencies</option>
            {currencyOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select value={dueStatusFilter} onChange={(e) => setDueStatusFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="all">All</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due soon</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="due_date_asc">Due date</option>
            <option value="supplier_asc">Supplier A–Z</option>
            <option value="value_desc">Value high → low</option>
            <option value="value_asc">Value low → high</option>
          </select>
        </div>
      </div>

      <InvoiceTable
        invoices={filteredAndSortedInvoices}
        onViewInvoice={handleViewInvoice}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        payLinkUrl={payLinkUrl}
        selectedInvoiceId={selectedInvoice?.id || null}
      />

      <div ref={viewerRef}>
        <PdfViewer
          invoiceId={selectedInvoice?.id || null}
          fileName={selectedInvoice?.file_name || null}
        />
      </div>
    </div>
  );
}