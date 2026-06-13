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
    const { supabase, companyId, role, user } = await requireCurrentCompany(req);

    if (!canEditInvoices(role)) {
      return jsonError("You do not have permission to edit invoices", 403);
    }

    const body = await req.json();
    const id = body.id;

    if (!id || typeof id !== "string") {
      return jsonError("Missing invoice ID", 400);
    }

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
      "archived_at",
      "review_status",
      "reviewed_at",
      "reviewed_by",
    ];

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const updatedFields: string[] = [];

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
        updatedFields.push(field);
      }
    }

    if ("review_status" in body) {
      const reviewStatus = body.review_status;

      if (
        reviewStatus !== "pending_review" &&
        reviewStatus !== "approved" &&
        reviewStatus !== "needs_attention"
      ) {
        return jsonError("Invalid review status", 400);
      }

      if (reviewStatus === "approved" || reviewStatus === "needs_attention") {
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = user.id;

        if (!updatedFields.includes("reviewed_at")) {
          updatedFields.push("reviewed_at");
        }

        if (!updatedFields.includes("reviewed_by")) {
          updatedFields.push("reviewed_by");
        }
      }

      if (reviewStatus === "pending_review") {
        updateData.reviewed_at = null;
        updateData.reviewed_by = null;

        if (!updatedFields.includes("reviewed_at")) {
          updatedFields.push("reviewed_at");
        }

        if (!updatedFields.includes("reviewed_by")) {
          updatedFields.push("reviewed_by");
        }
      }
    }

    if (updatedFields.length === 0) {
      return jsonError("No valid invoice fields supplied", 400);
    }

    const { data, error } = await supabase
      .from("invoices")
      .update(updateData)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      console.error("Invoice update database error:", error);
      return jsonError("Could not update invoice", 500);
    }

    await createAuditLog({
      supabase,
      companyId,
      userId: user.id,
      action: "invoice_updated",
      entityType: "invoice",
      entityId: data.id,
      metadata: {
        updated_fields: updatedFields,
        invoice_number: data.invoice_number,
        supplier: data.supplier,
        archived_at: data.archived_at,
        review_status: data.review_status,
        reviewed_at: data.reviewed_at,
        reviewed_by: data.reviewed_by,
      },
    });

    return NextResponse.json({ success: true, invoice: data });
  } catch (error: unknown) {
    console.error("Invoice update error:", error);
    return jsonError("Invoice update failed", 500);
  }
}