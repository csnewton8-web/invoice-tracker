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

type XeroOAuthState = {
  id: string;
  state: string;
  company_id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
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
    const state = req.nextUrl.searchParams.get("state");

    if (!code) {
      return redirectWithStatus("error", "Missing Xero authorisation code");
    }

    if (!state) {
      return redirectWithStatus("error", "Missing Xero OAuth state");
    }

    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    const redirectUri = process.env.XERO_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectWithStatus(
        "error",
        "Xero environment variables are missing"
      );
    }

    const admin = createAdminClient();

    const { data: oauthState, error: stateError } = await admin
      .from("xero_oauth_states")
      .select("id, state, company_id, user_id, expires_at, used_at")
      .eq("state", state)
      .maybeSingle<XeroOAuthState>();

    if (stateError) {
      console.error("Failed to load Xero OAuth state:", stateError);
      return redirectWithStatus("error", "Could not validate Xero connection");
    }

    if (!oauthState) {
      return redirectWithStatus("error", "Invalid Xero OAuth state");
    }

    if (oauthState.used_at) {
      return redirectWithStatus("error", "Xero OAuth state has already been used");
    }

    if (new Date(oauthState.expires_at).getTime() < Date.now()) {
      await admin.from("xero_oauth_states").delete().eq("id", oauthState.id);

      return redirectWithStatus("error", "Xero OAuth state has expired");
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

    const now = new Date().toISOString();
    const tokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString();

    const { error: upsertError } = await admin
      .from("accounting_integrations")
      .upsert(
        {
          company_id: oauthState.company_id,
          provider: "xero",
          status: "connected",
          external_tenant_id: connection.tenantId,
          external_tenant_name: connection.tenantName,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: tokenExpiresAt,
          connected_at: now,
          updated_at: now,
        },
        {
          onConflict: "company_id,provider",
        }
      );

    if (upsertError) {
      console.error("Failed to save Xero integration:", upsertError);
      return redirectWithStatus("error", "Could not save Xero connection");
    }

    const { error: markUsedError } = await admin
      .from("xero_oauth_states")
      .update({ used_at: now })
      .eq("id", oauthState.id);

    if (markUsedError) {
      console.error("Failed to mark Xero OAuth state as used:", markUsedError);
    }

    const { error: cleanupError } = await admin
      .from("xero_oauth_states")
      .delete()
      .or(`used_at.not.is.null,expires_at.lt.${now}`);

    if (cleanupError) {
      console.error("Failed to clean up Xero OAuth states:", cleanupError);
    }

    return redirectWithStatus("success");
  } catch (error) {
    console.error("Xero callback error:", error);
    return redirectWithStatus("error", "Xero connection failed");
  }
}