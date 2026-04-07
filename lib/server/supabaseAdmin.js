import "server-only";
import { createClient } from "@supabase/supabase-js";
import { dbEnv } from "@/lib/env/db";

let _client;

export function supabaseAdmin() {
  if (_client) return _client;
  _client = createClient(dbEnv.SUPABASE_URL, dbEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return _client;
}
