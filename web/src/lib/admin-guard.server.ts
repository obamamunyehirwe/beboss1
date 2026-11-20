/* Server-only helpers shared by admin server functions: role checks + audit trail. */
export type AdminCtx = { supabase: any; userId: string; claims: any };

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

/** Reads a server-only secret from env first, then the service-role-only app_secrets table. */
export async function readServerSecret(name: string): Promise<string | null> {
  const fromEnv = process.env[name];
  if (fromEnv && fromEnv.trim().length >= 8) return fromEnv.trim();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_secrets").select("value").eq("name", name).maybeSingle();
  const v = String(data?.value ?? "").trim();
  return v.length >= 8 ? v : null;
}
