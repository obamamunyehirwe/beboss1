import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createDeviceToken,
  DEVICE_ACCESS_TTL_MS,
  DEVICE_REFRESH_TTL_MS,
  isDeviceToken,
  sha256Hex,
} from "../_shared/device-credentials.ts";

type Row = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Row) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function text(value: unknown): string {
  return value == null ? "" : String(value);
}
function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(-9);
}
function ownerPhoneE164(value: string): string {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 9 ? digits
    : digits.startsWith("250") && digits.length === 12 ? digits.slice(3)
    : digits.startsWith("0") && digits.length === 10 ? digits.slice(1)
    : "";
  if (!/^7\d{8}$/.test(local)) {
    throw new Error("Enter the Rwanda mobile number registered to this BeBoss shop.");
  }
  return "+250" + local;
}
function ownerKey(username: string, phone: string): string {
  const user = username.trim().toLowerCase();
  const digits = normalizePhone(phone);
  if (!/^[a-z0-9._-]{2,80}$/.test(user) || digits.length !== 9) {
    throw new Error("The registered shop identity is invalid.");
  }
  return user + "_" + digits;
}
function jwtAuthTime(req: Request): number {
  const header = req.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token.split(".")[1] || "";
  if (!payload) return 0;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(normalized)) as Row;
    const value = Number(claims.auth_time);
    return Number.isFinite(value) ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

async function verifyFreshOwner(
  req: Request,
  input: Row,
  url: string,
  publishableKey: string,
  admin: ReturnType<typeof createClient>
) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Sign in with the registered shop-owner phone first.");
  }
  const accessToken = authorization.slice(7);
  const authTime = jwtAuthTime(req);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!authTime || authTime > nowSeconds + 60 || nowSeconds - authTime > 15 * 60) {
    throw new Error("Verify the registered owner phone again before pairing this iPhone.");
  }
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: "Bearer " + accessToken } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  const user = authData?.user;
  const username = text(input.username).trim().toLowerCase();
  const phone = ownerPhoneE164(text(input.phone));
  if (authError || !user?.id || !user.phone_confirmed_at ||
      normalizePhone(text(user.phone)) !== normalizePhone(phone)) {
    throw new Error("The SMS-verified account does not match the registered shop-owner phone.");
  }

  const shopId = ownerKey(username, phone);
  const { data: shop, error: shopError } = await admin
    .from("shop_accounts")
    .select("id,shop_name,owner_name,owner_username,owner_phone,remote_kill_switch")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError || !shop ||
      text(shop.owner_username).trim().toLowerCase() !== username ||
      normalizePhone(text(shop.owner_phone)) !== normalizePhone(phone)) {
    throw new Error("The verified phone and username do not match a registered BeBoss shop owner.");
  }
  if (shop.remote_kill_switch === true) {
    throw new Error("This shop has been disabled by BeBoss support.");
  }

  const { data: membership, error: membershipError } = await admin
    .from("shop_owner_memberships")
    .select("id,status,revoked_at")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw new Error("Could not validate shop-owner membership.");
  if (membership && (membership.status !== "ACTIVE" || Number(membership.revoked_at || 0) > 0)) {
    throw new Error("Owner access to this shop has been revoked.");
  }
  if (!membership) {
    const { error: insertError } = await admin.from("shop_owner_memberships").insert({
      shop_id: shopId,
      user_id: user.id,
      owner_username: username,
      owner_phone: text(shop.owner_phone),
      status: "ACTIVE",
      last_verified_at: Date.now(),
      revoked_at: 0,
    });
    if (insertError) {
      const { data: raced, error: raceError } = await admin
        .from("shop_owner_memberships")
        .select("id,status,revoked_at")
        .eq("shop_id", shopId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (raceError || !raced || raced.status !== "ACTIVE" || Number(raced.revoked_at || 0) > 0) {
        throw new Error("Could not finish secure shop-owner enrollment.");
      }
    }
  } else {
    await admin.from("shop_owner_memberships")
      .update({ last_verified_at: Date.now() })
      .eq("shop_id", shopId)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .eq("revoked_at", 0);
  }
  return { userId: user.id, shopId, shopName: text(shop.shop_name), ownerUsername: username };
}

async function enrollDevice(req: Request, body: Row, config: { url: string; publishableKey: string; serviceKey: string }, admin: ReturnType<typeof createClient>) {
  const owner = await verifyFreshOwner(req, body, config.url, config.publishableKey, admin);
  const deviceId = text(body.deviceId).trim();
  const deviceName = text(body.deviceName).trim();
  const joinCode = text(body.joinCode).trim().toUpperCase();
  if (!/^IOS:[0-9a-fA-F-]{36}$/.test(deviceId) ||
      !deviceName || deviceName.length > 120 ||
      !/^[A-Z0-9-]{8,100}$/.test(joinCode)) {
    throw new Error("The iPhone ID, device name or owner-issued join code is invalid.");
  }

  const codeHash = await sha256Hex(joinCode);
  const { data: device, error: redeemError } = await admin.rpc("redeem_ios_shop_device_invite", {
    p_shop_sync_key: owner.shopId,
    p_code_hash: codeHash,
    p_device_id: deviceId,
    p_device_name: deviceName,
    p_owner_user_id: owner.userId,
  });
  if (redeemError || !device || typeof device !== "object") {
    throw new Error("The owner-issued invitation is invalid, expired, revoked, or no longer assigned to an active device slot.");
  }
  const assignedUserId = text((device as Row).assignedUserId);
  const deviceRecordId = text((device as Row).deviceRecordId);
  const role = text((device as Row).role).toUpperCase();
  if (!assignedUserId || !deviceRecordId || !["OWNER", "MANAGER", "CASHIER"].includes(role)) {
    throw new Error("The enrolled iPhone has no valid assigned user or role.");
  }

  const accessToken = createDeviceToken();
  const refreshToken = createDeviceToken();
  const now = Date.now();
  const accessExpiresAt = now + DEVICE_ACCESS_TTL_MS;
  const refreshExpiresAt = now + DEVICE_REFRESH_TTL_MS;
  const { data: issued, error: issueError } = await admin.rpc("issue_android_device_credential", {
    p_shop_id: owner.shopId,
    p_device_id: deviceId,
    p_device_record_id: deviceRecordId,
    p_access_token_hash: await sha256Hex(accessToken),
    p_refresh_token_hash: await sha256Hex(refreshToken),
    p_access_expires_at: accessExpiresAt,
    p_refresh_expires_at: refreshExpiresAt,
  });
  if (issueError || !issued || (issued as Row).issued !== true) {
    throw new Error("The iPhone device credential could not be issued.");
  }
  return {
    ok: true,
    shopId: owner.shopId,
    shopName: owner.shopName,
    ownerUsername: owner.ownerUsername,
    deviceId,
    deviceRecordId,
    assignedUserId,
    role,
    branchId: text((device as Row).branchId),
    branchName: text((device as Row).branchName),
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
  };
}

async function refreshDevice(body: Row, admin: ReturnType<typeof createClient>) {
  const shopId = text(body.shopId).trim();
  const deviceId = text(body.deviceId).trim();
  const refreshToken = body.refreshToken;
  if (!shopId || shopId.length > 120 || !/^IOS:[0-9a-fA-F-]{36}$/.test(deviceId) || !isDeviceToken(refreshToken)) {
    throw new Error("The iPhone refresh credential is invalid. Re-enroll this terminal with its owner invitation.");
  }
  const accessToken = createDeviceToken();
  const nextRefreshToken = createDeviceToken();
  const now = Date.now();
  const accessExpiresAt = now + DEVICE_ACCESS_TTL_MS;
  const refreshExpiresAt = now + DEVICE_REFRESH_TTL_MS;
  const { data, error } = await admin.rpc("rotate_android_device_credential", {
    p_shop_id: shopId,
    p_device_id: deviceId,
    p_old_refresh_hash: await sha256Hex(refreshToken),
    p_new_access_token_hash: await sha256Hex(accessToken),
    p_new_refresh_token_hash: await sha256Hex(nextRefreshToken),
    p_access_expires_at: accessExpiresAt,
    p_refresh_expires_at: refreshExpiresAt,
  });
  if (error || data !== true) {
    throw new Error("The iPhone refresh credential is invalid, expired, or revoked.");
  }
  return { ok: true, shopId, deviceId, accessToken, refreshToken: nextRefreshToken, accessExpiresAt, refreshExpiresAt };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed." });
  try {
    const raw = await req.text();
    if (raw.length > 8192) return json(413, { ok: false, message: "iPhone device enrollment request is too large." });
    const body = JSON.parse(raw) as Row;
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!url || !serviceKey || !publishableKey) {
      return json(503, { ok: false, message: "The BeBoss iPhone device-auth service is not configured." });
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (body.action === "enroll") {
      const result = await enrollDevice(req, body, { url, serviceKey, publishableKey }, admin);
      return json(200, result);
    }
    if (body.action === "refresh") {
      const result = await refreshDevice(body, admin);
      return json(200, result);
    }
    return json(400, { ok: false, message: "Unsupported iPhone device-auth operation." });
  } catch (error) {
    console.error("[BeBoss iOS device-auth]", error instanceof Error ? error.message : "unknown error");
    return json(401, {
      ok: false,
      message: error instanceof Error ? error.message : "The iPhone device credential could not be issued."
    });
  }
});
