/**
 * Supabase API keys are opaque printable strings and must not contain whitespace.
 * Copy/paste into deployment dashboards can accidentally introduce spaces or
 * line breaks; remove those before the SDK builds an HTTP header.
 */
export function normalizeSupabaseApiKey(value: string, variableName: string): string {
  const normalized = value.replace(/\s+/gu, "");
  if (normalized !== value) {
    console.warn(
      "[Supabase] Whitespace was removed from " + variableName +
        ". Update the deployment variable with the exact key from Supabase Settings → API Keys.",
    );
  }
  if (!normalized || /[^\x21-\x7E]/u.test(normalized)) {
    throw new Error(
      variableName +
        " is not a valid Supabase API key. Replace it with the exact key from Supabase Settings → API Keys.",
    );
  }
  return normalized;
}

/**
 * Resolve a backend-only Supabase credential.
 *
 * Supabase recommends the newer secret API key. Keep the legacy service_role
 * variable as a fallback so existing BeBoss deployments continue to work.
 * Never call this from browser code or expose the result through Vite define.
 */
export function resolveSupabaseSecretKey(
  env: Record<string, string | undefined>,
): string | undefined {
  const secretKey = env["SUPABASE_SECRET_KEY"];
  if (secretKey) return normalizeSupabaseApiKey(secretKey, "SUPABASE_SECRET_KEY");

  const legacyServiceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (legacyServiceRoleKey) {
    return normalizeSupabaseApiKey(legacyServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY");
  }

  return undefined;
}
