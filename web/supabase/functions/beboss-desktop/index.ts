import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  createDeviceToken,
  DEVICE_ACCESS_TTL_MS,
  DEVICE_REFRESH_TTL_MS,
} from "../_shared/device-credentials.ts";
import { monthlyShopFeeRwf } from "../_shared/shop-management.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
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
function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Constant-time comparison to avoid a timing oracle on snapshot signatures. */
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
async function hmacHex(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToHex(new Uint8Array(signature)).toUpperCase();
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
async function verifyAndDecodeToken(token: string, secret: string): Promise<Row> {
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
  const expected = await hmacHex(payload, secret);
  const expectedSig = prefix === "BBSHARE1:" ? expected.slice(0, 16) : expected;
  const validSig = prefix === "BBSHARE1:" ? signature.length === 16 : signature.length === 64;
  if (!validSig || !/^[A-F0-9]+$/.test(signature)) throw new Error("A snapshot signature has an invalid format.");
  if (!constantTimeEq(signature, expectedSig)) throw new Error("A BeBoss snapshot failed its HMAC integrity check.");
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
async function encodeToken(snapshot: Row, secret: string) {
  const raw = new TextEncoder().encode(JSON.stringify(snapshot));
  if (raw.length > 5 * 1024 * 1024) throw new Error("The desktop snapshot exceeds the 5 MB safe uncompressed limit.");
  const compressed = await streamToBytes(
    new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
    7 * 1024 * 1024
  );
  const payload = bytesToBase64(compressed);
  const signature = await hmacHex(payload, secret);
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
  let shopProfile: Row = {};
  let metadata: Row = {};
  let exportedAt = 0;

  for (const part of parts) {
    const meta = (part.metadata && typeof part.metadata === "object" ? part.metadata : {}) as Row;
    const fallback = number(meta.timestamp);
    exportedAt = Math.max(exportedAt, fallback);
    if (Object.keys(shopProfile).length === 0 && part.shopProfile && typeof part.shopProfile === "object") {
      shopProfile = part.shopProfile as Row;
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

    const alias: Partial<Record<DataKey, string>> = { customerPayments: "customerPayments" };
    for (const key of DATA_KEYS) {
      const rows = arrayRows(part[alias[key] ?? key]);
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
    const tombstone = tombstones.get(key + ":" + text(row.id));
    return !tombstone || getVersion(row, exportedAt) > (number(tombstone.hlcTimestamp) || number(tombstone.deletedAt));
  });

  return {
    metadata: { ...metadata, timestamp: exportedAt, schemaVersion: 3 },
    shopProfile,
    products: live("products"),
    customers: live("customers"),
    sales: live("sales"),
    saleItems: live("saleItems"),
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

async function latestVerifiedSnapshot(admin: SupabaseClient, shopId: string, secret: string) {
  const { data: rows, error } = await admin
    .from("branch_sync_snapshots")
    .select("id,device_id,branch_name,payload_token,updated_at,sync_generation,chunk_index,chunk_count,records_summary")
    .eq("shop_sync_key", shopId)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error("Could not read the shop's synchronized business data: " + error.message);

  const allRows = rows ?? [];
  const latest = allRows.reduce((max, row) => Math.max(max, number(row.updated_at)), 0);
  const grouped = new Map<string, Row[]>();
  for (const row of allRows) {
    const device = text(row.device_id).replace(/#c\\d+$/, "");
    const generation = text(row.sync_generation) || "legacy";
    const key = device + "::" + generation;
    const list = grouped.get(key) ?? [];
    list.push(row as Row);
    grouped.set(key, list);
  }

  const newestByDevice = new Map<string, { updated: number; rows: Row[] }>();
  for (const list of grouped.values()) {
    const head = list[0]!;
    const baseDevice = text(head.device_id).replace(/#c\\d+$/, "");
    const expectedCount = Math.max(1, number(head.chunk_count) || 1);
    const indexes = new Set(list.map((row) => number(row.chunk_index)));
    const complete = indexes.size >= expectedCount && Array.from({ length: expectedCount }, (_, i) => indexes.has(i)).every(Boolean);
    if (!complete) continue;
    const candidate = { updated: Math.max(...list.map((row) => number(row.updated_at))), rows: list };
    const previous = newestByDevice.get(baseDevice);
    if (!previous || candidate.updated > previous.updated) newestByDevice.set(baseDevice, candidate);
  }

  const parts: Row[] = [];
  let verifiedChunks = 0;
  for (const value of newestByDevice.values()) {
    const ordered = [...value.rows].sort((a, b) => number(a.chunk_index) - number(b.chunk_index));
    for (const row of ordered) {
      parts.push(await verifyAndDecodeToken(text(row.payload_token), secret));
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
    verifiedChunks
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
  const status = text(data.operationalStatus || "OPEN").toUpperCase();
  if (!["OPEN", "CLOSED", "SUSPENDED"].includes(status)) throw new Error("Invalid branch operating status.");
  return {
    id: text(data.id) || crypto.randomUUID(),
    shop_sync_key: shopId,
    name,
    code: text(data.code).trim().slice(0, 40),
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
  const [shop, devices, branches, transfers, staff, announcements, payments, codes] = await Promise.all([
    admin.from("shop_accounts").select("id,shop_name,owner_name,owner_username,owner_phone,subscription_status,subscription_expires_at,branch_count,worker_count,device_count,device_limit,monthly_fee_rwf,business_type,updated_at").eq("id", shopId).maybeSingle(),
    admin.from("shop_devices").select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_username,assigned_user_name,last_synced_at,created_at,updated_at,monthly_fee_addon_rwf").eq("shop_sync_key", shopId).order("updated_at", { ascending: false }).limit(500),
    admin.from("shop_branches").select("*").eq("shop_sync_key", shopId).order("is_main_branch", { ascending: false }).limit(500),
    admin.from("shop_stock_transfers").select("*").eq("shop_sync_key", shopId).order("updated_at", { ascending: false }).limit(1000),
    admin.from("shop_users").select("user_id,full_name,username,phone,role,assigned_branch_id,assigned_branch_name,is_active,updated_at").eq("shop_sync_key", shopId).order("full_name", { ascending: true }).limit(1000),
    admin.from("announcements").select("id,title,body,severity,audience,target_shop_key,cta_label,cta_url,starts_at,ends_at,is_active,translations").in("audience", ["ALL","APP"]).eq("is_active", true).or(`target_shop_key.eq.${shopId},target_shop_key.eq.`).order("starts_at", { ascending: false }).limit(50),
    admin.from("payment_requests").select("id,provider,amount_rwf,duration_months,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,rejection_reason,created_at,updated_at,gateway_provider,gateway_reference,gateway_verified_at").eq("owner_username", ownerUsername).order("created_at", { ascending: false }).limit(100),
    admin.from("unlock_codes").select("unlock_code,tier_code,plan_days,status,issued_at,redeemed_at").eq("shop_username", ownerUsername).order("issued_at", { ascending: false }).limit(100)
  ]);
  for (const result of [shop, devices, branches, transfers, staff, announcements, payments, codes]) {
    if (result.error) throw new Error("Could not refresh shop management records: " + result.error.message);
  }
  if (!shop.data) throw new Error("The registered shop account is unavailable.");
  return { shop: shop.data, devices: devices.data ?? [], branches: branches.data ?? [], transfers: transfers.data ?? [],
    staff: staff.data ?? [], announcements: announcements.data ?? [], payments: payments.data ?? [], codes: codes.data ?? [], serverTime: Date.now() };
}

async function ownerManagementActorV2(admin: SupabaseClient, shopId: string, actorDeviceId: string, ownerUserId: string) {
  const normalizedActorDeviceId = text(actorDeviceId).trim();
  if (!/^DESKTOP:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedActorDeviceId) || !ownerUserId) {
    throw new Error("This desktop installation does not have a valid registered device identity.");
  }
  const [ownerUser, actorDevice, mainBranch] = await Promise.all([
    admin.from("shop_users").select("user_id,username,full_name,role,is_active")
      .eq("shop_sync_key", shopId).eq("user_id", ownerUserId).eq("role", "OWNER").eq("is_active", true).maybeSingle(),
    admin.from("shop_devices").select("id,device_id,assigned_user_id,is_active")
      .eq("shop_sync_key", shopId).eq("device_id", normalizedActorDeviceId)
      .eq("is_active", true).maybeSingle(),
    admin.from("shop_branches").select("id,name").eq("shop_sync_key", shopId)
      .eq("is_active", true).eq("is_main_branch", true).maybeSingle()
  ]);
  if (ownerUser.error || !ownerUser.data || actorDevice.error || !actorDevice.data ||
      actorDevice.data.assigned_user_id !== ownerUserId) {
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
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(joinCode));
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
    const owner = await requireOwner(
      req,
      admin,
      config.publishableKey,
      body,
      action === "bootstrap" || action === "device_enroll" || action === "device_retire_legacy"
    );

    if (action === "device_enroll") {
      const deviceId = text(body.deviceId).trim();
      const deviceName = text(body.deviceName).trim().slice(0, 120) || "Android terminal";
      if (deviceId.length < 4 || deviceId.length > 120 || /[\\r\\n]/.test(deviceId)) {
        throw new Error("This Android installation has an invalid device identifier.");
      }

      const deviceFields = "id,device_id,device_name,role,assigned_user_id,is_active,is_owner_primary";
      let { data: deviceRecord, error: deviceLookupError } = await admin
        .from("shop_devices")
        .select(deviceFields)
        .eq("shop_sync_key", owner.shopId)
        .eq("device_id", deviceId)
        .eq("is_active", true)
        .maybeSingle();
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

    if (action === "bootstrap") {
      const installationId = text(body.deviceId).trim();
      if (!isUuid(installationId)) {
        return json(403, { ok: false, message: "This desktop installation has no valid persistent device identity. Reopen the application and try again." });
      }
      const { data: ownerUser, error: ownerUserError } = await admin.from("shop_users")
        .select("user_id,username,full_name,role,is_active")
        .eq("shop_sync_key", owner.shopId).eq("user_id", owner.user.id)
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
          is_owner_primary: false, is_active: true, monthly_fee_addon_rwf: 2000,
          last_synced_at: now, created_at: now, updated_at: now
        }).select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_username,assigned_user_name,last_synced_at,created_at,updated_at,monthly_fee_addon_rwf").single();
        if (error || !data) throw new Error("Could not register this desktop as an additional billable device: " + (error?.message || "No row returned."));
        registeredDesktop = data;
      }
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      const [snapshotResult, paymentsResult, codesResult, devicesResult, branchesResult, transfersResult, staffResult, newsResult] = await Promise.all([
        latestVerifiedSnapshot(admin, owner.shopId, config.hmacSecret),
        admin.from("payment_requests").select("id,provider,amount_rwf,duration_months,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,rejection_reason,created_at,updated_at,gateway_provider,gateway_reference,gateway_verified_at").eq("owner_username", owner.username).order("created_at", { ascending: false }).limit(100),
        admin.from("unlock_codes").select("unlock_code,tier_code,plan_days,status,issued_at,redeemed_at").eq("shop_username", owner.username).order("issued_at", { ascending: false }).limit(100),
        admin.from("shop_devices").select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_user_name,last_synced_at,created_at,monthly_fee_addon_rwf").eq("shop_sync_key", owner.shopId).order("updated_at", { ascending: false }).limit(500),
        admin.from("shop_branches").select("*").eq("shop_sync_key", owner.shopId).order("is_main_branch", { ascending: false }).limit(500),
        admin.from("shop_stock_transfers").select("*").eq("shop_sync_key", owner.shopId).order("updated_at", { ascending: false }).limit(1000),
        admin.from("shop_users").select("user_id,full_name,username,phone,role,assigned_branch_id,assigned_branch_name,is_active,updated_at").eq("shop_sync_key", owner.shopId).order("full_name", { ascending: true }).limit(1000),
        admin.from("announcements").select("id,title,body,severity,audience,target_shop_key,cta_label,cta_url,starts_at,ends_at,is_active,translations").in("audience", ["ALL","APP"]).eq("is_active", true).or(`target_shop_key.eq.${owner.shopId},target_shop_key.eq.`).order("starts_at", { ascending: false }).limit(30)
      ]);
      for (const result of [paymentsResult, codesResult, devicesResult, branchesResult, transfersResult, staffResult, newsResult]) {
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
        serverTime: Date.now()
      });
    }

    if (action === "management_refresh") {
      const records = await loadManagementRecordsV2(admin, owner.shopId, owner.username);
      return json(200, { ok: true, ...records });
    }

    if (action === "save_snapshot") {
      const installationId = text(body.deviceId).trim();
      if (!isUuid(installationId)) throw new Error("The desktop installation identifier is invalid.");
      const actor = await ownerManagementActorV2(admin, owner.shopId, "DESKTOP:" + installationId, text(owner.user.id));
      const snapshot = sanitizeSnapshot(body.snapshot, { username: owner.username, shop: owner.shop });
      nowSnapshot(snapshot, owner.username);
      const encoded = await encodeToken(snapshot, config.hmacSecret);
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
      const signature = (await hmacHex(payload, config.hmacSecret)).slice(0, 16);
      const token = "BBSHARE1:" + signature + ":" + payload;
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
      const decoded = await verifyAndDecodeToken(token, config.hmacSecret);
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

    if (action === "branch_upsert") {
      await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), text(owner.user.id));
      const row = branchPayload((body.branch ?? {}) as Row, owner.shopId);
      if (row.manager_user_id) {
        const manager = await admin.from("shop_users").select("user_id,full_name,role,is_active")
          .eq("shop_sync_key", owner.shopId).eq("user_id", row.manager_user_id).eq("is_active", true).maybeSingle();
        if (manager.error || !manager.data || manager.data.role !== "MANAGER") {
          throw new Error("Choose an active Manager account from this shop, or clear the branch manager.");
        }
        row.manager_name = text(manager.data.full_name);
      } else row.manager_name = "";
      if (row.is_main_branch) {
        await admin.from("shop_branches").update({
          is_main_branch: false, updated_at: Date.now(), hlc_timestamp: Date.now(), last_modified_device_id: "DESKTOP"
        }).eq("shop_sync_key", owner.shopId).eq("is_main_branch", true).neq("id", row.id);
      }
      const { data: old, error: readError } = await admin.from("shop_branches").select("id,shop_sync_key,created_at").eq("id", row.id).maybeSingle();
      if (readError) throw new Error("Could not validate the branch record.");
      if (old && old.shop_sync_key !== owner.shopId) throw new Error("The branch belongs to another shop.");
      row.created_at = number(old?.created_at) || row.created_at;
      const { error } = await admin.from("shop_branches").upsert(row, { onConflict: "id" });
      if (error) throw new Error("Could not save the branch: " + error.message);
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      return json(200, { ok: true, id: row.id, shopUsage });
    }

    if (action === "branch_delete") {
      await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), text(owner.user.id));
      const branchId = text(body.id);
      if (!branchId) throw new Error("A branch ID is required.");
      const { data: branch, error: readError } = await admin.from("shop_branches")
        .select("id,is_main_branch").eq("id", branchId).eq("shop_sync_key", owner.shopId).maybeSingle();
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
        is_active: false, operational_status: "CLOSED", updated_at: Date.now(), hlc_timestamp: Date.now(), last_modified_device_id: "DESKTOP"
      }).eq("id", branchId).eq("shop_sync_key", owner.shopId);
      if (error) throw new Error("Could not deactivate the branch: " + error.message);
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      return json(200, { ok: true, shopUsage });
    }

    if (action === "staff_update") {
      await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), text(owner.user.id));
      const userId = text(body.userId);
      const role = text(body.role).toUpperCase();
      const isActive = body.isActive === true;
      const branchId = text(body.branchId);
      if (!userId || !["OWNER","MANAGER","CASHIER"].includes(role)) throw new Error("The staff update is invalid.");
      const { data: staff, error: staffError } = await admin.from("shop_users")
        .select("user_id,role,full_name").eq("shop_sync_key", owner.shopId).eq("user_id", userId).maybeSingle();
      if (staffError || !staff) throw new Error("The staff account was not found in this shop.");
      if (staff.role === "OWNER" || role === "OWNER") throw new Error("Owner access and owner role changes must be handled through the reviewed owner-security process.");
      if (branchId) {
        const branch = await admin.from("shop_branches").select("id").eq("id", branchId).eq("shop_sync_key", owner.shopId).eq("is_active", true).maybeSingle();
        if (branch.error || !branch.data) throw new Error("Choose an active branch from this shop.");
      }
      const { data: branchRow } = branchId
        ? await admin.from("shop_branches").select("name").eq("id", branchId).eq("shop_sync_key", owner.shopId).maybeSingle()
        : { data: null };
      const { error } = await admin.from("shop_users").update({
        role,
        assigned_branch_id: branchId,
        assigned_branch_name: text(branchRow?.name) || "All Branches",
        is_active: isActive,
        updated_at: Date.now()
      }).eq("shop_sync_key", owner.shopId).eq("user_id", userId);
      if (error) throw new Error("Could not update staff access: " + error.message);
      const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
      return json(200, { ok: true, shopUsage });
    }

    if (action === "transfer_create") {
      const id = text(body.id) || crypto.randomUUID();
      const productId = text(body.productId);
      const fromId = text(body.fromBranchId);
      const toId = text(body.toBranchId);
      const quantity = number(body.quantity);
      if (!productId || !fromId || !toId || fromId === toId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) {
        throw new Error("Choose a product, two different branches and a positive quantity.");
      }
      const { data: branches, error: branchError } = await admin.from("shop_branches")
        .select("id,name,is_active").eq("shop_sync_key", owner.shopId).in("id", [fromId,toId]);
      if (branchError || !branches || branches.length !== 2 || branches.some((b) => !b.is_active)) {
        throw new Error("Both source and destination branches must be active in this shop.");
      }
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
      const { data: existing, error: existingError } = await admin.from("shop_stock_transfers")
        .select("id,status").eq("id", id).eq("shop_sync_key", owner.shopId).maybeSingle();
      if (existingError) throw new Error("Could not validate the transfer command.");
      if (existing) return json(200, { ok: true, id, status: existing.status, reused: true });
      const now = Date.now();
      const { error } = await admin.from("shop_stock_transfers").insert({
        id, shop_sync_key: owner.shopId, shop_name: owner.shop.shop_name,
        transfer_number: transferNumber, product_id: productId, product_name: text(product.name),
        from_branch_id: fromId, from_branch_name: from.name,
        to_branch_id: toId, to_branch_name: to.name,
        quantity, unit: text(product.unit) || "pcs",
        cost_value_rwf: Math.max(0, Math.round(quantity * number(product.costPrice))),
        transfer_date: now, status: "REQUESTED",
        notes: text(body.notes).slice(0, 1000), transferred_by: owner.username,
        received_by: "", received_at: 0, synced: false,
        created_at: now, updated_at: now, hlc_timestamp: now, last_modified_device_id: "WEB"
      });
      if (error) throw new Error("Could not create the stock-transfer command: " + error.message);
      return json(200, { ok: true, id, transferNumber, status: "REQUESTED" });
    }

    if (action === "transfer_command") {
      const id = text(body.id);
      const command = text(body.command).toUpperCase();
      if (!id || !["RECEIPT","CANCEL"].includes(command)) throw new Error("A valid stock-transfer command is required.");
      const { data: current, error: readError } = await admin.from("shop_stock_transfers")
        .select("id,status,shop_sync_key").eq("id", id).eq("shop_sync_key", owner.shopId).maybeSingle();
      if (readError || !current) throw new Error("The stock transfer was not found in this shop.");
      if (current.status !== "IN_TRANSIT") throw new Error("A receipt or cancellation can only be requested while stock is in transit.");
      const now = Date.now();
      const next = command === "RECEIPT" ? "RECEIPT_REQUESTED" : "CANCEL_REQUESTED";
      const { error } = await admin.from("shop_stock_transfers").update({
        status: next, updated_at: now, hlc_timestamp: now, last_modified_device_id: "WEB"
      }).eq("id", id).eq("shop_sync_key", owner.shopId).eq("status", "IN_TRANSIT");
      if (error) throw new Error("Could not submit the transfer command: " + error.message);
      return json(200, { ok: true, status: next });
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
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), text(owner.user.id));
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
        is_active: true, monthly_fee_addon_rwf: 2000, last_synced_at: 0,
        created_at: now, updated_at: now
      }).select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_username,assigned_user_name,last_synced_at,created_at,updated_at,monthly_fee_addon_rwf").single();
      if (slotError || !slot) throw new Error("Could not create the secure device slot: " + (slotError?.message || "No row returned."));
      try {
        const invite = await issueDeviceInvitationV2(config, owner.shopId, newId, branch.id, actor.actorDeviceId, actor.ownerUser.user_id);
        const shopUsage = await refreshShopUsageSummaryV2(admin, owner.shopId);
        return json(200, { ok: true, ...slot, joinCode: invite.joinCode, expiresAt: invite.expiresAt, monthlyAddonRwf: 2000, shopUsage });
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
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), text(owner.user.id));
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
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), text(owner.user.id));
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
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), text(owner.user.id));
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
      const actor = await ownerManagementActorV2(admin, owner.shopId, text(body.actorDeviceId), text(owner.user.id));
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
