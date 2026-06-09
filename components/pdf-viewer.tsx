"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Props = {
  invoiceId: string | null;
};

export function PdfViewer({ invoiceId }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!invoiceId) {
      setPdfUrl(null);
      setFileName("");
      setError("");
      return;
    }

    const currentInvoiceId = invoiceId;
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError("");
      setPdfUrl(null);

      try {
        const firstSessionResult = await supabase.auth.getSession();
        let accessToken = firstSessionResult.data.session?.access_token ?? null;

        if (!accessToken) {
          await new Promise((resolve) => setTimeout(resolve, 200));

          const secondSessionResult = await supabase.auth.getSession();
          accessToken = secondSessionResult.data.session?.access_token ?? null;
        }

        if (!accessToken) {
          throw new Error("Your session has expired. Please sign in again.");
        }

        const res = await fetch(
          `/api/invoices/view?invoiceId=${encodeURIComponent(currentInvoiceId)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
          }
        );

        const contentType = res.headers.get("content-type") || "";
        let body: any = null;

        if (contentType.includes("application/json")) {
          try {
            body = await res.json();
          } catch {
            body = null;
          }
        } else {
          const text = await res.text();
          body = text ? { error: text } : null;
        }

        if (!res.ok) {
          throw new Error(
            body?.error ||
              body?.message ||
              `Failed to load PDF (${res.status})`
          );
        }

        if (!body?.url) {
          throw new Error("PDF URL was not returned by the server.");
        }

        if (!cancelled) {
          setPdfUrl(`${body.url}#zoom=156&view=FitH`);
          setFileName(body.fileName || "invoice.pdf");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [invoiceId, retryKey, supabase]);

  return (
    <div className="overflow-hidden rounded-[30px] border border-blue-500/20 bg-slate-950 shadow-2xl shadow-blue-500/10">
      <div className="flex flex-col gap-4 border-b border-slate-800 bg-slate-900 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">
            PDF
          </div>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">
              {fileName || "Invoice preview"}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Original source document for the selected invoice
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRetryKey((prev) => prev + 1)}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Refresh
          </button>

          {pdfUrl ? (
            <>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
              >
                Open in new tab
              </a>

              <a
                href={pdfUrl}
                download={fileName || "invoice.pdf"}
                className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
              >
                Download
              </a>
            </>
          ) : null}
        </div>
      </div>

      <div className="h-[780px] bg-slate-950">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" />
            <div className="mt-4 text-sm font-medium text-white">
              Loading PDF preview
            </div>
            <div className="mt-2 max-w-md text-sm text-slate-400">
              Fetching a secure signed URL for the selected invoice document.
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="max-w-md rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-center">
              <div className="text-base font-semibold text-white">
                PDF preview unavailable
              </div>
              <p className="mt-2 text-sm leading-6 text-rose-100/90">{error}</p>
              <button
                type="button"
                onClick={() => setRetryKey((prev) => prev + 1)}
                className="mt-4 rounded-2xl border border-rose-500/30 px-4 py-2.5 text-sm font-medium text-rose-100 transition hover:bg-rose-500/10"
              >
                Try again
              </button>
            </div>
          </div>
        ) : pdfUrl ? (
          <iframe
            src={pdfUrl}
            className="h-full w-full"
            title={fileName || "Invoice PDF"}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-md">
              <div className="text-base font-semibold text-white">
                No PDF available
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                Select an invoice from the workspace above to open the original
                PDF here.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}