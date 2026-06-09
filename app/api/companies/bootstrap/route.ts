import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError, requireAuthenticatedUser } from "@/lib/auth";
import { createRequestClient } from "@/lib/supabase/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function titleCase(value: string) {
  return value
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildCompanyName(email: string) {
  const [localPart, domainPart] = email.split("@");

  if (domainPart) {
    const domainName = domainPart.split(".")[0];
    if (domainName && domainName.length > 1) {
      return `${titleCase(domainName)} Ltd`;
    }
  }

  return `${titleCase(localPart || "My Company")} Ltd`;
}

function buildCompanySlug(source: string) {
  const base = slugify(source);
  return base || `company-${Math.random().toString(36).slice(2, 8)}`;
}

function pickBestExistingCompany(
  companies: Array<{
    id: string;
    plan: string | null;
    subscription_status: string | null;
    created_at: string | null;
  }>
) {
  const paidCompany = companies.find(
    (company) =>
      company.plan === "starter" &&
      ["active", "trialing", "past_due"].includes(
        company.subscription_status || ""
      )
  );

  if (paidCompany) return paidCompany;

  const starterCompany = companies.find((company) => company.plan === "starter");
  if (starterCompany) return starterCompany;

  return companies[0] || null;
}

function logBootstrapError(message: string, error: unknown) {
  console.error("[companies/bootstrap]", message, error);
}

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { user, accessToken } = await requireAuthenticatedUser(req);

    if (!accessToken) {
      return errorResponse("Unauthorized", 401);
    }

    const userClient = createRequestClient(accessToken);

    const { data: activeMembership, error: activeMembershipError } =
      await userClient
        .from("company_memberships")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

    if (activeMembershipError) {
      logBootstrapError("Failed to check active membership", activeMembershipError);
      return errorResponse("Unable to check your company access.");
    }

    if (activeMembership?.company_id) {
      return NextResponse.json({
        ok: true,
        companyId: activeMembership.company_id,
        created: false,
      });
    }

    const admin = createAdminClient();

    let fullName: string | null = null;
    let requestedCompanyName: string | null = null;

    try {
      const body = await req.json();

      if (typeof body?.fullName === "string" && body.fullName.trim()) {
        fullName = body.fullName.trim().slice(0, 120);
      }

      if (typeof body?.companyName === "string" && body.companyName.trim()) {
        requestedCompanyName = body.companyName.trim().slice(0, 120);
      }
    } catch {
      fullName = null;
      requestedCompanyName = null;
    }

    const metadataName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.trim()
        : null;

    const { error: profileError } = await admin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      full_name: fullName || metadataName || null,
    });

    if (profileError) {
      logBootstrapError("Failed to upsert profile", profileError);
      return errorResponse("Unable to prepare your profile.");
    }

    const { data: existingMemberships, error: existingMembershipsError } =
      await admin
        .from("company_memberships")
        .select("id, company_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    if (existingMembershipsError) {
      logBootstrapError(
        "Failed to load existing memberships",
        existingMembershipsError
      );
      return errorResponse("Unable to check your existing companies.");
    }

    if (existingMemberships && existingMemberships.length > 0) {
      const firstMembership = existingMemberships[0];

      const { error: deactivateMembershipsError } = await admin
        .from("company_memberships")
        .update({ is_active: false })
        .eq("user_id", user.id);

      if (deactivateMembershipsError) {
        logBootstrapError(
          "Failed to deactivate existing memberships",
          deactivateMembershipsError
        );
        return errorResponse("Unable to update your company access.");
      }

      const { error: activateMembershipError } = await admin
        .from("company_memberships")
        .update({ is_active: true })
        .eq("id", firstMembership.id);

      if (activateMembershipError) {
        logBootstrapError(
          "Failed to activate selected membership",
          activateMembershipError
        );
        return errorResponse("Unable to update your company access.");
      }

      return NextResponse.json({
        ok: true,
        companyId: firstMembership.company_id,
        created: false,
      });
    }

    const email = user.email?.trim().toLowerCase();

    if (!email) {
      return errorResponse("User email missing", 400);
    }

    const { data: existingCompanies, error: existingCompaniesError } =
      await admin
        .from("companies")
        .select("id, plan, subscription_status, created_at")
        .eq("billing_email", email)
        .order("created_at", { ascending: true });

    if (existingCompaniesError) {
      logBootstrapError("Failed to load companies by billing email", existingCompaniesError);
      return errorResponse("Unable to check your company.");
    }

    const existingCompany = pickBestExistingCompany(existingCompanies || []);

    if (existingCompany?.id) {
      const { error: membershipError } = await admin
        .from("company_memberships")
        .insert({
          company_id: existingCompany.id,
          user_id: user.id,
          role: "admin",
          is_active: true,
          invited_by: user.id,
        });

      if (membershipError) {
        logBootstrapError("Failed to create membership", membershipError);
        return errorResponse("Unable to create your company access.");
      }

      return NextResponse.json({
        ok: true,
        companyId: existingCompany.id,
        created: false,
      });
    }

    const companyName = requestedCompanyName || buildCompanyName(email);
    const companySlug = `${buildCompanySlug(companyName)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const { data: company, error: companyError } = await admin
      .from("companies")
      .insert({
        name: companyName,
        slug: companySlug,
        billing_email: email,
        plan: "free",
        is_active: true,
        invoice_upload_count: 0,
      })
      .select("id")
      .single();

    if (companyError || !company?.id) {
      logBootstrapError("Failed to create company", companyError);
      return errorResponse("Unable to create your company.");
    }

    const { error: membershipError } = await admin
      .from("company_memberships")
      .insert({
        company_id: company.id,
        user_id: user.id,
        role: "admin",
        is_active: true,
        invited_by: user.id,
      });

    if (membershipError) {
      logBootstrapError("Failed to create company membership", membershipError);
      return errorResponse("Unable to create your company access.");
    }

    return NextResponse.json({
      ok: true,
      companyId: company.id,
      created: true,
    });
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status);
    }

    logBootstrapError("Unexpected bootstrap failure", error);
    return errorResponse("Failed to bootstrap company.");
  }
}
