"use client";

import { useState } from "react";

export function NotificationSettings() {
  const [email, setEmail] = useState("");
  const [time, setTime] = useState("08:00");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          time,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Save failed");
      }

      setMessage("Notification settings saved");
    } catch (e) {
      setMessage("Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">Payment reminders</h2>

      <div className="mt-4 space-y-3">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border px-4 py-3 text-sm"
        />

        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-full rounded-xl border px-4 py-3 text-sm"
        />

        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-slate-900 px-5 py-3 text-white"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>

        {message && (
          <p className="text-sm text-slate-600">{message}</p>
        )}
      </div>
    </div>
  );
}