import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId } = await requireCurrentCompany(req);

    const { data, error } = await supabase
      .from("user_app_settings")
      .select("user_id, company_id, pay_link_url, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      pay_link_url: data?.[0]?.pay_link_url || "",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Load failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, companyId, user } = await requireCurrentCompany(req);
    const body = await req.json();

    const payLinkUrl =
      typeof body.payLinkUrl === "string" ? body.payLinkUrl.trim() : "";

    const { data: existingRows, error: fetchError } = await supabase
      .from("user_app_settings")
      .select("user_id, company_id, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existingRows || existingRows.length === 0) {
      const { error: insertError } = await supabase
        .from("user_app_settings")
        .insert({
          user_id: user.id,
          company_id: companyId,
          pay_link_url: payLinkUrl,
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Update all rows for this company to the same pay link
    const { error: updateError } = await supabase
      .from("user_app_settings")
      .update({
        pay_link_url: payLinkUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Save failed" },
      { status: 500 }
    );
  }
}