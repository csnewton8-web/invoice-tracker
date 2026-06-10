import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { canManageCompanySettings } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET(req: NextRequest) {
  try {
    const { companyId } = await requireCurrentCompany(req);
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("email_forwarding_senders")
      .select("id, email, is_active, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load forwarding senders:", error);
      return jsonError("Failed to load forwarding addresses", 500);
    }

    return NextResponse.json({ senders: data || [] });
  } catch (error) {
    console.error("Forwarding senders GET error:", error);
    return jsonError("Failed to load forwarding addresses", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, user, role } = await requireCurrentCompany(req);

    if (!canManageCompanySettings(role)) {
      return jsonError("You do not have permission to manage forwarding addresses", 403);
    }

    const body = await req.json();
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !isValidEmail(email)) {
      return jsonError("Enter a valid email address", 400);
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("email_forwarding_senders")
      .insert({
        company_id: companyId,
        user_id: user.id,
        email,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id, email, is_active, created_at")
      .single();

    if (error) {
      if (error.message?.toLowerCase().includes("duplicate")) {
        return jsonError(
          "This forwarding address is already connected to a FlashFox workspace.",
          409
        );
      }

      console.error("Failed to add forwarding sender:", error);
      return jsonError("Could not add forwarding address", 500);
    }

    return NextResponse.json({ sender: data });
  } catch (error) {
    console.error("Forwarding senders POST error:", error);
    return jsonError("Failed to add forwarding address", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId, role } = await requireCurrentCompany(req);

    if (!canManageCompanySettings(role)) {
      return jsonError("You do not have permission to manage forwarding addresses", 403);
    }

    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";

    if (!id) {
      return jsonError("Missing forwarding address ID", 400);
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from("email_forwarding_senders")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      console.error("Failed to remove forwarding sender:", error);
      return jsonError("Could not remove forwarding address", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forwarding senders DELETE error:", error);
    return jsonError("Failed to remove forwarding address", 500);
  }
}