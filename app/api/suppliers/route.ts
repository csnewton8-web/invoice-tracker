import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSupplierName(name: string) {
  return name
    .toLowerCase()
    .replace(/\bltd\b/g, "limited")
    .replace(/\beng\b/g, "engineering")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPaymentUrl(value: unknown) {
  const url = typeof value === "string" ? value.trim() : "";

  if (!url) return null;

  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Payment URL must start with http:// or https://");
  }

  return url;
}

function errorResponse(error: unknown, fallback: string) {
  console.error(fallback, error);

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : fallback;

  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data: savedSuppliers, error: supplierError } = await supabase
      .from("suppliers")
      .select("id, name, normalized_name, payment_url")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (supplierError) throw supplierError;

    const { data: invoiceSuppliers, error: invoiceError } = await supabase
      .from("invoices")
      .select("supplier")
      .eq("company_id", companyId)
      .not("supplier", "is", null);

    if (invoiceError) throw invoiceError;

    const supplierMap = new Map<
      string,
      {
        id: string;
        name: string;
        normalized_name: string;
        payment_url: string | null;
      }
    >();

    for (const supplier of savedSuppliers || []) {
      supplierMap.set(supplier.normalized_name, {
        id: supplier.id,
        name: supplier.name,
        normalized_name: supplier.normalized_name,
        payment_url: supplier.payment_url || null,
      });
    }

    for (const row of invoiceSuppliers || []) {
      const name = typeof row.supplier === "string" ? row.supplier.trim() : "";

      if (!name) continue;

      const normalizedName = normalizeSupplierName(name);

      if (!supplierMap.has(normalizedName)) {
        supplierMap.set(normalizedName, {
          id: `invoice-${normalizedName}`,
          name,
          normalized_name: normalizedName,
          payment_url: null,
        });
      }
    }

    return NextResponse.json({
      suppliers: Array.from(supplierMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    });
  } catch (error) {
    return errorResponse(error, "Failed to load suppliers");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);
    const body = await req.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const paymentUrl = cleanPaymentUrl(body.payment_url);

    if (!name) {
      return NextResponse.json(
        { error: "Supplier name is required" },
        { status: 400 }
      );
    }

    const normalizedName = normalizeSupplierName(name);

    const { data, error } = await supabase
      .from("suppliers")
      .upsert(
        {
          company_id: companyId,
          name,
          normalized_name: normalizedName,
          payment_url: paymentUrl,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "company_id,normalized_name",
        }
      )
      .select("id, name, normalized_name, payment_url")
      .single();

    if (error) throw error;

    return NextResponse.json({
      supplier: data,
    });
  } catch (error) {
    return errorResponse(error, "Failed to save supplier");
  }
}