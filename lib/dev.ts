import { createClient as createAdminClient } from "@supabase/supabase-js";

export function getDevUserId() {
  const userId = process.env.DEV_USER_ID;
  if (!userId) {
    throw new Error("Missing DEV_USER_ID in .env.local");
  }
  return userId;
}

export function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}