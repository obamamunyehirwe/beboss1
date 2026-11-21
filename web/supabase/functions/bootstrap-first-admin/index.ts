const ALLOWED_ADMIN_ORIGINS = new Set([
  "https://admin.beboss.rw",
  "https://beboss.rw",
  "https://www.beboss.rw",
  // Local Vite/preview development only. No arbitrary HTTP or wildcard origins.
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);
const ADMIN_ORIGIN = "https://admin.beboss.rw";

function isAllowedOrigin(origin: string | null): origin is string {
  return Boolean(origin && ALLOWED_ADMIN_ORIGINS.has(origin));
}

function corsHeadersFor(origin: string | null, request?: Request): HeadersInit {
  const allowed = isAllowedOrigin(origin);
  const requestedHeaders = request?.headers.get("access-control-request-headers");
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    // Echo only the browser's preflight header list; this supports current
    // supabase-js client headers without maintaining a stale hard-coded list.
    "Access-Control-Allow-Headers": requestedHeaders ?? "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin, Access-Control-Request-Headers",
    "Content-Type": "application/json; charset=utf-8",
  };
}

const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\\/+$/, "");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(status: number, body: Record<string, unknown>, origin: string | null, request?: Request) {
  return new Response(JSON.stringify(body), { status, headers: corsHeadersFor(origin, request) });
}

async function rest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) {
      return new Response("forbidden", { status: 403, headers: corsHeadersFor(null, request) });
    }
    return new Response(null, { status: 204, headers: corsHeadersFor(origin, request) });
  }
  if (request.method !== "POST") {
    return json(405, { status: "error", message: "Method not allowed." }, origin, request);
  }
  if (!isAllowedOrigin(origin)) {
    return json(403, { status: "error", message: "First-admin invitations can only be requested from an official BeBoss web origin." }, null, request);
  }

  try {
    if (!supabaseUrl || !serviceRoleKey) throw new Error("First-admin invitation service is not configured.");
    const redirectTo = new URL("/reset-password?invite=1", ADMIN_ORIGIN).toString();

    const allowlistResponse = await rest("admin_bootstrap_emails?select=email&limit=2");
    if (!allowlistResponse.ok) throw new Error("Could not read the approved first-admin email list.");
    const allowlist = await allowlistResponse.json();
    if (!Array.isArray(allowlist) || allowlist.length !== 1) {
      throw new Error("First-admin setup requires exactly one approved email address.");
    }
    const email = String(allowlist[0]?.email ?? "").trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw new Error("The approved administrator email is invalid.");

    const roleResponse = await rest("user_roles?select=user_id&role=eq.admin&limit=1");
    if (!roleResponse.ok) throw new Error("Could not verify whether a master administrator already exists.");
    const roles = await roleResponse.json();
    if (roles.length) return json(200, { status: "already_configured" }, origin, request);

    let existingUser: Record<string, unknown> | null = null;
    for (let page = 1; page <= 20; page++) {
      const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (!userResponse.ok) throw new Error("Could not check the approved administrator account.");
      const userBody = await userResponse.json();
      const users = Array.isArray(userBody?.users) ? userBody.users : [];
      existingUser = users.find((user: Record<string, unknown>) =>
        String(user.email ?? "").trim().toLowerCase() === email
      ) ?? null;
      if (existingUser || users.length < 200) break;
    }

    if (existingUser) {
      const userId = String(existingUser.id ?? "");
      const confirmed = Boolean(existingUser.email_confirmed_at);
      if (!confirmed) {
        // The first invite may already have been sent but left unaccepted.
        // Resend a confirmation link to the single allow-listed address so
        // the existing auth.users confirmation trigger can grant its admin role.
        const resend = await fetch(`${supabaseUrl}/auth/v1/resend`, {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "signup",
            email,
            options: { emailRedirectTo: redirectTo },
          }),
        });
        const resendBody = await resend.json().catch(() => ({}));
        if (!resend.ok) {
          const message = String(
            resendBody?.msg ?? resendBody?.message ?? resendBody?.error_description ??
            "Supabase could not resend the administrator confirmation email.",
          );
          return json(resend.status === 429 ? 429 : 502, { status: "error", message }, origin, request);
        }
        return json(200, { status: "sent", email, resent: true }, origin, request);
      }

      // Repair a missed role/profile trigger only after the allow-listed mailbox is confirmed.
      const roleInsert = await rest("user_roles", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: userId, role: "admin" }),
      });
      if (!roleInsert.ok) throw new Error("The email is confirmed, but the admin role could not be repaired.");
      const profileInsert = await rest("admin_profiles", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: userId, email, full_name: "BeBoss Master Admin", role: "SUPER_ADMIN", is_active: true }),
      });
      if (!profileInsert.ok) throw new Error("The email is confirmed, but the admin profile could not be repaired.");
      return json(200, { status: "account_repaired", email }, origin, request);
    }

    // Unique service-only reservation prevents concurrent duplicate invitations.
    const markerName = "BEBOSS_INITIAL_ADMIN_INVITE_SENT";
    const reservation = `PENDING:${Date.now()}`;
    const reserve = await rest("app_secrets", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        name: markerName,
        value: reservation,
        updated_by: "first-admin-bootstrap",
        updated_at: new Date().toISOString(),
      }),
    });
    if (!reserve.ok) {
      if (reserve.status === 409) return json(200, { status: "already_sent", email }, origin, request);
      throw new Error("Could not reserve the one-time invitation. Check app_secrets permissions.");
    }

    const inviteUrl = `${supabaseUrl}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`;
    const invite = await fetch(inviteUrl, {
      method: "POST",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, data: { full_name: "BeBoss Master Admin" } }),
    });
    const inviteBody = await invite.json().catch(() => ({}));
    if (!invite.ok) {
      await rest(`app_secrets?name=eq.${encodeURIComponent(markerName)}&value=eq.${encodeURIComponent(reservation)}`, { method: "DELETE" });
      const errorText = String(inviteBody?.msg ?? inviteBody?.message ?? inviteBody?.error_description ?? "Supabase could not send the invitation.");
      return json(invite.status === 429 ? 429 : 502, { status: "error", message: errorText }, origin, request);
    }

    await rest(`app_secrets?name=eq.${encodeURIComponent(markerName)}`, {
      method: "PATCH",
      body: JSON.stringify({ value: `SENT:${new Date().toISOString()}`, updated_at: new Date().toISOString() }),
    });
    return json(200, { status: "sent", email }, origin, request);
  } catch (error) {
    console.error("[bootstrap-first-admin]", error);
    return json(500, { status: "error", message: error instanceof Error ? error.message : "Could not send the first-admin invitation." }, origin, request);
  }
});
