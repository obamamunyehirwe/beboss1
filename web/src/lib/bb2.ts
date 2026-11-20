// Account-bound BB2 unlock codes. Mirrors SubscriptionSecurityManager.kt exactly:
//   BB2-[TIER]-[DAYS]-[EXPIRY_HEX]-[ACCT_HASH6]-[HMAC_SIG8]
// Uses Web Crypto so it runs identically in the browser and on the server.
import { normalizePhoneLast9 } from "./pricing";

const enc = new TextEncoder();

function toHexUpper(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function computeAccountBindingHash(username: string, phone: string): Promise<string> {
  const seed = `${String(username ?? "").trim().toLowerCase()}:${normalizePhoneLast9(phone)}`;
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(seed));
  return toHexUpper(digest).slice(0, 6);
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHexUpper(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export interface Bb2Options {
  username: string;
  phone: string;
  tier: string;
  days: number;
  secret: string;
  validityWindowDays?: number;
  now?: number;
}

export async function generateBB2UnlockCode(o: Bb2Options): Promise<string> {
  if (!o.secret || o.secret.trim().length < 8) throw new Error("Unlock signing key is not configured.");
  if (!String(o.username ?? "").trim()) throw new Error("Owner username is required.");
  if (!normalizePhoneLast9(o.phone)) throw new Error("Registered phone is required.");
  const tier = String(o.tier || "SINGLE").trim().toUpperCase() || "SINGLE";
  const days = Math.max(1, Math.floor(o.days));
  const acct = await computeAccountBindingHash(o.username, o.phone);
  const expiryHex = (Math.floor((o.now ?? Date.now()) / 86_400_000) + (o.validityWindowDays ?? 14)).toString(16).toUpperCase();
  const payload = `BB2:${tier}:${days}:${expiryHex}:${acct}`;
  const sig = (await hmacHex(o.secret, payload)).slice(0, 8);
  return `BB2-${tier}-${days}-${expiryHex}-${acct}-${sig}`;
}

export interface ParsedBb2 {
  tier: string;
  days: number;
  expiryEpochDay: number;
  accountHash: string;
  signature: string;
}

export function parseBB2(code: string): ParsedBb2 | null {
  const parts = String(code ?? "").trim().toUpperCase().split("-");
  if (parts.length !== 6 || parts[0] !== "BB2") return null;
  const days = Number.parseInt(parts[2] ?? "", 10);
  const exp = Number.parseInt(parts[3] ?? "", 16);
  if (!Number.isFinite(days) || !Number.isFinite(exp)) return null;
  return { tier: parts[1] ?? "", days, expiryEpochDay: exp, accountHash: parts[4] ?? "", signature: parts[5] ?? "" };
}

/** Full verification (signature + account binding + validity window), as the app does offline. */
export async function verifyBB2(code: string, username: string, phone: string, secret: string, now = Date.now()): Promise<{ ok: boolean; reason: string }> {
  const p = parseBB2(code);
  if (!p) return { ok: false, reason: "Not a BB2 code" };
  if (Math.floor(now / 86_400_000) > p.expiryEpochDay) return { ok: false, reason: "Code activation window expired" };
  if ((await computeAccountBindingHash(username, phone)) !== p.accountHash) return { ok: false, reason: "Bound to a different account" };
  const expected = (await hmacHex(secret, `BB2:${p.tier}:${p.days}:${p.expiryEpochDay.toString(16).toUpperCase()}:${p.accountHash}`)).slice(0, 8);
  return expected === p.signature ? { ok: true, reason: "Valid" } : { ok: false, reason: "Signature mismatch" };
}
