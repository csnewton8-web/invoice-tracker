import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { createRequestClient } from "@/lib/supabase/request";

export async function requireCurrentCompany(req: NextRequest) {
  const { user, accessToken } = await requireAuthenticatedUser(req);

  if (!accessToken) {
    throw new Error("Unauthorized");
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
    throw new Error(error.message);
  }

  if (!membership?.company_id) {
    throw new Error("No active company found for user");
  }

  return {
    user,
    accessToken,
    supabase,
    companyId: membership.company_id as string,
    role: membership.role as "admin" | "finance" | "viewer",
  };
}