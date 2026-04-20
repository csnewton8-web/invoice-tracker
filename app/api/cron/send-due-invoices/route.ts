import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendDueDigest } from "@/lib/email/send-due-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createClient(url, serviceRole);
}

function isoDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function getLocalParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  const weekdayRaw = get("weekday").toLowerCase();
  const weekdayMap: Record<string, string> = {
    sun: "sun",
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
  };

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  return {
    localDate: `${year}-${month}-${day}`,
    localDay: weekdayMap[weekdayRaw.slice(0, 3)] || "mon",
    localTime: `${hour}:${minute}`,
    localHourMinuteSecond: `${hour}:${minute}:${second}`,
  };
}

function normaliseSendTime(sendTime: string | null | undefined) {
  if (!sendTime) return "08:00";
  return sendTime.slice(0, 5);
}

function shouldSendToday(
  now: Date,
  timeZone: string,
  sendDays: string[] | null | undefined,
  sendTime: string | null | undefined,
  lastSentAt: string | null | undefined
) {
  const nowLocal = getLocalParts(now, timeZone);
  const selectedDays =
    Array.isArray(sendDays) && sendDays.length
      ? sendDays.map((d) => d.toLowerCase())
      : ["mon", "tue", "wed", "thu", "fri"];

  if (!selectedDays.includes(nowLocal.localDay)) {
    return { shouldSend: false, reason: "not_scheduled_day" as const, nowLocal };
  }

  const scheduledTime = normaliseSendTime(sendTime);

  if (nowLocal.localTime < scheduledTime) {
    return { shouldSend: false, reason: "not_scheduled_time" as const, nowLocal };
  }

  if (lastSentAt) {
    const lastLocal = getLocalParts(new Date(lastSentAt), timeZone);
    if (lastLocal.localDate === nowLocal.localDate) {
      return { shouldSend: false, reason: "already_sent_today" as const, nowLocal };
    }
  }

  return { shouldSend: true, reason: null, nowLocal };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getAdminClient();
    const now = new Date();

    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id, name, is_active")
      .eq("is_active", true);

    if (companyError) {
      throw companyError;
    }

    const results: any[] = [];

    for (const company of companies || []) {
      const { data: settings, error: settingsError } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("company_id", company.id)
        .maybeSingle();

      if (settingsError) {
        throw settingsError;
      }

      if (settings && settings.enabled === false) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          skipped: true,
          reason: "notifications_disabled",
        });
        continue;
      }

      const timeZone = settings?.timezone || "Europe/London";
      const sendDays = settings?.send_days || ["mon", "tue", "wed", "thu", "fri"];
      const sendTime = settings?.send_time || "08:00:00";
      const lastSentAt = settings?.last_sent_at || null;

      const sendDecision = shouldSendToday(
        now,
        timeZone,
        sendDays,
        sendTime,
        lastSentAt
      );

      if (!sendDecision.shouldSend) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          skipped: true,
          reason: sendDecision.reason,
          localDate: sendDecision.nowLocal.localDate,
          localTime: sendDecision.nowLocal.localTime,
          timezone: timeZone,
        });
        continue;
      }

      const { data: recipients, error: recipientError } = await supabase
        .from("notification_recipients")
        .select("email")
        .eq("company_id", company.id)
        .eq("is_active", true);

      if (recipientError) {
        throw recipientError;
      }

      const to = (recipients || [])
        .map((r) => r.email?.trim())
        .filter((email): email is string => Boolean(email));

      if (!to.length) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          skipped: true,
          reason: "no_recipients",
        });
        continue;
      }

      const todayLocalDate = sendDecision.nowLocal.localDate;
      const upcomingDays =
        typeof settings?.upcoming_days === "number" && settings.upcoming_days > 0
          ? settings.upcoming_days
          : 7;

      const todayDate = new Date(`${todayLocalDate}T00:00:00`);
      const upcomingEnd = isoDateOnly(addDays(todayDate, upcomingDays));

      const { data: invoices, error: invoiceError } = await supabase
        .from("invoices")
        .select("supplier, invoice_number, po_number, due_date, currency, total, is_paid")
        .eq("company_id", company.id)
        .eq("is_paid", false)
        .not("due_date", "is", null);

      if (invoiceError) {
        throw invoiceError;
      }

      const overdue = (invoices || []).filter(
        (inv) => inv.due_date && inv.due_date < todayLocalDate
      );

      const dueToday = (invoices || []).filter(
        (inv) => inv.due_date === todayLocalDate
      );

      const upcoming = (invoices || []).filter(
        (inv) =>
          inv.due_date &&
          inv.due_date > todayLocalDate &&
          inv.due_date <= upcomingEnd
      );

      const overdueEnabled = settings?.overdue_enabled ?? true;
      const dueTodayEnabled = settings?.due_today_enabled ?? true;
      const upcomingEnabled = settings?.upcoming_enabled ?? true;

      const finalOverdue = overdueEnabled ? overdue : [];
      const finalDueToday = dueTodayEnabled ? dueToday : [];
      const finalUpcoming = upcomingEnabled ? upcoming : [];

      const hasAnything =
        finalOverdue.length || finalDueToday.length || finalUpcoming.length;

      if (!hasAnything) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          skipped: true,
          reason: "nothing_due",
          localDate: todayLocalDate,
          timezone: timeZone,
        });
        continue;
      }

      await sendDueDigest({
        to,
        companyName: company.name,
        overdue: finalOverdue,
        dueToday: finalDueToday,
        upcoming: finalUpcoming,
      });

      await supabase
        .from("notification_settings")
        .upsert(
          {
            company_id: company.id,
            enabled: settings?.enabled ?? true,
            daily_digest_enabled: settings?.daily_digest_enabled ?? true,
            send_time: settings?.send_time ?? "08:00:00",
            timezone: timeZone,
            send_days: sendDays,
            due_today_enabled: settings?.due_today_enabled ?? true,
            overdue_enabled: settings?.overdue_enabled ?? true,
            upcoming_enabled: settings?.upcoming_enabled ?? true,
            upcomingDays,
            last_sent_at: now.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" }
        );

      results.push({
        companyId: company.id,
        companyName: company.name,
        sent: true,
        recipients: to.length,
        overdue: finalOverdue.length,
        dueToday: finalDueToday.length,
        upcoming: finalUpcoming.length,
        localDate: todayLocalDate,
        localTime: sendDecision.nowLocal.localTime,
        timezone: timeZone,
      });
    }

    return NextResponse.json({
      success: true,
      ranAt: now.toISOString(),
      results,
    });
  } catch (error: any) {
    console.error("send-due-invoices cron error", error);
    return NextResponse.json(
      { error: error?.message || "Cron failed" },
      { status: 500 }
    );
  }
}