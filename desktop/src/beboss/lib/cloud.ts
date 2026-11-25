import { createClient, type Session } from "@supabase/supabase-js";
import { ensureBeBossDesktopBridge } from "./desktop";
import { createPreviewCloudState } from "./preview-data";
import type { CloudState, Snapshot } from "./types";

ensureBeBossDesktopBridge();

const url = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined)?.trim() ?? "";
const publishableKey = (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined)?.trim() ?? "";

export const isPreviewCloudMode = !url || !publishableKey;

const PREVIEW_STATE_KEY = "beboss_preview_cloud_v1";
const PREVIEW_SESSION_KEY = "beboss_preview_session_v1";

function loadPreviewState(credentials: OwnerCredentials): CloudState {
  try {
    const raw = localStorage.getItem(PREVIEW_STATE_KEY);
    if (raw) return JSON.parse(raw) as CloudState;
  } catch { /* fallback to fresh preview */ }
  const fresh = createPreviewCloudState(credentials.username || "jean_kigali", credentials.phone || "+250788421095");
  localStorage.setItem(PREVIEW_STATE_KEY, JSON.stringify(fresh));
  return fresh;
}

function savePreviewState(state: CloudState) {
  localStorage.setItem(PREVIEW_STATE_KEY, JSON.stringify(state));
}

const secureStorage = {
  getItem: (key: string) => typeof window !== "undefined" ? window.beBossDesktop.secureStore.get(key) : Promise.resolve(null),
  setItem: (key: string, value: string) => typeof window !== "undefined" ? window.beBossDesktop.secureStore.set(key, value).then(() => undefined) : Promise.resolve(),
  removeItem: (key: string) => typeof window !== "undefined" ? window.beBossDesktop.secureStore.remove(key).then(() => undefined) : Promise.resolve(),
};

export const authClient = !isPreviewCloudMode
  ? createClient(url, publishableKey, {
      auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
      global: { headers: { "X-BeBoss-Client": "desktop" } },
    })
  : null;

export type OwnerCredentials = { username: string; phone: string };

export class OwnerAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerAuthorizationError";
  }
}

function isOwnerAuthorizationMessage(value: unknown) {
  const message = typeof value === "string" ? value.toLowerCase() : "";
  return /sign in with the registered shop-owner phone|sms-verified account|registered beboss shop owner|shop has been disabled|owner access .*revoked|not been enrolled as the owner|secure shop-owner enrollment|owner session has expired|unauthorized|forbidden|not authorized/.test(message);
}
export type DesktopAction =
  | "bootstrap"
  | "save_snapshot"
  | "branch_upsert"
  | "branch_delete"
  | "transfer_create"
  | "transfer_command"
  | "staff_update"
  | "device_create"
  | "create_checkout"
  | "submit_payment_proof"
  | "create_branch_share"
  | "verify_branch_share";

export async function requestOwnerOtp(credentials: OwnerCredentials) {
  if (isPreviewCloudMode) {
    return;
  }
  const response = await fetch(url + "/functions/v1/request-desktop-owner-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey
    },
    body: JSON.stringify(credentials)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.accepted !== true) {
    throw new Error(typeof result?.message === "string" ? result.message : "The owner verification request could not be processed.");
  }
}

export async function verifyOwnerOtp(phone: string, token: string) {
  if (isPreviewCloudMode) {
    if (!token.trim() || token.trim().length < 4) {
      throw new Error("Enter the 6-digit verification code (use 123456 in preview mode).");
    }
    const session = { access_token: "preview-owner-token", token_type: "bearer", expires_in: 86400, refresh_token: "preview", user: { id: "usr-01", phone } } as unknown as Session;
    localStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(session));
    return session;
  }
  const { data, error } = await authClient!.auth.verifyOtp({
    phone,
    token: token.trim(),
    type: "sms"
  });
  if (error || !data.session) throw new Error(error?.message || "The SMS code is invalid or expired.");
  return data.session;
}

export async function callDesktopApi<T = Record<string, unknown>>(
  action: DesktopAction,
  credentials: OwnerCredentials,
  payload: Record<string, unknown> = {}
): Promise<T> {
  if (isPreviewCloudMode) {
    const state = loadPreviewState(credentials);
    const now = Date.now();
    if (action === "bootstrap") {
      state.serverTime = now;
      savePreviewState(state);
      return { ok: true, ...state } as unknown as T;
    }
    if (action === "save_snapshot") {
      state.snapshot = payload["snapshot"] as Snapshot;
      state.snapshotUpdatedAt = now;
      state.verifiedChunks = Math.max(12, state.verifiedChunks + 1);
      savePreviewState(state);
      return { ok: true, uploadedAt: now, snapshot: state.snapshot } as unknown as T;
    }
    if (action === "branch_upsert") {
      const branchId = String(payload["id"] || "br-" + crypto.randomUUID().slice(0, 6));
      const existingIdx = state.branches.findIndex((b) => String(b["id"]) === branchId);
      const nextBranch = {
        id: branchId,
        name: payload["name"] || "New Branch",
        code: payload["code"] || "KGL-" + Math.floor(100 + Math.random() * 900),
        address: payload["address"] || "Kigali, Rwanda",
        phone: payload["phone"] || credentials.phone,
        is_active: payload["isActive"] !== false,
        daily_target: Number(payload["dailyTarget"] || 250000),
      };
      if (existingIdx >= 0) state.branches[existingIdx] = { ...state.branches[existingIdx], ...nextBranch };
      else state.branches.push(nextBranch);
      savePreviewState(state);
      return { ok: true, branch: nextBranch } as unknown as T;
    }
    if (action === "branch_delete") {
      state.branches = state.branches.filter((b) => String(b["id"]) !== String(payload["id"]));
      savePreviewState(state);
      return { ok: true } as unknown as T;
    }
    if (action === "transfer_create") {
      const fromB = state.branches.find((b) => String(b["id"]) === String(payload["fromBranchId"]));
      const toB = state.branches.find((b) => String(b["id"]) === String(payload["toBranchId"]));
      const trf = {
        id: "trf-" + crypto.randomUUID().slice(0, 6),
        reference: "TRF-2026-" + Math.floor(100 + Math.random() * 899),
        from_branch_id: payload["fromBranchId"],
        from_branch_name: fromB?.["name"] || "Main Branch",
        to_branch_id: payload["toBranchId"],
        to_branch_name: toB?.["name"] || "Target Branch",
        product_name: payload["productName"] || "Inventory Item",
        quantity: Number(payload["quantity"] || 1),
        status: "REQUESTED",
        created_at: now,
      };
      state.transfers.unshift(trf);
      savePreviewState(state);
      return { ok: true, transfer: trf } as unknown as T;
    }
    if (action === "transfer_command") {
      state.transfers = state.transfers.map((t) =>
        String(t["id"]) === String(payload["transferId"])
          ? { ...t, status: String(payload["command"] || "COMPLETED").toUpperCase() }
          : t
      );
      savePreviewState(state);
      return { ok: true } as unknown as T;
    }
    if (action === "staff_update") {
      state.staff = state.staff.map((st) =>
        String(st["user_id"]) === String(payload["userId"])
          ? {
              ...st,
              role: payload["role"] ?? st["role"],
              assigned_branch_id: payload["branchId"] ?? st["assigned_branch_id"],
              assigned_branch_name: state.branches.find((b) => String(b["id"]) === String(payload["branchId"]))?.["name"] || "All Branches",
              is_active: typeof payload["isActive"] === "boolean" ? payload["isActive"] : st["is_active"],
            }
          : st
      );
      savePreviewState(state);
      return { ok: true } as unknown as T;
    }
    if (action === "device_create") {
      const code = { id: "code-" + crypto.randomUUID().slice(0, 6), code: "BB-PAIR-" + Math.floor(1000 + Math.random() * 8999), branch_name: state.branches.find((b) => String(b["id"]) === String(payload["branchId"]))?.["name"] || "HQ", status: "ACTIVE", expires_at: now + 86_400_000 * 2 };
      state.codes.unshift(code);
      savePreviewState(state);
      return { ok: true, code } as unknown as T;
    }
    if (action === "submit_payment_proof") {
      const claim = { id: "pay-" + crypto.randomUUID().slice(0, 6), amount: Number(payload["amount"] || 45000), currency: "FRw", plan: String(payload["plan"] || "PRO_MULTI_BRANCH"), provider: "MTN_MOMO", status: "PENDING_VERIFICATION", created_at: now, reference: String(payload["reference"] || "MOMO-CLAIM") };
      state.payments.unshift(claim);
      savePreviewState(state);
      return { ok: true, payment: claim } as unknown as T;
    }
    if (action === "create_checkout") {
      return { ok: true, pending: true, message: "Hosted checkout is available once BeBoss Cloud payment gateway is connected." } as unknown as T;
    }
    if (action === "create_branch_share") {
      return { ok: true, token: "BB-SHARE-" + btoa(JSON.stringify({ ts: now, branch: payload["branchIdFilter"] || "ALL" })).slice(0, 28) } as unknown as T;
    }
    if (action === "verify_branch_share") {
      return { ok: true, snapshot: state.snapshot } as unknown as T;
    }
    return { ok: true } as unknown as T;
  }

  const { data: sessionData } = await authClient!.auth.getSession();
  const session = sessionData.session;
  if (!session?.access_token) throw new OwnerAuthorizationError("Your owner session has expired. Verify your phone again.");

  const { data, error } = await authClient!.functions.invoke("beboss-desktop", {
    body: { action, ...credentials, ...payload }
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const details = await context.clone().json().catch(() => null);
      const responseMessage = typeof details?.message === "string" ? details.message : "";
      if (context.status === 401 || context.status === 403 || isOwnerAuthorizationMessage(responseMessage)) {
        throw new OwnerAuthorizationError(responseMessage || "The owner session is no longer authorized.");
      }
      if (responseMessage) throw new Error(responseMessage);
    }
    if (isOwnerAuthorizationMessage(error.message)) throw new OwnerAuthorizationError(error.message);
    throw new Error(error.message || "The BeBoss cloud request failed.");
  }
  if (!data || data.ok !== true) {
    const message = typeof data?.message === "string" ? data.message : "The BeBoss cloud request was rejected.";
    if (isOwnerAuthorizationMessage(message)) throw new OwnerAuthorizationError(message);
    throw new Error(message);
  }
  return data as T;
}

export async function signOut() {
  if (isPreviewCloudMode) {
    localStorage.removeItem(PREVIEW_SESSION_KEY);
    return;
  }
  const { error } = await authClient!.auth.signOut();
  if (error) throw new Error(error.message);
}

export function currentSession(): Promise<Session | null> {
  if (isPreviewCloudMode) {
    try {
      const raw = localStorage.getItem(PREVIEW_SESSION_KEY);
      return Promise.resolve(raw ? (JSON.parse(raw) as Session) : null);
    } catch { return Promise.resolve(null); }
  }
  return authClient!.auth.getSession().then(({ data }) => data.session);
}

export function toOwnerPhoneE164(value: string) {
  const digits = value.replace(/\D/g, "");
  const local =
    digits.length === 9 ? digits :
    digits.startsWith("250") && digits.length === 12 ? digits.slice(3) :
    digits.startsWith("0") && digits.length === 10 ? digits.slice(1) : "";
  if (!/^7\d{8}$/.test(local)) throw new Error("Enter the Rwanda mobile number registered to the BeBoss shop.");
  return "+250" + local;
}

export function ownerTenantKey(username: string, phone: string) {
  return username.trim().toLowerCase() + "_" + phone.replace(/\D/g, "").slice(-9);
}
