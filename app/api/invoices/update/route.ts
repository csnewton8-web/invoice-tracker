import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);
    const body = await req.json();

    const id = body.id;

    const allowedFields = [
      "supplier",
      "invoice_number",
      "po_number",
      "invoice_date",
      "due_date",
      "payment_terms",
      "total",
      "currency",
      "notes",
      "is_paid",
    ];

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from("invoices")
      .update(updateData)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, invoice: data });
  } catch (e: any) {
    console.error("Invoice update error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}