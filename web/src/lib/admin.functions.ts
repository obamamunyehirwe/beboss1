import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateSubscriptionFee, computeShopKey, extendExpiry, DAY_MS, TRIAL_DAYS } from "./pricing";

type Ctx = { supabase: any; userId: string; claims: any };

async function requireAdmin(context: Ctx, allowSupport = false) {
  const fn = allowSupport ? "is_beboss_staff" : "is_beboss_admin";
  const { data, error } = await context.supabase.rpc(fn);
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: master admin access required.");
  const email = String(context.claims?.email ?? "admin");
  return { email, label: `BeBoss Admin (${email})` };
}

async function audit(context: Ctx, email: string, action: string, target: string, details: string) {
  await context.supabase.from("admin_audit_logs").insert({
    id: crypto.randomUUID(),
    admin_email: email,
    action,
    target_id: target,
    details,
    created_at: Date.now(),
  });
}

type Bb3Input = { username: string; phone: string; tier: string; days: number };

async function loadBb3PrivateKeyPem(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_secrets")
    .select("value")
    .eq("name", "BEBOSS_UNLOCK_ECDSA_PRIVATE_KEY_PEM")
    .maybeSingle();
  if (error) throw new Error("Could not load the server-only BB3 signing key.");
  const pem = String(data?.value ?? "").trim();
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----") || !pem.includes("-----END PRIVATE KEY-----")) {
    throw new Error("The server-only BB3 signing key is missing. Provision the P-256 private key in Supabase app_secrets.");
  }
  const { createPrivateKey } = await import("node:crypto");
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("The BB3 server signing key must be an ECDSA P-256 private key.");
  }
  return pem;
}

async function generateBB3UnlockCode(input: Bb3Input): Promise<string> {
  const username = input.username.trim();
  const normalizedPhone = input.phone.trim().replace(/\\D/g, "").slice(-9);
  const tier = input.tier.trim().toUpperCase();
  const days = Math.floor(input.days);
  if (!username || normalizedPhone.length !== 9) throw new Error("A shop username and registered phone are required.");
  if (!["SINGLE", "DUAL", "MULTI", "ANNUAL", "TRIAL"].includes(tier) || days < 1 || days > 800) {
    throw new Error("The requested BB3 subscription tier or duration is invalid.");
  }

  const pem = await loadBb3PrivateKeyPem();
  const { createPrivateKey, createSign, createHash, randomBytes } = await import("node:crypto");
  const accountHash = createHash("sha256")
    .update(`${username.toLowerCase()}:${normalizedPhone}`, "utf8")
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  const expiryHex = (Math.floor(Date.now() / 86_400_000) + 14).toString(16).toUpperCase();
  const nonce = randomBytes(12).toString("hex").toUpperCase();
  const payload = `BB3:${tier}:${days}:${expiryHex}:${accountHash}:${nonce}`;
  const signer = createSign("SHA256");
  signer.update(payload, "utf8");
  signer.end();
  const signature = signer.sign({ key: createPrivateKey(pem), dsaEncoding: "der" }).toString("base64");
  return `BB3-${tier}-${days}-${expiryHex}-${accountHash}-${nonce}-${signature}`;
}

/**
 * Ensure admin session is valid and refresh if near expiry.
 * Returns true if session is valid, false if expired and could not be refreshed.
 */
async function ensureValidAdminSession(context: Ctx): Promise<boolean> {
  const { data: { session } } = await context.supabase.auth.getSession();
  if (!session) return false;

  const expiresIn = session.expires_in || 3600;
  const expiresAt = session.created_at + expiresIn * 1000;

  // Refresh if within 5 minutes of expiry
  if (Date.now() > expiresAt - 300_000) {
    const { error } = await context.supabase.auth.refreshSession();
    return !error;
  }
  return true;
}

async function perDeviceRate(context: Ctx): Promise<number> {
  const { data } = await context.supabase.from("app_config").select("per_device_fee_rwf").eq("id", "global").maybeSingle();
  return Number(data?.per_device_fee_rwf) || 2000;
}

async function getShop(context: Ctx, shopId: string) {
  const { data, error } = await context.supabase.from("shop_accounts").select("*").eq("id", shopId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as any;
}

async function activateShop(
  context: Ctx,
  shopId: string,
  opts: { addDays: number; branches?: number; workers?: number; devices?: number; monthly?: number; autoUnlock?: boolean; fallback?: any },
) {
  const now = Date.now();
  const shop = await getShop(context, shopId);
  const patch: Record<string, unknown> = {
    subscription_status: "ACTIVE",
    subscription_expires_at: extendExpiry(shop?.subscription_expires_at ?? 0, opts.addDays, now),
    updated_at: now,
  };
  if (opts.branches != null) patch["branch_count"] = Math.max(1, opts.branches);
  if (opts.workers != null) patch["worker_count"] = Math.max(1, opts.workers);
  if (opts.devices != null) patch["device_limit"] = Math.max(1, opts.devices, shop?.device_limit ?? 1);
  if (opts.monthly != null) patch["monthly_fee_rwf"] = Math.max(5000, opts.monthly);
  if (opts.autoUnlock) patch["auto_unlocked_at"] = now;
  if (shop) {
    const { error } = await context.supabase.from("shop_accounts").update(patch).eq("id", shopId);
    if (error) throw new Error(error.message);
  } else if (opts.fallback) {
    const { error } = await context.supabase.from("shop_accounts").insert({ id: shopId, ...opts.fallback, ...patch, created_at: now });
    if (error) throw new Error(error.message);
  }
  return patch["subscription_expires_at"] as number;
}

// ---------------- Context ----------------
export const getAdminContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const [adminResult, staffResult] = await Promise.all([
      ctx.supabase.rpc("is_beboss_admin"),
      ctx.supabase.rpc("is_beboss_staff"),
    ]);
    if (adminResult.error || staffResult.error) {
      console.error("[BeBoss admin auth] Supabase role verification failed", adminResult.error ?? staffResult.error);
      throw new Error("BeBoss could not verify this account's admin permissions. Please retry.");
    }
    const isAdmin = adminResult.data;
    const isStaff = staffResult.data;
    let signingKeyConfigured = false;
    if (isAdmin) {
      try {
        await loadBb3PrivateKeyPem();
        signingKeyConfigured = true;
      } catch {
        signingKeyConfigured = false;
      }
    }
    return { isAdmin: !!isAdmin, isStaff: !!isStaff, email: String(ctx.claims?.email ?? ""), signingKeyConfigured };
  });

// ---------------- Payments ----------------
export const approvePaymentWithCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => z.object({ requestId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    
    // Ensure admin session is valid
    const sessionValid = await ensureValidAdminSession(ctx);
    if (!sessionValid) throw new Error("Admin session expired. Please sign in again.");
    
    const admin = await requireAdmin(ctx);
    const { data: req, error } = await ctx.supabase.from("payment_requests").select("*").eq("id", data.requestId).maybeSingle();
    if (error || !req) throw new Error("Payment request not found.");
    
    // Idempotency check: if already approved, return existing code
    if (req.status === "APPROVED" && req.generated_unlock_code) {
      return { code: req.generated_unlock_code, alreadyApproved: true, days: req.duration_months * 30, tier: req.tier_code || "SINGLE", total: req.amount_rwf, expiresAt: req.subscription_expires_at, shopName: req.shop_name, username: req.owner_username, phone: req.payer_phone || req.owner_phone };
    }
    
    const calc = calculateSubscriptionFee(req.branch_count, req.worker_count, req.duration_months, req.device_count || 1, await perDeviceRate(ctx));
    const code = await generateBB3UnlockCode({ username: req.owner_username, phone: req.owner_phone, tier: calc.tier, days: calc.days });
    const now = Date.now();
    const ins = await ctx.supabase.from("unlock_codes").insert({
      id: crypto.randomUUID(),
      unlock_code: code,
      shop_username: String(req.owner_username).trim().toLowerCase(),
      shop_phone: String(req.owner_phone).trim(),
      device_challenge: req.device_challenge || "",
      tier_code: calc.tier,
      plan_days: calc.days,
      amount_rwf: calc.total,
      status: "ISSUED",
      issued_by_admin: admin.label,
      issued_at: now,
    });
    if (ins.error) throw new Error(ins.error.message);
    const upd = await ctx.supabase
      .from("payment_requests")
      .update({ status: "APPROVED", approval_mode: "UNLOCK_CODE", amount_rwf: calc.total, generated_unlock_code: code, verified_by_admin: admin.label, rejection_reason: "", updated_at: now })
      .eq("id", req.id);
    if (upd.error) throw new Error(upd.error.message);
    const shopId = computeShopKey(req.owner_username, req.owner_phone);
    const expiresAt = await activateShop(ctx, shopId, {
      addDays: calc.days,
      branches: req.branch_count,
      workers: req.worker_count,
      devices: req.device_count || 1,
      monthly: calc.monthly,
      fallback: { shop_name: req.shop_name, owner_username: String(req.owner_username).toLowerCase(), owner_phone: req.owner_phone, device_challenge: req.device_challenge || "" },
    });
    await audit(ctx, admin.email, "APPROVE_PAYMENT", `@${req.owner_username}`, `Verified ${req.payer_full_name || req.payer_phone} ${req.telco_reference} (${calc.total} FRw) -> issued ${code}`);
    return { code, days: calc.days, tier: calc.tier, total: calc.total, expiresAt, shopName: req.shop_name, username: req.owner_username, phone: req.payer_phone || req.owner_phone, alreadyApproved: false };
  });

export const directAutoUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => z.object({ requestId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: req } = await ctx.supabase.from("payment_requests").select("*").eq("id", data.requestId).maybeSingle();
    if (!req) throw new Error("Payment request not found.");
    const calc = calculateSubscriptionFee(req.branch_count, req.worker_count, req.duration_months, req.device_count || 1, await perDeviceRate(ctx));
    const now = Date.now();
    const upd = await ctx.supabase
      .from("payment_requests")
      .update({ status: "APPROVED", approval_mode: "DIRECT_AUTO_UNLOCK", amount_rwf: calc.total, generated_unlock_code: "", verified_by_admin: admin.label, rejection_reason: "", updated_at: now })
      .eq("id", req.id);
    if (upd.error) throw new Error(upd.error.message);
    const expiresAt = await activateShop(ctx, computeShopKey(req.owner_username, req.owner_phone), {
      addDays: calc.days,
      branches: req.branch_count,
      workers: req.worker_count,
      devices: req.device_count || 1,
      monthly: calc.monthly,
      autoUnlock: true,
      fallback: { shop_name: req.shop_name, owner_username: String(req.owner_username).toLowerCase(), owner_phone: req.owner_phone, device_challenge: req.device_challenge || "" },
    });
    await audit(ctx, admin.email, "DIRECT_AUTO_UNLOCK", `@${req.owner_username}`, `Auto-unlocked ${req.shop_name} (+${calc.days}d, ${calc.total} FRw, ${req.device_count || 1} devices)`);
    return { days: calc.days, tier: calc.tier, total: calc.total, expiresAt, shopName: req.shop_name, username: req.owner_username, phone: req.payer_phone || req.owner_phone };
  });

export const rejectPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; reason: string }) => z.object({ requestId: z.string().min(1).max(200), reason: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const reason = data.reason.trim() || "MoMo transaction could not be confirmed";
    const { data: req } = await ctx.supabase.from("payment_requests").select("owner_username").eq("id", data.requestId).maybeSingle();
    const { error } = await ctx.supabase.from("payment_requests").update({ status: "REJECTED", rejection_reason: reason, verified_by_admin: admin.label, updated_at: Date.now() }).eq("id", data.requestId);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "REJECT_PAYMENT", `@${req?.owner_username ?? data.requestId}`, reason);
    return { ok: true };
  });

export const deletePaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => z.object({ requestId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { error } = await ctx.supabase.from("payment_requests").delete().eq("id", data.requestId);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "DELETE_PAYMENT", data.requestId, "Removed payment claim");
    return { ok: true };
  });

/**
 * Batch approve multiple payments with individual results.
 * Each payment is processed independently; failures don't block others.
 */
export const approveBatchPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestIds: string[] }) => z.object({ requestIds: z.array(z.string().min(1).max(200)).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    
    const results = [];
    for (const requestId of data.requestIds) {
      try {
        const result = await approvePaymentWithCode({ requestId }, { context });
        results.push({ requestId, success: true, code: result.code, alreadyApproved: result.alreadyApproved });
      } catch (e) {
        results.push({ requestId, success: false, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }
    
    await audit(ctx, admin.email, "APPROVE_BATCH_PAYMENTS", "multiple", `Processed ${data.requestIds.length} payments: ${results.filter(r => r.success).length} succeeded, ${results.filter(r => !r.success).length} failed`);
    
    return { results, successCount: results.filter(r => r.success).length };
  });

/**
 * Check app version for automatic update detection.
 * Returns current version, minimum required version, and download URL.
 */
export const checkAppVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const { data: config } = await ctx.supabase
      .from("app_config")
      .select("apk_version, min_app_version, apk_download_url")
      .eq("id", "global")
      .maybeSingle();
    
    return {
      currentVersion: config?.apk_version || "2.1.0",
      minimumVersion: config?.min_app_version || "2.1.0",
      downloadUrl: config?.apk_download_url || ""
    };
  });

// ---------------- Unlock codes ----------------
const manualCodeSchema = z.object({
  username: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(6).max(30),
  months: z.number().int().min(0).max(24),
  days: z.number().int().min(1).max(800),
  branches: z.number().int().min(1).max(100),
  workers: z.number().int().min(1).max(500),
  devices: z.number().int().min(1).max(100),
  tier: z.enum(["SINGLE", "DUAL", "MULTI", "ANNUAL", "TRIAL"]),
  extendCloud: z.boolean(),
});

export const issueManualCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof manualCodeSchema>) => manualCodeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const calc = calculateSubscriptionFee(data.branches, data.workers, Math.max(1, data.months), data.devices, await perDeviceRate(ctx));
    const amount = data.months === 0 ? 0 : calc.total;
    const code = await generateBB3UnlockCode({ username: data.username, phone: data.phone, tier: data.tier, days: data.days });
    const { error } = await ctx.supabase.from("unlock_codes").insert({
      id: crypto.randomUUID(),
      unlock_code: code,
      shop_username: data.username.toLowerCase(),
      shop_phone: data.phone,
      tier_code: data.tier,
      plan_days: data.days,
      amount_rwf: amount,
      status: "ISSUED",
      issued_by_admin: admin.label,
      issued_at: Date.now(),
    });
    if (error) throw new Error(error.message);
    const shopId = computeShopKey(data.username, data.phone);
    if (data.extendCloud) {
      const shop = await getShop(ctx, shopId);
      if (shop) await activateShop(ctx, shopId, { addDays: data.days, branches: data.branches, workers: data.workers, devices: data.devices, monthly: calc.monthly });
    }
    await audit(ctx, admin.email, "ISSUE_MANUAL_CODE", `@${data.username}`, `${code} (${data.tier}, +${data.days}d, ${amount} FRw)`);
    return { code, amount, shopId };
  });

export const revokeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: row } = await ctx.supabase.from("unlock_codes").select("unlock_code, shop_username").eq("id", data.id).maybeSingle();
    const { error } = await ctx.supabase.from("unlock_codes").update({ status: "REVOKED" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "REVOKE_CODE", `@${row?.shop_username ?? ""}`, `Revoked ${row?.unlock_code ?? data.id}`);
    return { ok: true };
  });

// ---------------- Shops ----------------
const shopId = z.string().min(1).max(200);

export const extendShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string; days: number; autoUnlock: boolean }) => z.object({ shopId, days: z.number().int().min(1).max(1000), autoUnlock: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const shop = await getShop(ctx, data.shopId);
    if (!shop) throw new Error("Shop not found.");
    const expiresAt = await activateShop(ctx, data.shopId, { addDays: data.days, autoUnlock: data.autoUnlock });
    await audit(ctx, admin.email, data.autoUnlock ? "DIRECT_AUTO_UNLOCK" : "EXTEND_SHOP", `@${shop.owner_username}`, `${shop.shop_name} +${data.days}d`);
    return { expiresAt };
  });

export const resetShopTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string }) => z.object({ shopId }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const shop = await getShop(ctx, data.shopId);
    if (!shop) throw new Error("Shop not found.");
    const { error } = await ctx.supabase.from("shop_accounts").update({ subscription_status: "TRIAL", subscription_expires_at: now + TRIAL_DAYS * DAY_MS, updated_at: now }).eq("id", data.shopId);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "RESET_TRIAL", `@${shop.owner_username}`, `Reset ${TRIAL_DAYS}-day trial for ${shop.shop_name}`);
    return { ok: true };
  });

export const setShopStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string; status: string }) => z.object({ shopId, status: z.enum(["ACTIVE", "TRIAL", "EXPIRED", "SUSPENDED"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const shop = await getShop(ctx, data.shopId);
    if (!shop) throw new Error("Shop not found.");
    const patch: Record<string, unknown> = { subscription_status: data.status, updated_at: Date.now() };
    if (data.status === "EXPIRED") patch["subscription_expires_at"] = Math.min(Number(shop.subscription_expires_at), Date.now() - 1000);
    const { error } = await ctx.supabase.from("shop_accounts").update(patch).eq("id", data.shopId);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "SET_SHOP_STATUS", `@${shop.owner_username}`, `${shop.shop_name} -> ${data.status}`);
    return { ok: true };
  });

export const updateShopLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string; branches: number; workers: number; devices: number }) =>
    z.object({ shopId, branches: z.number().int().min(1).max(100), workers: z.number().int().min(1).max(500), devices: z.number().int().min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const shop = await getShop(ctx, data.shopId);
    if (!shop) throw new Error("Shop not found.");
    const calc = calculateSubscriptionFee(data.branches, data.workers, 1, data.devices, await perDeviceRate(ctx));
    const { error } = await ctx.supabase
      .from("shop_accounts")
      .update({ branch_count: data.branches, worker_count: data.workers, device_limit: data.devices, monthly_fee_rwf: calc.monthly, updated_at: Date.now() })
      .eq("id", data.shopId);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "UPDATE_SHOP_LIMITS", `@${shop.owner_username}`, `${data.branches} branches / ${data.workers} staff / ${data.devices} devices -> ${calc.monthly} FRw/mo`);
    return { monthly: calc.monthly };
  });

export const updateShopControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string; killSwitch: boolean; minAppVersion: string; notes: string; adminWhatsapp: string }) =>
    z
      .object({ shopId, killSwitch: z.boolean(), minAppVersion: z.string().trim().regex(/^\d+(\.\d+){0,3}$/, "Version like 2.1.0").max(20), notes: z.string().max(2000), adminWhatsapp: z.string().max(30) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const shop = await getShop(ctx, data.shopId);
    if (!shop) throw new Error("Shop not found.");
    const { error } = await ctx.supabase
      .from("shop_accounts")
      .update({ remote_kill_switch: data.killSwitch, min_app_version: data.minAppVersion, admin_notes: data.notes, admin_whatsapp: data.adminWhatsapp, updated_at: Date.now() })
      .eq("id", data.shopId);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "UPDATE_SHOP_CONTROLS", `@${shop.owner_username}`, `kill_switch=${data.killSwitch} min_version=${data.minAppVersion}`);
    return { ok: true };
  });

export const deleteShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string; cascade: boolean }) => z.object({ shopId, cascade: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const shop = await getShop(ctx, data.shopId);
    if (!shop) throw new Error("Shop not found.");
    if (data.cascade) {
      await ctx.supabase.from("shop_devices").delete().eq("shop_sync_key", data.shopId);
      await ctx.supabase.from("shop_users").delete().eq("shop_sync_key", data.shopId);
      await ctx.supabase.from("branch_sync_snapshots").delete().eq("shop_sync_key", data.shopId);
    }
    const { error } = await ctx.supabase.from("shop_accounts").delete().eq("id", data.shopId);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "DELETE_SHOP", `@${shop.owner_username}`, `Deleted ${shop.shop_name}${data.cascade ? " with devices, users and snapshots" : ""}`);
    return { ok: true };
  });

// ---------------- Devices / users / snapshots ----------------
export const setDeviceActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) => z.object({ id: z.string().min(1).max(200), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: dev } = await ctx.supabase.from("shop_devices").select("device_name, shop_name, join_code").eq("id", data.id).maybeSingle();
    const { error } = await ctx.supabase.from("shop_devices").update({ is_active: data.active, updated_at: Date.now() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "TOGGLE_SHOP_DEVICE", dev?.join_code ?? data.id, `${dev?.device_name ?? "device"} (${dev?.shop_name ?? ""}) active -> ${data.active}`);
    return { ok: true };
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: dev } = await ctx.supabase.from("shop_devices").select("device_name, shop_name, join_code").eq("id", data.id).maybeSingle();
    const { error } = await ctx.supabase.from("shop_devices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "DELETE_SHOP_DEVICE", dev?.join_code ?? data.id, `Removed ${dev?.device_name ?? "device"} from ${dev?.shop_name ?? ""}`);
    return { ok: true };
  });

export const updateShopUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; role?: string; isActive?: boolean }) =>
    z.object({ id: z.string().min(1).max(200), role: z.enum(["OWNER", "MANAGER", "CASHIER"]).optional(), isActive: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const patch: Record<string, unknown> = { updated_at: Date.now() };
    if (data.role) patch["role"] = data.role;
    if (data.isActive != null) patch["is_active"] = data.isActive;
    const { data: u } = await ctx.supabase.from("shop_users").select("username, full_name").eq("id", data.id).maybeSingle();
    const { error } = await ctx.supabase.from("shop_users").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, data.role ? "UPDATE_USER_ROLE" : "TOGGLE_USER", `@${u?.username ?? data.id}`, JSON.stringify({ role: data.role, active: data.isActive }));
    return { ok: true };
  });

export const deleteShopUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: u } = await ctx.supabase.from("shop_users").select("username, shop_name").eq("id", data.id).maybeSingle();
    const { error } = await ctx.supabase.from("shop_users").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "DELETE_USER", `@${u?.username ?? data.id}`, `Removed from ${u?.shop_name ?? ""}`);
    return { ok: true };
  });

export const deleteSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: s } = await ctx.supabase.from("branch_sync_snapshots").select("shop_name, branch_name").eq("id", data.id).maybeSingle();
    const { error } = await ctx.supabase.from("branch_sync_snapshots").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "DELETE_SNAPSHOT", data.id, `${s?.shop_name ?? ""} / ${s?.branch_name ?? ""}`);
    return { ok: true };
  });

// ---------------- Config & secrets ----------------
const configSchema = z.object({
  admin_whatsapp_number: z.string().trim().max(30),
  mtn_momo_code: z.string().trim().max(20),
  mtn_momo_phone: z.string().trim().max(20),
  mtn_recipient_name: z.string().trim().max(80),
  airtel_money_phone: z.string().trim().max(20),
  airtel_recipient_name: z.string().trim().max(80),
  per_device_fee_rwf: z.number().int().min(0).max(1_000_000),
  apk_download_url: z.string().trim().max(500),
  apk_version: z.string().trim().max(20),
  support_email: z.string().trim().max(200),
});

export const saveAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof configSchema>) => configSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { error } = await ctx.supabase.from("app_config").upsert({ id: "global", ...data, updated_at: Date.now() });
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "SAVE_APP_CONFIG", "global", `MTN ${data.mtn_momo_code || data.mtn_momo_phone} • Airtel ${data.airtel_money_phone} • device ${data.per_device_fee_rwf} • APK ${data.apk_version}`);
    return { ok: true };
  });

export const setSigningSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { value: string }) => z.object({ value: z.string().trim().min(120, "Paste a complete PKCS#8 P-256 private key PEM").max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createPrivateKey } = await import("node:crypto");
    const key = createPrivateKey(data.value);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
      throw new Error("Use an ECDSA P-256 private key in PKCS#8 PEM format. The matching public key must also be pinned in Android before rotation.");
    }
    const { error } = await supabaseAdmin.from("app_secrets").upsert({
      name: "BEBOSS_UNLOCK_ECDSA_PRIVATE_KEY_PEM",
      value: data.value,
      updated_by: admin.email,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "SET_BB3_PRIVATE_KEY", "BEBOSS_UNLOCK_ECDSA_PRIVATE_KEY_PEM", "BB3 private key rotated (value never logged)");
    return { ok: true };
  });

// ---------------- Releases ----------------
const releaseSchema = z.object({
  version_name: z.string().trim().min(1).max(20),
  version_code: z.number().int().min(1).max(1_000_000),
  file_path: z.string().trim().min(1).max(300),
  file_name: z.string().trim().min(1).max(200),
  size_bytes: z.number().int().min(1),
  sha256: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  min_android: z.string().trim().max(40),
  release_notes: z.string().max(5000),
  make_current: z.boolean(),
  public_download_url: z.string().trim().url().max(500),
});

export const publishRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof releaseSchema>) => releaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    if (data.make_current) {
      await ctx.supabase.from("app_releases").update({ is_current: false }).eq("is_current", true);
    }
    const { data: row, error } = await ctx.supabase
      .from("app_releases")
      .insert({
        version_name: data.version_name,
        version_code: data.version_code,
        file_path: data.file_path,
        file_url: data.public_download_url,
        file_name: data.file_name,
        size_bytes: data.size_bytes,
        sha256: data.sha256.toLowerCase(),
        min_android: data.min_android,
        release_notes: data.release_notes,
        is_current: data.make_current,
        created_by: admin.email,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (data.make_current) {
      await ctx.supabase.from("app_config").update({ apk_download_url: data.public_download_url, apk_version: data.version_name, updated_at: Date.now() }).eq("id", "global");
    }
    await audit(ctx, admin.email, "PUBLISH_RELEASE", data.version_name, `${data.file_name} (${data.size_bytes} bytes)${data.make_current ? " — now current" : ""}`);
    return { id: row.id as string };
  });

export const setCurrentRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; public_download_url: string }) => z.object({ id: z.string().uuid(), public_download_url: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: rel } = await ctx.supabase.from("app_releases").select("version_name").eq("id", data.id).maybeSingle();
    if (!rel) throw new Error("Release not found.");
    await ctx.supabase.from("app_releases").update({ is_current: false }).eq("is_current", true);
    const { error } = await ctx.supabase.from("app_releases").update({ is_current: true, file_url: data.public_download_url }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await ctx.supabase.from("app_config").update({ apk_download_url: data.public_download_url, apk_version: rel.version_name, updated_at: Date.now() }).eq("id", "global");
    await audit(ctx, admin.email, "SET_CURRENT_RELEASE", rel.version_name, "Marked as current download");
    return { ok: true };
  });

export const deleteRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: rel } = await ctx.supabase.from("app_releases").select("*").eq("id", data.id).maybeSingle();
    if (!rel) throw new Error("Release not found.");
    if (rel.is_current) throw new Error("Make another release current before deleting this one.");
    await ctx.supabase.storage.from("releases").remove([rel.file_path]);
    const { error } = await ctx.supabase.from("app_releases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "DELETE_RELEASE", rel.version_name, rel.file_name);
    return { ok: true };
  });

// ---------------- Inbox ----------------
export const updateContactMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string; note: string }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED", "SPAM"]), note: z.string().max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx, true);
    const { error } = await ctx.supabase.from("contact_messages").update({ status: data.status, admin_reply_note: data.note, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "UPDATE_INBOX", data.id, data.status).catch(() => undefined);
    return { ok: true };
  });

export const deleteContactMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    const { error } = await ctx.supabase.from("contact_messages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Team ----------------
export const listTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin.from("user_roles").select("user_id, role, created_at");
    if (error) throw new Error(error.message);
    const members = await Promise.all(
      (roles ?? []).map(async (r) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        return { userId: r.user_id, role: r.role, since: r.created_at, email: u?.user?.email ?? "unknown", lastSignIn: u?.user?.last_sign_in_at ?? null };
      }),
    );
    return { members, me: ctx.userId };
  });

export const grantTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; role: "admin" | "support" }) => z.object({ email: z.string().trim().email().max(200), role: z.enum(["admin", "support"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = data.email.toLowerCase();
    let found: { id: string; email?: string } | undefined;

    for (let page = 1; page <= 20 && !found; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      found = list.users.find((user) => (user.email ?? "").toLowerCase() === target);
      if (list.users.length < 200) break;
    }

    let invited = false;
    if (!found) {
      const redirectTo = process.env["BEBOSS_ADMIN_URL"]?.trim();
      if (!redirectTo) {
        throw new Error("Team invitations are not configured. Set BEBOSS_ADMIN_URL to the production /reset-password?invite=1 URL first.");
      }
      const { data: invitation, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(target, { redirectTo });
      if (error) throw new Error(`Could not invite this team member: ${error.message}`);
      if (!invitation.user?.id) throw new Error("Supabase did not return the invited account.");
      found = { id: invitation.user.id, email: invitation.user.email ?? target };
      invited = true;
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: found.id, role: data.role }, { onConflict: "user_id,role" });
    if (roleError) {
      if (invited) await supabaseAdmin.auth.admin.deleteUser(found.id);
      throw new Error(`Could not grant the requested role: ${roleError.message}`);
    }

    const { error: profileError } = await supabaseAdmin.from("admin_profiles").upsert({
      user_id: found.id,
      email: target,
      full_name: target,
      role: data.role === "admin" ? "SUPER_ADMIN" : "SUPPORT",
    }, { onConflict: "user_id" });
    if (profileError) {
      console.error("[BeBoss team] Role granted but admin profile could not be updated", profileError);
    }

    await audit(ctx, admin.email, invited ? "INVITE_TEAM_MEMBER" : "GRANT_ROLE", target, data.role);
    return { ok: true, invited, email: target, role: data.role };
  });

export const revokeTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "admin" | "support" }) => z.object({ userId: z.string().uuid(), role: z.enum(["admin", "support"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.role === "admin") {
      const { count } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
      if ((count ?? 0) <= 1) throw new Error("You can't remove the last master admin.");
    }
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "REVOKE_ROLE", data.userId, data.role);
    return { ok: true };
  });
