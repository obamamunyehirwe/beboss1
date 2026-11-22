const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const encoder = new TextEncoder();
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
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
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
  return crypto.subtle.importKey(
    "pkcs8",
    decodePem(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
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

    const input = await request.json();
    const username = String(input?.username ?? "").trim();
    const phone = String(input?.phone ?? "").trim();
    const tier = String(input?.tier ?? "SINGLE").trim().toUpperCase();
    const days = Number(input?.days);
    const requestId = String(input?.requestId ?? "").trim();
    const planDigest = String(input?.planDigest ?? "").trim().toUpperCase();
    if (!!requestId !== !!planDigest || (requestId && (requestId.length > 200 || !/^[0-9A-F]{64}$/.test(planDigest)))) {
      return json(400, { message: "The payment request and its 64-character plan digest must be supplied together." });
    }
    if (!username || username.length > 80 || !normalizePhone(phone) || normalizePhone(phone).length !== 9) {
      return json(400, { message: "A valid shop username and registered Rwanda phone are required." });
    }
    if (!["SINGLE", "DUAL", "MULTI", "ANNUAL", "TRIAL"].includes(tier) || !Number.isInteger(days) || days < 1 || days > 800) {
      return json(400, { message: "The requested plan or subscription length is invalid." });
    }

    // New payment approvals derive the BB3 nonce from the exact submitted payment and plan.
    // Manual/admin codes without a payment request retain an independent random nonce.
    const nonce = requestId && planDigest
      ? planDigest.slice(0, 24)
      : hex(crypto.getRandomValues(new Uint8Array(12)));
    const accountHash = hex(await sha256(`${username.toLowerCase() }:${normalizePhone(phone)}`)).slice(0, 6);
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

    return json(200, { code, tier, days, requestId: requestId || undefined, planDigest: planDigest || undefined, expiresOnEpochDay: Number.parseInt(expiryHex, 16), algorithm: "ECDSA-P256-SHA256" });
  } catch (error) {
    console.error("[issue-bb3-unlock]", error);
    return json(500, { message: error instanceof Error ? error.message : "Unable to create a signed BB3 code." });
  }
});
