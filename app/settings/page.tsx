"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type CompanySettings = {
  id: string;
  name: string;
  billing_email: string | null;
  invoice_upload_count: number | null;
};

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid server response");
  }
}

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [name, setName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setMessage(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          window.location.href = "/login";
          return;
        }

        const res = await fetch("/api/settings/company", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const body = await readJsonResponse(res);

        if (!res.ok) {
          throw new Error(body?.error || "Failed to load settings");
        }

        setCompany(body?.company || null);
        setName(body?.company?.name || "");
        setBillingEmail(body?.company?.billing_email || "");
      } catch (error) {
        setMessage({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Failed to load settings",
        });
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [supabase]);

  async function saveSettings() {
    setSaving(true);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name,
          billing_email: billingEmail,
        }),
      });

      const body = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(body?.error || "Failed to save settings");
      }

      setCompany(body?.company || company);
      setName(body?.company?.name || name);
      setBillingEmail(body?.company?.billing_email || billingEmail);

      setMessage({
        type: "success",
        text: "Workspace settings saved.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save workspace settings",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020817] px-6 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[32px] border border-slate-800 bg-slate-900 px-6 py-6 shadow-2xl shadow-blue-500/5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
                Workspace settings
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
                Settings
              </h1>

              <p className="mt-2 text-sm text-slate-400">
                Manage your FlashFox workspace identity, billing contact, and
                team access.
              </p>
            </div>

            <Link
              href="/invoices"
              className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Back to workspace
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href="/settings/team"
            className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-700 hover:bg-slate-800"
          >
            <div className="text-sm font-medium text-white">
              Team settings
            </div>

            <div className="mt-2 text-sm text-slate-400">
              Invite users and manage roles.
            </div>
          </Link>

          <Link
            href="/settings"
            className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5 transition hover:border-blue-400/40 hover:bg-blue-500/15"
          >
            <div className="text-sm font-medium text-white">
              Workspace
            </div>

            <div className="mt-2 text-sm text-slate-400">
              Edit company name and billing email.
            </div>
          </Link>

          <Link
            href="/invoices"
            className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-700 hover:bg-slate-800"
          >
            <div className="text-sm font-medium text-white">
              Invoices
            </div>

            <div className="mt-2 text-sm text-slate-400">
              Return to invoice tracking.
            </div>
          </Link>
        </div>

        {message ? (
          <div
            className={
              message.type === "success"
                ? "rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"
                : "rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
            }
          >
            {message.text}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            Loading settings...
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[30px] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/10">
              <div className="text-sm uppercase tracking-[0.14em] text-slate-500">
                Workspace identity
              </div>

              <h2 className="mt-3 text-2xl font-semibold text-white">
                {company?.name || "FlashFox workspace"}
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-400">
                This name appears in your workspace header, billing page, and can
                be used later in payment reminder emails.
              </p>

              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                  Workspace ID:{" "}
                  <span className="font-medium text-white">
                    {company?.id
                      ? `FFX-${company.id
                          .replace(/-/g, "")
                          .slice(0, 8)
                          .toUpperCase()}`
                      : "—"}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                  Lifetime invoice uploads:{" "}
                  <span className="font-medium text-white">
                    {company?.invoice_upload_count ?? 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/10">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Company / workspace name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Ltd"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Billing email
                  </label>
                  <input
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    placeholder="accounts@company.com"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving}
                  className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving settings..." : "Save workspace settings"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}