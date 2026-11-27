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

/**
 * Establish the tenant boundary for owner-portal mutations and reads.
 * Authenticated owner membership is checked first with the caller's JWT. A fresh
 * per-request server client is then created with the verified shop context; callers
 * must still include explicit shop predicates on every table read/write.
 */
async function requireOwnerTenantAdmin(context: OwnerAuthContext, username: string, phone: string) {
  const key = await requireOwnerSession(context, username, phone);
  const { createShopAdminClient } = await import("@/lib/owner-tenant.server");
  const supabase = createShopAdminClient(key);
  const { data: shop, error } = await supabase
    .from("shop_accounts")
    .select("id,owner_username,owner_phone,owner_name")
    .eq("id", key)
    .maybeSingle();
  if (error || !shop ||
      String(shop.owner_username ?? "").trim().toLowerCase() !== username.trim().toLowerCase() ||
      normalizePhoneLast9(String(shop.owner_phone ?? "")) !== normalizePhoneLast9(phone)) {
    throw new Error("The verified owner account does not match this registered shop.");
  }
  return { key, supabase, ownerName: String(shop.owner_name ?? "").trim() || "Shop Owner" };
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
  .validator((d: z.infer<typeof ownerEnrollmentSchema>) => ownerEnrollmentSchema.parse(d))
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
  .validator((d: z.infer<typeof ownerEnrollmentSchema>) => ownerEnrollmentSchema.parse(d))
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
  const { data: currentRow, error: currentError } = await (sb as any)
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
  .validator((d: z.infer<typeof lookupSchema>) => lookupSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    const ownerUsername = data.username.trim().toLowerCase();
    const ownerPhone = ownerPhoneE164(data.phone);
    const ownerPhoneLast9 = normalizePhoneLast9(ownerPhone);
    if (ownerPhoneLast9.length !== 9) throw new Error("Enter the full phone number registered in the app.");

    // Owner membership is verified by the caller's JWT before the tenant client
    // is created. All result queries below are explicitly scoped to this shop.
    const { key, supabase: sb } = await requireOwnerTenantAdmin(ownerContext, data.username, data.phone);
    const shopResult = await sb
      .from("shop_accounts")
      .select("id,shop_name,owner_name,owner_username,owner_phone,business_type,branch_count,worker_count,device_count,device_limit,monthly_fee_rwf,subscription_status,subscription_expires_at,remote_kill_switch,updated_at,lan_sync_secret")
      .eq("id", key)
      .maybeSingle();
    if (shopResult.error || !shopResult.data ||
        String(shopResult.data.owner_username ?? "").trim().toLowerCase() !== ownerUsername ||
        normalizePhoneLast9(String(shopResult.data.owner_phone ?? "")) !== ownerPhoneLast9) {
      throw new Error("The verified owner account does not match this registered shop.");
    }
    const registeredShop = shopResult.data;
    const nowIso = new Date().toISOString();
    const [
      pays, codes, devices, globalNews, shopNews, snaps,
      branchRows, transferRows, staffRows, auditRows
    ] = await Promise.all([
      sb.from("payment_requests")
        .select("id,provider,amount_rwf,duration_months,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,rejection_reason,created_at,updated_at,gateway_provider,gateway_reference,gateway_transaction_id,gateway_amount_rwf,gateway_currency,gateway_verified_at")
        .eq("owner_username", String(registeredShop.owner_username))
        .eq("owner_phone", String(registeredShop.owner_phone))
        .order("created_at", { ascending: false }).limit(20),
      sb.from("unlock_codes")
        .select("unlock_code,tier_code,plan_days,status,issued_at,redeemed_at")
        .eq("shop_username", String(registeredShop.owner_username))
        .eq("shop_phone", String(registeredShop.owner_phone))
        .order("issued_at", { ascending: false }).limit(20),
      sb.from("shop_devices")
        .select("id,device_name,device_id,role,branch_name,branch_id,is_active,is_owner_primary,assigned_user_id,assigned_user_name,last_synced_at,monthly_fee_addon_rwf")
        .eq("shop_sync_key", key).order("last_synced_at", { ascending: false }).limit(50),
      sb.from("announcements").select("*")
        .eq("is_active", true).in("audience", ["ALL", "APP"])
        .eq("target_shop_key", "")
        .lte("starts_at", nowIso).or("ends_at.is.null,ends_at.gt." + nowIso)
        .order("starts_at", { ascending: false }).limit(5),
      sb.from("announcements").select("*")
        .eq("is_active", true).in("audience", ["ALL", "APP"])
        .eq("target_shop_key", key)
        .lte("starts_at", nowIso).or("ends_at.is.null,ends_at.gt." + nowIso)
        .order("starts_at", { ascending: false }).limit(5),
      sb.from("branch_sync_snapshots")
        .select("id,device_id,branch_name,records_summary,payload_token,updated_at,sync_generation,chunk_index,chunk_count")
        .eq("shop_sync_key", key).order("updated_at", { ascending: false }).limit(20),
      sb.from("shop_branches")
        .select("id,name,code,location_type,address,phone,manager_user_id,manager_name,is_main_branch,is_active,color_hex,daily_sales_target_rwf,monthly_target_rwf,opening_cash_float,stock_value_rwf,product_count,operational_status,email,notes,updated_at,hlc_timestamp")
        .eq("shop_sync_key", key).eq("is_active", true)
        .order("is_main_branch", { ascending: false }).limit(200),
      sb.from("shop_stock_transfers")
        .select("id,transfer_number,product_name,from_branch_name,to_branch_name,quantity,unit,cost_value_rwf,transfer_date,status,transferred_by,received_by,received_at,updated_at")
        .eq("shop_sync_key", key).order("updated_at", { ascending: false }).limit(500),
      sb.from("shop_users")
        .select("user_id,full_name,username,role,assigned_branch_id,assigned_branch_name,is_active")
        .eq("shop_sync_key", key).eq("is_active", true)
        .order("full_name", { ascending: true }).limit(500),
      sb.from("cloud_sync_events")
        .select("id,entity,action,actor,device_id,detail,created_at")
        .eq("shop_sync_key", key)
        .in("entity", ["FINANCE_LEDGER", "BRANCH", "STOCK_TRANSFER", "BRANCH_RECONCILIATION", "STAFF", "DEVICE", "APPROVAL_POLICY"])
        .order("created_at", { ascending: false }).limit(1000),
    ]);

    for (const result of [pays, codes, devices, globalNews, shopNews, snaps, branchRows, transferRows, staffRows, auditRows]) {
      if (result.error) throw new Error("Could not load the verified shop workspace. Please retry.");
    }

    let decodedRecords: ShopRecords | null = null;
    let snapshotUploadedAt = 0;
    const snapRows = snaps.data ?? [];
    // The per-shop HMAC key is fetched only server-side and is never returned.
    const shopShareSecret = String(registeredShop.lan_sync_secret ?? "").trim().toLowerCase();
    const legacyShareSecret = process.env["BEBOSS_DATASHARE_HMAC_SECRET"];
    if (snapRows.length > 0) {
      try {
        const set = pickLatestDeviceChunkSet(snapRows);
        if (set.length > 0) {
          snapshotUploadedAt = Math.max(...set.map((r) => Number(r.updated_at)));
          if (!shopShareSecret && !legacyShareSecret) {
            console.warn("No server-side snapshot verification key is configured for shop", key);
          } else {
            const parts = await Promise.all(set.map((r) =>
              verifyAndDecodeToken(r.payload_token, legacyShareSecret, shopShareSecret)
            ));
            decodedRecords = extractShopRecords(mergeShareJson(parts));
          }
        }
      } catch (err) {
        console.warn("Could not decode verified snapshot for shop", key, err);
      }
    }

    const { owner_phone: _ownerPhone, lan_sync_secret: _shopSecret, ...publicShop } = registeredShop;
    const announcements = [...(globalNews.data ?? []), ...(shopNews.data ?? [])]
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      .slice(0, 5);

    return {
      shop: publicShop,
      payments: pays.data ?? [],
      codes: codes.data ?? [],
      devices: devices.data ?? [],
      announcements,
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
      activity: auditRows.data ?? [],
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
  .validator((d: z.infer<typeof addShopDeviceSchema>) => addShopDeviceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    const { key, supabase: sb } = await requireOwnerTenantAdmin(ownerContext, data.username, data.phone);
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
  locationType: z.enum(["STORE", "WAREHOUSE"]).optional(),
  operationalStatus: z.enum(["OPEN", "PAUSED", "CLOSED", "SUSPENDED"])
    .transform((status) => status === "SUSPENDED" ? "PAUSED" : status)
    .default("OPEN"),
  colorHex: z.string().trim().max(16).default("#FF6B1A"),
  dailySalesTargetRwf: z.number().int().min(0).max(1_000_000_000).default(0),
  monthlyTargetRwf: z.number().int().min(0).max(1_000_000_000).default(0),
  openingCashFloat: z.number().int().min(0).max(1_000_000_000).default(0),
  email: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(1000).default(""),
});

export const upsertMyShopBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof branchSchema>) => branchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    const { key, supabase: sb } = await requireOwnerTenantAdmin(ownerContext, data.username, data.phone);
    const now = Date.now();
    const { data: existing, error: readError } = await sb
      .from("shop_branches")
      .select("id,shop_sync_key,created_at,location_type,name,code,address,phone,manager_name,is_main_branch,operational_status,daily_sales_target_rwf,monthly_target_rwf,opening_cash_float,email,notes")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error("Could not verify the branch identity. Please retry.");
    if (existing && existing.shop_sync_key !== key) {
      throw new Error("This branch identifier is already registered to another shop.");
    }
    const locationType = data.locationType ?? (existing?.location_type === "WAREHOUSE" ? "WAREHOUSE" : "STORE");
    if (!["STORE", "WAREHOUSE"].includes(locationType)) throw new Error("Choose STORE or WAREHOUSE as the location type.");
    if (locationType === "WAREHOUSE" && data.isMainBranch) {
      throw new Error("A warehouse cannot be the main retail/POS branch. Keep a STORE as the main branch.");
    }

    const branchPayload = {
      shop_sync_key: key,
      name: data.name,
      code: data.code,
      location_type: locationType,
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
      operational_status: data.operationalStatus,
      email: data.email,
      notes: data.notes,
      created_at: Number(existing?.created_at) || now,
      updated_at: now,
      sync_version: 1,
      hlc_timestamp: now,
      last_modified_device_id: "WEB",
    };
    const save = existing
      ? await sb.from("shop_branches").update(branchPayload).eq("id", data.id).eq("shop_sync_key", key)
      : await sb.from("shop_branches").insert({ id: data.id, ...branchPayload });
    if (save.error) throw new Error("Could not save the branch. Please try again.");

    if (data.isMainBranch) {
      const { error: mainBranchError } = await sb.from("shop_branches")
        .update({ is_main_branch: false, updated_at: now, hlc_timestamp: now, last_modified_device_id: "WEB" })
        .eq("shop_sync_key", key).eq("is_main_branch", true).neq("id", data.id);
      if (mainBranchError) throw new Error("The branch was saved, but the main-branch setting could not be synchronized.");
    }

    const { data: shop, error: shopError } = await sb.from("shop_accounts")
      .select("shop_name").eq("id", key).maybeSingle();
    if (shopError || !shop) throw new Error("The branch was saved, but the shop identity could not be verified for its audit event.");
    const auditEvents: Array<{ action: string; detail: string }> = [];
    if (!existing) {
      auditEvents.push({ action: "CREATED", detail: data.name + " · " + data.code + " · " + locationType });
    } else {
      if (String(existing.location_type ?? "STORE") !== locationType) {
        auditEvents.push({ action: "LOCATION_TYPE_CHANGED", detail: data.name + " · " + data.code + " · " + String(existing.location_type ?? "STORE") + " → " + locationType });
      }
      if (existing.is_main_branch !== data.isMainBranch) {
        auditEvents.push({ action: data.isMainBranch ? "MAIN_BRANCH_SET" : "MAIN_BRANCH_UNSET", detail: data.name + " · " + data.code });
      }
      if (String(existing.name ?? "") !== data.name || String(existing.code ?? "") !== data.code ||
          String(existing.address ?? "") !== data.address || String(existing.phone ?? "") !== data.phoneBranch ||
          String(existing.manager_name ?? "") !== data.managerName || String(existing.operational_status ?? "") !== data.operationalStatus ||
          Number(existing.daily_sales_target_rwf ?? 0) !== data.dailySalesTargetRwf ||
          Number(existing.monthly_target_rwf ?? 0) !== data.monthlyTargetRwf ||
          Number(existing.opening_cash_float ?? 0) !== data.openingCashFloat ||
          String(existing.email ?? "") !== data.email || String(existing.notes ?? "") !== data.notes) {
        auditEvents.push({ action: "PROFILE_UPDATED", detail: data.name + " · " + data.code + " · Branch profile, manager, contact, operating status or financial targets changed." });
      }
      if (auditEvents.length === 0) auditEvents.push({ action: "NO_CHANGE", detail: data.name + " · " + data.code + " · Owner portal save contained no field changes." });
    }
    const auditRows = auditEvents.map((event) => ({
      shop_sync_key: key,
      shop_name: String(shop.shop_name ?? ""),
      entity: "BRANCH",
      action: event.action,
      actor: "OWNER:" + data.username.trim().toLowerCase(),
      device_id: "WEB:OWNER_PORTAL",
      detail: event.detail,
    }));
    const { error: auditError } = await sb.from("cloud_sync_events").insert(auditRows);
    if (auditError) throw new Error("The branch was saved, but its required audit event could not be recorded. Refresh the branch and audit history before retrying.");
    return { ok: true, id: data.id, auditLogged: true };
  });

const branchIdSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  id: z.string().trim().min(1).max(120),
});

export const deleteMyShopBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof branchIdSchema>) => branchIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    const { key, supabase: sb } = await requireOwnerTenantAdmin(ownerContext, data.username, data.phone);
    const { data: branch, error: branchError } = await sb.from("shop_branches")
      .select("id,name,code,is_main_branch,is_active,operational_status,product_count,stock_value_rwf")
      .eq("id", data.id).eq("shop_sync_key", key).maybeSingle();
    if (branchError || !branch || !branch.is_active) throw new Error("The active branch could not be found in this shop.");
    if (branch.is_main_branch) throw new Error("The main branch cannot be deleted. Set another branch as main first.");

    const unresolvedTransferStatuses = ["REQUESTED", "PENDING", "IN_TRANSIT", "RECEIPT_REQUESTED", "CANCEL_REQUESTED"];
    const [devices, staff, outgoingTransfers, incomingTransfers] = await Promise.all([
      sb.from("shop_devices").select("id").eq("shop_sync_key", key).eq("branch_id", data.id).eq("is_active", true).limit(1),
      sb.from("shop_users").select("user_id").eq("shop_sync_key", key).eq("assigned_branch_id", data.id).eq("is_active", true).limit(1),
      sb.from("shop_stock_transfers").select("id,status").eq("shop_sync_key", key).eq("from_branch_id", data.id).in("status", unresolvedTransferStatuses).limit(1),
      sb.from("shop_stock_transfers").select("id,status").eq("shop_sync_key", key).eq("to_branch_id", data.id).in("status", unresolvedTransferStatuses).limit(1),
    ]);
    if (devices.error || staff.error || outgoingTransfers.error || incomingTransfers.error) {
      throw new Error("Could not verify the branch's active staff, devices and stock-transfer dependencies.");
    }
    if ((devices.data?.length ?? 0) > 0 || (staff.data?.length ?? 0) > 0) {
      throw new Error("Move active devices and staff to another branch before archiving this branch.");
    }
    if ((outgoingTransfers.data?.length ?? 0) > 0 || (incomingTransfers.data?.length ?? 0) > 0) {
      throw new Error("Complete or cancel all unresolved stock transfers involving this branch before archiving it.");
    }
    if (Number(branch.product_count ?? 0) > 0 || Number(branch.stock_value_rwf ?? 0) > 0) {
      throw new Error("Move or archive this branch's product inventory first. The latest cloud reconciliation still reports assigned products or stock value.");
    }

    const now = Date.now();
    const { error } = await sb.from("shop_branches")
      .update({ is_active: false, updated_at: now, hlc_timestamp: now, last_modified_device_id: "WEB" })
      .eq("id", data.id).eq("shop_sync_key", key).eq("is_main_branch", false);
    if (error) throw new Error("Could not delete the branch. Please try again.");
    const { data: shop, error: shopError } = await sb.from("shop_accounts").select("shop_name").eq("id", key).maybeSingle();
    if (shopError || !shop) throw new Error("The branch was deactivated, but its audit identity could not be verified.");
    const { error: auditError } = await sb.from("cloud_sync_events").insert({
      shop_sync_key: key,
      shop_name: String(shop.shop_name ?? ""),
      entity: "BRANCH",
      action: "DEACTIVATED",
      actor: "OWNER:" + data.username.trim().toLowerCase(),
      device_id: "WEB:OWNER_PORTAL",
      detail: String(branch.name ?? "") + " · " + String(branch.code ?? "") + " · " + String(branch.operational_status ?? "") + " → INACTIVE; active staff/devices, assigned product counts, stock value and unresolved transfers were checked.",
    });
    if (auditError) throw new Error("The branch was deactivated, but its required audit event could not be recorded. Refresh the branch and audit history before retrying.");
    return { ok: true, auditLogged: true };
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
  .validator((d: z.infer<typeof transferSchema>) => transferSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    const { key, supabase: sb, ownerName } = await requireOwnerTenantAdmin(ownerContext, data.username, data.phone);
    if (data.fromBranchId === data.toBranchId) throw new Error("Source and destination branches must differ.");
    const { data: activeBranches, error: branchError } = await sb.from("shop_branches")
      .select("id,name")
      .eq("shop_sync_key", key).eq("is_active", true)
      .in("id", [data.fromBranchId, data.toBranchId]);
    if (branchError || (activeBranches?.length ?? 0) !== 2) {
      throw new Error("Both transfer branches must be active branches in this shop.");
    }
    const sourceBranch = activeBranches.find((branch) => branch.id === data.fromBranchId);
    const targetBranch = activeBranches.find((branch) => branch.id === data.toBranchId);
    if (!sourceBranch || !targetBranch) throw new Error("The transfer branches could not be verified.");

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
      from_branch_name: sourceBranch.name,
      to_branch_id: data.toBranchId,
      to_branch_name: targetBranch.name,
      quantity: data.quantity,
      unit: data.unit,
      cost_value_rwf: data.costValueRwf,
      transfer_date: now,
      status: "REQUESTED",
      notes: data.notes,
      transferred_by: ownerName,
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
  .validator((d: z.infer<typeof confirmTransferSchema>) => confirmTransferSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    const { key, supabase: sb, ownerName } = await requireOwnerTenantAdmin(ownerContext, data.username, data.phone);
    const now = Date.now();
    const { data: updated, error } = await sb
      .from("shop_stock_transfers")
      .update({
        status: "RECEIPT_REQUESTED",
        received_by: ownerName,
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
  .validator((d: z.infer<typeof cancelTransferSchema>) => cancelTransferSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    const { key, supabase: sb, ownerName } = await requireOwnerTenantAdmin(ownerContext, data.username, data.phone);
    const now = Date.now();
    const { data: updated, error } = await sb
      .from("shop_stock_transfers")
      .update({
        status: "CANCEL_REQUESTED",
        received_by: ownerName,
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
  gateway: z.enum(["flutterwave", "stripe", "mtn_momo"]),
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
  .validator((d: z.infer<typeof gatewayCheckoutSchema>) => gatewayCheckoutSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    await requireOwnerSession(ownerContext, data.username, data.phone);
    const supabaseUrl = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!supabaseUrl || !publishableKey) {
      throw new Error("The BeBoss online payment service is not configured.");
    }

    const response = await fetch(new URL("/functions/v1/create-payment-checkout", supabaseUrl).toString(), {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${ownerContext.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true) {
      throw new Error(String(body?.message ?? "The payment provider could not start checkout."));
    }
    if (body.pending === true) {
      return {
        pending: true as const,
        paymentRequestId: String(body.paymentRequestId),
        provider: String(body.provider),
        reference: String(body.reference),
        amountRwf: Number(body.amountRwf),
        currency: "RWF" as const,
        status: String(body.status === null || body.status === undefined ? "PENDING" : body.status),
        message: String(body.message === null || body.message === undefined ? "Payment request is pending approval on the mobile wallet." : body.message),
      };
    }
    if (typeof body.checkoutUrl !== "string") throw new Error("The payment provider returned no checkout destination.");
    const checkoutUrl = new URL(body.checkoutUrl);
    if (checkoutUrl.protocol !== "https:" || !["checkout.flutterwave.com", "checkout.stripe.com"].includes(checkoutUrl.hostname)) {
      throw new Error("The payment provider returned an unsafe checkout destination.");
    }
    return {
      pending: false as const,
      paymentRequestId: String(body.paymentRequestId),
      provider: String(body.provider),
      reference: String(body.reference),
      amountRwf: Number(body.amountRwf),
      currency: "RWF" as const,
      checkoutUrl: checkoutUrl.toString(),
    };
  });


const gatewayPaymentStatusSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  paymentRequestId: z.string().trim().min(3).max(200),
});

export const checkGatewayPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof gatewayPaymentStatusSchema>) => gatewayPaymentStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    await requireOwnerSession(ownerContext, data.username, data.phone);
    const supabaseUrl = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!supabaseUrl || !publishableKey) throw new Error("The BeBoss online payment service is not configured.");

    const response = await fetch(new URL("/functions/v1/create-payment-checkout", supabaseUrl).toString(), {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${ownerContext.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "status", ...data }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true) {
      throw new Error(String(body?.message ?? "The MTN MoMo status could not be retrieved."));
    }
    return {
      pending: body.pending === true,
      verified: body.verified === true,
      status: String(body.status ?? "UNKNOWN"),
      message: String(body.message ?? "Payment status retrieved."),
    };
  });


/**
 * Public, read-only desktop release metadata. Only public BeBoss installers
 * and explicitly enabled archived versions are exposed to the download page.
 * Binary files remain in private Supabase storage and are delivered through
 * short-lived signed download URLs.
 */
export type PublicDesktopAsset = {
  id: string;
  platform: "windows" | "macos" | "linux";
  versionName: string;
  name: string;
  sizeBytes: number;
  downloadCount: number;
  sha256: string;
  publishedAt: string;
  releaseNotes: string;
};

export type PublicDesktopRelease = {
  published: boolean;
  unavailable: boolean;
  tagName: string | null;
  publishedAt: string | null;
  releaseUrl: string;
  assets: {
    windows: PublicDesktopAsset | null;
    macos: PublicDesktopAsset | null;
    linux: PublicDesktopAsset | null;
  };
  history: PublicDesktopAsset[];
};

const DESKTOP_RELEASE_PAGE = "/download?platform=desktop";
let desktopReleaseCache: { expiresAt: number; value: PublicDesktopRelease } | null = null;

export const getPublicDesktopRelease = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicDesktopRelease> => {
    if (desktopReleaseCache && desktopReleaseCache.expiresAt > Date.now()) {
      return desktopReleaseCache.value;
    }
    const empty: PublicDesktopRelease = {
      published: false,
      unavailable: false,
      tagName: null,
      publishedAt: null,
      releaseUrl: DESKTOP_RELEASE_PAGE,
      assets: { windows: null, macos: null, linux: null },
      history: [],
    };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("desktop_app_releases")
        .select("id,platform,version_name,file_name,size_bytes,sha256,download_count,published_at,release_notes,is_current")
        .eq("is_public", true)
        .order("published_at", { ascending: false })
        .limit(90);
      if (error) throw new Error(error.message);

      const assets: PublicDesktopRelease["assets"] = {
        windows: null,
        macos: null,
        linux: null,
      };
      const history: PublicDesktopAsset[] = [];
      for (const row of data ?? []) {
        if (row.platform !== "windows" && row.platform !== "macos" && row.platform !== "linux") continue;
        const asset: PublicDesktopAsset = {
          id: row.id,
          platform: row.platform,
          versionName: row.version_name,
          name: row.file_name,
          sizeBytes: Number(row.size_bytes) || 0,
          downloadCount: Number(row.download_count) || 0,
          sha256: row.sha256,
          publishedAt: row.published_at,
          releaseNotes: row.release_notes ?? "",
        };
        if (row.is_current && !assets[row.platform]) {
          assets[row.platform] = asset;
        } else if (!row.is_current) {
          history.push(asset);
        }
      }

      const newestCurrent = Object.values(assets)
        .filter((asset): asset is PublicDesktopAsset => Boolean(asset))
        .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime())[0];
      const value: PublicDesktopRelease = {
        published: Object.values(assets).some(Boolean),
        unavailable: false,
        tagName: newestCurrent?.versionName ?? null,
        publishedAt: newestCurrent?.publishedAt ?? null,
        releaseUrl: DESKTOP_RELEASE_PAGE,
        assets,
        history,
      };
      desktopReleaseCache = { expiresAt: Date.now() + 30_000, value };
      return value;
    } catch (error) {
      console.warn("[BeBoss desktop releases] Could not load local-build release metadata", error);
      return { ...empty, unavailable: true };
    }
  },
);

const publicDesktopDownloadSchema = z.object({
  id: z.string().uuid(),
});

export const createPublicDesktopDownload = createServerFn({ method: "POST" })
  .validator((d: z.infer<typeof publicDesktopDownloadSchema>) => publicDesktopDownloadSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: release, error: readError } = await supabaseAdmin
      .from("desktop_app_releases")
      .select("id,file_path,file_name")
      .eq("id", data.id)
      .eq("is_public", true)
      .maybeSingle();
    if (readError || !release) {
      throw new Error("This desktop installer is no longer publicly available. Refresh the page and choose an available version.");
    }

    const { data: signed, error: signingError } = await supabaseAdmin.storage
      .from("releases")
      .createSignedUrl(release.file_path, 10 * 60, { download: release.file_name });
    if (signingError || !signed?.signedUrl) {
      throw new Error(signingError?.message ?? "The installer download could not be prepared. Please try again.");
    }
    const { error: countError } = await supabaseAdmin.rpc("record_desktop_release_download", {
      p_release_id: release.id,
    });
    if (countError) {
      console.error("[BeBoss desktop downloads] Signed download link prepared, but the download counter could not be updated.", countError);
      throw new Error("The installer is available, but its download could not be recorded. Please try again.");
    }
    return { url: signed.signedUrl, expiresInSeconds: 600, fileName: release.file_name };
  });


const myShopFinancePostSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  entryId: z.string().uuid(),
  type: z.enum([
    "OPERATING_EXPENSE", "PAYROLL_PAYMENT", "SUPPLIER_SETTLEMENT",
    "TAX_PAYMENT", "OWNER_DRAW", "CASH_WITHDRAWAL",
    "CAPITAL_CONTRIBUTION", "BANK_DEPOSIT"
  ]),
  amountRwf: z.number().int().positive().max(10_000_000_000),
  account: z.enum(["CASH", "BANK", "MOBILE_MONEY", "OTHER"]).optional().default("CASH"),
  sourceAccount: z.enum(["CASH", "MOBILE_MONEY", "OTHER"]).optional(),
  destinationAccount: z.literal("BANK").optional(),
  branchId: z.string().trim().max(120).default(""),
  effectiveAt: z.number().int().min(Date.UTC(2000, 0, 1)),
  counterparty: z.string().trim().max(100).default(""),
  reference: z.string().trim().max(48).default(""),
  note: z.string().trim().max(240).default(""),
});

export const postMyShopFinanceEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof myShopFinancePostSchema>) => myShopFinancePostSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    const { key, supabase: sb } = await requireOwnerTenantAdmin(ownerContext, data.username, data.phone);
    const ownerUsername = data.username.trim().toLowerCase();
    if (data.effectiveAt > Date.now() + 5 * 60 * 1000) {
      throw new Error("Choose a transaction date no later than the current date.");
    }
    let branchName = "All branches";
    if (data.branchId) {
      const { data: branch, error } = await sb.from("shop_branches")
        .select("id,name,is_active").eq("shop_sync_key", key).eq("id", data.branchId).maybeSingle();
      if (error || !branch || branch.is_active !== true) {
        throw new Error("Choose an active branch belonging to this shop, or select All branches.");
      }
      branchName = String(branch.name ?? "");
    }
    const flow = data.type === "CAPITAL_CONTRIBUTION" ? "INFLOW"
      : data.type === "BANK_DEPOSIT" ? "TRANSFER" : "OUTFLOW";
    if (flow === "TRANSFER" && (!data.sourceAccount || data.destinationAccount !== "BANK")) {
      throw new Error("A bank deposit must move funds from Cash, Mobile Money or Other into the Bank account.");
    }
    const entry = {
      version: 1,
      entryId: data.entryId,
      type: data.type,
      flow,
      amountRwf: data.amountRwf,
      account: flow === "TRANSFER" ? "" : data.account,
      sourceAccount: flow === "TRANSFER" ? data.sourceAccount : "",
      destinationAccount: flow === "TRANSFER" ? "BANK" : "",
      branchId: data.branchId,
      branchName,
      effectiveAt: data.effectiveAt,
      counterparty: data.counterparty,
      reference: data.reference,
      note: data.note,
      postedAt: Date.now(),
      actorUsername: ownerUsername,
      actorDeviceId: "WEB:OWNER_PORTAL"
    };
    const duplicate = await sb.from("cloud_sync_events").select("detail")
      .eq("shop_sync_key", key).eq("entity", "FINANCE_LEDGER").eq("action", "POSTED")
      .like("detail", '%"entryId":"' + data.entryId + '"%').limit(1).maybeSingle();
    if (duplicate.error) throw new Error("Could not check the financial journal before posting.");
    if (duplicate.data?.detail) {
      try {
        const prior = JSON.parse(String(duplicate.data.detail));
        if (prior?.version === 1 && prior.entryId === data.entryId) return { ok: true, entry: prior, reused: true };
      } catch { /* Invalid legacy details cannot satisfy the versioned idempotency check. */ }
    }
    const detail = JSON.stringify(entry);
    const { data: shop, error: shopError } = await sb.from("shop_accounts")
      .select("shop_name").eq("id", key).maybeSingle();
    if (shopError || !shop) throw new Error("Could not verify the shop before posting this financial entry.");
    const { data: inserted, error } = await sb.from("cloud_sync_events").insert({
      shop_sync_key: key,
      shop_name: String(shop.shop_name ?? ""),
      entity: "FINANCE_LEDGER",
      action: "POSTED",
      actor: "OWNER:" + ownerUsername,
      device_id: "WEB:OWNER_PORTAL",
      detail
    }).select("id,created_at").single();
    if (error || !inserted) {
      console.error("[My Shop finance] Financial entry could not be posted", error);
      throw new Error("The financial entry could not be saved to the shop cloud journal. Nothing was reported as posted; retry after refreshing.");
    }
    return { ok: true, entry, eventId: inserted.id, createdAt: inserted.created_at };
  });

const myShopFinanceReverseSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  reversalEntryId: z.string().uuid(),
  originalEntryId: z.string().uuid(),
  reason: z.string().trim().min(8).max(300),
});

export const reverseMyShopFinanceEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof myShopFinanceReverseSchema>) => myShopFinanceReverseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ownerContext = context as unknown as OwnerAuthContext;
    const { key, supabase: sb } = await requireOwnerTenantAdmin(ownerContext, data.username, data.phone);
    const ownerUsername = data.username.trim().toLowerCase();
    const originalResult = await sb.from("cloud_sync_events").select("detail")
      .eq("shop_sync_key", key).eq("entity", "FINANCE_LEDGER").eq("action", "POSTED")
      .like("detail", '%"entryId":"' + data.originalEntryId + '"%').limit(1).maybeSingle();
    if (originalResult.error || !originalResult.data?.detail) {
      throw new Error("The original posted financial entry could not be found.");
    }
    let original: Record<string, unknown>;
    try { original = JSON.parse(String(originalResult.data.detail)); }
    catch { throw new Error("The original financial entry cannot be verified."); }
    if (original.version !== 1 || original.entryId !== data.originalEntryId || original.type === "REVERSAL") {
      throw new Error("Only a valid original posted financial entry can be reversed.");
    }
    const previous = await sb.from("cloud_sync_events").select("detail")
      .eq("shop_sync_key", key).eq("entity", "FINANCE_LEDGER").eq("action", "REVERSED")
      .like("detail", '%"reversalOf":"' + data.originalEntryId + '"%').limit(1).maybeSingle();
    if (previous.error) throw new Error("Could not verify earlier reversals.");
    if (previous.data?.detail) {
      try {
        const prior = JSON.parse(String(previous.data.detail));
        if (prior?.version === 1 && prior.reversalOf === data.originalEntryId) {
          return { ok: true, entry: prior, reused: true };
        }
      } catch { /* Invalid legacy details cannot confirm a reversal. */ }
    }
    const oldFlow = String(original.flow ?? "").toUpperCase();
    const reversal = {
      version: 1,
      entryId: data.reversalEntryId,
      type: "REVERSAL",
      originalType: String(original.type ?? ""),
      reversalOf: data.originalEntryId,
      flow: oldFlow === "OUTFLOW" ? "INFLOW" : oldFlow === "INFLOW" ? "OUTFLOW" : "TRANSFER",
      amountRwf: Number(original.amountRwf) || 0,
      account: String(original.account ?? ""),
      sourceAccount: String(original.destinationAccount ?? ""),
      destinationAccount: String(original.sourceAccount ?? ""),
      branchId: String(original.branchId ?? ""),
      branchName: String(original.branchName ?? ""),
      effectiveAt: Date.now(),
      counterparty: String(original.counterparty ?? ""),
      reference: String(original.reference ?? ""),
      note: data.reason,
      postedAt: Date.now(),
      actorUsername: ownerUsername,
      actorDeviceId: "WEB:OWNER_PORTAL"
    };
    const { data: shop, error: shopError } = await sb.from("shop_accounts")
      .select("shop_name").eq("id", key).maybeSingle();
    if (shopError || !shop) throw new Error("Could not verify the shop before reversing this financial entry.");
    const { data: inserted, error } = await sb.from("cloud_sync_events").insert({
      shop_sync_key: key,
      shop_name: String(shop.shop_name ?? ""),
      entity: "FINANCE_LEDGER",
      action: "REVERSED",
      actor: "OWNER:" + ownerUsername,
      device_id: "WEB:OWNER_PORTAL",
      detail: JSON.stringify(reversal)
    }).select("id,created_at").single();
    if (error || !inserted) throw new Error("The financial reversal could not be saved. The original entry remains unchanged.");
    return { ok: true, entry: reversal, eventId: inserted.id, createdAt: inserted.created_at };
  });
