import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";
import {
  completeSnapshotRows,
  createDesktopSnapshotChunks,
  decodeDesktopShareToken,
  encodeDesktopShareToken,
  mergeDesktopSnapshotParts,
  type SnapshotDataset,
} from "../_shared/desktop-snapshot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_COLLECTION_RECORDS = 100_000;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function bearer(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
function text(value: unknown): string { return value == null ? "" : String(value); }
function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}
function validateDesktopId(value: string): boolean {
  return /^DESKTOP-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(value);
}

async function readSecret(admin: ReturnType<typeof createClient>, name: string): Promise<string> {
  const { data, error } = await admin.from("app_secrets").select("value").eq("name", name).limit(1).maybeSingle();
  if (error) throw new Error("BeBoss snapshot signing configuration is unavailable.");
  const secret = text(data?.value).trim();
  if (secret.length < 8) throw new Error("Snapshot signing key is not configured. Configure BEBOSS_DATASHARE_HMAC_SECRET in BeBoss Admin Settings before desktop sync.");
  return secret;
}

async function authorizeOwner(admin: ReturnType<typeof createClient>, accessToken: string, shopId: string) {
  if (!accessToken) throw new Response("Sign in with the registered shop owner phone first.", { status: 401 });
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const user = userData?.user;
  if (userError || !user?.id || !user.phone_confirmed_at) {
    throw new Response("A verified owner phone session is required.", { status: 401 });
  }
  const { data: membership, error: membershipError } = await admin
    .from("shop_owner_memberships")
    .select("shop_id, status, revoked_at")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .eq("status", "ACTIVE")
    .eq("revoked_at", 0)
    .maybeSingle();
  if (membershipError || !membership) {
    throw new Response("The signed-in account does not have an active owner membership for this shop.", { status: 403 });
  }
  const { data: shop, error: shopError } = await admin
    .from("shop_accounts")
    .select("id, shop_name, owner_username, remote_kill_switch, subscription_status, subscription_expires_at, branch_count, worker_count, device_count, device_limit, monthly_fee_rwf")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError || !shop) throw new Response("The registered BeBoss shop could not be found.", { status: 404 });
  if (shop.remote_kill_switch === true) throw new Response("This shop has been disabled by BeBoss support.", { status: 403 });
  return { user, shop };
}

function mergeIncomingSnapshot(
  remote: SnapshotDataset,
  submitted: SnapshotDataset,
): SnapshotDataset {
  const mergeCollection = (key: keyof SnapshotDataset): Record<string, unknown>[] => {
    const merged = new Map<string, Record<string, unknown>>();
    for (const row of rows(remote[key])) merged.set(text(row.id), row);
    for (const row of rows(submitted[key])) {
      const id = text(row.id);
      if (!id) continue;
      const previous = merged.get(id);
      const incomingVersion = Math.max(Number(row.hlcTimestamp) || 0, Number(row.updatedAt) || 0);
      const previousVersion = previous ? Math.max(Number(previous.hlcTimestamp) || 0, Number(previous.updatedAt) || 0) : -1;
      const incomingDevice = text(row.lastModifiedDeviceId);
      const previousDevice = text(previous?.lastModifiedDeviceId);
      if (!previous || incomingVersion > previousVersion ||
        (incomingVersion === previousVersion && incomingDevice.localeCompare(previousDevice) > 0)) {
        merged.set(id, row);
      }
    }
    return [...merged.values()];
  };

  const tombstones = new Map<string, Record<string, unknown>>();
  for (const row of [...rows(remote.tombstones), ...rows(submitted.tombstones)]) {
    const id = text(row.recordId);
    const previous = tombstones.get(id);
    if (id && (!previous || (Number(row.deletedAt) || 0) >= (Number(previous.deletedAt) || 0))) {
      tombstones.set(id, row);
    }
  }
  const deleted = new Map([...tombstones.values()].map((row) => [text(row.recordId), Number(row.deletedAt) || 0]));
  const live = (key: keyof SnapshotDataset) => mergeCollection(key).filter((row) => {
    const deletedAt = deleted.get(text(row.id));
    return deletedAt === undefined || Math.max(Number(row.hlcTimestamp) || 0, Number(row.updatedAt) || 0) > deletedAt;
  });
  const submittedTime = Number(submitted.metadata?.timestamp) || 0;
  const remoteTime = Number(remote.metadata?.timestamp) || 0;
  return {
    metadata: submittedTime >= remoteTime ? submitted.metadata : remote.metadata,
    shopProfile: submittedTime >= remoteTime ? submitted.shopProfile : remote.shopProfile,
    products: live("products"), customers: live("customers"), sales: live("sales"),
    saleItems: live("saleItems"), customerPayments: live("customerPayments"),
    purchases: live("purchases"), stockTransfers: live("stockTransfers"),
    branches: live("branches"), users: live("users"), tombstones: [...tombstones.values()],
  };
}

function validateDataset(input: unknown, shopId: string): SnapshotDataset {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Response("Invalid desktop snapshot.", { status: 400 });
  const source = input as Record<string, unknown>;
  const profile = source.shopProfile && typeof source.shopProfile === "object"
    ? source.shopProfile as Record<string, unknown> : {};
  // Android's Room ShopProfile uses a local numeric primary key (normally 1).
  // The authenticated shop ID is bound by owner membership and the snapshot row.
  if (!text(profile.shopName).trim()) {
    throw new Response("The desktop snapshot is missing its registered shop profile.", { status: 400 });
  }
  const result = {
    metadata: source.metadata && typeof source.metadata === "object" ? source.metadata as Record<string, unknown> : {},
    shopProfile: profile,
    products: rows(source.products),
    customers: rows(source.customers),
    sales: rows(source.sales),
    saleItems: rows(source.saleItems),
    customerPayments: rows(source.customerPayments),
    purchases: rows(source.purchases),
    stockTransfers: rows(source.stockTransfers),
    branches: rows(source.branches),
    users: rows(source.users),
    tombstones: rows(source.tombstones),
  };
  for (const key of ["products", "customers", "sales", "saleItems", "customerPayments", "purchases", "stockTransfers", "branches", "users"] as const) {
    if (result[key].length > MAX_COLLECTION_RECORDS) throw new Response("Desktop snapshot contains too many " + key + ".", { status: 413 });
  }
  for (const user of result.users) {
    if (text(user.password).trim() || text(user.pinHash).trim()) {
      throw new Response("Staff credentials must never be included in cloud snapshots.", { status: 400 });
    }
  }
  for (const item of [...result.products, ...result.customers, ...result.sales, ...result.branches, ...result.stockTransfers, ...result.users]) {
    if (!text(item.id).trim()) throw new Response("Every desktop record must have a stable ID.", { status: 400 });
  }
  return result;
}

function chunkMetadata(token: Record<string, unknown>) {
  const metadata = token._desktopMeta && typeof token._desktopMeta === "object"
    ? token._desktopMeta as Record<string, unknown> : {};
  return metadata;
}

async function syncNormalizedProjection(admin: ReturnType<typeof createClient>, shop: Record<string, unknown>, dataset: SnapshotDataset) {
  const shopId = text(shop.id);
  const branches = dataset.branches.map((branch) => ({
    id: text(branch.id), shop_sync_key: shopId, shop_name: text(shop.shop_name),
    name: text(branch.name), code: text(branch.code), address: text(branch.address), phone: text(branch.phone),
    manager_user_id: text(branch.managerUserId), manager_name: text(branch.managerName),
    is_main_branch: branch.isMainBranch === true, is_active: branch.isActive !== false,
    color_hex: text(branch.colorHex) || "#FF6B1A",
    daily_sales_target_rwf: Number(branch.dailySalesTargetRwf) || 0,
    monthly_target_rwf: Number(branch.monthlyTargetRwf) || 0,
    opening_cash_float: Number(branch.openingCashFloat) || 0,
    stock_value_rwf: 0, product_count: 0,
    operational_status: text(branch.operationalStatus) || "OPEN",
    email: text(branch.email), notes: text(branch.notes),
    created_at: Number(branch.createdAt) || Date.now(), updated_at: Number(branch.updatedAt) || Date.now(),
    sync_version: Number(branch.syncVersion) || 1, hlc_timestamp: Number(branch.hlcTimestamp) || Number(branch.updatedAt) || Date.now(),
    last_modified_device_id: "DESKTOP",
  }));
  if (branches.length) {
    const { error } = await admin.from("shop_branches").upsert(branches, { onConflict: "id" });
    if (error) throw new Error("Snapshot was signed but the branch projection failed: " + error.message);
  }

  const transfers = dataset.stockTransfers.map((transfer) => ({
    id: text(transfer.id), shop_sync_key: shopId, shop_name: text(shop.shop_name),
    transfer_number: text(transfer.transferNumber), product_id: text(transfer.productId),
    product_name: text(transfer.productName), from_branch_id: text(transfer.fromBranchId),
    from_branch_name: text(transfer.fromBranchName), to_branch_id: text(transfer.toBranchId),
    to_branch_name: text(transfer.toBranchName), quantity: Number(transfer.quantity) || 0,
    unit: text(transfer.unit) || "pcs", cost_value_rwf: Number(transfer.costValueRwf) || 0,
    transfer_date: Number(transfer.transferDate) || Date.now(), status: text(transfer.status) || "PENDING",
    notes: text(transfer.notes), transferred_by: text(transfer.transferredBy),
    received_by: text(transfer.receivedBy), received_at: Number(transfer.receivedAt) || 0,
    synced: false, created_at: Number(transfer.createdAt) || Date.now(),
    updated_at: Number(transfer.updatedAt) || Date.now(),
    hlc_timestamp: Number(transfer.hlcTimestamp) || Number(transfer.updatedAt) || Date.now(),
    last_modified_device_id: "DESKTOP",
  }));
  if (transfers.length) {
    const { error } = await admin.from("shop_stock_transfers").upsert(transfers, { onConflict: "id" });
    if (error) throw new Error("Snapshot was signed but the transfer projection failed: " + error.message);
  }

  const staff = dataset.users.map((user) => ({
    id: shopId + "::" + text(user.id),
    shop_sync_key: shopId,
    shop_name: text(shop.shop_name),
    user_id: text(user.id),
    full_name: text(user.name),
    username: text(user.username).trim().toLowerCase(),
    phone: text(user.phone),
    role: text(user.role),
    assigned_branch_id: text(user.assignedBranchId),
    assigned_branch_name: text(user.assignedBranchName),
    is_active: user.isActive !== false,
    updated_at: Number(user.updatedAt) || Date.now(),
  }));
  if (staff.length) {
    const { error } = await admin.from("shop_users").upsert(staff, { onConflict: "id" });
    if (error) throw new Error("Snapshot was signed but the staff projection failed: " + error.message);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) return json(413, { error: "Desktop sync request is too large." });

  try {
    const accessToken = bearer(request);
    if (!accessToken) return json(401, { error: "A verified shop owner session is required." });
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).length > MAX_REQUEST_BYTES) return json(413, { error: "Desktop sync request is too large." });
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    const action = text(body.action);
    const shopId = text(body.shopId).trim();
    const desktopId = text(body.desktopId).toUpperCase();
    if (!/^[a-z0-9._-]{2,160}$/i.test(shopId) || !validateDesktopId(desktopId)) {
      return json(400, { error: "Invalid BeBoss desktop shop or installation identity." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) return json(503, { error: "Desktop cloud sync is not configured." });
    const admin = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
    const { user, shop } = await authorizeOwner(admin, accessToken, shopId);
    const secret = await readSecret(admin, "BEBOSS_DATASHARE_HMAC_SECRET");

    if (action === "load") {
      const { data: snapshots, error: snapshotError } = await admin
        .from("branch_sync_snapshots")
        .select("id,device_id,sync_generation,chunk_index,chunk_count,branch_id,branch_name,shop_name,owner_username,payload_token,records_summary,updated_at")
        .eq("shop_sync_key", shopId)
        .order("updated_at", { ascending: false })
        .limit(10000);
      if (snapshotError) throw new Error("Could not load the shop snapshot index: " + snapshotError.message);
      const sets = completeSnapshotRows((snapshots ?? []) as Record<string, unknown>[]);
      const decodedParts: Record<string, unknown>[] = [];
      const failures: string[] = [];
      for (const set of sets) {
        for (const row of set) {
          try {
            decodedParts.push(await decodeDesktopShareToken(text(row.payload_token), secret));
          } catch (error) {
            failures.push(text(row.device_id) + ": " + (error instanceof Error ? error.message : "Invalid snapshot"));
          }
        }
      }
      if (failures.length) throw new Response("Some registered device snapshots failed integrity checks: " + failures.slice(0, 3).join("; "), { status: 409 });
      const dataset = mergeDesktopSnapshotParts(decodedParts);

      const [branchResult, transferResult, deviceResult, userResult] = await Promise.all([
        admin.from("shop_branches").select("*").eq("shop_sync_key", shopId).order("is_main_branch", { ascending: false }).limit(500),
        admin.from("shop_stock_transfers").select("*").eq("shop_sync_key", shopId).order("updated_at", { ascending: false }).limit(1000),
        admin.from("shop_devices").select("id,device_id,device_name,role,branch_id,branch_name,is_active,is_owner_primary,assigned_user_id,assigned_user_name,last_synced_at,updated_at").eq("shop_sync_key", shopId).order("updated_at", { ascending: false }).limit(250),
        admin.from("shop_users").select("id,user_id,username,full_name,role,assigned_branch_id,assigned_branch_name,is_active,updated_at").eq("shop_sync_key", shopId).order("updated_at", { ascending: false }).limit(1000),
      ]);
      if (branchResult.error || transferResult.error || deviceResult.error || userResult.error) {
        throw new Error("Could not load one of the normalized shop workspaces.");
      }
      if (branchResult.data?.length) {
        dataset.branches = branchResult.data.map((row) => ({
          id: row.id, name: row.name, code: row.code, address: row.address, phone: row.phone,
          managerUserId: row.manager_user_id, managerName: row.manager_name,
          isMainBranch: row.is_main_branch, isActive: row.is_active, colorHex: row.color_hex,
          dailySalesTargetRwf: row.daily_sales_target_rwf, monthlyTargetRwf: row.monthly_target_rwf,
          openingCashFloat: row.opening_cash_float, stockValueRwf: row.stock_value_rwf,
          productCount: row.product_count, operationalStatus: row.operational_status,
          email: row.email, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
          syncVersion: row.sync_version, hlcTimestamp: row.hlc_timestamp,
          lastModifiedDeviceId: row.last_modified_device_id,
        }));
      }
      if (transferResult.data?.length) {
        dataset.stockTransfers = transferResult.data.map((row) => ({
          id: row.id, transferNumber: row.transfer_number, productId: row.product_id,
          productName: row.product_name, fromBranchId: row.from_branch_id,
          fromBranchName: row.from_branch_name, toBranchId: row.to_branch_id,
          toBranchName: row.to_branch_name, quantity: row.quantity, unit: row.unit,
          costValueRwf: row.cost_value_rwf, transferDate: row.transfer_date, status: row.status,
          notes: row.notes, transferredBy: row.transferred_by, receivedBy: row.received_by,
          receivedAt: row.received_at, createdAt: row.created_at, updatedAt: row.updated_at,
          hlcTimestamp: row.hlc_timestamp, lastModifiedDeviceId: row.last_modified_device_id,
        }));
      }
      if (userResult.data?.length) {
        dataset.users = userResult.data.map((row) => ({
          id: row.user_id, name: row.full_name, username: row.username, phone: row.phone ?? "",
          role: row.role, assignedBranchId: row.assigned_branch_id,
          assignedBranchName: row.assigned_branch_name, isActive: row.is_active,
          updatedAt: row.updated_at, hlcTimestamp: row.updated_at, lastModifiedDeviceId: "CLOUD",
        }));
      }
      return json(200, {
        ok: true, shop, owner: { id: user.id, phone: user.phone, fullName: user.user_metadata?.full_name ?? "" },
        dataset, snapshots: { deviceCount: sets.length, lastUpdatedAt: Math.max(0, ...(snapshots ?? []).map((row) => Number(row.updated_at) || 0)) },
        branches: branchResult.data ?? [], stockTransfers: transferResult.data ?? [],
        devices: deviceResult.data ?? [], staff: userResult.data ?? [],
      });
    }

    if (action === "save") {
      const submitted = validateDataset(body.dataset, shopId);
      const now = Date.now();
      const { data: currentRows, error: currentError } = await admin
        .from("branch_sync_snapshots")
        .select("id,device_id,sync_generation,chunk_index,chunk_count,payload_token,updated_at")
        .eq("shop_sync_key", shopId)
        .order("updated_at", { ascending: false })
        .limit(10000);
      if (currentError) throw new Error("Could not verify the latest cloud revision before saving.");
      const currentSets = completeSnapshotRows((currentRows ?? []) as Record<string, unknown>[]);
      const currentParts: Record<string, unknown>[] = [];
      for (const set of currentSets) {
        for (const row of set) currentParts.push(await decodeDesktopShareToken(text(row.payload_token), secret));
      }
      const remote = mergeDesktopSnapshotParts(currentParts);
      const dataset = mergeIncomingSnapshot(remote, submitted);
      const normalizedChunks = createDesktopSnapshotChunks(dataset, now, desktopId, text(user.user_metadata?.full_name) || "Shop Owner");
      const count = normalizedChunks.length;
      const recordsSummary = dataset.branches.length + " branches • " + dataset.products.length + " items • " +
        dataset.sales.length + " sales • " + dataset.customers.length + " clients (" + count + " chunk(s))";
      const activeBranch = dataset.branches.find((branch) => branch.isMainBranch === true) ?? dataset.branches[0] ?? {};
      const ownerUsername = text(shop.owner_username).trim().toLowerCase();
      const rowsToWrite: Record<string, unknown>[] = [];
      for (let index = 0; index < normalizedChunks.length; index += 1) {
        const token = await encodeDesktopShareToken(normalizedChunks[index]!, secret);
        const deviceIdForChunk = index === 0 ? desktopId : desktopId + "#c" + index;
        const chunkPayload = chunkMetadata(normalizedChunks[index]!);
        rowsToWrite.push({
          id: shopId + "::" + deviceIdForChunk,
          shop_sync_key: shopId,
          device_id: deviceIdForChunk,
          sync_generation: text(chunkPayload.syncGeneration),
          chunk_index: index,
          chunk_count: count,
          branch_id: text(activeBranch.id),
          branch_name: text(activeBranch.name) || "Main Store",
          shop_name: text(shop.shop_name),
          owner_username: ownerUsername,
          payload_token: token,
          records_summary: recordsSummary,
          updated_at: now + index,
        });
      }

      const { error: saveError } = await admin.from("branch_sync_snapshots").upsert(rowsToWrite, { onConflict: "id" });
      if (saveError) throw new Error("Could not publish the desktop snapshot: " + saveError.message);

      const keep = new Set(rowsToWrite.map((row) => text(row.device_id)));
      const { data: oldRows, error: oldRowsError } = await admin.from("branch_sync_snapshots")
        .select("id,device_id").eq("shop_sync_key", shopId).like("device_id", desktopId + "%");
      if (oldRowsError) throw new Error("Desktop snapshot was published, but old chunk cleanup could not be verified.");
      const staleIds = (oldRows ?? []).filter((row) => !keep.has(text(row.device_id))).map((row) => text(row.id));
      if (staleIds.length) {
        const { error: cleanupError } = await admin.from("branch_sync_snapshots").delete().eq("shop_sync_key", shopId).in("id", staleIds);
        if (cleanupError) throw new Error("Desktop snapshot was published, but stale chunk cleanup failed.");
      }

      await syncNormalizedProjection(admin, shop, dataset);
      return json(200, { ok: true, deviceId: desktopId, chunks: count, records: recordsSummary, uploadedAt: now });
    }

    if (action === "device-pause") {
      const deviceRecordId = text(body.deviceRecordId).trim();
      if (!deviceRecordId) return json(400, { error: "A device record ID is required." });
      const { data: device, error: deviceError } = await admin.from("shop_devices")
        .select("id,device_id,is_active,is_owner_primary").eq("shop_sync_key", shopId).eq("id", deviceRecordId).maybeSingle();
      if (deviceError || !device) return json(404, { error: "The device record could not be found." });
      if (device.is_owner_primary) return json(409, { error: "The primary owner terminal cannot be paused from this desktop session." });
      const { error: pauseError } = await admin.from("shop_devices")
        .update({ is_active: false, updated_at: Date.now(), last_synced_at: 0 }).eq("shop_sync_key", shopId).eq("id", deviceRecordId);
      if (pauseError) return json(409, { error: "Could not pause this terminal: " + pauseError.message });
      return json(200, { ok: true, deviceRecordId });
    }

    return json(400, { error: "Unsupported desktop workspace action." });
  } catch (error) {
    if (error instanceof Response) return json(error.status, { error: await error.text() });
    console.error("[desktop-workspace] Request failed:", error instanceof Error ? error.message : "Unknown error");
    return json(500, { error: error instanceof Error ? error.message : "Desktop sync failed." });
  }
});
