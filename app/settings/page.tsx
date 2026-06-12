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

type ForwardingSender = {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
};

type EmailImport = {
  id: string;
  sender_email: string | null;
  from_email: string | null;
  subject: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  status: string;
  rejection_reason: string | null;
  invoice_id: string | null;
  created_at: string;
  processed_at: string | null;
};

type SettingsTab = "workspace" | "forwarding";

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid server response");
  }
}

function getImportStatusClass(status: string) {
  switch (status) {
    case "imported":
      return "bg-green-500/10 text-green-300 border-green-500/30";
    case "duplicate":
      return "bg-yellow-500/10 text-yellow-300 border-yellow-500/30";
    case "failed":
    case "rejected":
    case "unknown_sender":
      return "bg-red-500/10 text-red-300 border-red-500/30";
    case "no_pdf":
      return "bg-slate-500/10 text-slate-300 border-slate-500/30";
    default:
      return "bg-blue-500/10 text-blue-300 border-blue-500/30";
  }
}

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [name, setName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [forwardingSenders, setForwardingSenders] = useState<ForwardingSender[]>([]);
  const [emailImports, setEmailImports] = useState<EmailImport[]>([]);
  const [newForwardingEmail, setNewForwardingEmail] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forwardingBusy, setForwardingBusy] = useState(false);

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      window.location.href = "/login";
      return null;
    }

    return session.access_token;
  }

  async function loadForwardingSenders(accessToken: string) {
    const res = await fetch("/api/settings/forwarding-senders", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const body = await readJsonResponse(res);

    if (!res.ok) {
      throw new Error(body?.error || "Failed to load forwarding addresses");
    }

    setForwardingSenders(body?.senders || []);
  }

  async function loadEmailImports(accessToken: string) {
    const res = await fetch("/api/email-imports", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const body = await readJsonResponse(res);

    if (!res.ok) {
      throw new Error(body?.error || "Failed to load email imports");
    }

    setEmailImports(body?.imports || []);
  }

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setMessage(null);

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        const res = await fetch("/api/settings/company", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });

        const body = await readJsonResponse(res);

        if (!res.ok) {
          throw new Error(body?.error || "Failed to load settings");
        }

        setCompany(body?.company || null);
        setName(body?.company?.name || "");
        setBillingEmail(body?.company?.billing_email || "");

        await Promise.all([
          loadForwardingSenders(accessToken),
          loadEmailImports(accessToken),
        ]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function saveSettings() {
    setSaving(true);
    setMessage(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
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

  async function addForwardingSender() {
    setForwardingBusy(true);
    setMessage(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/settings/forwarding-senders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email: newForwardingEmail }),
      });

      const body = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(body?.error || "Failed to add forwarding address");
      }

      setForwardingSenders((prev) => [body.sender, ...prev]);
      setNewForwardingEmail("");

      await loadEmailImports(accessToken);

      setMessage({
        type: "success",
        text: "Forwarding address added.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to add forwarding address",
      });
    } finally {
      setForwardingBusy(false);
    }
  }

  async function removeForwardingSender(id: string) {
    setForwardingBusy(true);
    setMessage(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/settings/forwarding-senders", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id }),
      });

      const body = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(body?.error || "Failed to remove forwarding address");
      }

      setForwardingSenders((prev) => prev.filter((sender) => sender.id !== id));

      setMessage({
        type: "success",
        text: "Forwarding address removed.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to remove forwarding address",
      });
    } finally {
      setForwardingBusy(false);
    }
  }

  const cardBase =
    "rounded-2xl border p-5 text-left transition hover:border-slate-700 hover:bg-slate-800";
  const activeCard = "border-blue-500/30 bg-blue-500/10";
  const inactiveCard = "border-slate-800 bg-slate-900";

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
                Manage your FlashFox workspace identity, billing contact, team
                access, and invoice forwarding.
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
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Link href="/settings/team" className={`${cardBase} ${inactiveCard}`}>
                <div className="text-sm font-medium text-white">Team settings</div>
                <div className="mt-2 text-sm text-slate-400">
                  Invite users and manage roles.
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setActiveTab("workspace")}
                className={`${cardBase} ${
                  activeTab === "workspace" ? activeCard : inactiveCard
                }`}
              >
                <div className="text-sm font-medium text-white">Workspace</div>
                <div className="mt-2 text-sm text-slate-400">
                  Edit company name and billing email.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("forwarding")}
                className={`${cardBase} ${
                  activeTab === "forwarding" ? activeCard : inactiveCard
                }`}
              >
                <div className="text-sm font-medium text-white">
                  Email Import
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  Forward supplier invoices directly into FlashFox.
                </div>
              </button>
            </div>

            {activeTab === "workspace" ? (
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[30px] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/10">
                  <div className="text-sm uppercase tracking-[0.14em] text-slate-500">
                    Workspace identity
                  </div>

                  <h2 className="mt-3 text-2xl font-semibold text-white">
                    {company?.name || "FlashFox workspace"}
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    This name appears in your workspace header, billing page, and
                    payment reminder emails.
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
            ) : (
              <div className="rounded-[30px] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/10">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-sm uppercase tracking-[0.14em] text-slate-500">
                      Email Import
                    </div>

                    <h2 className="mt-3 text-2xl font-semibold text-white">
                      Forward invoices into FlashFox
                    </h2>

                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                      Automatically import supplier invoices from your accounts
                      inbox. Add the email addresses that are allowed to forward
                      invoices into this workspace.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                    Forward to:{" "}
                    <span className="font-semibold text-white">
                      invoices@flashfox.co.uk
                    </span>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-sm font-semibold text-white">
                    How automatic capture works
                  </div>

                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-400">
                    <li>Add your accounts email address below.</li>
                    <li>
                      Create an Outlook or Gmail rule to forward invoice emails to{" "}
                      <span className="font-medium text-white">
                        invoices@flashfox.co.uk
                      </span>
                      .
                    </li>
                    <li>
                      FlashFox receives the email, checks the sender is approved,
                      and imports invoice PDFs automatically.
                    </li>
                    <li>Exact duplicate PDFs are blocked and recorded below.</li>
                  </ol>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto]">
                  <input
                    type="email"
                    value={newForwardingEmail}
                    onChange={(e) => setNewForwardingEmail(e.target.value)}
                    placeholder="accounts@company.com"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                  />

                  <button
                    type="button"
                    onClick={addForwardingSender}
                    disabled={forwardingBusy || !newForwardingEmail.trim()}
                    className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {forwardingBusy ? "Saving..." : "Add address"}
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  {forwardingSenders.length ? (
                    forwardingSenders.map((sender) => (
                      <div
                        key={sender.id}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="font-medium text-white">{sender.email}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {sender.is_active
                              ? "Active forwarding address"
                              : "Inactive"}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeForwardingSender(sender.id)}
                          disabled={forwardingBusy}
                          className="rounded-xl border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                      No forwarding addresses have been added yet.
                    </div>
                  )}
                </div>

                <div className="mt-10">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        Recent Email Imports
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        See what happened to emails forwarded into FlashFox.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        const accessToken = await getAccessToken();
                        if (accessToken) {
                          await loadEmailImports(accessToken);
                        }
                      }}
                      className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
                    >
                      Refresh history
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-950">
                        <tr>
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-left">Attachment</th>
                          <th className="px-4 py-3 text-left">Result</th>
                        </tr>
                      </thead>

                      <tbody>
                        {emailImports.length ? (
                          emailImports.map((item) => (
                            <tr key={item.id} className="border-t border-slate-800">
                              <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                                {new Date(item.created_at).toLocaleString()}
                              </td>

                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full border px-2 py-1 text-xs font-medium ${getImportStatusClass(
                                    item.status
                                  )}`}
                                >
                                  {item.status}
                                </span>
                              </td>

                              <td className="px-4 py-3 text-white">
                                {item.attachment_name || "-"}
                              </td>

                              <td className="px-4 py-3 text-slate-300">
                                {item.rejection_reason ||
                                  (item.invoice_id
                                    ? "Invoice imported successfully"
                                    : "Processed")}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-4 py-6 text-center text-slate-500"
                            >
                              No email imports yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}