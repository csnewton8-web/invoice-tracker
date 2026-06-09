import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { canEditInvoices } from "@/lib/permissions";
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

    if (!canEditInvoices(role)) {
      return jsonError(
        "You do not have permission to update invoices",
        403
      );
    }

    const body = await req.json();

    const invoiceIds: string[] = Array.isArray(body.invoiceIds)
      ? body.invoiceIds
      : [];

    if (!invoiceIds.length) {
      return jsonError("No invoices selected", 400);
    }

    if (typeof body.isPaid !== "boolean") {
      return jsonError("Invalid payment status", 400);
    }

    const isPaid: boolean = body.isPaid;

    const { error } = await supabase
      .from("invoices")
      .update({
        is_paid: isPaid,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .in("id", invoiceIds);

    if (error) {
      console.error("Invoice payment status update failed:", error);

      return jsonError(
        "Could not update invoice payment status",
        500
      );
    }

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: isPaid
        ? "invoice_marked_paid"
        : "invoice_marked_unpaid",
      entityType: "invoice",
      metadata: {
        invoice_ids: invoiceIds,
        count: invoiceIds.length,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: unknown) {
    console.error("Invoice mark-paid route error:", error);

    return jsonError("Invoice update failed", 500);
  }
}