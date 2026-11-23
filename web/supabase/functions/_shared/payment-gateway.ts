export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function requireServerConfig() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase server credentials are not configured for payment processing.");
  }
}

export async function restRequest(path: string, init: RequestInit = {}) {
  requireServerConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", SERVICE_ROLE_KEY);
  headers.set("Authorization", `Bearer ${SERVICE_ROLE_KEY}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
}

export async function restRows<T>(path: string): Promise<T[]> {
  const response = await restRequest(path);
  if (!response.ok) throw new Error(`Database read failed (${response.status}).`);
  return await response.json() as T[];
}

export async function restInsert<T>(path: string, row: Record<string, unknown>): Promise<T> {
  const response = await restRequest(path, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error(`Database insert failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const rows = await response.json() as T[];
  if (!rows[0]) throw new Error("Database did not return the inserted record.");
  return rows[0];
}

export async function restPatch(path: string, patch: Record<string, unknown>) {
  const response = await restRequest(path, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Database update failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
}

export function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(-9);
}

export function phoneE164(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  const local = digits.length === 9
    ? digits
    : digits.length === 10 && digits.startsWith("0")
      ? digits.slice(1)
      : digits.startsWith("250") && digits.length === 12
        ? digits.slice(3)
        : "";
  if (!/^7\d{8}$/.test(local)) throw new Error("Enter a valid Rwanda mobile number.");
  return `+250${local}`;
}

export function expectedSubscriptionAmount(branches: number, workers: number, months: number, devices: number) {
  const branchFee = branches === 1 ? 5_000 : branches === 2 ? 10_000 : 20_000;
  const workerFee = workers <= 1 ? 0 : workers <= 3 ? 2_000 : workers <= 5 ? 4_000 : 4_000 + (workers - 5) * 1_000;
  const deviceFee = Math.max(0, devices - 1) * 2_000;
  const gross = (branchFee + workerFee + deviceFee) * months;
  const discount = months === 12 ? 20 : months === 3 ? 10 : 0;
  return gross - Math.floor(gross * discount / 100);
}

export async function hmacSha256Base64(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeTextEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
