"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

type NotificationSettingsState = {
  enabled: boolean;
  daily_digest_enabled: boolean;
  send_time: string;
  timezone: string;
  send_days: string[];
  due_today_enabled: boolean;
  overdue_enabled: boolean;
  upcoming_enabled: boolean;
  upcoming_days: number;
};

const DEFAULT_SETTINGS: NotificationSettingsState = {
  enabled: true,
  daily_digest_enabled: true,
  send_time: "08:00",
  timezone: "Europe/London",
  send_days: ["mon", "tue", "wed", "thu", "fri"],
  due_today_enabled: true,
  overdue_enabled: true,
  upcoming_enabled: true,
  upcoming_days: 7,
};

function normaliseTimeForInput(value?: string | null) {
  if (!value) return "08:00";
  return value.slice(0, 5);
}

export function NotificationSettings() {
  const supabase = createClient();

  const [settings, setSettings] = useState<NotificationSettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
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

  async function loadSettings() {
    try {
      setLoading(true);
      setError("");

      const token = await getAccessToken();

      const res = await fetch("/api/settings/notifications", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to load payment reminders");
      }

      setSettings({
        enabled: body.enabled ?? true,
        daily_digest_enabled: body.daily_digest_enabled ?? true,
        send_time: normaliseTimeForInput(body.send_time),
        timezone: body.timezone ?? "Europe/London",
        send_days: Array.isArray(body.send_days)
          ? body.send_days
          : ["mon", "tue", "wed", "thu", "fri"],
        due_today_enabled: body.due_today_enabled ?? true,
        overdue_enabled: body.overdue_enabled ?? true,
        upcoming_enabled: body.upcoming_enabled ?? true,
        upcoming_days: body.upcoming_days ?? 7,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payment reminders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function saveSettings() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const token = await getAccessToken();

      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...settings,
          send_time: `${settings.send_time}:00`,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to save payment reminders");
      }

      setSuccess("Payment reminder settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save payment reminders");
    } finally {
      setSaving(false);
    }
  }

  async function sendLatestReminderNow() {
    try {
      setSendingNow(true);
      setError("");
      setSuccess("");

      const token = await getAccessToken();

      const res = await fetch("/api/settings/notifications/send-now", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Failed to send latest reminder");
      }

      setSuccess(
        `Latest reminder sent successfully to ${body.recipients} recipient(s).`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send latest reminder");
    } finally {
      setSendingNow(false);
    }
  }

  function toggleSendDay(day: string) {
    setSettings((prev) => {
      const exists = prev.send_days.includes(day);
      const nextDays = exists
        ? prev.send_days.filter((d) => d !== day)
        : [...prev.send_days, day];

      return {
        ...prev,
        send_days: nextDays.length ? nextDays : [day],
      };
    });
  }

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Payment reminders</h2>
        <p className="mt-1 text-sm text-slate-600">
          Control whether reminder emails are sent, what days they go out, what
          time they are sent, and which invoice groups are included.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-slate-500">
          Loading payment reminder settings...
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <div className="text-sm font-medium text-slate-800">
                  Enable payment reminders
                </div>
                <div className="text-xs text-slate-500">
                  Turn all reminder emails on or off for this company.
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  settings.enabled
                    ? "border border-green-300 bg-green-50 text-green-700"
                    : "border border-slate-300 bg-slate-50 text-slate-700"
                }`}
              >
                {settings.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Send time
                </label>
                <input
                  type="time"
                  value={settings.send_time}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      send_time: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Timezone
                </label>
                <input
                  type="text"
                  value={settings.timezone}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      timezone: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Upcoming window (days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.upcoming_days}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      upcoming_days: Number(e.target.value) || 7,
                    }))
                  }
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Send on these days
              </label>

              <div className="flex flex-wrap gap-2">
                {DAY_OPTIONS.map((day) => {
                  const active = settings.send_days.includes(day.value);

                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleSendDay(day.value)}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        active
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Include these invoice groups
              </label>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.overdue_enabled}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        overdue_enabled: e.target.checked,
                      }))
                    }
                  />
                  Overdue invoices
                </label>

                <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.due_today_enabled}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        due_today_enabled: e.target.checked,
                      }))
                    }
                  />
                  Due today
                </label>

                <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.upcoming_enabled}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        upcoming_enabled: e.target.checked,
                      }))
                    }
                  />
                  Upcoming invoices
                </label>
              </div>
            </div>

            {(error || success) && (
              <div className="space-y-2">
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

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={sendLatestReminderNow}
                disabled={sendingNow}
                className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {sendingNow ? "Sending..." : "Send latest reminder now"}
              </button>

              <button
                type="button"
                onClick={saveSettings}
                disabled={saving}
                className="rounded-xl border bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save reminder settings"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}