import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function randomToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[redeem-shop-device-invite] Missing server configuration.");
    return json(503, { error: "Secure device enrollment is temporarily unavailable." });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid enrollment request." });
  }

  const code = String(body.joinCode ?? "").trim().toUpperCase();
  const deviceId = String(body.deviceId ?? "").trim();
  const deviceName = String(body.deviceName ?? "").trim().slice(0, 120);
  if (!/^BB-[A-F0-9]{32}$/.test(code) ||
      !/^DEV-[A-Z0-9-]{8,64}$/.test(deviceId) ||
      deviceName.length < 2) {
    return json(400, { error: "Enter a valid one-time BeBoss device code." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The invitation is a 128-bit random bearer token, stored only as SHA-256.
  // The code itself is never logged or persisted in a database column.
  const codeHash = await sha256Hex(code);
  // Trust only edge-provided single-address headers. X-Forwarded-For may
  // contain client-supplied hops and must not be the rate-limit identity.
  const clientIp = request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "";
  // Edge infrastructure supplies a client IP; when it is unavailable, scope
  // the fallback bucket to this code so we never rate-limit every shop globally.
  const rateBucketHash = await sha256Hex(clientIp ? `ip:${clientIp}` : `invite:${codeHash}`);
  const { data: rateAllowed, error: rateError } = await admin.rpc("take_shop_device_enrollment_attempt", {
    p_bucket_hash: rateBucketHash,
    p_now_ms: Date.now(),
    p_window_ms: 10 * 60 * 1000,
    p_max_attempts: 10,
  });
  if (rateError) {
    console.error("[redeem-shop-device-invite] Enrollment rate limiter is unavailable.");
    return json(503, { error: "Secure device enrollment is temporarily unavailable." });
  }
  if (rateAllowed !== true) {
    return json(429, { error: "Too many device enrollment attempts. Wait a few minutes and try again." });
  }

  const { data: inviteValid, error: inviteCheckError } = await admin.rpc("validate_shop_device_auth_invite", {
    p_code_hash: codeHash,
    p_device_id: deviceId,
  });
  if (inviteCheckError) {
    console.error("[redeem-shop-device-invite] Invitation validation is unavailable.");
    return json(503, { error: "Secure device enrollment is temporarily unavailable." });
  }
  if (inviteValid !== true) {
    return json(403, { error: "This device code is invalid, expired, revoked, already used, or not assigned to this terminal." });
  }

  const credentialEmail = `device-${crypto.randomUUID()}@devices.beboss.rw`;
  const credentialPassword = randomToken(48);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: credentialEmail,
    password: credentialPassword,
    email_confirm: true,
    user_metadata: { account_type: "beboss_pos_device" },
    app_metadata: { account_type: "beboss_pos_device" },
  });

  if (createError || !created.user) {
    console.error("[redeem-shop-device-invite] Auth identity provisioning failed.");
    return json(503, { error: "Could not provision a secure terminal identity. Generate a new device code and retry." });
  }

  const { data: enrollment, error: redeemError } = await admin.rpc("redeem_shop_device_auth_invite", {
    p_code_hash: codeHash,
    p_device_id: deviceId,
    p_device_name: deviceName,
    p_auth_user_id: created.user.id,
  });

  if (redeemError || !enrollment?.device) {
    // Do not leave orphan Auth users when an invitation is expired, revoked or
    // already claimed by a different device.
    const { error: deleteError } = await admin.auth.admin.deleteUser(created.user.id);
    if (deleteError) console.error("[redeem-shop-device-invite] Failed to clean up rejected Auth identity.");
    return json(403, { error: "This device code is invalid, expired, revoked, already used, or not assigned to this terminal." });
  }

  // A re-enrollment supersedes the previous auth identity for this device.
  // The DB session has already been revoked atomically; remove the old GoTrue user
  // as cleanup so disabled credentials do not accumulate in Auth.
  const replacedAuthUserId = String(enrollment.replaced_auth_user_id ?? "");
  if (replacedAuthUserId && replacedAuthUserId !== created.user.id) {
    const { error: oldUserDeleteError } = await admin.auth.admin.deleteUser(replacedAuthUserId);
    if (oldUserDeleteError) {
      console.error("[redeem-shop-device-invite] Previous device identity cleanup failed after revocation.");
    }
  }

  // Credentials are returned once, only after the atomic DB claim has succeeded.
  // Android immediately exchanges them for short-lived JWT + rotating refresh token
  // and stores only the encrypted refresh token in Android Keystore-backed storage.
  return json(200, {
    device: enrollment.device,
    shopName: enrollment.shop_name,
    authUserId: created.user.id,
    sessionExpiresAt: enrollment.session_expires_at,
    credentials: { email: credentialEmail, password: credentialPassword },
  });
});
