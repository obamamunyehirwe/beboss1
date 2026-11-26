/**
 * Supabase API keys are opaque printable strings and must not contain whitespace.
 * Copy/paste into deployment dashboards can accidentally introduce spaces or
 * line breaks; remove those before the SDK builds an HTTP header.
 */
export function normalizeSupabaseApiKey(value: string, variableName: string): string {
  const normalized = value.replace(/\\s+/gu, "");
  if (normalized !== value) {
    console.warn(
      `[Supabase] Whitespace was removed from ${variableName}. Update the deployment variable with the exact key from Supabase Settings → API Keys.`,
    );
  }
  if (!normalized || /[^\\x21-\\x7E]/u.test(normalized)) {
    throw new Error(
      `${variableName} is not a valid Supabase API key. Replace it with the exact key from Supabase Settings → API Keys.`,
    );
  }
  return normalized;
}
