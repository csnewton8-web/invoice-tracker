import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const body = await req.json();
    const invoiceIds: string[] = Array.isArray(body.invoiceIds) ? body.invoiceIds : [];
    const isPaid: boolean = Boolean(body.isPaid);

    if (!invoiceIds.length) {
      return NextResponse.json({ error: "No invoices selected" }, { status: 400 });
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        is_paid: isPaid,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .in("id", invoiceIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Update failed" },
      { status: 500 }
    );
  }
}