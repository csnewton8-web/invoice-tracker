"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Props = {
  onSaved?: (payLinkUrl: string) => void;
};

export function PayLinkSettings({ onSaved }: Props) {
  const supabase = createClient();

  const [payLinkUrl, setPayLinkUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  async function loadPayLink() {
    try {
      setLoading(true);
      setError("");

      const token = await getAccessToken();

      const res = await fetch("/api/settings/pay-link", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to load payment link");
      }

      const url = body.pay_link_url || "";
      setPayLinkUrl(url);
      onSaved?.(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payment link");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePayLink(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const trimmedUrl = payLinkUrl.trim();

      if (!trimmedUrl) {
        throw new Error("Please enter a payment link URL.");
      }

      if (
        !trimmedUrl.startsWith("http://") &&
        !trimmedUrl.startsWith("https://")
      ) {
        throw new Error("Payment link must start with http:// or https://");
      }

      const token = await getAccessToken();

      const res = await fetch("/api/settings/pay-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          payLinkUrl: trimmedUrl,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to save payment link");
      }

      setPayLinkUrl(trimmedUrl);
      setSuccess("Payment link saved");
      onSaved?.(trimmedUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save payment link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 text-slate-950 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-slate-950">
          Payment link settings
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Add the payment page or portal link that appears against invoices in
          the table.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          Loading payment link settings...
        </div>
      ) : (
        <form onSubmit={savePayLink} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Payment link URL
            </label>

            <input
              type="url"
              value={payLinkUrl}
              onChange={(e) => setPayLinkUrl(e.target.value)}
              placeholder="https://your-payment-portal.com/pay"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          {(error || success) && (
            <div className="space-y-2">
              {error ? (
                <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  {success}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save payment link"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}