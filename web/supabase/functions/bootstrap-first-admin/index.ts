// First-admin bootstrap is deliberately limited to the one email in
// public.admin_bootstrap_emails. CORS is transport policy, not authorization:
// no caller can supply an email, role, or password.
const ADMIN_ORIGIN = "https://admin.beboss.rw";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Access-Control-Request-Headers",
  "Content-Type": "application/json; charset=utf-8",
};

const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/[/]+$/, "");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INVITE_MARKER = "BEBOSS_INITIAL_ADMIN_INVITE_SENT";
// Supabase's built-in SMTP quota is shared project-wide (2 emails/hour).
// Keep a 65-minute safety window between successful sends to avoid hammering Auth.
const RESEND_COOLDOWN_MS = 90 * 60 * 1000;
const STALE_PENDING_MS = 2 * 60 * 1000;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

async function rest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
}

type InviteReservation = { token: string; previousValue: string | null };

function markerAgeMs(value: string): number | null {
  if (value.startsWith("SENT:")) {
    const date = Date.parse(value.slice("SENT:".length));
    return Number.isFinite(date) ? Date.now() - date : null;
  }
  if (value.startsWith("LIMITED:")) {
    const date = Date.parse(value.slice("LIMITED:".length));
    return Number.isFinite(date) ? Date.now() - date : null;
  }
  if (value.startsWith("PENDING:")) {
    const millis = Number(value.split(":")[1]);
    return Number.isFinite(millis) ? Date.now() - millis : null;
  }
  return null;
}

async function reserveInvite(): Promise<
  | { reservation: InviteReservation }
  | { cooldownSeconds: number }
> {
  const lookup = await rest(
    `app_secrets?select=value&name=eq.${encodeURIComponent(INVITE_MARKER)}&limit=1`,
  );
  if (!lookup.ok) throw new Error("Could not check first-admin invitation cooldown.");
  const rows = await lookup.json();
  const previousValue = Array.isArray(rows) && rows.length
    ? String(rows[0]?.value ?? "")
    : null;

  if (previousValue) {
    const age = markerAgeMs(previousValue);
    if (
      age !== null &&
      (previousValue.startsWith("SENT:") || previousValue.startsWith("LIMITED:")) &&
      age >= 0 &&
      age < RESEND_COOLDOWN_MS
    ) {
      return { cooldownSeconds: Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - age) / 1000)) };
    }
    if (previousValue.startsWith("PENDING:") && age !== null && age >= 0 && age < STALE_PENDING_MS) {
      return { cooldownSeconds: Math.max(1, Math.ceil((STALE_PENDING_MS - age) / 1000)) };
    }
  }

  const token = `PENDING:${Date.now()}:${crypto.randomUUID()}`;
  const body = JSON.stringify({
    name: INVITE_MARKER,
    value: token,
    updated_by: "first-admin-bootstrap",
    updated_at: new Date().toISOString(),
  });

  let response: Response;
  if (previousValue === null) {
    response = await rest("app_secrets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body,
    });
  } else {
    const query = new URLSearchParams({
      name: `eq.${INVITE_MARKER}`,
      value: `eq.${previousValue}`,
      select: "name",
    });
    response = await rest(`app_secrets?${query.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        value: token,
        updated_by: "first-admin-bootstrap",
        updated_at: new Date().toISOString(),
      }),
    });
  }

  if (response.status === 409) return { cooldownSeconds: 30 };
  if (!response.ok) throw new Error("Could not reserve the first-admin invitation.");
  const changed = await response.json().catch(() => []);
  if (!Array.isArray(changed) || changed.length !== 1) return { cooldownSeconds: 30 };
  return { reservation: { token, previousValue } };
}

async function finishInvite(
  reservation: InviteReservation,
  result: "sent" | "limited" | "restore",
) {
  const query = new URLSearchParams({
    name: `eq.${INVITE_MARKER}`,
    value: `eq.${reservation.token}`,
  });
  if (result === "sent" || result === "limited") {
    await rest(`app_secrets?${query.toString()}`, {
      method: "PATCH",
      body: JSON.stringify({
        value: `${result === "sent" ? "SENT" : "LIMITED"}:${new Date().toISOString()}`,
        updated_at: new Date().toISOString(),
      }),
    });
  } else if (reservation.previousValue === null) {
    await rest(`app_secrets?${query.toString()}`, { method: "DELETE" });
  } else {
    await rest(`app_secrets?${query.toString()}`, {
      method: "PATCH",
      body: JSON.stringify({
        value: reservation.previousValue,
        updated_at: new Date().toISOString(),
      }),
    });
  }
}

Deno.serve(async (request: Request) => {
  // Always complete browser preflight. Do not reject OPTIONS based on Origin:
  // preview domains, the apex domain and the admin subdomain can all invoke
  // the same fixed-recipient operation.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json(405, { status: "error", message: "Method not allowed." });
  }

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("First-admin invitation service is not configured on the server.");
    }

    const redirectTo = new URL("/reset-password?invite=1", ADMIN_ORIGIN).toString();
    const allowlistResponse = await rest("admin_bootstrap_emails?select=email&limit=2");
    if (!allowlistResponse.ok) throw new Error("Could not read the approved first-admin email list.");
    const allowlist = await allowlistResponse.json();
    if (!Array.isArray(allowlist) || allowlist.length !== 1) {
      throw new Error("First-admin setup requires exactly one approved email address.");
    }
    const email = String(allowlist[0]?.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("The approved administrator email is invalid.");
    }

    const roleResponse = await rest("user_roles?select=user_id&role=eq.admin&limit=1");
    if (!roleResponse.ok) throw new Error("Could not verify whether a master administrator already exists.");
    const roles = await roleResponse.json();
    if (roles.length) return json(200, { status: "already_configured" });

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

    if (existingUser && Boolean(existingUser.email_confirmed_at)) {
      const userId = String(existingUser.id ?? "");
      const roleInsert = await rest("user_roles", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: userId, role: "admin" }),
      });
      if (!roleInsert.ok) throw new Error("The email is confirmed, but the admin role could not be repaired.");
      const profileInsert = await rest("admin_profiles", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: userId,
          email,
          full_name: "BeBoss Master Admin",
          role: "SUPER_ADMIN",
          is_active: true,
        }),
      });
      if (!profileInsert.ok) throw new Error("The email is confirmed, but the admin profile could not be repaired.");
      return json(200, { status: "account_repaired", email });
    }

    const reserved = await reserveInvite();
    if ("cooldownSeconds" in reserved) {
      return json(200, {
        status: "cooldown",
        email,
        retryAfterSeconds: reserved.cooldownSeconds,
        message: "The original administrator invitation was already sent to the approved inbox. Check your inbox and spam folder; another email request is temporarily paused to respect the provider limit.",
      });
    }

    const reservation = reserved.reservation;
    try {
      let invite: Response;
      if (existingUser) {
        invite = await fetch(`${supabaseUrl}/auth/v1/resend`, {
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
      } else {
        invite = await fetch(
          `${supabaseUrl}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`,
          {
            method: "POST",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, data: { full_name: "BeBoss Master Admin" } }),
          },
        );
      }

      const inviteBody = await invite.json().catch(() => ({}));
      if (!invite.ok) {
        const message = String(
          inviteBody?.msg ?? inviteBody?.message ?? inviteBody?.error_description ??
          "Supabase could not send the administrator setup email.",
        );
        if (invite.status === 429) {
          await finishInvite(reservation, "limited");
          return json(200, {
            status: "email_rate_limited",
            email,
            retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000),
            message: "Supabase has temporarily reached its email-sending limit. The original setup invitation was already issued; check your inbox and spam folder before requesting another email.",
          });
        }
        await finishInvite(reservation, "restore");
        return json(502, { status: "error", message });
      }

      await finishInvite(reservation, "sent");
      return json(200, { status: "sent", email, resent: Boolean(existingUser) });
    } catch (error) {
      await finishInvite(reservation, "restore");
      throw error;
    }
  } catch (error) {
    console.error("[bootstrap-first-admin]", error);
    return json(500, {
      status: "error",
      message: error instanceof Error
        ? error.message
        : "Could not send the first-admin invitation.",
    });
  }
});
