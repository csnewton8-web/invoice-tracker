"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type NotificationSettingsResponse = {
  enabled: boolean;
  daily_digest_enabled: boolean;
  send_time: string;
  timezone: string;
  send_days: string[];
  due_today_enabled: boolean;
  overdue_enabled: boolean;
  upcoming_enabled: boolean;
  upcoming_days: number;
  invoice_count?: number;
  free_limit?: number;
};

type Props = {
  disabled?: boolean;
  upgradeMessage?: string;
};

const DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const TIMEZONE_OPTIONS = [
  "Europe/London",
  "Europe/Dublin",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

function normaliseTimeForInput(value: string) {
  if (!value) return "08:00";
  return value.slice(0, 5);
}

function LockNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4">
      <div className="text-sm font-semibold text-slate-900">Reminders locked</div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{message}</p>
    </div>
  );
}

function SectionLabel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

export function NotificationSettings({
  disabled = false,
  upgradeMessage = "Payment reminders are included on the free workspace until you reach 10 uploaded invoices. Upgrade to Starter Plan to keep reminders active.",
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [settings, setSettings] = useState<NotificationSettingsResponse>({
    enabled: true,
    daily_digest_enabled: true,
    send_time: "08:00:00",
    timezone: "Europe/London",
    send_days: ["mon", "tue", "wed", "thu", "fri"],
    due_today_enabled: true,
    overdue_enabled: true,
    upcoming_enabled: true,
    upcoming_days: 7,
  });

  async function loadSettings() {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("You must be logged in to manage reminder settings.");
      }

      const res = await fetch("/api/settings/notifications", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to load reminder settings.");
      }

      setSettings({
        enabled: body.enabled ?? true,
        daily_digest_enabled: body.daily_digest_enabled ?? true,
        send_time: body.send_time ?? "08:00:00",
        timezone: body.timezone ?? "Europe/London",
        send_days: body.send_days ?? ["mon", "tue", "wed", "thu", "fri"],
        due_today_enabled: body.due_today_enabled ?? true,
        overdue_enabled: body.overdue_enabled ?? true,
        upcoming_enabled: body.upcoming_enabled ?? true,
        upcoming_days: body.upcoming_days ?? 7,
        invoice_count: body.invoice_count,
        free_limit: body.free_limit,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load reminder settings."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function toggleDay(day: string) {
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

  async function saveSettings() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("You must be logged in to save reminder settings.");
      }

      const payload = {
        enabled: settings.enabled,
        daily_digest_enabled: settings.daily_digest_enabled,
        send_time:
          settings.send_time.length === 5
            ? `${settings.send_time}:00`
            : settings.send_time,
        timezone: settings.timezone,
        send_days: settings.send_days,
        due_today_enabled: settings.due_today_enabled,
        overdue_enabled: settings.overdue_enabled,
        upcoming_enabled: settings.upcoming_enabled,
        upcoming_days: settings.upcoming_days,
      };

      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to save reminder settings.");
      }

      setSuccess("Reminder settings saved.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to save reminder settings."
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    setSendingNow(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("You must be logged in to send a reminder.");
      }

      const res = await fetch("/api/settings/notifications/send-now", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to send reminder.");
      }

      setSuccess("Latest reminder sent successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send reminder.");
    } finally {
      setSendingNow(false);
    }
  }

  const helperText =
    settings.free_limit && settings.invoice_count != null && !disabled
      ? `You have used ${settings.invoice_count} of ${settings.free_limit} free invoice uploads.`
      : null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Payment reminders
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
          Control whether reminder emails are sent, what days they go out, what
          time they are sent, and which invoice groups are included.
        </p>
      </div>

      {helperText ? (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {helperText}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Loading reminder settings...
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {disabled ? <LockNotice message={upgradeMessage} /> : null}

          <div className="rounded-[24px] border border-slate-300 bg-slate-50 p-5">
            <div className="flex flex-col gap-4">
              <SectionLabel
                title="Enable payment reminders"
                description="Turn all reminder emails on or off for this company."
              />

              <div className="flex items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 py-4">
  <div>
    <div className="text-base font-semibold text-slate-900">
      Payment reminders
    </div>
    <div className="mt-1 text-sm text-slate-500">
      Turn reminder emails on or off
    </div>
  </div>

  <button
    type="button"
    role="switch"
    aria-checked={settings.enabled}
    disabled={disabled}
    onClick={() =>
      setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
    }
    className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${
      settings.enabled
        ? "bg-emerald-500"
        : "bg-rose-500"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
  >
    <span
      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
        settings.enabled ? "translate-x-7" : "translate-x-1"
      }`}
    />
  </button>
</div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-1">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Send time
                  </label>
                  <input
                    type="time"
                    disabled={disabled}
                    value={normaliseTimeForInput(settings.send_time)}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        send_time: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Timezone
                  </label>
                  <select
                    disabled={disabled}
                    value={settings.timezone}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        timezone: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {TIMEZONE_OPTIONS.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Upcoming window (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    disabled={disabled}
                    value={settings.upcoming_days}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        upcoming_days: Number(e.target.value || 7),
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <SectionLabel
              title="Send on these days"
              description="Choose the days when reminder emails are allowed to go out."
            />

            <div className="mt-4 grid grid-cols-2 gap-3">
              {DAY_OPTIONS.map((day) => {
                const active = settings.send_days.includes(day.value);

                return (
                  <button
                    key={day.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleDay(day.value)}
                    className={`rounded-2xl border px-4 py-3 text-base font-medium transition ${
                      active
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-300 bg-white text-slate-700"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <SectionLabel
              title="Include these invoice groups"
              description="Choose which invoice categories are included in reminder emails."
            />

            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-4">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={settings.overdue_enabled}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      overdue_enabled: e.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-400"
                />
                <span>
                  <span className="block text-base font-medium text-slate-900">
                    Overdue invoices
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">
                    Include invoices that are already past their due date.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-4">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={settings.due_today_enabled}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      due_today_enabled: e.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-400"
                />
                <span>
                  <span className="block text-base font-medium text-slate-900">
                    Due today
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">
                    Include invoices due on the current day.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-4">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={settings.upcoming_enabled}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      upcoming_enabled: e.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-400"
                />
                <span>
                  <span className="block text-base font-medium text-slate-900">
                    Upcoming invoices
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">
                    Include invoices due within the upcoming window.
                  </span>
                </span>
              </label>
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

          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={disabled || sendingNow}
              onClick={sendNow}
              className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-base font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingNow ? "Sending latest reminder..." : "Send latest reminder now"}
            </button>

            <button
              type="button"
              disabled={disabled || saving}
              onClick={saveSettings}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving reminder settings..." : "Save reminder settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}