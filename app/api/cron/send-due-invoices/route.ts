import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendDueDigest } from "@/lib/email/send-due-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TIMEZONE = "Europe/London";
const DEFAULT_SEND_DAYS = ["mon", "tue", "wed", "thu", "fri"];

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createClient(url, serviceRole);
}

function verifyCronRequest(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET is not configured");
    return false;
  }

  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return { year, month, day };
}

function isoDateFromParts(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDaysToIsoDate(value: string, days: number) {
  const { year, month, day } = parseIsoDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return isoDateFromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function startOfNextMonthIso(value: string) {
  const { year, month } = parseIsoDate(value);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return isoDateFromParts(nextYear, nextMonth, 1);
}

function startOfMonthAfterNextIso(value: string) {
  return startOfNextMonthIso(startOfNextMonthIso(value));
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
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
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

  return {
    localDate: `${get("year")}-${get("month")}-${get("day")}`,
    localDay: weekdayMap[weekdayRaw.slice(0, 3)] || "mon",
    localTime: `${get("hour")}:${get("minute")}`,
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
      : DEFAULT_SEND_DAYS;

  if (!selectedDays.includes(nowLocal.localDay)) {
    return { shouldSend: false, reason: "not_scheduled_day" as const, nowLocal };
  }

  if (nowLocal.localTime < normaliseSendTime(sendTime)) {
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

async function getPayLinkUrl(supabase: any, companyId: string) {
  const { data, error } = await supabase
    .from("user_app_settings")
    .select("pay_link_url, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  return data?.[0]?.pay_link_url || null;
}

async function processCompany({
  supabase,
  company,
  now,
}: {
  supabase: any;
  company: {
    id: string;
    name: string;
    is_active?: boolean | null;
    deleted_at?: string | null;
  };
  now: Date;
}) {
  if (!company.is_active || company.deleted_at) {
    return {
      companyId: company.id,
      companyName: company.name,
      skipped: true,
      reason: company.deleted_at ? "company_deleted" : "company_inactive",
    };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("company_id", company.id)
    .maybeSingle();

  if (settingsError) throw settingsError;

  if (settings && settings.enabled === false) {
    return {
      companyId: company.id,
      companyName: company.name,
      skipped: true,
      reason: "notifications_disabled",
    };
  }

  const timeZone = settings?.timezone || DEFAULT_TIMEZONE;
  const sendDays = settings?.send_days || DEFAULT_SEND_DAYS;
  const sendTime = settings?.send_time || "08:00:00";
  const lastSentAt = settings?.last_sent_at || null;

  const sendDecision = shouldSendToday(now, timeZone, sendDays, sendTime, lastSentAt);

  if (!sendDecision.shouldSend) {
    return {
      companyId: company.id,
      companyName: company.name,
      skipped: true,
      reason: sendDecision.reason,
      localDate: sendDecision.nowLocal.localDate,
      localTime: sendDecision.nowLocal.localTime,
      timezone: timeZone,
    };
  }

  const { data: recipients, error: recipientError } = await supabase
    .from("notification_recipients")
    .select("email")
    .eq("company_id", company.id)
    .eq("is_active", true);

  if (recipientError) throw recipientError;

  const to = (recipients || [])
    .map((r: any) => r.email?.trim())
    .filter((email: string | undefined): email is string => Boolean(email));

  if (!to.length) {
    return {
      companyId: company.id,
      companyName: company.name,
      skipped: true,
      reason: "no_recipients",
    };
  }

  const todayLocalDate = sendDecision.nowLocal.localDate;
  const endOfThisWeek = addDaysToIsoDate(todayLocalDate, 7);
  const nextMonthStart = startOfNextMonthIso(todayLocalDate);
  const monthAfterNextStart = startOfMonthAfterNextIso(todayLocalDate);

  const { data: invoices, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, supplier, invoice_number, po_number, due_date, currency, total, is_paid")
    .eq("company_id", company.id)
    .eq("is_paid", false)
    .not("due_date", "is", null)
    .order("due_date", { ascending: true });

  if (invoiceError) throw invoiceError;

  const unpaid = invoices || [];

  const overdue = unpaid.filter((inv: any) => inv.due_date < todayLocalDate);
  const dueToday = unpaid.filter((inv: any) => inv.due_date === todayLocalDate);

  const dueThisWeek = unpaid.filter(
    (inv: any) =>
      inv.due_date > todayLocalDate && inv.due_date <= endOfThisWeek
  );

  const dueThisMonth = unpaid.filter(
    (inv: any) =>
      inv.due_date > endOfThisWeek && inv.due_date < nextMonthStart
  );

  const dueNextMonth = unpaid.filter(
    (inv: any) =>
      inv.due_date >= nextMonthStart && inv.due_date < monthAfterNextStart
  );

  const dueLater = unpaid.filter(
    (inv: any) => inv.due_date >= monthAfterNextStart
  );

  const finalOverdue = settings?.overdue_enabled ?? true ? overdue : [];
  const finalDueToday = settings?.due_today_enabled ?? true ? dueToday : [];
  const finalDueThisWeek = settings?.upcoming_enabled ?? true ? dueThisWeek : [];
  const finalDueThisMonth = settings?.upcoming_enabled ?? true ? dueThisMonth : [];
  const finalDueNextMonth = settings?.upcoming_enabled ?? true ? dueNextMonth : [];
  const finalDueLater = settings?.upcoming_enabled ?? true ? dueLater : [];

  const hasAnything =
    finalOverdue.length ||
    finalDueToday.length ||
    finalDueThisWeek.length ||
    finalDueThisMonth.length ||
    finalDueNextMonth.length ||
    finalDueLater.length;

  if (!hasAnything) {
    return {
      companyId: company.id,
      companyName: company.name,
      skipped: true,
      reason: "nothing_due",
      localDate: todayLocalDate,
      timezone: timeZone,
    };
  }

  const payLinkUrl = await getPayLinkUrl(supabase, company.id);

  await sendDueDigest({
    to,
    companyName: company.name,
    overdue: finalOverdue,
    dueToday: finalDueToday,
    dueThisWeek: finalDueThisWeek,
    dueThisMonth: finalDueThisMonth,
    dueNextMonth: finalDueNextMonth,
    dueLater: finalDueLater,
    payLinkUrl,
  });

  const { error: updateError } = await supabase.from("notification_settings").upsert(
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
      upcoming_days: settings?.upcoming_days ?? 7,
      last_sent_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "company_id" }
  );

  if (updateError) throw updateError;

  return {
    companyId: company.id,
    companyName: company.name,
    sent: true,
    recipients: to.length,
    overdue: finalOverdue.length,
    dueToday: finalDueToday.length,
    dueThisWeek: finalDueThisWeek.length,
    dueThisMonth: finalDueThisMonth.length,
    dueNextMonth: finalDueNextMonth.length,
    dueLater: finalDueLater.length,
    payLinkConfigured: Boolean(payLinkUrl),
    localDate: todayLocalDate,
    localTime: sendDecision.nowLocal.localTime,
    timezone: timeZone,
  };
}

export async function GET(req: NextRequest) {
  const now = new Date();

  try {
    if (!verifyCronRequest(req)) {
      return jsonError("Unauthorized", 401);
    }

    const supabase = getAdminClient();

    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id, name, is_active, deleted_at")
      .eq("is_active", true)
      .is("deleted_at", null);

    if (companyError) {
      console.error("Failed to load companies for cron:", companyError);
      return jsonError("Cron failed", 500);
    }

    const results = [];

    for (const company of companies || []) {
      try {
        const result = await processCompany({
          supabase,
          company,
          now,
        });

        results.push(result);
      } catch (companyError) {
        console.error(
          `Failed to process due invoice reminders for company ${company.id}:`,
          companyError
        );

        results.push({
          companyId: company.id,
          companyName: company.name,
          failed: true,
          reason: "company_processing_failed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      ranAt: now.toISOString(),
      processed: results.length,
      results,
    });
  } catch (error: unknown) {
    console.error("send-due-invoices cron error:", error);
    return jsonError("Cron failed", 500);
  }
}