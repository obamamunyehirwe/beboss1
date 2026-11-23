const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const encoder = new TextEncoder();
const BB3_ANDROID_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEnH8Qg10M7lur8WocoKgklEJ98F6
UF9J9ektcbwahKU79+sHZdQAejA76NlwNldXfWaZGFNYu+ziDItMapV7dA==
-----END PUBLIC KEY-----`;
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function adminRest(path: string, init: RequestInit = {}) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Server-side Supabase credentials are not configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
}

function decodePem(pem: string): Uint8Array {
  const b64 = pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, "");
  const binary = atob(b64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function rawEcdsaToDer(raw: Uint8Array): Uint8Array {
  if (raw.length !== 64) throw new Error("Unexpected P-256 signature size.");
  const integer = (source: Uint8Array) => {
    let start = 0;
    while (start < source.length - 1 && source[start] === 0) start++;
    const value = source.slice(start);
    const needsZero = (value[0] & 0x80) !== 0;
    const body = needsZero ? new Uint8Array([0, ...value]) : value;
    return new Uint8Array([0x02, body.length, ...body]);
  };
  const r = integer(raw.slice(0, 32));
  const s = integer(raw.slice(32, 64));
  const body = new Uint8Array([...r, ...s]);
  return new Uint8Array([0x30, body.length, ...body]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-9);
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function loadPrivateKey(): Promise<CryptoKey> {
  const query = new URLSearchParams({
    select: "value",
    name: "eq.BEBOSS_UNLOCK_ECDSA_PRIVATE_KEY_PEM",
    limit: "1",
  });
  const response = await adminRest(`app_secrets?${query.toString()}`);
  if (!response.ok) throw new Error("Unable to load the server-only BB3 signing key.");
  const rows = await response.json();
  const pem = String(rows?.[0]?.value ?? "").trim();
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----") || !pem.includes("-----END PRIVATE KEY-----")) {
    throw new Error("The server-only BB3 signing key is missing or invalid. Ask the master administrator to provision it.");
  }
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    decodePem(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const expectedPublicKey = await crypto.subtle.importKey(
    "spki",
    decodePem(BB3_ANDROID_PUBLIC_KEY_PEM),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const expectedPublicJwk = await crypto.subtle.exportKey("jwk", expectedPublicKey);
  if (!privateJwk.x || !privateJwk.y || privateJwk.x !== expectedPublicJwk.x || privateJwk.y !== expectedPublicJwk.y) {
    throw new Error("The saved BB3 private key does not match the public key pinned in the installed BeBoss APK.");
  }
  return privateKey;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { message: "Method not allowed." });

  try {
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json(401, { message: "Sign in as a BeBoss administrator first." });
    const apiKey = request.headers.get("apikey") ?? "";
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: apiKey, Authorization: authorization },
    });
    if (!userResponse.ok) return json(401, { message: "Your admin session is invalid or expired. Sign in again." });
    const user = await userResponse.json();
    const userId = String(user?.id ?? "");
    const userEmail = String(user?.email ?? "").toLowerCase();
    if (!userId || !userEmail) return json(401, { message: "A verified Supabase user session is required." });

    const roleQuery = new URLSearchParams({
      select: "user_id",
      user_id: `eq.${userId}`,
      role: "eq.admin",
      limit: "1",
    });
    const [rolesResponse, profileResponse] = await Promise.all([
      adminRest(`user_roles?${roleQuery.toString()}`),
      adminRest(`admin_profiles?select=user_id&user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&limit=1`),
    ]);
    if (!rolesResponse.ok || !profileResponse.ok) return json(503, { message: "Could not verify administrator permissions." });
    const roles = await rolesResponse.json();
    const profiles = await profileResponse.json();
    if (!roles.length || !profiles.length) return json(403, { message: "This account does not have an active BeBoss administrator role." });

    // The mobile admin client supplies only the request ID. All customer, payer,
    // amount and plan values are read from Supabase so the device cannot alter them.
    const input = await request.json();
    const providerVerified = input?.providerVerified === true;
    const verificationNote = String(input?.verificationNote ?? "").trim();
    if (!providerVerified || verificationNote.length < 5 || verificationNote.length > 500) {
      return json(403, { message: "Manual MTN MoMo / Airtel Money provider verification is required before BB3 signing." });
    }
    const paymentRequestId = String(input?.paymentRequestId ?? "").trim();
    if (!paymentRequestId || paymentRequestId.length > 200) {
      return json(400, { message: "A valid payment request ID is required." });
    }

    const paymentColumns = [
      "id", "shop_name", "owner_username", "owner_phone", "device_challenge",
      "provider", "payer_phone", "payer_full_name", "amount_rwf", "duration_months",
      "branch_count", "worker_count", "device_count", "fee_per_device_rwf",
      "payment_time_ms", "payment_note", "status", "created_at",
    ].join(",");
    const paymentQuery = new URLSearchParams({
      select: paymentColumns,
      id: `eq.${paymentRequestId}`,
      limit: "1",
    });
    const paymentResponse = await adminRest(`payment_requests?${paymentQuery.toString()}`);
    if (!paymentResponse.ok) return json(503, { message: "Could not load the submitted payment from Supabase." });
    const paymentRows = await paymentResponse.json();
    const payment = paymentRows?.[0];
    if (!payment) return json(404, { message: "The submitted payment request was not found." });
    if (!["PENDING_VERIFICATION", "REJECTED"].includes(String(payment.status))) {
      return json(409, { message: "Only a pending or rejected payment can receive a new unlock code." });
    }

    const username = String(payment.owner_username ?? "").trim();
    const phone = String(payment.owner_phone ?? "").trim();
    const provider = String(payment.provider ?? "").trim();
    const payerPhone = String(payment.payer_phone || payment.owner_phone || "").trim();
    const payerFullName = String(payment.payer_full_name ?? "").trim().normalize("NFKC");
    const paymentNote = String(payment.payment_note ?? "").trim().normalize("NFKC");
    const months = Number(payment.duration_months);
    const branches = Number(payment.branch_count);
    const workers = Number(payment.worker_count);
    const devices = Number(payment.device_count);
    const paymentTimeMs = Number(payment.payment_time_ms || payment.created_at || Date.now());

    if (!username || username.length > 80 || normalizePhone(phone).length !== 9 ||
        normalizePhone(payerPhone).length !== 9 || !provider) {
      return json(400, { message: "The payment request is missing valid registered owner or payer details." });
    }
    if (![1, 3, 6, 12].includes(months) ||
        !Number.isInteger(branches) || branches < 1 || branches > 100 ||
        !Number.isInteger(workers) || workers < 1 || workers > 500 ||
        !Number.isInteger(devices) || devices < 1 || devices > 100) {
      return json(400, { message: "The plan details saved on this payment request are invalid." });
    }

    const shopId = `${username.toLowerCase()}_${normalizePhone(phone) || "000000000"}`;
    const shopQuery = new URLSearchParams({
      select: "id,owner_username,owner_phone,shop_name",
      id: `eq.${shopId}`,
      limit: "1",
    });
    const shopResponse = await adminRest(`shop_accounts?${shopQuery.toString()}`);
    if (!shopResponse.ok) return json(503, { message: "Could not verify the registered BeBoss shop." });
    const shops = await shopResponse.json();
    const shop = shops?.[0];
    if (!shop ||
        String(shop.owner_username ?? "").trim().toLowerCase() !== username.toLowerCase() ||
        normalizePhone(String(shop.owner_phone ?? "")) !== normalizePhone(phone)) {
      return json(409, { message: "The submitted payment owner does not match a registered BeBoss shop. No code was issued." });
    }

    // License pricing fixes every added POS terminal at 2,000 FRw/month.
    // Ignore stale client-submitted or legacy app_config overrides.
    const feePerDevice = 2_000;

    const branchFee = branches === 1 ? 5000 : branches === 2 ? 10000 : 20000;
    const workerFee = workers <= 1 ? 0 : workers <= 3 ? 2000 : workers <= 5 ? 4000 : 4000 + (workers - 5) * 1000;
    const deviceFee = Math.max(0, devices - 1) * feePerDevice;
    const monthly = branchFee + workerFee + deviceFee;
    const gross = monthly * months;
    const discountPercent = months === 12 ? 20 : months === 3 ? 10 : 0;
    const calculatedAmount = gross - Math.floor((gross * discountPercent) / 100);
    const submittedAmount = Number(payment.amount_rwf);
    if (!Number.isSafeInteger(submittedAmount) || submittedAmount < 1 || submittedAmount !== calculatedAmount) {
      return json(409, {
        message: `Payment amount mismatch. The submitted plan calculates to ${calculatedAmount} FRw, but the claim records ${submittedAmount || 0} FRw. Correct the claim or confirm the provider payment before approval.`,
      });
    }

    const tier = months >= 12 ? "ANNUAL" : branches >= 3 ? "MULTI" : branches === 2 ? "DUAL" : "SINGLE";
    const days = months * 30;
    const canonicalPlan = [
      "BEBOSS-PAYMENT-PLAN-V1",
      String(payment.id).trim(),
      username.toLowerCase(),
      normalizePhone(phone),
      provider.toUpperCase(),
      normalizePhone(payerPhone),
      payerFullName,
      Math.floor(calculatedAmount),
      Math.floor(months),
      Math.floor(branches),
      Math.floor(workers),
      Math.floor(devices),
      Math.floor(paymentTimeMs),
      paymentNote,
    ].join("\n");
    const planDigest = hex(await sha256(canonicalPlan));
    if (!/^[0-9A-F]{64}$/.test(planDigest)) throw new Error("Could not create the payment plan digest.");
    const nonce = planDigest.slice(0, 24);
    const accountHash = hex(await sha256(`${username.toLowerCase()}:${normalizePhone(phone)}`)).slice(0, 6);
    const expiryHex = (Math.floor(Date.now() / 86_400_000) + 14).toString(16).toUpperCase();
    const payload = `BB3:${tier}:${days}:${expiryHex}:${accountHash}:${nonce}`;
    const key = await loadPrivateKey();
    const rawSignature = new Uint8Array(await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      encoder.encode(payload),
    ));
    const derSignature = rawEcdsaToDer(rawSignature);
    const code = `BB3-${tier}-${days}-${expiryHex}-${accountHash}-${nonce}-${toBase64(derSignature)}`;

    return json(200, {
      code, tier, days, requestId: String(payment.id), planDigest, shopId: String(shop.id),
      amountRwf: calculatedAmount, paymentTimeMs,
      expiresOnEpochDay: Number.parseInt(expiryHex, 16), algorithm: "ECDSA-P256-SHA256",
    });
  } catch (error) {
    console.error("[issue-bb3-unlock]", error);
    return json(500, { message: error instanceof Error ? error.message : "Unable to create a signed BB3 code." });
  }
});
