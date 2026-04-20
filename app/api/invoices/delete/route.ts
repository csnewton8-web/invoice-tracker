import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const body = await req.json();
    const invoiceIds: string[] = Array.isArray(body.invoiceIds) ? body.invoiceIds : [];

    if (!invoiceIds.length) {
      return NextResponse.json({ error: "No invoices selected" }, { status: 400 });
    }

    const { data: invoices, error: fetchError } = await supabase
      .from("invoices")
      .select("id, file_path")
      .eq("company_id", companyId)
      .in("id", invoiceIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const filePaths = (invoices || [])
      .map((invoice) => invoice.file_path)
      .filter(Boolean);

    const bucket = process.env.INVOICE_STORAGE_BUCKET || "invoices";

    if (filePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove(filePaths);

      if (storageError) {
        return NextResponse.json({ error: storageError.message }, { status: 500 });
      }
    }

    const { error: deleteError } = await supabase
      .from("invoices")
      .delete()
      .eq("company_id", companyId)
      .in("id", invoiceIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Delete failed" },
      { status: 500 }
    );
  }
}