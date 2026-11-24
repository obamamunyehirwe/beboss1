import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Server-side public Supabase client. Tenant access must use verified user JWTs and owner membership, never a deterministic shop key header. */
export function createPublicClient() {
  const url =
    process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) {
    const missing = [
      ...(!url ? ["SUPABASE_URL or VITE_SUPABASE_URL"] : []),
      ...(!key ? ["SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Missing public Supabase configuration: ${missing.join(", ")}`);
  }

  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}
