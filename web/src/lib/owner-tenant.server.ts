import { createClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";
import { resolveSupabaseSecretKey } from "../integrations/supabase/api-key";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(apiKey) && headers.get("Authorization") === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Creates a fresh server-only privileged client for one already-verified owner
 * session. The tenant header is never accepted from the browser and is never
 * stored in a shared singleton; callers must still filter every table operation
 * by the verified shop key and owner identity.
 */
export function createShopAdminClient(shopSyncKey: string) {
  const tenantKey = shopSyncKey.trim();
  if (!tenantKey) throw new Error("A verified shop tenant is required.");

  const supabaseUrl = process.env["SUPABASE_URL"];
  const secretKey = resolveSupabaseSecretKey(process.env);
  if (!supabaseUrl || !secretKey) {
    throw new Error("The secure shop data service is not configured.");
  }

  return createClient<Database>(supabaseUrl, secretKey, {
    global: {
      fetch: createSupabaseFetch(secretKey),
      headers: { "X-Shop-Sync-Key": tenantKey },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
