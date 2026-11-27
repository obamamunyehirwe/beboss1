import { createClient } from "npm:@supabase/supabase-js@2";
import { shopShareSignature, verifyAndDecodeToken } from "../../../src/lib/snapshot-analytics.ts";
import { isCompleteSnapshotGeneration, snapshotDeviceBaseId } from "../_shared/snapshot-generations.ts";
import {
  createDeviceToken,
  DEVICE_ACCESS_TTL_MS,
  DEVICE_REFRESH_TTL_MS,
  isDeviceToken,
  sha256Hex,
} from "../_shared/device-credentials.ts";

type Row = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Row) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function text(value: unknown): string {
  return value == null ? "" : String(value);
}
function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(-9);
}
function ownerPhoneE164(value: string): string {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 9 ? digits
    : digits.startsWith("250") && digits.length === 12 ? digits.slice(3)
    : digits.startsWith("0") && digits.length === 10 ? digits.slice(1)
    : "";
  if (!/^7\d{8}$/.test(local)) {
    throw new Error("Enter the Rwanda mobile number registered to this BeBoss shop.");
  }
  return "+250" + local;
}
function ownerKey(username: string, phone: string): string {
  const user = username.trim().toLowerCase();
  const digits = normalizePhone(phone);
  if (!/^[a-z0-9._-]{2,80}$/.test(user) || digits.length !== 9) {
    throw new Error("The registered shop identity is invalid.");
  }
  return user + "_" + digits;
}
function jwtAuthTime(req: Request): number {
  const header = req.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token.split(".")[1] || "";
  if (!payload) return 0;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(normalized)) as Row;
    const value = Number(claims.auth_time);
    return Number.isFinite(value) ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

async function verifyFreshOwner(
  req: Request,
  input: Row,
  url: string,
  publishableKey: string,
  admin: ReturnType<typeof createClient>
) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Sign in with the registered shop-owner phone first.");
  }
  const accessToken = authorization.slice(7);
  const authTime = jwtAuthTime(req);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!authTime || authTime > nowSeconds + 60 || nowSeconds - authTime > 15 * 60) {
    throw new Error("Verify the registered owner phone again before pairing this iPhone.");
  }
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: "Bearer " + accessToken } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
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
    .select("id,shop_name,owner_name,owner_username,owner_phone,remote_kill_switch")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError || !shop ||
      text(shop.owner_username).trim().toLowerCase() !== username ||
      normalizePhone(text(shop.owner_phone)) !== normalizePhone(phone)) {
    throw new Error("The verified phone and username do not match a registered BeBoss shop owner.");
  }
  if (shop.remote_kill_switch === true) {
    throw new Error("This shop has been disabled by BeBoss support.");
  }

  const { data: membership, error: membershipError } = await admin
    .from("shop_owner_memberships")
    .select("id,status,revoked_at")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw new Error("Could not validate shop-owner membership.");
  if (membership && (membership.status !== "ACTIVE" || Number(membership.revoked_at || 0) > 0)) {
    throw new Error("Owner access to this shop has been revoked.");
  }
  if (!membership) {
    const { error: insertError } = await admin.from("shop_owner_memberships").insert({
      shop_id: shopId,
      user_id: user.id,
      owner_username: username,
      owner_phone: text(shop.owner_phone),
      status: "ACTIVE",
      last_verified_at: Date.now(),
      revoked_at: 0,
    });
    if (insertError) {
      const { data: raced, error: raceError } = await admin
        .from("shop_owner_memberships")
        .select("id,status,revoked_at")
        .eq("shop_id", shopId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (raceError || !raced || raced.status !== "ACTIVE" || Number(raced.revoked_at || 0) > 0) {
        throw new Error("Could not finish secure shop-owner enrollment.");
      }
    }
  } else {
    await admin.from("shop_owner_memberships")
      .update({ last_verified_at: Date.now() })
      .eq("shop_id", shopId)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .eq("revoked_at", 0);
  }
  return { userId: user.id, shopId, shopName: text(shop.shop_name), ownerUsername: username };
}

async function enrollDevice(req: Request, body: Row, config: { url: string; publishableKey: string; serviceKey: string }, admin: ReturnType<typeof createClient>) {
  const owner = await verifyFreshOwner(req, body, config.url, config.publishableKey, admin);
  const deviceId = text(body.deviceId).trim();
  const deviceName = text(body.deviceName).trim();
  const joinCode = text(body.joinCode).trim().toUpperCase();
  if (!/^IOS:[0-9a-fA-F-]{36}$/.test(deviceId) ||
      !deviceName || deviceName.length > 120 ||
      !/^[A-Z0-9-]{8,100}$/.test(joinCode)) {
    throw new Error("The iPhone ID, device name or owner-issued join code is invalid.");
  }

  const codeHash = await sha256Hex(joinCode);
  const { data: device, error: redeemError } = await admin.rpc("redeem_ios_shop_device_invite", {
    p_shop_sync_key: owner.shopId,
    p_code_hash: codeHash,
    p_device_id: deviceId,
    p_device_name: deviceName,
    p_owner_user_id: owner.userId,
  });
  if (redeemError || !device || typeof device !== "object") {
    throw new Error("The owner-issued invitation is invalid, expired, revoked, or no longer assigned to an active device slot.");
  }
  const assignedUserId = text((device as Row).assignedUserId);
  const deviceRecordId = text((device as Row).deviceRecordId);
  const role = text((device as Row).role).toUpperCase();
  if (!assignedUserId || !deviceRecordId || !["OWNER", "MANAGER", "CASHIER"].includes(role)) {
    throw new Error("The enrolled iPhone has no valid assigned user or role.");
  }

  const accessToken = createDeviceToken();
  const refreshToken = createDeviceToken();
  const now = Date.now();
  const accessExpiresAt = now + DEVICE_ACCESS_TTL_MS;
  const refreshExpiresAt = now + DEVICE_REFRESH_TTL_MS;
  const { data: issued, error: issueError } = await admin.rpc("issue_android_device_credential", {
    p_shop_id: owner.shopId,
    p_device_id: deviceId,
    p_device_record_id: deviceRecordId,
    p_access_token_hash: await sha256Hex(accessToken),
    p_refresh_token_hash: await sha256Hex(refreshToken),
    p_access_expires_at: accessExpiresAt,
    p_refresh_expires_at: refreshExpiresAt,
  });
  if (issueError || !issued || (issued as Row).issued !== true) {
    throw new Error("The iPhone device credential could not be issued.");
  }
  return {
    ok: true,
    shopId: owner.shopId,
    shopName: owner.shopName,
    ownerUsername: owner.ownerUsername,
    deviceId,
    deviceRecordId,
    assignedUserId,
    role,
    branchId: text((device as Row).branchId),
    branchName: text((device as Row).branchName),
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
  };
}

async function refreshDevice(body: Row, admin: ReturnType<typeof createClient>) {
  const shopId = text(body.shopId).trim();
  const deviceId = text(body.deviceId).trim();
  const refreshToken = body.refreshToken;
  if (!shopId || shopId.length > 120 || !/^IOS:[0-9a-fA-F-]{36}$/.test(deviceId) || !isDeviceToken(refreshToken)) {
    throw new Error("The iPhone refresh credential is invalid. Re-enroll this terminal with its owner invitation.");
  }
  const accessToken = createDeviceToken();
  const nextRefreshToken = createDeviceToken();
  const now = Date.now();
  const accessExpiresAt = now + DEVICE_ACCESS_TTL_MS;
  const refreshExpiresAt = now + DEVICE_REFRESH_TTL_MS;
  const { data, error } = await admin.rpc("rotate_android_device_credential", {
    p_shop_id: shopId,
    p_device_id: deviceId,
    p_old_refresh_hash: await sha256Hex(refreshToken),
    p_new_access_token_hash: await sha256Hex(accessToken),
    p_new_refresh_token_hash: await sha256Hex(nextRefreshToken),
    p_access_expires_at: accessExpiresAt,
    p_refresh_expires_at: refreshExpiresAt,
  });
  if (error || data !== true) {
    throw new Error("The iPhone refresh credential is invalid, expired, or revoked.");
  }
  return { ok: true, shopId, deviceId, accessToken, refreshToken: nextRefreshToken, accessExpiresAt, refreshExpiresAt };
}

type IosDeviceContext = {
  shopId: string;
  shopName: string;
  ownerUsername: string;
  ownerPhone: string;
  deviceId: string;
  deviceRecordId: string;
  assignedUserId: string;
  role: "OWNER" | "MANAGER" | "CASHIER";
  branchId: string;
  branchName: string;
  actorName: string;
  publishableKey: string;
  serviceKey: string;
};
const SNAPSHOT_COLLECTIONS = [
  "products", "customers", "sales", "saleItems", "customerPayments",
  "purchases", "stockTransfers", "branches", "users"
] as const;
type SnapshotCollection = typeof SNAPSHOT_COLLECTIONS[number];
type Snapshot = Record<string, unknown> & {
  metadata: Row;
  shopProfile: Row;
  tombstones: Row[];
};

function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}
function arrayRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Row => !!row && typeof row === "object" && !Array.isArray(row));
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index++) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

async function authorizeIosDevice(
  req: Request,
  url: string,
  publishableKey: string
): Promise<IosDeviceContext> {
  const deviceId = text(req.headers.get("X-BeBoss-Device-ID")).trim();
  const accessToken = text(req.headers.get("X-BeBoss-Device-Token")).trim();
  if (!/^IOS:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(deviceId) ||
      !isDeviceToken(accessToken)) {
    throw new Error("A valid enrolled iPhone device credential is required.");
  }

  // PostgREST resolves this pair through current_shop_sync_key(). Invalid device
  // credentials resolve to an empty tenant and can never fall back to a caller key.
  const scoped = createClient(url, publishableKey, {
    global: { headers: { "X-BeBoss-Device-ID": deviceId, "X-BeBoss-Device-Token": accessToken } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const shopResult = await scoped.from("shop_accounts")
    .select("id,shop_name,owner_username,owner_phone,remote_kill_switch")
    .maybeSingle();
  const shop = shopResult.data as Row | null;
  if (shopResult.error || !shop || shop.remote_kill_switch === true) {
    throw new Error("The iPhone device is not authenticated for an active BeBoss shop.");
  }

  const deviceResult = await scoped.from("shop_devices")
    .select("id,device_id,assigned_user_id,role,branch_id,branch_name,is_active")
    .eq("device_id", deviceId)
    .eq("is_active", true)
    .maybeSingle();
  const device = deviceResult.data as Row | null;
  if (deviceResult.error || !device || text(device.device_id) !== deviceId) {
    throw new Error("This iPhone is not present in the active shop device registry.");
  }

  const assignedUserId = text(device.assigned_user_id).trim();
  const role = text(device.role).toUpperCase();
  if (!assignedUserId || !["OWNER", "MANAGER", "CASHIER"].includes(role)) {
    throw new Error("The iPhone is not assigned to an active shop staff account.");
  }
  const staffResult = await scoped.from("shop_users")
    .select("user_id,username,full_name,role,is_active,assigned_branch_id")
    .eq("user_id", assignedUserId)
    .maybeSingle();
  const staff = staffResult.data as Row | null;
  if (staffResult.error || !staff || staff.is_active !== true ||
      text(staff.user_id) !== assignedUserId || text(staff.role).toUpperCase() !== role) {
    throw new Error("The iPhone staff assignment is inactive or its role no longer matches.");
  }

  const branchId = text(device.branch_id).trim();
  const branchResult = branchId
    ? await scoped.from("shop_branches").select("id,name,is_active").eq("id", branchId).maybeSingle()
    : { data: null, error: null };
  if (branchResult.error || (branchId && (!branchResult.data || branchResult.data.is_active !== true))) {
    throw new Error("The iPhone's assigned branch is no longer active.");
  }

  return {
    shopId: text(shop.id),
    shopName: text(shop.shop_name),
    ownerUsername: text(shop.owner_username).trim().toLowerCase(),
    ownerPhone: text(shop.owner_phone),
    deviceId,
    deviceRecordId: text(device.id),
    assignedUserId,
    role: role as IosDeviceContext["role"],
    branchId,
    branchName: text(branchResult.data?.name || device.branch_name),
    actorName: text(staff.full_name || staff.username),
    publishableKey,
    serviceKey: ""
  };
}

async function getSnapshotSecrets(admin: any, shopId: string): Promise<{ shopSecret: string; legacySecret: string }> {
  const shopResult = await admin.from("shop_accounts")
    .select("lan_sync_secret,remote_kill_switch")
    .eq("id", shopId)
    .maybeSingle();
  const shopSecret = text(shopResult.data?.lan_sync_secret).trim().toLowerCase();
  if (shopResult.error || shopResult.data?.remote_kill_switch === true || !/^[a-f0-9]{64}$/.test(shopSecret)) {
    throw new Error("The shop has not provisioned its protected DataShare signing key. Connect the registered owner Android terminal to BeBoss Cloud and retry.");
  }

  let legacySecret = (Deno.env.get("BEBOSS_DATASHARE_HMAC_SECRET") || "").trim();
  if (!legacySecret) {
    const legacyResult = await admin.from("app_secrets")
      .select("value").eq("name", "BEBOSS_DATASHARE_HMAC_SECRET").maybeSingle();
    if (!legacyResult.error) legacySecret = text(legacyResult.data?.value).trim();
  }
  return { shopSecret, legacySecret };
}

function mergeSnapshotParts(parts: Row[]): Snapshot {
  const maps = Object.fromEntries(SNAPSHOT_COLLECTIONS.map(key => [key, new Map<string, Row>()])) as
    Record<SnapshotCollection, Map<string, Row>>;
  const tombstones = new Map<string, Row>();
  const tombstoneAliases: Partial<Record<SnapshotCollection, string>> = {
    saleItems: "sale_items",
    customerPayments: "customer_payments",
    stockTransfers: "stock_transfers"
  };
  let profile: Row = {};
  let metadata: Row = {};
  let exportedAt = 0;

  const version = (row: Row, fallback: number) =>
    number(row.hlcTimestamp) || number(row.updatedAt ?? row.saleDate ?? row.paymentDate ?? row.purchaseDate ?? row.timestamp ?? fallback);

  for (const part of parts) {
    const meta = part.metadata && typeof part.metadata === "object" ? part.metadata as Row : {};
    const fallback = number(meta.timestamp);
    exportedAt = Math.max(exportedAt, fallback);
    const candidateProfile = part.shopProfile && typeof part.shopProfile === "object" ? part.shopProfile as Row : {};
    if (Object.keys(candidateProfile).length &&
        (!Object.keys(profile).length || version(candidateProfile, fallback) >= version(profile, number(metadata.timestamp)))) {
      profile = candidateProfile;
    }
    if (fallback >= number(metadata.timestamp)) metadata = meta;

    for (const item of arrayRows(part.tombstones)) {
      const table = text(item.tableName || item.table_name);
      const id = text(item.recordId || item.record_id);
      if (!table || !id) continue;
      const key = table + ":" + id;
      const previous = tombstones.get(key);
      if (!previous || number(item.hlcTimestamp || item.deletedAt) >= number(previous.hlcTimestamp || previous.deletedAt)) {
        tombstones.set(key, item);
      }
    }
    for (const key of SNAPSHOT_COLLECTIONS) {
      for (const row of arrayRows(part[key])) {
        const id = text(row.id);
        if (!id) continue;
        const previous = maps[key].get(id);
        if (!previous || version(row, fallback) >= version(previous, fallback)) maps[key].set(id, row);
      }
    }
  }

  const live = (key: SnapshotCollection) => [...maps[key].values()].filter(row => {
    if (row.isDeleted === true) return false;
    const table = tombstoneAliases[key] || key;
    const tombstone = tombstones.get(table + ":" + text(row.id));
    if (!tombstone) return true;
    return version(row, exportedAt) > (number(tombstone.hlcTimestamp) || number(tombstone.deletedAt));
  });
  const sales = live("sales");
  const saleIds = new Set(sales.map(row => text(row.id)));
  return {
    metadata: { ...metadata, timestamp: exportedAt, schemaVersion: 3 },
    shopProfile: profile,
    products: live("products"),
    customers: live("customers"),
    sales,
    saleItems: live("saleItems").filter(row => saleIds.has(text(row.saleId))),
    customerPayments: live("customerPayments"),
    purchases: live("purchases"),
    stockTransfers: live("stockTransfers"),
    branches: live("branches"),
    users: live("users"),
    tombstones: [...tombstones.values()]
  };
}

function validateSnapshot(input: unknown, owner: IosDeviceContext): Snapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A complete iPhone shop snapshot is required.");
  }
  const source = input as Row;
  for (const key of SNAPSHOT_COLLECTIONS) {
    if (!Array.isArray(source[key])) throw new Error("The iPhone snapshot is missing the " + key + " collection.");
  }
  const shopProfile = source.shopProfile && typeof source.shopProfile === "object" ? source.shopProfile as Row : null;
  if (!shopProfile) throw new Error("The iPhone shop profile is missing.");
  if (text(shopProfile.username).trim().toLowerCase() !== owner.ownerUsername ||
      normalizePhone(text(shopProfile.phone)) !== normalizePhone(owner.ownerPhone)) {
    throw new Error("The local iPhone profile does not match the owner identity registered to this cloud shop.");
  }
  const limits: Record<SnapshotCollection, number> = {
    products: 100000, customers: 100000, sales: 500000, saleItems: 1000000,
    customerPayments: 500000, purchases: 500000, stockTransfers: 100000,
    branches: 5000, users: 5000
  };
  const result: Row = {
    metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : {},
    shopProfile,
    tombstones: arrayRows(source.tombstones)
  };
  if ((result.tombstones as Row[]).length > 250000) throw new Error("The iPhone tombstone collection exceeds the safe sync limit.");
  for (const key of SNAPSHOT_COLLECTIONS) {
    const rows = arrayRows(source[key]);
    if (rows.length > limits[key]) throw new Error("The iPhone " + key + " collection exceeds the safe sync limit.");
    result[key] = key === "users"
      ? rows.map(row => {
          const safe = { ...row };
          delete safe.pinHash;
          delete safe.passwordHash;
          delete safe.password;
          delete safe.credentialHash;
          return safe;
        })
      : rows;
  }
  const raw = new TextEncoder().encode(JSON.stringify(result));
  if (raw.byteLength > 5 * 1024 * 1024) {
    throw new Error("The complete shop snapshot exceeds the 5 MB raw cloud package limit. Reduce the export scope and retry.");
  }
  return result as Snapshot;
}

async function encodeIosSnapshotToken(snapshot: Snapshot, shopSecret: string): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(snapshot));
  if (raw.byteLength > 5 * 1024 * 1024) throw new Error("A snapshot chunk exceeds the safe 5 MB size limit.");
  const compressed = await new Response(
    new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"))
  ).arrayBuffer();
  const bytes = new Uint8Array(compressed);
  let binary = "";
  const stride = 0x8000;
  for (let start = 0; start < bytes.length; start += stride) {
    binary += String.fromCharCode(...bytes.subarray(start, Math.min(start + stride, bytes.length)));
  }
  const payload = btoa(binary);
  const signature = await shopShareSignature(payload, shopSecret);
  return "BBSHARE2:" + signature + ":" + payload;
}

function splitSnapshot(snapshot: Snapshot): Snapshot[] {
  const chunks: Snapshot[] = [];
  const makeEmpty = (): Snapshot => ({
    metadata: snapshot.metadata,
    shopProfile: snapshot.shopProfile,
    tombstones: [],
    products: [], customers: [], sales: [], saleItems: [],
    customerPayments: [], purchases: [], stockTransfers: [], branches: [], users: []
  });
  for (const key of SNAPSHOT_COLLECTIONS) {
    const rows = arrayRows(snapshot[key]);
    for (let start = 0; start < rows.length; start += 100) {
      const part = makeEmpty();
      part[key] = rows.slice(start, start + 100);
      chunks.push(part);
    }
  }
  const dead = arrayRows(snapshot.tombstones);
  for (let start = 0; start < dead.length; start += 100) {
    const part = makeEmpty();
    part.tombstones = dead.slice(start, start + 100);
    chunks.push(part);
  }
  if (!chunks.length) chunks.push(makeEmpty());
  if (chunks.length > 100000) throw new Error("The iPhone snapshot contains too many chunks to upload safely.");
  return chunks;
}

async function latestVerifiedShopSnapshot(
  admin: any,
  shopId: string,
  shopSecret: string,
  legacySecret: string
): Promise<{ snapshot: Snapshot | null; latestUpdatedAt: number; sourceDevices: string[]; verifiedChunks: number }> {
  const allRows: Row[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.from("branch_sync_snapshots")
      .select("id,device_id,branch_name,payload_token,updated_at,sync_generation,chunk_index,chunk_count,records_summary")
      .eq("shop_sync_key", shopId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Could not read the shop's cloud snapshot generations: " + error.message);
    const page = (data || []) as Row[];
    allRows.push(...page);
    if (page.length < pageSize) break;
    if (allRows.length >= 100000) throw new Error("The cloud has more than 100,000 retained snapshot chunks. Complete a cleanup sync before retrying.");
  }

  const groups = new Map<string, Row[]>();
  for (const row of allRows) {
    const device = snapshotDeviceBaseId(text(row.device_id));
    const generation = text(row.sync_generation) || "legacy";
    const key = device + "::" + generation;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  const newestByDevice = new Map<string, { updatedAt: number; rows: Row[] }>();
  for (const list of groups.values()) {
    if (!list.length) continue;
    const head = list[0];
    const complete = isCompleteSnapshotGeneration(list.map(row => ({
      chunkIndex: number(row.chunk_index),
      chunkCount: number(row.chunk_count) || 1
    })));
    if (!complete) continue;
    const device = snapshotDeviceBaseId(text(head.device_id));
    const candidate = { updatedAt: Math.max(...list.map(row => number(row.updated_at))), rows: list };
    const previous = newestByDevice.get(device);
    if (!previous || candidate.updatedAt > previous.updatedAt) newestByDevice.set(device, candidate);
  }

  const parts: Row[] = [];
  const sourceDevices: string[] = [];
  let verifiedChunks = 0;
  let latestUpdatedAt = 0;
  for (const [device, value] of newestByDevice.entries()) {
    const ordered = [...value.rows].sort((a, b) => number(a.chunk_index) - number(b.chunk_index));
    sourceDevices.push(device);
    latestUpdatedAt = Math.max(latestUpdatedAt, value.updatedAt);
    for (const row of ordered) {
      const decoded = await verifyAndDecodeToken(text(row.payload_token), legacySecret || undefined, shopSecret);
      parts.push(decoded);
      verifiedChunks++;
    }
  }
  return {
    snapshot: parts.length ? mergeSnapshotParts(parts) : null,
    latestUpdatedAt,
    sourceDevices,
    verifiedChunks
  };
}

async function handleIosSnapshotAction(
  action: string,
  req: Request,
  body: Row,
  config: { url: string; publishableKey: string; serviceKey: string },
  admin: any
): Promise<Row> {
  const device = await authorizeIosDevice(req, config.url, config.publishableKey);
  const secrets = await getSnapshotSecrets(admin, device.shopId);
  const cloud = await latestVerifiedShopSnapshot(admin, device.shopId, secrets.shopSecret, secrets.legacySecret);

  if (action === "sync_status") {
    return {
      ok: true,
      role: device.role,
      branchId: device.branchId,
      branchName: device.branchName,
      canUpload: true,
      latestUpdatedAt: cloud.latestUpdatedAt,
      snapshotCount: cloud.verifiedChunks,
      reason: cloud.snapshot
        ? "This iPhone is enrolled and can upload or download verified shop snapshots."
        : "This iPhone is enrolled. The cloud does not yet contain a complete verified shop snapshot."
    };
  }

  if (action === "sync_download") {
    return {
      ok: true,
      latestUpdatedAt: cloud.latestUpdatedAt,
      snapshots: cloud.snapshot ? [cloud.snapshot] : [],
      snapshotCount: cloud.verifiedChunks
    };
  }

  if (action !== "sync_upload") throw new Error("Unsupported iPhone snapshot operation.");
  const incoming = validateSnapshot(body.snapshot, device);
  const expectedUpdatedAt = Math.max(0, Math.floor(number(body.expectedUpdatedAt)));
  if (expectedUpdatedAt !== cloud.latestUpdatedAt) {
    return {
      ok: true,
      accepted: false,
      conflict: true,
      latestUpdatedAt: cloud.latestUpdatedAt,
      message: "A different shop device synchronized newer data. Download and merge the latest cloud data, then retry."
    };
  }

  const merged = mergeSnapshotParts([...(cloud.snapshot ? [cloud.snapshot] : []), incoming]);
  const timestamp = Date.now();
  merged.metadata = {
    ...merged.metadata,
    app: "BeBoss",
    version: "ios-1.0",
    schemaVersion: 3,
    format: "beboss_branch_datashare_v3",
    timestamp,
    issuedAt: timestamp,
    expiresAt: timestamp + 30 * 24 * 60 * 60 * 1000,
    nonce: crypto.randomUUID().replaceAll("-", ""),
    exportedBy: device.ownerUsername,
    exportedByRole: device.role,
    devicePlatform: "IOS"
  };
  for (const user of arrayRows(merged.users)) {
    delete user.pinHash;
    delete user.passwordHash;
    delete user.password;
  }

  const parts = splitSnapshot(merged);
  const generation = crypto.randomUUID();
  const now = Date.now();
  const branch = arrayRows(merged.branches).find(item => item.isMainBranch === true) || arrayRows(merged.branches)[0] || {};
  const summary = arrayRows(merged.branches).length + " branches • " +
    arrayRows(merged.products).length + " products • " +
    arrayRows(merged.sales).length + " sales • " +
    arrayRows(merged.customers).length + " customers";
  const rows: Row[] = [];
  for (let index = 0; index < parts.length; index++) {
    const token = await encodeIosSnapshotToken(parts[index], secrets.shopSecret);
    if (token.length > 4 * 1024 * 1024) {
      throw new Error("One signed iPhone snapshot chunk exceeds the 4 MB transport limit.");
    }
    rows.push({
      id: device.shopId + "::" + device.deviceId + "::" + generation + "::" + index,
      shop_sync_key: device.shopId,
      device_id: device.deviceId + "#c" + index,
      sync_generation: generation,
      chunk_index: index,
      chunk_count: parts.length,
      branch_id: text(branch.id) || device.branchId || "main_branch",
      branch_name: text(branch.name) || device.branchName || "Main Store",
      shop_name: device.shopName,
      owner_username: device.ownerUsername,
      payload_token: token,
      records_summary: summary.slice(0, 500),
      updated_at: now
    });
  }

  // An interrupted batch leaves an incomplete generation; all readers ignore it.
  // The final RPC validates every chunk and optimistic concurrency before pruning.
  const batchSize = 50;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const { error } = await admin.from("branch_sync_snapshots").insert(batch);
    if (error) throw new Error("The iPhone snapshot chunk upload failed: " + error.message);
  }

  const { data: committed, error: commitError } = await admin.rpc("commit_ios_snapshot_generation", {
    p_shop_sync_key: device.shopId,
    p_device_id: device.deviceId,
    p_device_record_id: device.deviceRecordId,
    p_assigned_user_id: device.assignedUserId,
    p_role: device.role,
    p_sync_generation: generation,
    p_expected_chunk_count: parts.length,
    p_expected_latest_updated_at: expectedUpdatedAt
  });
  if (commitError) throw new Error("The cloud could not commit the iPhone snapshot: " + commitError.message);
  const result = committed as Row;
  if (result?.accepted !== true) {
    return {
      ok: true,
      accepted: false,
      conflict: result?.conflict === true,
      latestUpdatedAt: number(result?.latestUpdatedAt) || cloud.latestUpdatedAt,
      message: result?.conflict === true
        ? "A different device committed newer data while this iPhone was uploading. Download and merge again."
        : "The uploaded snapshot generation was incomplete and has not replaced the last good cloud copy."
    };
  }
  return {
    ok: true,
    accepted: true,
    uploadedAt: number(result.uploadedAt) || now,
    latestUpdatedAt: number(result.latestUpdatedAt) || now,
    chunkCount: parts.length,
    sourceDevices: cloud.sourceDevices
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed." });
  try {
    const raw = await req.text();
    if (raw.length > 12 * 1024 * 1024) return json(413, { ok: false, message: "iPhone device-auth or snapshot request is too large." });
    const body = JSON.parse(raw) as Row;
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!url || !serviceKey || !publishableKey) {
      return json(503, { ok: false, message: "The BeBoss iPhone device-auth service is not configured." });
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (body.action === "enroll") {
      const result = await enrollDevice(req, body, { url, serviceKey, publishableKey }, admin);
      return json(200, result);
    }
    if (body.action === "refresh") {
      const result = await refreshDevice(body, admin);
      return json(200, result);
    }
    if (body.action === "sync_status" || body.action === "sync_download" || body.action === "sync_upload") {
      const rawBody = JSON.stringify(body);
      if (rawBody.length > 12 * 1024 * 1024) {
        return json(413, { ok: false, message: "The iPhone snapshot request exceeds the safe upload size." });
      }
      const result = await handleIosSnapshotAction(text(body.action), req, body, { url, serviceKey, publishableKey }, admin);
      return json(200, result);
    }
    return json(400, { ok: false, message: "Unsupported iPhone device-auth operation." });
  } catch (error) {
    console.error("[BeBoss iOS device-auth]", error instanceof Error ? error.message : "unknown error");
    return json(401, {
      ok: false,
      message: error instanceof Error ? error.message : "The iPhone device credential could not be issued."
    });
  }
});
