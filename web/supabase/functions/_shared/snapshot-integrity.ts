/**
 * Server-side verifier for BeBoss BBSHARE1/BBSHARE2 snapshot tokens.
 * BBSHARE2 uses the same domain-separated shop key as Android and desktop.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
async function hmacHex(payload: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    bytesToArrayBuffer(new TextEncoder().encode(key)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    bytesToArrayBuffer(new TextEncoder().encode(payload))
  );
  return bytesToHex(new Uint8Array(signature)).toUpperCase();
}

/** Matches Android CryptoKeyManager.deriveSubkey for BBSHARE2. */
export async function shopShareSignature(payload: string, shopSecret: string): Promise<string> {
  const clean = shopSecret.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) {
    throw new Error("A valid shop-scoped DataShare key is required.");
  }
  const master = await crypto.subtle.importKey(
    "raw",
    bytesToArrayBuffer(new TextEncoder().encode(clean)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const domain = new TextEncoder().encode("BeBoss_BBSHARE2_HMAC_v1");
  const info = new Uint8Array(domain.length + 1);
  info.set(domain);
  info[domain.length] = 0x01;
  const derived = new Uint8Array(await crypto.subtle.sign("HMAC", master, bytesToArrayBuffer(info)));
  const shopKey = await crypto.subtle.importKey(
    "raw", bytesToArrayBuffer(derived), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    shopKey,
    bytesToArrayBuffer(new TextEncoder().encode(payload))
  );
  return bytesToHex(new Uint8Array(signature)).toUpperCase();
}

async function gunzipBase64(payload: string): Promise<string> {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const stream = new Response(bytesToArrayBuffer(bytes)).body!.pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 5 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("The decompressed BeBoss snapshot exceeds the safe 5 MB limit.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}

/** Verify the signature before decompressing or parsing untrusted snapshot data. */
export async function verifyAndDecodeToken(
  token: string,
  legacySecret?: string,
  shopSecret?: string
): Promise<Record<string, unknown>> {
  let prefix: "BBSHARE1:" | "BBSHARE2:";
  if (token.startsWith("BBSHARE2:")) prefix = "BBSHARE2:";
  else if (token.startsWith("BBSHARE1:")) prefix = "BBSHARE1:";
  else throw new Error("A snapshot token is malformed or too large.");
  const maximum = prefix === "BBSHARE1:" ? 4 * 1024 * 1024 : 7 * 1024 * 1024;
  if (token.length > maximum) throw new Error("A snapshot token is malformed or too large.");
  const rest = token.slice(prefix.length);
  const separator = rest.indexOf(":");
  if (separator <= 0) throw new Error("A BeBoss snapshot token is malformed.");
  const signature = rest.slice(0, separator).toUpperCase();
  const payload = rest.slice(separator + 1);
  if (!/^[A-F0-9]+$/.test(signature) ||
      (prefix === "BBSHARE1:" ? signature.length !== 16 : signature.length !== 64)) {
    throw new Error("A snapshot signature has an invalid format.");
  }

  let verified = false;
  if (prefix === "BBSHARE2:" && shopSecret) {
    try {
      verified = constantTimeEqual(signature, await shopShareSignature(payload, shopSecret));
    } catch {
      verified = false;
    }
  }
  // The project-wide secret is a read-only compatibility fallback for older
  // tokens. New writes always use the shop-scoped key above.
  if (!verified && legacySecret) {
    const legacy = await hmacHex(payload, legacySecret);
    verified = constantTimeEqual(signature, prefix === "BBSHARE1:" ? legacy.slice(0, 16) : legacy);
  }
  if (!verified) throw new Error("A BeBoss snapshot failed its HMAC integrity check.");

  const parsed = JSON.parse(await gunzipBase64(payload)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("A snapshot payload is not a JSON object.");
  }
  const root = parsed as Record<string, unknown>;
  const metadata = root.metadata && typeof root.metadata === "object"
    ? root.metadata as Record<string, unknown>
    : {};
  const version = Number(metadata.schemaVersion);
  if (!Number.isFinite(version) || version < 1 || version > 3) {
    throw new Error("This BeBoss snapshot version is not supported by the iPhone.");
  }
  return root;
}
