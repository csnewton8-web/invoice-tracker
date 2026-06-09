import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { canDeleteInvoices } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, role, user } =
      await requireCurrentCompany(req);

    if (!canDeleteInvoices(role)) {
      return jsonError("You do not have permission to delete invoices", 403);
    }

    const body = await req.json();

    const invoiceIds: string[] = Array.isArray(body.invoiceIds)
      ? body.invoiceIds
      : [];

    if (!invoiceIds.length) {
      return jsonError("No invoices selected", 400);
    }

    const { data: invoices, error: fetchError } = await supabase
      .from("invoices")
      .select("id, file_path, supplier, invoice_number, total, currency")
      .eq("company_id", companyId)
      .in("id", invoiceIds);

    if (fetchError) {
      console.error("Failed to fetch invoices for deletion:", fetchError);
      return jsonError("Could not load selected invoices", 500);
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
        console.error("Failed to delete invoice files:", storageError);
        return jsonError("Could not delete invoice files", 500);
      }
    }

    const { error: deleteError } = await supabase
      .from("invoices")
      .delete()
      .eq("company_id", companyId)
      .in("id", invoiceIds);

    if (deleteError) {
      console.error("Failed to delete invoice records:", deleteError);
      return jsonError("Could not delete invoice records", 500);
    }

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: "invoice_deleted",
      entityType: "invoice",
      metadata: {
        invoice_ids: invoiceIds,
        count: invoiceIds.length,
        invoices: (invoices || []).map((invoice) => ({
          id: invoice.id,
          supplier: invoice.supplier,
          invoice_number: invoice.invoice_number,
          total: invoice.total,
          currency: invoice.currency,
        })),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Invoice delete error:", error);

    return jsonError("Delete failed", 500);
  }
}