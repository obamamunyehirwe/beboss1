import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createPublicClient } from "./server/public-client";
import { calculateSubscriptionFee, computeShopKey, normalizePhoneLast9 } from "./pricing";
import { decodeShareToken, extractShopRecords, mergeShareJson, pickLatestDeviceChunkSet, type ShopRecords } from "./snapshot-analytics";

export const getPublicSite = createServerFn({ method: "GET" }).handler(async () => {
  const sb = createPublicClient();
  const [cfg, rel] = await Promise.all([
    sb.from("app_config").select("admin_whatsapp_number, mtn_momo_code, mtn_momo_phone, mtn_recipient_name, airtel_money_phone, airtel_recipient_name, per_device_fee_rwf, apk_version, support_email").eq("id", "global").maybeSingle(),
    sb.from("app_releases").select("id, version_name, version_code, file_name, size_bytes, sha256, min_android, release_notes, published_at, download_count").order("published_at", { ascending: false }).limit(8),
  ]);
  if (cfg.error) {
    console.error("[BeBoss public site] Could not load app_config from Supabase", cfg.error);
    throw new Error("BeBoss public configuration could not be loaded from the database.");
  }
  if (rel.error) {
    console.error("[BeBoss public site] Could not load app_releases from Supabase", rel.error);
    throw new Error("BeBoss release information could not be loaded from the database.");
  }

  const releases = rel.data ?? [];
  const { data: currentRow, error: currentError } = await sb
    .from("app_releases")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  if (currentError) {
    console.error("[BeBoss public site] Could not resolve the current release", currentError);
    throw new Error("The current BeBoss release could not be resolved from the database.");
  }
  const current = releases.find((r) => r.id === currentRow?.id) ?? null;
  return { config: cfg.data ?? null, current, releases };
});

const lookupSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
});

export const lookupMyShop = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof lookupSchema>) => lookupSchema.parse(d))
  .handler(async ({ data }) => {
    if (normalizePhoneLast9(data.phone).length < 9) throw new Error("Enter the full phone number registered in the app.");
    const key = computeShopKey(data.username, data.phone);
    const sb = createPublicClient(key);
    const [shop, pays, codes, devices, news, snaps, branchRows, transferRows, staffRows] = await Promise.all([
      sb.from("shop_accounts").select("shop_name, owner_name, owner_username, business_type, branch_count, worker_count, device_count, device_limit, monthly_fee_rwf, subscription_status, subscription_expires_at, remote_kill_switch, updated_at").eq("id", key).maybeSingle(),
      sb.from("payment_requests").select("id, provider, amount_rwf, duration_months, payment_time_ms, payment_note, status, approval_mode, generated_unlock_code, rejection_reason, created_at, updated_at").order("created_at", { ascending: false }).limit(20),
      sb.from("unlock_codes").select("unlock_code, tier_code, plan_days, status, issued_at, redeemed_at").order("issued_at", { ascending: false }).limit(20),
      sb.from("shop_devices").select("id, device_name, device_id, role, branch_name, branch_id, is_active, is_owner_primary, assigned_user_id, assigned_user_name, last_synced_at").eq("shop_sync_key", key).order("last_synced_at", { ascending: false }).limit(50),
      sb.from("announcements").select("*").in("audience", ["ALL", "APP"]).order("starts_at", { ascending: false }).limit(5),
      sb.from("branch_sync_snapshots").select("id, device_id, branch_name, records_summary, payload_token, updated_at, sync_generation, chunk_index, chunk_count").eq("shop_sync_key", key).order("updated_at", { ascending: false }).limit(20),
      sb.from("shop_branches").select("id, name, code, address, phone, manager_user_id, manager_name, is_main_branch, is_active, color_hex, daily_sales_target_rwf, monthly_target_rwf, opening_cash_float, stock_value_rwf, product_count, operational_status, email, notes, updated_at, hlc_timestamp").eq("shop_sync_key", key).eq("is_active", true).order("is_main_branch", { ascending: false }).limit(200),
      sb.from("shop_stock_transfers").select("id, transfer_number, product_name, from_branch_name, to_branch_name, quantity, unit, cost_value_rwf, transfer_date, status, transferred_by, received_by, received_at, updated_at").eq("shop_sync_key", key).order("updated_at", { ascending: false }).limit(500),
      sb.from("shop_users").select("user_id, full_name, username, role, assigned_branch_id, assigned_branch_name, is_active").eq("shop_sync_key", key).eq("is_active", true).order("full_name", { ascending: true }).limit(500),
    ]);

    let decodedRecords: ShopRecords | null = null;
    let snapshotUploadedAt = 0;
    const snapRows = snaps.data ?? [];
    if (snapRows.length > 0) {
      try {
        const set = pickLatestDeviceChunkSet(snapRows);
        if (set.length > 0) {
          snapshotUploadedAt = Math.max(...set.map((r) => Number(r.updated_at)));
          const parts = await Promise.all(set.map((r) => decodeShareToken(r.payload_token)));
          decodedRecords = extractShopRecords(mergeShareJson(parts));
        }
      } catch (err) {
        console.warn("Could not decode public snapshot for shop", key, err);
      }
    }

    return {
      shopKey: key,
      shop: shop.data ?? null,
      payments: pays.data ?? [],
      codes: codes.data ?? [],
      devices: devices.data ?? [],
      announcements: news.data ?? [],
      snapshots: snapRows.map((s) => ({
        id: s.id,
        branch_name: s.branch_name,
        device_id: s.device_id,
        records_summary: s.records_summary,
        updated_at: s.updated_at,
      })),
      records: decodedRecords,
      snapshotUploadedAt,
      branches: branchRows.data ?? [],
      stockTransfers: transferRows.data ?? [],
      staff: staffRows.data ?? [],
    };
  });



// ---------------------------------------------------------------------------
// Owner portal device registration. Uses the same cloud-authorized, single-use
// invite registry as Android. Plaintext codes are returned once and never stored.
// ---------------------------------------------------------------------------

const addShopDeviceSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  deviceName: z.string().trim().min(2).max(120),
  assignedUserId: z.string().trim().min(1).max(120),
  branchId: z.string().trim().min(1).max(120),
});

export const addMyShopDevice = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof addShopDeviceSchema>) => addShopDeviceSchema.parse(d))
  .handler(async ({ data }) => {
    const key = computeShopKey(data.username, data.phone);
    const sb = createPublicClient(key);
    const [shopResult, ownerResult, primaryResult, userResult, branchResult, devicesResult, usersResult, branchesResult, configResult] = await Promise.all([
      sb.from("shop_accounts").select("shop_name, device_count, device_limit, branch_count, worker_count, remote_kill_switch").eq("id", key).maybeSingle(),
      sb.from("shop_users").select("user_id, username, full_name, role, is_active").eq("shop_sync_key", key).eq("role", "OWNER").eq("is_active", true).maybeSingle(),
      sb.from("shop_devices").select("id, device_id, assigned_user_id, is_active").eq("shop_sync_key", key).eq("is_owner_primary", true).eq("is_active", true).maybeSingle(),
      sb.from("shop_users").select("user_id, username, full_name, role, assigned_branch_id, is_active").eq("shop_sync_key", key).eq("user_id", data.assignedUserId).eq("is_active", true).maybeSingle(),
      sb.from("shop_branches").select("id, name, code, is_active").eq("shop_sync_key", key).eq("id", data.branchId).eq("is_active", true).maybeSingle(),
      sb.from("shop_devices").select("id", { count: "exact", head: true }).eq("shop_sync_key", key).eq("is_active", true),
      sb.from("shop_users").select("user_id", { count: "exact", head: true }).eq("shop_sync_key", key).eq("is_active", true),
      sb.from("shop_branches").select("id", { count: "exact", head: true }).eq("shop_sync_key", key).eq("is_active", true),
      sb.from("app_config").select("per_device_fee_rwf").eq("id", "global").maybeSingle(),
    ]);

    if (shopResult.error || !shopResult.data) throw new Error("This shop account was not found in BeBoss Cloud.");
    if (shopResult.data.remote_kill_switch) throw new Error("This shop has been disabled by BeBoss support.");
    const owner = ownerResult.data;
    const primary = primaryResult.data;
    const assigned = userResult.data;
    const branch = branchResult.data;
    if (ownerResult.error || !owner || !primary?.device_id || primary.assigned_user_id !== owner.user_id) {
      throw new Error("Open the registered owner device while online and sync staff records before adding a device.");
    }
    if (userResult.error || !assigned || assigned.role === "OWNER") {
      throw new Error("Choose an active Manager or Cashier account already registered in this shop.");
    }
    if (branchResult.error || !branch) throw new Error("Choose an active branch synchronized from the BeBoss app.");
    if (assigned.assigned_branch_id !== branch.id) {
      throw new Error("The selected staff account must be assigned to the selected branch before pairing a terminal.");
    }

    const deviceId = crypto.randomUUID();
    const now = Date.now();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const joinCode = "BB-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(joinCode)));
    const codeHash = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");

    const feePerDevice = Math.max(0, Number(configResult.data?.per_device_fee_rwf) || 2000);
    const { data: slot, error: slotError } = await sb.from("shop_devices").insert({
      id: deviceId,
      shop_sync_key: key,
      shop_name: shopResult.data.shop_name,
      device_id: "",
      device_name: data.deviceName,
      join_code: "",
      assigned_user_id: assigned.user_id,
      assigned_username: assigned.username,
      assigned_user_name: assigned.full_name,
      role: assigned.role,
      branch_id: branch.id,
      branch_name: branch.name,
      is_owner_primary: false,
      is_active: true,
      monthly_fee_addon_rwf: feePerDevice,
      last_synced_at: 0,
      created_at: now,
      updated_at: now,
    }).select("id").single();

    if (slotError || !slot) throw new Error(slotError?.message || "Could not create the device slot in Supabase.");

    const expiresAt = now + 60 * 60 * 1000;
    const { error: inviteError } = await sb.rpc("issue_shop_device_invite", {
      p_shop_sync_key: key,
      p_device_record_id: slot.id,
      p_code_hash: codeHash,
      p_created_by_device_id: primary.device_id,
      p_created_by_user_id: owner.user_id,
      p_branch_id: branch.id,
      p_expires_at: expiresAt,
    });

    if (inviteError) {
      await sb.from("shop_devices").delete().eq("id", slot.id).eq("shop_sync_key", key);
      throw new Error(inviteError.message || "The cloud rejected this device invitation.");
    }

    const deviceCount = Math.max(1, Number(devicesResult.count) || Number(shopResult.data.device_count) || 1);
    const activeUsers = Math.max(1, Number(usersResult.count) || Number(shopResult.data.worker_count) || 1);
    const activeBranches = Math.max(1, Number(branchesResult.count) || Number(shopResult.data.branch_count) || 1);
    const monthlyFee = calculateSubscriptionFee(
      activeBranches,
      activeUsers,
      1,
      deviceCount + 1,
      feePerDevice,
    ).monthly;
    const { error: accountUpdateError } = await sb.from("shop_accounts").update({
      device_count: deviceCount + 1,
      device_limit: Math.max(Number(shopResult.data.device_limit) || 1, deviceCount + 1),
      monthly_fee_rwf: monthlyFee,
      updated_at: now,
    }).eq("id", key);

    if (accountUpdateError) {
      await sb.rpc("revoke_shop_device_invites", {
        p_shop_sync_key: key,
        p_device_record_id: slot.id,
        p_actor_device_id: primary.device_id,
        p_actor_user_id: owner.user_id,
      });
      await sb.from("shop_devices").delete().eq("id", slot.id).eq("shop_sync_key", key);
      throw new Error("The device was not registered because the shop subscription summary could not be updated.");
    }

    return { ok: true, id: slot.id, joinCode, expiresAt };
  });

const proofSchema = z.object({
  shopName: z.string().trim().min(2).max(120),
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  provider: z.enum(["MTN MoMo", "Airtel Money"]),
  payerPhone: z.string().trim().min(9).max(30),
  payerName: z.string().trim().min(2).max(120),
  paymentTimeMs: z.number().int().positive().optional(),
  paymentNote: z.string().trim().min(8, "Paste the successful MTN MoMo or Airtel Money confirmation SMS.").max(1000),
  months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  branches: z.number().int().min(1).max(100),
  workers: z.number().int().min(1).max(500),
  devices: z.number().int().min(1).max(100),
  ussd: z.string().max(80),
});

export const submitPaymentProof = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof proofSchema>) => proofSchema.parse(d))
  .handler(async ({ data }) => {
    const key = computeShopKey(data.username, data.phone);
    const sb = createPublicClient(key);
    const { data: config } = await sb
      .from("app_config")
      .select("per_device_fee_rwf")
      .eq("id", "global")
      .maybeSingle();
    const feePerDeviceRwf = Math.max(0, Number(config?.per_device_fee_rwf) || 2000);
    const amount = calculateSubscriptionFee(
      data.branches,
      data.workers,
      data.months,
      data.devices,
      feePerDeviceRwf,
    ).total;
    const now = Date.now();
    const { error } = await sb.from("payment_requests").insert({
      id: `WEB-${crypto.randomUUID()}`,
      shop_name: data.shopName,
      owner_username: data.username.toLowerCase(),
      owner_phone: data.phone,
      provider: data.provider,
      ussd_code: data.ussd,
      payer_phone: data.payerPhone,
      payer_full_name: data.payerName,
      amount_rwf: amount,
      duration_months: data.months,
      branch_count: data.branches,
      worker_count: data.workers,
      device_count: data.devices,
      fee_per_device_rwf: feePerDeviceRwf,
      payment_time_ms: Number(data.paymentTimeMs || now),
      payment_note: data.paymentNote.trim(),
      status: "PENDING_VERIFICATION",
      source: "WEB",
      created_at: now,
      updated_at: now,
    });
    if (error) {
      throw new Error("Could not submit your payment proof. Please try again.");
    }
    return { ok: true, amount };
  });

// ---------------------------------------------------------------------------
// Branch & stock-transfer management (owner portal, tenant-scoped via X-Shop-Sync-Key)
// Writes set a fresh HLC timestamp so the phone's HLC merge adopts the web edit.
// ---------------------------------------------------------------------------

const branchSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).default(""),
  address: z.string().trim().max(240).default(""),
  phoneBranch: z.string().trim().max(40).default(""),
  managerName: z.string().trim().max(120).default(""),
  isMainBranch: z.boolean().default(false),
  operationalStatus: z.enum(["OPEN", "CLOSED", "SUSPENDED"]).default("OPEN"),
  colorHex: z.string().trim().max(16).default("#FF6B1A"),
  dailySalesTargetRwf: z.number().int().min(0).max(1_000_000_000).default(0),
  monthlyTargetRwf: z.number().int().min(0).max(1_000_000_000).default(0),
  openingCashFloat: z.number().int().min(0).max(1_000_000_000).default(0),
  email: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(1000).default(""),
});

export const upsertMyShopBranch = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof branchSchema>) => branchSchema.parse(d))
  .handler(async ({ data }) => {
    const key = computeShopKey(data.username, data.phone);
    const sb = createPublicClient(key);
    const now = Date.now();
    const { error } = await sb.from("shop_branches").upsert(
      {
        id: data.id,
        shop_sync_key: key,
        name: data.name,
        code: data.code,
        address: data.address,
        phone: data.phoneBranch,
        manager_user_id: "",
        manager_name: data.managerName,
        is_main_branch: data.isMainBranch,
        is_active: true,
        color_hex: data.colorHex,
        daily_sales_target_rwf: data.dailySalesTargetRwf,
        monthly_target_rwf: data.monthlyTargetRwf,
        opening_cash_float: data.openingCashFloat,
        stock_value_rwf: 0,
        product_count: 0,
        operational_status: data.operationalStatus,
        email: data.email,
        notes: data.notes,
        created_at: now,
        updated_at: now,
        sync_version: 1,
        hlc_timestamp: now,
        last_modified_device_id: "WEB",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error("Could not save the branch. Please try again.");
    return { ok: true, id: data.id };
  });

const branchIdSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  id: z.string().trim().min(1).max(120),
});

export const deleteMyShopBranch = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof branchIdSchema>) => branchIdSchema.parse(d))
  .handler(async ({ data }) => {
    const key = computeShopKey(data.username, data.phone);
    const sb = createPublicClient(key);
    const now = Date.now();
    // RLS allows tenant update but not delete; soft-delete via is_active=false + fresh HLC.
    const { error } = await sb
      .from("shop_branches")
      .update({ is_active: false, updated_at: now, hlc_timestamp: now, last_modified_device_id: "WEB" })
      .eq("id", data.id)
      .eq("shop_sync_key", key);
    if (error) throw new Error("Could not delete the branch. Please try again.");
    return { ok: true };
  });

const transferSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  id: z.string().trim().min(1).max(120),
  transferNumber: z.string().trim().max(60).default(""),
  productId: z.string().trim().max(120).default(""),
  productName: z.string().trim().max(160).default(""),
  fromBranchId: z.string().trim().max(120).default(""),
  fromBranchName: z.string().trim().max(120).default(""),
  toBranchId: z.string().trim().max(120).default(""),
  toBranchName: z.string().trim().max(120).default(""),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().trim().max(20).default("pcs"),
  costValueRwf: z.number().int().min(0).max(1_000_000_000).default(0),
  notes: z.string().trim().max(1000).default(""),
  transferredBy: z.string().trim().max(120).default("Shop Owner"),
});

export const upsertMyShopStockTransfer = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof transferSchema>) => transferSchema.parse(d))
  .handler(async ({ data }) => {
    const key = computeShopKey(data.username, data.phone);
    const sb = createPublicClient(key);
    const now = Date.now();
    const { error } = await sb.from("shop_stock_transfers").upsert(
      {
        id: data.id,
        shop_sync_key: key,
        transfer_number: data.transferNumber,
        product_id: data.productId,
        product_name: data.productName,
        from_branch_id: data.fromBranchId,
        from_branch_name: data.fromBranchName,
        to_branch_id: data.toBranchId,
        to_branch_name: data.toBranchName,
        quantity: data.quantity,
        unit: data.unit,
        cost_value_rwf: data.costValueRwf,
        transfer_date: now,
        status: "IN_TRANSIT",
        notes: data.notes,
        transferred_by: data.transferredBy,
        received_by: "",
        received_at: 0,
        synced: false,
        created_at: now,
        updated_at: now,
        hlc_timestamp: now,
        last_modified_device_id: "WEB",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error("Could not save the stock transfer. Please try again.");
    return { ok: true, id: data.id };
  });

const confirmTransferSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  id: z.string().trim().min(1).max(120),
  receivedBy: z.string().trim().max(120).default("Shop Owner"),
});

export const confirmMyShopStockTransfer = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof confirmTransferSchema>) => confirmTransferSchema.parse(d))
  .handler(async ({ data }) => {
    const key = computeShopKey(data.username, data.phone);
    const sb = createPublicClient(key);
    const now = Date.now();
    const { error } = await sb
      .from("shop_stock_transfers")
      .update({ status: "COMPLETED", received_by: data.receivedBy, received_at: now, updated_at: now, hlc_timestamp: now, last_modified_device_id: "WEB" })
      .eq("id", data.id)
      .eq("shop_sync_key", key);
    if (error) throw new Error("Could not confirm the transfer. Please try again.");
    return { ok: true };
  });
