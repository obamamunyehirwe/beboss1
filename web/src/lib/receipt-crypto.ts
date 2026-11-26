// Offline-verifiable cryptographic receipts.
//
// A receipt is a small, canonical, Ed25519-signed payload. Verification is a
// pure client-side operation against the bundled platform PUBLIC key: it needs
// no network, no server and no account. That is the whole point — a customer
// can verify a receipt in a shop with no connectivity, on their own device.
//
// Security model:
//   - The platform holds the Ed25519 PRIVATE key (server secret) and signs.
//   - Every verifier (this web page, the Android app, the desktop app) embeds
//     only the PUBLIC key (src/lib/receipt-public-key.json).
//   - A signature proves the payload was produced by the BeBoss platform and
//     has not been altered. It does NOT by itself prove the merchant is who the
//     receipt claims; the merchant TIN is included so a dispute can be tied to
//     a registered seller.

import publicKeyDocument from "./receipt-public-key.json";

export type Receipt = {
  v: 1;
  issuer: string; // signing key id (kid)
  tin: string; // merchant tax identification number
  shop: string; // registered shop name
  branch: string; // branch identifier / name
  receiptNo: string; // human receipt number
  issuedAt: string; // ISO-8601 timestamp
  currency: string; // ISO-4217, e.g. "RWF"
  totalMinor: number; // grand total in minor units (integer)
  taxMinor: number; // included tax in minor units (integer)
  cashier: string; // cashier display name / id
  buyer?: string; // optional customer name / phone
  itemsHash: string; // hex SHA-256 of the canonical line items
};

export type VerifyResult =
  | { ok: true; receipt: Receipt }
  | { ok: false; reason: "bad-format" | "bad-signature" | "unsupported" };

const QR_PREFIX = "BEBOSS";
const QR_VERSION = "RCPT1";
const subtle = () => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("Web Crypto is unavailable in this environment");
  return c.subtle;
};

// Deterministic JSON: object keys sorted recursively so the signed bytes are
// identical on every platform (Kotlin, Rust, browser, Node).
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle().importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle().importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
}

export function platformPublicKey(): { kid: string; jwk: JsonWebKey } {
  return { kid: publicKeyDocument.kid, jwk: publicKeyDocument.publicKey as JsonWebKey };
}

// SHA-256 (hex) of the canonical line items. Callers pass the raw item rows;
// the hash binds the printed line items to the signed total.
export async function computeItemsHash(items: unknown[]): Promise<string> {
  const digest = await subtle().digest("SHA-256", new TextEncoder().encode(canonicalize(items)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signReceipt(receipt: Receipt, privateJwk: JsonWebKey): Promise<string> {
  const key = await importPrivateKey(privateJwk);
  const sig = await subtle().sign(
    { name: "Ed25519" },
    key,
    new TextEncoder().encode(canonicalize(receipt)),
  );
  return bytesToBase64url(new Uint8Array(sig));
}

export async function verifyReceipt(
  receipt: Receipt,
  signatureBase64url: string,
  publicJwk?: JsonWebKey,
): Promise<boolean> {
  try {
    const key = await importPublicKey(publicJwk ?? platformPublicKey().jwk);
    return await subtle().verify(
      { name: "Ed25519" },
      key,
      base64urlToBytes(signatureBase64url),
      new TextEncoder().encode(canonicalize(receipt)),
    );
  } catch {
    return false;
  }
}

// Compact, URL-safe QR payload: BEBOSS|RCPT1|<base64url(canonical json)>|<base64url(signature)>
export async function encodeReceiptQr(
  receipt: Receipt,
  signatureBase64url: string,
): Promise<string> {
  const payload = bytesToBase64url(new TextEncoder().encode(canonicalize(receipt)));
  return [QR_PREFIX, QR_VERSION, payload, signatureBase64url].join("|");
}

export async function verifyReceiptQr(qr: string, publicJwk?: JsonWebKey): Promise<VerifyResult> {
  const parts = qr.trim().split("|");
  if (parts.length !== 4 || parts[0] !== QR_PREFIX || parts[1] !== QR_VERSION) {
    return { ok: false, reason: "bad-format" };
  }
  let receipt: Receipt;
  try {
    receipt = JSON.parse(new TextDecoder().decode(base64urlToBytes(parts[2]))) as Receipt;
  } catch {
    return { ok: false, reason: "bad-format" };
  }
  if (receipt.v !== 1) return { ok: false, reason: "unsupported" };
  const ok = await verifyReceipt(receipt, parts[3], publicJwk);
  return ok ? { ok: true, receipt } : { ok: false, reason: "bad-signature" };
}

export function formatMinor(minor: number, currency: string): string {
  const amount = (minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount} ${currency}`;
}

export function receiptToText(receipt: Receipt): string {
  const lines = [
    receipt.shop,
    `Receipt ${receipt.receiptNo}`,
    `TIN: ${receipt.tin}`,
    `Date: ${receipt.issuedAt}`,
    `Cashier: ${receipt.cashier}`,
    receipt.buyer ? `Buyer: ${receipt.buyer}` : "",
    `Total: ${formatMinor(receipt.totalMinor, receipt.currency)}`,
    `Incl. tax: ${formatMinor(receipt.taxMinor, receipt.currency)}`,
    `Signed by: ${receipt.issuer}`,
  ];
  return lines.filter(Boolean).join("\n");
}
