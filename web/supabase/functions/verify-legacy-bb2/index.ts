const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function rest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(-9);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { valid: false, message: "Method not allowed." });

  try {
    const body = await request.json();
    const code = String(body?.code ?? "").trim().toUpperCase();
    const username = String(body?.username ?? "").trim().toLowerCase();
    const phone = normalizePhone(String(body?.phone ?? ""));
    const parts = code.split("-");
    if (!username || phone.length !== 9 || parts.length !== 6 || parts[0] !== "BB2") {
      return json(400, { valid: false, message: "Invalid legacy BB2 code or shop details." });
    }
    if (!/^[A-Z]{2,12}$/.test(parts[1]) || !/^[A-F0-9]{3,8}$/.test(parts[3]) ||
        !/^[A-F0-9]{6}$/.test(parts[4]) || !/^[A-F0-9]{8}$/.test(parts[5])) {
      return json(400, { valid: false, message: "Invalid legacy BB2 code format." });
    }
    const days = Number(parts[2]);
    const expiryDay = Number.parseInt(parts[3], 16);
    if (!Number.isInteger(days) || days < 1 || days > 800 || !Number.isFinite(expiryDay) ||
        Math.floor(Date.now() / 86_400_000) > expiryDay) {
      return json(400, { valid: false, message: "This legacy BB2 code has expired or is invalid." });
    }
    const expectedAccountHash = (await sha256Hex(`${username}:${phone}`)).slice(0, 6).toUpperCase();
    if (expectedAccountHash !== parts[4]) {
      return json(403, { valid: false, message: "This BB2 code is bound to a different shop account." });
    }

    // Hash the source IP. Never store a raw client IP or the submitted unlock code.
    const sourceIp = request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ipHash = await sha256Hex(`${sourceIp}:${serviceRoleKey.slice(0, 24)}`);
    const windowStart = new Date(Date.now() - 15 * 60_000).toISOString();
    const attemptsQuery = new URLSearchParams({
      select: "id",
      ip_hash: `eq.${ipHash}`,
      created_at: `gte.${windowStart}`,
      limit: "9",
    });
    const attemptsResponse = await rest(`unlock_code_verification_attempts?${attemptsQuery.toString()}`);
    if (!attemptsResponse.ok) return json(503, { valid: false, message: "Legacy-code verification is temporarily unavailable." });
    const attempts = await attemptsResponse.json();
    if (attempts.length >= 8) return json(429, { valid: false, message: "Too many code attempts. Wait 15 minutes before trying again." });

    const recordAttempt = await rest("unlock_code_verification_attempts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ip_hash: ipHash }),
    });
    if (!recordAttempt.ok) return json(503, { valid: false, message: "Legacy-code verification is temporarily unavailable." });

    const lookup = new URLSearchParams({
      select: "id,unlock_code,shop_username,shop_phone,tier_code,plan_days,amount_rwf,status",
      unlock_code: `eq.${code}`,
      limit: "3",
    });
    const rowResponse = await rest(`unlock_codes?${lookup.toString()}`);
    if (!rowResponse.ok) return json(503, { valid: false, message: "Could not verify the issued BeBoss record." });
    const rows = await rowResponse.json();
    const row = rows.find((item: Record<string, unknown>) =>
      String(item.shop_username ?? "").trim().toLowerCase() === username &&
      normalizePhone(String(item.shop_phone ?? "")) === phone
    );
    if (!row) return json(404, { valid: false, message: "This code was not issued by BeBoss for the supplied shop account." });
    if (String(row.status).toUpperCase() !== "ISSUED") {
      return json(409, { valid: false, message: "This legacy code has already been redeemed or revoked." });
    }
    if (String(row.tier_code).toUpperCase() !== parts[1] || Number(row.plan_days) !== days) {
      return json(409, { valid: false, message: "The code does not match its original BeBoss issue record." });
    }

    const updateQuery = new URLSearchParams({ id: `eq.${row.id}`, status: "eq.ISSUED", select: "id" });
    const patch = await rest(`unlock_codes?${updateQuery.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "REDEEMED", redeemed_at: Date.now() }),
    });
    if (!patch.ok) return json(503, { valid: false, message: "Could not complete secure code redemption." });
    const updated = await patch.json();
    if (!updated.length) return json(409, { valid: false, message: "This code was already redeemed on another device." });

    return json(200, {
      valid: true,
      tier: row.tier_code,
      days: Number(row.plan_days),
      amount_rwf: Number(row.amount_rwf),
    });
  } catch (error) {
    console.error("[verify-legacy-bb2]", error);
    return json(500, { valid: false, message: "Legacy-code verification failed. Contact BeBoss support if the issue continues." });
  }
});
