import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data, error } = await supabase
      .from("email_imports")
      .select(
        "id, sender_email, from_email, subject, attachment_name, attachment_size, status, rejection_reason, invoice_id, created_at, processed_at"
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Failed to load email imports:", error);

      return NextResponse.json(
        { error: "Failed to load email imports" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imports: data || [],
    });
  } catch (error) {
    console.error("Email imports GET error:", error);

    return NextResponse.json(
      { error: "Failed to load email import history" },
      { status: 500 }
    );
  }
}