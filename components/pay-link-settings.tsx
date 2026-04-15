"use client";

import { useEffect, useState } from "react";

type Props = {
  onSaved?: (url: string) => void;
};

export function PayLinkSettings({ onSaved }: Props) {
  const [payLinkUrl, setPayLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings/pay-link");
        const text = await res.text();

        let body: any = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          throw new Error("Could not load payment link settings.");
        }

        if (!res.ok) {
          throw new Error(body.error || "Could not load settings");
        }

        setPayLinkUrl(body.pay_link_url || "");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Could not load settings");
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function saveSettings() {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/settings/pay-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payLinkUrl }),
      });

      const text = await res.text();

      let body: any = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("Could not save payment link settings.");
      }

      if (!res.ok) {
        throw new Error(body.error || "Could not save settings");
      }

      setMessage("Pay link saved");
      onSaved?.(payLinkUrl);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">Payment link settings</h2>
      <p className="mt-1 text-sm text-slate-600">
        Set the URL that opens when you click <strong>Go Pay!</strong> on an invoice.
      </p>

      <div className="mt-4 flex flex-col gap-3 md:flex-row">
        <input
          type="url"
          placeholder="https://your-payment-page.com"
          value={payLinkUrl}
          onChange={(e) => setPayLinkUrl(e.target.value)}
          disabled={loading}
          className="w-full rounded-xl border px-4 py-3 text-sm"
        />

        <button
          type="button"
          onClick={saveSettings}
          disabled={saving || loading}
          className="rounded-xl bg-slate-900 px-5 py-3 text-white"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
    </div>
  );
}