import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invoiceId = req.nextUrl.searchParams.get("invoiceId");

  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, file_path")
    .eq("id", invoiceId)
    .eq("user_id", userData.user.id)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const admin = getAdmin();
  const bucket = process.env.INVOICE_STORAGE_BUCKET || "invoices";

  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(invoice.file_path, 60 * 10);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not create signed URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}