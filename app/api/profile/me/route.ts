import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initialsFromName(name?: string | null, email?: string | null) {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
  }

  return (email || "FF").slice(0, 2).toUpperCase();
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await requireAuthenticatedUser(req);

    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const fullName =
      data?.full_name ||
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null);

    return NextResponse.json({
      profile: {
        id: user.id,
        email: data?.email || user.email || null,
        full_name: fullName,
        initials: initialsFromName(fullName, user.email),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load profile" },
      { status: 500 }
    );
  }
}