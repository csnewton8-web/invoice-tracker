import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function requireAuthenticatedUser(req: NextRequest) {
  const supabase = await createClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  const {
    data: { user },
    error,
  } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return { supabase, user, accessToken: token };
}