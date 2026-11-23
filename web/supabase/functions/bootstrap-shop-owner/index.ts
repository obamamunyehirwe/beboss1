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

function normalizePhone(value: unknown): string {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const normalized = raw.startsWith("+") ? `+${digits}` : digits.startsWith("00") ? `+${digits.slice(2)}` : digits.length === 9 ? `+250${digits}` : `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : "";
}

function cleanUsername(value: unknown): string {
  const username = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{2,80}$/.test(username) ? username : "";
}

function shopKey(username: string, phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${username}_${digits.slice(-9)}`;
}

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !serviceRoleKey || !publicKey) {
    console.error("[bootstrap-shop-owner] Missing server configuration.");
    return json(503, { error: "Secure shop registration is temporarily unavailable." });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid shop registration request." });
  }

  const action = String(body.action ?? "");
  const username = cleanUsername(body.username);
  const phone = normalizePhone(body.phone);
  if (!username || !phone) {
    return json(400, { error: "Enter a valid shop username and international owner phone number." });
  }
  const id = shopKey(username, phone);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (action === "start") {
    const { data: attemptId, error: throttleError } = await admin.rpc("take_shop_owner_otp_slot", {
      p_shop_id: id,
      p_now_ms: Date.now(),
      p_window_ms: 10 * 60 * 1000,
      p_max_attempts: 3,
    });
    if (throttleError) {
      console.error("[bootstrap-shop-owner] Owner OTP throttle failed.");
      return json(503, { error: "Secure shop registration is temporarily unavailable." });
    }
    if (!attemptId) {
      return json(429, { error: "Too many SMS verification requests. Wait ten minutes before trying again." });
    }

    const { data: existingUserId, error: lookupError } = await admin.rpc("find_auth_user_by_phone", {
      p_phone: phone,
    });
    if (lookupError) {
      console.error("[bootstrap-shop-owner] Auth phone lookup failed.");
      return json(503, { error: "Could not begin phone verification. Please retry." });
    }

    if (!existingUserId) {
      const { error: createError } = await admin.auth.admin.createUser({
        phone,
        phone_confirm: false,
        app_metadata: { account_type: "beboss_shop_owner_pending" },
        user_metadata: { account_type: "beboss_shop_owner_pending" },
      });
      if (createError) {
        // Do not reveal whether this number is already associated with an account.
        console.error("[bootstrap-shop-owner] Pending owner identity provisioning failed.");
        return json(202, { ok: true, message: "When eligible, a verification code will be sent to the registered phone." });
      }
    }

    const publicClient = createClient(supabaseUrl, publicKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: otpError } = await publicClient.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },
    });

    await admin.from("shop_owner_otp_attempts")
      .update({ status: otpError ? "FAILED" : "SENT" })
      .eq("id", attemptId);

    if (otpError) {
      console.error("[bootstrap-shop-owner] SMS provider rejected an owner OTP request.");
      return json(503, { error: "SMS verification could not be sent. Check the phone number or try again later." });
    }
    return json(200, { ok: true, message: "A verification code has been sent to the registered owner phone." });
  }

  if (action !== "finish") return json(400, { error: "Unsupported shop registration action." });

  const accessToken = bearerToken(request);
  if (!accessToken) return json(401, { error: "A verified owner phone session is required." });

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  const user = authData?.user;
  if (authError || !user || user.phone !== phone || !user.phone_confirmed_at) {
    return json(401, { error: "Verify the registered owner phone by SMS before creating the shop." });
  }

  const shopName = String(body.shopName ?? "").trim();
  const ownerName = String(body.ownerName ?? "").trim();
  if (shopName.length < 2 || shopName.length > 120 || ownerName.length < 2 || ownerName.length > 120) {
    return json(400, { error: "Enter a valid shop name and owner name." });
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      account_type: "beboss_shop_owner",
      beboss_shop_id: id,
    },
  });
  if (metadataError) {
    console.error("[bootstrap-shop-owner] Auth metadata update failed.");
    return json(503, { error: "Could not secure the new shop owner identity. Please retry." });
  }

  const { data: created, error: bootstrapError } = await admin.rpc("bootstrap_shop_owner", {
    p_shop_id: id,
    p_shop_name: shopName,
    p_owner_name: ownerName,
    p_owner_username: username,
    p_owner_phone: phone,
    p_owner_auth_user_id: user.id,
  });
  if (bootstrapError) {
    if (bootstrapError.code === "23505") {
      return json(409, { error: "A shop already exists for this owner identity. Choose “Join existing shop” instead of creating a second account." });
    }
    console.error("[bootstrap-shop-owner] Atomic owner/shop bootstrap failed.");
    return json(503, { error: "Could not complete secure shop registration. Your local data has not been created; retry after checking the connection." });
  }

  return json(200, {
    ok: true,
    shopId: String(created?.shop_id ?? id),
    trialExpiresAt: Number(created?.trial_expires_at ?? 0),
    authUserId: user.id,
  });
});
