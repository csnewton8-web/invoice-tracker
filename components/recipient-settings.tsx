"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Recipient = {
  id: string;
  email: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
};

type Props = {
  disabled?: boolean;
  upgradeMessage?: string;
};

function LockNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4">
      <div className="text-sm font-semibold text-slate-900">Alert recipients locked</div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{message}</p>
    </div>
  );
}

export function RecipientSettings({
  disabled = false,
  upgradeMessage = "Alert recipients are included on the free workspace until you reach 10 uploaded invoices. Upgrade to Starter Plan to keep alerts active.",
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyRecipientId, setBusyRecipientId] = useState<string | null>(null);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadRecipients() {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("You must be logged in to manage alert recipients.");
      }

      const res = await fetch("/api/settings/recipients", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to load alert recipients.");
      }

      setRecipients(body.recipients || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load alert recipients."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecipients();
  }, []);

  async function addRecipient() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedName = name.trim();

      if (!trimmedEmail) {
        throw new Error("Email is required.");
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("You must be logged in to add alert recipients.");
      }

      const res = await fetch("/api/settings/recipients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: trimmedEmail,
          name: trimmedName,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to add alert recipient.");
      }

      const newRecipient = body.recipient as Recipient;
      setRecipients((prev) => [newRecipient, ...prev]);
      setEmail("");
      setName("");
      setSuccess("Alert recipient added.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add recipient.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRecipient(recipient: Recipient) {
    setBusyRecipientId(recipient.id);
    setError("");
    setSuccess("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("You must be logged in to update alert recipients.");
      }

      const res = await fetch(`/api/settings/recipients/${recipient.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          is_active: !recipient.is_active,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to update recipient.");
      }

      const updatedRecipient = body.recipient as Recipient;
      setRecipients((prev) =>
        prev.map((item) =>
          item.id === updatedRecipient.id ? updatedRecipient : item
        )
      );

      setSuccess(
        updatedRecipient.is_active
          ? "Recipient enabled."
          : "Recipient disabled."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update recipient.");
    } finally {
      setBusyRecipientId(null);
    }
  }

  async function deleteRecipient(recipient: Recipient) {
    setBusyRecipientId(recipient.id);
    setError("");
    setSuccess("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("You must be logged in to delete alert recipients.");
      }

      const res = await fetch(`/api/settings/recipients/${recipient.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to delete recipient.");
      }

      setRecipients((prev) => prev.filter((item) => item.id !== recipient.id));
      setSuccess("Recipient removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete recipient.");
    } finally {
      setBusyRecipientId(null);
    }
  }

  const activeCount = recipients.filter((r) => r.is_active).length;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Alert recipients
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
          Choose who should receive payment reminder alerts for this workspace.
          Add one or more team members, then enable or disable recipients as
          needed.
        </p>
      </div>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Loading recipients...
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {disabled ? <LockNotice message={upgradeMessage} /> : null}

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold text-slate-900">
                Add a recipient
              </div>
              <p className="text-sm leading-6 text-slate-500">
                Add a person who should receive payment reminder emails for this
                company.
              </p>
            </div>

            <div className="mt-4 grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  disabled={disabled}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={name}
                  disabled={disabled}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Accounts team"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <button
                type="button"
                disabled={disabled || saving}
                onClick={addRecipient}
                className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Adding recipient..." : "Add recipient"}
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Current recipients
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {recipients.length === 0
                    ? "No recipients added yet."
                    : `${activeCount} active recipient${
                        activeCount === 1 ? "" : "s"
                      } out of ${recipients.length}.`}
                </p>
              </div>

              <div className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                {recipients.length} total
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {recipients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                  No alert recipients have been added yet.
                </div>
              ) : (
                recipients.map((recipient) => {
                  const busy = busyRecipientId === recipient.id;

                  return (
                    <div
                      key={recipient.id}
                      className="rounded-2xl border border-slate-300 bg-white p-4"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-base font-semibold text-slate-900">
                              {recipient.name?.trim() || recipient.email}
                            </div>

                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                recipient.is_active
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {recipient.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>

                          {recipient.name?.trim() ? (
                            <div className="mt-1 truncate text-sm text-slate-500">
                              {recipient.email}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            disabled={disabled || busy}
                            onClick={() => toggleRecipient(recipient)}
                            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busy
                              ? "Updating..."
                              : recipient.is_active
                              ? "Disable recipient"
                              : "Enable recipient"}
                          </button>

                          <button
                            type="button"
                            disabled={disabled || busy}
                            onClick={() => deleteRecipient(recipient)}
                            className="w-full rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busy ? "Working..." : "Remove recipient"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}