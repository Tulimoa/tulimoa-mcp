import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { Env } from "./types";

// Read-only Anon-Client, gebaut wie src/lib/supabase/admin.ts (aber Anon statt
// Service-Role). Pro Request konstruieren, nie modul-global cachen (CF-Worker
// dürfen fetch-nutzende Clients nicht über Requests hinweg teilen).
export function makeSupabase(env: Env) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SupabaseClient = ReturnType<typeof makeSupabase>;
