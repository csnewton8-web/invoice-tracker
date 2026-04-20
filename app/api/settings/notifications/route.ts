import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

const VALID_SEND_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function normaliseSendDays(value: unknown) {
  if (!Array.isArray(value)) {
    return ["mon", "tue", "wed", "thu", "fri"];
  }

  const cleaned = value
    .filter((day): day is string => typeof day === "string")
    .map((day) => day.trim().toLowerCase())
    .filter((day) => VALID_SEND_DAYS.includes(day));

  return cleaned.length ? Array.from(new Set(cleaned)) : ["mon", "tue", "wed", "thu", "fri"];
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data, error } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      throw error;
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
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);
    const body = await req.json();

    const sendDays = normaliseSendDays(body.send_days);

    const { error } = await supabase
      .from("notification_settings")
      .upsert(
        {
          company_id: companyId,
          enabled: body.enabled ?? true,
          daily_digest_enabled: body.daily_digest_enabled ?? true,
          send_time: body.send_time ?? "08:00:00",
          timezone: body.timezone ?? "Europe/London",
          send_days: sendDays,
          due_today_enabled: body.due_today_enabled ?? true,
          overdue_enabled: body.overdue_enabled ?? true,
          upcoming_enabled: body.upcoming_enabled ?? true,
          upcoming_days: body.upcoming_days ?? 7,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}