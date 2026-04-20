"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Props = {
  invoiceId: string | null;
  fileName?: string | null;
};

export function PdfViewer({ invoiceId, fileName }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function loadPdf() {
      if (!invoiceId) {
        setPdfUrl(null);
        setError("");
        return;
      }

      setLoading(true);
      setError("");
      setPdfUrl(null);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
          throw new Error("You must be logged in to view PDFs.");
        }

        const res = await fetch(
          `/api/invoices/view?invoiceId=${encodeURIComponent(invoiceId)}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        const body = await res.json();

        if (!res.ok) {
          throw new Error(body.error || "Could not load PDF");
        }

        setPdfUrl(`${body.url}#zoom=150`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load PDF");
      } finally {
        setLoading(false);
      }
    }

    loadPdf();
  }, [invoiceId, supabase]);

  return (
    <div className="rounded-2xl border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="text-lg font-semibold">Invoice PDF viewer</h2>
        <p className="mt-1 text-sm text-slate-600">
          {fileName ? `Showing: ${fileName}` : "Select an invoice to view its PDF."}
        </p>
      </div>

      <div className="p-4">
        {!invoiceId && (
          <div className="flex h-[900px] items-center justify-center rounded-xl border border-dashed text-sm text-slate-500">
            No invoice selected.
          </div>
        )}

        {invoiceId && loading && (
          <div className="flex h-[900px] items-center justify-center rounded-xl border border-dashed text-sm text-slate-500">
            Loading PDF...
          </div>
        )}

        {invoiceId && error && (
          <div className="flex h-[900px] items-center justify-center rounded-xl border border-red-200 bg-red-50 text-sm text-red-600">
            {error}
          </div>
        )}

        {invoiceId && pdfUrl && !loading && !error && (
          <iframe
            src={pdfUrl}
            title={fileName || "Invoice PDF"}
            className="h-[900px] w-full rounded-xl border"
          />
        )}
      </div>
    </div>
  );
}