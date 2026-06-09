import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { FREE_PLAN_MAX_INVOICES, isPaidPlan } from "@/lib/plans";
import { canManageReminders } from "@/lib/permissions";

const VALID_SEND_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function normaliseSendDays(value: unknown) {
  if (!Array.isArray(value)) {
    return ["mon", "tue", "wed", "thu", "fri"];
  }

  const cleaned = value
    .filter((day): day is string => typeof day === "string")
    .map((day) => day.trim().toLowerCase())
    .filter((day) => VALID_SEND_DAYS.includes(day));

  return cleaned.length
    ? Array.from(new Set(cleaned))
    : ["mon", "tue", "wed", "thu", "fri"];
}

async function getInvoiceCount(supabase: any, companyId: string) {
  const { count, error } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (error) {
    console.error("Failed to count invoices for notification settings:", error);
    throw new Error("Could not check invoice count");
  }

  return count || 0;
}

function remindersAreLocked(
  plan: string | null | undefined,
  subscriptionStatus: string | null | undefined,
  invoiceCount: number
) {
  if (isPaidPlan(plan, subscriptionStatus)) {
    return false;
  }

  return invoiceCount >= FREE_PLAN_MAX_INVOICES;
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("plan, subscription_status")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      console.error("Failed to load company for notification settings:", companyError);
      return jsonError("Company not found", 404);
    }

    const invoiceCount = await getInvoiceCount(supabase, companyId);

    const locked = remindersAreLocked(
      company.plan,
      company.subscription_status,
      invoiceCount
    );

    const { data, error } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      console.error("Failed to load notification settings:", error);
      return jsonError("Failed to load notification settings", 500);
    }

    return NextResponse.json({
      enabled: data?.enabled ?? true,
      daily_digest_enabled: data?.daily_digest_enabled ?? true,
      send_time: data?.send_time ?? "08:00:00",
      timezone: data?.timezone ?? "Europe/London",
      send_days: data?.send_days ?? ["mon", "tue", "wed", "thu", "fri"],
      due_today_enabled: data?.due_today_enabled ?? true,
      overdue_enabled: data?.overdue_enabled ?? true,
      upcoming_enabled: data?.upcoming_enabled ?? true,
      upcoming_days: data?.upcoming_days ?? 7,
      reminders_unlocked: !locked,
      invoice_count: invoiceCount,
      free_limit: FREE_PLAN_MAX_INVOICES,
    });
  } catch (error: unknown) {
    console.error("Notification settings GET error:", error);
    return jsonError("Failed to load notification settings", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (!canManageReminders(role)) {
      return jsonError("You do not have permission to manage reminders", 403);
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("plan, subscription_status")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      console.error("Failed to load company for saving notifications:", companyError);
      return jsonError("Company not found", 404);
    }

    const invoiceCount = await getInvoiceCount(supabase, companyId);

    const locked = remindersAreLocked(
      company.plan,
      company.subscription_status,
      invoiceCount
    );

    if (locked) {
      return jsonError(
        `Payment reminders are included while your free workspace stays under ${FREE_PLAN_MAX_INVOICES} uploaded invoices. Upgrade to Starter to keep reminders active and continue uploading.`,
        403
      );
    }

    const body = await req.json();
    const sendDays = normaliseSendDays(body.send_days);

    const sendTime =
      typeof body.send_time === "string" && body.send_time.trim()
        ? body.send_time.trim()
        : "08:00:00";

    const timezone =
      typeof body.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim()
        : "Europe/London";

    const upcomingDaysRaw =
      typeof body.upcoming_days === "number"
        ? body.upcoming_days
        : Number(body.upcoming_days ?? 7);

    const upcomingDays =
      Number.isFinite(upcomingDaysRaw) &&
      upcomingDaysRaw >= 1 &&
      upcomingDaysRaw <= 90
        ? upcomingDaysRaw
        : 7;

    const { error } = await supabase.from("notification_settings").upsert(
      {
        company_id: companyId,
        enabled: Boolean(body.enabled ?? true),
        daily_digest_enabled: Boolean(body.daily_digest_enabled ?? true),
        send_time: sendTime,
        timezone,
        send_days: sendDays,
        due_today_enabled: Boolean(body.due_today_enabled ?? true),
        overdue_enabled: Boolean(body.overdue_enabled ?? true),
        upcoming_enabled: Boolean(body.upcoming_enabled ?? true),
        upcoming_days: upcomingDays,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );

    if (error) {
      console.error("Failed to save notification settings:", error);
      return jsonError("Failed to save notification settings", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Notification settings POST error:", error);
    return jsonError("Failed to save notification settings", 500);
  }
}