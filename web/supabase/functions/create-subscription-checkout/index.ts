const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const encoder = new TextEncoder();
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "";

type Provider = "FLUTTERWAVE_RW_MOBILE_MONEY" | "STRIPE_CHECKOUT";

function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...headers } });
}

function requiredEnv(name: string, value: string): string {
  if (!value.trim()) throw new Error(`SERVER_CONFIG_MISSING:${name}`);
  return value.trim();
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(-9);
}

function validRwandaPhone(value: string): boolean {
  const national = normalizePhone(value);
  return /^[72][0-9]{8}$/.test(national);
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function safeInteger(value: unknown, min: number, max: number): number | null {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < min || numeric > max) return null;
  return numeric;
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function adminRest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = requiredEnv("SUPABASE_URL", supabaseUrl);
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers });
}

async function consumeIpLimit(request: Request): Promise<{ allowed: boolean; retryAfter: number }> {
  const ip = request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip");
  if (!ip) throw new Error("CLIENT_IP_UNAVAILABLE");
  const pepper = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey).slice(0, 32);
  const keyHash = await sha256(`gateway_checkout:${ip}:${pepper}`);
  const response = await adminRest("rpc/consume_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      p_scope: "gateway_checkout",
      p_key_hash: keyHash,
      p_max_hits: 8,
      p_window_seconds: 900,
    }),
  });
  if (!response.ok) throw new Error("RATE_LIMIT_UNAVAILABLE");
  const raw = await response.json();
  const result = Array.isArray(raw) ? raw[0] : raw;
  if (typeof result?.allowed !== "boolean") throw new Error("RATE_LIMIT_INVALID_RESPONSE");
  return {
    allowed: result.allowed,
    retryAfter: Math.max(1, Number(result.retry_after_seconds) || 900),
  };
}

function configuredSiteUrl(): URL {
  const raw = requiredEnv("PUBLIC_SITE_URL", publicSiteUrl);
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("PUBLIC_SITE_URL_MUST_USE_HTTPS");
  }
  return url;
}

async function trustedSubscriptionAmount(branches: number, workers: number, months: number, devices: number): Promise<number> {
  const response = await adminRest("rpc/compute_expected_subscription_fee", {
    method: "POST",
    body: JSON.stringify({
      p_branch_count: branches,
      p_worker_count: workers,
      p_duration_months: months,
      p_device_count: devices,
    }),
  });
  if (!response.ok) throw new Error("TRUSTED_PRICE_CALCULATION_FAILED");
  const amount = Number(await response.json());
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("TRUSTED_PRICE_CALCULATION_INVALID");
  return amount;
}

async function startFlutterwave(input: {
  amount: number;
  phone: string;
  email: string;
  payerName: string;
  reference: string;
  requestId: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const secret = requiredEnv("FLUTTERWAVE_SECRET_KEY", Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "");
  const response = await fetch("https://api.flutterwave.com/v3/charges?type=mobile_money_rwanda", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone_number: `250${normalizePhone(input.phone)}`,
      amount: input.amount,
      currency: "RWF",
      email: input.email,
      fullname: input.payerName,
      tx_ref: input.reference,
      order_id: input.requestId,
      meta: { beboss_payment_request_id: input.requestId },
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== "success") {
    console.error("[create-subscription-checkout] Flutterwave charge initiation failed", response.status, result?.message);
    throw new Error("FLUTTERWAVE_CHECKOUT_FAILED");
  }
  const checkoutUrl = String(result?.meta?.authorization?.redirect ?? "");
  if (!checkoutUrl || !checkoutUrl.startsWith("https://")) {
    throw new Error("FLUTTERWAVE_CHECKOUT_URL_MISSING");
  }
  const sessionId = String(result?.data?.id ?? result?.meta?.authorization?.mode ?? "REDIRECT");
  return { checkoutUrl, sessionId };
}

async function startStripe(input: {
  amount: number;
  email: string;
  reference: string;
  requestId: string;
  shopName: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const secret = requiredEnv("STRIPE_SECRET_KEY", Deno.env.get("STRIPE_SECRET_KEY") ?? "");
  const accountResponse = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const account = await accountResponse.json().catch(() => null);
  if (!accountResponse.ok || !account?.id || account.charges_enabled !== true || account.details_submitted !== true) {
    console.error("[create-subscription-checkout] Stripe account is not enabled to accept live charges", accountResponse.status);
    throw new Error("STRIPE_ACCOUNT_NOT_READY");
  }
  // Stripe does not onboard businesses in Rwanda. Only use an already-approved
  // Stripe account registered in a supported account country.
  if (String(account.country ?? "").toUpperCase() === "RW") {
    throw new Error("STRIPE_ACCOUNT_COUNTRY_UNSUPPORTED");
  }

  const site = configuredSiteUrl();
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("payment_method_types[0]", "card");
  body.set("success_url", `${site.origin}/my-shop?checkout=success&reference=${encodeURIComponent(input.reference)}`);
  body.set("cancel_url", `${site.origin}/my-shop?checkout=cancel&reference=${encodeURIComponent(input.reference)}`);
  body.set("client_reference_id", input.requestId);
  body.set("customer_email", input.email);
  body.set("metadata[payment_request_id]", input.requestId);
  body.set("metadata[tx_ref]", input.reference);
  body.set("line_items[0][price_data][currency]", "rwf");
  body.set("line_items[0][price_data][unit_amount]", String(input.amount));
  body.set("line_items[0][price_data][product_data][name]", `BeBoss subscription — ${input.shopName}`);
  body.set("line_items[0][quantity]", "1");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": input.reference,
    },
    body,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.id || !result?.url) {
    console.error("[create-subscription-checkout] Stripe checkout creation failed", response.status, result?.error?.code);
    throw new Error("STRIPE_CHECKOUT_FAILED");
  }
  return { checkoutUrl: String(result.url), sessionId: String(result.id) };
}

function publicError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    FLUTTERWAVE_SECRET_KEY: "Flutterwave is not configured for this environment.",
    STRIPE_SECRET_KEY: "Stripe is not configured for this environment.",
    FLUTTERWAVE_WEBHOOK_SECRET_HASH: "Flutterwave webhook verification is not configured.",
    STRIPE_WEBHOOK_SECRET: "Stripe webhook verification is not configured.",
    SUPABASE_URL: "The payment service is not fully configured.",
    SUPABASE_SERVICE_ROLE_KEY: "The payment service is not fully configured.",
    PUBLIC_SITE_URL: "The payment service is not fully configured.",
    PUBLIC_SITE_URL_MUST_USE_HTTPS: "The payment return URL must use HTTPS.",
    CLIENT_IP_UNAVAILABLE: "Could not establish a safe network request identity. Try again.",
    RATE_LIMIT_UNAVAILABLE: "Payment checkout is temporarily unavailable. Try again shortly.",
    RATE_LIMIT_INVALID_RESPONSE: "Payment checkout is temporarily unavailable. Try again shortly.",
    TRUSTED_PRICE_CALCULATION_FAILED: "Could not calculate the subscription amount securely.",
    TRUSTED_PRICE_CALCULATION_INVALID: "Could not calculate the subscription amount securely.",
    STRIPE_ACCOUNT_NOT_READY: "The configured Stripe business account is not enabled for live payments.",
    STRIPE_ACCOUNT_COUNTRY_UNSUPPORTED: "Stripe cannot be used with a Rwanda-based Stripe account. Configure an approved Stripe account from a supported country.",
    FLUTTERWAVE_CHECKOUT_FAILED: "Flutterwave could not start this mobile-money payment. Check the payer number or try again.",
    FLUTTERWAVE_CHECKOUT_URL_MISSING: "Flutterwave did not return a secure authorization page.",
    STRIPE_CHECKOUT_FAILED: "Stripe could not start this card payment. Try again or use mobile money.",
  };
  if (messages[code]) return messages[code];
  if (code.startsWith("SERVER_CONFIG_MISSING:")) return messages[code.slice("SERVER_CONFIG_MISSING:".length)] ?? "The payment service is not configured.";
  return "Could not start the payment. Please try again.";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { message: "Method not allowed." });

  try {
    requiredEnv("SUPABASE_URL", supabaseUrl);
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
    const limit = await consumeIpLimit(request);
    if (!limit.allowed) {
      return json(429, { message: "Too many checkout attempts. Wait and try again." }, { "Retry-After": String(limit.retryAfter) });
    }

    const body = await request.json();
    const providerInput = String(body?.provider ?? "");
    const provider: Provider | null = providerInput === "flutterwave"
      ? "FLUTTERWAVE_RW_MOBILE_MONEY"
      : providerInput === "stripe"
        ? "STRIPE_CHECKOUT"
        : null;
    if (!provider) return json(400, { message: "Choose Flutterwave Rwanda Mobile Money or Stripe card checkout." });

    const shopName = String(body?.shopName ?? "").trim().slice(0, 120);
    const ownerUsername = normalizeUsername(String(body?.username ?? ""));
    const ownerPhone = String(body?.phone ?? "").trim();
    const payerPhone = String(body?.payerPhone ?? "").trim();
    const payerName = String(body?.payerName ?? "").trim().slice(0, 120);
    const payerEmail = String(body?.payerEmail ?? "").trim().toLowerCase().slice(0, 254);
    const months = safeInteger(body?.months, 1, 12);
    const branches = safeInteger(body?.branches, 1, 100);
    const workers = safeInteger(body?.workers, 1, 500);
    const devices = safeInteger(body?.devices, 1, 100);
    const idempotencyKey = String(body?.idempotencyKey ?? "");
    if (!/^[a-z0-9._-]{2,80}$/.test(ownerUsername) || !shopName || !validRwandaPhone(ownerPhone) ||
        !validRwandaPhone(payerPhone) || payerName.length < 2 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail) ||
        !months || ![1, 3, 6, 12].includes(months) ||
        !branches || !workers || !devices ||
        !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
      return json(400, { message: "Check the shop, payer, email and subscription-plan details." });
    }

    const shopKey = `${ownerUsername}_${normalizePhone(ownerPhone)}`;
    const shopQuery = new URLSearchParams({
      select: "id,shop_name,owner_username,owner_phone,remote_kill_switch",
      id: `eq.${shopKey}`,
      limit: "1",
    });
    const shopResponse = await adminRest(`shop_accounts?${shopQuery.toString()}`);
    if (!shopResponse.ok) throw new Error("SHOP_LOOKUP_FAILED");
    const shopRows = await shopResponse.json();
    const shop = shopRows?.[0];
    if (!shop ||
        normalizeUsername(String(shop.owner_username ?? "")) !== ownerUsername ||
        normalizePhone(String(shop.owner_phone ?? "")) !== normalizePhone(ownerPhone)) {
      return json(404, { message: "This shop could not be verified. Open BeBoss and sync its registered owner account before paying." });
    }
    if (shop.remote_kill_switch === true) {
      return json(403, { message: "This shop is suspended. Contact BeBoss support before paying." });
    }

    const amount = await trustedSubscriptionAmount(branches, workers, months, devices);
    const payloadCanonical = [
      provider, shopKey, shopName, payerPhone, payerName, payerEmail,
      amount, months, branches, workers, devices,
    ].join("\n");
    const idempotencyHash = await sha256(idempotencyKey);
    const payloadHash = await sha256(payloadCanonical);

    const priorQuery = new URLSearchParams({
      select: "idempotency_hash,payload_hash,payment_request_id,provider,provider_reference,checkout_url,provider_session_id,state",
      idempotency_hash: `eq.${idempotencyHash}`,
      limit: "1",
    });
    const priorResponse = await adminRest(`payment_gateway_attempts?${priorQuery.toString()}`);
    if (!priorResponse.ok) throw new Error("IDEMPOTENCY_LOOKUP_FAILED");
    const priorRows = await priorResponse.json();
    const prior = priorRows?.[0];
    if (prior) {
      if (prior.payload_hash !== payloadHash || prior.provider !== provider) {
        return json(409, { message: "This checkout key was already used for different payment details. Start a new checkout." });
      }
      if (prior.state === "CREATED" && prior.checkout_url) {
        return json(200, {
          ok: true,
          paymentRequestId: prior.payment_request_id,
          provider,
          amountRwf: amount,
          currency: "RWF",
          checkoutUrl: prior.checkout_url,
          reused: true,
        });
      }
      if (prior.state === "CREATING") {
        return json(409, { message: "This checkout is already being prepared. Retry once in a moment." });
      }
      return json(409, { message: "This checkout attempt failed. Start a new checkout." });
    }

    const reference = `BBG-${crypto.randomUUID()}`;
    const reserveResponse = await adminRest("payment_gateway_attempts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        idempotency_hash: idempotencyHash,
        payload_hash: payloadHash,
        provider,
        provider_reference: reference,
        state: "CREATING",
      }),
    });
    if (!reserveResponse.ok) {
      const conflictQuery = new URLSearchParams({ select: "state", idempotency_hash: `eq.${idempotencyHash}`, limit: "1" });
      const conflict = await adminRest(`payment_gateway_attempts?${conflictQuery.toString()}`);
      if (conflict.ok && (await conflict.json())?.length) {
        return json(409, { message: "This checkout is already being prepared. Retry once in a moment." });
      }
      throw new Error("CHECKOUT_RESERVATION_FAILED");
    }

    const now = Date.now();
    const paymentRequestId = `GW-${crypto.randomUUID()}`;
    const paymentRequest = {
      id: paymentRequestId,
      shop_name: shopName,
      owner_username: ownerUsername,
      owner_phone: ownerPhone,
      provider: provider === "FLUTTERWAVE_RW_MOBILE_MONEY" ? "Flutterwave Rwanda Mobile Money" : "Stripe",
      ussd_code: "HOSTED_GATEWAY_CHECKOUT",
      payer_phone: payerPhone,
      payer_full_name: payerName,
      amount_rwf: amount,
      duration_months: months,
      branch_count: branches,
      worker_count: workers,
      device_count: devices,
      fee_per_device_rwf: 2000,
      payment_time_ms: now,
      payment_note: "Gateway checkout created; waiting for independently verified provider settlement.",
      status: "PENDING_VERIFICATION",
      approval_mode: "",
      generated_unlock_code: "",
      verified_by_admin: "",
      rejection_reason: "",
      source: "WEB_GATEWAY",
      created_at: now,
      updated_at: now,
      gateway_provider: provider,
      gateway_reference: reference,
      gateway_status: "CREATING",
    };
    const insertPayment = await adminRest("payment_requests", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(paymentRequest),
    });
    if (!insertPayment.ok) {
      await adminRest(`payment_gateway_attempts?idempotency_hash=eq.${idempotencyHash}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "FAILED", error_code: "PAYMENT_REQUEST_INSERT_FAILED", updated_at: new Date().toISOString() }),
      });
      throw new Error("PAYMENT_REQUEST_INSERT_FAILED");
    }

    await adminRest(`payment_gateway_attempts?idempotency_hash=eq.${idempotencyHash}`, {
      method: "PATCH",
      body: JSON.stringify({ payment_request_id: paymentRequestId, updated_at: new Date().toISOString() }),
    });

    let checkout: { checkoutUrl: string; sessionId: string };
    try {
      checkout = provider === "FLUTTERWAVE_RW_MOBILE_MONEY"
        ? await startFlutterwave({ amount, phone: payerPhone, email: payerEmail, payerName, reference, requestId: paymentRequestId })
        : await startStripe({ amount, email: payerEmail, reference, requestId: paymentRequestId, shopName });
    } catch (error) {
      const code = error instanceof Error ? error.message : "PROVIDER_INITIATION_FAILED";
      await adminRest(`payment_requests?id=eq.${paymentRequestId}`, {
        method: "PATCH",
        body: JSON.stringify({ gateway_status: "FAILED", rejection_reason: publicError(error), updated_at: Date.now() }),
      });
      await adminRest(`payment_gateway_attempts?idempotency_hash=eq.${idempotencyHash}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "FAILED", error_code: code.slice(0, 100), updated_at: new Date().toISOString() }),
      });
      throw error;
    }

    const updateRequest = await adminRest(`payment_requests?id=eq.${paymentRequestId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        gateway_session_id: checkout.sessionId,
        gateway_checkout_url: checkout.checkoutUrl,
        gateway_status: "PENDING_PROVIDER",
        updated_at: Date.now(),
      }),
    });
    if (!updateRequest.ok) throw new Error("CHECKOUT_RECORD_UPDATE_FAILED");

    const updateAttempt = await adminRest(`payment_gateway_attempts?idempotency_hash=eq.${idempotencyHash}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        payment_request_id: paymentRequestId,
        checkout_url: checkout.checkoutUrl,
        provider_session_id: checkout.sessionId,
        state: "CREATED",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!updateAttempt.ok) throw new Error("CHECKOUT_ATTEMPT_UPDATE_FAILED");

    return json(200, {
      ok: true,
      paymentRequestId,
      provider,
      amountRwf: amount,
      currency: "RWF",
      checkoutUrl: checkout.checkoutUrl,
      reused: false,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    console.error("[create-subscription-checkout]", code);
    const status = code === "CLIENT_IP_UNAVAILABLE" || code === "RATE_LIMIT_UNAVAILABLE" ? 503 : 400;
    return json(status, { message: publicError(error) });
  }
});
