import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data, error } = await supabase
      .from("accounting_integrations")
      .select(
        `
          id,
          provider,
          status,
          external_tenant_id,
          external_tenant_name,
          connected_at,
          created_at,
          updated_at
        `
      )
      .eq("company_id", companyId)
      .order("provider");

    if (error) {
      console.error("Accounting integrations query error:", error);
      return jsonError("Failed to load accounting integrations", 500);
    }

    return NextResponse.json({
      integrations: data || [],
    });
  } catch (error) {
    console.error("Accounting integrations route error:", error);
    return jsonError("Failed to load accounting integrations", 500);
  }
}