import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createPublicClient } from "./server/public-client";
import { ownerOtpPhoneBucketKey } from "./owner-otp-rate-limit";
import { calculateSubscriptionFee, computeShopKey, normalizePhoneLast9 } from "./pricing";
import { decodeShareToken, extractShopRecords, mergeShareJson, pickLatestDeviceChunkSet, type ShopRecords, verifyAndDecodeToken } from "./snapshot-analytics";

type OwnerAuthContext = {
  supabase: any;
  userId: string;
  claims: Record<string, unknown>;
  accessToken: string;
};

function ownerPhoneE164(value: string): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  const local = digits.length === 9 ? digits : digits.startsWith("250") && digits.length === 12 ? digits.slice(3) : digits.startsWith("0") && digits.length === 10 ? digits.slice(1) : "";
  if (!/^7\d{8}$/.test(local)) throw new Error("Enter the registered Rwanda mobile phone number.");
  return `+250${local}`;
}

function samePhone(left: string, right: string): boolean {
  return normalizePhoneLast9(left).length === 9 &&
    normalizePhoneLast9(left) === normalizePhoneLast9(right);
}

async function requireOwnerSession(context: OwnerAuthContext, username: string, phone: string): Promise<string> {
  const key = computeShopKey(username, phone);
  const { data: authData, error: authError } = await context.supabase.auth.getUser(context.accessToken);
  const user = authData?.user;
  if (authError || !user?.id || !user.phone_confirmed_at || !samePhone(String(user.phone ?? ""), phone)) {
    throw new Error("Verify the registered shop owner's phone by SMS before accessing My Shop.");
  }
  if (user.id !== context.userId) throw new Error("The authenticated account does not match this owner session.");

  const { data: membership, error: membershipError } = await context.supabase
    .from("shop_owner_memberships")
    .select("shop_id")
    .eq("shop_id", key)
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .eq("revoked_at", 0)
    .maybeSingle();
  if (membershipError || !membership || membership.shop_id !== key) {
    throw new Error("This verified phone is not enrolled as the owner of the requested shop.");
  }
  return key;
}

const ownerEnrollmentSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
});

/**
 * Sends an OTP only to the mobile number already stored on the registered shop.
 * Responses intentionally do not reveal whether the shop or username exists.
 */
export const requestMyShopOwnerOtp = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof ownerEnrollmentSchema>) => ownerEnrollmentSchema.parse(d))
  .handler(async ({ data }) => {
    const accepted = { accepted: true };
    const key = computeShopKey(data.username, data.phone);
    const phone = ownerPhoneE164(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shop, error: shopError } = await supabaseAdmin
      .from("shop_accounts")
      .select("id,owner_username,owner_phone")
      .eq("id", key)
      .maybeSingle();
    if (shopError || !shop ||
        String(shop.owner_username ?? "").trim().toLowerCase() !== data.username.trim().toLowerCase() ||
        !samePhone(String(shop.owner_phone ?? ""), phone)) {
      return accepted;
    }

    // Rate-limit the verified destination across all shop usernames. The
    // storage key is a one-way digest, never the raw phone number or username.
    const now = Date.now();
    const phoneBucket = await ownerOtpPhoneBucketKey(phone);
    const { data: attemptId, error: attemptError } = await supabaseAdmin.rpc("take_shop_owner_otp_slot", {
      p_shop_id: phoneBucket,
      p_now_ms: now,
      p_window_ms: 10 * 60 * 1000,
      p_max_attempts: 3,
    });
    if (attemptError) throw new Error("Owner verification is temporarily unavailable.");
    if (!attemptId) return accepted;
    const attempt = { id: String(attemptId) };

    try {
      const { data: existingUserId, error: lookupError } = await supabaseAdmin.rpc("find_auth_user_by_phone", {
        p_phone: phone,
      });
      if (lookupError) throw new Error("Could not prepare secure owner authentication.");
      if (!existingUserId) {
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          phone,
          phone_confirm: false,
          user_metadata: { account_type: "shop_owner" },
        });
        if (error || !created.user) {
          // Concurrent OTP requests may race to create the same phone account.
          // Re-read by exact phone and continue only when the winner now exists.
          const { data: concurrentUserId, error: retryLookupError } = await supabaseAdmin.rpc("find_auth_user_by_phone", {
            p_phone: phone,
          });
          if (retryLookupError || !concurrentUserId) {
            throw error ?? new Error("Could not initialize owner authentication.");
          }
        }
      }

      const { error: otpError } = await createPublicClient().auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false, channel: "sms" },
      });
      if (otpError) throw otpError;
      await supabaseAdmin.from("shop_owner_otp_attempts").update({ status: "SENT" }).eq("id", attempt.id);
    } catch (error) {
      await supabaseAdmin.from("shop_owner_otp_attempts").update({ status: "FAILED" }).eq("id", attempt.id);
      console.error("[My Shop owner OTP] Delivery failed", error);
      throw new Error("SMS verification could not be sent. Configure and test the Supabase phone/SMS provider before using My Shop.");
    }
    return accepted;
  });

export const claimMyShopOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ownerEnrollmentSchema>) => ownerEnrollmentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as OwnerAuthContext;
    const { data: authData, error: authError } = await ctx.supabase.auth.getUser(ctx.accessToken);
    const user = authData?.user;
    const phone = ownerPhoneE164(data.phone);
    if (authError || !user?.id || !user.phone_confirmed_at || !samePhone(String(user.phone ?? ""), phone)) {
      throw new Error("The SMS code has not verified the registered owner phone.");
    }

    const key = computeShopKey(data.username, data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shop, error: shopError } = await supabaseAdmin
      .from("shop_accounts")
      .select("id,owner_username,owner_phone")
      .eq("id", key)
      .maybeSingle();
    if (shopError || !shop ||
        String(shop.owner_username ?? "").trim().toLowerCase() !== data.username.trim().toLowerCase() ||
        !samePhone(String(shop.owner_phone ?? ""), phone)) {
      throw new Error("The verified account does not match a registered BeBoss shop owner.");
    }

    const { data: existingMembership, error: existingMembershipError } = await supabaseAdmin
      .from("shop_owner_memberships")
      .select("status,revoked_at")
      .eq("user_id", user.id)
      .eq("shop_id", shop.id)
      .maybeSingle();
    if (existingMembershipError) throw new Error("Could not validate the owner access record.");
    if (existingMembership && (existingMembership.status !== "ACTIVE" || Number(existingMembership.revoked_at) > 0)) {
      throw new Error("Owner access to this shop has been revoked. Contact BeBoss support for a reviewed restoration.");
    }

    const now = Date.now();
    let membershipError: { message: string } | null = null;
    if (existingMembership) {
      const result = await supabaseAdmin
        .from("shop_owner_memberships")
        .update({ last_verified_at: now })
        .eq("user_id", user.id)
        .eq("shop_id", shop.id)
        .eq("status", "ACTIVE")
        .eq("revoked_at", 0);
      membershipError = result.error;
    } else {
      const result = await supabaseAdmin.from("shop_owner_memberships").insert({
        user_id: user.id,
        shop_id: shop.id,
        owner_username: String(shop.owner_username),
        owner_phone: String(shop.owner_phone),
        status: "ACTIVE",
        last_verified_at: now,
        revoked_at: 0,
      });
      membershipError = result.error;
    }
    if (membershipError) throw new Error("Could not finish secure owner enrollment.");
    return { enrolled: true };
  });


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
    .filter("is_public", "eq", "true")
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof lookupSchema>) => lookupSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = await requireOwnerSession(context as unknown as OwnerAuthContext, data.username, data.phone);
    if (normalizePhoneLast9(data.phone).length < 9) throw new Error("Enter the full phone number registered in the app.");
    const sb = createPublicClient(key);
    const [shop, pays, codes, devices, news, snaps, branchRows, transferRows, staffRows] = await Promise.all([
      sb.from("shop_accounts").select("shop_name, owner_name, owner_username, business_type, branch_count, worker_count, device_count, device_limit, monthly_fee_rwf, subscription_status, subscription_expires_at, remote_kill_switch, updated_at").eq("id", key).maybeSingle(),
      sb.from("payment_requests").select("id, provider, amount_rwf, duration_months, payment_time_ms, payment_note, status, approval_mode, generated_unlock_code, rejection_reason, created_at, updated_at, gateway_provider, gateway_reference, gateway_transaction_id, gateway_amount_rwf, gateway_currency, gateway_verified_at").order("created_at", { ascending: false }).limit(20),
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
    const shareSecret = process.env["BEBOSS_DATASHARE_HMAC_SECRET"];
    if (snapRows.length > 0) {
      try {
        const set = pickLatestDeviceChunkSet(snapRows);
        if (set.length > 0) {
          snapshotUploadedAt = Math.max(...set.map((r) => Number(r.updated_at)));
          if (!shareSecret) {
            console.warn("BEBOSS_DATASHARE_HMAC_SECRET is not configured; skipping unverified snapshot decode for shop", key);
          } else {
            const parts = await Promise.all(set.map((r) => verifyAndDecodeToken(r.payload_token, shareSecret)));
            decodedRecords = extractShopRecords(mergeShareJson(parts));
          }
        }
      } catch (err) {
        console.warn("Could not decode verified snapshot for shop", key, err);
      }
    }

    return {
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
      staff: Array.from(
        new Map(
          (staffRows.data ?? []).map((staff) => [
            String(staff.username || staff.user_id).trim().toLowerCase(),
            staff,
          ]),
        ).values(),
      ),
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof addShopDeviceSchema>) => addShopDeviceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = await requireOwnerSession(context as unknown as OwnerAuthContext, data.username, data.phone);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof branchSchema>) => branchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = await requireOwnerSession(context as unknown as OwnerAuthContext, data.username, data.phone);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof branchIdSchema>) => branchIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = await requireOwnerSession(context as unknown as OwnerAuthContext, data.username, data.phone);
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
  transferNumber: z.string().trim().min(1).max(60),
  productId: z.string().trim().min(1).max(120),
  productName: z.string().trim().min(1).max(160),
  fromBranchId: z.string().trim().min(1).max(120),
  fromBranchName: z.string().trim().min(1).max(120),
  toBranchId: z.string().trim().min(1).max(120),
  toBranchName: z.string().trim().min(1).max(120),
  quantity: z.number().finite().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  costValueRwf: z.number().int().min(0).max(1_000_000_000).default(0),
  notes: z.string().trim().max(1000).default(""),
  transferredBy: z.string().trim().max(120).default("Shop Owner"),
});

export const upsertMyShopStockTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof transferSchema>) => transferSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = await requireOwnerSession(context as unknown as OwnerAuthContext, data.username, data.phone);
    if (data.fromBranchId === data.toBranchId) throw new Error("Source and destination branches must differ.");
    const sb = createPublicClient(key);
    const { data: existing, error: readError } = await sb
      .from("shop_stock_transfers")
      .select("id,status")
      .eq("id", data.id)
      .eq("shop_sync_key", key)
      .maybeSingle();
    if (readError) throw new Error("Could not verify the transfer request. Please retry.");
    if (existing) return { ok: true, id: data.id, status: existing.status, reused: true };

    const now = Date.now();
    const { error } = await sb.from("shop_stock_transfers").insert({
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
      status: "REQUESTED",
      notes: data.notes,
      transferred_by: data.transferredBy,
      received_by: "",
      received_at: 0,
      synced: false,
      created_at: now,
      updated_at: now,
      hlc_timestamp: now,
      last_modified_device_id: "WEB",
    });
    if (error) {
      // Concurrent duplicate submissions converge on the first immutable command ID.
      const { data: winner, error: raceReadError } = await sb
        .from("shop_stock_transfers")
        .select("id,status")
        .eq("id", data.id)
        .eq("shop_sync_key", key)
        .maybeSingle();
      if (!raceReadError && winner) return { ok: true, id: data.id, status: winner.status, reused: true };
      throw new Error("Could not queue the stock transfer request. Please retry.");
    }
    return { ok: true, id: data.id, status: "REQUESTED", requestPending: true };
  });

const confirmTransferSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  id: z.string().trim().min(1).max(120),
  receivedBy: z.string().trim().max(120).default("Shop Owner"),
});

export const confirmMyShopStockTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof confirmTransferSchema>) => confirmTransferSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = await requireOwnerSession(context as unknown as OwnerAuthContext, data.username, data.phone);
    const sb = createPublicClient(key);
    const now = Date.now();
    const { data: updated, error } = await sb
      .from("shop_stock_transfers")
      .update({
        status: "RECEIPT_REQUESTED",
        received_by: data.receivedBy,
        received_at: 0,
        updated_at: now,
        hlc_timestamp: now,
        last_modified_device_id: "WEB",
      })
      .eq("id", data.id)
      .eq("shop_sync_key", key)
      .eq("status", "IN_TRANSIT")
      .select("id,status")
      .maybeSingle();
    if (error) throw new Error("Could not request transfer receipt. Please retry.");
    if (updated) return { ok: true, id: data.id, status: updated.status, requestPending: true };

    const { data: current, error: readError } = await sb
      .from("shop_stock_transfers")
      .select("id,status")
      .eq("id", data.id)
      .eq("shop_sync_key", key)
      .maybeSingle();
    if (readError || !current) throw new Error("The transfer could not be found.");
    if (current.status === "RECEIPT_REQUESTED" || current.status === "COMPLETED") {
      return { ok: true, id: data.id, status: current.status, reused: true };
    }
    throw new Error("Only an in-transit transfer can be sent for receipt confirmation.");
  });

const cancelTransferSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  id: z.string().trim().min(1).max(120),
  actorName: z.string().trim().max(120).default("Shop Owner"),
  reason: z.string().trim().min(3).max(500),
});

export const requestMyShopStockTransferCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof cancelTransferSchema>) => cancelTransferSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = await requireOwnerSession(context as unknown as OwnerAuthContext, data.username, data.phone);
    const sb = createPublicClient(key);
    const now = Date.now();
    const { data: updated, error } = await sb
      .from("shop_stock_transfers")
      .update({
        status: "CANCEL_REQUESTED",
        received_by: data.actorName,
        received_at: 0,
        notes: data.reason,
        updated_at: now,
        hlc_timestamp: now,
        last_modified_device_id: "WEB",
      })
      .eq("id", data.id)
      .eq("shop_sync_key", key)
      .eq("status", "IN_TRANSIT")
      .select("id,status")
      .maybeSingle();
    if (error) throw new Error("Could not request transfer cancellation. Please retry.");
    if (updated) return { ok: true, id: data.id, status: updated.status, requestPending: true };

    const { data: current, error: readError } = await sb
      .from("shop_stock_transfers")
      .select("id,status")
      .eq("id", data.id)
      .eq("shop_sync_key", key)
      .maybeSingle();
    if (readError || !current) throw new Error("The transfer could not be found.");
    if (current.status === "CANCEL_REQUESTED" || current.status === "CANCELLED") {
      return { ok: true, id: data.id, status: current.status, reused: true };
    }
    throw new Error("Only an in-transit transfer can be cancelled.");
  });



const gatewayCheckoutSchema = z.object({
  gateway: z.enum(["flutterwave", "stripe"]),
  shopName: z.string().trim().min(2).max(120),
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  payerPhone: z.string().trim().min(9).max(30),
  payerName: z.string().trim().min(2).max(120),
  payerEmail: z.string().trim().email().max(254),
  months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  branches: z.number().int().min(1).max(100),
  workers: z.number().int().min(1).max(500),
  devices: z.number().int().min(1).max(100),
});

export const createGatewayCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof gatewayCheckoutSchema>) => gatewayCheckoutSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    await requireOwnerSession(ownerContext, data.username, data.phone);
    const supabaseUrl = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!supabaseUrl || !publishableKey) {
      throw new Error("The BeBoss online payment service is not configured.");
    }

    const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/create-payment-checkout`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${ownerContext.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true || typeof body?.checkoutUrl !== "string") {
      throw new Error(String(body?.message ?? "The payment provider could not start checkout."));
    }
    const checkoutUrl = new URL(body.checkoutUrl);
    if (checkoutUrl.protocol !== "https:" || !["checkout.flutterwave.com", "checkout.stripe.com"].includes(checkoutUrl.hostname)) {
      throw new Error("The payment provider returned an unsafe checkout destination.");
    }
    return {
      paymentRequestId: String(body.paymentRequestId),
      provider: String(body.provider),
      reference: String(body.reference),
      amountRwf: Number(body.amountRwf),
      currency: "RWF" as const,
      checkoutUrl: checkoutUrl.toString(),
    };
  });
