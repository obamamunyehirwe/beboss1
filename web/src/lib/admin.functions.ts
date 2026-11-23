import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invokeSupabaseEdgeFunction } from "./admin-guard.server";
import { calculateSubscriptionFee, computeShopKey, extendExpiry, DAY_MS, TRIAL_DAYS } from "./pricing";

type Ctx = { supabase: any; userId: string; claims: any; accessToken: string };

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

type Bb3Input = {
  requestId: string;
  username: string;
  phone: string;
  tier: string;
  days: number;
  provider: string;
  payerPhone: string;
  payerFullName: string;
  amountRwf: number;
  months: number;
  branches: number;
  workers: number;
  devices: number;
  paymentTimeMs: number;
  paymentNote: string;
};

function normalizePlanPhone(value: string): string {
  return String(value ?? "").replace(/\D/g, "").slice(-9);
}

function paymentPlanCanonical(input: Bb3Input): string {
  return [
    "BEBOSS-PAYMENT-PLAN-V1",
    input.requestId.trim(),
    input.username.trim().toLowerCase(),
    normalizePlanPhone(input.phone),
    input.provider.trim().toUpperCase(),
    normalizePlanPhone(input.payerPhone),
    input.payerFullName.trim().normalize("NFKC"),
    Math.floor(input.amountRwf),
    Math.floor(input.months),
    Math.floor(input.branches),
    Math.floor(input.workers),
    Math.floor(input.devices),
    Math.floor(input.paymentTimeMs),
    input.paymentNote.trim().normalize("NFKC"),
  ].join("\n");
}

// This public key is already pinned in SubscriptionSecurityManager.kt.
// Only a private key whose derived public key matches this exact APK key can sign
// BB3 vouchers accepted by currently installed BeBoss Android builds.
const BB3_ANDROID_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEnH8Qg10M7lur8WocoKgklEJ98F6
UF9J9ektcbwahKU79+sHZdQAejA76NlwNldXfWaZGFNYu+ziDItMapV7dA==
-----END PUBLIC KEY-----`;

/**
 * Ensure admin session is valid and refresh if near expiry.
 * Returns true if session is valid, false if expired and could not be refreshed.
 */
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
  opts: { addDays: number; branches?: number; workers?: number; devices?: number; monthly?: number; autoUnlock?: boolean },
) {
  const now = Date.now();
  const shop = await getShop(context, shopId);
  if (!shop) throw new Error("This shop is not registered in BeBoss Cloud. Sync/register the shop before activating a paid plan.");
  const patch: Record<string, unknown> = {
    subscription_status: "ACTIVE",
    subscription_expires_at: extendExpiry(shop.subscription_expires_at ?? 0, opts.addDays, now),
    updated_at: now,
  };
  if (opts.branches != null) patch["branch_count"] = Math.max(1, opts.branches);
  if (opts.workers != null) patch["worker_count"] = Math.max(1, opts.workers);
  if (opts.devices != null) {
    const exactDevices = Math.max(1, opts.devices);
    patch["device_count"] = exactDevices;
    patch["device_limit"] = exactDevices;
  }
  if (opts.monthly != null) patch["monthly_fee_rwf"] = Math.max(5000, opts.monthly);
  if (opts.autoUnlock) patch["auto_unlocked_at"] = now;
  const { error } = await context.supabase.from("shop_accounts").update(patch).eq("id", shopId);
  if (error) throw new Error(error.message);
  return patch["subscription_expires_at"] as number;
}

function normalizePaymentPhone(value: string): string {
  return String(value ?? "").replace(/\D/g, "").slice(-9);
}

async function requireRegisteredPaymentShop(context: Ctx, request: any) {
  const shopId = computeShopKey(String(request.owner_username ?? ""), String(request.owner_phone ?? ""));
  const shop = await getShop(context, shopId);
  if (!shop) {
    throw new Error("No registered BeBoss shop matches this payment. Sync/register the mobile shop first; no unlock code was issued.");
  }
  const usernameMatches = String(shop.owner_username ?? "").trim().toLowerCase() === String(request.owner_username ?? "").trim().toLowerCase();
  const phoneMatches = normalizePaymentPhone(String(shop.owner_phone ?? "")) === normalizePaymentPhone(String(request.owner_phone ?? ""));
  if (!usernameMatches || !phoneMatches) {
    throw new Error("The payment owner details do not exactly match the registered BeBoss shop. Correct the shop account before approval.");
  }
  return { shopId, shop };
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
        const status = await invokeSupabaseEdgeFunction<{ configured?: boolean }>(ctx, "manage-app-secrets", { action: "bb3_status" });
        signingKeyConfigured = status.configured === true;
      } catch (error) {
        console.error("[BeBoss admin auth] BB3 key status is temporarily unavailable", error);
      }
    }
    return { isAdmin: !!isAdmin, isStaff: !!isStaff, email: String(ctx.claims?.email ?? ""), signingKeyConfigured };
  });

// ---------------- Payments ----------------
export const approvePaymentWithCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; providerVerified: true; verificationNote: string }) =>
    z.object({ requestId: z.string().min(1).max(200), providerVerified: z.literal(true), verificationNote: z.string().trim().min(5).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: req, error } = await ctx.supabase.from("payment_requests").select("id,shop_name,owner_username,owner_phone,device_challenge,provider,payer_phone,payer_full_name,amount_rwf,duration_months,branch_count,worker_count,device_count,payment_time_ms,payment_note,admin_verification_note,fee_per_device_rwf,status,approval_mode,generated_unlock_code,verified_by_admin,rejection_reason,source,created_at,updated_at,ussd_code").eq("id", data.requestId).maybeSingle();
    if (error || !req) throw new Error("Payment request not found.");
    if (data.providerVerified !== true) throw new Error("A manual provider-payment verification is required before issuing an unlock code.");
    const verificationNote = data.verificationNote.trim();
    if (verificationNote.length < 5) throw new Error("Record what you confirmed in the MTN MoMo or Airtel Money merchant transaction history.");

    const { shopId } = await requireRegisteredPaymentShop(ctx, req);
    const trustedFeeRate = Number(req.fee_per_device_rwf) > 0 ? Math.floor(Number(req.fee_per_device_rwf)) : await perDeviceRate(ctx);
    const calc = calculateSubscriptionFee(req.branch_count, req.worker_count, req.duration_months, req.device_count || 1, trustedFeeRate);
    if (Number(req.amount_rwf) !== calc.total) {
      throw new Error(`Payment amount mismatch. Submitted ${Number(req.amount_rwf || 0)} FRw; this plan calculates to ${calc.total} FRw. Refresh and verify the payment details before issuing a code.`);
    }

    const paymentTimeMs = Math.max(0, Number(req.payment_time_ms || req.created_at || Date.now()));
    const payerPhone = String(req.payer_phone || req.owner_phone);
    const payerFullName = String(req.payer_full_name || "");
    const paymentNote = String(req.payment_note || "");

    if (req.status === "APPROVED") {
      if (!req.generated_unlock_code || req.approval_mode !== "UNLOCK_CODE") {
        throw new Error("This payment was already approved using direct auto-unlock.");
      }
      const { data: existingCode, error: codeError } = await ctx.supabase
        .from("unlock_codes").select("payment_request_id, unlock_code")
        .eq("unlock_code", req.generated_unlock_code).maybeSingle();
      if (codeError || !existingCode || existingCode.payment_request_id !== req.id) {
        throw new Error("This approved payment has no matching payment-linked unlock record. Contact the master administrator.");
      }
      const shop = await getShop(ctx, shopId);
      return { code: req.generated_unlock_code, alreadyApproved: true, days: calc.days, tier: calc.tier, total: calc.total, expiresAt: Number(shop?.subscription_expires_at ?? 0), shopName: req.shop_name, username: req.owner_username, phone: payerPhone };
    }
    if (!["PENDING_VERIFICATION", "REJECTED"].includes(String(req.status))) {
      throw new Error(`This payment claim is ${String(req.status).toLowerCase().replaceAll("_", " ")} and cannot be approved again.`);
    }

    const signingInput: Bb3Input = {
      requestId: String(req.id), username: String(req.owner_username), phone: String(req.owner_phone), tier: calc.tier, days: calc.days,
      provider: String(req.provider || ""), payerPhone, payerFullName, amountRwf: calc.total, months: Number(req.duration_months),
      branches: Number(req.branch_count), workers: Number(req.worker_count), devices: Number(req.device_count || 1), paymentTimeMs, paymentNote,
    };
    const { createHash } = await import("node:crypto");
    const expectedPlanDigest = createHash("sha256")
      .update(paymentPlanCanonical(signingInput), "utf8")
      .digest("hex")
      .toUpperCase();
    const issued = await invokeSupabaseEdgeFunction<{
      code?: string; planDigest?: string; requestId?: string; shopId?: string; amountRwf?: number;
    }>(ctx, "issue-bb3-unlock", {
      paymentRequestId: String(req.id),
      providerVerified: true,
      verificationNote,
    });
    if (
      !issued.code?.startsWith("BB3-") ||
      issued.planDigest !== expectedPlanDigest ||
      String(issued.requestId ?? "") !== String(req.id) ||
      String(issued.shopId ?? "") !== shopId ||
      Number(issued.amountRwf) !== calc.total
    ) {
      throw new Error("The Supabase BB3 signer returned a code that does not match this verified payment plan. No code was issued.");
    }
    const signed = { code: issued.code, planDigest: expectedPlanDigest };
    const now = Date.now();
    let codeToUse = signed.code;
    let unlockCodeId = crypto.randomUUID();
    let insertedNewCode = false;

    // A retry after an insert/CAS interruption reuses the one code already linked to this payment.
    const { data: priorCode, error: priorError } = await ctx.supabase.from("unlock_codes")
      .select("id,unlock_code,plan_digest,status")
      .eq("payment_request_id", req.id)
      .in("status", ["ISSUED", "REDEEMED"])
      .maybeSingle();
    if (priorError) throw new Error("Could not check the existing unlock record for this payment.");
    if (priorCode) {
      if (!["ISSUED", "REDEEMED"].includes(String(priorCode.status)) || priorCode.plan_digest !== signed.planDigest || !priorCode.unlock_code) {
        throw new Error("This payment already has an active or redeemed unlock record with different plan details. A second code will not be created.");
      }
      codeToUse = String(priorCode.unlock_code);
      unlockCodeId = String(priorCode.id);
    } else {
      const ins = await ctx.supabase.from("unlock_codes").insert({
        id: unlockCodeId, unlock_code: signed.code, payment_request_id: req.id,
        shop_username: String(req.owner_username).trim().toLowerCase(), shop_phone: String(req.owner_phone).trim(),
        device_challenge: req.device_challenge || "", tier_code: calc.tier, plan_days: calc.days, amount_rwf: calc.total,
        duration_months: Number(req.duration_months), branch_count: Number(req.branch_count), worker_count: Number(req.worker_count), device_count: Number(req.device_count || 1),
        payment_time_ms: paymentTimeMs, payment_provider: String(req.provider || ""), payer_phone: payerPhone, payer_full_name: payerFullName, payment_note: paymentNote,
        plan_digest: signed.planDigest, status: "ISSUED", issued_by_admin: admin.label, issued_at: now,
      });
      if (ins.error) {
        if (ins.error.code === "23505") {
          const { data: winner } = await ctx.supabase.from("unlock_codes").select("id,unlock_code,plan_digest,status").eq("payment_request_id", req.id).in("status", ["ISSUED", "REDEEMED"]).maybeSingle();
          if (!winner || !["ISSUED", "REDEEMED"].includes(String(winner.status)) || winner.plan_digest !== signed.planDigest || !winner.unlock_code) {
            throw new Error("A conflicting unlock-code record already exists for this payment. No duplicate was issued.");
          }
          codeToUse = String(winner.unlock_code);
          unlockCodeId = String(winner.id);
        } else {
          throw new Error(ins.error.message);
        }
      } else {
        insertedNewCode = true;
      }
    }

    const claim = await ctx.supabase.from("payment_requests").update({
      status: "APPROVED", approval_mode: "UNLOCK_CODE", amount_rwf: calc.total, generated_unlock_code: codeToUse,
      verified_by_admin: admin.label, admin_verification_note: verificationNote, rejection_reason: "", updated_at: now,
    }).eq("id", req.id).eq("status", req.status).select("id").maybeSingle();

    if (claim.error || !claim.data) {
      const { data: latest } = await ctx.supabase.from("payment_requests").select("status,generated_unlock_code").eq("id", req.id).maybeSingle();
      if (latest?.status === "APPROVED" && latest.generated_unlock_code === codeToUse) {
        const { data: activeShop } = await ctx.supabase.from("shop_accounts").select("subscription_expires_at").eq("id", shopId).maybeSingle();
        return { code: codeToUse, days: calc.days, tier: calc.tier, total: calc.total, expiresAt: Number(activeShop?.subscription_expires_at ?? 0), shopName: req.shop_name, username: req.owner_username, phone: payerPhone, alreadyApproved: true };
      }
      if (insertedNewCode) {
        await ctx.supabase.from("unlock_codes").update({ status: "REVOKED" }).eq("id", unlockCodeId).eq("status", "ISSUED");
      }
      throw new Error("Another administrator changed this payment first. Refresh the queue before trying again.");
    }

    const expiresAt = await activateShop(ctx, shopId, { addDays: calc.days, branches: req.branch_count, workers: req.worker_count, devices: req.device_count || 1, monthly: calc.monthly });
    await audit(ctx, admin.email, "APPROVE_PAYMENT", `@${req.owner_username}`, `Manually confirmed in provider records: ${verificationNote}. Customer SMS: ${paymentNote || "not supplied"}. ${payerFullName || payerPhone}; ${req.provider}; ${calc.total} FRw; ${req.duration_months} months / ${req.branch_count} branches / ${req.worker_count} staff / ${req.device_count || 1} devices. Unique BB3 code issued for ${req.id}.`);
    return { code: codeToUse, days: calc.days, tier: calc.tier, total: calc.total, expiresAt, shopName: req.shop_name, username: req.owner_username, phone: payerPhone, alreadyApproved: false };
  });

export const directAutoUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; providerVerified: true; verificationNote: string }) =>
    z.object({
      requestId: z.string().min(1).max(200),
      providerVerified: z.literal(true),
      verificationNote: z.string().trim().min(5).max(500),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: req, error } = await ctx.supabase
      .from("payment_requests")
      .select("id,shop_name,owner_username,owner_phone,provider,payer_phone,payer_full_name,amount_rwf,duration_months,branch_count,worker_count,device_count,fee_per_device_rwf,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,verified_by_admin,rejection_reason,source,created_at,updated_at")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error || !req) throw new Error("Payment request not found.");
    if (data.providerVerified !== true) {
      throw new Error("A manual provider-payment verification is required before a shop can be activated.");
    }
    const verificationNote = data.verificationNote.trim();
    if (verificationNote.length < 5) {
      throw new Error("Record what you confirmed in the MTN MoMo or Airtel Money merchant transaction history.");
    }

    const { shopId } = await requireRegisteredPaymentShop(ctx, req);
    const feePerDeviceRwf = Number(req.fee_per_device_rwf) >= 2_000
      ? Math.floor(Number(req.fee_per_device_rwf))
      : 2_000;
    const calc = calculateSubscriptionFee(
      req.branch_count,
      req.worker_count,
      req.duration_months,
      req.device_count || 1,
      feePerDeviceRwf,
    );
    if (Number(req.amount_rwf) !== calc.total) {
      throw new Error(`Payment amount mismatch. Submitted ${Number(req.amount_rwf || 0)} FRw; this plan calculates to ${calc.total} FRw. Refresh and verify the payment details before activating the shop.`);
    }

    if (req.status === "APPROVED") {
      if (req.approval_mode !== "DIRECT_AUTO_UNLOCK" || req.generated_unlock_code) {
        throw new Error("This payment has already been approved with a BB3 code or another approval method.");
      }
      const existingShop = await getShop(ctx, shopId);
      if (!existingShop || String(existingShop.subscription_status) !== "ACTIVE") {
        throw new Error("The payment is marked as directly approved, but the shop is not active. Refresh the shop record and contact the master administrator.");
      }
      return {
        direct: true,
        alreadyApproved: true,
        days: calc.days,
        tier: calc.tier,
        total: calc.total,
        expiresAt: Number(existingShop.subscription_expires_at ?? 0),
        shopName: req.shop_name,
        username: req.owner_username,
        phone: String(req.payer_phone || req.owner_phone),
      };
    }
    if (![ "PENDING_VERIFICATION", "REJECTED" ].includes(String(req.status))) {
      throw new Error(`This payment claim is ${String(req.status).toLowerCase().replaceAll("_", " ")} and cannot be directly approved.`);
    }

    const now = Date.now();
    const claim = await ctx.supabase
      .from("payment_requests")
      .update({
        status: "APPROVED",
        approval_mode: "DIRECT_AUTO_UNLOCK",
        generated_unlock_code: "",
        verified_by_admin: admin.label,
        admin_verification_note: verificationNote,
        rejection_reason: "",
        updated_at: now,
      })
      .eq("id", req.id)
      .eq("status", req.status)
      .select("id")
      .maybeSingle();

    if (claim.error || !claim.data) {
      const { data: latest } = await ctx.supabase
        .from("payment_requests")
        .select("status,approval_mode,generated_unlock_code")
        .eq("id", req.id)
        .maybeSingle();
      if (latest?.status === "APPROVED" &&
          latest.approval_mode === "DIRECT_AUTO_UNLOCK" &&
          !latest.generated_unlock_code) {
        const currentShop = await getShop(ctx, shopId);
        if (currentShop?.subscription_status === "ACTIVE") {
          return {
            direct: true,
            alreadyApproved: true,
            days: calc.days,
            tier: calc.tier,
            total: calc.total,
            expiresAt: Number(currentShop.subscription_expires_at ?? 0),
            shopName: req.shop_name,
            username: req.owner_username,
            phone: String(req.payer_phone || req.owner_phone),
          };
        }
      }
      throw new Error("Another administrator changed this payment first. Refresh the queue before trying again.");
    }

    let expiresAt: number;
    try {
      expiresAt = await activateShop(ctx, shopId, {
        addDays: calc.days,
        branches: req.branch_count,
        workers: req.worker_count,
        devices: req.device_count || 1,
        monthly: calc.monthly,
        autoUnlock: true,
      });
    } catch (activationError) {
      await ctx.supabase
        .from("payment_requests")
        .update({
          status: req.status,
          approval_mode: req.approval_mode || "",
          generated_unlock_code: req.generated_unlock_code || "",
          verified_by_admin: req.verified_by_admin || "",
          rejection_reason: req.rejection_reason || "",
          updated_at: Date.now(),
        })
        .eq("id", req.id)
        .eq("status", "APPROVED")
        .eq("approval_mode", "DIRECT_AUTO_UNLOCK");
      throw new Error(`Payment was verified, but direct shop activation did not complete. The claim was returned for retry: ${activationError instanceof Error ? activationError.message : "activation failed"}`);
    }

    await audit(
      ctx,
      admin.email,
      "DIRECT_AUTO_UNLOCK_PAYMENT",
      `@${req.owner_username}`,
      `Direct cloud activation after manual provider verification: ${verificationNote}. ${req.payer_full_name || req.payer_phone || req.owner_phone}; ${req.provider}; ${calc.total} FRw; ${req.duration_months} months / ${req.branch_count} branches / ${req.worker_count} staff / ${req.device_count || 1} devices. No unlock code issued.`,
    );
    return {
      direct: true,
      alreadyApproved: false,
      days: calc.days,
      tier: calc.tier,
      total: calc.total,
      expiresAt,
      shopName: req.shop_name,
      username: req.owner_username,
      phone: String(req.payer_phone || req.owner_phone),
    };
  });

export const rejectPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; reason: string }) => z.object({ requestId: z.string().min(1).max(200), reason: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const reason = data.reason.trim() || "MoMo transaction could not be confirmed";
    const { data: req, error: readError } = await ctx.supabase
      .from("payment_requests")
      .select("owner_username,status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (readError || !req) throw new Error("Payment request not found.");
    if (req.status !== "PENDING_VERIFICATION") {
      throw new Error("Only pending payment claims can be rejected. Refresh the queue to see the latest status.");
    }
    const { data: rejected, error } = await ctx.supabase
      .from("payment_requests")
      .update({ status: "REJECTED", rejection_reason: reason, verified_by_admin: admin.label, updated_at: Date.now() })
      .eq("id", data.requestId)
      .eq("status", "PENDING_VERIFICATION")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rejected) throw new Error("Another administrator changed this payment first. Refresh the queue.");
    await audit(ctx, admin.email, "REJECT_PAYMENT", `@${req.owner_username ?? data.requestId}`, reason);
    return { ok: true };
  });

const whatsappClaimSchema = z.object({
  shopName: z.string().trim().min(2).max(120),
  username: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  ownerPhone: z.string().trim().min(9).max(30),
  provider: z.enum(["MTN MoMo", "Airtel Money"]),
  payerPhone: z.string().trim().min(9).max(30),
  payerName: z.string().trim().min(2).max(120),
  paymentTimeMs: z.number().int().positive().optional(),
  paymentNote: z.string().trim().max(1000).default(""),
  months: z.number().int().refine((value) => [1, 3, 6, 12].includes(value)),
  branches: z.number().int().min(1).max(100),
  workers: z.number().int().min(1).max(500),
  devices: z.number().int().min(1).max(100),
});

export const createWhatsAppPaymentClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof whatsappClaimSchema>) => whatsappClaimSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const provider = data.provider;

    const { data: config } = await ctx.supabase
      .from("app_config")
      .select("per_device_fee_rwf")
      .eq("id", "global")
      .maybeSingle();
    const feePerDeviceRwf = Math.max(0, Number(config?.per_device_fee_rwf) || 2000);
    const calc = calculateSubscriptionFee(
      data.branches,
      data.workers,
      data.months,
      data.devices,
      feePerDeviceRwf,
    );
    const now = Date.now();
    const id = `WA-${crypto.randomUUID()}`;
    const { data: claim, error } = await ctx.supabase
      .from("payment_requests")
      .insert({
        id,
        shop_name: data.shopName,
        owner_username: data.username.trim().toLowerCase(),
        owner_phone: data.ownerPhone.trim(),
        provider,
        ussd_code: "MANUAL_WHATSAPP_PROOF",
        payer_phone: data.payerPhone.trim(),
        payer_full_name: data.payerName.trim(),
        amount_rwf: calc.total,
        duration_months: data.months,
        branch_count: data.branches,
        worker_count: data.workers,
        device_count: data.devices,
        fee_per_device_rwf: feePerDeviceRwf,
        payment_time_ms: Number(data.paymentTimeMs || now),
        payment_note: data.paymentNote.trim(),
        status: "PENDING_VERIFICATION",
        approval_mode: "",
        generated_unlock_code: "",
        verified_by_admin: admin.label,
        rejection_reason: "",
        source: "WHATSAPP",
        created_at: now,
        updated_at: now,
      })
      .select("id, shop_name, owner_username, amount_rwf")
      .single();

    if (error) {
      throw new Error(`Could not save this WhatsApp payment claim: ${error.message}`);
    }
    await audit(
      ctx,
      admin.email,
      "CREATE_WHATSAPP_PAYMENT_CLAIM",
      id,
      `Manual WhatsApp proof recorded for @${data.username} (${calc.total} FRw; ${data.months} months; ${data.branches} branches; ${data.workers} staff; ${data.devices} devices).`,
    );
    return { ok: true, id: claim.id, amount: calc.total, days: calc.days, tier: calc.tier };
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
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    throw new Error("Unlock codes can only be issued from an existing, manually verified payment request in the Payments queue.");
  });

export type UnlockCodeLookupResult = {
  found: boolean;
  code: string;
  format: "BB3" | "BB2" | "UNKNOWN";
  valid: boolean;
  message: string;
  status: string;
  shopUsername?: string;
  shopPhone?: string;
  tier?: string;
  days?: number;
  amountRwf?: number;
  issuedAt?: number | string | null;
  redeemedAt?: number | string | null;
  issuedBy?: string | null;
  signatureValid: boolean | null;
  accountBindingValid: boolean;
  expired: boolean;
};

export const lookupUnlockCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) =>
    z.object({ code: z.string().trim().min(8).max(512) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<UnlockCodeLookupResult> => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    const raw = data.code.replace(/\\s+/g, "");
    const rawParts = raw.split("-");
    const prefix = String(rawParts[0] ?? "").toUpperCase();
    const code = prefix === "BB3" && rawParts.length === 7
      ? [prefix, rawParts[1]?.toUpperCase(), rawParts[2], rawParts[3]?.toUpperCase(), rawParts[4]?.toUpperCase(), rawParts[5]?.toUpperCase(), rawParts[6]].join("-")
      : prefix === "BB2" ? rawParts.map((part) => part.toUpperCase()).join("-") : raw;
    const { data: row, error } = await ctx.supabase
      .from("unlock_codes")
      .select("id,unlock_code,shop_username,shop_phone,tier_code,plan_days,amount_rwf,status,issued_at,redeemed_at,issued_by_admin,plan_digest")
      .eq("unlock_code", code)
      .maybeSingle();
    if (error) throw new Error("Could not search the BeBoss unlock-code registry: " + error.message);
    if (!row) {
      return {
        found: false, code, format: prefix === "BB3" ? "BB3" : prefix === "BB2" ? "BB2" : "UNKNOWN",
        valid: false, message: "No issued BeBoss record matches this code. Check every character and try again.",
        status: "NOT_FOUND", signatureValid: null, accountBindingValid: false, expired: false,
      };
    }

    const { createHash, createPublicKey, createVerify } = await import("node:crypto");
    const parts = code.split("-");
    const format = parts[0] === "BB3" ? "BB3" : parts[0] === "BB2" ? "BB2" : "UNKNOWN";
    const username = String(row.shop_username ?? "").trim().toLowerCase();
    const phone = normalizePlanPhone(String(row.shop_phone ?? ""));
    const accountHash = createHash("sha256").update(username + ":" + phone, "utf8").digest("hex").slice(0, 6).toUpperCase();
    const tier = String(row.tier_code ?? "").trim().toUpperCase();
    const days = Number(row.plan_days);
    const status = String(row.status ?? "UNKNOWN").toUpperCase();
    const expiryText = String(parts[3] ?? "");
    const expiryDay = /^[A-F0-9]{3,8}$/i.test(expiryText) ? Number.parseInt(expiryText, 16) : Number.NaN;
    const expired = !Number.isFinite(expiryDay) || Math.floor(Date.now() / 86_400_000) > expiryDay;
    let signatureValid: boolean | null = null;
    let accountBindingValid = false;

    if (format === "BB3" && parts.length === 7) {
      const [kind, codeTier, codeDays, codeExpiry, codeAccount, nonce, signature] = parts;
      const formatValid = kind === "BB3" &&
        /^[A-Z]{2,12}$/.test(codeTier ?? "") &&
        /^\\d{1,3}$/.test(codeDays ?? "") &&
        /^[A-F0-9]{3,8}$/.test(codeExpiry ?? "") &&
        /^[A-F0-9]{6}$/.test(codeAccount ?? "") &&
        /^[A-F0-9]{24}$/.test(nonce ?? "") &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(signature ?? "");
      accountBindingValid = formatValid &&
        codeTier === tier &&
        Number(codeDays) === days &&
        codeAccount === accountHash &&
        nonce === String(row.plan_digest ?? "").slice(0, 24).toUpperCase();
      if (formatValid) {
        try {
          const verifier = createVerify("SHA256");
          verifier.update("BB3:" + codeTier + ":" + codeDays + ":" + codeExpiry + ":" + codeAccount + ":" + nonce, "utf8");
          verifier.end();
          signatureValid = verifier.verify(
            { key: createPublicKey(BB3_ANDROID_PUBLIC_KEY_PEM), dsaEncoding: "der" },
            Buffer.from(signature, "base64"),
          );
        } catch {
          signatureValid = false;
        }
      } else {
        signatureValid = false;
      }
    } else if (format === "BB2" && parts.length === 6) {
      const [kind, codeTier, codeDays, codeExpiry, codeAccount, nonce] = parts;
      accountBindingValid = kind === "BB2" &&
        /^[A-Z]{2,12}$/.test(codeTier ?? "") &&
        /^\\d{1,3}$/.test(codeDays ?? "") &&
        /^[A-F0-9]{3,8}$/.test(codeExpiry ?? "") &&
        /^[A-F0-9]{6}$/.test(codeAccount ?? "") &&
        /^[A-F0-9]{8}$/.test(nonce ?? "") &&
        codeTier === tier &&
        Number(codeDays) === days &&
        codeAccount === accountHash;
    }

    const valid = format !== "UNKNOWN" &&
      (format === "BB3" ? signatureValid === true : accountBindingValid) &&
      accountBindingValid &&
      !expired &&
      status === "ISSUED";
    const message = !accountBindingValid
      ? "The code does not match the account, plan or original issue record."
      : format === "BB3" && signatureValid !== true
        ? "The BB3 ECDSA signature is invalid. Do not activate this code."
        : expired
          ? "The code's embedded expiry date has passed."
          : status !== "ISSUED"
            ? "The code exists, but its registry state is " + status + ". It cannot be redeemed again."
            : format === "BB2"
              ? "Legacy BB2 code verified against its original BeBoss issue record. This lookup did not redeem it."
              : "BB3 signature and account binding are valid. This lookup did not redeem the code.";

    return {
      found: true, code, format, valid, message, status,
      shopUsername: String(row.shop_username ?? ""),
      shopPhone: String(row.shop_phone ?? ""),
      tier, days, amountRwf: Number(row.amount_rwf) || 0,
      issuedAt: row.issued_at ?? null, redeemedAt: row.redeemed_at ?? null,
      issuedBy: row.issued_by_admin ?? null, signatureValid, accountBindingValid, expired,
    };
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
const paymentPhoneSchema = z.string().trim().max(20).refine(
  (value) => !value || /^\+?[0-9\s()-]{9,20}$/.test(value),
  "Enter a valid mobile-money phone number (include country code when needed).",
);

const configSchema = z.object({
  admin_whatsapp_number: z.string().trim().max(30),
  mtn_momo_code: z.string().trim().max(20).refine(
    (value) => !value || /^\d{4,20}$/.test(value),
    "MTN merchant code must contain 4–20 digits.",
  ),
  mtn_momo_phone: paymentPhoneSchema,
  mtn_recipient_name: z.string().trim().max(80),
  airtel_money_phone: paymentPhoneSchema,
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

export const getBb3SigningStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    try {
      return await invokeSupabaseEdgeFunction<{ configured: boolean; message: string }>(
        ctx,
        "manage-app-secrets",
        { action: "bb3_status" },
      );
    } catch (error) {
      return {
        configured: false,
        message: error instanceof Error
          ? error.message
          : "The BB3 signing service could not be reached. Check the Supabase Edge Function deployment.",
      };
    }
  });

export const setSigningSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { value: string }) => z.object({ value: z.string().trim().min(120, "Paste a complete PKCS#8 P-256 private key PEM").max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const result = await invokeSupabaseEdgeFunction<{ ok: boolean; message?: string }>(
      ctx,
      "manage-app-secrets",
      { action: "bb3_save", value: data.value },
    );
    if (result.ok !== true) throw new Error(result.message || "The BB3 private key could not be saved.");
    await audit(ctx, admin.email, "SET_BB3_PRIVATE_KEY", "BEBOSS_UNLOCK_ECDSA_PRIVATE_KEY_PEM", "Android-matching BB3 private key verified and stored in Supabase (value never logged)");
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
