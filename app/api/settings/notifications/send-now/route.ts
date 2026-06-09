import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { sendDueDigest } from "@/lib/email/send-due-digest";
import { FREE_PLAN_MAX_INVOICES, isPaidPlan } from "@/lib/plans";

function isoDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfNextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function startOfMonthAfterNext(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 2, 1);
}

function getLocalDateOnly(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

async function getInvoiceCount(supabase: any, companyId: string) {
  const { count, error } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (error) throw error;
  return count || 0;
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

function remindersAreLocked(
  plan: string | null | undefined,
  subscriptionStatus: string | null | undefined,
  invoiceCount: number
) {
  if (isPaidPlan(plan, subscriptionStatus)) return false;
  return invoiceCount >= FREE_PLAN_MAX_INVOICES;
}

async function safeReadJson(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function getManualWindow(value: unknown) {
  if (value === "overdue") return "overdue";
  if (value === "today") return "today";
  if (value === "7") return "7";
  if (value === "14") return "14";
  if (value === "all") return "all";
  return "all";
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await safeReadJson(req);
    const manualWindow = getManualWindow(body.window);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, plan, subscription_status")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const invoiceCount = await getInvoiceCount(supabase, companyId);
    const locked = remindersAreLocked(
      company.plan,
      company.subscription_status,
      invoiceCount
    );

    if (locked) {
      return NextResponse.json(
        {
          error: `Manual reminder sending is available while your free workspace stays under ${FREE_PLAN_MAX_INVOICES} uploaded invoices. Upgrade to Starter to keep reminders active.`,
        },
        { status: 403 }
      );
    }

    const { data: settings, error: settingsError } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (settingsError) throw settingsError;

    if (settings && settings.enabled === false) {
      return NextResponse.json(
        { error: "Payment reminders are currently disabled." },
        { status: 400 }
      );
    }

    const { data: recipients, error: recipientError } = await supabase
      .from("notification_recipients")
      .select("email")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (recipientError) throw recipientError;

    const to = (recipients || [])
      .map((r) => r.email?.trim())
      .filter((email): email is string => Boolean(email));

    if (!to.length) {
      return NextResponse.json(
        { error: "No active recipients found for this company." },
        { status: 400 }
      );
    }

    const timeZone = settings?.timezone || "Europe/London";
    const todayLocalDate = getLocalDateOnly(new Date(), timeZone);
    const todayDate = new Date(`${todayLocalDate}T00:00:00`);
    const endOfThisWeek = isoDateOnly(addDays(todayDate, 7));
    const nextMonthStart = isoDateOnly(startOfNextMonth(todayDate));
    const monthAfterNextStart = isoDateOnly(startOfMonthAfterNext(todayDate));

    const { data: invoices, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "id, supplier, invoice_number, po_number, due_date, currency, total, is_paid"
      )
      .eq("company_id", companyId)
      .eq("is_paid", false)
      .order("due_date", { ascending: true });

    if (invoiceError) throw invoiceError;

    const unpaid = invoices || [];

    const overdue = unpaid.filter(
      (inv) => inv.due_date && inv.due_date < todayLocalDate
    );

    const dueToday = unpaid.filter((inv) => inv.due_date === todayLocalDate);

    const dueThisWeek = unpaid.filter(
      (inv) =>
        inv.due_date &&
        inv.due_date > todayLocalDate &&
        inv.due_date <= endOfThisWeek
    );

    const dueThisMonth = unpaid.filter(
      (inv) =>
        inv.due_date &&
        inv.due_date > endOfThisWeek &&
        inv.due_date < nextMonthStart
    );

    const dueNextMonth = unpaid.filter(
      (inv) =>
        inv.due_date &&
        inv.due_date >= nextMonthStart &&
        inv.due_date < monthAfterNextStart
    );

    const dueLater = unpaid.filter(
      (inv) => inv.due_date && inv.due_date >= monthAfterNextStart
    );

    let finalOverdue: typeof unpaid = [];
    let finalDueToday: typeof unpaid = [];
    let finalDueThisWeek: typeof unpaid = [];
    let finalDueThisMonth: typeof unpaid = [];
    let finalDueNextMonth: typeof unpaid = [];
    let finalDueLater: typeof unpaid = [];

    if (manualWindow === "overdue") {
      finalOverdue = overdue;
    } else if (manualWindow === "today") {
      finalDueToday = dueToday;
    } else if (manualWindow === "7") {
      finalDueToday = dueToday;
      finalDueThisWeek = dueThisWeek;
    } else if (manualWindow === "14") {
      const end14 = isoDateOnly(addDays(todayDate, 14));

      finalDueToday = dueToday;
      finalDueThisWeek = unpaid.filter(
        (inv) =>
          inv.due_date &&
          inv.due_date > todayLocalDate &&
          inv.due_date <= end14
      );
    } else {
      finalOverdue = overdue;
      finalDueToday = dueToday;
      finalDueThisWeek = dueThisWeek;
      finalDueThisMonth = dueThisMonth;
      finalDueNextMonth = dueNextMonth;
      finalDueLater = dueLater;
    }

    const hasAnything =
      finalOverdue.length ||
      finalDueToday.length ||
      finalDueThisWeek.length ||
      finalDueThisMonth.length ||
      finalDueNextMonth.length ||
      finalDueLater.length;

    if (!hasAnything) {
      return NextResponse.json(
        { error: "No matching invoices found to include in the reminder." },
        { status: 400 }
      );
    }

    const payLinkUrl = await getPayLinkUrl(supabase, companyId);

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

    return NextResponse.json({
      success: true,
      recipients: to.length,
      overdue: finalOverdue.length,
      dueToday: finalDueToday.length,
      dueThisWeek: finalDueThisWeek.length,
      dueThisMonth: finalDueThisMonth.length,
      dueNextMonth: finalDueNextMonth.length,
      dueLater: finalDueLater.length,
      payLinkConfigured: Boolean(payLinkUrl),
      window: manualWindow,
    });
  } catch (e: any) {
    console.error("Manual reminder send error:", e);

    return NextResponse.json(
      { error: e?.message || "Failed to send latest reminder" },
      { status: 500 }
    );
  }
}