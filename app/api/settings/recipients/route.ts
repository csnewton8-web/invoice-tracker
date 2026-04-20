import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data, error } = await supabase
      .from("notification_recipients")
      .select("id, email, name, is_active, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      recipients: data || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("notification_recipients")
      .select("id, is_active")
      .eq("company_id", companyId)
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      if (existing.is_active) {
        return NextResponse.json(
          { error: "Recipient already exists" },
          { status: 409 }
        );
      }

      const { data, error } = await supabase
        .from("notification_recipients")
        .update({
          name: name || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, email, name, is_active, created_at")
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({ recipient: data });
    }

    const { data, error } = await supabase
      .from("notification_recipients")
      .insert({
        company_id: companyId,
        email,
        name: name || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id, email, name, is_active, created_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ recipient: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}