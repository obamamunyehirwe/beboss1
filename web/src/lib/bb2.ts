// Read-only parser for historical BeBoss BB2 codes.
//
// Security migration note:
// BB2 used a shared HMAC secret that was previously distributed in Android builds.
// This module intentionally cannot sign or verify BB2 codes. The live verify-legacy-bb2
// Edge Function accepts only an exact BeBoss-issued database record and redeems it once.
// All new codes must use server-signed BB3 ECDSA via issue-bb3-unlock.

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
  const expiryEpochDay = Number.parseInt(parts[3] ?? "", 16);
  if (
    !/^[A-Z]{2,12}$/.test(parts[1] ?? "") ||
    !Number.isInteger(days) || days < 1 || days > 800 ||
    !/^[A-F0-9]{3,8}$/.test(parts[3] ?? "") ||
    !/^[A-F0-9]{6}$/.test(parts[4] ?? "") ||
    !/^[A-F0-9]{8}$/.test(parts[5] ?? "") ||
    !Number.isFinite(expiryEpochDay)
  ) return null;
  return {
    tier: parts[1],
    days,
    expiryEpochDay,
    accountHash: parts[4],
    signature: parts[5],
  };
}
