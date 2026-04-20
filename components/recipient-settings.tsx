"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Recipient = {
  id: string;
  email: string;
  name?: string | null;
  is_active: boolean;
  created_at?: string;
};

export function RecipientSettings() {
  const supabase = createClient();

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
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

  async function loadRecipients() {
    try {
      setLoading(true);
      setError("");

      const token = await getAccessToken();

      const res = await fetch("/api/settings/recipients", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to load recipients");
      }

      setRecipients(body.recipients || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recipients");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecipients();
  }, []);

  async function addRecipient(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const token = await getAccessToken();

      const res = await fetch("/api/settings/recipients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          name,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to add recipient");
      }

      setEmail("");
      setName("");
      setSuccess("Recipient saved successfully");
      await loadRecipients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add recipient");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRecipient(recipient: Recipient, isActive: boolean) {
    try {
      setTogglingId(recipient.id);
      setError("");
      setSuccess("");

      const token = await getAccessToken();

      const res = await fetch(`/api/settings/recipients/${recipient.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          is_active: isActive,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to update recipient");
      }

      setRecipients((prev) =>
        prev.map((r) =>
          r.id === recipient.id
            ? { ...r, is_active: body.recipient?.is_active ?? isActive }
            : r
        )
      );

      setSuccess(isActive ? "Recipient activated" : "Recipient deactivated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update recipient");
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteRecipient(recipient: Recipient) {
    const confirmed = window.confirm(
      `Delete ${recipient.email}? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setTogglingId(recipient.id);
      setError("");
      setSuccess("");

      const token = await getAccessToken();

      const res = await fetch(`/api/settings/recipients/${recipient.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to delete recipient");
      }

      setRecipients((prev) => prev.filter((r) => r.id !== recipient.id));
      setSuccess("Recipient deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete recipient");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Alert recipients</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose who receives the daily invoice alert emails for this company.
        </p>
      </div>

      <form onSubmit={addRecipient} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Accounts team"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="accounts@company.com"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl border bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add recipient"}
          </button>
        </div>
      </form>

      {(error || success) && (
        <div className="mt-4 space-y-2">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-wrap">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {success}
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Current recipients
        </h3>

        {loading ? (
          <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-slate-500">
            Loading recipients...
          </div>
        ) : recipients.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-slate-500">
            No recipients added yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id} className="border-t">
                    <td className="px-4 py-3">{recipient.name || "-"}</td>
                    <td className="px-4 py-3">{recipient.email}</td>
                    <td className="px-4 py-3">
                      {recipient.is_active ? (
                        <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {recipient.is_active ? (
                          <button
                            type="button"
                            disabled={togglingId === recipient.id}
                            onClick={() => toggleRecipient(recipient, false)}
                            className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                          >
                            {togglingId === recipient.id ? "Updating..." : "Deactivate"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={togglingId === recipient.id}
                            onClick={() => toggleRecipient(recipient, true)}
                            className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                          >
                            {togglingId === recipient.id ? "Updating..." : "Activate"}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={togglingId === recipient.id}
                          onClick={() => deleteRecipient(recipient)}
                          className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {togglingId === recipient.id ? "Updating..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}