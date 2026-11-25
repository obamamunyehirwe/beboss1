import { createClient } from "npm:@supabase/supabase-js@2";
import { ownerOtpPhoneBucketKey } from "../_shared/owner-otp-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function ownerPhoneE164(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const local = digits.length === 9 ? digits :
    digits.startsWith("250") && digits.length === 12 ? digits.slice(3) :
    digits.startsWith("0") && digits.length === 10 ? digits.slice(1) : "";
  if (!/^7\d{8}$/.test(local)) throw new Error("Enter the registered Rwanda shop-owner phone number.");
  return "+250" + local;
}

function normalizeLast9(value: string) {
  return String(value ?? "").replace(/\D/g, "").slice(-9);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { accepted: false, message: "Method not allowed." });

  try {
    const body = await req.json();
    const username = String(body?.username ?? "").trim().toLowerCase();
    const phone = ownerPhoneE164(String(body?.phone ?? ""));
    if (!/^[a-z0-9._-]{2,80}$/.test(username)) {
      return json(200, { accepted: true });
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!url || !serviceKey || !publishableKey) {
      return json(503, { accepted: false, message: "Owner verification service is not configured." });
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const publicClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const shopKey = username + "_" + normalizeLast9(phone);
    const { data: shop, error: shopError } = await admin
      .from("shop_accounts")
      .select("id,owner_username,owner_phone")
      .eq("id", shopKey)
      .maybeSingle();

    // The response never confirms whether a username or shop exists.
    if (shopError || !shop ||
        String(shop.owner_username ?? "").trim().toLowerCase() !== username ||
        normalizeLast9(String(shop.owner_phone ?? "")) !== normalizeLast9(phone)) {
      return json(200, { accepted: true });
    }

    // Limit this phone destination across all usernames. The stored bucket is
    // a SHA-256 digest, not a raw phone number or username-derived shop key.
    const phoneBucket = await ownerOtpPhoneBucketKey(phone);
    const { data: attemptId, error: throttleError } = await admin.rpc("take_shop_owner_otp_slot", {
      p_shop_id: phoneBucket,
      p_now_ms: Date.now(),
      p_window_ms: 600000,
      p_max_attempts: 3
    });
    if (throttleError) throw new Error("Owner verification is temporarily unavailable.");
    if (!attemptId) return json(200, { accepted: true });

    const { data: existingUserId, error: lookupError } = await admin.rpc("find_auth_user_by_phone", {
      p_phone: phone
    });
    if (lookupError) {
      await admin.from("shop_owner_otp_attempts").update({ status: "FAILED" }).eq("id", attemptId);
      throw new Error("Could not prepare secure owner verification.");
    }

    if (!existingUserId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        phone,
        phone_confirm: false,
        user_metadata: { account_type: "shop_owner" }
      });
      if (createError || !created.user) {
        const retry = await admin.rpc("find_auth_user_by_phone", { p_phone: phone });
        if (retry.error || !retry.data) {
          await admin.from("shop_owner_otp_attempts").update({ status: "FAILED" }).eq("id", attemptId);
          throw new Error("Could not initialize owner authentication.");
        }
      }
    }

    const { error: otpError } = await publicClient.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false, channel: "sms" }
    });
    if (otpError) {
      await admin.from("shop_owner_otp_attempts").update({ status: "FAILED" }).eq("id", attemptId);
      throw new Error("SMS verification could not be sent. Configure the Supabase SMS provider.");
    }

    await admin.from("shop_owner_otp_attempts").update({ status: "SENT" }).eq("id", attemptId);
    return json(200, { accepted: true });
  } catch (error) {
    console.error("[BeBoss desktop OTP]", error);
    return json(400, {
      accepted: false,
      message: error instanceof Error ? error.message : "Owner verification could not be requested."
    });
  }
});
