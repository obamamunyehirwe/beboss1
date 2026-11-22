/* Server-only helpers shared by admin server functions: role checks + audit trail. */
export type AdminCtx = { supabase: any; userId: string; claims: any; accessToken: string };

export async function requireStaffRole(context: AdminCtx, adminOnly: boolean) {
  const { data, error } = await context.supabase.rpc(adminOnly ? "is_beboss_admin" : "is_beboss_staff");
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  if (!data) throw new Error(adminOnly ? "Forbidden: master admin access required." : "Forbidden: staff access required.");
  const email = String(context.claims?.email ?? "admin");
  return { email, label: `BeBoss Admin (${email})` };
}

export async function writeAudit(context: AdminCtx, email: string, action: string, target: string, details: string) {
  await context.supabase.from("admin_audit_logs").insert({
    id: crypto.randomUUID(),
    admin_email: email,
    action,
    target_id: target,
    details: details.slice(0, 1000),
    created_at: Date.now(),
  });
}

/** Invoke a Supabase Edge Function using the current user's verified JWT.
 * Privileged secrets stay inside Supabase Edge Functions, never in Vercel or the browser.
 */
export async function invokeSupabaseEdgeFunction<T = Record<string, unknown>>(
  context: AdminCtx,
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const supabaseUrl = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase URL or publishable key is missing from the server environment.");
  }
  if (!context.accessToken) {
    throw new Error("Your administrator session is missing. Sign in again.");
  }

  const response = await fetch(supabaseUrl.replace(/\/+$/, "") + "/functions/v1/" + encodeURIComponent(functionName), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": publishableKey,
      "Authorization": "Bearer " + context.accessToken,
    },
    body: JSON.stringify(body),
  });
  let result: Record<string, unknown> = {};
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === "object") result = parsed as Record<string, unknown>;
  } catch {
    result = {};
  }
  if (!response.ok) {
    const message = typeof result.message === "string" ? result.message : "Supabase service request failed (" + response.status + ").";
    throw new Error(message);
  }
  return result as T;
}
