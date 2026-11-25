import type React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Activity, Check, Download, KeyRound, LogOut, RefreshCw,
  Search, Settings, ShieldAlert, ShieldCheck, Smartphone, Store, Trash2, Users, Wallet, X
} from "lucide-react";
import { masterAdminAuthClient } from "../../lib/cloud";
import { dateTime, downloadCsv, errorText, id, money, n, s } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard, StatusPill } from "../ui";

type AdminData = {
  shops: Row[]; payments: Row[]; devices: Row[]; users: Row[]; codes: Row[];
  snapshots: Row[]; audit: Row[]; telemetry: Row[]; config: Row | null;
};
type AdminTab = "overview" | "payments" | "shops" | "devices" | "users" | "codes" | "branches" | "audit" | "telemetry" | "settings";
type PaymentDecision = { request: Row; mode: "APPROVE" | "REJECT" };
type ShopDraft = {
  id: string; name: string; branches: number; workers: number; devices: number;
  minimumVersion: string; notes: string; whatsapp: string; killSwitch: boolean;
};
type ConfigDraft = {
  admin_whatsapp_number: string; mtn_momo_code: string; mtn_momo_phone: string;
  mtn_recipient_name: string; airtel_money_phone: string; airtel_recipient_name: string;
  apk_download_url: string; apk_version: string; min_app_version: string; support_email: string;
};
const EMPTY_CONFIG: ConfigDraft = {
  admin_whatsapp_number: "", mtn_momo_code: "", mtn_momo_phone: "", mtn_recipient_name: "",
  airtel_money_phone: "", airtel_recipient_name: "", apk_download_url: "", apk_version: "",
  min_app_version: "2.3.0", support_email: ""
};
const TABS: { id: AdminTab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "shops", label: "Shops", icon: Store },
  { id: "devices", label: "Devices", icon: Smartphone },
  { id: "users", label: "Shop users", icon: Users },
  { id: "codes", label: "Unlock codes", icon: KeyRound },
  { id: "branches", label: "Branch snapshots", icon: Download },
  { id: "audit", label: "Audit trail", icon: ShieldCheck },
  { id: "telemetry", label: "Security telemetry", icon: ShieldAlert },
  { id: "settings", label: "App configuration", icon: Settings }
];

function normalizePhone(value: unknown) {
  return s(value).replace(/\D/g, "").slice(-9);
}
function toHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
async function sha256(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
function feePlan(request: Row) {
  const months = n(request.duration_months);
  const branches = n(request.branch_count);
  const workers = n(request.worker_count);
  const devices = Math.max(1, n(request.device_count) || 1);
  if (![1, 3, 6, 12].includes(months) || !Number.isInteger(branches) || branches < 1 || branches > 100 ||
      !Number.isInteger(workers) || workers < 1 || workers > 500 || !Number.isInteger(devices) || devices < 1 || devices > 100) {
    throw new Error("Saved subscription plan parameters are invalid; this payment cannot be approved.");
  }
  const branchFee = branches === 1 ? 5000 : branches === 2 ? 10000 : 20000;
  const workerFee = workers <= 1 ? 0 : workers <= 3 ? 2000 : workers <= 5 ? 4000 : 4000 + (workers - 5) * 1000;
  const monthly = branchFee + workerFee + (devices - 1) * 2000;
  const gross = monthly * months;
  const discount = months === 12 ? 20 : months === 3 ? 10 : 0;
  const total = gross - Math.floor(gross * discount / 100);
  return {
    months, branches, workers, devices, monthly, total, days: months * 30,
    tier: months >= 12 ? "ANNUAL" : branches >= 3 ? "MULTI" : branches === 2 ? "DUAL" : "SINGLE"
  };
}

async function fetchAll(table: string, columns: string, order: string, cap = 5000): Promise<Row[]> {
  const result: Row[] = [];
  const pageSize = 500;
  for (let from = 0; from < cap; from += pageSize) {
    const { data, error } = await masterAdminAuthClient.from(table).select(columns)
      .order(order, { ascending: false }).range(from, Math.min(from + pageSize - 1, cap - 1));
    if (error) throw new Error(table + ": " + error.message);
    const page = (data ?? []) as Row[];
    result.push(...page);
    if (page.length < pageSize) break;
  }
  return result;
}

async function verifyMasterAdmin(userId: string) {
  const [roleCheck, roleRow, profile] = await Promise.all([
    masterAdminAuthClient.rpc("is_beboss_admin"),
    masterAdminAuthClient.from("user_roles").select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    masterAdminAuthClient.from("admin_profiles").select("user_id,role,is_active,email,full_name")
      .eq("user_id", userId).eq("role", "SUPER_ADMIN").eq("is_active", true).maybeSingle()
  ]);
  if (roleCheck.error || roleRow.error || profile.error) {
    throw new Error("BeBoss could not verify the Master Admin role against Supabase. " +
      (roleCheck.error?.message || roleRow.error?.message || profile.error?.message || ""));
  }
  if (roleCheck.data !== true || !roleRow.data || !profile.data || profile.data.is_active !== true) {
    throw new Error("This account does not have an active BeBoss Master Admin role.");
  }
  return profile.data as Row;
}

export function AdminConsolePage({ onExit }: { onExit?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decision, setDecision] = useState<PaymentDecision | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [shopDraft, setShopDraft] = useState<ShopDraft | null>(null);
  const [configDraft, setConfigDraft] = useState<ConfigDraft>(EMPTY_CONFIG);

  const refreshData = useCallback(async () => {
    setLoadingData(true);
    setError("");
    try {
      const [shops, payments, devices, users, codes, snapshots, audit, telemetry, configResult] = await Promise.all([
        fetchAll("shop_accounts",
          "id,shop_name,owner_name,owner_username,owner_phone,branch_count,worker_count,device_count,device_limit,monthly_fee_rwf,subscription_status,subscription_expires_at,remote_kill_switch,min_app_version,admin_notes,admin_whatsapp,updated_at",
          "updated_at"),
        fetchAll("payment_requests",
          "id,shop_name,owner_username,owner_phone,provider,payer_phone,payer_full_name,payment_time_ms,payment_note,amount_rwf,duration_months,branch_count,worker_count,device_count,fee_per_device_rwf,status,approval_mode,generated_unlock_code,verified_by_admin,admin_verification_note,rejection_reason,created_at,updated_at,gateway_provider,gateway_reference,gateway_transaction_id,gateway_amount_rwf,gateway_currency,gateway_verified_at",
          "created_at"),
        fetchAll("shop_devices",
          "id,shop_sync_key,shop_name,device_id,device_name,assigned_user_id,assigned_username,assigned_user_name,role,branch_id,branch_name,is_owner_primary,is_active,monthly_fee_addon_rwf,last_synced_at,created_at,updated_at",
          "updated_at"),
        fetchAll("shop_users",
          "id,shop_sync_key,shop_name,user_id,full_name,username,phone,role,assigned_branch_id,assigned_branch_name,is_active,updated_at",
          "updated_at"),
        fetchAll("unlock_codes",
          "id,unlock_code,payment_request_id,shop_username,shop_phone,tier_code,plan_days,amount_rwf,duration_months,branch_count,worker_count,device_count,payment_time_ms,payment_provider,payer_phone,payer_full_name,payment_note,plan_digest,status,issued_by_admin,issued_at,redeemed_at",
          "issued_at"),
        fetchAll("branch_sync_snapshots",
          "id,shop_sync_key,device_id,sync_generation,chunk_index,chunk_count,branch_id,branch_name,shop_name,owner_username,records_summary,updated_at",
          "updated_at"),
        fetchAll("admin_audit_logs", "id,admin_email,action,target_id,details,created_at", "created_at", 3000),
        fetchAll("device_security_telemetry",
          "id,shop_sync_key,shop_name,device_id,device_name,posture_label,risk_score,is_rooted,is_emulator,clock_rollback_detected,has_hooking,keystore_backing,tamper_incident_count,tamper_reason,unsynced_messages_count,permissions_summary,inspected_at,updated_at",
          "updated_at", 5000),
        masterAdminAuthClient.from("app_config").select("id,admin_whatsapp_number,mtn_momo_code,mtn_momo_phone,mtn_recipient_name,airtel_money_phone,airtel_recipient_name,per_device_fee_rwf,apk_download_url,apk_version,min_app_version,support_email,updated_at")
          .eq("id", "global").maybeSingle()
      ]);
      if (configResult.error) throw new Error("app_config: " + configResult.error.message);
      setData({ shops, payments, devices, users, codes, snapshots, audit, telemetry, config: configResult.data as Row | null });
      if (configResult.data) {
        const c = configResult.data as Row;
        setConfigDraft({
          admin_whatsapp_number: s(c.admin_whatsapp_number), mtn_momo_code: s(c.mtn_momo_code),
          mtn_momo_phone: s(c.mtn_momo_phone), mtn_recipient_name: s(c.mtn_recipient_name),
          airtel_money_phone: s(c.airtel_money_phone), airtel_recipient_name: s(c.airtel_recipient_name),
          apk_download_url: s(c.apk_download_url), apk_version: s(c.apk_version),
          min_app_version: s(c.min_app_version) || "2.3.0", support_email: s(c.support_email)
        });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoadingData(false);
    }
  }, []);

  const establishSession = useCallback(async (userId: string) => {
    const profile = await verifyMasterAdmin(userId);
    setAdminEmail(s(profile.email));
    setAdminName(s(profile.full_name) || s(profile.email));
    setVerified(true);
    await refreshData();
  }, [refreshData]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: sessionData, error: sessionError } = await masterAdminAuthClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (sessionData.session) await establishSession(sessionData.session.user.id);
      } catch (e) {
        if (mounted) {
          setVerified(false);
          setError(errorText(e));
          await masterAdminAuthClient.auth.signOut().catch(() => undefined);
        }
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    const { data: listener } = masterAdminAuthClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setVerified(false); setAdminEmail(""); setAdminName(""); setData(null);
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [establishSession]);

  useEffect(() => {
    if (!verified) return;
    const timer = window.setInterval(() => { void refreshData(); }, 30000);
    return () => window.clearInterval(timer);
  }, [verified, refreshData]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoginBusy(true); setError(""); setNotice("");
    try {
      const { data: result, error: authError } = await masterAdminAuthClient.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password
      });
      if (authError || !result.session) throw new Error(authError?.message || "Supabase did not return an administrator session.");
      try {
        await establishSession(result.session.user.id);
        setPassword("");
      } catch (e) {
        await masterAdminAuthClient.auth.signOut();
        throw e;
      }
    } catch (e) {
      setVerified(false);
      setError(errorText(e));
    } finally {
      setLoginBusy(false); setChecking(false);
    }
  }

  async function signOutAdmin() {
    setBusyKey("signout");
    try {
      const { error: authError } = await masterAdminAuthClient.auth.signOut();
      if (authError) throw new Error(authError.message);
      setVerified(false); setAdminEmail(""); setAdminName(""); setData(null); setNotice("Master Admin signed out.");
    } catch (e) { setError(errorText(e)); }
    finally { setBusyKey(""); }
  }

  async function auditAction(action: string, target: string, details: string) {
    const { error: auditError } = await masterAdminAuthClient.from("admin_audit_logs").insert({
      id: id(), admin_email: adminEmail || "BeBoss Master Admin", action,
      target_id: target, details: details.slice(0, 1000), created_at: Date.now()
    });
    if (auditError) throw new Error("The business change was saved, but its audit record failed: " + auditError.message);
  }

  async function runAction(key: string, action: string, target: string, details: string, work: () => Promise<void>) {
    if (busyKey) return;
    setBusyKey(key); setError(""); setNotice("");
    try {
      await work();
      await auditAction(action, target, details);
      setNotice("Saved: " + details);
      await refreshData();
    } catch (e) {
      const message = errorText(e);
      await refreshData();
      setError(message);
    } finally {
      setBusyKey("");
    }
  }

  async function approvePayment(request: Row, verificationNote: string) {
    const { data: latest, error: loadError } = await masterAdminAuthClient.from("payment_requests").select("*")
      .eq("id", s(request.id)).maybeSingle();
    if (loadError || !latest) throw new Error("Payment request could not be reloaded from the live database.");
    const payment = latest as Row;
    if (["APPROVED", "REDEEMED"].includes(s(payment.status))) throw new Error("This payment is already finalized. Refresh the queue; do not issue another code.");
    if (!["PENDING_VERIFICATION", "REJECTED"].includes(s(payment.status))) throw new Error("Only pending or rejected claims can be approved.");
    if (verificationNote.trim().length < 5) throw new Error("Record the provider verification evidence (at least five characters).");

    const username = s(payment.owner_username).trim().toLowerCase();
    const ownerPhone = s(payment.owner_phone);
    const payerPhone = s(payment.payer_phone) || ownerPhone;
    const normalizedOwnerPhone = normalizePhone(ownerPhone);
    if (!username || normalizedOwnerPhone.length !== 9 || normalizePhone(payerPhone).length !== 9) {
      throw new Error("The saved owner or payer phone number is invalid.");
    }
    const shopId = username + "_" + normalizedOwnerPhone;
    const { data: shop, error: shopError } = await masterAdminAuthClient.from("shop_accounts")
      .select("id,shop_name,owner_username,owner_phone,subscription_expires_at").eq("id", shopId).maybeSingle();
    if (shopError || !shop ||
        s(shop.owner_username).trim().toLowerCase() !== username ||
        normalizePhone(shop.owner_phone) !== normalizedOwnerPhone) {
      throw new Error("No registered shop matches the exact owner details on this payment. No code was issued.");
    }

    const plan = feePlan(payment);
    if (n(payment.amount_rwf) !== plan.total) {
      throw new Error("Payment amount mismatch. This saved plan calculates to " + money(plan.total) + "; recorded claim is " + money(payment.amount_rwf) + ".");
    }
    const paymentTimeMs = n(payment.payment_time_ms) || n(payment.created_at) || Date.now();
    const payerName = s(payment.payer_full_name).trim().normalize("NFKC");
    const paymentNote = s(payment.payment_note).trim().normalize("NFKC");
    const canonical = [
      "BEBOSS-PAYMENT-PLAN-V1", s(payment.id).trim(), username, normalizedOwnerPhone,
      s(payment.provider).trim().toUpperCase(), normalizePhone(payerPhone), payerName,
      Math.floor(plan.total), Math.floor(plan.months), Math.floor(plan.branches),
      Math.floor(plan.workers), Math.floor(plan.devices), Math.floor(paymentTimeMs), paymentNote
    ].join("\n");
    const expectedDigest = await sha256(canonical);

    const { data: signed, error: signerError } = await masterAdminAuthClient.functions.invoke("issue-bb3-unlock", {
      body: { paymentRequestId: s(payment.id), providerVerified: true, verificationNote: verificationNote.trim() }
    });
    if (signerError) {
      const context = (signerError as { context?: Response }).context;
      const message = context ? await context.clone().json().then((body) => s(body?.message)).catch(() => "") : "";
      throw new Error(message || signerError.message || "The secure BB3 signing service rejected this payment.");
    }
    if (!signed?.code?.startsWith("BB3-") || signed.planDigest !== expectedDigest ||
        s(signed.requestId) !== s(payment.id) || s(signed.shopId) !== shopId ||
        n(signed.amountRwf) !== plan.total || n(signed.days) !== plan.days || s(signed.tier) !== plan.tier ||
        n(signed.paymentTimeMs) !== paymentTimeMs) {
      throw new Error("The secure BB3 signer returned a voucher that does not match the live payment plan. Nothing was activated.");
    }

    const { data: prior, error: priorError } = await masterAdminAuthClient.from("unlock_codes")
      .select("id,unlock_code,plan_digest,status").eq("payment_request_id", s(payment.id))
      .in("status", ["ISSUED", "REDEEMED"]).maybeSingle();
    if (priorError) throw new Error("Could not check for an existing payment-linked unlock code.");
    let codeToUse = s(signed.code);
    let codeId = id();
    let insertedNew = false;
    if (prior) {
      if (s(prior.plan_digest) !== expectedDigest || !s(prior.unlock_code)) {
        throw new Error("This payment already has an active unlock record with different plan details. No second code was created.");
      }
      codeToUse = s(prior.unlock_code); codeId = s(prior.id);
    } else {
      const { error: insertError } = await masterAdminAuthClient.from("unlock_codes").insert({
        id: codeId, unlock_code: codeToUse, payment_request_id: s(payment.id),
        shop_username: username, shop_phone: ownerPhone, device_challenge: s(payment.device_challenge),
        tier_code: plan.tier, plan_days: plan.days, amount_rwf: plan.total,
        duration_months: plan.months, branch_count: plan.branches, worker_count: plan.workers, device_count: plan.devices,
        payment_time_ms: paymentTimeMs, payment_provider: s(payment.provider), payer_phone: payerPhone,
        payer_full_name: payerName, payment_note: paymentNote, plan_digest: expectedDigest,
        status: "ISSUED", issued_by_admin: "BeBoss Admin (" + adminEmail + ")", issued_at: Date.now()
      });
      if (insertError) {
        const { data: winner } = await masterAdminAuthClient.from("unlock_codes")
          .select("id,unlock_code,plan_digest,status").eq("payment_request_id", s(payment.id))
          .in("status", ["ISSUED", "REDEEMED"]).maybeSingle();
        if (!winner || s(winner.plan_digest) !== expectedDigest || !s(winner.unlock_code)) throw new Error(insertError.message);
        codeToUse = s(winner.unlock_code); codeId = s(winner.id);
      } else insertedNew = true;
    }

    const now = Date.now();
    const { data: claim, error: claimError } = await masterAdminAuthClient.from("payment_requests").update({
      status: "APPROVED", approval_mode: "UNLOCK_CODE", amount_rwf: plan.total,
      generated_unlock_code: codeToUse, verified_by_admin: "BeBoss Admin (" + adminEmail + ")",
      admin_verification_note: verificationNote.trim(), rejection_reason: "", updated_at: now
    }).eq("id", s(payment.id)).in("status", ["PENDING_VERIFICATION", "REJECTED"]).select("id").maybeSingle();

    if (claimError || !claim) {
      const { data: current } = await masterAdminAuthClient.from("payment_requests")
        .select("status,approval_mode,generated_unlock_code").eq("id", s(payment.id)).maybeSingle();
      const { data: linked } = await masterAdminAuthClient.from("unlock_codes")
        .select("id,unlock_code,plan_digest,status").eq("payment_request_id", s(payment.id))
        .in("status", ["ISSUED", "REDEEMED"]).maybeSingle();
      if (["APPROVED", "REDEEMED"].includes(s(current?.status)) &&
          s(current?.generated_unlock_code) === codeToUse &&
          s(linked?.unlock_code) === codeToUse && s(linked?.plan_digest) === expectedDigest) {
        throw new Error("Another administrator completed this approval. The existing signed code was preserved; refresh the queue.");
      }
      if (insertedNew) {
        await masterAdminAuthClient.from("unlock_codes").update({ status: "REVOKED" }).eq("id", codeId).eq("status", "ISSUED");
      }
      throw new Error(claimError?.message || "The payment changed while you were approving it. The queue has been refreshed; review its current status.");
    }

    const expiresAt = Math.max(n(shop.subscription_expires_at), now) + plan.days * 86400000;
    const { error: activationError } = await masterAdminAuthClient.from("shop_accounts").update({
      subscription_status: "ACTIVE", subscription_expires_at: expiresAt, branch_count: plan.branches,
      worker_count: plan.workers, device_count: plan.devices, device_limit: plan.devices,
      monthly_fee_rwf: Math.max(5000, plan.monthly), updated_at: now
    }).eq("id", shopId);
    if (activationError) {
      throw new Error("Payment and signed code were saved, but subscription activation failed. The shop needs administrator follow-up: " + activationError.message);
    }
    return codeToUse;
  }

  async function handleDecisionSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!decision) return;
    const request = decision.request;
    const mode = decision.mode;
    const note = decisionNote.trim();
    if (note.length < 5) { setError("Enter at least five characters of verification evidence or rejection reason."); return; }
    setBusyKey("payment:" + s(request.id)); setError(""); setNotice("");
    try {
      if (mode === "APPROVE") {
        const code = await approvePayment(request, note);
        await auditAction("APPROVE_PAYMENT", "@" + s(request.owner_username), "Verified payment " + s(request.id) + "; signed BB3 code issued; code " + code);
        setNotice("Payment approved and signed BB3 code issued: " + code);
      } else {
        const { data: rejected, error: updateError } = await masterAdminAuthClient.from("payment_requests").update({
          status: "REJECTED", rejection_reason: note, verified_by_admin: "BeBoss Admin (" + adminEmail + ")",
          admin_verification_note: note, updated_at: Date.now()
        }).eq("id", s(request.id)).in("status", ["PENDING_VERIFICATION", "REJECTED"]).select("id").maybeSingle();
        if (updateError) throw new Error(updateError.message);
        if (!rejected) throw new Error("This payment changed while the rejection was being saved. Refresh the payment queue and review its current status.");
        await auditAction("REJECT_PAYMENT", "@" + s(request.owner_username), "Rejected payment " + s(request.id) + ": " + note);
        setNotice("Payment claim rejected and recorded.");
      }
      setDecision(null); setDecisionNote("");
      await refreshData();
    } catch (e) {
      const message = errorText(e);
      await refreshData();
      setError(message);
    } finally { setBusyKey(""); }
  }

  function openShopControls(shop: Row) {
    setShopDraft({
      id: s(shop.id), name: s(shop.shop_name), branches: Math.max(1, n(shop.branch_count)),
      workers: Math.max(1, n(shop.worker_count)), devices: Math.max(1, n(shop.device_limit)),
      minimumVersion: s(shop.min_app_version) || "2.3.0", notes: s(shop.admin_notes),
      whatsapp: s(shop.admin_whatsapp), killSwitch: shop.remote_kill_switch === true
    });
  }

  async function saveShopControls(event: React.FormEvent) {
    event.preventDefault();
    if (!shopDraft) return;
    const d = shopDraft;
    if (!/^\d+(\.\d+){0,3}$/.test(d.minimumVersion.trim())) { setError("Minimum app version must look like 2.3.0."); return; }
    if (!Number.isInteger(d.branches) || d.branches < 1 || d.branches > 100 || !Number.isInteger(d.workers) || d.workers < 1 || d.workers > 500 || !Number.isInteger(d.devices) || d.devices < 1 || d.devices > 100) {
      setError("Branch, staff or device limits are outside the allowed range."); return;
    }
    const monthly = (d.branches === 1 ? 5000 : d.branches === 2 ? 10000 : 20000) +
      (d.workers <= 1 ? 0 : d.workers <= 3 ? 2000 : d.workers <= 5 ? 4000 : 4000 + (d.workers - 5) * 1000) +
      (d.devices - 1) * 2000;
    await runAction("shop-controls:" + d.id, "UPDATE_SHOP_CONTROLS", d.id,
      "Updated " + d.name + " quotas and remote controls", async () => {
        const { error: updateError } = await masterAdminAuthClient.from("shop_accounts").update({
          branch_count: d.branches, worker_count: d.workers, device_count: d.devices, device_limit: d.devices,
          monthly_fee_rwf: monthly, min_app_version: d.minimumVersion.trim(), admin_notes: d.notes,
          admin_whatsapp: d.whatsapp, remote_kill_switch: d.killSwitch, updated_at: Date.now()
        }).eq("id", d.id);
        if (updateError) throw new Error(updateError.message);
        setShopDraft(null);
      });
  }

  async function saveConfig(event: React.FormEvent) {
    event.preventDefault();
    if (configDraft.mtn_momo_code && !/^\d{4,20}$/.test(configDraft.mtn_momo_code.trim())) {
      setError("MTN merchant code must contain 4–20 digits."); return;
    }
    const phonePattern = /^\+?[0-9\s()-]{9,20}$/;
    if ((configDraft.mtn_momo_phone && !phonePattern.test(configDraft.mtn_momo_phone)) ||
        (configDraft.airtel_money_phone && !phonePattern.test(configDraft.airtel_money_phone))) {
      setError("Enter a valid Mobile Money phone number."); return;
    }
    await runAction("app-config", "SAVE_APP_CONFIG", "global", "Saved global BeBoss app configuration", async () => {
      const { error: updateError } = await masterAdminAuthClient.from("app_config").upsert({
        id: "global", ...configDraft, per_device_fee_rwf: 2000,
        min_app_version: configDraft.min_app_version.trim() || "2.3.0", updated_at: Date.now()
      });
      if (updateError) throw new Error(updateError.message);
    });
  }

  async function setShopStatus(shop: Row, status: string) {
    const now = Date.now();
    const patch: Row = { subscription_status: status, updated_at: now };
    if (status === "EXPIRED") patch.subscription_expires_at = Math.min(n(shop.subscription_expires_at), now - 1000);
    await runAction("shop-status:" + s(shop.id), "SET_SHOP_STATUS", s(shop.id),
      s(shop.shop_name) + " -> " + status, async () => {
        const { error: updateError } = await masterAdminAuthClient.from("shop_accounts").update(patch).eq("id", s(shop.id));
        if (updateError) throw new Error(updateError.message);
      });
  }

  async function extendShop(shop: Row, days: number) {
    const now = Date.now();
    await runAction("extend:" + s(shop.id), "EXTEND_SHOP", s(shop.id),
      "Extended " + s(shop.shop_name) + " by " + days + " days", async () => {
        const { error: updateError } = await masterAdminAuthClient.from("shop_accounts").update({
          subscription_status: "ACTIVE",
          subscription_expires_at: Math.max(n(shop.subscription_expires_at), now) + days * 86400000,
          updated_at: now
        }).eq("id", s(shop.id));
        if (updateError) throw new Error(updateError.message);
      });
  }

  async function toggleDevice(device: Row) {
    const next = device.is_active !== true;
    await runAction("device:" + s(device.id), "TOGGLE_DEVICE", s(device.id),
      (next ? "Activated " : "Deactivated ") + s(device.device_name || device.device_id), async () => {
        const { error: updateError } = await masterAdminAuthClient.from("shop_devices").update({
          is_active: next, updated_at: Date.now()
        }).eq("id", s(device.id));
        if (updateError) throw new Error(updateError.message);
      });
  }

  async function updateUser(user: Row, patch: Row, action: string) {
    await runAction("user:" + s(user.id), action, s(user.id),
      "Updated " + s(user.username) + " (" + Object.keys(patch).join(", ") + ")", async () => {
        const { error: updateError } = await masterAdminAuthClient.from("shop_users").update({ ...patch, updated_at: Date.now() }).eq("id", s(user.id));
        if (updateError) throw new Error(updateError.message);
      });
  }

  async function revokeCode(code: Row) {
    await runAction("code:" + s(code.id), "REVOKE_UNLOCK_CODE", s(code.id),
      "Revoked unlock code issued to @" + s(code.shop_username), async () => {
        const { error: updateError } = await masterAdminAuthClient.from("unlock_codes").update({ status: "REVOKED" })
          .eq("id", s(code.id)).eq("status", "ISSUED");
        if (updateError) throw new Error(updateError.message);
      });
  }

  async function deleteSnapshot(snapshot: Row) {
    if (!window.confirm("Permanently delete this cloud snapshot chunk for " + s(snapshot.shop_name) + " / " + s(snapshot.branch_name) + "? The shop must sync again to recreate it.")) return;
    await runAction("snapshot:" + s(snapshot.id), "DELETE_SNAPSHOT", s(snapshot.id),
      "Deleted cloud snapshot " + s(snapshot.shop_name) + " / " + s(snapshot.branch_name), async () => {
        const { error: deleteError } = await masterAdminAuthClient.from("branch_sync_snapshots").delete().eq("id", s(snapshot.id));
        if (deleteError) throw new Error(deleteError.message);
      });
  }

  async function removeDevice(device: Row) {
    if (!window.confirm("Remove this paired device from " + s(device.shop_name) + "? The shop owner will need to enroll it again.")) return;
    await runAction("device-delete:" + s(device.id), "DELETE_DEVICE", s(device.id),
      "Removed device " + s(device.device_name || device.device_id), async () => {
        const { error: deleteError } = await masterAdminAuthClient.from("shop_devices").delete().eq("id", s(device.id));
        if (deleteError) throw new Error(deleteError.message);
      });
  }

  async function deleteShop(shop: Row) {
    const confirmName = window.prompt("Type the exact shop name to permanently delete " + s(shop.shop_name) + ". This removes its devices, staff records and cloud snapshots.");
    if (confirmName !== s(shop.shop_name)) return;
    await runAction("shop-delete:" + s(shop.id), "DELETE_SHOP", "@" + s(shop.owner_username),
      "Deleted shop " + s(shop.shop_name) + " and its paired cloud records", async () => {
        const idValue = s(shop.id);
        for (const table of ["shop_devices", "shop_users", "branch_sync_snapshots"]) {
          const { error: deleteError } = await masterAdminAuthClient.from(table).delete().eq("shop_sync_key", idValue);
          if (deleteError) throw new Error("Could not remove " + table + ": " + deleteError.message);
        }
        const { error: deleteError } = await masterAdminAuthClient.from("shop_accounts").delete().eq("id", idValue);
        if (deleteError) throw new Error(deleteError.message);
      });
  }

  const matches = (row: Row) => {
    const q = query.trim().toLowerCase();
    return !q || Object.values(row).some((value) => s(value).toLowerCase().includes(q));
  };
  const pendingPayments = data?.payments.filter((payment) => s(payment.status) === "PENDING_VERIFICATION") ?? [];
  const filteredPayments = data?.payments.filter(matches) ?? [];
  const filteredShops = data?.shops.filter(matches) ?? [];
  const filteredDevices = data?.devices.filter(matches) ?? [];
  const filteredUsers = data?.users.filter(matches) ?? [];
  const filteredCodes = data?.codes.filter(matches) ?? [];

  if (checking) return <div className="setup-loading"><RefreshCw className="spin" size={24} /><span>Verifying Master Admin access…</span></div>;
  if (!verified) return <div className="page-stack">
    <PageHeading eyebrow="PRIVILEGED WORKSPACE" title="BeBoss Master Admin" description="Sign in with a dedicated Supabase administrator account. Shop-owner credentials do not grant global admin access." action={onExit ? <button className="btn-outline" onClick={onExit}><ArrowLeft size={14} /> Back to BeBoss home</button> : undefined} />
    <section className="panel admin-login-panel">
      <div className="admin-login-icon"><ShieldAlert size={25} /></div>
      <h3>Secure administrator sign-in</h3>
      <p className="panel-hint">Access is verified against the live is_beboss_admin() policy, the admin role record and an active SUPER_ADMIN profile. No service-role key is stored in this desktop application.</p>
      {error && <div className="global-alert error">{error}</div>}
      <form className="form-grid" onSubmit={(event) => void signIn(event)}>
        <label className="field-wide">Administrator email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" /></label>
        <label className="field-wide">Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <div className="form-actions field-wide"><button className="btn-primary" type="submit" disabled={loginBusy}>{loginBusy ? "Verifying access…" : "Sign in to Master Admin"}</button></div>
      </form>
    </section>
  </div>;

  return <div className="page-stack">
    <PageHeading eyebrow="PRIVILEGED WORKSPACE · RLS VERIFIED" title="BeBoss Master Admin" description={"Authenticated as " + adminName + " · " + adminEmail + ". Live cloud records, payment verification and audited shop controls."} action={<div className="heading-actions"><button className="btn-outline" onClick={() => void refreshData()} disabled={loadingData}><RefreshCw size={15} className={loadingData ? "spin" : ""} /> Refresh</button><button className="btn-outline" onClick={() => void signOutAdmin()} disabled={busyKey === "signout"}><LogOut size={15} /> Sign out</button></div>} />
    <div className="admin-workspace-tabs">{TABS.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className={tab === item.id ? "admin-workspace-tab active" : "admin-workspace-tab"} onClick={() => { setTab(item.id); setQuery(""); }}><Icon size={15} /> {item.label}{item.id === "payments" && pendingPayments.length > 0 ? <em>{pendingPayments.length}</em> : null}</button>; })}</div>
    {error && <div className="global-alert error"><ShieldAlert size={16} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
    {notice && <div className="global-alert success"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}
    {loadingData && !data && <div className="panel"><Empty title="Loading live administrator records" description="Connecting to Supabase with the verified Master Admin session." /></div>}

    {tab === "overview" && data && <>
      <div className="stat-grid four">
        <StatCard label="Registered shops" value={data.shops.length.toLocaleString()} icon={Store} />
        <StatCard label="Pending payment claims" value={pendingPayments.length.toLocaleString()} icon={Wallet} tone={pendingPayments.length ? "orange" : "green"} />
        <StatCard label="Paired devices" value={data.devices.length.toLocaleString()} icon={Smartphone} />
        <StatCard label="Active shop users" value={data.users.filter((user) => user.is_active === true).length.toLocaleString()} icon={Users} />
        <StatCard label="Issued unlock codes" value={data.codes.filter((code) => code.status === "ISSUED").length.toLocaleString()} icon={KeyRound} />
        <StatCard label="Security alerts" value={data.telemetry.filter((item) => n(item.risk_score) >= 50 || item.is_rooted || item.has_hooking || item.clock_rollback_detected).length.toLocaleString()} icon={ShieldAlert} tone="red" />
        <StatCard label="Cloud snapshots" value={data.snapshots.length.toLocaleString()} icon={Download} />
        <StatCard label="Audit events" value={data.audit.length.toLocaleString()} icon={Activity} />
      </div>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">ADMINISTRATOR ACTION REQUIRED</span><h3>Payment verification queue</h3></div><button className="text-btn" onClick={() => setTab("payments")}>Open queue</button></div>
        {pendingPayments.length ? <div className="table-wrap"><table><thead><tr><th>Shop</th><th>Provider</th><th>Claimed amount</th><th>Submitted</th><th>State</th><th /></tr></thead><tbody>{pendingPayments.slice(0, 8).map((payment) => <tr key={s(payment.id)}><td><strong>{s(payment.shop_name)}</strong><small className="cell-sub">@{s(payment.owner_username)}</small></td><td>{s(payment.provider)}</td><td>{money(payment.amount_rwf)}</td><td>{dateTime(payment.created_at)}</td><td><StatusPill value={s(payment.status)} /></td><td><button className="btn-outline" onClick={() => { setDecision({request:payment,mode:"APPROVE"}); setDecisionNote(""); }}>Review payment</button></td></tr>)}</tbody></table></div> : <Empty title="No pending payment claims" description="New subscription claims appear here after shop owners submit payment proof." />}
      </section>
      <p className="panel-hint">All lists below come from Supabase; they are not demonstration records. Dashboard refresh runs every 30 seconds while this console is open. Actions are checked by Supabase row-level security and written to the administrator audit log.</p>
    </>}

    {tab !== "overview" && tab !== "settings" && <div className="panel-heading admin-list-heading"><div><span className="eyebrow muted">LIVE SUPABASE RECORDS</span><h3>{TABS.find((item) => item.id === tab)?.label}</h3></div><div className="heading-actions"><label className="global-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter records…" /></label><button className="btn-outline" onClick={() => data && downloadCsv("beboss-admin-" + tab + "-" + Date.now() + ".csv", Object.keys((({payments:data.payments,shops:data.shops,devices:data.devices,users:data.users,codes:data.codes,branches:data.snapshots,audit:data.audit,telemetry:data.telemetry} as Record<string,Row[]>)[tab][0] ?? {}), ({payments:filteredPayments,shops:filteredShops,devices:filteredDevices,users:filteredUsers,codes:filteredCodes,branches:data.snapshots.filter(matches),audit:data.audit.filter(matches),telemetry:data.telemetry.filter(matches)} as Record<string,Row[]>)[tab])} disabled={!data}> <Download size={15} /> Export CSV</button></div></div>}

    {tab === "payments" && data && <section className="panel">
      {filteredPayments.length ? <div className="table-wrap"><table><thead><tr><th>Shop / owner</th><th>Provider & payer</th><th>Plan</th><th>Amount</th><th>Gateway evidence</th><th>Submitted</th><th>State</th><th>Actions</th></tr></thead><tbody>{filteredPayments.map((payment) => <tr key={s(payment.id)}>
        <td><strong>{s(payment.shop_name)}</strong><small className="cell-sub">@{s(payment.owner_username)} · {s(payment.owner_phone)}</small></td>
        <td>{s(payment.provider)}<small className="cell-sub">{s(payment.payer_phone)} · {s(payment.payer_full_name)}</small></td>
        <td>{n(payment.duration_months)} mo · {n(payment.branch_count)} br · {n(payment.worker_count)} staff · {n(payment.device_count)} dev</td>
        <td className="strong">{money(payment.amount_rwf)}</td>
        <td>{payment.gateway_verified_at && payment.gateway_reference ? <StatusPill value="GATEWAY VERIFIED" /> : <StatusPill value="MANUAL CHECK REQUIRED" />}<small className="cell-sub">{s(payment.gateway_reference)}</small></td>
        <td>{dateTime(payment.created_at)}</td><td><StatusPill value={s(payment.status)} /></td>
        <td>{["PENDING_VERIFICATION","REJECTED"].includes(s(payment.status)) ? <div className="row-actions"><button className="btn-primary" disabled={!!busyKey} onClick={() => { setDecision({request:payment,mode:"APPROVE"}); setDecisionNote(""); }}>Verify & issue BB3</button><button className="btn-outline" disabled={!!busyKey} onClick={() => { setDecision({request:payment,mode:"REJECT"}); setDecisionNote(""); }}>Reject</button></div> : payment.generated_unlock_code ? <button className="text-btn" onClick={() => void navigator.clipboard.writeText(s(payment.generated_unlock_code)).then(() => setNotice("Existing BB3 code copied."), (e) => setError(errorText(e)))}>Copy existing code</button> : "—"}</td>
      </tr>)}</tbody></table></div> : <Empty title="No payment claims" description="No records matched the filter." />}
    </section>}

    {tab === "shops" && data && <section className="panel"><div className="table-wrap"><table><thead><tr><th>Shop / owner</th><th>License</th><th>Quota</th><th>Expires</th><th>Controls</th><th>Actions</th></tr></thead><tbody>{filteredShops.map((shop) => <tr key={s(shop.id)}>
      <td><strong>{s(shop.shop_name)}</strong><small className="cell-sub">@{s(shop.owner_username)} · {s(shop.owner_phone)}</small></td><td><StatusPill value={s(shop.subscription_status)} />{shop.remote_kill_switch && <small className="warn-text">Remote kill enabled</small>}</td><td>{n(shop.branch_count)} branches · {n(shop.worker_count)} staff · {n(shop.device_limit)} devices</td><td>{dateTime(shop.subscription_expires_at)}</td>
      <td><button className="btn-outline" onClick={() => openShopControls(shop)}>Manage limits</button></td><td><div className="row-actions"><button className="btn-outline" disabled={!!busyKey} onClick={() => void extendShop(shop,30)}>+30 days</button><button className="btn-outline" disabled={!!busyKey} onClick={() => void setShopStatus(shop,s(shop.subscription_status)==="SUSPENDED"?"ACTIVE":"SUSPENDED")}>{s(shop.subscription_status)==="SUSPENDED"?"Activate":"Suspend"}</button><button className="icon-btn danger-icon" disabled={!!busyKey} title="Delete shop" onClick={() => void deleteShop(shop)}><Trash2 size={14}/></button></div></td>
    </tr>)}</tbody></table></div>{!filteredShops.length && <Empty title="No shops found" description="No shop accounts matched the current filter."/>}</section>}

    {tab === "devices" && data && <section className="panel"><div className="table-wrap"><table><thead><tr><th>Shop</th><th>Device</th><th>Assigned operator</th><th>Branch / role</th><th>Last sync</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredDevices.map((device)=><tr key={s(device.id)}><td>{s(device.shop_name)}<small className="cell-sub">{s(device.shop_sync_key)}</small></td><td><strong>{s(device.device_name)||s(device.device_id)}</strong><small className="cell-sub">{s(device.device_id)}</small></td><td>{s(device.assigned_user_name)||s(device.assigned_username)||"—"}</td><td>{s(device.branch_name)} · {s(device.role)}</td><td>{dateTime(device.last_synced_at)}</td><td><StatusPill value={device.is_active?"ACTIVE":"INACTIVE"}/></td><td><div className="row-actions"><button className="btn-outline" disabled={!!busyKey} onClick={()=>void toggleDevice(device)}>{device.is_active?"Deactivate":"Activate"}</button><button className="icon-btn danger-icon" disabled={!!busyKey} onClick={()=>void removeDevice(device)} title="Remove paired device"><Trash2 size={14}/></button></div></td></tr>)}</tbody></table></div>{!filteredDevices.length&&<Empty title="No paired devices" description="Device registrations sync from enrolled BeBoss terminals."/>}</section>}

    {tab === "users" && data && <section className="panel"><div className="table-wrap"><table><thead><tr><th>Shop</th><th>Staff member</th><th>Branch</th><th>Role</th><th>State</th><th>Actions</th></tr></thead><tbody>{filteredUsers.map((user)=><tr key={s(user.id)}><td>{s(user.shop_name)}</td><td><strong>{s(user.full_name)}</strong><small className="cell-sub">@{s(user.username)} · {s(user.phone)}</small></td><td>{s(user.assigned_branch_name)||"—"}</td><td><select value={s(user.role)} disabled={!!busyKey} onChange={(event)=>void updateUser(user,{role:event.target.value},"UPDATE_USER_ROLE")}><option value="OWNER">OWNER</option><option value="MANAGER">MANAGER</option><option value="CASHIER">CASHIER</option></select></td><td><StatusPill value={user.is_active?"ACTIVE":"INACTIVE"}/></td><td><button className="btn-outline" disabled={!!busyKey} onClick={()=>void updateUser(user,{is_active:user.is_active!==true}, "TOGGLE_USER")}>{user.is_active?"Deactivate":"Activate"}</button></td></tr>)}</tbody></table></div>{!filteredUsers.length&&<Empty title="No shop users" description="Synchronized shop staff accounts appear here. PINs and password hashes are never downloaded to this admin console."/>}</section>}

    {tab === "codes" && data && <section className="panel"><div className="table-wrap"><table><thead><tr><th>Unlock code</th><th>Shop</th><th>Plan</th><th>Issued by</th><th>Issued</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredCodes.map((code)=><tr key={s(code.id)}><td className="mono">{s(code.unlock_code)}</td><td>@{s(code.shop_username)}<small className="cell-sub">{s(code.shop_phone)}</small></td><td>{s(code.tier_code)} · {n(code.plan_days)} days · {money(code.amount_rwf)}</td><td>{s(code.issued_by_admin)}</td><td>{dateTime(code.issued_at)}</td><td><StatusPill value={s(code.status)}/></td><td>{s(code.status)==="ISSUED"?<button className="btn-outline" disabled={!!busyKey} onClick={()=>{if(window.confirm("Revoke this signed unlock code? It will no longer be accepted."))void revokeCode(code);}}>Revoke</button>:"—"}</td></tr>)}</tbody></table></div>{!filteredCodes.length&&<Empty title="No unlock code records" description="Issued signed codes are loaded from the payment ledger."/>}</section>}

    {tab === "branches" && data && <section className="panel"><div className="table-wrap"><table><thead><tr><th>Shop / branch</th><th>Device</th><th>Snapshot generation</th><th>Chunk</th><th>Record summary</th><th>Updated</th><th>Action</th></tr></thead><tbody>{data.snapshots.filter(matches).map((snapshot)=><tr key={s(snapshot.id)}><td><strong>{s(snapshot.shop_name)}</strong><small className="cell-sub">{s(snapshot.branch_name)} · @{s(snapshot.owner_username)}</small></td><td>{s(snapshot.device_id)}</td><td className="mono">{s(snapshot.sync_generation).slice(0,16)}</td><td>{n(snapshot.chunk_index)+1} / {n(snapshot.chunk_count)}</td><td>{s(snapshot.records_summary).slice(0,180)}</td><td>{dateTime(snapshot.updated_at)}</td><td><button className="btn-outline" disabled={!!busyKey} onClick={()=>void deleteSnapshot(snapshot)}>Delete chunk</button></td></tr>)}</tbody></table></div>{!data.snapshots.filter(matches).length&&<Empty title="No branch snapshots" description="Cloud snapshot manifests appear as devices synchronize."/>}</section>}

    {tab === "audit" && data && <section className="panel"><div className="table-wrap"><table><thead><tr><th>Time</th><th>Administrator</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{data.audit.filter(matches).map((entry)=><tr key={s(entry.id)}><td>{dateTime(entry.created_at)}</td><td>{s(entry.admin_email)}</td><td><StatusPill value={s(entry.action)}/></td><td>{s(entry.target_id)}</td><td>{s(entry.details)}</td></tr>)}</tbody></table></div>{!data.audit.filter(matches).length&&<Empty title="No audit events" description="Privileged administration changes are recorded here."/>}</section>}

    {tab === "telemetry" && data && <section className="panel"><div className="table-wrap"><table><thead><tr><th>Shop / device</th><th>Security posture</th><th>Risk score</th><th>Signals</th><th>Key store</th><th>Incidents</th><th>Inspected</th></tr></thead><tbody>{data.telemetry.filter(matches).map((item)=><tr key={s(item.id)}><td><strong>{s(item.shop_name)}</strong><small className="cell-sub">{s(item.device_name)||s(item.device_id)}</small></td><td><StatusPill value={s(item.posture_label)||"UNKNOWN"}/></td><td className={n(item.risk_score)>=50?"warn-text":"strong"}>{n(item.risk_score)}</td><td>{[item.is_rooted&&"Rooted",item.is_emulator&&"Emulator",item.has_hooking&&"Hooking",item.clock_rollback_detected&&"Clock rollback"].filter(Boolean).join(" · ")||"No flagged signal"}</td><td>{s(item.keystore_backing)}</td><td>{n(item.tamper_incident_count)}<small className="cell-sub">{s(item.tamper_reason)}</small></td><td>{dateTime(item.inspected_at||item.updated_at)}</td></tr>)}</tbody></table></div>{!data.telemetry.filter(matches).length&&<Empty title="No security telemetry" description="Device integrity and security reports appear after enrolled devices sync."/>}</section>}

    {tab === "settings" && data && <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">GLOBAL APP SETTINGS</span><h3>Payment instructions and release settings</h3></div><StatusPill value="RLS PROTECTED"/></div><form className="form-grid" onSubmit={(event)=>void saveConfig(event)}>
      <label>Admin WhatsApp number<input value={configDraft.admin_whatsapp_number} onChange={(e)=>setConfigDraft({...configDraft,admin_whatsapp_number:e.target.value})}/></label>
      <label>MTN merchant code<input value={configDraft.mtn_momo_code} onChange={(e)=>setConfigDraft({...configDraft,mtn_momo_code:e.target.value})}/></label>
      <label>MTN MoMo number<input value={configDraft.mtn_momo_phone} onChange={(e)=>setConfigDraft({...configDraft,mtn_momo_phone:e.target.value})}/></label>
      <label>MTN recipient name<input value={configDraft.mtn_recipient_name} onChange={(e)=>setConfigDraft({...configDraft,mtn_recipient_name:e.target.value})}/></label>
      <label>Airtel Money number<input value={configDraft.airtel_money_phone} onChange={(e)=>setConfigDraft({...configDraft,airtel_money_phone:e.target.value})}/></label>
      <label>Airtel recipient name<input value={configDraft.airtel_recipient_name} onChange={(e)=>setConfigDraft({...configDraft,airtel_recipient_name:e.target.value})}/></label>
      <label>APK version<input value={configDraft.apk_version} onChange={(e)=>setConfigDraft({...configDraft,apk_version:e.target.value})}/></label>
      <label>Minimum app version<input value={configDraft.min_app_version} onChange={(e)=>setConfigDraft({...configDraft,min_app_version:e.target.value})}/></label>
      <label className="field-wide">APK download URL<input type="url" value={configDraft.apk_download_url} onChange={(e)=>setConfigDraft({...configDraft,apk_download_url:e.target.value})}/></label>
      <label className="field-wide">Support email<input type="email" value={configDraft.support_email} onChange={(e)=>setConfigDraft({...configDraft,support_email:e.target.value})}/></label>
      <p className="panel-hint field-wide">Per-device fee is fixed at FRw 2,000/month by the subscription policy and cannot be overridden here. BB3 private signing keys are not exposed to the desktop client.</p>
      <div className="form-actions field-wide"><button type="submit" className="btn-primary" disabled={!!busyKey}>{busyKey==="app-config"?"Saving…":"Save global configuration"}</button></div>
    </form></section>}

    {decision && <Modal title={decision.mode === "APPROVE" ? "Verify payment and issue signed BB3 code" : "Reject payment claim"} onClose={()=>{if(!busyKey){setDecision(null);setDecisionNote("");}}}>
      <form className="form-grid" onSubmit={(event)=>void handleDecisionSubmit(event)}>
        <div className="field-wide"><strong>{s(decision.request.shop_name)} · @{s(decision.request.owner_username)}</strong><p className="panel-hint">{money(decision.request.amount_rwf)} · {n(decision.request.duration_months)} months · {n(decision.request.branch_count)} branches · {n(decision.request.worker_count)} staff · {n(decision.request.device_count)} devices</p></div>
        <label className="field-wide">{decision.mode === "APPROVE" ? "Provider verification evidence" : "Reason for rejection"}<textarea rows={4} minLength={5} maxLength={500} required value={decisionNote} onChange={(event)=>setDecisionNote(event.target.value)} placeholder={decision.mode === "APPROVE" ? "Record the provider, reference and confirmation from the official merchant portal…" : "Explain why the submitted payment proof is not accepted…"}/></label>
        {decision.mode === "APPROVE" && <p className="panel-hint field-wide">Confirm the transaction in the official MTN/Airtel/provider merchant system before approving. The server checks the admin role, registered shop, calculated plan and BB3 signer response. A signed code is linked to this payment with a conditional update; no placeholder code is generated.</p>}
        <div className="form-actions field-wide"><button type="button" className="btn-outline" onClick={()=>setDecision(null)} disabled={!!busyKey}>Cancel</button><button type="submit" className="btn-primary" disabled={!!busyKey||decisionNote.trim().length<5}>{busyKey?"Processing…":decision.mode==="APPROVE"?"Verify & issue code":"Reject claim"}</button></div>
      </form>
    </Modal>}

    {shopDraft && <Modal title={"Manage " + shopDraft.name} onClose={()=>{if(!busyKey)setShopDraft(null);}}>
      <form className="form-grid" onSubmit={(event)=>void saveShopControls(event)}>
        <label>Branch quota<input type="number" min="1" max="100" value={shopDraft.branches} onChange={(e)=>setShopDraft({...shopDraft,branches:Number(e.target.value)})}/></label>
        <label>Staff quota<input type="number" min="1" max="500" value={shopDraft.workers} onChange={(e)=>setShopDraft({...shopDraft,workers:Number(e.target.value)})}/></label>
        <label>Device quota<input type="number" min="1" max="100" value={shopDraft.devices} onChange={(e)=>setShopDraft({...shopDraft,devices:Number(e.target.value)})}/></label>
        <label>Minimum app version<input value={shopDraft.minimumVersion} onChange={(e)=>setShopDraft({...shopDraft,minimumVersion:e.target.value})}/></label>
        <label className="field-wide">Admin notes<textarea rows={3} maxLength={2000} value={shopDraft.notes} onChange={(e)=>setShopDraft({...shopDraft,notes:e.target.value})}/></label>
        <label className="field-wide">Admin WhatsApp<input value={shopDraft.whatsapp} onChange={(e)=>setShopDraft({...shopDraft,whatsapp:e.target.value})}/></label>
        <label className="field-wide toggle-row"><input type="checkbox" checked={shopDraft.killSwitch} onChange={(e)=>setShopDraft({...shopDraft,killSwitch:e.target.checked})}/> Remote kill switch (blocks shop access on its next sync)</label>
        <div className="form-actions field-wide"><button type="button" className="btn-outline" onClick={()=>setShopDraft(null)} disabled={!!busyKey}>Cancel</button><button className="btn-primary" type="submit" disabled={!!busyKey}>Save shop controls</button></div>
      </form>
    </Modal>}
  </div>;
}
