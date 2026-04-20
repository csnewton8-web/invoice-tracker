import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { sendDueDigest } from "@/lib/email/send-due-digest";

function isoDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
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

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (settingsError) {
      throw settingsError;
    }

    const { data: recipients, error: recipientError } = await supabase
      .from("notification_recipients")
      .select("email")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (recipientError) {
      throw recipientError;
    }

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

    const upcomingDays =
      typeof settings?.upcoming_days === "number" && settings.upcoming_days > 0
        ? settings.upcoming_days
        : 7;

    const todayDate = new Date(`${todayLocalDate}T00:00:00`);
    const upcomingEnd = isoDateOnly(addDays(todayDate, upcomingDays));

    const { data: invoices, error: invoiceError } = await supabase
      .from("invoices")
      .select("supplier, invoice_number, po_number, due_date, currency, total, is_paid")
      .eq("company_id", companyId)
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
      return NextResponse.json(
        { error: "No matching invoices found to include in the reminder." },
        { status: 400 }
      );
    }

    await sendDueDigest({
      to,
      companyName: company.name,
      overdue: finalOverdue,
      dueToday: finalDueToday,
      upcoming: finalUpcoming,
    });

    return NextResponse.json({
      success: true,
      recipients: to.length,
      overdue: finalOverdue.length,
      dueToday: finalDueToday.length,
      upcoming: finalUpcoming.length,
    });
  } catch (e: any) {
    console.error("Manual reminder send error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to send latest reminder" },
      { status: 500 }
    );
  }
}