import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createDeviceToken,
  DEVICE_ACCESS_TTL_MS,
  DEVICE_REFRESH_TTL_MS,
  isDeviceToken,
  sha256Hex,
} from "../_shared/device-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed." });

  try {
    const raw = await req.text();
    if (raw.length > 4096) return json(413, { ok: false, message: "Credential refresh request is too large." });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.action !== "refresh") {
      return json(400, { ok: false, message: "Unsupported device-auth operation." });
    }

    const shopId = typeof body.shopId === "string" ? body.shopId.trim() : "";
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    const refreshToken = body.refreshToken;
    if (!shopId || shopId.length > 120 || !deviceId || deviceId.length < 4 ||
        deviceId.length > 120 || !isDeviceToken(refreshToken)) {
      return json(401, { ok: false, message: "The device refresh credential is invalid or expired. Re-enroll this terminal with the registered shop owner." });
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) {
      return json(503, { ok: false, message: "The device credential service is not configured." });
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const accessToken = createDeviceToken();
    const nextRefreshToken = createDeviceToken();
    const now = Date.now();
    const accessExpiresAt = now + DEVICE_ACCESS_TTL_MS;
    const refreshExpiresAt = now + DEVICE_REFRESH_TTL_MS;

    const { data: rotated, error } = await admin.rpc("rotate_android_device_credential", {
      p_shop_id: shopId,
      p_device_id: deviceId,
      p_old_refresh_hash: await sha256Hex(refreshToken),
      p_new_access_token_hash: await sha256Hex(accessToken),
      p_new_refresh_token_hash: await sha256Hex(nextRefreshToken),
      p_access_expires_at: accessExpiresAt,
      p_refresh_expires_at: refreshExpiresAt,
    });

    if (error || rotated !== true) {
      // Do not reveal whether the shop, device or refresh hash was the failed predicate.
      return json(401, { ok: false, message: "The device refresh credential is invalid, expired, revoked, or no longer assigned to this shop." });
    }

    return json(200, {
      ok: true,
      accessToken,
      refreshToken: nextRefreshToken,
      accessExpiresAt,
      refreshExpiresAt,
    });
  } catch (error) {
    console.error("[BeBoss Android device-auth]", error instanceof Error ? error.message : "unknown error");
    return json(400, { ok: false, message: "The device credential could not be refreshed." });
  }
});
