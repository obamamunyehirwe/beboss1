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
  if (!data) throw new Error(allowSupport ? "Forbidden: BeBoss admin-team access required." : "Forbidden: master admin access required.");
  const email = String(context.claims?.email ?? "admin");
  return { email, label: `BeBoss Admin (${email})` };
}

async function requirePermission(context: Ctx, permission: string) {
  const { data, error } = await context.supabase.rpc("has_admin_permission", { p_permission: permission });
  if (error) throw new Error(`Permission check failed: ${error.message}`);
  if (data !== true) throw new Error(`Forbidden: the assigned admin role does not include ${permission}.`);
  const email = String(context.claims?.email ?? "admin");
  return { email, label: `BeBoss Admin (${email})` };
}



async function audit(context: Ctx, email: string, action: string, target: string, details: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_logs").insert({
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
async function perDeviceRate(_context: Ctx): Promise<number> {
  return 2_000;
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
    const [adminResult, staffResult, permissionResult, profileResult] = await Promise.all([
      ctx.supabase.rpc("is_beboss_admin"),
      ctx.supabase.rpc("is_beboss_staff"),
      (ctx.supabase as any).rpc("current_admin_permissions"),
      ctx.supabase.from("admin_profiles").select("role").eq("user_id", ctx.userId).maybeSingle(),
    ]);
    if (adminResult.error || staffResult.error || permissionResult.error) {
      console.error("[BeBoss admin auth] Supabase role verification failed", adminResult.error ?? staffResult.error ?? permissionResult.error);
      throw new Error("BeBoss could not verify this account's admin permissions. Please retry.");
    }
    const isAdmin = adminResult.data;
    const isStaff = staffResult.data;
    const permissions = Array.isArray(permissionResult.data) ? permissionResult.data as string[] : [];
    const roleKey = String(profileResult.data?.role ?? (isAdmin ? "SUPER_ADMIN" : "SUPPORT"));
    let signingKeyConfigured = false;
    if (isAdmin) {
      try {
        const status = await invokeSupabaseEdgeFunction<{ configured?: boolean }>(ctx, "manage-app-secrets", { action: "bb3_status" });
        signingKeyConfigured = status.configured === true;
      } catch (error) {
        console.error("[BeBoss admin auth] BB3 key status is temporarily unavailable", error);
      }
    }
    return { isAdmin: !!isAdmin, isStaff: !!isStaff, roleKey, permissions, email: String(ctx.claims?.email ?? ""), signingKeyConfigured };
  });

// ---------------- Payments ----------------
export const approvePaymentWithCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; providerVerified: true; verificationNote?: string }) =>
    z.object({ requestId: z.string().min(1).max(200), providerVerified: z.literal(true), verificationNote: z.string().trim().max(500).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: req, error } = await ctx.supabase.from("payment_requests").select("id,shop_name,owner_username,owner_phone,device_challenge,provider,payer_phone,payer_full_name,amount_rwf,duration_months,branch_count,worker_count,device_count,payment_time_ms,payment_note,admin_verification_note,fee_per_device_rwf,status,approval_mode,generated_unlock_code,verified_by_admin,rejection_reason,source,created_at,updated_at,ussd_code,gateway_provider,gateway_reference,gateway_transaction_id,gateway_amount_rwf,gateway_currency,gateway_verified_at").eq("id", data.requestId).maybeSingle();
    if (error || !req) throw new Error("Payment request not found.");
    const gatewayVerified = Number(req.gateway_verified_at) > 0 &&
      String(req.gateway_currency ?? "") === "RWF" &&
      Number(req.gateway_amount_rwf) === Number(req.amount_rwf) &&
      Boolean(String(req.gateway_reference ?? "").trim()) &&
      Boolean(String(req.gateway_transaction_id ?? "").trim());
    const manualVerificationNote = String(data.verificationNote ?? "").trim();
    const alreadyFinalized = ["APPROVED", "REDEEMED"].includes(String(req.status));
    if (!alreadyFinalized && !gatewayVerified && (data.providerVerified !== true || manualVerificationNote.length < 5)) {
      throw new Error("This payment has no verified gateway settlement. Record the provider transaction check before issuing an unlock code.");
    }
    const verificationNote = gatewayVerified
      ? `Automated ${String(req.gateway_provider)} verification: reference ${String(req.gateway_reference)}; transaction ${String(req.gateway_transaction_id)}; amount ${Number(req.gateway_amount_rwf)} RWF; verified ${new Date(Number(req.gateway_verified_at)).toISOString()}.`
      : manualVerificationNote;

    const { shopId } = await requireRegisteredPaymentShop(ctx, req);
    const trustedFeeRate = 2000;
    const calc = calculateSubscriptionFee(req.branch_count, req.worker_count, req.duration_months, req.device_count || 1, trustedFeeRate);
    if (Number(req.amount_rwf) !== calc.total) {
      throw new Error(`Payment amount mismatch. Submitted ${Number(req.amount_rwf || 0)} FRw; this plan calculates to ${calc.total} FRw. Refresh and verify the payment details before issuing a code.`);
    }

    const paymentTimeMs = Math.max(0, Number(req.payment_time_ms || req.created_at || Date.now()));
    const payerPhone = String(req.payer_phone || req.owner_phone);
    const payerFullName = String(req.payer_full_name || "");
    const paymentNote = String(req.payment_note || "");

    if (req.status === "APPROVED" || req.status === "REDEEMED") {
      if (!req.generated_unlock_code || req.approval_mode !== "UNLOCK_CODE") {
        if (req.approval_mode === "DIRECT_AUTO_UNLOCK" || !req.generated_unlock_code) {
          throw new Error("This payment has already been activated directly in BeBoss Cloud. No unlock code is required; refresh the shop to synchronize its subscription.");
        }
        throw new Error("This payment has already been redeemed. A replacement unlock code will not be issued.");
      }
      const { data: existingCode, error: codeError } = await ctx.supabase
        .from("unlock_codes").select("payment_request_id, unlock_code, plan_digest, status")
        .eq("unlock_code", req.generated_unlock_code).maybeSingle();
      if (codeError || !existingCode || existingCode.payment_request_id !== req.id ||
          !["ISSUED", "REDEEMED"].includes(String(existingCode.status))) {
        throw new Error("This payment has no active payment-linked unlock record. Contact the master administrator; no replacement code was issued.");
      }
      const shop = await getShop(ctx, shopId);
      return { code: req.generated_unlock_code, alreadyApproved: true, days: calc.days, tier: calc.tier, total: calc.total, expiresAt: Number(shop?.subscription_expires_at ?? 0), shopName: req.shop_name, username: req.owner_username, phone: payerPhone, alreadyRedeemed: req.status === "REDEEMED" };
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
      const { data: latest } = await ctx.supabase.from("payment_requests")
        .select("status,approval_mode,generated_unlock_code").eq("id", req.id).maybeSingle();
      if (["APPROVED", "REDEEMED"].includes(String(latest?.status)) && latest?.generated_unlock_code) {
        const { data: linkedCode } = await ctx.supabase.from("unlock_codes")
          .select("id,unlock_code,plan_digest,status").eq("payment_request_id", req.id)
          .in("status", ["ISSUED", "REDEEMED"]).maybeSingle();
        if (linkedCode && linkedCode.unlock_code === latest.generated_unlock_code &&
            linkedCode.unlock_code === codeToUse && linkedCode.plan_digest === expectedPlanDigest) {
          const { data: activeShop } = await ctx.supabase.from("shop_accounts")
            .select("subscription_expires_at").eq("id", shopId).maybeSingle();
          return { code: linkedCode.unlock_code, days: calc.days, tier: calc.tier, total: calc.total,
            expiresAt: Number(activeShop?.subscription_expires_at ?? 0), shopName: req.shop_name,
            username: req.owner_username, phone: payerPhone, alreadyApproved: true,
            alreadyRedeemed: latest.status === "REDEEMED" };
        }
      }
      if (latest?.status === "APPROVED" && latest.approval_mode === "DIRECT_AUTO_UNLOCK" && !latest.generated_unlock_code) {
        throw new Error("This payment was already activated directly in BeBoss Cloud. Refresh the shop; a second unlock code is not needed.");
      }
      if (latest?.status === "REDEEMED") {
        throw new Error("This payment has already been redeemed. BeBoss will not issue a replacement code.");
      }
      if (insertedNewCode) {
        await ctx.supabase.from("unlock_codes").update({ status: "REVOKED" }).eq("id", unlockCodeId).eq("status", "ISSUED");
      }
      if (claim.error) {
        console.error("[payment approval] Conditional payment update failed", {
          requestId: req.id,
          code: claim.error.code,
          message: claim.error.message,
        });
        throw new Error("BeBoss could not save this payment approval: " + claim.error.message);
      }
      const latestStatus = String(latest?.status ?? "UNKNOWN").toLowerCase().replaceAll("_", " ");
      throw new Error("This payment is now " + latestStatus + ". Refresh the payment queue before taking another action.");
    }

    const expiresAt = await activateShop(ctx, shopId, { addDays: calc.days, branches: req.branch_count, workers: req.worker_count, devices: req.device_count || 1, monthly: calc.monthly });
    await audit(ctx, admin.email, "APPROVE_PAYMENT", `@${req.owner_username}`, `Provider verification evidence: ${verificationNote}. Customer SMS: ${paymentNote || "not supplied"}. ${payerFullName || payerPhone}; ${req.provider}; ${calc.total} FRw; ${req.duration_months} months / ${req.branch_count} branches / ${req.worker_count} staff / ${req.device_count || 1} devices. Unique BB3 code issued for ${req.id}.`);
    return { code: codeToUse, days: calc.days, tier: calc.tier, total: calc.total, expiresAt, shopName: req.shop_name, username: req.owner_username, phone: payerPhone, alreadyApproved: false };
  });

export const directAutoUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; providerVerified: true; verificationNote?: string }) =>
    z.object({
      requestId: z.string().min(1).max(200),
      providerVerified: z.literal(true),
      verificationNote: z.string().trim().max(500).default(""),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { data: req, error } = await ctx.supabase
      .from("payment_requests")
      .select("id,shop_name,owner_username,owner_phone,provider,payer_phone,payer_full_name,amount_rwf,duration_months,branch_count,worker_count,device_count,fee_per_device_rwf,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,verified_by_admin,rejection_reason,source,created_at,updated_at,gateway_provider,gateway_reference,gateway_transaction_id,gateway_amount_rwf,gateway_currency,gateway_verified_at")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error || !req) throw new Error("Payment request not found.");
    const gatewayVerified = Number(req.gateway_verified_at) > 0 &&
      String(req.gateway_currency ?? "") === "RWF" &&
      Number(req.gateway_amount_rwf) === Number(req.amount_rwf) &&
      Boolean(String(req.gateway_reference ?? "").trim()) &&
      Boolean(String(req.gateway_transaction_id ?? "").trim());
    const manualVerificationNote = String(data.verificationNote ?? "").trim();
    const alreadyFinalized = req.status === "APPROVED";
    if (!alreadyFinalized && !gatewayVerified && (data.providerVerified !== true || manualVerificationNote.length < 5)) {
      throw new Error("This payment has no verified gateway settlement. Record the provider transaction check before activating the shop.");
    }
    const verificationNote = gatewayVerified
      ? `Automated ${String(req.gateway_provider)} verification: reference ${String(req.gateway_reference)}; transaction ${String(req.gateway_transaction_id)}; amount ${Number(req.gateway_amount_rwf)} RWF; verified ${new Date(Number(req.gateway_verified_at)).toISOString()}.`
      : manualVerificationNote;

    const { shopId } = await requireRegisteredPaymentShop(ctx, req);
    const feePerDeviceRwf = 2_000;
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
      if ((latest?.status === "APPROVED" || latest?.status === "REDEEMED") && latest.generated_unlock_code) {
        throw new Error(latest.status === "REDEEMED"
          ? "This payment was already redeemed with its existing unlock code. A second cloud activation was not performed."
          : "This payment was already approved with an unlock code. Deliver the existing code instead of activating it a second time.");
      }
      throw new Error("The payment changed while direct activation was being saved. Refresh the queue and inspect the current status.");
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
      `Direct cloud activation after provider verification: ${verificationNote}. ${req.payer_full_name || req.payer_phone || req.owner_phone}; ${req.provider}; ${calc.total} FRw; ${req.duration_months} months / ${req.branch_count} branches / ${req.worker_count} staff / ${req.device_count || 1} devices. No unlock code issued.`,
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
    if (error) {
      console.error("[payment rejection] Conditional payment update failed", {
        requestId: data.requestId,
        code: error.code,
        message: error.message,
      });
      throw new Error("BeBoss could not save the payment rejection: " + error.message);
    }
    if (!rejected) {
      const { data: latest, error: latestError } = await ctx.supabase
        .from("payment_requests")
        .select("status,rejection_reason")
        .eq("id", data.requestId)
        .maybeSingle();
      if (latestError) throw new Error("Payment status changed, and BeBoss could not refresh it. Reload the queue.");
      if (latest?.status === "REJECTED" && latest.rejection_reason === reason) {
        return { ok: true, alreadyRejected: true };
      }
      const latestStatus = String(latest?.status ?? "UNKNOWN").toLowerCase().replaceAll("_", " ");
      throw new Error("This payment is now " + latestStatus + ". Refresh the payment queue before taking another action.");
    }
    await audit(ctx, admin.email, "REJECT_PAYMENT", `@${req.owner_username ?? data.requestId}`, reason);
    return { ok: true, alreadyRejected: false };
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

    const feePerDeviceRwf = 2_000;
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
        fee_per_device_rwf: 2_000,
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
      currentVersion: config?.apk_version || "2.3.0",
      minimumVersion: config?.min_app_version || "2.3.0",
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
    const admin = await requirePermission(ctx, "users.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user, error: readError } = await supabaseAdmin.from("shop_users").select("username,full_name,role,shop_name").eq("id", data.id).maybeSingle();
    if (readError || !user) throw new Error(readError?.message ?? "Staff account not found.");
    if (user.role === "OWNER") throw new Error("Platform staff managers cannot change an owner account. Ask a Super Admin.");
    const patch: Record<string, unknown> = { updated_at: Date.now() };
    if (data.role) patch["role"] = data.role;
    if (data.isActive != null) patch["is_active"] = data.isActive;
    const { error } = await supabaseAdmin.from("shop_users").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, data.role ? "UPDATE_USER_ROLE" : "TOGGLE_USER", "@" + user.username, JSON.stringify({ role: data.role, active: data.isActive, shop: user.shop_name }));
    return { ok: true };
  });

export const deleteShopUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requirePermission(ctx, "users.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user, error: readError } = await supabaseAdmin.from("shop_users").select("username,role,shop_name").eq("id", data.id).maybeSingle();
    if (readError || !user) throw new Error(readError?.message ?? "Staff account not found.");
    if (user.role === "OWNER") throw new Error("Platform staff managers cannot remove an owner account. Ask a Super Admin.");
    const { error } = await supabaseAdmin.from("shop_users").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "DELETE_USER", "@" + user.username, "Removed from " + user.shop_name);
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
  min_app_version: z.string().trim().max(20),
  support_email: z.string().trim().max(200),
});

export const saveAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof configSchema>) => configSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { error } = await ctx.supabase.from("app_config").upsert({ id: "global", ...data, per_device_fee_rwf: 2_000, min_app_version: data.min_app_version || "2.3.0", updated_at: Date.now() });
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "SAVE_APP_CONFIG", "global", `MTN ${data.mtn_momo_code || data.mtn_momo_phone} • Airtel ${data.airtel_money_phone} • device 2000 FRw/month • APK ${data.apk_version}`);
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
    const admin = await requirePermission(ctx, "releases.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
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
        is_current: false,
        created_by: admin.email,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (data.make_current) {
      const { error: currentError } = await ctx.supabase.rpc("admin_set_current_app_release", {
        p_release_id: row.id,
        p_download_url: data.public_download_url,
      });
      if (currentError) {
        await supabaseAdmin.storage.from("releases").remove([data.file_path]);
        await supabaseAdmin.from("app_releases").delete().eq("id", row.id);
        throw new Error(currentError.message);
      }
    }
    await audit(ctx, admin.email, "PUBLISH_RELEASE", data.version_name, `${data.file_name} (${data.size_bytes} bytes)${data.make_current ? " — now current" : ""}`);
    return { id: row.id as string };
  });

export const setCurrentRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; public_download_url: string }) => z.object({ id: z.string().uuid(), public_download_url: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requirePermission(ctx, "releases.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rel, error: readError } = await supabaseAdmin.from("app_releases").select("version_name").eq("id", data.id).maybeSingle();
    if (readError || !rel) throw new Error(readError?.message ?? "Release not found.");
    const { error } = await ctx.supabase.rpc("admin_set_current_app_release", {
      p_release_id: data.id,
      p_download_url: data.public_download_url,
    });
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "SET_CURRENT_RELEASE", rel.version_name, "Marked as current download");
    return { ok: true };
  });

export const deleteRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rel } = await supabaseAdmin.from("app_releases").select("*").eq("id", data.id).maybeSingle();
    if (!rel) throw new Error("Release not found.");
    if (rel.is_current) throw new Error("Make another release current before deleting this one.");
    await supabaseAdmin.storage.from("releases").remove([rel.file_path]);
    const { error } = await supabaseAdmin.from("app_releases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "DELETE_RELEASE", rel.version_name, rel.file_name);
    return { ok: true };
  });

export const getAdminReleaseDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "releases.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: release, error: readError } = await supabaseAdmin.from("app_releases").select("file_path,file_name").eq("id", data.id).maybeSingle();
    if (readError || !release) throw new Error(readError?.message ?? "Release not found.");
    if (!release.file_path) throw new Error("This archived release has no stored APK file.");
    const { data: signed, error } = await supabaseAdmin.storage.from("releases").createSignedUrl(release.file_path, 10 * 60, { download: release.file_name });
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Could not create a private admin download link.");
    return { url: signed.signedUrl, expiresInSeconds: 600, fileName: release.file_name };
  });

export const updateRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; version_name: string; version_code: number; min_android: string; release_notes: string }) =>
    z.object({
      id: z.string().uuid(),
      version_name: z.string().trim().regex(/^[0-9]+([.][0-9]+){0,3}$/).max(40),
      version_code: z.number().int().min(1).max(1_000_000),
      min_android: z.string().trim().min(1).max(40),
      release_notes: z.string().max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requirePermission(ctx, "releases.manage");
    const { error } = await ctx.supabase.rpc("admin_update_app_release", {
      p_release_id: data.id,
      p_version_name: data.version_name,
      p_version_code: data.version_code,
      p_min_android: data.min_android,
      p_release_notes: data.release_notes,
    });
    if (error) throw new Error(error.message);
    // Auditing is best-effort: a logging outage must never turn a successful
    // release update into a reported failure.
    await audit(ctx, admin.email, "UPDATE_APP_RELEASE", data.id, `v${data.version_name} (code ${data.version_code})`)
      .catch(() => console.warn("[BeBoss audit] Release metadata changed, but the audit event could not be recorded."));
    return { ok: true };
  });

export const setArchivedReleaseVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { isPublic: boolean }) => z.object({ isPublic: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requirePermission(ctx, "releases.manage");
    const { data: updatedCount, error } = await ctx.supabase.rpc("admin_set_archived_release_visibility", {
      p_is_public: data.isPublic,
    });
    if (error) throw new Error(error.message);
    await audit(
      ctx,
      admin.email,
      data.isPublic ? "SHOW_ALL_ARCHIVED_RELEASES" : "HIDE_ALL_ARCHIVED_RELEASES",
      "app_releases",
      `Updated public visibility for ${Number(updatedCount ?? 0)} archived release(s).`,
    ).catch(() => console.warn("[BeBoss audit] Archived release visibility changed, but the audit event could not be recorded."));
    return { ok: true, updatedCount: Number(updatedCount ?? 0) };
  });

export const setReleaseVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; isPublic: boolean }) => z.object({ id: z.string().uuid(), isPublic: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requirePermission(ctx, "releases.manage");
    const { error } = await ctx.supabase.rpc("admin_set_app_release_visibility", {
      p_release_id: data.id,
      p_is_public: data.isPublic,
    });
    if (error) throw new Error(error.message);
    await audit(
      ctx,
      admin.email,
      data.isPublic ? "SHOW_RELEASE_PUBLICLY" : "HIDE_RELEASE_PUBLICLY",
      data.id,
      "Updated archived APK public visibility.",
    ).catch(() => console.warn("[BeBoss audit] Release visibility changed, but the audit event could not be recorded."));
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
    const admin = await requirePermission(ctx, "inbox.manage");
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
    const admin = await requirePermission(ctx, "inbox.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: message, error: readError } = await supabaseAdmin.from("contact_messages").select("name,email,status").eq("id", data.id).maybeSingle();
    if (readError || !message) throw new Error(readError?.message ?? "Inbox message not found.");
    const { error } = await supabaseAdmin.from("contact_messages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "DELETE_INBOX_MESSAGE", data.id, String(message.status ?? "unknown"));
    return { ok: true };
  });

// ---------------- Team ----------------
// Auth Admin directory operations run inside Supabase, not inside Vercel's
// TanStack runtime. The Edge Function independently verifies the caller.
export const listTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    return invokeSupabaseEdgeFunction<{ members: Array<Record<string, unknown>>; me: string }>(
      ctx, "admin-team", { action: "list" },
    );
  });

export const grantTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; role: string }) => z.object({
    email: z.string().trim().email().max(200),
    role: z.enum(["SUPER_ADMIN", "RELEASE_MANAGER", "ANNOUNCEMENT_MANAGER", "DEVICE_AUDITOR", "SUPPORT", "FINANCE_REVIEWER", "ANALYST", "OPERATIONS_MANAGER", "STAFF_MANAGER"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    return invokeSupabaseEdgeFunction<{
      ok: boolean; invited: boolean; email: string; role: string;
      permissions: string[]; auditWarning?: string;
    }>(ctx, "admin-team", { action: "grant", email: data.email, role: data.role });
  });

export const revokeTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    return invokeSupabaseEdgeFunction<{ ok: boolean; auditWarning?: string }>(
      ctx, "admin-team", { action: "revoke", userId: data.userId },
    );
  });

/**
 * Immediately revokes a shop owner's authenticated website membership.
 * Existing access tokens stop authorizing My Shop server functions because
 * every request rechecks the active membership row.
 */
export const revokeShopOwnerMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; shopId: string }) =>
    z.object({ userId: z.string().uuid(), shopId: z.string().trim().min(3).max(160) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = Date.now();
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("shop_owner_memberships")
      .update({ status: "REVOKED", revoked_at: now })
      .eq("user_id", data.userId)
      .eq("shop_id", data.shopId)
      .eq("status", "ACTIVE")
      .eq("revoked_at", 0)
      .select("id")
      .maybeSingle();
    if (membershipError) throw new Error("Could not revoke the owner session.");
    if (!membership) throw new Error("No active owner membership was found for this user and shop.");
    await audit(ctx, admin.email, "REVOKE_SHOP_OWNER", data.shopId, `Revoked owner user ${data.userId}; membership ${membership.id}.`);
    return { ok: true, revokedAt: now };
  });


export const listShopOwnerMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string }) => z.object({ shopId: z.string().trim().min(3).max(160) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships, error } = await supabaseAdmin
      .from("shop_owner_memberships")
      .select("id,user_id,owner_username,owner_phone,status,created_at,last_verified_at,revoked_at")
      .eq("shop_id", data.shopId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Could not load shop owner membership records.");
    return memberships ?? [];
  });

const gatewayRefundSchema = z.object({
  action: z.enum(["REQUEST", "RECONCILE"]),
  requestId: z.string().trim().min(3).max(200),
  amountRwf: z.number().int().positive().max(1_000_000_000).optional(),
  reason: z.string().trim().min(5).max(500).optional(),
  idempotencyKey: z.string().trim().min(16).max(200).optional(),
});

export const managePaymentGatewayRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof gatewayRefundSchema>) => gatewayRefundSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireAdmin(ctx);
    if (data.action === "REQUEST" && (!data.amountRwf || !data.reason || !data.idempotencyKey)) {
      throw new Error("A refund amount, reason and idempotency key are required.");
    }
    return invokeSupabaseEdgeFunction<{
      ok?: boolean;
      pending?: boolean;
      message?: string;
      refundId?: string;
      refund?: { refund_id?: string; refund_status?: string; status?: string; total_refunded_rwf?: number };
    }>(ctx, "manage-payment-refund", data);
  });



// ---------------- Local desktop releases ----------------
const desktopPlatformSchema = z.enum(["windows", "macos", "linux"]);

const desktopReleaseUploadSchema = z.object({
  platform: desktopPlatformSchema,
  version_name: z.string().trim().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Use a semantic version such as 1.3.1.").max(40),
  source_manifest_version: z.string().trim().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Select a valid local desktop/package.json manifest.").max(40),
  file_path: z.string().trim().min(1).max(500),
  file_name: z.string().trim().min(1).max(200),
  size_bytes: z.number().int().positive().max(536870912),
  sha256: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  release_notes: z.string().max(5000).default(""),
  make_current: z.boolean().default(true),
});

const DESKTOP_SOURCE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// Desktop versions are verified against the package.json selected from the
// administrator's local working copy. Publishing never fetches source files
// or installer binaries from GitHub.

export const getAdminDesktopReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "releases.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("desktop_app_releases")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(120);
    if (error) throw new Error("Could not load desktop release history: " + error.message);
    return data ?? [];
  });

export const publishDesktopRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof desktopReleaseUploadSchema>) => desktopReleaseUploadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requirePermission(ctx, "releases.manage");
    if (data.version_name !== data.source_manifest_version) {
      throw new Error(
        "The release version does not match the version in the local desktop/package.json you selected. Select the package.json from the same source checkout used to build this installer.",
      );
    }
    const expectedExtension = data.platform === "windows" ? ".exe" : data.platform === "macos" ? ".dmg" : ".appimage";
    if (!data.file_name.toLowerCase().endsWith(expectedExtension)) {
      throw new Error(`The ${data.platform} release must be a ${expectedExtension} file.`);
    }

    const expectedPrefix = `desktop/${data.platform}/v${data.version_name}/`;
    const pathParts = data.file_path.split("/");
    if (!data.file_path.startsWith(expectedPrefix) || pathParts.length !== 4 ||
        pathParts.some((part) => !part || part === "." || part === "..") ||
        !pathParts[3].endsWith("-" + data.file_name)) {
      throw new Error("The uploaded file path does not match this platform and version. Re-select the local installer and upload again.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folder = pathParts.slice(0, 3).join("/");
    const { data: storedFiles, error: storageError } = await supabaseAdmin.storage
      .from("releases")
      .list(folder, { limit: 100, search: pathParts[3] });
    if (storageError) throw new Error("Could not verify the uploaded installer in private storage: " + storageError.message);
    const storedFile = (storedFiles ?? []).find((item) => item.name === pathParts[3]);
    if (!storedFile) throw new Error("The uploaded installer was not found in private release storage.");
    const storedSize = Number((storedFile.metadata as Record<string, unknown> | null)?.size);
    if (Number.isFinite(storedSize) && storedSize > 0 && storedSize !== data.size_bytes) {
      await supabaseAdmin.storage.from("releases").remove([data.file_path]);
      throw new Error("The uploaded file size does not match the file selected in the admin page.");
    }

    const { data: row, error } = await supabaseAdmin
      .from("desktop_app_releases")
      .insert({
        platform: data.platform,
        version_name: data.version_name,
        file_path: data.file_path,
        file_name: data.file_name,
        size_bytes: data.size_bytes,
        sha256: data.sha256.toLowerCase(),
        release_notes: data.release_notes,
        is_current: false,
        is_public: false,
        created_by: admin.email,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error(`A ${data.platform} installer for version ${data.version_name} already exists. Use a new version or remove the draft after reviewing it.`);
      }
      throw new Error("Could not save desktop release metadata: " + error.message);
    }

    if (data.make_current) {
      const { error: currentError } = await ctx.supabase.rpc("admin_set_current_desktop_release", {
        p_release_id: row.id,
      });
      if (currentError) {
        await supabaseAdmin.from("desktop_app_releases").delete().eq("id", row.id);
        await supabaseAdmin.storage.from("releases").remove([data.file_path]);
        throw new Error(currentError.message);
      }
    }

    await audit(
      ctx,
      admin.email,
      "PUBLISH_DESKTOP_RELEASE",
      `${data.platform} v${data.version_name}`,
      `${data.file_name} (${data.size_bytes} bytes, SHA-256 ${data.sha256.toLowerCase()})${data.make_current ? " — now current and public" : " — saved as an unpublished archive"}`,
    ).catch(() => console.warn("[BeBoss audit] Desktop installer published, but its audit event could not be recorded."));
    return { id: row.id as string };
  });

export const cleanupDesktopReleaseUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { file_path: string }) => z.object({ file_path: z.string().trim().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "releases.manage");
    if (!data.file_path.startsWith("desktop/") || data.file_path.split("/").length !== 4) {
      throw new Error("Only an unpublished desktop upload can be cleaned up here.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("desktop_app_releases")
      .select("id")
      .eq("file_path", data.file_path)
      .maybeSingle();
    if (lookupError) throw new Error("Could not verify whether this upload is already published.");
    if (existing) return { removed: false, alreadyPublished: true };
    const { error } = await supabaseAdmin.storage.from("releases").remove([data.file_path]);
    if (error) throw new Error("Could not remove the incomplete desktop upload: " + error.message);
    return { removed: true, alreadyPublished: false };
  });

export const setCurrentDesktopRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requirePermission(ctx, "releases.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: release, error: readError } = await supabaseAdmin
      .from("desktop_app_releases")
      .select("platform,version_name")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !release) throw new Error(readError?.message ?? "Desktop release not found.");
    const { error } = await ctx.supabase.rpc("admin_set_current_desktop_release", { p_release_id: data.id });
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, "SET_CURRENT_DESKTOP_RELEASE", `${release.platform} v${release.version_name}`, "Made this installer the current public download.")
      .catch(() => console.warn("[BeBoss audit] Current desktop release changed, but its audit event could not be recorded."));
    return { ok: true };
  });

export const setDesktopReleaseVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; isPublic: boolean }) =>
    z.object({ id: z.string().uuid(), isPublic: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requirePermission(ctx, "releases.manage");
    const { error } = await ctx.supabase.rpc("admin_set_desktop_release_visibility", {
      p_release_id: data.id,
      p_is_public: data.isPublic,
    });
    if (error) throw new Error(error.message);
    await audit(ctx, admin.email, data.isPublic ? "SHOW_DESKTOP_RELEASE" : "HIDE_DESKTOP_RELEASE", data.id,
      "Updated desktop installer public visibility.")
      .catch(() => console.warn("[BeBoss audit] Desktop release visibility changed, but its audit event could not be recorded."));
    return { ok: true };
  });

export const getAdminDesktopReleaseDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requirePermission(ctx, "releases.manage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: release, error: readError } = await supabaseAdmin
      .from("desktop_app_releases")
      .select("file_path,file_name")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !release) throw new Error(readError?.message ?? "Desktop release not found.");
    const { data: signed, error } = await supabaseAdmin.storage.from("releases")
      .createSignedUrl(release.file_path, 10 * 60, { download: release.file_name });
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Could not create a private installer download link.");
    return { url: signed.signedUrl, expiresInSeconds: 600, fileName: release.file_name };
  });

export const deleteDesktopRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: release, error: readError } = await supabaseAdmin
      .from("desktop_app_releases")
      .select("platform,version_name,file_path,file_name,is_current")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !release) throw new Error(readError?.message ?? "Desktop release not found.");
    if (release.is_current) throw new Error("Publish another installer for this platform before deleting the current one.");
    const { error: deleteError } = await supabaseAdmin.from("desktop_app_releases").delete().eq("id", data.id);
    if (deleteError) throw new Error("Could not delete desktop release metadata: " + deleteError.message);
    const { error: storageError } = await supabaseAdmin.storage.from("releases").remove([release.file_path]);
    if (storageError) {
      console.error("[BeBoss release cleanup] Metadata deleted but stored installer cleanup failed.", storageError);
      throw new Error("Release metadata was removed, but the stored installer could not be cleaned up. Contact an administrator.");
    }
    await audit(ctx, admin.email, "DELETE_DESKTOP_RELEASE", `${release.platform} v${release.version_name}`, release.file_name)
      .catch(() => console.warn("[BeBoss audit] Desktop release deleted, but its audit event could not be recorded."));
    return { ok: true };
  });

