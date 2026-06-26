import { NextRequest } from "next/server";
import { HttpError, requireAuthenticatedUser } from "@/lib/auth";
import { createRequestClient } from "@/lib/supabase/request";
import type { CompanyRole } from "@/lib/permissions";
export type { CompanyRole } from "@/lib/permissions";

export async function requireCurrentCompany(req: NextRequest) {
  const { user, accessToken } = await requireAuthenticatedUser(req);

  if (!accessToken) {
    throw new HttpError(401, "Missing access token");
  }

  const supabase = createRequestClient(accessToken);

  const { data: membership, error } = await supabase
    .from("company_memberships")
    .select("company_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load company membership:", error);
    throw new HttpError(500, "Could not load company membership");
  }

  if (!membership?.company_id) {
    throw new HttpError(403, "No active company found for this user");
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, is_active, deleted_at")
    .eq("id", membership.company_id)
    .maybeSingle();

  if (companyError) {
    console.error("Failed to load current company:", companyError);
    throw new HttpError(500, "Could not load company account");
  }

  if (!company) {
    throw new HttpError(403, "Company account not found");
  }

  if (!company.is_active || company.deleted_at) {
    throw new HttpError(403, "This company account is inactive");
  }

  const role = normalizeCompanyRole(membership.role);

  return {
    user,
    accessToken,
    supabase,
    companyId: membership.company_id as string,
    role,
  };
}

export function normalizeCompanyRole(role: unknown): CompanyRole {
  if (
    role === "owner" ||
    role === "admin" ||
    role === "member" ||
    role === "viewer"
  ) {
    return role;
  }

  if (role === "finance") {
    return "member";
  }

  return "viewer";
}

export function requireCompanyRole(
  role: CompanyRole,
  allowed: CompanyRole[]
) {
  if (!allowed.includes(role)) {
    throw new HttpError(403, "You do not have permission to perform this action");
  }
}