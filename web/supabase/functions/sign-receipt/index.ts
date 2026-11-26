// Signs a BeBoss receipt payload with the platform Ed25519 private key.
//
// The private key never leaves the server: it is read from the
// RECEIPT_SIGNING_KEY secret (a JWK JSON string produced by
// scripts/receipt-keygen.mjs). The response is the signature plus a ready-to-encode
// QR payload that any verifier (web /verify, Android, desktop) can check OFFLINE
// against the committed public key at web/src/lib/receipt-public-key.json.
//
// This is the production signing path. Offline POS clients that cannot reach the
// network keep their local checksum and are clearly labelled as unsigned until a
// signed receipt can be issued on reconnect.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

type Receipt = {
  v: 1;
  issuer: string;
  tin: string;
  shop: string;
  branch: string;
  receiptNo: string;
  issuedAt: string;
  currency: string;
  totalMinor: number;
  taxMinor: number;
  cashier: string;
  buyer?: string;
  itemsHash: string;
};

function canonicalize(value: unknown): string {
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

function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    r.v === 1 &&
    typeof r.tin === "string" &&
    r.tin.length > 0 &&
    typeof r.shop === "string" &&
    typeof r.receiptNo === "string" &&
    r.receiptNo.length > 0 &&
    typeof r.issuedAt === "string" &&
    typeof r.currency === "string" &&
    Number.isSafeInteger(r.totalMinor) &&
    Number(r.totalMinor) >= 0 &&
    Number.isSafeInteger(r.taxMinor) &&
    Number(r.taxMinor) >= 0 &&
    typeof r.cashier === "string" &&
    typeof r.itemsHash === "string"
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { signed: false, message: "Method not allowed." });

  const raw = Deno.env.get("RECEIPT_SIGNING_KEY");
  if (!raw)
    return json(503, {
      signed: false,
      message: "Receipt signing is not configured on this deployment.",
    });

  let privateJwk: JsonWebKey;
  try {
    privateJwk = JSON.parse(raw) as JsonWebKey;
  } catch {
    return json(500, { signed: false, message: "Receipt signing key is malformed." });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { signed: false, message: "Invalid JSON body." });
  }
  const receipt = (body as { receipt?: unknown })?.receipt;
  if (!isReceipt(receipt)) return json(400, { signed: false, message: "Invalid receipt payload." });

  try {
    const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "Ed25519" }, false, [
      "sign",
    ]);
    const signature = await crypto.subtle.sign(
      { name: "Ed25519" },
      key,
      new TextEncoder().encode(canonicalize(receipt)),
    );
    const signatureBase64url = bytesToBase64url(new Uint8Array(signature));
    const payload = bytesToBase64url(new TextEncoder().encode(canonicalize(receipt)));
    const qr = ["BEBOSS", "RCPT1", payload, signatureBase64url].join("|");
    return json(200, { signed: true, issuer: receipt.issuer, signature: signatureBase64url, qr });
  } catch {
    return json(500, { signed: false, message: "Receipt signing failed." });
  }
});
