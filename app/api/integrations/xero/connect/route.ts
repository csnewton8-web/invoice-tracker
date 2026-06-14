import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireCurrentCompany(req);

    const clientId = process.env.XERO_CLIENT_ID;
    const redirectUri = process.env.XERO_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: "Xero environment variables are missing" },
        { status: 500 }
      );
    }

    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: [
        "offline_access",
        "accounting.transactions",
        "accounting.settings",
        "accounting.attachments",
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