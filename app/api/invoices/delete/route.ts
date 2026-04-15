import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const invoiceIds: string[] = Array.isArray(body.invoiceIds) ? body.invoiceIds : [];

    if (!invoiceIds.length) {
      return NextResponse.json({ error: "No invoices selected" }, { status: 400 });
    }

    const { data: invoices, error: fetchError } = await supabase
      .from("invoices")
      .select("id, file_path")
      .eq("user_id", userData.user.id)
      .in("id", invoiceIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const filePaths = (invoices || [])
      .map((invoice) => invoice.file_path)
      .filter(Boolean);

    const admin = getAdmin();
    const bucket = process.env.INVOICE_STORAGE_BUCKET || "invoices";

    if (filePaths.length > 0) {
      const { error: storageError } = await admin.storage
        .from(bucket)
        .remove(filePaths);

      if (storageError) {
        return NextResponse.json({ error: storageError.message }, { status: 500 });
      }
    }

    const { error: deleteError } = await supabase
      .from("invoices")
      .delete()
      .eq("user_id", userData.user.id)
      .in("id", invoiceIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}