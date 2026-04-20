import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

type Context = {
  params: Promise<{
    recipientId: string;
  }>;
};

export async function PATCH(req: NextRequest, context: Context) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { recipientId } = await context.params;
    const body = await req.json();
    const isActive = Boolean(body.is_active);

    const { data, error } = await supabase
      .from("notification_recipients")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipientId)
      .eq("company_id", companyId)
      .select("id, email, name, is_active, created_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ recipient: data });
  } catch (e: any) {
    console.error("PATCH recipient error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { recipientId } = await context.params;

    const { error } = await supabase
      .from("notification_recipients")
      .delete()
      .eq("id", recipientId)
      .eq("company_id", companyId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("DELETE recipient error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}