import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const invoiceIds: string[] = Array.isArray(body.invoiceIds) ? body.invoiceIds : [];
    const isPaid: boolean = Boolean(body.isPaid);

    if (!invoiceIds.length) {
      return NextResponse.json({ error: "No invoices selected" }, { status: 400 });
    }

    const { error } = await supabase
      .from("invoices")
      .update({ is_paid: isPaid })
      .eq("user_id", userData.user.id)
      .in("id", invoiceIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}