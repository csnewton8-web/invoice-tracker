"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  if (diffDays === 0) return "due";
  return "future";
}

function formatCurrency(total?: number | null, currency?: string | null) {
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

type Props = {
  invoices: InvoiceRecord[];
  remindersLocked?: boolean;
};

type InvoiceViewTab = "active" | "paid" | "all";

type ToastState = {
  id: number;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
};

type PendingAction =
  | null
  | {
      type: "delete";
      title: string;
      description: string;
      confirmLabel: string;
    };

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastState[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-50 flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => {
        const tone =
          toast.type === "success"
            ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-50"
            : toast.type === "error"
              ? "border-rose-500/30 bg-rose-500/12 text-rose-50"
              : "border-sky-500/30 bg-sky-500/12 text-sky-50";

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${tone}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{toast.title}</div>
                {toast.message ? (
                  <div className="mt-1 text-sm opacity-90">{toast.message}</div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="rounded-lg px-2 py-1 text-xs opacity-80 transition hover:bg-white/10 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConfirmDialog({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: PendingAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!action) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50">
        <div className="inline-flex rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-rose-200">
          Confirm action
        </div>

        <h3 className="mt-4 text-xl font-semibold text-white">{action.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {action.description}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-2xl border border-rose-500/30 bg-rose-500/12 px-4 py-3 text-sm font-medium text-rose-100 transition hover:bg-rose-500/18 disabled:opacity-50"
          >
            {busy ? "Working..." : action.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InvoiceWorkspace({
  invoices: initialInvoices,
  remindersLocked = false,
}: Props) {
  const selectedPanelRef = useRef<HTMLDivElement | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const [invoices, setInvoices] = useState(initialInvoices);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    initialInvoices[0]?.id || null
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [payLinkUrl, setPayLinkUrl] = useState("");

  const [deleting, setDeleting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markingUnpaid, setMarkingUnpaid] = useState(false);

  const [invoiceViewTab, setInvoiceViewTab] =
    useState<InvoiceViewTab>("active");
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [dueStatusFilter, setDueStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due_date_old_to_new");

  const [showFilters, setShowFilters] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const loadPayLink = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const res = await fetch("/api/settings/pay-link", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to load payment link");
      }

      setPayLinkUrl(body.pay_link_url || "");
    } catch (error) {
      console.error("Failed to load pay link:", error);
    }
  }, [supabase]);

  useEffect(() => {
    setInvoices(initialInvoices);
    loadPayLink();
  }, [initialInvoices, loadPayLink]);

  function pushToast(toast: Omit<ToastState, "id">) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { ...toast, id }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }

  const tabCounts = useMemo(() => {
    const paid = invoices.filter((invoice) => invoice.is_paid).length;
    const active = invoices.filter((invoice) => !invoice.is_paid).length;
    return {
      active,
      paid,
      all: invoices.length,
    };
  }, [invoices]);

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
      if (invoiceViewTab === "active" && invoice.is_paid) return false;
      if (invoiceViewTab === "paid" && !invoice.is_paid) return false;

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

      if (dueStatusFilter === "due" && dueStatus !== "due") {
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
    invoiceViewTab,
    searchTerm,
    supplierFilter,
    paymentStatusFilter,
    currencyFilter,
    dueStatusFilter,
    sortBy,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedInvoices.length / pageSize)
  );

  const paginatedInvoices = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedInvoices.slice(start, start + pageSize);
  }, [filteredAndSortedInvoices, currentPage, pageSize, totalPages]);

  const pageStart =
    filteredAndSortedInvoices.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(
    currentPage * pageSize,
    filteredAndSortedInvoices.length
  );

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [
    invoiceViewTab,
    pageSize,
    searchTerm,
    supplierFilter,
    paymentStatusFilter,
    currencyFilter,
    dueStatusFilter,
    sortBy,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!filteredAndSortedInvoices.length) {
      setSelectedInvoiceId(null);
      return;
    }

    if (
      selectedInvoiceId &&
      filteredAndSortedInvoices.some((i) => i.id === selectedInvoiceId)
    ) {
      return;
    }

    setSelectedInvoiceId(filteredAndSortedInvoices[0].id);
  }, [filteredAndSortedInvoices, selectedInvoiceId]);

  const selectedInvoice = useMemo(() => {
    if (!selectedInvoiceId) return null;
    return invoices.find((i) => i.id === selectedInvoiceId) || null;
  }, [invoices, selectedInvoiceId]);

  const summary = useMemo(() => {
    const total = filteredAndSortedInvoices.length;
    const paid = filteredAndSortedInvoices.filter((invoice) => invoice.is_paid)
      .length;
    const unpaid = filteredAndSortedInvoices.filter((invoice) => !invoice.is_paid)
      .length;
    const overdue = filteredAndSortedInvoices.filter(
      (invoice) => dueStatusOf(invoice) === "overdue"
    ).length;

    return { total, paid, unpaid, overdue };
  }, [filteredAndSortedInvoices]);

  const totalVisibleValue = useMemo(() => {
    return filteredAndSortedInvoices.reduce((sum, invoice) => {
      return sum + (typeof invoice.total === "number" ? invoice.total : 0);
    }, 0);
  }, [filteredAndSortedInvoices]);

  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm.trim() !== "" ||
      supplierFilter !== "all" ||
      paymentStatusFilter !== "all" ||
      currencyFilter !== "all" ||
      dueStatusFilter !== "all" ||
      sortBy !== "due_date_old_to_new"
    );
  }, [
    searchTerm,
    supplierFilter,
    paymentStatusFilter,
    currencyFilter,
    dueStatusFilter,
    sortBy,
  ]);

  const layoutClassName = useMemo(() => {
    if (showFilters && showTools) {
      return "grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_340px]";
    }

    if (showFilters && !showTools) {
      return "grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]";
    }

    if (!showFilters && showTools) {
      return "grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]";
    }

    return "grid gap-6";
  }, [showFilters, showTools]);

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

  async function updateInvoice(id: string, field: string, value: unknown) {
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

      pushToast({
        type: "success",
        title: "Invoice updated",
        message: "Your changes were saved successfully.",
      });
    } catch (e) {
      setInvoices(previousInvoices);
      pushToast({
        type: "error",
        title: "Update failed",
        message: e instanceof Error ? e.message : "Invoice update failed.",
      });
    }
  }

  function handleViewInvoice(id: string) {
    setSelectedInvoiceId(id);

    setTimeout(() => {
      selectedPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    const visibleIds = paginatedInvoices.map((i) => i.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  function requestDeleteSelected() {
    if (!selectedIds.length) return;

    setPendingAction({
      type: "delete",
      title: `Delete ${selectedIds.length} selected invoice${
        selectedIds.length === 1 ? "" : "s"
      }?`,
      description:
        "This will permanently remove the selected invoices from your workspace and delete their stored PDF files.",
      confirmLabel: "Delete invoices",
    });
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;

    if (pendingAction.type === "delete") {
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

        if (!res.ok) {
          throw new Error(body.error || "Delete failed");
        }

        const deletedIds = new Set(selectedIds);

        setInvoices((prev) => prev.filter((inv) => !deletedIds.has(inv.id)));
        setSelectedIds([]);

        if (selectedInvoiceId && deletedIds.has(selectedInvoiceId)) {
          setSelectedInvoiceId(null);
        }

        pushToast({
          type: "success",
          title: "Invoices deleted",
          message: "The selected invoices were removed successfully.",
        });
      } catch (e) {
        pushToast({
          type: "error",
          title: "Delete failed",
          message: e instanceof Error ? e.message : "Delete failed.",
        });
      } finally {
        setDeleting(false);
        setPendingAction(null);
      }
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

      pushToast({
        type: "success",
        title: isPaid ? "Invoices marked as paid" : "Invoices marked as unpaid",
        message: `${selectedIds.length} invoice${
          selectedIds.length === 1 ? "" : "s"
        } updated.`,
      });
    } catch (e) {
      pushToast({
        type: "error",
        title: "Bulk update failed",
        message: e instanceof Error ? e.message : "Invoice update failed.",
      });
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

    pushToast({
      type: "info",
      title: "Filters cleared",
      message: "Showing the current invoice tab again.",
    });
  }

  function exportToCSV() {
    if (!filteredAndSortedInvoices.length) {
      pushToast({
        type: "info",
        title: "Nothing to export",
        message: "Adjust your filters or upload invoices to export a CSV.",
      });
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
    link.download = "flashfox-invoices.csv";
    link.click();

    URL.revokeObjectURL(url);

    pushToast({
      type: "success",
      title: "CSV exported",
      message: "Your invoice export has been downloaded.",
    });
  }

  const selectedInvoiceTotal = formatCurrency(
    selectedInvoice?.total,
    selectedInvoice?.currency
  );

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <ConfirmDialog
        action={pendingAction}
        busy={deleting}
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
      />

      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/10">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Visible invoices
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {summary.total}
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Filtered results currently in view.
            </p>
          </div>

          <div className="rounded-[28px] border border-blue-500/30 bg-blue-500/10 p-5 shadow-2xl shadow-blue-500/10">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-blue-200">
              Unpaid
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {summary.unpaid}
            </div>
            <p className="mt-2 text-sm text-blue-100/85">
              Open invoices still awaiting payment.
            </p>
          </div>

          <div className="rounded-[28px] border border-emerald-500/30 bg-emerald-500/10 p-5 shadow-2xl shadow-emerald-500/10">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-200">
              Paid
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {summary.paid}
            </div>
            <p className="mt-2 text-sm text-emerald-100/85">
              Cleared invoices in the current view.
            </p>
          </div>

          <div className="rounded-[28px] border border-rose-500/30 bg-rose-500/10 p-5 shadow-2xl shadow-rose-500/10">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-rose-200">
              Overdue
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {summary.overdue}
            </div>
            <p className="mt-2 text-sm text-rose-100/85">
              Unpaid invoices past their due date.
            </p>
          </div>

          <div className="rounded-[28px] border border-violet-500/30 bg-violet-500/10 p-5 shadow-2xl shadow-violet-500/10">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-violet-200">
              Visible value
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {formatCurrency(
                totalVisibleValue,
                selectedInvoice?.currency || "GBP"
              )}
            </div>
            <p className="mt-2 text-sm text-violet-100/85">
              Combined total of invoices in the current result set.
            </p>
          </div>
        </div>

        <div className={layoutClassName}>
          {showFilters ? (
            <aside className="space-y-4">
              <div className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900 shadow-2xl shadow-black/10">
                <button
                  type="button"
                  onClick={() => setShowFilters((prev) => !prev)}
                  className="flex w-full items-center justify-between border-b border-slate-800 px-5 py-4 text-left transition hover:bg-slate-800/70"
                >
                  <div>
                    <div className="text-base font-semibold text-white">
                      Filters
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      Refine the workspace without losing context.
                    </div>
                  </div>

                  <div className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
                    Visible
                  </div>
                </button>

                <div className="space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Filter set
                    </div>
                    {hasActiveFilters ? (
                      <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-xs font-medium text-blue-200">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-300">
                        Default
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Search
                    </label>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Supplier, invoice #, PO..."
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Supplier
                    </label>
                    <select
                      value={supplierFilter}
                      onChange={(e) => setSupplierFilter(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
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
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Payment status
                    </label>
                    <select
                      value={paymentStatusFilter}
                      onChange={(e) => setPaymentStatusFilter(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="all">All</option>
                      <option value="paid">Paid</option>
                      <option value="unpaid">Unpaid</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Currency
                    </label>
                    <select
                      value={currencyFilter}
                      onChange={(e) => setCurrencyFilter(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
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
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Due status
                    </label>
                    <select
                      value={dueStatusFilter}
                      onChange={(e) => setDueStatusFilter(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="all">All</option>
                      <option value="overdue">Overdue</option>
                      <option value="due">Due today</option>
                      <option value="future">Due in future</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Sort by
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="due_date_old_to_new">
                        Due date: old to new
                      </option>
                      <option value="due_date_new_to_old">
                        Due date: new to old
                      </option>
                      <option value="supplier_az">Supplier: A to Z</option>
                      <option value="supplier_za">Supplier: Z to A</option>
                      <option value="value_desc">Value: high to low</option>
                      <option value="value_asc">Value: low to high</option>
                    </select>
                  </div>

                  <div className="grid gap-2 pt-2">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
                    >
                      Clear filters
                    </button>

                    <button
                      type="button"
                      onClick={exportToCSV}
                      className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}

          <main className="min-w-0 space-y-6">
            <div className="overflow-hidden rounded-[30px] border border-blue-500/20 bg-slate-900 shadow-2xl shadow-blue-500/10">
              <div className="border-b border-slate-800 px-6 py-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
                      Workspace
                    </div>

                    <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
                      Review invoices with a cleaner, faster workflow
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Select invoices, update payment status, edit extracted
                      fields, and review the source PDF below the selected
                      invoice details.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                    {selectedIds.length > 0 ? (
                      <span>
                        <span className="font-semibold text-white">
                          {selectedIds.length}
                        </span>{" "}
                        selected
                      </span>
                    ) : selectedInvoice ? (
                      <span>
                        Selected invoice total:{" "}
                        <span className="font-semibold text-white">
                          {selectedInvoiceTotal}
                        </span>
                      </span>
                    ) : (
                      <span>
                        <span className="font-semibold text-white">
                          {filteredAndSortedInvoices.length}
                        </span>{" "}
                        visible invoice
                        {filteredAndSortedInvoices.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {(["active", "paid", "all"] as InvoiceViewTab[]).map((tab) => {
                    const isActive = invoiceViewTab === tab;
                    const label =
                      tab === "active"
                        ? "Active"
                        : tab === "paid"
                          ? "Paid"
                          : "All";

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setInvoiceViewTab(tab)}
                        className={`rounded-full border px-4 py-2.5 text-sm font-medium transition ${
                          isActive
                            ? "border-blue-400 bg-blue-500/10 text-blue-200 shadow-lg shadow-blue-500/10"
                            : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {label}{" "}
                        <span className="ml-1 text-xs opacity-75">
                          {tabCounts[tab]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  id="invoice-filters"
                  className="mt-5 flex flex-wrap gap-3 scroll-mt-24"
                >
                  <button
                    type="button"
                    onClick={() => setShowFilters((prev) => !prev)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition ${
                      showFilters
                        ? "border-blue-400 bg-blue-500/10 text-blue-200 shadow-lg shadow-blue-500/10"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        showFilters ? "bg-blue-400" : "bg-slate-500"
                      }`}
                    />
                    {showFilters
                      ? "Hide sort and filters"
                      : "Show sort and filters"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTools((prev) => !prev)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition ${
                      showTools
                        ? "border-emerald-400 bg-emerald-500/10 text-emerald-200 shadow-lg shadow-emerald-500/10"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        showTools ? "bg-emerald-400" : "bg-slate-500"
                      }`}
                    />
                    {showTools
                      ? "Hide pay link, reminders and recipients"
                      : "Show pay link, reminders and recipients"}
                  </button>

                  <button
                    type="button"
                    onClick={requestDeleteSelected}
                    disabled={deleting || !selectedIds.length}
                    className="rounded-full border border-rose-500/30 px-4 py-2.5 text-sm font-medium text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {deleting ? "Deleting..." : "Delete selected"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaidStatus(true)}
                    disabled={markingPaid || !selectedIds.length}
                    className="rounded-full border border-emerald-500/30 px-4 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {markingPaid ? "Updating..." : "Mark selected as paid"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaidStatus(false)}
                    disabled={markingUnpaid || !selectedIds.length}
                    className="rounded-full border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {markingUnpaid ? "Updating..." : "Mark selected as unpaid"}
                  </button>
                </div>
              </div>

              <div className="p-4 md:p-5">
                <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
                  <div>
                    Showing{" "}
                    <span className="font-semibold text-white">{pageStart}</span>
                    {"–"}
                    <span className="font-semibold text-white">{pageEnd}</span>{" "}
                    of{" "}
                    <span className="font-semibold text-white">
                      {filteredAndSortedInvoices.length}
                    </span>{" "}
                    invoices
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2">
                      <span>Rows</span>
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage <= 1}
                      className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Previous
                    </button>

                    <span className="text-slate-300">
                      Page{" "}
                      <span className="font-semibold text-white">
                        {currentPage}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-white">
                        {totalPages}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage((page) => Math.min(totalPages, page + 1))
                      }
                      disabled={currentPage >= totalPages}
                      className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <InvoiceTable
                  invoices={paginatedInvoices}
                  selectedIds={selectedIds}
                  selectedInvoiceId={selectedInvoiceId}
                  onToggleSelect={toggleSelect}
                  onToggleSelectAll={toggleSelectAll}
                  onViewInvoice={handleViewInvoice}
                  payLinkUrl={payLinkUrl}
                />
              </div>
            </div>

            {selectedInvoice ? (
              <div
                id="invoice-review"
                ref={selectedPanelRef}
                className="space-y-6 scroll-mt-24"
              >
                <SelectedInvoicePanel
                  invoice={selectedInvoice}
                  onUpdate={updateInvoice}
                />
                <PdfViewer invoiceId={selectedInvoice.id} />
              </div>
            ) : (
              <div className="rounded-[28px] border border-slate-800 bg-slate-900 p-10 text-center shadow-2xl shadow-black/10">
                <div className="mx-auto max-w-xl">
                  <div className="inline-flex rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                    No invoice selected
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold text-white">
                    Pick an invoice to open the review workspace
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Select any row from the table above to show the editable
                    invoice details first and the original PDF viewer underneath.
                  </p>
                </div>
              </div>
            )}
          </main>

          {showTools ? (
            <aside id="advanced-tools" className="space-y-4 scroll-mt-24">
              <div className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900 shadow-2xl shadow-black/10">
                <button
                  type="button"
                  onClick={() => setShowTools((prev) => !prev)}
                  className="flex w-full items-center justify-between border-b border-slate-800 px-5 py-4 text-left transition hover:bg-slate-800/70"
                >
                  <div>
                    <div className="text-base font-semibold text-white">
                      Advanced tools
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      Payment links, reminders, and recipients.
                    </div>
                  </div>

                  <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                    Visible
                  </div>
                </button>

                <div className="space-y-6 p-5">
                  <div id="payment-link" className="scroll-mt-24">
                    <PayLinkSettings onSaved={setPayLinkUrl} />
                  </div>

                  {remindersLocked ? (
                    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
                      <div className="text-base font-semibold text-white">
                        Reminder features are locked because you have used all
                        10 free invoice uploads
                      </div>
                      <p className="mt-2 text-sm text-sky-100">
                        Upgrade to Starter Plan to keep reminder scheduling and
                        alert recipients active after your 10 free uploads.
                      </p>
                    </div>
                  ) : null}

                  <div id="payment-reminders" className="scroll-mt-24">
                    <NotificationSettings
                      disabled={remindersLocked}
                      upgradeMessage="Payment reminders are included on the free workspace until you reach 10 uploaded invoices. Upgrade to Starter Plan to keep reminders active."
                    />
                  </div>

                  <div id="alert-recipients" className="scroll-mt-24">
                    <RecipientSettings
                      disabled={remindersLocked}
                      upgradeMessage="Alert recipients are included on the free workspace until you reach 10 uploaded invoices. Upgrade to Starter Plan to keep alerts active."
                    />
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </>
  );
}