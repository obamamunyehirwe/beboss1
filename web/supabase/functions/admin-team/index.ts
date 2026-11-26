import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ROLE_PERMISSIONS: Record<string, string[]> = {
  RELEASE_MANAGER: ["releases.manage"],
  ANNOUNCEMENT_MANAGER: ["announcements.manage"],
  DEVICE_AUDITOR: ["devices.audit", "sync.view", "shops.view"],
  SUPPORT: ["inbox.manage", "shops.view"],
  FINANCE_REVIEWER: ["payments.review", "billing.view", "shops.view"],
  ANALYST: ["analytics.view", "shops.view", "sync.view"],
  OPERATIONS_MANAGER: ["shops.view", "devices.audit", "sync.view"],
  STAFF_MANAGER: ["users.manage", "shops.view"],
};
const ALLOWED_ROLES = new Set(["SUPER_ADMIN", ...Object.keys(ROLE_PERMISSIONS)]);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function requiredConfig() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PUBLIC_KEY) {
    throw new HttpError(503, "The secure administrator-team service is not configured in Supabase.");
  }
}

async function authorizeMasterAdmin(request: Request) {
  requiredConfig();
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Sign in as a BeBoss Master Admin first.");
  const token = authorization.slice(7).trim();
  if (!token || token.length > 8192) throw new HttpError(401, "Your administrator session is invalid or expired.");

  const caller = createClient(SUPABASE_URL, PUBLIC_KEY, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user?.id || !userData.user.email) {
    throw new HttpError(401, "Your administrator session is invalid or expired. Sign in again.");
  }
  const { data: allowed, error: roleError } = await caller.rpc("is_beboss_admin");
  if (roleError) throw new HttpError(503, "Supabase could not verify Master Admin permissions.");
  if (allowed !== true) throw new HttpError(403, "Only an active Master Admin can manage the BeBoss administrator team.");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { admin, userId: userData.user.id, email: userData.user.email };
}

async function writeAudit(admin: any, email: string, action: string, target: string, details: string) {
  const { error } = await admin.from("admin_audit_logs").insert({
    id: crypto.randomUUID(),
    admin_email: email,
    action,
    target_id: target,
    details: details.slice(0, 1000),
    created_at: Date.now(),
  });
  if (error) {
    console.error("[admin-team] Audit insert failed:", error.message);
    return "The access change was saved, but its audit event could not be recorded. Check the audit log before repeating the action.";
  }
  return undefined;
}

async function findAuthUsers(admin: any, requiredIds?: Set<string>) {
  const users = new Map<string, { email: string; lastSignIn: string | null }>();
  const remaining = requiredIds ? new Set(requiredIds) : undefined;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new HttpError(503, "Could not load the administrator Auth directory: " + error.message);
    for (const user of data.users) {
      if (!user.id) continue;
      users.set(user.id, {
        email: user.email ?? "unknown",
        lastSignIn: user.last_sign_in_at ?? null,
      });
      remaining?.delete(user.id);
    }
    if (data.users.length < 200 || (remaining && remaining.size === 0)) return users;
  }
  if (remaining && remaining.size > 0) {
    throw new HttpError(503, "The administrator Auth directory exceeded its safe pagination limit. Retry or contact the project owner.");
  }
  return users;
}

async function listTeam(admin: any, me: string) {
  const [rolesResult, grantsResult, profilesResult] = await Promise.all([
    admin.from("user_roles").select("user_id,role,created_at").order("created_at", { ascending: true }).limit(1000),
    admin.from("admin_role_grants").select("user_id,role_key,permissions,is_active,expires_at,granted_at").limit(1000),
    admin.from("admin_profiles").select("user_id,role,is_active").limit(1000),
  ]);
  if (rolesResult.error || grantsResult.error || profilesResult.error) {
    const detail = rolesResult.error?.message ?? grantsResult.error?.message ?? profilesResult.error?.message;
    throw new HttpError(503, "Could not load the live administrator directory: " + (detail ?? "database query failed"));
  }
  const roles = rolesResult.data ?? [];
  const grants = grantsResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const users = await findAuthUsers(admin, new Set(roles.map((row: any) => row.user_id)));
  const members = roles.map((row: any) => {
    const grant = grants.find((item: any) => item.user_id === row.user_id);
    const profile = profiles.find((item: any) => item.user_id === row.user_id);
    const auth = users.get(row.user_id);
    return {
      userId: row.user_id,
      role: row.role,
      roleKey: String(grant?.role_key ?? profile?.role ?? (row.role === "admin" ? "SUPER_ADMIN" : "SUPPORT")),
      permissions: Array.isArray(grant?.permissions) ? grant.permissions : [],
      active: profile?.is_active !== false && grant?.is_active !== false,
      expiresAt: grant?.expires_at ?? null,
      since: grant?.granted_at ?? row.created_at,
      email: auth?.email ?? "unknown",
      lastSignIn: auth?.lastSignIn ?? null,
    };
  });
  members.sort((left: any, right: any) => {
    if (left.roleKey === "SUPER_ADMIN" && right.roleKey !== "SUPER_ADMIN") return -1;
    if (right.roleKey === "SUPER_ADMIN" && left.roleKey !== "SUPER_ADMIN") return 1;
    return left.email.localeCompare(right.email);
  });
  return { members, me };
}

async function grantRole(admin: any, callerId: string, callerEmail: string, emailInput: unknown, roleInput: unknown) {
  const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
  const role = typeof roleInput === "string" ? roleInput : "";
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid administrator email address.");
  }
  if (!ALLOWED_ROLES.has(role)) throw new HttpError(400, "The selected administrator role is not supported.");

  const users = await findAuthUsers(admin);
  const existing = [...users.entries()].find(([, user]) => user.email.toLowerCase() === email);
  let userId = existing?.[0] ?? "";
  let invited = false;
  if (!userId) {
    const redirectTo = (Deno.env.get("BEBOSS_ADMIN_URL") ?? "").trim();
    let invitation;
    if (redirectTo) {
      let parsed: URL;
      try { parsed = new URL(redirectTo); } catch { throw new HttpError(503, "BEBOSS_ADMIN_URL is not a valid invitation redirect URL."); }
      if (parsed.protocol !== "https:") throw new HttpError(503, "BEBOSS_ADMIN_URL must use HTTPS.");
      invitation = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: parsed.toString() });
    } else {
      // If no override is configured, Supabase uses the project's Site URL and
      // Auth redirect allow-list; Vercel does not need a separate invite variable.
      invitation = await admin.auth.admin.inviteUserByEmail(email);
    }
    if (invitation.error) throw new HttpError(502, "Could not invite this team member: " + invitation.error.message);
    userId = invitation.data.user?.id ?? "";
    if (!userId) throw new HttpError(502, "Supabase did not return the invited user account.");
    invited = true;
  }

  if (role === "SUPER_ADMIN") {
    const { error: roleError } = await admin.from("user_roles").upsert(
      { user_id: userId, role: "admin" }, { onConflict: "user_id,role" },
    );
    if (roleError) throw new HttpError(503, "Could not grant Master Admin access: " + roleError.message);
    const { error: supportError } = await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "support");
    if (supportError) throw new HttpError(503, "Master Admin role was granted, but the support role could not be removed: " + supportError.message);
    const { error: grantError } = await admin.from("admin_role_grants").delete().eq("user_id", userId);
    if (grantError) throw new HttpError(503, "Master Admin role was granted, but the delegated role could not be removed: " + grantError.message);
    const { error: profileError } = await admin.from("admin_profiles").upsert(
      { user_id: userId, email, full_name: email, role: "SUPER_ADMIN", is_active: true },
      { onConflict: "user_id" },
    );
    if (profileError) throw new HttpError(503, "Could not save the Master Admin profile: " + profileError.message);
    const auditWarning = await writeAudit(admin, callerEmail, invited ? "INVITE_SUPER_ADMIN" : "GRANT_SUPER_ADMIN", email, "Full Master Admin access granted by " + callerId + ".");
    return { ok: true, invited, email, role, permissions: ["*"], ...(auditWarning ? { auditWarning } : {}) };
  }

  const permissions = ROLE_PERMISSIONS[role];
  const [countResult, currentMasterResult] = await Promise.all([
    admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "admin"),
    admin.from("user_roles").select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle(),
  ]);
  if (countResult.error || currentMasterResult.error) throw new HttpError(503, "Could not verify Master Admin safeguards before changing this role.");
  if (currentMasterResult.data && (countResult.count ?? 0) <= 1) {
    throw new HttpError(409, "You cannot downgrade the last Master Admin. Promote another Master Admin first.");
  }

  const { error: staffError } = await admin.from("user_roles").upsert(
    { user_id: userId, role: "support" }, { onConflict: "user_id,role" },
  );
  if (staffError) throw new HttpError(503, "Could not authorize this team member: " + staffError.message);
  const { error: demoteError } = await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
  if (demoteError) throw new HttpError(503, "Delegated role was prepared, but the Master Admin downgrade failed: " + demoteError.message);
  const { error: profileError } = await admin.from("admin_profiles").upsert(
    { user_id: userId, email, full_name: email, role, is_active: true }, { onConflict: "user_id" },
  );
  if (profileError) throw new HttpError(503, "Could not save the administrator profile: " + profileError.message);
  const { error: grantError } = await admin.from("admin_role_grants").upsert(
    { user_id: userId, role_key: role, permissions, is_active: true, granted_by: callerId, granted_at: Date.now(), expires_at: null },
    { onConflict: "user_id" },
  );
  if (grantError) throw new HttpError(503, "Could not save delegated permissions: " + grantError.message);
  const auditWarning = await writeAudit(admin, callerEmail, invited ? "INVITE_TEAM_MEMBER" : "ASSIGN_ADMIN_ROLE", email, role + ": " + permissions.join(", "));
  return { ok: true, invited, email, role, permissions, ...(auditWarning ? { auditWarning } : {}) };
}

async function revokeRole(admin: any, callerId: string, callerEmail: string, targetIdInput: unknown) {
  const userId = typeof targetIdInput === "string" ? targetIdInput.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new HttpError(400, "A valid administrator user ID is required.");
  }
  if (userId === callerId) throw new HttpError(409, "You cannot revoke your own Master Admin access from this session.");

  const [countResult, rolesResult] = await Promise.all([
    admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "admin"),
    admin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (countResult.error || rolesResult.error) throw new HttpError(503, "Could not verify the last-Master-Admin safeguard.");
  const roles = rolesResult.data ?? [];
  if (roles.some((row: any) => row.role === "admin") && (countResult.count ?? 0) <= 1) {
    throw new HttpError(409, "You cannot remove the last Master Admin.");
  }
  if (roles.length === 0) throw new HttpError(404, "No BeBoss administrator role exists for this account.");

  const { error: rolesError } = await admin.from("user_roles").delete().eq("user_id", userId);
  if (rolesError) throw new HttpError(503, "Could not revoke administrator roles: " + rolesError.message);
  const { error: grantsError } = await admin.from("admin_role_grants").delete().eq("user_id", userId);
  if (grantsError) throw new HttpError(503, "Administrator roles were removed, but delegated permissions could not be removed: " + grantsError.message);
  const { error: profileError } = await admin.from("admin_profiles").update({ is_active: false }).eq("user_id", userId);
  if (profileError) throw new HttpError(503, "Administrator roles were removed, but the profile could not be deactivated: " + profileError.message);
  const auditWarning = await writeAudit(admin, callerEmail, "REVOKE_TEAM_ACCESS", userId, "Removed all BeBoss admin-team roles and permissions by " + callerId + ".");
  return { ok: true, ...(auditWarning ? { auditWarning } : {}) };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { message: "Method not allowed." });
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 16_384) throw new HttpError(413, "The administrator-team request is too large.");
    const raw = await request.text();
    if (raw.length > 16_384) throw new HttpError(413, "The administrator-team request is too large.");
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw) as Record<string, unknown>; } catch { throw new HttpError(400, "The administrator-team request is not valid JSON."); }

    const caller = await authorizeMasterAdmin(request);
    const action = String(body.action ?? "");
    if (action === "list") return json(200, await listTeam(caller.admin, caller.userId));
    if (action === "grant") return json(200, await grantRole(caller.admin, caller.userId, caller.email, body.email, body.role));
    if (action === "revoke") return json(200, await revokeRole(caller.admin, caller.userId, caller.email, body.userId));
    throw new HttpError(400, "Unsupported administrator-team operation.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "The administrator-team operation failed.";
    if (status >= 500) console.error("[admin-team]", message);
    return json(status, { message });
  }
});
