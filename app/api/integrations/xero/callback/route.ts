import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type XeroTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

type XeroConnection = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType?: string;
  createdDateUtc?: string;
  updatedDateUtc?: string;
};

function redirectWithStatus(status: "success" | "error", message?: string) {
  const url = new URL("https://flashfox.co.uk/invoices");
  url.searchParams.set("xero", status);

  if (message) {
    url.searchParams.set("message", message);
  }

  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");

    if (!code) {
      return redirectWithStatus("error", "Missing Xero authorisation code");
    }

    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    const redirectUri = process.env.XERO_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectWithStatus("error", "Xero environment variables are missing");
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );

    const tokenRes = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenBody = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Xero token exchange failed:", tokenBody);
      return redirectWithStatus("error", "Xero token exchange failed");
    }

    const tokenData = tokenBody as XeroTokenResponse;

    const connectionsRes = await fetch("https://api.xero.com/connections", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    const connectionsBody = await connectionsRes.json();

    if (!connectionsRes.ok) {
      console.error("Xero connections fetch failed:", connectionsBody);
      return redirectWithStatus("error", "Could not load Xero organisation");
    }

    const connections = connectionsBody as XeroConnection[];
    const connection = connections[0];

    if (!connection) {
      return redirectWithStatus("error", "No Xero organisation selected");
    }

    const admin = createAdminClient();

    /*
      Temporary MVP behaviour:
      Store this Xero connection against the first existing xero integration row.

      Next refinement:
      Use a signed OAuth state parameter to map the callback securely to the
      exact FlashFox company/user that started the connection.
    */
    const { data: existingRows, error: existingError } = await admin
      .from("accounting_integrations")
      .select("id, company_id")
      .eq("provider", "xero")
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingError) {
      console.error("Failed to load existing Xero integration:", existingError);
      return redirectWithStatus("error", "Could not find FlashFox workspace");
    }

    const existing = existingRows?.[0];

    if (!existing?.company_id) {
      return redirectWithStatus(
        "error",
        "No FlashFox Xero integration row exists"
      );
    }

    const tokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString();

    const { error: upsertError } = await admin
      .from("accounting_integrations")
      .upsert(
        {
          company_id: existing.company_id,
          provider: "xero",
          status: "connected",
          external_tenant_id: connection.tenantId,
          external_tenant_name: connection.tenantName,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: tokenExpiresAt,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "company_id,provider",
        }
      );

    if (upsertError) {
      console.error("Failed to save Xero integration:", upsertError);
      return redirectWithStatus("error", "Could not save Xero connection");
    }

    return redirectWithStatus("success");
  } catch (error) {
    console.error("Xero callback error:", error);
    return redirectWithStatus("error", "Xero connection failed");
  }
}