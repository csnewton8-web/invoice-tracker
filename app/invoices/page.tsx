"use client";

import { useCallback, useEffect, useState } from "react";
import { InvoiceDropzone } from "@/components/invoice-dropzone";
import { InvoiceWorkspace } from "@/components/invoice-workspace";
import { InvoiceRecord } from "@/types/invoice";
import { createClient } from "@/lib/supabase/browser";

export default function InvoicesPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/invoices/list", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to load invoices");
      }

      setInvoices(body.invoices || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  return (
    <main className="min-h-screen bg-neutral-800 p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-100">
            Supplier invoice tracker
          </h1>
          <p className="mt-2 text-slate-400">Signed-in user view</p>
        </div>

        <InvoiceDropzone onUploaded={loadInvoices} />

        {loading && (
          <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600">
            Loading invoices...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <InvoiceWorkspace invoices={invoices as InvoiceRecord[]} />
        )}
      </div>
    </main>
  );
}