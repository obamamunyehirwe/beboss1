import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isCompleteSnapshotGeneration, snapshotDeviceBaseId } from "../_shared/snapshot-generations.ts";
import {
  createDeviceToken,
  DEVICE_ACCESS_TTL_MS,
  DEVICE_REFRESH_TTL_MS,
} from "../_shared/device-credentials.ts";
import { EXTRA_DEVICE_MONTHLY_FEE_RWF, monthlyShopFeeRwf } from "../_shared/shop-management.ts";
import { assertBranchesOpenForTransfer, normalizeBranchOperationalStatus } from "../_shared/branch-rules.ts";
import {
  buildShopAuditSnapshot,
  classifyShopAuditTransition,
  parseShopAuditSnapshot,
  type ShopAuditEntity,
} from "../_shared/shop-audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-beboss-device-id, x-beboss-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const BB3_ANDROID_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEnH8Qg10M7lur8WocoKgklEJ98F6
UF9J9ektcbwahKU79+sHZdQAejA76NlwNldXfWaZGFNYu+ziDItMapV7dA==
-----END PUBLIC KEY-----`;

const DATA_KEYS = ["products", "customers", "sales", "saleItems", "customerPayments", "purchases", "stockTransfers", "branches", "users"] as const;
type DataKey = typeof DATA_KEYS[number];
type Row = Record<string, unknown>;
type Snapshot = {
  metadata: Row;
  shopProfile: Row;
  products: Row[];
  customers: Row[];
  sales: Row[];
  saleItems: Row[];
  customerPayments: Row[];
  purchases: Row[];
  stockTransfers: Row[];
  branches: Row[];
  users: Row[];
  tombstones: Row[];
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function text(value: unknown) { return value == null ? "" : String(value); }
function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function normalizePhone(value: string) { return String(value ?? "").replace(/\D/g, "").slice(-9); }
function ownerPhoneE164(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const local = digits.length === 9 ? digits :
    digits.startsWith("250") && digits.length === 12 ? digits.slice(3) :
    digits.startsWith("0") && digits.length === 10 ? digits.slice(1) : "";
  if (!/^7\d{8}$/.test(local)) throw new Error("Enter the Rwanda mobile number registered to this BeBoss shop.");
  return "+250" + local;
}
function ownerKey(username: string, phone: string) {
  const u = username.trim().toLowerCase();
  const p = normalizePhone(phone);
  if (!/^[a-z0-9._-]{2,80}$/.test(u) || p.length !== 9) throw new Error("The registered shop identity is invalid.");
  return u + "_" + p;
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const stride = 0x8000;
  for (let i = 0; i < bytes.length; i += stride) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + stride, bytes.length)));
  }
  return btoa(binary);
}
function base64ToBytes(value: string) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function canonicalTransferApproval(fields: string[]): string {
  return fields.map((field) => {
    const bytes = new TextEncoder().encode(field);
    return String(bytes.length) + ":" + bytesToBase64(bytes);
  }).join("|");
}
function normalizeTransferQuantity(value: unknown): string {
  const n = number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error("The stock transfer quantity is invalid.");
  const raw = String(n);
  if (!/[eE]/.test(raw)) return raw;
  const parts = raw.toLowerCase().split("e");
  const exponent = Number(parts[1]);
  const negative = parts[0].startsWith("-");
  const unsigned = negative ? parts[0].slice(1) : parts[0];
  const decimal = unsigned.split(".");
  const whole = decimal[0];
  const digits = whole + (decimal[1] ?? "");
  const point = whole.length + exponent;
  const expanded = point <= 0 ? "0." + "0".repeat(-point) + digits :
    point >= digits.length ? digits + "0".repeat(point - digits.length) :
    digits.slice(0, point) + "." + digits.slice(point);
  const cleaned = expanded.includes(".") ? expanded.replace(/0+$/, "").replace(/\.$/, "") : expanded;
  return (negative ? "-" : "") + cleaned;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Copy views into a concrete ArrayBuffer for Deno/WebCrypto BufferSource typings. */
function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}
/** Constant-time comparison to avoid a timing oracle on snapshot signatures. */
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
async function hmacBytesHex(payload: string, keyBytes: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    asArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, asArrayBuffer(new TextEncoder().encode(payload)));
  return bytesToHex(new Uint8Array(signature)).toUpperCase();
}
async function hmacHex(payload: string, secret: string) {
  return hmacBytesHex(payload, new TextEncoder().encode(secret));
}

/**
 * Matches Android CryptoKeyManager.deriveSubkey using the shop's 256-bit
 * ASCII-hex LAN credential and an explicit domain separator. BBSHARE2 must
 * use this same key on Android, desktop and server; the legacy project-wide
 * HMAC is read-only compatibility for old snapshots and BBSHARE1 exports.
 */
async function deriveShopShareKey(shopSecret: string): Promise<Uint8Array> {
  const clean = shopSecret.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) {
    throw new Error("This shop has not provisioned a valid protected DataShare credential.");
  }
  const masterKey = await crypto.subtle.importKey(
    "raw",
    asArrayBuffer(new TextEncoder().encode(clean)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const domain = new TextEncoder().encode("BeBoss_BBSHARE2_HMAC_v1");
  const info = new Uint8Array(domain.length + 1);
  info.set(domain);
  info[domain.length] = 0x01;
  return new Uint8Array(await crypto.subtle.sign("HMAC", masterKey, asArrayBuffer(info)));
}
async function shopShareHmacHex(payload: string, shopSecret: string) {
  return hmacBytesHex(payload, await deriveShopShareKey(shopSecret));
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", asArrayBuffer(new TextEncoder().encode(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function derEcdsaToRawSignature(input: Uint8Array): Uint8Array {
  let offset = 0;
  if (input[offset++] !== 0x30) throw new Error("Invalid BB3 signature encoding.");
  const sequenceLength = input[offset++];
  if (sequenceLength !== input.length - 2 || input[offset++] !== 0x02) {
    throw new Error("Invalid BB3 signature sequence.");
  }
  const readInteger = () => {
    if (input[offset++] !== 0x02) throw new Error("Invalid BB3 signature integer.");
    const length = input[offset++];
    if (!length || length > 33 || offset + length > input.length) throw new Error("Invalid BB3 signature integer length.");
    let value = input.slice(offset, offset + length);
    offset += length;
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) throw new Error("Invalid BB3 signature integer size.");
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };
  // The first INTEGER tag has already been consumed above.
  const readR = () => {
    const length = input[offset++];
    if (!length || length > 33 || offset + length > input.length) throw new Error("Invalid BB3 signature integer length.");
    let value = input.slice(offset, offset + length);
    offset += length;
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) throw new Error("Invalid BB3 signature integer size.");
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };
  const r = readR();
  const s = readInteger();
  if (offset !== input.length) throw new Error("Unexpected BB3 signature data.");
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

async function verifyBb3CodeSignature(code: string, username: string, phone: string, planDigest: string): Promise<boolean> {
  const parts = code.split("-");
  if (parts.length !== 7 || parts[0] !== "BB3") return false;
  const [kind, tier, dayText, expiryText, accountText, nonce, signatureText] = parts;
  const days = Number(dayText);
  const expiryDay = /^[A-F0-9]{3,8}$/.test(expiryText ?? "") ? Number.parseInt(expiryText, 16) : Number.NaN;
  if (kind !== "BB3" || !/^[A-Z]{2,12}$/.test(tier ?? "") ||
      !/^\d{1,3}$/.test(dayText ?? "") || !Number.isInteger(days) || days < 1 || days > 800 ||
      !Number.isFinite(expiryDay) || Math.floor(Date.now() / 86_400_000) > expiryDay ||
      !/^[A-F0-9]{6}$/.test(accountText ?? "") ||
      !/^[A-F0-9]{24}$/.test(nonce ?? "") ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(signatureText ?? "")) return false;
  const accountHash = (await sha256Hex(username.trim().toLowerCase() + ":" + normalizePhone(phone))).slice(0, 6).toUpperCase();
  if (accountText !== accountHash || nonce !== planDigest.slice(0, 24).toUpperCase()) return false;
  try {
    const publicKey = await crypto.subtle.importKey(
      "spki", base64ToBytes(BB3_ANDROID_PUBLIC_KEY_PEM.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "")),
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
    );
    const signature = derEcdsaToRawSignature(base64ToBytes(signatureText));
    const payload = "BB3:" + tier + ":" + dayText + ":" + expiryText + ":" + accountText + ":" + nonce;
    // Deno's current WebCrypto types require an ArrayBuffer-backed BufferSource.
    // Copy both views so SharedArrayBuffer-compatible Uint8Array types cannot leak
    // through the DOM Crypto API boundary.
    const signatureBuffer = new ArrayBuffer(signature.byteLength);
    new Uint8Array(signatureBuffer).set(signature);
    const payloadBytes = new TextEncoder().encode(payload);
    const payloadBuffer = new ArrayBuffer(payloadBytes.byteLength);
    new Uint8Array(payloadBuffer).set(payloadBytes);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, publicKey, signatureBuffer, payloadBuffer
    );
  } catch {
    return false;
  }
}


async function streamToBytes(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("The BeBoss snapshot exceeds the configured safe size limit.");
    }
    chunks.push(part.value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
async function verifyAndDecodeToken(token: string, legacySecret: string, shopSecret?: string): Promise<Row> {
  let prefix = "";
  if (token.startsWith("BBSHARE2:")) prefix = "BBSHARE2:";
  else if (token.startsWith("BBSHARE1:")) prefix = "BBSHARE1:";
  else throw new Error("A snapshot token is malformed or too large.");
  const maxTokenLength = prefix === "BBSHARE1:" ? 4 * 1024 * 1024 : 7 * 1024 * 1024;
  if (token.length > maxTokenLength) throw new Error("A snapshot token is malformed or too large.");
  const rest = token.slice(prefix.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) throw new Error("A BeBoss snapshot token is malformed.");
  const signature = rest.slice(0, sep).toUpperCase();
  const payload = rest.slice(sep + 1);
  const validSig = prefix === "BBSHARE1:" ? signature.length === 16 : signature.length === 64;
  if (!validSig || !/^[A-F0-9]+$/.test(signature)) throw new Error("A snapshot signature has an invalid format.");

  let verified = false;
  if (prefix === "BBSHARE1:") {
    // Legacy BBSHARE1 was signed with the project-wide key. Keep verification
    // read-only until retained snapshot generations and customer-held exports
    // have all transitioned to shop-scoped keys.
    verified = constantTimeEq(signature, (await hmacHex(payload, legacySecret)).slice(0, 16));
  } else {
    if (shopSecret && /^[a-f0-9]{64}$/i.test(shopSecret)) {
      verified = constantTimeEq(signature, await shopShareHmacHex(payload, shopSecret));
    }
    // Earlier desktop builds emitted BBSHARE2 with the old global key. Accept
    // those existing rows during rollout, but all newly written BBSHARE2 data
    // below is signed with the per-shop derived key.
    if (!verified) verified = constantTimeEq(signature, await hmacHex(payload, legacySecret));
  }
  if (!verified) throw new Error("A BeBoss snapshot failed its HMAC integrity check.");
  const compressed = base64ToBytes(payload);
  const decompressed = await streamToBytes(
    new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip")),
    5 * 1024 * 1024
  );
  const parsed = JSON.parse(new TextDecoder().decode(decompressed));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("A snapshot payload is not a JSON object.");
  const root = parsed as Row;
  const meta = root.metadata as Row | undefined;
  if (number(meta?.schemaVersion) < 1 || number(meta?.schemaVersion) > 3) {
    throw new Error("This BeBoss snapshot version is not supported by the desktop client.");
  }
  return root;
}
async function encodeToken(snapshot: Row, shopSecret: string) {
  const raw = new TextEncoder().encode(JSON.stringify(snapshot));
  if (raw.length > 5 * 1024 * 1024) throw new Error("The desktop snapshot exceeds the 5 MB safe uncompressed limit.");
  const compressed = await streamToBytes(
    new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
    7 * 1024 * 1024
  );
  const payload = bytesToBase64(compressed);
  const signature = await shopShareHmacHex(payload, shopSecret);
  return "BBSHARE2:" + signature + ":" + payload;
}
function arrayRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Row => !!row && typeof row === "object" && !Array.isArray(row));
}
function getVersion(row: Row, fallback: number) {
  // Android uses packed HLC values (epoch milliseconds << 16 | logical counter).
  // Compare those consistently with tombstone HLCs before falling back to old
  // snapshots that predate causal metadata.
  return number(row.hlcTimestamp) || number(row.updatedAt ?? row.saleDate ?? row.paymentDate ?? row.purchaseDate ?? row.timestamp ?? fallback);
}
function mergeParts(parts: Row[]): Snapshot {
  const maps = Object.fromEntries(DATA_KEYS.map((key) => [key, new Map<string, Row>()])) as Record<DataKey, Map<string, Row>>;
  const tombstones = new Map<string, Row>();
  // Room tombstones use SQL table names, while snapshots use camelCase collection keys.
  const tombstoneTable: Partial<Record<DataKey, string>> = {
    saleItems: "sale_items",
    customerPayments: "customer_payments",
    stockTransfers: "stock_transfers",
  };
  let shopProfile: Row = {};
  let metadata: Row = {};
  let exportedAt = 0;

  for (const part of parts) {
    const meta = (part.metadata && typeof part.metadata === "object" ? part.metadata : {}) as Row;
    const fallback = number(meta.timestamp);
    exportedAt = Math.max(exportedAt, fallback);
    if (part.shopProfile && typeof part.shopProfile === "object") {
      const candidateProfile = part.shopProfile as Row;
      if (Object.keys(shopProfile).length === 0 ||
          getVersion(candidateProfile, fallback) >= getVersion(shopProfile, number(metadata.timestamp))) {
        shopProfile = candidateProfile;
      }
    }
    if (fallback >= number(metadata.timestamp)) metadata = meta;

    for (const t of arrayRows(part.tombstones)) {
      const key = text(t.tableName) + ":" + text(t.recordId);
      if (key !== ":") {
        const previous = tombstones.get(key);
        if (!previous || number(t.hlcTimestamp ?? t.deletedAt) >= number(previous.hlcTimestamp ?? previous.deletedAt)) {
          tombstones.set(key, t);
        }
      }
    }

    for (const key of DATA_KEYS) {
      const rows = arrayRows(part[key]);
      for (const row of rows) {
        const id = text(row.id);
        if (!id) continue;
        const previous = maps[key].get(id);
        if (!previous || getVersion(row, fallback) >= getVersion(previous, fallback)) maps[key].set(id, row);
      }
    }
  }

  const live = (key: DataKey) => [...maps[key].values()].filter((row) => {
    if (row.isDeleted === true) return false;
    const canonicalTombstoneTable = tombstoneTable[key] ?? key;
    const tombstone = tombstones.get(canonicalTombstoneTable + ":" + text(row.id));
    return !tombstone || getVersion(row, exportedAt) > (number(tombstone.hlcTimestamp) || number(tombstone.deletedAt));
  });

  const liveSales = live("sales");
  const liveSaleIds = new Set(liveSales.map((sale) => text(sale.id)));

  return {
    metadata: { ...metadata, timestamp: exportedAt, schemaVersion: 3 },
    shopProfile,
    products: live("products"),
    customers: live("customers"),
    sales: liveSales,
    // A deleted sale must not leave its immutable line items in restored reports.
    saleItems: live("saleItems").filter((item) => liveSaleIds.has(text(item.saleId))),
    customerPayments: live("customerPayments"),
    purchases: live("purchases"),
    stockTransfers: live("stockTransfers"),
    branches: live("branches"),
    users: live("users"),
    tombstones: [...tombstones.values()]
  };
}

function getServerConfig() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const hmacSecret = (Deno.env.get("BEBOSS_DATASHARE_HMAC_SECRET") ?? "").trim();
  if (!url || !serviceKey || !publishableKey) throw new Error("The BeBoss desktop backend is not configured.");
  // The established Android/website snapshot key is stored in the service-role-only
  // app_secrets table. Resolve it server-side when an Edge Function environment copy
  // has not been provisioned; never send it to desktop or mobile clients.
  return { url, serviceKey, publishableKey, hmacSecret };
}

async function requireOwner(
  req: Request,
  admin: SupabaseClient,
  publishableKey: string,
  input: Row,
  allowEnrollment: boolean
) {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) throw new Error("Sign in with the registered shop-owner phone first.");
  const token = header.slice(7);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, publishableKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  const user = authData?.user;
  const username = text(input.username).trim().toLowerCase();
  const phone = ownerPhoneE164(text(input.phone));
  if (authError || !user?.id || !user.phone_confirmed_at ||
      normalizePhone(text(user.phone)) !== normalizePhone(phone)) {
    throw new Error("The SMS-verified account does not match the registered shop-owner phone.");
  }

  const shopId = ownerKey(username, phone);
  const { data: shop, error: shopError } = await admin
    .from("shop_accounts")
    .select("id,shop_name,owner_name,owner_username,owner_phone,device_challenge,subscription_status,subscription_expires_at,remote_kill_switch,branch_count,worker_count,device_count,device_limit,monthly_fee_rwf,business_type,updated_at")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError || !shop ||
      text(shop.owner_username).trim().toLowerCase() !== username ||
      normalizePhone(text(shop.owner_phone)) !== normalizePhone(phone)) {
    throw new Error("The verified phone and username do not match a registered BeBoss shop owner.");
  }
  if (shop.remote_kill_switch) throw new Error("This shop has been disabled by BeBoss support.");

  const { data: existing, error: membershipError } = await admin
    .from("shop_owner_memberships")
    .select("id,status,revoked_at")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw new Error("Could not validate the shop-owner access membership.");
  if (existing && (existing.status !== "ACTIVE" || number(existing.revoked_at) > 0)) {
    throw new Error("Owner access to this shop was revoked. Contact BeBoss support for a reviewed restoration.");
  }
  if (!existing) {
    if (!allowEnrollment) throw new Error("This verified account has not been enrolled as the owner of the shop.");
    const { error: insertError } = await admin.from("shop_owner_memberships").insert({
      user_id: user.id,
      shop_id: shopId,
      owner_username: username,
      owner_phone: text(shop.owner_phone),
      status: "ACTIVE",
      last_verified_at: Date.now(),
      revoked_at: 0
    });
    if (insertError) {
      const { data: raced, error: raceError } = await admin
        .from("shop_owner_memberships")
        .select("id,status,revoked_at")
        .eq("shop_id", shopId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (raceError || !raced || raced.status !== "ACTIVE" || number(raced.revoked_at) > 0) {
        throw new Error("Could not finish secure shop-owner enrollment.");
      }
    }
  } else {
    await admin.from("shop_owner_memberships")
      .update({ last_verified_at: Date.now() })
      .eq("shop_id", shopId).eq("user_id", user.id).eq("status", "ACTIVE").eq("revoked_at", 0);
  }
  return { user, shop, shopId, username, phone };
}

async function getShopDataShareSecret(admin: SupabaseClient, shopId: string): Promise<string> {
  const { data, error } = await admin
    .from("shop_accounts")
    .select("lan_sync_secret")
    .eq("id", shopId)
    .maybeSingle();
  const secret = text(data?.lan_sync_secret).trim().toLowerCase();
  if (error || !/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error("This shop has not provisioned its protected DataShare credential. Connect the primary Android terminal to BeBoss Cloud and retry.");
  }
  return secret;
}

async function latestVerifiedSnapshot(admin: SupabaseClient, shopId: string, secret: string) {
  const shopShareSecret = await getShopDataShareSecret(admin, shopId);
  // Read every retained generation. A fixed 2,000-row limit can truncate a
  // large multi-device shop in the middle of a chunk set and make complete data
  // appear missing on desktop restore.
  const allRows: Row[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from("branch_sync_snapshots")
      .select("id,device_id,branch_name,payload_token,updated_at,sync_generation,chunk_index,chunk_count,records_summary")
      .eq("shop_sync_key", shopId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Could not read the shop's synchronized business data: " + error.message);
    const page = (data ?? []) as Row[];
    allRows.push(...page);
    if (page.length < pageSize) break;
    if (allRows.length >= 100000) {
      throw new Error("This shop has more than 100,000 retained snapshot chunks. Complete a sync cycle to prune older generations before restoring.");
    }
  }
  const latest = allRows.reduce((max, row) => Math.max(max, number(row.updated_at)), 0);
  const grouped = new Map<string, Row[]>();
  for (const row of allRows) {
    const device = snapshotDeviceBaseId(text(row.device_id));
    const generation = text(row.sync_generation) || "legacy";
    const key = device + "::" + generation;
    const list = grouped.get(key) ?? [];
    list.push(row as Row);
    grouped.set(key, list);
  }

  const newestByDevice = new Map<string, { updated: number; rows: Row[] }>();
  for (const list of grouped.values()) {
    const head = list[0]!;
    const baseDevice = snapshotDeviceBaseId(text(head.device_id));
    const complete = isCompleteSnapshotGeneration(list.map((row) => ({
      chunkIndex: number(row.chunk_index),
      chunkCount: number(row.chunk_count) || 1
    })));
    if (!complete) continue;
    const candidate = { updated: Math.max(...list.map((row) => number(row.updated_at))), rows: list };
    const previous = newestByDevice.get(baseDevice);
    if (!previous || candidate.updated > previous.updated) newestByDevice.set(baseDevice, candidate);
  }

  const parts: Row[] = [];
  const sourceDevices: Array<{ deviceId: string; lastSyncedAt: number }> = [];
  let verifiedChunks = 0;
  for (const [deviceId, value] of newestByDevice.entries()) {
    const ordered = [...value.rows].sort((a, b) => number(a.chunk_index) - number(b.chunk_index));
    sourceDevices.push({ deviceId, lastSyncedAt: value.updated });
    for (const row of ordered) {
      parts.push(await verifyAndDecodeToken(text(row.payload_token), secret, shopShareSecret));
      verifiedChunks++;
    }
  }
  if (allRows.length > 0 && verifiedChunks === 0) {
    throw new Error("The latest mobile snapshot set is incomplete. Wait for the phone's automatic sync retry.");
  }
  return {
    snapshot: parts.length ? mergeParts(parts) : null,
    uploadedAt: latest,
    rows: allRows,
    verifiedChunks,
    sourceDevices
  };
}

function safeRows(value: unknown, max: number, label: string) {
  const rows = arrayRows(value);
  if (rows.length > max) throw new Error("The " + label + " count exceeds the desktop import limit.");
  return rows;
}
function sanitizeSnapshot(input: unknown, owner: { username: string; shop: Row }): Snapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A complete BeBoss snapshot is required.");
  const value = input as Row;
  for (const key of DATA_KEYS) {
    if (!Array.isArray(value[key])) throw new Error("The snapshot is missing the " + key + " collection. Refresh the shop data and retry.");
  }
  const shopProfile = value.shopProfile && typeof value.shopProfile === "object" ? value.shopProfile as Row : null;
  if (!shopProfile) throw new Error("The registered shop profile is missing from the snapshot.");
  const shopName = text(shopProfile.shopName).trim();
  if (!shopName || shopName.length > 160) throw new Error("The shop profile name is invalid.");
  const result: Row = {
    metadata: {},
    shopProfile: { ...shopProfile, shopName },
    tombstones: safeRows(value.tombstones, 250000, "tombstone"),
  };
  const limits: Record<DataKey, number> = {
    products: 100000,
    customers: 100000,
    sales: 500000,
    saleItems: 1000000,
    customerPayments: 500000,
    purchases: 500000,
    stockTransfers: 100000,
    branches: 5000,
    users: 5000
  };
  for (const key of DATA_KEYS) {
    const rows = safeRows(value[key], limits[key], key);
    result[key] = key === "users"
      ? rows.map((row) => ({ ...row, pinHash: "", password: "" }))
      : rows;
  }
  return result as Snapshot;
}

function nowSnapshot(snapshot: Snapshot, username: string) {
  const now = Date.now();
  snapshot.metadata = {
    app: "BeBoss",
    version: "desktop-1.0",
    schemaVersion: 3,
    format: "beboss_branch_datashare_v3",
    timestamp: now,
    issuedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    nonce: crypto.randomUUID().replaceAll("-", ""),
    exportedBy: username,
    exportedByRole: "OWNER"
  };
  return snapshot;
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function branchPayload(data: Row, shopId: string) {
  const name = text(data.name).trim();
  if (name.length < 2 || name.length > 120) throw new Error("Branch name must contain 2–120 characters.");
  const status = normalizeBranchOperationalStatus(data.operationalStatus || "OPEN");
  const locationType = text(data.locationType || "STORE").trim().toUpperCase();
  if (!["STORE", "WAREHOUSE"].includes(locationType)) throw new Error("Location type must be STORE or WAREHOUSE.");
  if (locationType === "WAREHOUSE" && data.isMainBranch === true) {
    throw new Error("A warehouse cannot be the main retail/POS branch. Keep a STORE as the main branch.");
  }
  return {
    id: text(data.id) || crypto.randomUUID(),
    shop_sync_key: shopId,
    name,
    code: text(data.code).trim().slice(0, 40),
    location_type: locationType,
    address: text(data.address).trim().slice(0, 240),
    phone: text(data.phone).trim().slice(0, 40),
    manager_user_id: text(data.managerUserId).slice(0, 120),
    manager_name: text(data.managerName).trim().slice(0, 120),
    is_main_branch: data.isMainBranch === true,
    is_active: true,
    color_hex: /^#[0-9a-f]{6}$/i.test(text(data.colorHex)) ? text(data.colorHex) : "#FF6B1A",
    daily_sales_target_rwf: Math.max(0, Math.min(1000000000, Math.floor(number(data.dailySalesTargetRwf)))),
    monthly_target_rwf: Math.max(0, Math.min(1000000000, Math.floor(number(data.monthlyTargetRwf)))),
    opening_cash_float: Math.max(0, Math.min(1000000000, Math.floor(number(data.openingCashFloat)))),
    stock_value_rwf: Math.max(0, Math.floor(number(data.stockValueRwf))),
    product_count: Math.max(0, Math.floor(number(data.productCount))),
    operational_status: status,
    email: text(data.email).trim().slice(0, 120),
    notes: text(data.notes).trim().slice(0, 1000),
    created_at: number(data.createdAt) || Date.now(),
    updated_at: Date.now(),
    sync_version: Math.max(1, number(data.syncVersion) + 1),
    hlc_timestamp: Date.now(),
    last_modified_device_id: "DESKTOP"
  };
}



async function refreshShopUsageSummaryV2(admin: SupabaseClient, shopId: string) {
  const [devices, staff, branches, shop] = await Promise.all([
    admin.from("shop_devices").select("id", { count: "exact", head: true }).eq("shop_sync_key", shopId).eq("is_active", true),
    admin.from("shop_users").select("user_id", { count: "exact", head: true }).eq("shop_sync_key", shopId).eq("is_active", true),
    admin.from("shop_branches").select("id", { count: "exact", head: true }).eq("shop_sync_key", shopId).eq("is_active", true),
    admin.from("shop_accounts").select("device_limit").eq("id", shopId).maybeSingle()
  ]);
  for (const result of [devices, staff, branches, shop]) {
    if (result.error) throw new Error("Could not reconcile the shop's licensed usage summary: " + result.error.message);
  }
  const deviceCount = Math.max(1, Number(devices.count) || 0);
  const workerCount = Math.max(1, Number(staff.count) || 0);
  const branchCount = Math.max(1, Number(branches.count) || 0);
  const monthlyFee = monthlyShopFeeRwf(branchCount, workerCount, deviceCount);
  const { data, error } = await admin.from("shop_accounts").update({
    device_count: deviceCount,
    device_limit: Math.max(deviceCount, Number(shop.data?.device_limit) || 1),
    worker_count: workerCount,
    branch_count: branchCount,
    monthly_fee_rwf: monthlyFee,
    updated_at: Date.now()
  }).eq("id", shopId).select("id,device_count,device_limit,worker_count,branch_count,monthly_fee_rwf").single();
  if (error || !data) throw new Error("Could not update the shop's server-calculated license and billing summary: " + (error?.message || "No row returned."));
  return data;
}

async function loadManagementRecordsV2(admin: SupabaseClient, shopId: string, ownerUsername: string) {
  const [shop, devices, branches, transfers, staff, announcements, payments, codes, activity] = await Promise.all([
    admin.from("shop_accounts").select("id,shop_name,owner_name,owner_username,owner_phone,subscription_status,subscription_expires_at,branch_count,worker_count,device_count,device_limit,monthly_fee_rwf,business_type,updated_at").eq("id", shopId).maybeSingle(),
    admin.from("shop_devices").select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_username,assigned_user_name,last_synced_at,created_at,updated_at,monthly_fee_addon_rwf").eq("shop_sync_key", shopId).order("updated_at", { ascending: false }).limit(500),
    admin.from("shop_branches").select("*").eq("shop_sync_key", shopId).order("is_main_branch", { ascending: false }).limit(500),
    admin.from("shop_stock_transfers").select("*").eq("shop_sync_key", shopId).order("updated_at", { ascending: false }).limit(1000),
    admin.from("shop_users").select("user_id,full_name,username,phone,role,assigned_branch_id,assigned_branch_name,is_active,updated_at").eq("shop_sync_key", shopId).order("full_name", { ascending: true }).limit(1000),
    admin.from("announcements").select("id,title,body,severity,audience,target_shop_key,cta_label,cta_url,starts_at,ends_at,is_active,translations").in("audience", ["ALL","APP"]).eq("is_active", true).or(`target_shop_key.eq.${shopId},target_shop_key.eq.`).order("starts_at", { ascending: false }).limit(50),
    admin.from("payment_requests").select("id,provider,amount_rwf,duration_months,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,rejection_reason,created_at,updated_at,gateway_provider,gateway_reference,gateway_verified_at").eq("owner_username", ownerUsername).order("created_at", { ascending: false }).limit(100),
    admin.from("unlock_codes").select("unlock_code,tier_code,plan_days,status,issued_at,redeemed_at").eq("shop_username", ownerUsername).order("issued_at", { ascending: false }).limit(100),
    admin.from("cloud_sync_events").select("id,entity,action,actor,device_id,detail,created_at").eq("shop_sync_key", shopId).order("created_at", { ascending: false }).limit(1000)
  ]);
  for (const result of [shop, devices, branches, transfers, staff, announcements, payments, codes, activity]) {
    if (result.error) throw new Error("Could not refresh shop management records: " + result.error.message);
  }
  if (!shop.data) throw new Error("The registered shop account is unavailable.");
  return { shop: shop.data, devices: devices.data ?? [], branches: branches.data ?? [], transfers: transfers.data ?? [],
    staff: staff.data ?? [], announcements: announcements.data ?? [], payments: payments.data ?? [], codes: codes.data ?? [],
    activity: activity.data ?? [], serverTime: Date.now() };
}

async function recordShopAuditEvent(
  admin: SupabaseClient,
  shopId: string,
  shopName: string,
  actor: string,
  deviceId: string,
  entity: string,
  action: string,
  detail: string
) {
  const { error } = await admin.from("cloud_sync_events").insert({
    shop_sync_key: shopId,
    shop_name: shopName,
    entity,
    action,
    actor,
    device_id: deviceId,
    detail: detail.slice(0, 1000)
  });
  if (error) {
    console.error("[BeBoss shop activity audit]", entity, action, error.message);
    return false;
  }
  return true;
}

async function loadShopApprovalPolicy(admin: SupabaseClient, shopId: string) {
  const defaults = { version: 1, transferApprovalThresholdRwf: 0, reconciliationVarianceThresholdRwf: 0 };
  const { data, error } = await admin.from("cloud_sync_events")
    .select("detail,created_at").eq("shop_sync_key", shopId).eq("entity", "APPROVAL_POLICY")
    .eq("action", "UPDATED").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Could not load the shop approval policy: " + error.message);
  if (!data?.detail) return defaults;
  let value: Record<string, unknown>;
  try { value = JSON.parse(text(data.detail)); }
  catch { throw new Error("The saved shop approval policy is unreadable. Ask the owner to review it before continuing."); }
  const transfer = number(value.transferApprovalThresholdRwf);
  const variance = number(value.reconciliationVarianceThresholdRwf);
  if (!Number.isFinite(transfer) || !Number.isFinite(variance) || transfer < 0 || variance < 0 ||
      transfer > 10000000000 || variance > 10000000000) {
    throw new Error("The saved shop approval policy contains an invalid threshold.");
  }
  const policyTimestamp = Date.parse(text(data.created_at));
  const configuredVersion = Math.max(
    1,
    Math.floor(number(value.version)),
    Number.isFinite(policyTimestamp) ? policyTimestamp : 1
  );
  return { version: configuredVersion, transferApprovalThresholdRwf: Math.round(transfer),
    reconciliationVarianceThresholdRwf: Math.round(variance) };
}

async function ownerManagementActorV2(admin: SupabaseClient, shopId: string, actorDeviceId: string, ownerUsername: string) {
  const normalizedActorDeviceId = text(actorDeviceId).trim();
  const normalizedOwnerUsername = text(ownerUsername).trim().toLowerCase();
  if (!/^DESKTOP:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedActorDeviceId) ||
      !/^[a-z0-9._-]{2,80}$/.test(normalizedOwnerUsername)) {
    throw new Error("This desktop installation or registered owner identity is invalid.");
  }
  // Supabase Auth IDs and the Android Room shop_users.user_id are intentionally
  // separate identity domains. Resolve the Room owner using the username already
  // bound to the verified Auth membership and tenant, never by passing auth.uid().
  const [ownerUser, actorDevice, mainBranch] = await Promise.all([
    admin.from("shop_users").select("user_id,username,full_name,role,is_active")
      .eq("shop_sync_key", shopId).eq("username", normalizedOwnerUsername).eq("role", "OWNER").eq("is_active", true).maybeSingle(),
    admin.from("shop_devices").select("id,device_id,assigned_user_id,is_active")
      .eq("shop_sync_key", shopId).eq("device_id", normalizedActorDeviceId)
      .eq("is_active", true).maybeSingle(),
    admin.from("shop_branches").select("id,name").eq("shop_sync_key", shopId)
      .eq("is_active", true).eq("is_main_branch", true).maybeSingle()
  ]);
  if (ownerUser.error || !ownerUser.data || actorDevice.error || !actorDevice.data ||
      text(actorDevice.data.assigned_user_id) !== text(ownerUser.data.user_id)) {
    throw new Error("This desktop is not registered as an active device for the verified shop owner. Sign in again or use another active owner device.");
  }
  if (mainBranch.error) throw new Error("Could not load the shop's main branch.");
  let effectiveMainBranch = mainBranch.data;
  if (!effectiveMainBranch) {
    const fallback = await admin.from("shop_branches").select("id,name").eq("shop_sync_key", shopId)
      .eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (fallback.error) throw new Error("Could not load an active branch for device registration.");
    effectiveMainBranch = fallback.data;
  }
  return { ownerUser: ownerUser.data, actorDeviceId: text(actorDevice.data.device_id), mainBranch: effectiveMainBranch };
}

function validatedJwtAuthTimeSeconds(req: Request): number {
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const segment = token.split(".")[1] ?? "";
  if (!segment) return 0;
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Row;
    return Math.max(0, Math.floor(number(claims.auth_time)));
  } catch { return 0; }
}

async function issueDeviceInvitationV2(
  config: { url: string; serviceKey: string }, shopId: string, deviceRecordId: string,
  branchId: string, primaryDeviceId: string, ownerUserId: string
) {
  const random = crypto.getRandomValues(new Uint8Array(16));
  const joinCode = "BB-" + Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  const hash = await crypto.subtle.digest("SHA-256", asArrayBuffer(new TextEncoder().encode(joinCode)));
  const codeHash = bytesToHex(new Uint8Array(hash));
  const now = Date.now();
  const tenantAdmin = createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Shop-Sync-Key": shopId } }
  });
  const { error } = await tenantAdmin.rpc("issue_shop_device_invite", {
    p_shop_sync_key: shopId, p_device_record_id: deviceRecordId, p_code_hash: codeHash,
    p_created_by_device_id: primaryDeviceId, p_created_by_user_id: ownerUserId,
    p_branch_id: branchId, p_expires_at: now + 60 * 60 * 1000
  });
  if (error) throw new Error("Supabase rejected the secure device invitation: " + error.message);
  return { joinCode, expiresAt: now + 60 * 60 * 1000 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed." });

  try {
    const config = getServerConfig();
    const body = await req.json() as Row;
    const action = text(body.action);
    const admin = createClient(config.url, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const deviceCredentialAction = action === "device_enroll" || action === "device_retire_legacy";
    if (!config.hmacSecret && !deviceCredentialAction) {
      const { data: snapshotSecret, error: secretError } = await admin
        .from("app_secrets")
        .select("value")
        .eq("name", "BEBOSS_DATASHARE_HMAC_SECRET")
        .maybeSingle();
      const storedSecret = text(snapshotSecret?.value).trim();
      if (secretError || storedSecret.length < 8) {
        throw new Error("The existing Android snapshot HMAC key is not configured in the protected server secret store.");
      }
      config.hmacSecret = storedSecret;
    }

    if (action === "android_transfer_policy" ||
        action === "android_transfer_register_approval_key" ||
        action === "android_transfer_sync") {
      const deviceId = text(req.headers.get("X-BeBoss-Device-ID")).trim();
      const deviceToken = text(req.headers.get("X-BeBoss-Device-Token")).trim();
      if (deviceId.length < 4 || deviceId.length > 120 || !/^[a-f0-9]{64}$/i.test(deviceToken)) {
        return json(401, { ok: false, message: "A valid enrolled device credential is required for Android transfer operations." });
      }
      const deviceClient = createClient(config.url, config.publishableKey, {
        global: { headers: {
          "X-BeBoss-Device-ID": deviceId,
          "X-BeBoss-Device-Token": deviceToken
        } },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const shopResult = await deviceClient.from("shop_accounts")
        .select("id,shop_name,remote_kill_switch").maybeSingle();
      const shop = shopResult.data;
      if (shopResult.error || !shop || shop.remote_kill_switch === true) {
        return json(401, { ok: false, message: "The Android device is not authenticated for an active shop." });
      }

      const deviceResult = await admin.from("shop_devices")
        .select("id,device_id,is_active,is_owner_primary,assigned_user_id,role")
        .eq("shop_sync_key", text(shop.id)).eq("device_id", deviceId)
        .eq("is_active", true).maybeSingle();
      const currentDevice = deviceResult.data;
      if (deviceResult.error || !currentDevice) {
        return json(403, { ok: false, message: "This Android terminal is not present in the active shop device registry." });
      }

      if (action === "android_transfer_policy") {
        const policy = await loadShopApprovalPolicy(admin, text(shop.id));
        return json(200, {
          ok: true,
          version: policy.version,
          transferApprovalThresholdRwf: policy.transferApprovalThresholdRwf,
          serverTime: Date.now()
        });
      }

      let transferWriterBranchId = "";
      if (action === "android_transfer_sync") {
        const writerUserId = text(currentDevice.assigned_user_id).trim();
        const writerResult = await admin.from("shop_users")
          .select("user_id,role,is_active,assigned_branch_id")
          .eq("shop_sync_key", text(shop.id)).eq("user_id", writerUserId).maybeSingle();
        const writer = writerResult.data;
        const deviceRole = text(currentDevice.role).toUpperCase();
        if (writerResult.error || !writer || writer.is_active !== true ||
            !["OWNER", "MANAGER"].includes(text(writer.role).toUpperCase()) ||
            text(writer.role).toUpperCase() !== deviceRole) {
          return json(403, { ok: false, message: "This terminal is not assigned to an active owner or manager account authorized to synchronize stock transfers." });
        }
        transferWriterBranchId = text(writer.assigned_branch_id).trim();
        if (deviceRole === "MANAGER" && !transferWriterBranchId) {
          return json(403, { ok: false, message: "A manager terminal must be assigned to an active branch before synchronizing transfers." });
        }
      }

      if (action === "android_transfer_register_approval_key") {
        if (currentDevice.is_owner_primary !== true || text(currentDevice.role).toUpperCase() !== "OWNER") {
          return json(403, { ok: false, message: "Only the active primary-owner Android terminal may register an approval key." });
        }
        const ownerUserId = text(currentDevice.assigned_user_id);
        const ownerResult = await admin.from("shop_users")
          .select("user_id,role,is_active").eq("shop_sync_key", text(shop.id))
          .eq("user_id", ownerUserId).eq("role", "OWNER").eq("is_active", true).maybeSingle();
        if (ownerResult.error || !ownerResult.data) {
          return json(403, { ok: false, message: "The primary terminal is not assigned to an active owner account." });
        }
        const publicKey = text(body.publicKey).trim();
        if (publicKey.length < 80 || publicKey.length > 1200 || !/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey)) {
          return json(400, { ok: false, message: "The Android owner public key is malformed." });
        }
        try {
          await crypto.subtle.importKey(
            "spki", base64ToBytes(publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
          );
        } catch {
          return json(400, { ok: false, message: "The Android owner public key is not a valid P-256 signing key." });
        }
        const previous = await admin.from("cloud_sync_events").select("detail")
          .eq("shop_sync_key", text(shop.id)).eq("entity", "TRANSFER_APPROVAL_KEY")
          .eq("action", "REGISTERED").eq("device_id", deviceId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (previous.error) throw new Error("Could not read the enrolled owner signing key: " + previous.error.message);
        if (previous.data?.detail) {
          let existing: Row = {};
          try { existing = JSON.parse(text(previous.data.detail)) as Row; } catch { /* fail closed below */ }
          if (text(existing.publicKey) !== publicKey || text(existing.ownerUserId) !== ownerUserId) {
            return json(409, { ok: false, message: "This owner terminal already has a different registered signing key. Use the reviewed recovery process before rotating it." });
          }
          return json(200, { ok: true, alreadyRegistered: true });
        }
        const detail = JSON.stringify({
          version: 1,
          algorithm: "ECDSA_P256_SHA256",
          publicKey,
          ownerUserId,
          registeredAt: Date.now()
        });
        const saved = await recordShopAuditEvent(
          admin, text(shop.id), text(shop.shop_name), "ANDROID_OWNER:" + ownerUserId,
          deviceId, "TRANSFER_APPROVAL_KEY", "REGISTERED", detail
        );
        if (!saved) return json(503, { ok: false, message: "The signing key could not be recorded in the cloud audit journal. Retry before using offline approvals." });
        return json(200, { ok: true, registered: true });
      }

      const requested = Array.isArray(body.transfers) ? body.transfers as Row[] : [];
      if (requested.length < 1 || requested.length > 250) {
        return json(400, { ok: false, message: "Android transfer batches must contain between 1 and 250 records." });
      }
      const ids = requested.map((row) => text(row.id).trim());
      if (ids.some((id) => !id || id.length > 120) || new Set(ids).size !== ids.length) {
        return json(400, { ok: false, message: "Transfer records must contain unique valid identifiers." });
      }

      const policy = await loadShopApprovalPolicy(admin, text(shop.id));
      const existingResult = await admin.from("shop_stock_transfers")
        .select("id,transfer_number,product_id,from_branch_id,to_branch_id,quantity,cost_value_rwf,status,created_at,updated_at")
        .eq("shop_sync_key", text(shop.id)).in("id", ids);
      if (existingResult.error) throw new Error("Could not load existing transfer ledger records.");
      const existingById = new Map<string, Row>(
        (existingResult.data ?? []).map((row) => [text(row.id), row])
      );
      const newTransfers = requested.filter((row) => !existingById.has(text(row.id).trim()));
      const snapshotResult = newTransfers.length
        ? await latestVerifiedSnapshot(admin, text(shop.id), config.hmacSecret)
        : { snapshot: null };
      if (newTransfers.length && !snapshotResult.snapshot) {
        return json(409, { ok: false, message: "A verified shop inventory snapshot is required before new Android stock transfers can be accepted. Sync the primary terminal and retry." });
      }
      const productById = new Map<string, Row>(
        (snapshotResult.snapshot?.products ?? []).map((row) => [text(row.id), row])
      );
      const newBranchIds = [...new Set(newTransfers.flatMap((row) => [
        text(row.from_branch_id).trim(), text(row.to_branch_id).trim()
      ]).filter(Boolean))];
      const assignedBranchId = transferWriterBranchId;
      if (text(currentDevice.role).toUpperCase() === "MANAGER" &&
          requested.some((row) => ![assignedBranchId].includes(text(row.from_branch_id).trim()) &&
            ![assignedBranchId].includes(text(row.to_branch_id).trim()))) {
        return json(403, { ok: false, message: "A manager terminal may synchronize only transfers involving its assigned branch." });
      }
      const branchResult = newBranchIds.length
        ? await admin.from("shop_branches").select("id,is_active,operational_status")
            .eq("shop_sync_key", text(shop.id)).in("id", newBranchIds).limit(100)
        : { data: [], error: null };
      if (branchResult.error) throw new Error("Could not validate new transfer branches: " + branchResult.error.message);
      const branchById = new Map<string, Row>((branchResult.data ?? []).map((row) => [text(row.id), row]));

      const rowsToSave: Row[] = [];
      const newApprovalAudit: Row[] = [];
      const verifiedPriorApprovalIds = new Set<string>();
      const verifiedPortalApprovalIds = new Set<string>();
      const statusChanges: Array<{ id: string; from: string; to: string }> = [];
      const allowedExistingTransitions: Record<string, string[]> = {
        REQUESTED: ["IN_TRANSIT", "REJECTED"],
        RECEIPT_REQUESTED: ["COMPLETED"],
        CANCEL_REQUESTED: ["CANCELLED"],
        IN_TRANSIT: ["COMPLETED", "CANCELLED"],
        PENDING: ["COMPLETED", "CANCELLED"],
        COMPLETED: [],
        CANCELLED: [],
        REJECTED: []
      };
      const allowedNewStatuses = new Set(["IN_TRANSIT", "PENDING", "COMPLETED", "CANCELLED", "REJECTED"]);

      for (const transfer of requested) {
        const transferId = text(transfer.id).trim();
        const productId = text(transfer.product_id).trim();
        const fromBranchId = text(transfer.from_branch_id).trim();
        const toBranchId = text(transfer.to_branch_id).trim();
        const quantity = number(transfer.quantity);
        const transferNumber = text(transfer.transfer_number).trim();
        const incomingStatus = (text(transfer.status).trim() || "IN_TRANSIT").toUpperCase();
        if (!transferId || !productId || !fromBranchId || !toBranchId || !transferNumber ||
            fromBranchId === toBranchId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000000) {
          return json(400, { ok: false, message: "A transfer contains invalid product, branch, quantity or transfer-number data." });
        }

        const existing = existingById.get(transferId);
        let cost = 0;
        let approvalRequired = false;
        let priorApprovalValid = false;
        let portalApprovalValid = false;

        if (existing) {
          // Existing transfer facts are immutable. Only the server-command lifecycle
          // may advance; old ledger rows are not revalidated against today's open/active
          // branch and product catalogue state.
          const immutableMatch =
            text(existing.product_id) === productId &&
            text(existing.from_branch_id) === fromBranchId &&
            text(existing.to_branch_id) === toBranchId &&
            number(existing.quantity) === quantity &&
            number(existing.cost_value_rwf) === number(transfer.cost_value_rwf) &&
            (!text(existing.transfer_number) || text(existing.transfer_number) === transferNumber);
          if (!immutableMatch) {
            return json(409, { ok: false, message: "An existing transfer's product, branches, quantity, cost or transfer number was modified. The cloud ledger remains unchanged." });
          }
          cost = number(existing.cost_value_rwf);
          const previousStatus = text(existing.status).toUpperCase();
          if (incomingStatus !== previousStatus &&
              !(allowedExistingTransitions[previousStatus] ?? []).includes(incomingStatus)) {
            return json(409, { ok: false, message: "Invalid transfer lifecycle transition from " + previousStatus + " to " + incomingStatus + "." });
          }
          if (incomingStatus !== previousStatus) {
            if (text(currentDevice.role).toUpperCase() === "MANAGER") {
              if (incomingStatus === "COMPLETED" && toBranchId !== assignedBranchId) {
                return json(403, { ok: false, message: "Only a manager assigned to the destination branch can confirm receipt." });
              }
              if (incomingStatus === "CANCELLED" && fromBranchId !== assignedBranchId) {
                return json(403, { ok: false, message: "Only a manager assigned to the source branch can cancel a transfer." });
              }
            }
            statusChanges.push({ id: transferId, from: previousStatus, to: incomingStatus });
          }

          if (incomingStatus === "IN_TRANSIT" && previousStatus === "REQUESTED") {
            const portalEvent = await admin.from("cloud_sync_events").select("detail,created_at")
              .eq("shop_sync_key", text(shop.id)).eq("entity", "STOCK_TRANSFER")
              .eq("action", "REQUESTED_OWNER_APPROVED")
              .like("detail", '%"recordId":"' + transferId + '"%')
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (portalEvent.error) throw new Error("Could not verify the original owner approval for this web transfer request.");
            if (portalEvent.data?.detail) {
              try {
                const approval = JSON.parse(text(portalEvent.data.detail)) as Row;
                portalApprovalValid =
                  text(approval.recordId) === transferId &&
                  text(approval.productId) === productId &&
                  text(approval.fromBranchId) === fromBranchId &&
                  text(approval.toBranchId) === toBranchId &&
                  number(approval.quantity) === quantity &&
                  number(approval.transferCostRwf) === cost &&
                  approval.approvalRequired === true &&
                  number(approval.policyVersion) >= 1 &&
                  text(approval.reason).trim().length >= 8 &&
                  Boolean(text(approval.approverUsername)) &&
                  Boolean(text(approval.approvalDeviceId));
              } catch { portalApprovalValid = false; }
            }
            const currentlyHighValue = policy.transferApprovalThresholdRwf > 0 &&
              cost >= policy.transferApprovalThresholdRwf;
            if (currentlyHighValue && !portalApprovalValid) {
              return json(403, { ok: false, message: "This owner-created transfer request has no matching server-recorded approval for its current value. Keep it pending and request fresh owner approval." });
            }
            if (portalApprovalValid) verifiedPortalApprovalIds.add(transferId);
          }

          const previousAndroidApproval = await admin.from("cloud_sync_events").select("detail")
            .eq("shop_sync_key", text(shop.id)).eq("entity", "STOCK_TRANSFER")
            .eq("action", "ANDROID_OWNER_APPROVED")
            .like("detail", '%"recordId":"' + transferId + '"%')
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (previousAndroidApproval.error) throw new Error("Could not verify prior transfer approval evidence.");
          if (previousAndroidApproval.data?.detail) {
            try {
              const approval = JSON.parse(text(previousAndroidApproval.data.detail)) as Row;
              priorApprovalValid =
                text(approval.recordId) === transferId &&
                text(approval.productId) === productId &&
                text(approval.fromBranchId) === fromBranchId &&
                text(approval.toBranchId) === toBranchId &&
                number(approval.quantity) === quantity &&
                number(approval.transferCostRwf) === cost &&
                number(approval.policyVersion) >= 1 &&
                text(approval.reason).trim().length >= 8 &&
                Boolean(text(approval.signature));
            } catch { priorApprovalValid = false; }
          }
          if (priorApprovalValid) verifiedPriorApprovalIds.add(transferId);
        } else {
          if (!allowedNewStatuses.has(incomingStatus)) {
            return json(409, { ok: false, message: "A new Android transfer cannot be uploaded with server-command status " + incomingStatus + "." });
          }
          const product = productById.get(productId);
          const fromBranch = branchById.get(fromBranchId);
          const toBranch = branchById.get(toBranchId);
          if (!product || product.isDeleted === true || !fromBranch?.is_active || !toBranch?.is_active ||
              text(fromBranch.operational_status).toUpperCase() !== "OPEN" ||
              text(toBranch.operational_status).toUpperCase() !== "OPEN") {
            return json(409, { ok: false, message: "A new transfer references a deleted product or inactive/closed branch." });
          }
          if (text(product.branchId) && text(product.branchId) !== fromBranchId) {
            return json(409, { ok: false, message: "The selected product is not assigned to the source branch in the latest verified inventory snapshot." });
          }
          cost = Math.max(0, Math.round(quantity * number(product.costPrice)));
          if (number(transfer.cost_value_rwf) !== cost) {
            return json(409, { ok: false, message: "The transfer cost does not match the latest verified product cost. Refresh inventory and retry." });
          }
          approvalRequired = policy.transferApprovalThresholdRwf > 0 &&
            cost >= policy.transferApprovalThresholdRwf;
        }

        // A record already in the cloud was originally committed under the authority
        // of its creating workflow. Existing lifecycle updates do not need new approval.
        // A new offline record above today's threshold must have a fresh signed proof.
        const approvalProof = transfer.approval_proof && typeof transfer.approval_proof === "object"
          ? transfer.approval_proof as Row : {};
        const hasApprovalSignature = Boolean(text(approvalProof.signature).trim());
        const needsNewApprovalProof = (!existing && approvalRequired) ||
          (Boolean(existing) && !priorApprovalValid && policy.transferApprovalThresholdRwf > 0 &&
            cost >= policy.transferApprovalThresholdRwf && hasApprovalSignature);
        if (needsNewApprovalProof) {
          const proof = approvalProof;
          const reason = text(proof.reason).trim();
          const actorUserId = text(proof.actor_user_id).trim();
          const approvalDeviceId = text(proof.device_id).trim();
          const signedAt = number(proof.signed_at);
          const proofPolicyVersion = number(proof.policy_version);
          const signatureText = text(proof.signature).trim();
          if (reason.length < 8 || reason.length > 300 || !actorUserId ||
              !approvalDeviceId || !/^[A-Za-z0-9+/]+={0,2}$/.test(signatureText) ||
              signatureText.length < 80 || proofPolicyVersion !== policy.version ||
              signedAt <= 0 || signedAt > Date.now() + 5 * 60 * 1000 ||
              Date.now() - signedAt > 90 * 24 * 60 * 60 * 1000) {
            return json(403, { ok: false, message: "This new transfer meets the current owner-approval threshold but has no valid, recent owner approval evidence. Keep it pending and request owner approval." });
          }
          const approvalDeviceResult = await admin.from("shop_devices")
            .select("id,device_id,is_active,is_owner_primary,assigned_user_id,role")
            .eq("shop_sync_key", text(shop.id)).eq("device_id", approvalDeviceId)
            .eq("is_active", true).maybeSingle();
          const approvalDevice = approvalDeviceResult.data;
          if (approvalDeviceResult.error || !approvalDevice || approvalDevice.is_owner_primary !== true ||
              text(approvalDevice.role).toUpperCase() !== "OWNER" ||
              text(approvalDevice.assigned_user_id) !== actorUserId) {
            return json(403, { ok: false, message: "The approval signature was not issued by the active primary owner terminal." });
          }
          const ownerUser = await admin.from("shop_users").select("user_id")
            .eq("shop_sync_key", text(shop.id)).eq("user_id", actorUserId)
            .eq("role", "OWNER").eq("is_active", true).maybeSingle();
          if (ownerUser.error || !ownerUser.data) {
            return json(403, { ok: false, message: "The approving owner account is inactive or no longer authorized." });
          }
          const keyEvent = await admin.from("cloud_sync_events").select("detail")
            .eq("shop_sync_key", text(shop.id)).eq("entity", "TRANSFER_APPROVAL_KEY")
            .eq("action", "REGISTERED").eq("device_id", approvalDeviceId)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (keyEvent.error || !keyEvent.data?.detail) {
            return json(403, { ok: false, message: "The approving terminal has no server-registered owner signing key." });
          }
          let keyRecord: Row;
          try { keyRecord = JSON.parse(text(keyEvent.data.detail)) as Row; }
          catch { return json(403, { ok: false, message: "The registered owner signing key record is invalid." }); }
          if (text(keyRecord.ownerUserId) !== actorUserId || text(keyRecord.algorithm) !== "ECDSA_P256_SHA256") {
            return json(403, { ok: false, message: "The registered signing key is not bound to this active owner." });
          }
          const canonical = canonicalTransferApproval([
            "BEBOSS_TRANSFER_APPROVAL_V1", text(shop.id), transferId, productId,
            fromBranchId, toBranchId, normalizeTransferQuantity(transfer.quantity),
            String(cost), String(policy.version), actorUserId, approvalDeviceId,
            String(signedAt), reason
          ]);
          try {
            const publicKey = await crypto.subtle.importKey(
              "spki", base64ToBytes(text(keyRecord.publicKey)),
              { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
            );
            const signature = derEcdsaToRawSignature(base64ToBytes(signatureText));
            const valid = await crypto.subtle.verify(
              { name: "ECDSA", hash: "SHA-256" }, publicKey,
              asArrayBuffer(signature),
              asArrayBuffer(new TextEncoder().encode(canonical))
            );
            if (!valid) return json(403, { ok: false, message: "The transfer owner-approval signature is invalid." });
          } catch {
            return json(403, { ok: false, message: "The transfer owner-approval signature could not be verified." });
          }
          newApprovalAudit.push({
            recordId: transferId,
            productId,
            fromBranchId,
            toBranchId,
            quantity,
            approverUserId: actorUserId,
            approvalDeviceId,
            signedAt,
            policyVersion: proofPolicyVersion,
            transferCostRwf: cost,
            reason,
            signature: signatureText
          });
        }

        const writerDeviceId = text(transfer.last_modified_device_id).trim() || deviceId;
        rowsToSave.push({
          id: transferId,
          shop_sync_key: text(shop.id),
          shop_name: text(shop.shop_name),
          transfer_number: transferNumber,
          product_id: productId,
          product_name: text(transfer.product_name),
          from_branch_id: fromBranchId,
          from_branch_name: text(transfer.from_branch_name),
          to_branch_id: toBranchId,
          to_branch_name: text(transfer.to_branch_name),
          quantity,
          unit: text(transfer.unit) || "pcs",
          cost_value_rwf: cost,
          transfer_date: number(transfer.transfer_date) || Date.now(),
          status: incomingStatus,
          notes: text(transfer.notes).slice(0, 1000),
          transferred_by: text(transfer.transferred_by).slice(0, 120),
          received_by: text(transfer.received_by).slice(0, 120),
          received_at: number(transfer.received_at),
          synced: true,
          created_at: number(existing?.created_at) || number(transfer.created_at) || Date.now(),
          updated_at: Math.max(number(transfer.updated_at), number(existing?.updated_at), number(existing?.created_at), number(transfer.created_at)),
          hlc_timestamp: number(transfer.hlc_timestamp),
          last_modified_device_id: writerDeviceId
        });
      }

      if (rowsToSave.length > 0) {
        const upload = await admin.from("shop_stock_transfers").upsert(rowsToSave, { onConflict: "id" });
        if (upload.error) throw new Error("The verified Android transfers could not be committed: " + upload.error.message);
      }
      const existingSyncEvents = await admin.from("cloud_sync_events").select("detail")
        .eq("shop_sync_key", text(shop.id)).eq("entity", "STOCK_TRANSFER")
        .eq("action", "ANDROID_TRANSFER_SYNCED").order("created_at", { ascending: false }).limit(1000);
      if (existingSyncEvents.error) {
        throw new Error("Could not verify prior Android transfer synchronization audit events.");
      }
      const lastSyncByTransfer = new Map<string, number>();
      for (const item of existingSyncEvents.data ?? []) {
        try {
          const detail = JSON.parse(text(item.detail)) as Row;
          const recordId = text(detail.recordId);
          const updatedAt = number(detail.updatedAt);
          if (recordId && !lastSyncByTransfer.has(recordId)) lastSyncByTransfer.set(recordId, updatedAt);
        } catch { /* malformed audit detail is ignored; the next valid event repairs the history */ }
      }

      for (const evidence of newApprovalAudit) {
        const detail = JSON.stringify({ version: 1, ...evidence });
        const saved = await recordShopAuditEvent(
          admin, text(shop.id), text(shop.shop_name),
          "ANDROID_OWNER:" + text(evidence.approverUserId),
          text(evidence.approvalDeviceId), "STOCK_TRANSFER", "ANDROID_OWNER_APPROVED", detail
        );
        if (!saved) {
          return json(503, { ok: false, message: "Transfers were committed, but owner approval evidence could not be journaled. Keep synchronization pending and retry." });
        }
      }

      const approvalAuditIds = new Set(newApprovalAudit.map((item) => text(item.recordId)));
      const statusChangeById = new Map(statusChanges.map((change) => [change.id, change]));
      for (const transfer of requested) {
        const recordId = text(transfer.id);
        const savedTransfer = rowsToSave.find((row) => text(row.id) === recordId);
        const updatedAt = number(savedTransfer?.updated_at);
        if ((lastSyncByTransfer.get(recordId) ?? -1) >= updatedAt) continue;
        const approvalRequired = policy.transferApprovalThresholdRwf > 0 &&
          number(savedTransfer?.cost_value_rwf) >= policy.transferApprovalThresholdRwf;
        const eventDetail = JSON.stringify({
          version: 1,
          recordId,
          transferNumber: text(transfer.transfer_number),
          productId: text(transfer.product_id),
          fromBranchId: text(transfer.from_branch_id),
          toBranchId: text(transfer.to_branch_id),
          quantity: number(transfer.quantity),
          costValueRwf: number(savedTransfer?.cost_value_rwf),
          status: text(transfer.status).toUpperCase(),
          previousStatus: statusChangeById.get(recordId)?.from ?? "",
          statusChanged: statusChangeById.has(recordId),
          sourceDeviceId: text(transfer.last_modified_device_id) || deviceId,
          updatedAt,
          syncedAt: Date.now(),
          approvalRequired,
          approvalVerified: approvalAuditIds.has(recordId) || verifiedPriorApprovalIds.has(recordId) || verifiedPortalApprovalIds.has(recordId)
        });
        const saved = await recordShopAuditEvent(
          admin, text(shop.id), text(shop.shop_name),
          "ANDROID_DEVICE:" + text(currentDevice.assigned_user_id),
          deviceId, "STOCK_TRANSFER", "ANDROID_TRANSFER_SYNCED", eventDetail
        );
        if (!saved) {
          return json(503, { ok: false, message: "Transfers were saved, but the synchronization audit could not be recorded. Retry synchronization." });
        }
        const statusChange = statusChangeById.get(recordId);
        if (statusChange) {
          const statusAuditSaved = await recordShopAuditEvent(
            admin, text(shop.id), text(shop.shop_name),
            "ANDROID_DEVICE:" + text(currentDevice.assigned_user_id),
            deviceId, "STOCK_TRANSFER", "ANDROID_TRANSFER_STATUS_CHANGED",
            JSON.stringify({
              version: 1, recordId,
              previousStatus: statusChange.from,
              status: statusChange.to,
              updatedAt,
              actorUserId: text(currentDevice.assigned_user_id),
              deviceId
            })
          );
          if (!statusAuditSaved) {
            return json(503, { ok: false, message: "The transfer status changed, but its lifecycle audit could not be recorded. Refresh before retrying." });
          }
        }
      }
      return json(200, {
        ok: true,
        acceptedCount: rowsToSave.length,
        ownerApprovedCount: newApprovalAudit.length,
        policyVersion: policy.version,
        serverTime: Date.now()
      });
    }

    if (action === "record_device_local_audit") {
      const deviceId = text(req.headers.get("X-BeBoss-Device-ID")).trim();
      const deviceToken = text(req.headers.get("X-BeBoss-Device-Token")).trim();
      if (deviceId.length < 4 || deviceId.length > 120 || !/^[a-f0-9]{64}$/i.test(deviceToken)) {
        return json(401, { ok: false, message: "A valid enrolled device credential is required to write employee audit events." });
      }
      const deviceClient = createClient(config.url, config.publishableKey, {
        global: { headers: {
          "X-BeBoss-Device-ID": deviceId,
          "X-BeBoss-Device-Token": deviceToken
        } },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: shop, error: shopError } = await deviceClient.from("shop_accounts")
        .select("id,shop_name,remote_kill_switch").maybeSingle();
      if (shopError || !shop || shop.remote_kill_switch === true) {
        return json(401, { ok: false, message: "The device is not authenticated for an active BeBoss shop." });
      }

      const requested = Array.isArray(body.records) ? body.records as Row[] : [];
      if (requested.length < 1 || requested.length > 250) {
        return json(400, { ok: false, message: "Local audit batches must contain between 1 and 250 events." });
      }
      const seen = new Set<string>();
      for (const event of requested) {
        const eventId = text(event.eventId).trim();
        const actionName = text(event.action).trim().toUpperCase();
        const occurredAt = number(event.occurredAt);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId) ||
            !/^[A-Z0-9_:-]{2,80}$/.test(actionName) ||
            !text(event.actorName).trim() || text(event.actorName).length > 80 ||
            !text(event.actorRole).trim() || text(event.actorRole).length > 40 ||
            text(event.targetId).length > 120 || text(event.details).length > 600 ||
            !Number.isFinite(occurredAt) || occurredAt <= 0 ||
            seen.has(eventId)) {
          return json(400, { ok: false, message: "A local audit event is malformed or duplicated." });
        }
        seen.add(eventId);
      }

      let acknowledgedCount = 0;
      let duplicateCount = 0;
      const systemRoles = new Set(["SYSTEM", "SECURITY", "DATABASE", "MAINTENANCE", "SYNC_ENGINE"]);
      for (const event of requested) {
        const eventId = text(event.eventId).trim();
        const actorName = text(event.actorName).trim().slice(0, 80);
        const actorRole = text(event.actorRole).trim().toUpperCase().slice(0, 40);
        const actionName = text(event.action).trim().toUpperCase();
        const targetId = text(event.targetId).trim().slice(0, 120);
        // Never copy likely credential material to the tenant's long-lived journal.
        const details = text(event.details).slice(0, 250).replace(
          /\b(password|pin|token|secret|otp|authorization)\b\s*[:=]\s*[^\s,;]+/gi,
          "$1=[REDACTED]"
        );
        const occurredAt = number(event.occurredAt);

        let actorUserId = "";
        let actorIdentityVerified = false;
        if (actorName && !systemRoles.has(actorRole)) {
          const { data: matches, error: actorError } = await admin.from("shop_users")
            .select("user_id,full_name,role,is_active")
            .eq("shop_sync_key", text(shop.id))
            .eq("full_name", actorName)
            .eq("role", actorRole)
            .eq("is_active", true)
            .limit(2);
          if (actorError) throw new Error("Could not verify a local audit actor against the active shop roster: " + actorError.message);
          if ((matches ?? []).length === 1) {
            actorUserId = text(matches?.[0]?.user_id);
            actorIdentityVerified = actorUserId.length > 0;
          }
        }

        const detail = JSON.stringify({
          version: 1,
          eventId,
          actorName,
          actorRole,
          actorIdentityVerified,
          actorUserId,
          targetId,
          details,
          occurredAt,
          source: "ANDROID_LOCAL_AUDIT"
        });
        if (detail.length > 1000) {
          return json(400, { ok: false, message: "A local audit event exceeds the cloud journal detail limit after normalization." });
        }
        const { data: duplicate, error: duplicateError } = await admin.from("cloud_sync_events")
          .select("id")
          .eq("shop_sync_key", text(shop.id))
          .eq("entity", "USER_DEVICE_AUDIT")
          .eq("device_id", deviceId)
          .like("detail", `%"eventId":"${eventId}"%`)
          .limit(1)
          .maybeSingle();
        if (duplicateError) throw new Error("Could not check local audit idempotency: " + duplicateError.message);
        if (duplicate) {
          duplicateCount += 1;
          continue;
        }
        const actor = actorIdentityVerified ? "ANDROID_USER:" + actorUserId : "ANDROID_DEVICE:" + deviceId;
        const saved = await recordShopAuditEvent(
          admin, text(shop.id), text(shop.shop_name), actor,
          deviceId, "USER_DEVICE_AUDIT", actionName, detail
        );
        if (!saved) {
          return json(503, { ok: false, message: "The local audit event could not be committed. Keep it pending and retry synchronization." });
        }
        acknowledgedCount += 1;
      }
      return json(200, { ok: true, acknowledgedCount: acknowledgedCount + duplicateCount, insertedCount: acknowledgedCount, duplicateCount });
    }

    if (action === "record_device_sync_audit") {
      const deviceId = text(req.headers.get("X-BeBoss-Device-ID")).trim();
      const deviceToken = text(req.headers.get("X-BeBoss-Device-Token")).trim();
      if (deviceId.length < 4 || deviceId.length > 120 || !/^[a-f0-9]{64}$/i.test(deviceToken)) {
        return json(401, { ok: false, message: "A valid enrolled device credential is required to write shop audit events." });
      }
      const deviceClient = createClient(config.url, config.publishableKey, {
        global: { headers: {
          "X-BeBoss-Device-ID": deviceId,
          "X-BeBoss-Device-Token": deviceToken
        } },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: shop, error: shopError } = await deviceClient.from("shop_accounts")
        .select("id,shop_name,owner_username,remote_kill_switch").maybeSingle();
      if (shopError || !shop || shop.remote_kill_switch === true) {
        return json(401, { ok: false, message: "The device is not authenticated for an active BeBoss shop." });
      }

      const entity = text(body.entity).toUpperCase() as ShopAuditEntity;
      if (entity !== "BRANCH" && entity !== "STOCK_TRANSFER") {
        return json(400, { ok: false, message: "Unsupported device audit entity." });
      }
      const requestedRecords = Array.isArray(body.records) ? body.records as Row[] : [];
      if (requestedRecords.length < 1 || requestedRecords.length > 250) {
        return json(400, { ok: false, message: "Device audit batches must contain between 1 and 250 records." });
      }
      const ids = requestedRecords.map((record) => text(record.id).trim());
      if (ids.some((id) => !id || id.length > 120) || new Set(ids).size !== ids.length) {
        return json(400, { ok: false, message: "Device audit records must have unique valid record identifiers." });
      }

      let currentRows: Row[] = [];
      if (entity === "BRANCH") {
        const result = await admin.from("shop_branches")
          .select("id,shop_sync_key,name,code,location_type,address,phone,email,notes,manager_user_id,manager_name,is_active,is_main_branch,operational_status,daily_sales_target_rwf,monthly_target_rwf,opening_cash_float,created_at,updated_at,hlc_timestamp,last_modified_device_id")
          .eq("shop_sync_key", text(shop.id)).in("id", ids).limit(250);
        if (result.error) throw new Error("Could not verify uploaded branch records before journaling: " + result.error.message);
        currentRows = (result.data ?? []) as unknown as Row[];
      } else {
        const result = await admin.from("shop_stock_transfers")
          .select("id,shop_sync_key,transfer_number,product_id,product_name,from_branch_id,from_branch_name,to_branch_id,to_branch_name,quantity,unit,cost_value_rwf,status,transferred_by,received_by,received_at,notes,created_at,updated_at,hlc_timestamp,last_modified_device_id")
          .eq("shop_sync_key", text(shop.id)).in("id", ids).limit(250);
        if (result.error) throw new Error("Could not verify uploaded stock-transfer records before journaling: " + result.error.message);
        currentRows = (result.data ?? []) as unknown as Row[];
      }
      const currentById = new Map<string, Row>(currentRows.map((row) => [text(row.id), row]));
      if (currentById.size !== ids.length) {
        return json(409, { ok: false, message: "Some records are not yet visible in the cloud. The device must retry the audit after the record upload completes." });
      }

      const verifiedRows: Row[] = [];
      for (const requested of requestedRecords) {
        const current = currentById.get(text(requested.id))!;
        if (number(current.updated_at) !== number(requested.updatedAt) ||
            number(current.hlc_timestamp) !== number(requested.hlcTimestamp) ||
            text(current.last_modified_device_id) !== text(requested.lastModifiedDeviceId) ||
            text(current.last_modified_device_id) !== deviceId ||
            text(requested.lastModifiedDeviceId) !== deviceId) {
          return json(409, { ok: false, message: "A record changed while its audit was being submitted. Synchronize the newest version and retry." });
        }
        verifiedRows.push(current);
      }

      const { data: previousEvents, error: previousError } = await admin.from("cloud_sync_events")
        .select("detail,created_at").eq("shop_sync_key", text(shop.id)).eq("entity", entity)
        .order("created_at", { ascending: false }).limit(1000);
      if (previousError) throw new Error("Could not read the previous shop audit journal: " + previousError.message);
      const previousStates = new Map<string, ReturnType<typeof buildShopAuditSnapshot>>();
      for (const event of previousEvents ?? []) {
        try {
          const parsed = JSON.parse(text(event.detail));
          const recordId = text(parsed?.recordId);
          if (parsed?.version === 1 && recordId && !previousStates.has(recordId)) {
            const state = parseShopAuditSnapshot(text(event.detail), recordId);
            if (state) previousStates.set(recordId, state);
          }
        } catch { /* Older plain-text audit entries are retained but are not state baselines. */ }
      }

      let auditedCount = 0;
      let unchangedCount = 0;
      for (const current of verifiedRows) {
        const state = buildShopAuditSnapshot(entity, current);
        const previous = previousStates.get(text(current.id)) ?? null;
        const transition = classifyShopAuditTransition(entity, previous, state);
        if (!transition) {
          unchangedCount += 1;
          continue;
        }
        if (transition.detail.length > 1000) {
          throw new Error("The normalized audit record exceeded the cloud journal detail limit.");
        }
        const duplicate = await admin.from("cloud_sync_events").select("id")
          .eq("shop_sync_key", text(shop.id)).eq("entity", entity)
          .eq("action", transition.action).eq("device_id", deviceId)
          .eq("detail", transition.detail).limit(1).maybeSingle();
        if (duplicate.error) throw new Error("Could not check audit idempotency: " + duplicate.error.message);
        if (duplicate.data) {
          unchangedCount += 1;
          continue;
        }
        const saved = await recordShopAuditEvent(
          admin, text(shop.id), text(shop.shop_name), "ANDROID_DEVICE:" + deviceId,
          deviceId, entity, transition.action, transition.detail
        );
        if (!saved) {
          return json(503, { ok: false, message: "The record upload succeeded, but the shop audit journal is unavailable. Keep the sync pending and retry." });
        }
        auditedCount += 1;
      }
      return json(200, { ok: true, entity, auditedCount, unchangedCount });
    }

    if (action === "record_device_branch_tombstones") {
      const deviceId = text(req.headers.get("X-BeBoss-Device-ID")).trim();
      const deviceToken = text(req.headers.get("X-BeBoss-Device-Token")).trim();
      if (deviceId.length < 4 || deviceId.length > 120 || !/^[a-f0-9]{64}$/i.test(deviceToken)) {
        return json(401, { ok: false, message: "An enrolled Android device credential is required to submit branch deletion events." });
      }
      const deviceClient = createClient(config.url, config.publishableKey, {
        global: { headers: {
          "X-BeBoss-Device-ID": deviceId,
          "X-BeBoss-Device-Token": deviceToken
        } },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: shop, error: shopError } = await deviceClient.from("shop_accounts")
        .select("id,shop_name,remote_kill_switch").maybeSingle();
      if (shopError || !shop || shop.remote_kill_switch === true) {
        return json(401, { ok: false, message: "This device is not authenticated for an active BeBoss shop." });
      }
      const requested = Array.isArray(body.tombstones) ? body.tombstones as Row[] : [];
      if (requested.length < 1 || requested.length > 250) {
        return json(400, { ok: false, message: "Branch deletion batches must contain between 1 and 250 signed tombstones." });
      }
      const seen = new Set<string>();
      for (const item of requested) {
        const id = text(item.recordId).trim();
        if (text(item.tableName) !== "branches" || !id || id.length > 120 ||
            !Number.isFinite(number(item.deletedAt)) || number(item.deletedAt) <= 0 ||
            !Number.isFinite(number(item.hlcTimestamp)) || number(item.hlcTimestamp) <= 0 ||
            (text(item.deletedByDeviceId).trim() && text(item.deletedByDeviceId).trim() !== deviceId) ||
            seen.has(id)) {
          return json(400, { ok: false, message: "The branch deletion tombstone is malformed or duplicated." });
        }
        seen.add(id);
      }

      // Already journaled tombstones are acknowledged cheaply on later sync cycles.
      // Their exact deletion timestamp and HLC are included in the versioned audit detail.
      const { data: previousDeletionEvents, error: previousDeletionError } = await admin.from("cloud_sync_events")
        .select("detail").eq("shop_sync_key", text(shop.id)).eq("entity", "BRANCH")
        .eq("action", "DELETED").eq("device_id", deviceId).order("created_at", { ascending: false }).limit(1000);
      if (previousDeletionError) throw new Error("Could not read previous branch deletion audit events: " + previousDeletionError.message);
      const acknowledged = new Set<string>();
      for (const event of previousDeletionEvents ?? []) {
        try {
          const detail = JSON.parse(text(event.detail));
          if (detail?.version === 1 && text(detail.recordId) && detail.state) {
            acknowledged.add(text(detail.recordId) + ":" + number(detail.state.updatedAt) + ":" + number(detail.state.hlcTimestamp));
          }
        } catch { /* Older plain-text events are not deletion acknowledgements. */ }
      }
      const pendingTombstones = requested.filter((item) =>
        !acknowledged.has(text(item.recordId) + ":" + number(item.deletedAt) + ":" + number(item.hlcTimestamp))
      );
      if (!pendingTombstones.length) return json(200, { ok: true, auditedCount: 0, unchangedCount: requested.length });

      // Deletion is accepted only when the same pending tombstone is present in a complete,
      // HMAC-verified snapshot from this enrolled device. A client cannot fabricate
      // a standalone deletion request and remove another shop's branch.
      const verified = await latestVerifiedSnapshot(admin, text(shop.id), config.hmacSecret);
      if (!verified.snapshot || !verified.sourceDevices.some((source) => source.deviceId === deviceId)) {
        return json(409, { ok: false, message: "Upload a complete signed device snapshot before submitting branch deletion audit records." });
      }
      const signedTombstones = verified.snapshot.tombstones;
      let auditedCount = 0;
      let unchangedCount = 0;
      for (const tombstone of pendingTombstones) {
        const recordId = text(tombstone.recordId);
        const signed = signedTombstones.find((candidate) =>
          text(candidate.tableName) === "branches" &&
          text(candidate.recordId) === recordId &&
          number(candidate.deletedAt) === number(tombstone.deletedAt) &&
          number(candidate.hlcTimestamp) === number(tombstone.hlcTimestamp)
        );
        if (!signed) {
          return json(409, { ok: false, message: "The branch deletion was not found in this device's signed cloud snapshot. Retry synchronization before journaling it." });
        }

        const { data: branch, error: branchError } = await admin.from("shop_branches")
          .select("id,shop_sync_key,name,code,address,phone,email,manager_user_id,manager_name,is_active,is_main_branch,operational_status,product_count,stock_value_rwf,daily_sales_target_rwf,monthly_target_rwf,opening_cash_float,created_at,updated_at,hlc_timestamp,last_modified_device_id")
          .eq("shop_sync_key", text(shop.id)).eq("id", recordId).maybeSingle();
        if (branchError) throw new Error("Could not validate deleted branch " + recordId + ": " + branchError.message);
        if (branch?.is_main_branch === true || recordId === "main_branch") {
          return json(409, { ok: false, message: "The main shop branch cannot be deleted. Restore it and deactivate a secondary branch instead." });
        }
        if (branch?.is_active === true) {
          const unresolvedTransferStatuses = ["REQUESTED", "PENDING", "IN_TRANSIT", "RECEIPT_REQUESTED", "CANCEL_REQUESTED"];
          const [devices, staff, outgoingTransfers, incomingTransfers] = await Promise.all([
            admin.from("shop_devices").select("id", { count: "exact", head: true })
              .eq("shop_sync_key", text(shop.id)).eq("branch_id", recordId).eq("is_active", true),
            admin.from("shop_users").select("user_id", { count: "exact", head: true })
              .eq("shop_sync_key", text(shop.id)).eq("assigned_branch_id", recordId).eq("is_active", true),
            admin.from("shop_stock_transfers").select("id")
              .eq("shop_sync_key", text(shop.id)).eq("from_branch_id", recordId)
              .in("status", unresolvedTransferStatuses).limit(1),
            admin.from("shop_stock_transfers").select("id")
              .eq("shop_sync_key", text(shop.id)).eq("to_branch_id", recordId)
              .in("status", unresolvedTransferStatuses).limit(1)
          ]);
          if (devices.error || staff.error || outgoingTransfers.error || incomingTransfers.error) {
            throw new Error("Could not check branch staff, devices and stock-transfer dependencies before applying the branch deletion.");
          }
          if ((devices.count ?? 0) > 0 || (staff.count ?? 0) > 0) {
            return json(409, { ok: false, message: "Reassign active staff and devices before deleting this branch. The deletion remains queued for retry." });
          }
          if ((outgoingTransfers.data?.length ?? 0) > 0 || (incomingTransfers.data?.length ?? 0) > 0) {
            return json(409, { ok: false, message: "Complete or cancel unresolved stock transfers involving this branch before deleting it. The deletion remains queued for retry." });
          }
          if (number(branch.product_count) > 0 || number(branch.stock_value_rwf) > 0) {
            return json(409, { ok: false, message: "Move or archive this branch's remaining product inventory before deleting it. The deletion remains queued for retry." });
          }
          const { error: updateError } = await admin.from("shop_branches").update({
            is_active: false,
            operational_status: "CLOSED",
            updated_at: number(tombstone.deletedAt),
            hlc_timestamp: number(tombstone.hlcTimestamp),
            last_modified_device_id: deviceId
          }).eq("shop_sync_key", text(shop.id)).eq("id", recordId);
          if (updateError) throw new Error("Could not apply the signed branch deletion: " + updateError.message);
        }

        const state = buildShopAuditSnapshot("BRANCH", {
          ...(branch ?? { id: recordId, name: "Deleted branch", code: "" }),
          is_active: false,
          operational_status: "CLOSED",
          updated_at: number(tombstone.deletedAt),
          hlc_timestamp: number(tombstone.hlcTimestamp),
          last_modified_device_id: deviceId
        });
        const detail = JSON.stringify({
          version: 1,
          recordId,
          state,
          changes: ["branch deletion tombstone verified from a signed shop snapshot", "historical branch record retained as inactive"]
        });
        const duplicate = await admin.from("cloud_sync_events").select("id")
          .eq("shop_sync_key", text(shop.id)).eq("entity", "BRANCH")
          .eq("action", "DELETED").eq("device_id", deviceId).eq("detail", detail).limit(1).maybeSingle();
        if (duplicate.error) throw new Error("Could not check branch deletion audit idempotency: " + duplicate.error.message);
        if (duplicate.data) {
          unchangedCount += 1;
          continue;
        }
        const saved = await recordShopAuditEvent(
          admin, text(shop.id), text(shop.shop_name), "ANDROID_DEVICE:" + deviceId,
          deviceId, "BRANCH", "DELETED", detail
        );
        if (!saved) return json(503, { ok: false, message: "The signed branch deletion was applied, but its audit record could not be saved. Keep synchronization pending and retry." });
        auditedCount += 1;
      }
      return json(200, { ok: true, auditedCount, unchangedCount });
    }

    if (action === "verify_device_branch_share") {
      const deviceId = text(req.headers.get("X-BeBoss-Device-ID")).trim();
      const deviceToken = text(req.headers.get("X-BeBoss-Device-Token")).trim();
      if (deviceId.length < 4 || deviceId.length > 120 || !/^[a-f0-9]{64}$/i.test(deviceToken)) {
        return json(401, { ok: false, message: "A valid enrolled Android device credential is required." });
      }

      // PostgREST resolves this tenant only after the database validates the
      // per-device token digest, expiry, device assignment, active state and
      // shop kill switch through current_shop_sync_key().
      const deviceClient = createClient(config.url, config.publishableKey, {
        global: {
          headers: {
            "X-BeBoss-Device-ID": deviceId,
            "X-BeBoss-Device-Token": deviceToken
          }
        },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: shop, error: shopError } = await deviceClient
        .from("shop_accounts")
        .select("id,shop_name,owner_name,owner_username,owner_phone,remote_kill_switch")
        .maybeSingle();
      if (shopError || !shop || shop.remote_kill_switch === true) {
        return json(401, { ok: false, message: "This Android device is not authenticated for an active BeBoss shop." });
      }

      const token = text(body.token).trim();
      let shopSecret: string | undefined;
      const { data: shareSettings, error: shareSettingsError } = await admin
        .from("shop_accounts")
        .select("lan_sync_secret")
        .eq("id", text(shop.id))
        .maybeSingle();
      const storedShopSecret = text(shareSettings?.lan_sync_secret).trim().toLowerCase();
      if (!shareSettingsError && /^[a-f0-9]{64}$/.test(storedShopSecret)) {
        shopSecret = storedShopSecret;
      }

      const decoded = await verifyAndDecodeToken(token, config.hmacSecret, shopSecret);
      const metadata = decoded.metadata && typeof decoded.metadata === "object" ? decoded.metadata as Row : {};
      if (text(metadata.format) !== "beboss_branch_datashare_v3") {
        throw new Error("This is not a supported BeBoss branch data-share package.");
      }
      const issuedAt = number(metadata.issuedAt ?? metadata.timestamp);
      const expiresAt = number(metadata.expiresAt);
      const now = Date.now();
      if (!issuedAt || issuedAt > now + 5 * 60 * 1000 || !expiresAt || expiresAt <= now ||
          expiresAt - issuedAt > 30 * 24 * 60 * 60 * 1000) {
        throw new Error("The branch share package is expired or has an invalid issue time.");
      }
      const importedProfile = decoded.shopProfile && typeof decoded.shopProfile === "object" ? decoded.shopProfile as Row : {};
      if (text(importedProfile.shopName).trim().toLowerCase() !== text(shop.shop_name).trim().toLowerCase()) {
        throw new Error("The branch share package belongs to a different shop.");
      }
      for (const key of DATA_KEYS) {
        if (!Array.isArray(decoded[key]) || (decoded[key] as unknown[]).length > 25_000) {
          throw new Error("The " + key + " collection exceeds the Android DataShare record limit.");
        }
      }
      const sanitized = sanitizeSnapshot(decoded, { username: text(shop.owner_username), shop });
      sanitized.metadata = metadata;
      return json(200, {
        ok: true,
        snapshot: sanitized,
        scope: text(metadata.branchScopeName) || "All branches",
        legacyFormat: token.startsWith("BBSHARE1:") ||
          (token.startsWith("BBSHARE2:") && !shopSecret),
        expiresAt
      });
    }

    const owner = await requireOwner(
      req,
      admin,
      config.publishableKey,
      body,
      action === "bootstrap" || action === "register_desktop" || action === "restore_preview" ||
        action === "redeem_unlock_code" || action === "device_enroll" ||
        action === "device_retire_legacy" || action === "verify_branch_share"
    );

    if (action === "lan_pairing_credentials") {
      const installationId = text(body.deviceId).trim();
      if (!isUuid(installationId)) return json(403, { ok: false, message: "This desktop installation has no valid device identity." });
      const desktopId = "DESKTOP:" + installationId;
      const { data: ownerUser, error: ownerUserError } = await admin
        .from("shop_users")
        .select("user_id,username,role,is_active")
        .eq("shop_sync_key", owner.shopId)
        .eq("username", owner.username)
        .eq("role", "OWNER")
        .eq("is_active", true)
        .maybeSingle();
      const { data: device, error: deviceError } = await admin
        .from("shop_devices")
        .select("device_id,assigned_user_id,role,is_active,is_owner_primary,assigned_username")
        .eq("shop_sync_key", owner.shopId)
        .eq("device_id", desktopId)
        .eq("is_active", true)
        .maybeSingle();
      // Bind pairing to the precise active owner row in this tenant. Username-only
      // checks could otherwise outlive a deleted/re-created staff owner identity.
      if (ownerUserError || !ownerUser || deviceError || !device ||
          device.role !== "OWNER" || device.is_owner_primary === true ||
          text(device.assigned_user_id) !== text(ownerUser.user_id) ||
          text(device.assigned_username).trim().toLowerCase() !== text(ownerUser.username).trim().toLowerCase()) {
        return json(403, { ok: false, message: "This desktop must be an active, owner-assigned device before LAN pairing credentials can be issued." });
      }
      const { data: shopSecret, error: secretError } = await admin
        .from("shop_accounts")
        .select("lan_sync_secret")
        .eq("id", owner.shopId)
        .maybeSingle();
      const secret = text(shopSecret?.lan_sync_secret).trim().toLowerCase();
      if (secretError || !/^[a-f0-9]{64}$/.test(secret)) {
        return json(409, { ok: false, message: "The shop LAN pairing key is not provisioned. Complete a successful owner cloud sync on the primary Android terminal and retry." });
      }
      return json(200, { ok: true, shopSyncKey: owner.shopId, secret });
    }

    if (action === "restore_preview") {
      const installationId = text(body.deviceId).trim();
      if (!isUuid(installationId)) return json(403, { ok: false, message: "This desktop installation has no valid persistent device identity. Reopen BeBoss and try again." });
      const desktopDeviceId = "DESKTOP:" + installationId;
      const { data: ownerUser, error: ownerUserError } = await admin
        .from("shop_users")
        .select("user_id,username,role,is_active")
        .eq("shop_sync_key", owner.shopId)
        .eq("username", owner.username)
        .eq("role", "OWNER")
        .eq("is_active", true)
        .maybeSingle();
      const { data: enrolledDevice, error: enrollmentError } = await admin
        .from("shop_devices")
        .select("device_id,assigned_user_id,assigned_username,role,is_active,is_owner_primary")
        .eq("shop_sync_key", owner.shopId)
        .eq("device_id", desktopDeviceId)
        .maybeSingle();
      if (ownerUserError || !ownerUser || enrollmentError || !enrolledDevice ||
          enrolledDevice.is_active !== true || enrolledDevice.is_owner_primary === true ||
          enrolledDevice.role !== "OWNER" ||
          text(enrolledDevice.assigned_user_id) !== text(ownerUser.user_id) ||
          text(enrolledDevice.assigned_username).trim().toLowerCase() !== text(ownerUser.username).trim().toLowerCase()) {
        return json(403, {
          ok: false,
          message: "Register this desktop and confirm its recurring monthly device add-on before previewing or retrieving shop data."
        });
      }
      const [snapshotResult, devicesResult] = await Promise.all([
        latestVerifiedSnapshot(admin, owner.shopId, config.hmacSecret),
        admin.from("shop_devices")
          .select("device_id,device_name,last_synced_at,is_active,role,branch_name")
          .eq("shop_sync_key", owner.shopId)
          .eq("is_active", true)
          .order("last_synced_at", { ascending: false })
          .limit(500)
      ]);
      if (devicesResult.error) throw new Error("Could not read the shop's registered device list: " + devicesResult.error.message);
      const snapshot = snapshotResult.snapshot as Row | null;
      const collectionKeys = ["products", "customers", "sales", "saleItems", "customerPayments", "purchases", "stockTransfers", "branches", "users"] as const;
      const counts = Object.fromEntries(collectionKeys.map((key) => [key, Array.isArray(snapshot?.[key]) ? (snapshot![key] as unknown[]).length : 0]));
      const totalRecords = Object.values(counts).reduce((sum, count) => sum + number(count), 0);
      const deviceDirectory = new Map((devicesResult.data ?? []).map((device) => [text(device.device_id), device]));
      const sourceDevices = snapshotResult.sourceDevices.map((source) => {
        const device = deviceDirectory.get(source.deviceId);
        const platform = source.deviceId.startsWith("DESKTOP:") ? "DESKTOP"
          : source.deviceId ? "ANDROID" : "OTHER";
        return {
          deviceId: source.deviceId,
          name: text(device?.device_name) || (platform === "DESKTOP" ? "BeBoss Desktop" : "BeBoss mobile terminal"),
          platform,
          lastSyncedAt: Math.max(number(source.lastSyncedAt), number(device?.last_synced_at))
        };
      });
      return json(200, {
        ok: true,
        shopSyncKey: owner.shopId,
        restoreAvailable: !!snapshot && totalRecords > 0,
        snapshotUpdatedAt: snapshotResult.uploadedAt,
        verifiedChunks: snapshotResult.verifiedChunks,
        totalRecords,
        counts,
        sourceDevices
      });
    }

    if (action === "redeem_unlock_code") {
      const rateKey = await sha256Hex(owner.shopId + ":" + owner.user.id);
      const rateResponse = await admin.rpc("consume_rate_limit", {
        p_scope: "desktop_unlock",
        p_key_hash: rateKey,
        p_max_hits: 8,
        p_window_seconds: 900
      });
      const rate = Array.isArray(rateResponse.data) ? rateResponse.data[0] : rateResponse.data;
      if (rateResponse.error || typeof rate?.allowed !== "boolean") {
        return json(503, { ok: false, message: "Secure activation-code verification is temporarily unavailable." });
      }
      if (!rate.allowed) {
        return json(429, { ok: false, message: "Too many activation attempts. Wait 15 minutes and try again." });
      }
      const rawCode = text(body.code).trim();
      if (rawCode.length < 8 || rawCode.length > 512) {
        return json(400, { ok: false, message: "Enter a complete BeBoss activation code." });
      }
      const rawParts = rawCode.split("-");
      const format = String(rawParts[0] ?? "").toUpperCase();
      // Normalize BB3 metadata fields only; its Base64 ECDSA signature is case-sensitive.
      const code = format === "BB3"
        ? ["BB3", String(rawParts[1] ?? "").toUpperCase(), rawParts[2], String(rawParts[3] ?? "").toUpperCase(),
          String(rawParts[4] ?? "").toUpperCase(), String(rawParts[5] ?? "").toUpperCase(), rawParts[6]].join("-")
        : rawCode.toUpperCase();
      const parts = code.split("-");
      const isBb3 = format === "BB3" && parts.length === 7;
      const isBb2 = format === "BB2" && parts.length === 6;
      if (!isBb3 && !isBb2) {
        return json(400, { ok: false, message: "Desktop accepts server-issued BB3 or registered legacy BB2 codes. Android-only hardware vouchers cannot be transferred to another device." });
      }
      const { data: codeRow, error: codeError } = await admin.from("unlock_codes")
        .select("id,unlock_code,shop_username,shop_phone,tier_code,plan_days,status,plan_digest,amount_rwf,issued_at")
        .eq("unlock_code", code)
        .eq("shop_username", owner.username)
        .maybeSingle();
      if (codeError) throw new Error("Could not verify the activation code against the BeBoss registry.");
      if (!codeRow || normalizePhone(text(codeRow.shop_phone)) !== normalizePhone(owner.phone)) {
        return json(404, { ok: false, message: "This activation code was not issued for the signed-in shop owner." });
      }
      if (text(codeRow.status).toUpperCase() !== "ISSUED") {
        return json(409, { ok: false, message: "This activation code is already redeemed or revoked and cannot be used again." });
      }
      const tier = text(codeRow.tier_code).trim().toUpperCase();
      const days = number(codeRow.plan_days);
      const codeTier = text(parts[1]).toUpperCase();
      const codeDays = Number(parts[2]);
      const expiryText = text(parts[3]).toUpperCase();
      const expiryDay = /^[A-F0-9]{3,8}$/.test(expiryText) ? Number.parseInt(expiryText, 16) : Number.NaN;
      const accountHash = (await sha256Hex(owner.username.toLowerCase() + ":" + normalizePhone(owner.phone))).slice(0, 6).toUpperCase();
      const embeddedAccount = text(parts[4]).toUpperCase();
      if (!/^[A-Z]{2,12}$/.test(tier) || !Number.isInteger(days) || days < 1 || days > 800 ||
          codeTier !== tier || codeDays !== days || !Number.isFinite(expiryDay) ||
          Math.floor(Date.now() / 86_400_000) > expiryDay || embeddedAccount !== accountHash) {
        return json(403, { ok: false, message: "The activation code does not match the issued account, plan or expiry details." });
      }
      if (isBb3) {
        if (!/^[A-F0-9]{64}$/i.test(text(codeRow.plan_digest)) ||
            !(await verifyBb3CodeSignature(code, owner.username, owner.phone, text(codeRow.plan_digest)))) {
          return json(403, { ok: false, message: "The BB3 cryptographic signature or payment-plan binding could not be verified." });
        }
      } else {
        if (!/^[A-F0-9]{8}$/.test(text(parts[5]).toUpperCase())) {
          return json(403, { ok: false, message: "The legacy BB2 code format is invalid." });
        }
      }
      const now = Date.now();
      const { data: claimed, error: claimError } = await admin.from("unlock_codes")
        .update({ status: "REDEEMED", redeemed_at: now })
        .eq("id", codeRow.id).eq("status", "ISSUED")
        .select("id").maybeSingle();
      if (claimError) throw new Error("Could not securely reserve this activation code. Retry while online.");
      if (!claimed) {
        return json(409, { ok: false, message: "Another device redeemed this activation code first. It cannot be reused." });
      }
      const { error: paymentUpdateError } = await admin.from("payment_requests")
        .update({ status: "REDEEMED", updated_at: now })
        .eq("generated_unlock_code", code)
        .eq("owner_username", owner.username);
      if (paymentUpdateError) {
        console.error("[beboss-desktop] Activation code was claimed, but payment history status could not be updated.");
      }
      return json(200, {
        ok: true,
        redeemed: true,
        format: isBb3 ? "BB3" : "BB2",
        tier,
        days,
        amountRwf: number(codeRow.amount_rwf),
        redeemedAt: now,
        subscriptionExpiresAt: number(owner.shop.subscription_expires_at)
      });
    }

    if (action === "device_enroll") {
      const deviceId = text(body.deviceId).trim();
      const deviceName = text(body.deviceName).trim().slice(0, 120) || "Android terminal";
      if (deviceId.length < 4 || deviceId.length > 120 || /[\\r\\n]/.test(deviceId)) {
        throw new Error("This Android installation has an invalid device identifier.");
      }

      const deviceFields = "id,device_id,device_name,role,assigned_user_id,is_active,is_owner_primary";
      const { data: initialDeviceRecord, error: deviceLookupError } = await admin
        .from("shop_devices")
        .select(deviceFields)
        .eq("shop_sync_key", owner.shopId)
        .eq("device_id", deviceId)
        .eq("is_active", true)
        .maybeSingle();
      let deviceRecord = initialDeviceRecord;
      if (deviceLookupError) throw new Error("Could not validate this shop terminal.");

      if (!deviceRecord) {
        const { data: primary, error: primaryError } = await admin
          .from("shop_devices")
          .select(deviceFields)
          .eq("shop_sync_key", owner.shopId)
          .eq("is_owner_primary", true)
          .eq("is_active", true)
          .eq("device_id", "")
          .limit(1)
          .maybeSingle();
        if (primaryError) throw new Error("Could not validate the owner terminal registration.");

        if (primary) {
          const { data: updatedPrimary, error: updatePrimaryError } = await admin
            .from("shop_devices")
            .update({ device_id: deviceId, device_name: deviceName, updated_at: Date.now() })
            .eq("id", primary.id)
            .eq("shop_sync_key", owner.shopId)
            .eq("is_active", true)
            .select(deviceFields)
            .single();
          if (updatePrimaryError || !updatedPrimary) {
            throw new Error("Could not bind this installation to the existing owner terminal.");
          }
          deviceRecord = updatedPrimary;
        } else {
          const { count: activeCount, error: countError } = await admin
            .from("shop_devices")
            .select("id", { count: "exact", head: true })
            .eq("shop_sync_key", owner.shopId)
            .eq("is_active", true);
          if (countError) throw new Error("Could not confirm the shop's active device registry.");
          if ((activeCount ?? 0) > 0) {
            throw new Error("This terminal is not registered in the shop device list. The owner must add or invite it before it can receive credentials.");
          }

          const { data: ownerUsers, error: ownerUserError } = await admin
            .from("shop_users")
            .select("user_id,username,full_name")
            .eq("shop_sync_key", owner.shopId)
            .eq("role", "OWNER")
            .eq("is_active", true)
            .limit(1);
          if (ownerUserError) throw new Error("Could not validate the registered shop-owner profile.");
          const ownerUser = ownerUsers?.[0];
          const now = Date.now();
          const newDevice = {
            id: crypto.randomUUID(),
            shop_sync_key: owner.shopId,
            shop_name: text(owner.shop.shop_name),
            device_id: deviceId,
            device_name: deviceName,
            join_code: "",
            assigned_user_id: text(ownerUser?.user_id) || "OWNER",
            assigned_username: text(ownerUser?.username) || owner.username,
            assigned_user_name: text(ownerUser?.full_name) || text(owner.shop.owner_name) || "Shop Owner",
            role: "OWNER",
            branch_id: "main_branch",
            branch_name: "Main Store",
            is_owner_primary: true,
            is_active: true,
            monthly_fee_addon_rwf: 0,
            created_at: now,
            updated_at: now,
          };
          const { data: createdDevice, error: createDeviceError } = await admin
            .from("shop_devices")
            .insert(newDevice)
            .select(deviceFields)
            .single();
          if (createDeviceError || !createdDevice) {
            throw new Error("Could not register the first owner terminal. Check the shop device limit and retry.");
          }
          deviceRecord = createdDevice;
        }
      }

      if (!deviceRecord.is_active || !deviceRecord.id) {
        throw new Error("This terminal is inactive and cannot receive a sync credential.");
      }

      const accessToken = createDeviceToken();
      const refreshToken = createDeviceToken();
      const now = Date.now();
      const accessExpiresAt = now + DEVICE_ACCESS_TTL_MS;
      const refreshExpiresAt = now + DEVICE_REFRESH_TTL_MS;
      const { data: issued, error: issueError } = await admin.rpc("issue_android_device_credential", {
        p_shop_id: owner.shopId,
        p_device_id: deviceId,
        p_device_record_id: deviceRecord.id,
        p_access_token_hash: await sha256Hex(accessToken),
        p_refresh_token_hash: await sha256Hex(refreshToken),
        p_access_expires_at: accessExpiresAt,
        p_refresh_expires_at: refreshExpiresAt,
      });
      if (issueError || !issued?.issued) {
        throw new Error("The server could not provision an authenticated credential for this terminal.");
      }

      return json(200, {
        ok: true,
        deviceId,
        role: text(issued.role),
        accessToken,
        refreshToken,
        accessExpiresAt,
        refreshExpiresAt,
      });
    }

    if (action === "device_retire_legacy") {
      const { data: retired, error: retireError } = await admin.rpc("retire_legacy_android_sync", {
        p_shop_id: owner.shopId,
      });
      if (retireError) throw new Error("Could not safely retire the legacy shop sync credential.");
      if (retired !== true) {
        return json(409, {
          ok: false,
          message: "Legacy sync is still active because one or more active shop terminals do not have a valid device credential. Enroll every active terminal first; no existing device has been locked out.",
        });
      }
      return json(200, { ok: true, legacySyncDisabled: true });
    }

    if (action === "bootstrap" || action === "register_desktop") {
      const installationId = text(body.deviceId).trim();
      if (!isUuid(installationId)) {
        return json(403, { ok: false, message: "This desktop installation has no valid persistent device identity. Reopen the application and try again." });
      }
      // shop_users.user_id is the Android Room user UUID, not the Supabase Auth UUID.
      // requireOwner already verified this Auth UUID through shop_owner_memberships.
      const { data: ownerUser, error: ownerUserError } = await admin.from("shop_users")
        .select("user_id,username,full_name,role,is_active")
        .eq("shop_sync_key", owner.shopId).eq("username", owner.username)
        .eq("role", "OWNER").eq("is_active", true).maybeSingle();
      if (ownerUserError || !ownerUser) {
        return json(403, { ok: false, message: "This verified account is not an active owner in the shop staff directory." });
      }
      const desktopId = "DESKTOP:" + installationId;
      const { data: existingDevice, error: existingDeviceError } = await admin.from("shop_devices")
        .select("id,device_id,device_name,assigned_user_id,role,is_active,is_owner_primary,branch_id")
        .eq("shop_sync_key", owner.shopId).eq("device_id", desktopId).maybeSingle();
      if (existingDeviceError) throw new Error("Could not verify this desktop's shop device record.");
      if (existingDevice && (!existingDevice.is_active || existingDevice.is_owner_primary ||
          existingDevice.assigned_user_id !== ownerUser.user_id || existingDevice.role !== "OWNER")) {
        return json(403, { ok: false, message: "This desktop has been paused or removed from the shop device fleet. Verify the owner phone again from this installation to request re-registration." });
      }
      const authTime = validatedJwtAuthTimeSeconds(req);
      if (!existingDevice && (!authTime || Date.now() / 1000 - authTime > 15 * 60 || authTime > Date.now() / 1000 + 60)) {
        return json(403, { ok: false, message: "A fresh owner SMS verification is required to register this new desktop installation." });
      }
      if (!existingDevice && body.confirmDeviceFee !== true) {
        return json(402, {
          ok: false,
          requiresDeviceFeeConfirmation: true,
          monthlyAddonRwf: EXTRA_DEVICE_MONTHLY_FEE_RWF,
          message: `This new desktop adds FRw ${EXTRA_DEVICE_MONTHLY_FEE_RWF.toLocaleString("en-US")} per month to the shop subscription. Confirm to register this device.`
        });
      }
      const { data: mainBranch, error: mainBranchError } = await admin.from("shop_branches")
        .select("id,name").eq("shop_sync_key", owner.shopId).eq("is_active", true)
        .eq("is_main_branch", true).maybeSingle();
      if (mainBranchError) throw new Error("Could not load the shop's main branch.");
      let registrationBranch = mainBranch;
      if (!registrationBranch && existingDevice?.branch_id) {
        const currentBranch = await admin.from("shop_branches").select("id,name")
          .eq("shop_sync_key", owner.shopId).eq("id", existingDevice.branch_id).eq("is_active", true).maybeSingle();
        if (currentBranch.error) throw new Error("Could not verify this desktop's assigned branch.");
        registrationBranch = currentBranch.data;
      }
      if (!registrationBranch) {
        const fallbackBranch = await admin.from("shop_branches").select("id,name")
          .eq("shop_sync_key", owner.shopId).eq("is_active", true)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (fallbackBranch.error) throw new Error("Could not find an active shop branch for this desktop.");
        registrationBranch = fallbackBranch.data;
      }
      if (!registrationBranch) {
        return json(409, { ok: false, message: "Create or synchronize the shop's first active branch on the owner terminal before registering this desktop." });
      }
      const now = Date.now();
      const deviceName = text(body.deviceName).trim().slice(0, 120) || "BeBoss Desktop";
      let registeredDesktop: Row;
      if (existingDevice) {
        const { data, error } = await admin.from("shop_devices").update({
          last_synced_at: now,
          updated_at: now,
          ...(!existingDevice.branch_id ? { branch_id: registrationBranch.id, branch_name: registrationBranch.name } : {})
        }).eq("id", existingDevice.id).eq("shop_sync_key", owner.shopId)
          .select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_username,assigned_user_name,last_synced_at,created_at,updated_at,monthly_fee_addon_rwf").single();
        if (error || !data) throw new Error("Could not refresh this desktop's registered device record.");
        registeredDesktop = data;
      } else {
        const { data, error } = await admin.from("shop_devices").insert({
          id: crypto.randomUUID(), shop_sync_key: owner.shopId, shop_name: text(owner.shop.shop_name),
          device_id: desktopId, device_name: deviceName, join_code: "",
          assigned_user_id: ownerUser.user_id, assigned_username: ownerUser.username,
          assigned_user_name: ownerUser.full_name, role: "OWNER",
          branch_id: registrationBranch.id, branch_name: registrationBranch.name,
          is_owner_primary: false, is_active: true, monthly_fee_addon_rwf: EXTRA_DEVICE_MONTHLY_FEE_RWF,
          last_synced_at: now, created_at: now, updated_at: now
        }).select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_username,assigned_user_name,last_synced_at,created_at,updated_at,monthly_fee_addon_rwf").single();
        if (error || !data) throw new Error("Could not register this desktop as an additional billable device: " + (error?.message || "No row returned."));
        registeredDesktop = data;
      }
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);

      // Registration is a separate server-confirmed step so a new desktop is
      // never shown a cloud restore prompt before the owner accepts its recurring
      // monthly device fee. This response deliberately contains no business data.
      if (action === "register_desktop") {
        return json(200, {
          ok: true,
          registered: true,
          shop: { ...owner.shop, ...shopUsage },
          desktopDevice: registeredDesktop,
          monthlyAddonRwf: number(registeredDesktop.monthly_fee_addon_rwf),
          registeredAt: now,
          restoreRequired: true
        });
      }

      const [snapshotResult, paymentsResult, codesResult, devicesResult, branchesResult, transfersResult, staffResult, newsResult, activityResult] = await Promise.all([
        latestVerifiedSnapshot(admin, owner.shopId, config.hmacSecret),
        admin.from("payment_requests").select("id,provider,amount_rwf,duration_months,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,rejection_reason,created_at,updated_at,gateway_provider,gateway_reference,gateway_verified_at").eq("owner_username", owner.username).order("created_at", { ascending: false }).limit(100),
        admin.from("unlock_codes").select("unlock_code,tier_code,plan_days,status,issued_at,redeemed_at").eq("shop_username", owner.username).order("issued_at", { ascending: false }).limit(100),
        admin.from("shop_devices").select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_user_name,last_synced_at,created_at,monthly_fee_addon_rwf").eq("shop_sync_key", owner.shopId).order("updated_at", { ascending: false }).limit(500),
        admin.from("shop_branches").select("*").eq("shop_sync_key", owner.shopId).order("is_main_branch", { ascending: false }).limit(500),
        admin.from("shop_stock_transfers").select("*").eq("shop_sync_key", owner.shopId).order("updated_at", { ascending: false }).limit(1000),
        admin.from("shop_users").select("user_id,full_name,username,phone,role,assigned_branch_id,assigned_branch_name,is_active,updated_at").eq("shop_sync_key", owner.shopId).order("full_name", { ascending: true }).limit(1000),
        admin.from("announcements").select("id,title,body,severity,audience,target_shop_key,cta_label,cta_url,starts_at,ends_at,is_active,translations").in("audience", ["ALL","APP"]).eq("is_active", true).or(`target_shop_key.eq.${owner.shopId},target_shop_key.eq.`).order("starts_at", { ascending: false }).limit(30),
        admin.from("cloud_sync_events").select("id,entity,action,actor,device_id,detail,created_at").eq("shop_sync_key", owner.shopId).order("created_at", { ascending: false }).limit(300)
      ]);
      for (const result of [paymentsResult, codesResult, devicesResult, branchesResult, transfersResult, staffResult, newsResult, activityResult]) {
        if (result.error) throw new Error("Could not load a BeBoss management record: " + result.error.message);
      }
      return json(200, {
        ok: true,
        shop: { ...owner.shop, ...shopUsage },
        desktopDevice: registeredDesktop,
        owner: { id: owner.user.id, phone: owner.user.phone, username: owner.username },
        snapshot: snapshotResult.snapshot,
        snapshotUpdatedAt: snapshotResult.uploadedAt,
        verifiedChunks: snapshotResult.verifiedChunks,
        payments: paymentsResult.data ?? [],
        codes: codesResult.data ?? [],
        devices: devicesResult.data ?? [],
        branches: branchesResult.data ?? [],
        transfers: transfersResult.data ?? [],
        staff: staffResult.data ?? [],
        announcements: newsResult.data ?? [],
        activity: activityResult.data ?? [],
        serverTime: Date.now()
      });
    }

    if (action === "management_refresh") {
      const records = await loadManagementRecordsV2(admin, owner.shopId, owner.username);
      return json(200, { ok: true, ...records });
    }

    if (action === "management_probe") {
      // A small authenticated version probe keeps multiple desktop/mobile terminals
      // responsive without repeatedly downloading the full shop snapshot.
      const [shop, devices, branches, transfers, staff, snapshots] = await Promise.all([
        admin.from("shop_accounts").select("updated_at").eq("id", owner.shopId).maybeSingle(),
        admin.from("shop_devices").select("updated_at").eq("shop_sync_key", owner.shopId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("shop_branches").select("updated_at").eq("shop_sync_key", owner.shopId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("shop_stock_transfers").select("updated_at").eq("shop_sync_key", owner.shopId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("shop_users").select("updated_at").eq("shop_sync_key", owner.shopId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("branch_sync_snapshots").select("updated_at").eq("shop_sync_key", owner.shopId).order("updated_at", { ascending: false }).limit(1).maybeSingle()
      ]);
      for (const result of [shop, devices, branches, transfers, staff, snapshots]) {
        if (result.error) throw new Error("Could not check the latest shop sync version: " + result.error.message);
      }
      const versionParts = [
        number(shop.data?.updated_at),
        number(devices.data?.updated_at),
        number(branches.data?.updated_at),
        number(transfers.data?.updated_at),
        number(staff.data?.updated_at)
      ];
      return json(200, {
        ok: true,
        managementVersion: versionParts.join(":"),
        latestSnapshotUpdatedAt: number(snapshots.data?.updated_at),
        serverTime: Date.now()
      });
    }

    if (action === "save_snapshot") {
      const installationId = text(body.deviceId).trim();
      if (!isUuid(installationId)) throw new Error("The desktop installation identifier is invalid.");
      const actor = await ownerManagementActorV2(admin, owner.shopId, "DESKTOP:" + installationId, owner.username);
      const snapshot = sanitizeSnapshot(body.snapshot, { username: owner.username, shop: owner.shop });
      nowSnapshot(snapshot, owner.username);
      const shopShareSecret = await getShopDataShareSecret(admin, owner.shopId);
      const encoded = await encodeToken(snapshot, shopShareSecret);
      const mainBranch = snapshot.branches.find((branch) => branch.isMainBranch === true) ?? snapshot.branches[0] ?? {};
      const deviceId = installationId;
      const summary = snapshot.branches.length + " branches • " + snapshot.products.length + " products • " +
        snapshot.sales.length + " sales • " + snapshot.customers.length + " customers";
      const { data: savedAt, error } = await admin.rpc("write_beboss_desktop_snapshot", {
        p_shop_sync_key: owner.shopId,
        p_device_id: "DESKTOP:" + deviceId,
        p_sync_generation: crypto.randomUUID(),
        p_branch_id: text(mainBranch.id) || "main_branch",
        p_branch_name: text(mainBranch.name) || "Main Store",
        p_shop_name: text(snapshot.shopProfile.shopName) || text(owner.shop.shop_name),
        p_owner_username: owner.username,
        p_payload_token: encoded,
        p_records_summary: summary,
        p_expected_updated_at: Math.max(0, Math.floor(number(body.expectedUpdatedAt)))
      });
      if (error) throw new Error("The cloud rejected the desktop snapshot write: " + error.message);
      if (!savedAt) return json(409, {
        ok: false,
        conflict: true,
        message: "A phone or another desktop saved newer shop data. Refresh the cloud snapshot before saving again."
      });
      return json(200, { ok: true, uploadedAt: number(savedAt), snapshot: { ...snapshot, metadata: { ...snapshot.metadata } } });
    }

if (action === "create_branch_share") {
      const snapshot = sanitizeSnapshot(body.snapshot, { username: owner.username, shop: owner.shop });
      const requestedBranchId = text(body.branchIdFilter).trim();
      let scopedBranch: Row | null = null;
      if (requestedBranchId && requestedBranchId !== "ALL") {
        scopedBranch = snapshot.branches.find((branch) => text(branch.id) === requestedBranchId) ?? null;
        if (!scopedBranch) throw new Error("The selected branch does not belong to this shop snapshot.");
        const allowedSales = new Set(snapshot.sales
          .filter((row) => text(row.branchId) === requestedBranchId)
          .map((row) => text(row.id)));
        snapshot.branches = snapshot.branches.filter((row) => text(row.id) === requestedBranchId);
        snapshot.products = snapshot.products.filter((row) => !text(row.branchId) || text(row.branchId) === requestedBranchId);
        snapshot.sales = snapshot.sales.filter((row) => text(row.branchId) === requestedBranchId);
        snapshot.saleItems = snapshot.saleItems.filter((row) => allowedSales.has(text(row.saleId)));
        snapshot.customerPayments = snapshot.customerPayments.filter((row) => text(row.branchId) === requestedBranchId);
        snapshot.purchases = snapshot.purchases.filter((row) => text(row.branchId) === requestedBranchId);
        snapshot.stockTransfers = snapshot.stockTransfers.filter((row) =>
          text(row.fromBranchId) === requestedBranchId || text(row.toBranchId) === requestedBranchId);
      }
      nowSnapshot(snapshot, owner.username);
      if (scopedBranch) {
        snapshot.metadata.branchScopeId = text(scopedBranch.id);
        snapshot.metadata.branchScopeName = text(scopedBranch.name);
      }
      for (const key of DATA_KEYS) {
        if (snapshot[key].length > 25_000) {
          throw new Error("The " + key + " collection exceeds the 25,000-record Android DataShare limit. Export one branch or a smaller data scope.");
        }
      }
      const raw = new TextEncoder().encode(JSON.stringify(snapshot));
      if (raw.length > 5 * 1024 * 1024) {
        throw new Error("The branch share package exceeds the 5 MB safe uncompressed limit. Export fewer records or a single branch.");
      }
      const compressed = await streamToBytes(
        new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
        3 * 1024 * 1024
      );
      const payload = bytesToBase64(compressed);
      const shopShareSecret = await getShopDataShareSecret(admin, owner.shopId);
      const signature = await shopShareHmacHex(payload, shopShareSecret);
      const token = "BBSHARE2:" + signature + ":" + payload;
      if (token.length > 4 * 1024 * 1024) {
        throw new Error("The signed token exceeds the 4 MB Android DataShare limit. Export one branch or fewer records.");
      }
      return json(200, {
        ok: true,
        token,
        tokenLength: token.length,
        expiresAt: number(snapshot.metadata.expiresAt),
        scope: scopedBranch ? text(scopedBranch.name) : "All branches",
        counts: {
          branches: snapshot.branches.length,
          users: snapshot.users.length,
          products: snapshot.products.length,
          customers: snapshot.customers.length,
          sales: snapshot.sales.length,
          saleItems: snapshot.saleItems.length,
          customerPayments: snapshot.customerPayments.length,
          purchases: snapshot.purchases.length,
          stockTransfers: snapshot.stockTransfers.length
        }
      });
    }

    if (action === "verify_branch_share") {
      const token = text(body.token).trim();
      // Existing shops may not yet have provisioned the newer shop-scoped key.
      // Legacy BBSHARE1 and old globally signed BBSHARE2 remain verifiable with
      // the server-only compatibility key; never require or return that key on
      // the client. When a shop key exists, it is tried first for current BBSHARE2.
      const { data: shareSettings, error: shareSettingsError } = await admin
        .from("shop_accounts")
        .select("lan_sync_secret")
        .eq("id", owner.shopId)
        .maybeSingle();
      if (shareSettingsError) throw new Error("Could not load the shop's protected DataShare settings.");
      const candidateShopSecret = text(shareSettings?.lan_sync_secret).trim().toLowerCase();
      const shopShareSecret = /^[a-f0-9]{64}$/.test(candidateShopSecret) ? candidateShopSecret : undefined;
      const decoded = await verifyAndDecodeToken(token, config.hmacSecret, shopShareSecret);
      const metadata = decoded.metadata && typeof decoded.metadata === "object" ? decoded.metadata as Row : {};
      if (text(metadata.format) !== "beboss_branch_datashare_v3") {
        throw new Error("This is not a supported BeBoss branch data-share package.");
      }
      const issuedAt = number(metadata.issuedAt ?? metadata.timestamp);
      const expiresAt = number(metadata.expiresAt);
      const now = Date.now();
      if (!issuedAt || issuedAt > now + 5 * 60 * 1000 || !expiresAt || expiresAt <= now || expiresAt - issuedAt > 30 * 24 * 60 * 60 * 1000) {
        throw new Error("The branch share package is expired or has an invalid issue time.");
      }
      const importedProfile = decoded.shopProfile && typeof decoded.shopProfile === "object" ? decoded.shopProfile as Row : {};
      const incomingName = text(importedProfile.shopName).trim().toLowerCase();
      const registeredName = text(owner.shop.shop_name).trim().toLowerCase();
      if (!incomingName || incomingName !== registeredName) {
        throw new Error("The branch share package belongs to a different shop. Only packages from this registered shop can be merged.");
      }
      // shopProfile.phone is the shop's editable public contact and may differ
      // from the registered owner phone verified by OTP. HMAC and registered shop
      // identity checks are authoritative; do not reject legitimate renamed contacts.
      for (const key of DATA_KEYS) {
        if (!Array.isArray(decoded[key]) || (decoded[key] as unknown[]).length > 25_000) {
          throw new Error("The " + key + " collection exceeds the Android DataShare record limit.");
        }
      }
      const sanitized = sanitizeSnapshot(decoded, { username: owner.username, shop: owner.shop });
      sanitized.metadata = metadata;
      return json(200, {
        ok: true,
        snapshot: sanitized,
        scope: text(metadata.branchScopeName) || "All branches",
        counts: {
          branches: sanitized.branches.length,
          products: sanitized.products.length,
          customers: sanitized.customers.length,
          sales: sanitized.sales.length,
          stockTransfers: sanitized.stockTransfers.length
        },
        expiresAt
      });
    }

    if (action === "create_checkout") {
      const gateway = text(body.gateway).toLowerCase();
      if (!["flutterwave", "stripe"].includes(gateway)) throw new Error("Choose Flutterwave or Stripe for hosted checkout.");
      const payerPhone = ownerPhoneE164(text(body.payerPhone));
      const payerName = text(body.payerName).trim();
      const payerEmail = text(body.payerEmail).trim().toLowerCase();
      const months = number(body.months);
      if (payerName.length < 2 || payerName.length > 120 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail) || payerEmail.length > 254 ||
          ![1, 3, 6, 12].includes(months)) {
        throw new Error("Enter valid payer details and choose a supported billing cycle.");
      }
      const authorization = req.headers.get("Authorization") ?? "";
      if (!authorization.startsWith("Bearer ")) throw new Error("The verified owner session is missing.");
      const checkoutResponse = await fetch(config.url.replace(/\/+$/, "") + "/functions/v1/create-payment-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.publishableKey,
          Authorization: authorization
        },
        body: JSON.stringify({
          gateway,
          shopName: text(owner.shop.shop_name),
          username: owner.username,
          phone: text(owner.shop.owner_phone),
          payerPhone,
          payerName,
          payerEmail,
          months,
          branches: Math.max(1, number(owner.shop.branch_count)),
          workers: Math.max(1, number(owner.shop.worker_count)),
          devices: Math.max(1, number(owner.shop.device_count))
        })
      });
      const checkout = await checkoutResponse.json().catch(() => ({}));
      if (checkout?.pending === true) {
        return json(200, {
          ok: true,
          pending: true,
          paymentRequestId: text(checkout.paymentRequestId),
          reference: text(checkout.reference),
          message: text(checkout.message) || "The gateway response is being reconciled. Check the payment queue before creating another payment."
        });
      }
      if (!checkoutResponse.ok || checkout?.ok !== true || typeof checkout?.checkoutUrl !== "string") {
        throw new Error(text(checkout?.message) || "The hosted payment provider could not create a checkout.");
      }
      const checkoutUrl = new URL(checkout.checkoutUrl);
      if (checkoutUrl.protocol !== "https:" ||
          !["checkout.flutterwave.com", "checkout.stripe.com"].includes(checkoutUrl.hostname)) {
        throw new Error("The payment provider returned an untrusted checkout destination.");
      }
      return json(200, {
        ok: true,
        paymentRequestId: text(checkout.paymentRequestId),
        provider: text(checkout.provider),
        reference: text(checkout.reference),
        amountRwf: number(checkout.amountRwf),
        currency: "RWF",
        checkoutUrl: checkoutUrl.toString()
      });
    }

if (action === "submit_payment_proof") {
      const requestId = text(body.requestId).trim();
      const provider = text(body.provider).trim();
      const payerPhone = ownerPhoneE164(text(body.payerPhone));
      const payerName = text(body.payerName).trim();
      const paymentNote = text(body.paymentNote).trim();
      const months = number(body.months);
      if (!/^DESKTOP-[0-9a-f-]{36}$/i.test(requestId)) throw new Error("A valid desktop payment request ID is required.");
      if (!["MTN MoMo", "Airtel Money"].includes(provider)) throw new Error("Choose MTN MoMo or Airtel Money.");
      if (payerName.length < 2 || payerName.length > 120 || paymentNote.length > 1000 ||
          ![1, 3, 6, 12].includes(months)) {
        throw new Error("Enter valid payer details and a supported subscription duration.");
      }

      const { data: configRow, error: configError } = await admin
        .from("app_config")
        .select("mtn_momo_code,mtn_momo_phone,mtn_recipient_name,airtel_money_phone,airtel_recipient_name,admin_whatsapp_number,per_device_fee_rwf")
        .eq("id", "global")
        .maybeSingle();
      if (configError || !configRow) throw new Error("BeBoss payment instructions are unavailable. Contact support.");

      const existingQuery = await admin.from("payment_requests")
        .select("id,provider,payer_phone,payer_full_name,amount_rwf,duration_months,ussd_code,status,created_at")
        .eq("id", requestId)
        .eq("owner_username", owner.username)
        .maybeSingle();
      if (existingQuery.error) throw new Error("Could not check the payment request idempotency record.");
      if (existingQuery.data) {
        const existing = existingQuery.data;
        if (text(existing.provider) !== provider ||
            text(existing.payer_phone) !== payerPhone ||
            text(existing.payer_full_name) !== payerName ||
            number(existing.duration_months) !== months) {
          throw new Error("This payment request ID has already been used for different payment details.");
        }
        const recipientName = provider === "MTN MoMo"
          ? text(configRow.mtn_recipient_name)
          : text(configRow.airtel_recipient_name);
        return json(200, {
          ok: true,
          paymentRequestId: text(existing.id),
          amountRwf: number(existing.amount_rwf),
          ussdCode: text(existing.ussd_code),
          provider,
          recipientName,
          supportWhatsapp: text(configRow.admin_whatsapp_number),
          status: text(existing.status),
          reused: true
        });
      }

      const branches = Math.max(1, number(owner.shop.branch_count));
      const workers = Math.max(1, number(owner.shop.worker_count));
      const devices = Math.max(1, number(owner.shop.device_count));
      const configuredDeviceFee = number(configRow.per_device_fee_rwf);
      const feePerDevice = configuredDeviceFee === 0 ? 2000 : configuredDeviceFee;
      if (!Number.isSafeInteger(feePerDevice) || feePerDevice < 0) {
        throw new Error("The registered subscription price configuration is invalid. Contact BeBoss support.");
      }
      const branchFee = branches <= 1 ? 5000 : branches === 2 ? 10000 : 20000;
      const workerFee = workers <= 1 ? 0 : workers <= 3 ? 2000 : workers <= 5 ? 4000 : 4000 + (workers - 5) * 1000;
      const extraDeviceFee = Math.max(0, devices - 1) * feePerDevice;
      const gross = (branchFee + workerFee + extraDeviceFee) * months;
      const discount = months === 12 ? 20 : months === 3 ? 10 : 0;
      const expectedAmount = gross - Math.floor(gross * discount / 100);
      if (!Number.isSafeInteger(expectedAmount) || expectedAmount < 1) {
        throw new Error("The registered subscription price could not be calculated.");
      }

      let ussdCode = "";
      let recipientName = "";
      if (provider === "MTN MoMo") {
        const merchantCode = text(configRow.mtn_momo_code).trim();
        const merchantPhone = text(configRow.mtn_momo_phone).trim();
        if (merchantCode && merchantCode !== "0") ussdCode = `*182*8*1*${merchantCode}*${expectedAmount}#`;
        else if (merchantPhone) ussdCode = `*182*1*1*${merchantPhone}*${expectedAmount}#`;
        recipientName = text(configRow.mtn_recipient_name);
      } else {
        const merchantPhone = text(configRow.airtel_money_phone).trim();
        if (merchantPhone) ussdCode = `*500*1*1*${merchantPhone}*${expectedAmount}#`;
        recipientName = text(configRow.airtel_recipient_name);
      }
      if (!ussdCode) throw new Error("This Mobile Money merchant is not configured. Contact BeBoss support or use hosted checkout.");

      const requestLimit = await admin.rpc("consume_rate_limit", {
        p_scope: "desktop_payment_claim",
        p_key_hash: await sha256Hex("desktop-payment-claim:" + owner.shopId),
        p_max_hits: 5,
        p_window_seconds: 900
      });
      if (requestLimit.error) throw new Error("Payment claim protection is unavailable. Try again later.");
      const limitRows = requestLimit.data;
      const limit = Array.isArray(limitRows) ? limitRows[0] : limitRows;
      if (limit?.allowed !== true) {
        const retrySeconds = Math.max(1, number(limit?.retry_after_seconds) || 900);
        return json(429, { ok: false, message: "Too many payment claims were created for this shop. Try again later.", retryAfterSeconds: retrySeconds });
      }

      const now = Date.now();
      const paymentPayload = {
        id: requestId,
        shop_name: text(owner.shop.shop_name),
        owner_username: owner.username,
        owner_phone: text(owner.shop.owner_phone),
        device_challenge: text(owner.shop.device_challenge),
        provider,
        ussd_code: ussdCode,
        payer_phone: payerPhone,
        payer_full_name: payerName,
        amount_rwf: expectedAmount,
        duration_months: months,
        branch_count: branches,
        worker_count: workers,
        device_count: devices,
        fee_per_device_rwf: feePerDevice,
        payment_time_ms: now,
        payment_note: paymentNote,
        status: "PENDING_VERIFICATION",
        approval_mode: "",
        generated_unlock_code: "",
        source: "DESKTOP",
        created_at: now,
        updated_at: now
      };
      const { data: inserted, error: insertError } = await admin
        .from("payment_requests")
        .insert(paymentPayload)
        .select("id,provider,payer_phone,payer_full_name,amount_rwf,duration_months,ussd_code,status,created_at")
        .single();
      if (insertError || !inserted) {
        const raced = await admin.from("payment_requests")
          .select("id,provider,payer_phone,payer_full_name,amount_rwf,duration_months,ussd_code,status,created_at")
          .eq("id", requestId)
          .eq("owner_username", owner.username)
          .maybeSingle();
        if (raced.error || !raced.data ||
            text(raced.data.provider) !== provider ||
            text(raced.data.payer_phone) !== payerPhone ||
            text(raced.data.payer_full_name) !== payerName ||
            number(raced.data.duration_months) !== months) {
          throw new Error("Could not create the payment verification request.");
        }
        return json(200, {
          ok: true,
          paymentRequestId: text(raced.data.id),
          amountRwf: number(raced.data.amount_rwf),
          ussdCode: text(raced.data.ussd_code),
          provider,
          recipientName,
          supportWhatsapp: text(configRow.admin_whatsapp_number),
          status: text(raced.data.status),
          reused: true
        });
      }

      return json(200, {
        ok: true,
        paymentRequestId: text(inserted.id),
        amountRwf: number(inserted.amount_rwf),
        ussdCode: text(inserted.ussd_code),
        provider,
        recipientName,
        supportWhatsapp: text(configRow.admin_whatsapp_number),
        status: text(inserted.status),
        reused: false
      });
    }

    if (action === "approval_policy_save") {
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const transferThreshold = Number(body.transferApprovalThresholdRwf);
      const varianceThreshold = Number(body.reconciliationVarianceThresholdRwf);
      if (!Number.isFinite(transferThreshold) || !Number.isFinite(varianceThreshold) ||
          transferThreshold < 0 || varianceThreshold < 0 ||
          transferThreshold > 10000000000 || varianceThreshold > 10000000000) {
        throw new Error("Approval thresholds must be valid non-negative amounts up to FRw 10,000,000,000. Use 0 to disable a threshold.");
      }
      const policy = { version: 1, transferApprovalThresholdRwf: Math.round(transferThreshold),
        reconciliationVarianceThresholdRwf: Math.round(varianceThreshold), updatedAt: Date.now() };
      const auditLogged = await recordShopAuditEvent(
        admin, owner.shopId, text(owner.shop.shop_name), "OWNER:" + owner.username,
        actor.actorDeviceId, "APPROVAL_POLICY", "UPDATED", JSON.stringify(policy)
      );
      if (!auditLogged) throw new Error("The approval policy was not saved because its audit record could not be written. Refresh and retry.");
      return json(200, { ok: true, policy });
    }

    if (action === "finance_ledger_post") {
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const entryId = text(body.entryId).trim();
      const type = text(body.type).trim().toUpperCase();
      const amountRwf = Number(body.amountRwf);
      const allowedTypes = [
        "OPERATING_EXPENSE", "PAYROLL_PAYMENT", "SUPPLIER_SETTLEMENT",
        "TAX_PAYMENT", "OWNER_DRAW", "CASH_WITHDRAWAL",
        "CAPITAL_CONTRIBUTION", "BANK_DEPOSIT"
      ];
      const allowedAccounts = ["CASH", "BANK", "MOBILE_MONEY", "OTHER"];
      if (!isUuid(entryId) || !allowedTypes.includes(type) ||
          !Number.isSafeInteger(amountRwf) || amountRwf <= 0 || amountRwf > 10000000000) {
        throw new Error("Provide a unique entry ID, supported financial category and positive whole-RWF amount up to FRw 10,000,000,000.");
      }
      const effectiveAt = Number(body.effectiveAt);
      if (!Number.isFinite(effectiveAt) || effectiveAt < Date.UTC(2000, 0, 1) || effectiveAt > Date.now() + 5 * 60 * 1000) {
        throw new Error("Choose a valid transaction date no later than the current date.");
      }
      const branchId = text(body.branchId).trim();
      let branchName = "All branches";
      if (branchId) {
        const { data: branch, error: branchError } = await admin.from("shop_branches")
          .select("id,name,is_active").eq("shop_sync_key", owner.shopId).eq("id", branchId).maybeSingle();
        if (branchError || !branch || branch.is_active !== true) {
          throw new Error("Choose an active branch belonging to this shop, or use All branches.");
        }
        branchName = text(branch.name);
      }
      const sourceAccount = text(body.sourceAccount).trim().toUpperCase();
      const destinationAccount = text(body.destinationAccount).trim().toUpperCase();
      const account = text(body.account).trim().toUpperCase();
      let flow: "OUTFLOW" | "INFLOW" | "TRANSFER" = "OUTFLOW";
      if (type === "CAPITAL_CONTRIBUTION") flow = "INFLOW";
      if (type === "BANK_DEPOSIT") {
        if (!allowedAccounts.includes(sourceAccount) || destinationAccount !== "BANK" || sourceAccount === "BANK") {
          throw new Error("A bank deposit must move funds from Cash, Mobile Money or Other into the Bank account.");
        }
        flow = "TRANSFER";
      } else if (!allowedAccounts.includes(account)) {
        throw new Error("Choose a valid source account: Cash, Bank, Mobile Money or Other.");
      }
      const counterparty = text(body.counterparty).trim().slice(0, 100);
      const reference = text(body.reference).trim().slice(0, 48);
      const note = text(body.note).trim().slice(0, 240);
      const entry = {
        version: 1, entryId, type, flow, amountRwf: Math.round(amountRwf),
        account: flow === "TRANSFER" ? "" : account,
        sourceAccount: flow === "TRANSFER" ? sourceAccount : "",
        destinationAccount: flow === "TRANSFER" ? destinationAccount : "",
        branchId, branchName, effectiveAt: Math.floor(effectiveAt),
        counterparty, reference, note, postedAt: Date.now(),
        actorUsername: owner.username, actorDeviceId: actor.actorDeviceId
      };
      const existingRows = await admin.from("cloud_sync_events").select("detail")
        .eq("shop_sync_key", owner.shopId).eq("entity", "FINANCE_LEDGER")
        .eq("action", "POSTED").like("detail", '%"entryId":"' + entryId + '"%')
        .limit(1).maybeSingle();
      if (existingRows.error) throw new Error("Could not check the financial journal before posting.");
      if (existingRows.data?.detail) {
        try {
          const prior = JSON.parse(text(existingRows.data.detail));
          if (prior?.version === 1 && text(prior.entryId) === entryId) {
            return json(200, { ok: true, entry: prior, reused: true });
          }
        } catch { /* Invalid legacy detail cannot satisfy the versioned idempotency check. */ }
      }
      const detail = JSON.stringify(entry);
      if (detail.length > 1000) throw new Error("The financial journal entry is too large. Shorten its reference or note.");
      const { data: inserted, error: insertError } = await admin.from("cloud_sync_events").insert({
        shop_sync_key: owner.shopId, shop_name: text(owner.shop.shop_name),
        entity: "FINANCE_LEDGER", action: "POSTED",
        actor: "OWNER:" + owner.username, device_id: actor.actorDeviceId, detail
      }).select("id,created_at").single();
      if (insertError || !inserted) {
        console.error("[BeBoss financial journal]", insertError);
        return json(503, { ok: false, message: "The financial entry could not be written to the shop cloud journal. Nothing was reported as posted; refresh and retry." });
      }
      return json(200, { ok: true, entry, eventId: inserted.id, createdAt: inserted.created_at });
    }

    if (action === "finance_ledger_reverse") {
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const reversalEntryId = text(body.reversalEntryId).trim();
      const originalEntryId = text(body.originalEntryId).trim();
      const reason = text(body.reason).trim().slice(0, 300);
      if (!isUuid(reversalEntryId) || !isUuid(originalEntryId) || reason.length < 8) {
        throw new Error("A valid original entry, unique reversal ID and explanation of at least 8 characters are required.");
      }
      const { data: entries, error: entriesError } = await admin.from("cloud_sync_events")
        .select("detail").eq("shop_sync_key", owner.shopId).eq("entity", "FINANCE_LEDGER")
        .eq("action", "POSTED").order("created_at", { ascending: false }).limit(1000);
      if (entriesError) throw new Error("Could not load the original financial entry.");
      let original: Row | null = null;
      for (const event of entries ?? []) {
        try {
          const parsed = JSON.parse(text(event.detail));
          if (parsed?.version === 1 && text(parsed.entryId) === originalEntryId) {
            original = parsed as Row;
            break;
          }
        } catch { /* Ignore unrelated activity records. */ }
      }
      if (!original || text(original.type) === "REVERSAL") throw new Error("The original posted financial entry could not be found.");
      const previousReversal = await admin.from("cloud_sync_events").select("detail")
        .eq("shop_sync_key", owner.shopId).eq("entity", "FINANCE_LEDGER")
        .eq("action", "REVERSED").like("detail", '%"reversalOf":"' + originalEntryId + '"%')
        .limit(1).maybeSingle();
      if (previousReversal.error) throw new Error("Could not validate existing financial reversals.");
      if (previousReversal.data?.detail) {
        try {
          const parsed = JSON.parse(text(previousReversal.data.detail));
          if (text(parsed?.reversalOf) === originalEntryId) {
            return json(200, { ok: true, entry: parsed, reused: true });
          }
        } catch { /* Invalid reversal details cannot satisfy the versioned check. */ }
      }
      const oldFlow = text(original.flow).toUpperCase();
      const newFlow = oldFlow === "OUTFLOW" ? "INFLOW" : oldFlow === "INFLOW" ? "OUTFLOW" : "TRANSFER";
      const reversal = {
        version: 1, entryId: reversalEntryId, type: "REVERSAL", originalType: text(original.type),
        reversalOf: originalEntryId, flow: newFlow, amountRwf: number(original.amountRwf),
        account: text(original.account), sourceAccount: text(original.destinationAccount),
        destinationAccount: text(original.sourceAccount), branchId: text(original.branchId),
        branchName: text(original.branchName), effectiveAt: Date.now(), counterparty: text(original.counterparty),
        reference: text(original.reference), note: reason, postedAt: Date.now(),
        actorUsername: owner.username, actorDeviceId: actor.actorDeviceId
      };
      const detail = JSON.stringify(reversal);
      const { data: inserted, error: insertError } = await admin.from("cloud_sync_events").insert({
        shop_sync_key: owner.shopId, shop_name: text(owner.shop.shop_name),
        entity: "FINANCE_LEDGER", action: "REVERSED",
        actor: "OWNER:" + owner.username, device_id: actor.actorDeviceId, detail
      }).select("id,created_at").single();
      if (insertError || !inserted) {
        console.error("[BeBoss financial reversal]", insertError);
        return json(503, { ok: false, message: "The financial reversal could not be saved to the cloud journal. The original entry remains unchanged." });
      }
      return json(200, { ok: true, entry: reversal, eventId: inserted.id, createdAt: inserted.created_at });
    }

    if (action === "branch_upsert") {
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const row = branchPayload((body.branch ?? {}) as Row, owner.shopId);
      row.last_modified_device_id = actor.actorDeviceId;
      if (row.manager_user_id) {
        const manager = await admin.from("shop_users").select("user_id,full_name,role,is_active")
          .eq("shop_sync_key", owner.shopId).eq("user_id", row.manager_user_id).eq("is_active", true).maybeSingle();
        if (manager.error || !manager.data || manager.data.role !== "MANAGER") {
          throw new Error("Choose an active Manager account from this shop, or clear the branch manager.");
        }
        row.manager_name = text(manager.data.full_name);
      } else row.manager_name = "";
      const { data: old, error: readError } = await admin.from("shop_branches")
        .select("id,shop_sync_key,created_at,name,code,location_type,address,phone,email,notes,daily_sales_target_rwf,monthly_target_rwf,opening_cash_float,manager_user_id,operational_status,is_active,is_main_branch")
        .eq("id", row.id).maybeSingle();
      if (readError) throw new Error("Could not validate the branch record.");
      if (old && old.shop_sync_key !== owner.shopId) throw new Error("The branch belongs to another shop.");
      // Older installed clients do not send locationType; preserve a warehouse classification.
      if (!text((body.branch as Row | undefined)?.locationType).trim() && old?.location_type) {
        row.location_type = text(old.location_type).toUpperCase() === "WAREHOUSE" ? "WAREHOUSE" : "STORE";
      }
      if (row.location_type === "WAREHOUSE" && row.is_main_branch === true) {
        throw new Error("A warehouse cannot be the main retail/POS branch. Keep a STORE as the main branch.");
      }
      row.created_at = number(old?.created_at) || row.created_at;
      let previousMainBranches: Row[] = [];
      if (row.is_main_branch) {
        const previous = await admin.from("shop_branches").select("id,name,code")
          .eq("shop_sync_key", owner.shopId).eq("is_active", true).eq("is_main_branch", true).neq("id", row.id).limit(20);
        if (previous.error) throw new Error("Could not inspect the current main-branch designation.");
        previousMainBranches = previous.data ?? [];
        if (previousMainBranches.length) {
          const cleared = await admin.from("shop_branches").update({
            is_main_branch: false, updated_at: Date.now(), hlc_timestamp: Date.now(),
            last_modified_device_id: actor.actorDeviceId
          }).eq("shop_sync_key", owner.shopId).eq("is_main_branch", true).neq("id", row.id);
          if (cleared.error) throw new Error("Could not safely replace the main-branch designation: " + cleared.error.message);
        }
      }
      const { error } = await admin.from("shop_branches").upsert(row, { onConflict: "id" });
      if (error) {
        // Restore the former main designation if the replacement branch write fails.
        // This compensation keeps the shop navigable even without a schema transaction.
        if (previousMainBranches.length) {
          const restored = await admin.from("shop_branches").update({
            is_main_branch: true, updated_at: Date.now(), hlc_timestamp: Date.now() + 1,
            last_modified_device_id: actor.actorDeviceId
          }).eq("shop_sync_key", owner.shopId)
            .in("id", previousMainBranches.map((branch) => text(branch.id)));
          if (restored.error) {
            console.error("[branch main designation compensation failed]", restored.error);
            throw new Error("Branch save failed and the previous main designation could not be restored. Stop branch edits and contact support.");
          }
        }
        throw new Error("Could not save the branch: " + error.message);
      }
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      const auditEvents: Array<{ action: string; detail: string }> = [];
      if (!old) {
        auditEvents.push({ action: "CREATED", detail: row.name + " · " + row.code + " · " + row.operational_status });
      } else {
        if (old.is_active === false && row.is_active) {
          auditEvents.push({ action: "REACTIVATED", detail: row.name + " · " + row.code });
        } else if (old.is_active !== false && row.is_active === false) {
          auditEvents.push({ action: "DEACTIVATED", detail: row.name + " · " + row.code });
        }
        if (text(old.operational_status) !== text(row.operational_status)) {
          auditEvents.push({ action: "OPERATING_STATUS_CHANGED", detail: row.name + " · " + text(old.operational_status) + " → " + row.operational_status });
        }
        if (text(old.manager_user_id) !== text(row.manager_user_id)) {
          auditEvents.push({ action: "MANAGER_CHANGED", detail: row.name + " · " + (text(old.manager_user_id) || "unassigned") + " → " + (text(row.manager_user_id) || "unassigned") });
        }
        if (old.is_main_branch !== row.is_main_branch) {
          auditEvents.push({ action: row.is_main_branch ? "MAIN_BRANCH_SET" : "MAIN_BRANCH_UNSET", detail: row.name + " · " + row.code });
        }
        if (text(old.location_type || "STORE") !== text(row.location_type || "STORE")) {
          auditEvents.push({ action: "LOCATION_TYPE_CHANGED", detail: row.name + " · " + row.code + " · " + text(old.location_type || "STORE") + " → " + text(row.location_type || "STORE") });
        }
        const profileChanged =
          text(old.name) !== text(row.name) ||
          text(old.code) !== text(row.code) ||
          text(old.location_type || "STORE") !== text(row.location_type || "STORE") ||
          text(old.address) !== text(row.address) ||
          text(old.phone) !== text(row.phone) ||
          text(old.email) !== text(row.email) ||
          text(old.notes) !== text(row.notes) ||
          number(old.daily_sales_target_rwf) !== number(row.daily_sales_target_rwf) ||
          number(old.monthly_target_rwf) !== number(row.monthly_target_rwf) ||
          number(old.opening_cash_float) !== number(row.opening_cash_float);
        if (profileChanged) {
          auditEvents.push({ action: "PROFILE_UPDATED", detail: row.name + " · " + row.code + " · Contact, address, targets, float or branch profile fields changed." });
        }
      }
      for (const previous of previousMainBranches) {
        auditEvents.push({ action: "MAIN_BRANCH_REMOVED", detail: text(previous.name) + " · " + text(previous.code) + " · Replaced by " + row.name });
      }
      if (old && auditEvents.length === 0) {
        auditEvents.push({ action: "NO_CHANGE", detail: row.name + " · " + row.code + " · Branch save contained no field changes." });
      }
      let auditLogged = true;
      for (const event of auditEvents) {
        const saved = await recordShopAuditEvent(
          admin, owner.shopId, text(owner.shop.shop_name), "OWNER:" + owner.username,
          actor.actorDeviceId, "BRANCH", event.action, event.detail
        );
        auditLogged = auditLogged && saved;
      }
      if (!auditLogged) return json(503, { ok: false, mutationCommitted: true, auditLogged: false, message: "The branch change was saved, but its required cloud audit record could not be written. Do not repeat the change; refresh the branch and audit views, then contact support if the event is still missing." });
      return json(200, { ok: true, id: row.id, shopUsage, auditLogged: true });
    }

    if (action === "branch_delete") {
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const branchId = text(body.id);
      if (!branchId) throw new Error("A branch ID is required.");
      const { data: branch, error: readError } = await admin.from("shop_branches")
        .select("id,name,code,is_main_branch,is_active,operational_status").eq("id", branchId).eq("shop_sync_key", owner.shopId).maybeSingle();
      if (readError || !branch) throw new Error("The branch could not be found in this shop.");
      if (branch.is_main_branch) throw new Error("The main shop branch cannot be deactivated.");
      const [devices, staff] = await Promise.all([
        admin.from("shop_devices").select("id", { count: "exact", head: true })
          .eq("shop_sync_key", owner.shopId).eq("branch_id", branchId).eq("is_active", true),
        admin.from("shop_users").select("user_id", { count: "exact", head: true })
          .eq("shop_sync_key", owner.shopId).eq("assigned_branch_id", branchId).eq("is_active", true)
      ]);
      if (devices.error || staff.error) throw new Error("Could not verify branch assignments before deactivation.");
      if ((devices.count ?? 0) > 0 || (staff.count ?? 0) > 0) {
        throw new Error("Reassign active devices and staff before deactivating this branch. Existing sales and stock history will be retained.");
      }
      const { error } = await admin.from("shop_branches").update({
        is_active: false, operational_status: "CLOSED", updated_at: Date.now(), hlc_timestamp: Date.now(), last_modified_device_id: actor.actorDeviceId
      }).eq("id", branchId).eq("shop_sync_key", owner.shopId);
      if (error) throw new Error("Could not deactivate the branch: " + error.message);
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      const auditLogged = await recordShopAuditEvent(
        admin, owner.shopId, text(owner.shop.shop_name), "OWNER:" + owner.username,
        actor.actorDeviceId, "BRANCH", "DEACTIVATED",
        text(branch.name) + " · " + text(branch.code) + " · " + text(branch.operational_status) + " → CLOSED; active staff/device checks passed."
      );
      if (!auditLogged) return json(503, { ok: false, mutationCommitted: true, auditLogged: false, message: "The branch was deactivated, but its required cloud audit record could not be written. Do not repeat the operation; refresh the branch and audit views, then contact support if the event is still missing." });
      return json(200, { ok: true, shopUsage, auditLogged: true });
    }

    if (action === "branch_reconcile") {
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const branchId = text(body.branchId).trim();
      const startAt = Number(body.startAt);
      const endAt = Number(body.endAt);
      const cashCountedRwf = Number(body.cashCountedRwf);
      const reconciliationId = text(body.reconciliationId).trim() || crypto.randomUUID();
      if (!branchId || !Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= 0 ||
          endAt < startAt || endAt - startAt >= 24 * 60 * 60 * 1000 ||
          !Number.isFinite(cashCountedRwf) || cashCountedRwf < 0 || cashCountedRwf > 10000000000) {
        throw new Error("Choose a valid active branch, one business day and a non-negative counted cash amount.");
      }
      const { data: branch, error: branchError } = await admin.from("shop_branches")
        .select("id,name,location_type,opening_cash_float,is_active,is_main_branch").eq("shop_sync_key", owner.shopId)
        .eq("id", branchId).maybeSingle();
      if (branchError || !branch || !branch.is_active) throw new Error("Choose an active branch belonging to this shop.");
      if (text(branch.location_type).toUpperCase() === "WAREHOUSE") {
        throw new Error("Cash close-out is only available for retail stores. Reconcile warehouse stock through inventory counts and stock-transfer verification.");
      }
      const verified = await latestVerifiedSnapshot(admin, owner.shopId, config.hmacSecret);
      const snapshot = verified.snapshot;
      if (!snapshot) throw new Error("No verified shop snapshot is available. Synchronize the owner terminal before reconciling cash.");
      const belongsToBranch = (value: unknown) => {
        const valueId = text(value);
        return valueId === branchId || (!valueId && branch.is_main_branch === true);
      };
      const sales = snapshot.sales.filter((sale) => {
        const timestamp = number(sale.saleDate ?? sale.sale_date);
        return timestamp >= startAt && timestamp <= endAt && belongsToBranch(sale.branchId ?? sale.branch_id);
      });
      const cashSalesRwf = sales.reduce((sum, sale) => {
        if (text(sale.paymentMethod ?? sale.payment_method).toUpperCase() !== "CASH") return sum;
        const paid = number(sale.amountPaid ?? sale.amount_paid);
        return sum + (paid > 0 ? paid : text(sale.paymentStatus ?? sale.payment_status).toUpperCase() === "PAID"
          ? number(sale.totalAmount ?? sale.total_amount) : 0);
      }, 0);
      const customerCashPaymentsRwf = snapshot.customerPayments.filter((payment) => {
        const timestamp = number(payment.paymentDate ?? payment.payment_date);
        const method = text(payment.paymentMethod ?? payment.payment_method).trim().toUpperCase();
        return timestamp >= startAt && timestamp <= endAt && belongsToBranch(payment.branchId ?? payment.branch_id) &&
          (method === "CASH" || method === "CASH PAYMENT");
      }).reduce((sum, payment) => sum + Math.max(0, number(payment.amount)), 0);
      const openingFloatRwf = Math.max(0, number(branch.opening_cash_float));
      const expectedCashRwf = Math.round(openingFloatRwf + cashSalesRwf + customerCashPaymentsRwf);
      const varianceRwf = Math.round(cashCountedRwf - expectedCashRwf);
      const policy = await loadShopApprovalPolicy(admin, owner.shopId);
      const needsApproval = policy.reconciliationVarianceThresholdRwf > 0 &&
        Math.abs(varianceRwf) >= policy.reconciliationVarianceThresholdRwf;
      const approvalReason = text(body.approvalReason).trim().slice(0, 500);
      if (needsApproval && (body.approvalConfirmed !== true || approvalReason.length < 8)) {
        throw new Error("This cash variance meets the shop's approval threshold. Confirm the owner review and enter an explanation of at least 8 characters.");
      }
      const record = {
        version: 1, reconciliationId, branchId, branchName: text(branch.name),
        startAt, endAt, salesCount: sales.length,
        grossSalesRwf: Math.round(sales.reduce((sum, sale) => sum + Math.max(0, number(sale.totalAmount ?? sale.total_amount)), 0)),
        cashSalesRwf: Math.round(cashSalesRwf),
        customerCashPaymentsRwf: Math.round(customerCashPaymentsRwf),
        openingFloatRwf, expectedCashRwf, cashCountedRwf: Math.round(cashCountedRwf),
        varianceRwf, approvalRequired: needsApproval, approvalConfirmed: needsApproval && body.approvalConfirmed === true,
        approvalReason, notes: text(body.notes).trim().slice(0, 400), recordedAt: Date.now()
      };
      const auditLogged = await recordShopAuditEvent(
        admin, owner.shopId, text(owner.shop.shop_name), "OWNER:" + owner.username,
        actor.actorDeviceId, "BRANCH_RECONCILIATION", "COMPLETED", JSON.stringify(record)
      );
      if (!auditLogged) throw new Error("The cash calculation was not recorded because the cloud audit journal is unavailable. Refresh and retry.");
      return json(200, { ok: true, reconciliation: record, auditLogged: true });
    }

    if (action === "staff_update") {
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const userId = text(body.userId);
      const role = text(body.role).toUpperCase();
      const isActive = body.isActive === true;
      const branchId = text(body.branchId);
      if (!userId || !["OWNER","MANAGER","CASHIER"].includes(role)) throw new Error("The staff update is invalid.");
      const { data: staff, error: staffError } = await admin.from("shop_users")
        .select("user_id,role,full_name,assigned_branch_id,assigned_branch_name,is_active,username")
        .eq("shop_sync_key", owner.shopId).eq("user_id", userId).maybeSingle();
      if (staffError || !staff) throw new Error("The staff account was not found in this shop.");
      if (staff.role === "OWNER" || role === "OWNER") throw new Error("Owner access and owner role changes must be handled through the reviewed owner-security process.");
      if (branchId) {
        const branch = await admin.from("shop_branches").select("id").eq("id", branchId).eq("shop_sync_key", owner.shopId).eq("is_active", true).maybeSingle();
        if (branch.error || !branch.data) throw new Error("Choose an active branch from this shop.");
      }
      const { data: branchRow } = branchId
        ? await admin.from("shop_branches").select("name").eq("id", branchId).eq("shop_sync_key", owner.shopId).maybeSingle()
        : { data: null };
      const nextBranchName = text(branchRow?.name) || "All Branches";
      const { error } = await admin.from("shop_users").update({
        role, assigned_branch_id: branchId, assigned_branch_name: nextBranchName,
        is_active: isActive, updated_at: Date.now()
      }).eq("shop_sync_key", owner.shopId).eq("user_id", userId);
      if (error) throw new Error("Could not update staff access: " + error.message);
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      const changes = [
        staff.role !== role ? "role " + staff.role + " → " + role : "",
        text(staff.assigned_branch_id) !== branchId ? "branch " + (text(staff.assigned_branch_name) || "All Branches") + " → " + nextBranchName : "",
        staff.is_active !== isActive ? (isActive ? "activated" : "deactivated") : ""
      ].filter(Boolean);
      const auditLogged = changes.length === 0 || await recordShopAuditEvent(
        admin, owner.shopId, text(owner.shop.shop_name), "OWNER:" + owner.username,
        actor.actorDeviceId, "STAFF", "ACCESS_UPDATED",
        text(staff.full_name) + " · @" + text(staff.username) + " · " + changes.join("; ")
      );
      return json(200, { ok: true, shopUsage, auditLogged });
    }

    if (action === "transfer_create") {
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const id = text(body.id) || crypto.randomUUID();
      const productId = text(body.productId);
      const fromId = text(body.fromBranchId);
      const toId = text(body.toBranchId);
      const quantity = number(body.quantity);
      if (!productId || !fromId || !toId || fromId === toId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) {
        throw new Error("Choose a product, two different branches and a positive quantity.");
      }
      const { data: existing, error: existingError } = await admin.from("shop_stock_transfers")
        .select("id,status,transfer_number").eq("id", id).eq("shop_sync_key", owner.shopId).maybeSingle();
      if (existingError) throw new Error("Could not validate the transfer command.");
      if (existing) return json(200, { ok: true, id, status: existing.status, transferNumber: existing.transfer_number, reused: true });
      const { data: branches, error: branchError } = await admin.from("shop_branches")
        .select("id,name,is_active,operational_status").eq("shop_sync_key", owner.shopId).in("id", [fromId,toId]);
      if (branchError || !branches || branches.length !== 2 || branches.some((b) => !b.is_active)) {
        throw new Error("Both source and destination branches must be active in this shop.");
      }
      const sourceBranch = branches.find((branch) => branch.id === fromId)!;
      const destinationBranch = branches.find((branch) => branch.id === toId)!;
      assertBranchesOpenForTransfer(sourceBranch.operational_status, destinationBranch.operational_status);
      const merged = (await latestVerifiedSnapshot(admin, owner.shopId, config.hmacSecret)).snapshot;
      const product = merged?.products.find((p) => text(p.id) === productId && p.isDeleted !== true);
      if (!product) throw new Error("The selected product is not present in the latest verified shop inventory.");
      if (text(product.branchId) && text(product.branchId) !== fromId && text(product.branchId) !== "main_branch") {
        throw new Error("The product is not assigned to the selected source branch.");
      }
      if (quantity > number(product.quantityInStock)) {
        throw new Error("Requested transfer quantity exceeds the latest source stock.");
      }
      const from = branches.find((b) => b.id === fromId)!;
      const to = branches.find((b) => b.id === toId)!;
      const transferNumber = "TRF-" + Date.now().toString().slice(-9);
      const transferCostRwf = Math.max(0, Math.round(quantity * number(product.costPrice)));
      const policy = await loadShopApprovalPolicy(admin, owner.shopId);
      const approvalRequired = policy.transferApprovalThresholdRwf > 0 &&
        transferCostRwf >= policy.transferApprovalThresholdRwf;
      const approvalReason = text(body.approvalReason).trim().slice(0, 500);
      if (approvalRequired && (body.approvalConfirmed !== true || approvalReason.length < 8)) {
        throw new Error("This transfer meets the shop's approval threshold. Confirm the owner approval and enter an explanation of at least 8 characters.");
      }
      const now = Date.now();
      const { error } = await admin.from("shop_stock_transfers").insert({
        id, shop_sync_key: owner.shopId, shop_name: owner.shop.shop_name,
        transfer_number: transferNumber, product_id: productId, product_name: text(product.name),
        from_branch_id: fromId, from_branch_name: from.name,
        to_branch_id: toId, to_branch_name: to.name,
        quantity, unit: text(product.unit) || "pcs",
        cost_value_rwf: transferCostRwf,
        transfer_date: now, status: "REQUESTED",
        notes: text(body.notes).slice(0, 1000), transferred_by: owner.username,
        received_by: "", received_at: 0, synced: false,
        created_at: now, updated_at: now, hlc_timestamp: now, last_modified_device_id: actor.actorDeviceId
      });
      if (error) throw new Error("Could not create the stock-transfer command: " + error.message);
      const requestAuditDetail = JSON.stringify({
        version: 1,
        recordId: id,
        transferNumber,
        productId,
        fromBranchId: fromId,
        toBranchId: toId,
        quantity,
        transferCostRwf,
        approvalRequired,
        approverUsername: owner.username,
        approvalDeviceId: actor.actorDeviceId,
        policyVersion: policy.version,
        approvedAt: now,
        reason: approvalRequired ? approvalReason : ""
      });
      const auditLogged = await recordShopAuditEvent(
        admin, owner.shopId, owner.shop.shop_name, "OWNER:" + owner.username,
        actor.actorDeviceId, "STOCK_TRANSFER", approvalRequired ? "REQUESTED_OWNER_APPROVED" : "REQUESTED",
        requestAuditDetail
      );
      if (!auditLogged) return json(503, { ok: false, mutationCommitted: true, transferId: id, transferNumber, status: "REQUESTED", auditLogged: false, message: "The transfer request was created, but its required cloud audit record could not be written. Do not create it again; refresh the transfer and audit views, then contact support if the event is still missing." });
      return json(200, { ok: true, id, transferNumber, status: "REQUESTED", approvalRequired, auditLogged: true });
    }

    if (action === "transfer_command") {
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const id = text(body.id);
      const command = text(body.command).toUpperCase();
      if (!id || !["RECEIPT","CANCEL"].includes(command)) throw new Error("A valid stock-transfer command is required.");
      const { data: current, error: readError } = await admin.from("shop_stock_transfers")
        .select("id,status,shop_sync_key,transfer_number,product_name,from_branch_name,to_branch_name,quantity").eq("id", id).eq("shop_sync_key", owner.shopId).maybeSingle();
      if (readError || !current) throw new Error("The stock transfer was not found in this shop.");
      if (current.status !== "IN_TRANSIT") throw new Error("A receipt or cancellation can only be requested while stock is in transit.");
      const now = Date.now();
      const next = command === "RECEIPT" ? "RECEIPT_REQUESTED" : "CANCEL_REQUESTED";
      const { data: updated, error } = await admin.from("shop_stock_transfers").update({
        status: next, updated_at: now, hlc_timestamp: now, last_modified_device_id: actor.actorDeviceId
      }).eq("id", id).eq("shop_sync_key", owner.shopId).eq("status", "IN_TRANSIT")
        .select("id,status").maybeSingle();
      if (error || !updated) throw new Error("The transfer changed on another terminal. Refresh the transfer queue before trying again.");
      const auditLogged = await recordShopAuditEvent(
        admin, owner.shopId, text(owner.shop.shop_name), "OWNER:" + owner.username,
        actor.actorDeviceId, "STOCK_TRANSFER", next,
        text(current.transfer_number) + " · " + text(current.product_name) + " · " + text(current.from_branch_name) + " → " + text(current.to_branch_name) + " · " + text(current.quantity) + " · " + current.status + " → " + next
      );
      if (!auditLogged) return json(503, { ok: false, mutationCommitted: true, status: updated.status, auditLogged: false, message: "The transfer command was saved, but its required cloud audit record could not be written. Do not repeat the command; refresh the transfer and audit views, then contact support if the event is still missing." });
      return json(200, { ok: true, status: updated.status, auditLogged: true });
    }

    if (action === "device_create") {
      const deviceName = text(body.deviceName).trim();
      const assignedUserId = text(body.assignedUserId);
      const branchId = text(body.branchId);
      if (deviceName.length < 2 || deviceName.length > 120 || !assignedUserId || !branchId) {
        throw new Error("Enter a device name and select an active staff member and branch.");
      }
      const { data: shop, error: shopError } = await admin.from("shop_accounts")
        .select("shop_name,remote_kill_switch").eq("id", owner.shopId).maybeSingle();
      if (shopError || !shop || shop.remote_kill_switch) throw new Error("This shop is not available for new device registration.");
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const [staffRes, branchRes] = await Promise.all([
        admin.from("shop_users").select("user_id,username,full_name,role,assigned_branch_id,is_active")
          .eq("shop_sync_key", owner.shopId).eq("user_id", assignedUserId).eq("is_active", true).maybeSingle(),
        admin.from("shop_branches").select("id,name,is_active")
          .eq("shop_sync_key", owner.shopId).eq("id", branchId).eq("is_active", true).maybeSingle()
      ]);
      const staff = staffRes.data;
      const branch = branchRes.data;
      if (staffRes.error || !staff || staff.role === "OWNER" || staff.assigned_branch_id !== branchId) {
        throw new Error("Choose an active Manager or Cashier already assigned to the selected branch.");
      }
      if (branchRes.error || !branch) throw new Error("Choose an active branch in this shop.");
      const newId = crypto.randomUUID();
      const now = Date.now();
      const { data: slot, error: slotError } = await admin.from("shop_devices").insert({
        id: newId, shop_sync_key: owner.shopId, shop_name: shop.shop_name,
        device_id: "", device_name: deviceName, join_code: "",
        assigned_user_id: staff.user_id, assigned_username: staff.username,
        assigned_user_name: staff.full_name, role: staff.role,
        branch_id: branch.id, branch_name: branch.name, is_owner_primary: false,
        is_active: true, monthly_fee_addon_rwf: EXTRA_DEVICE_MONTHLY_FEE_RWF, last_synced_at: 0,
        created_at: now, updated_at: now
      }).select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_username,assigned_user_name,last_synced_at,created_at,updated_at,monthly_fee_addon_rwf").single();
      if (slotError || !slot) throw new Error("Could not create the secure device slot: " + (slotError?.message || "No row returned."));
      try {
        const invite = await issueDeviceInvitationV2(config, owner.shopId, newId, branch.id, actor.actorDeviceId, actor.ownerUser.user_id);
        const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
        return json(200, { ok: true, ...slot, joinCode: invite.joinCode, expiresAt: invite.expiresAt, monthlyAddonRwf: EXTRA_DEVICE_MONTHLY_FEE_RWF, shopUsage });
      } catch (error) {
        await admin.from("shop_devices").delete().eq("id", newId).eq("shop_sync_key", owner.shopId);
        throw error;
      }
    }

    if (action === "device_update") {
      const deviceRecordId = text(body.id).trim();
      const deviceName = text(body.deviceName).trim();
      const nextAssignedUserId = text(body.assignedUserId).trim();
      const nextBranchId = text(body.branchId).trim();
      if (!deviceRecordId || deviceName.length < 2 || deviceName.length > 120 || !nextBranchId) {
        throw new Error("Enter a valid device name and select a branch.");
      }
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const { data: current, error: currentError } = await admin.from("shop_devices")
        .select("id,device_id,assigned_user_id,role,branch_id,is_owner_primary,is_active")
        .eq("id", deviceRecordId).eq("shop_sync_key", owner.shopId).maybeSingle();
      if (currentError || !current || current.is_owner_primary) throw new Error("This device cannot be edited.");
      if (!current.is_active) throw new Error("Activate the device before editing its assignment.");
      const { data: branch, error: branchError } = await admin.from("shop_branches")
        .select("id,name,is_active").eq("id", nextBranchId).eq("shop_sync_key", owner.shopId).eq("is_active", true).maybeSingle();
      if (branchError || !branch) throw new Error("Choose an active branch from this shop.");
      const isOwnerDesktop = current.role === "OWNER";
      const assignedUserId = isOwnerDesktop ? actor.ownerUser.user_id : nextAssignedUserId;
      let assignee: Row | null = null;
      if (isOwnerDesktop) {
        if (current.assigned_user_id !== actor.ownerUser.user_id) throw new Error("This desktop is assigned to another account and cannot be reassigned here.");
        assignee = actor.ownerUser as unknown as Row;
      } else {
        const { data, error } = await admin.from("shop_users").select("user_id,username,full_name,role,assigned_branch_id,is_active")
          .eq("shop_sync_key", owner.shopId).eq("user_id", assignedUserId).eq("is_active", true).maybeSingle();
        if (error || !data || data.role === "OWNER" || data.assigned_branch_id !== nextBranchId) {
          throw new Error("Choose an active Manager or Cashier already assigned to the selected branch.");
        }
        assignee = data as Row;
      }
      const reassignment = current.assigned_user_id !== assignedUserId || current.branch_id !== nextBranchId;
      if (reassignment && current.device_id !== "" && !text(current.device_id).startsWith("DESKTOP:")) {
        throw new Error("This terminal is already paired. Remove it and issue a new one-time invitation to change its assigned staff member or branch.");
      }
      const { error } = await admin.from("shop_devices").update({
        device_name: deviceName, branch_id: branch.id, branch_name: branch.name,
        ...(reassignment ? {
          assigned_user_id: assignedUserId, assigned_username: text(assignee?.username),
          assigned_user_name: text(assignee?.full_name), role: text(assignee?.role)
        } : {}),
        updated_at: Date.now()
      }).eq("id", deviceRecordId).eq("shop_sync_key", owner.shopId);
      if (error) throw new Error("Could not save device details: " + error.message);
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      if (reassignment && current.device_id === "") {
        const invite = await issueDeviceInvitationV2(config, owner.shopId, deviceRecordId, branch.id, actor.actorDeviceId, actor.ownerUser.user_id);
        return json(200, { ok: true, id: deviceRecordId, joinCode: invite.joinCode, expiresAt: invite.expiresAt, shopUsage });
      }
      return json(200, { ok: true, id: deviceRecordId, shopUsage });
    }

    if (action === "device_set_active") {
      const deviceRecordId = text(body.id).trim();
      const isActive = body.isActive === true;
      if (!deviceRecordId) throw new Error("A device record ID is required.");
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const tenantAdmin = createClient(config.url, config.serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "X-Shop-Sync-Key": owner.shopId } }
      });
      const { data: device, error: readError } = await admin.from("shop_devices")
        .select("id,device_id,is_owner_primary,is_active,assigned_user_id,branch_id").eq("id", deviceRecordId).eq("shop_sync_key", owner.shopId).maybeSingle();
      if (readError || !device || device.is_owner_primary) throw new Error("This device cannot be paused or resumed.");
      if (text(device.device_id) === actor.actorDeviceId) throw new Error("Use another owner device to pause the desktop currently managing this shop.");
      if (isActive) {
        const [staff, branch] = await Promise.all([
          admin.from("shop_users").select("user_id").eq("shop_sync_key", owner.shopId).eq("user_id", device.assigned_user_id).eq("is_active", true).maybeSingle(),
          admin.from("shop_branches").select("id").eq("shop_sync_key", owner.shopId).eq("id", device.branch_id).eq("is_active", true).maybeSingle()
        ]);
        if (staff.error || !staff.data || branch.error || !branch.data) throw new Error("Reassign this terminal to an active staff member and branch before resuming it.");
      }
      const { data: changed, error } = await tenantAdmin.rpc("set_shop_device_active", {
        p_shop_sync_key: owner.shopId, p_device_record_id: deviceRecordId,
        p_actor_device_id: actor.actorDeviceId, p_actor_user_id: actor.ownerUser.user_id, p_is_active: isActive
      });
      if (error || changed !== true) throw new Error("The shop's secure device-control procedure rejected the change: " + (error?.message || "No update was confirmed."));
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      return json(200, { ok: true, isActive, shopUsage });
    }

    if (action === "device_remove") {
      const deviceRecordId = text(body.id).trim();
      if (!deviceRecordId) throw new Error("A device record ID is required.");
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const { data: device, error: readError } = await admin.from("shop_devices")
        .select("id,device_id,is_owner_primary").eq("id", deviceRecordId).eq("shop_sync_key", owner.shopId).maybeSingle();
      if (readError || !device || device.is_owner_primary) throw new Error("The primary owner terminal cannot be removed.");
      if (text(device.device_id) === actor.actorDeviceId ||
          (text(body.currentDeviceId) && text(device.device_id) === text(body.currentDeviceId))) {
        throw new Error("Use another owner device to remove the desktop currently running this session.");
      }
      const tenantAdmin = createClient(config.url, config.serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "X-Shop-Sync-Key": owner.shopId } }
      });
      const { data: removed, error } = await tenantAdmin.rpc("delete_shop_device", {
        p_shop_sync_key: owner.shopId, p_device_record_id: deviceRecordId,
        p_actor_device_id: actor.actorDeviceId, p_actor_user_id: actor.ownerUser.user_id
      });
      if (error || removed !== true) throw new Error("The shop's secure device-removal procedure rejected the request: " + (error?.message || "No deletion was confirmed."));
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      return json(200, { ok: true, shopUsage });
    }

    if (action === "device_reinvite") {
      const deviceRecordId = text(body.id).trim();
      if (!deviceRecordId) throw new Error("A device record ID is required.");
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), owner.username);
      const { data: device, error: readError } = await admin.from("shop_devices")
        .select("id,device_id,is_owner_primary,is_active,assigned_user_id,branch_id").eq("id", deviceRecordId).eq("shop_sync_key", owner.shopId).maybeSingle();
      if (readError || !device || !device.is_active || device.is_owner_primary || text(device.device_id) !== "") {
        throw new Error("Only an active, unpaired invitation slot can receive a new join code. Paired terminals must be removed and invited again.");
      }
      const tenantAdmin = createClient(config.url, config.serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "X-Shop-Sync-Key": owner.shopId } }
      });
      const { error: revokeError } = await tenantAdmin.rpc("revoke_shop_device_invites", {
        p_shop_sync_key: owner.shopId, p_device_record_id: deviceRecordId,
        p_actor_device_id: actor.actorDeviceId, p_actor_user_id: actor.ownerUser.user_id
      });
      if (revokeError) throw new Error("Could not revoke the previous unredeemed invitation.");
      const invite = await issueDeviceInvitationV2(config, owner.shopId, deviceRecordId, device.branch_id, actor.actorDeviceId, actor.ownerUser.user_id);
      return json(200, { ok: true, id: deviceRecordId, joinCode: invite.joinCode, expiresAt: invite.expiresAt });
    }

    return json(400, { ok: false, message: "Unknown BeBoss desktop operation." });
  } catch (error) {
    console.error("[BeBoss desktop API]", error);
    const message = error instanceof Error ? error.message : "The BeBoss desktop request failed.";
    const status = message.includes("snapshot") && message.includes("newer") ? 409 : 400;
    return json(status, { ok: false, message });
  }
});
