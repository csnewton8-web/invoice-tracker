import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const invoiceId = req.nextUrl.searchParams.get("invoiceId");

    if (!invoiceId) {
      return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, file_path")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const bucket = process.env.INVOICE_STORAGE_BUCKET || "invoices";

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(invoice.file_path, 60 * 10);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message || "Could not create signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load PDF" },
      { status: 500 }
    );
  }
}