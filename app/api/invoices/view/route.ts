import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getInvoiceId(value: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 100) {
    return null;
  }

  return trimmed;
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { searchParams } = new URL(req.url);
    const invoiceId = getInvoiceId(searchParams.get("invoiceId"));

    if (!invoiceId) {
      return NextResponse.json(
        { error: "A valid invoiceId is required" },
        { status: 400 }
      );
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, company_id, file_path, file_name")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.file_path) {
      return NextResponse.json(
        { error: "Invoice file path is missing" },
        { status: 500 }
      );
    }

    const bucket = process.env.INVOICE_STORAGE_BUCKET || "invoices";
    const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

    if (!hasSupabaseUrl || !hasServiceRoleKey) {
      return NextResponse.json(
        {
          error: "Supabase admin environment variables are missing",
          debug: {
            hasSupabaseUrl,
            hasServiceRoleKey,
            bucket,
          },
        },
        { status: 500 }
      );
    }

    const admin = createAdminClient();

    const { data: signed, error: signedError } = await admin.storage
      .from(bucket)
      .createSignedUrl(invoice.file_path, 60 * 5);

    if (signedError || !signed?.signedUrl) {
      const folderPath = invoice.file_path.split("/").slice(0, -1).join("/");

      const { data: fileCheck, error: fileCheckError } = await admin.storage
        .from(bucket)
        .list(folderPath, { limit: 100 });

      return NextResponse.json(
        {
          error:
            signedError?.message || "Failed to generate secure PDF access URL",
          debug: {
            invoiceId,
            companyId,
            bucket,
            filePath: invoice.file_path,
            signedError: signedError?.message || null,
            fileCheckError: fileCheckError?.message || null,
            fileCheckCount: fileCheck?.length ?? 0,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: signed.signedUrl,
      fileName: invoice.file_name,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load PDF";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}