import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCompany } from "@/lib/current-company";
import { canManageTeam } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, companyId, role } = await requireCurrentCompany(req);

    if (!canManageTeam(role)) {
      return jsonError("You do not have permission to view team members", 403);
    }

    const { data: members, error: membersError } = await supabase
      .from("company_memberships")
      .select("id, user_id, role, is_active, created_at")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (membersError) {
      console.error("Failed to load team members:", membersError);
      return jsonError("Could not load team members", 500);
    }

    const admin = createAdminClient();

    const membersWithEmails = await Promise.all(
      (members || []).map(async (member) => {
        try {
          const { data, error } = await admin.auth.admin.getUserById(
            member.user_id
          );

          if (error) {
            console.error("Failed to load member user:", {
              userId: member.user_id,
              error,
            });

            return {
              ...member,
              email: null,
              name: null,
            };
          }

          return {
            ...member,
            email: data.user?.email ?? null,
            name:
              (data.user?.user_metadata?.full_name as string | undefined) ??
              (data.user?.user_metadata?.name as string | undefined) ??
              null,
          };
        } catch (error) {
          console.error("Failed to enrich team member:", {
            userId: member.user_id,
            error,
          });

          return {
            ...member,
            email: null,
            name: null,
          };
        }
      })
    );

    const { data: invitations, error: invitationsError } = await supabase
      .from("company_invitations")
      .select("id, email, role, expires_at, accepted_at, created_at")
      .eq("company_id", companyId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });

    if (invitationsError) {
      console.error("Failed to load team invitations:", invitationsError);
      return jsonError("Could not load invitations", 500);
    }

    return NextResponse.json({
      members: membersWithEmails,
      invitations: invitations || [],
    });
  } catch (error: unknown) {
    console.error("Team list route error:", error);
    return jsonError("Failed to load team", 500);
  }
}