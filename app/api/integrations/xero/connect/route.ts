import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId, user } = await requireCurrentCompany(req);

    const clientId = process.env.XERO_CLIENT_ID;
    const redirectUri = process.env.XERO_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: "Xero environment variables are missing" },
        { status: 500 }
      );
    }

    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: stateError } = await supabase.from("xero_oauth_states").insert({
      state,
      company_id: companyId,
      user_id: user.id,
      expires_at: expiresAt,
    });

    if (stateError) {
      console.error("Failed to create Xero OAuth state:", stateError);

      return NextResponse.json(
        { error: "Failed to start Xero connection" },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: [
        "offline_access",
        "accounting.invoices",
        "accounting.invoices.read",
        "accounting.contacts.read",
        "accounting.settings.read",
        "accounting.attachments",
        "accounting.attachments.read",
      ].join(" "),
      state,
    });

    const authUrl = `https://login.xero.com/identity/connect/authorize?${params.toString()}`;

    console.log("XERO AUTH DEBUG", {
      redirectUri,
      authUrl,
    });

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error("Xero connect error:", error);

    return NextResponse.json(
      { error: "Failed to start Xero connection" },
      { status: 500 }
    );
  }
}