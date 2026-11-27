import { createClient, type Session } from "@supabase/supabase-js";
import { buildDesktopActionBody } from "./cloud-request";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !publishableKey) {
  throw new Error("Desktop cloud configuration is missing. Copy .env.example to .env.local and set the BeBoss Supabase URL and publishable key.");
}

const secureStorage = {
  getItem: (key: string) => window.beBossDesktop.secureStore.get(key),
  setItem: (key: string, value: string) => window.beBossDesktop.secureStore.set(key, value).then(() => undefined),
  removeItem: (key: string) => window.beBossDesktop.secureStore.remove(key).then(() => undefined)
};

export const authClient = createClient(url, publishableKey, {
  auth: {
    storage: secureStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce"
  },
  global: {
    headers: { "X-BeBoss-Client": "desktop" }
  }
});


/**
 * Verify the actual Supabase Data API backed by PostgreSQL. A TCP handshake to
 * port 443 is not enough: this request must reach PostgREST with the configured
 * public project key before first-run setup can complete.
 */
export async function checkCloudDatabase(): Promise<{
  host: string;
  latencyMs: number;
  reachable: boolean;
  details: string;
}> {
  const host = new URL(url).host;
  const endpoint = url.replace(/\/+$/, "") + "/rest/v1/app_releases?select=id&limit=1";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: publishableKey,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 240);
      throw new Error("Supabase PostgreSQL Data API returned HTTP " + response.status +
        (detail ? ": " + detail : ""));
    }
    const rows = await response.json().catch(() => null);
    if (!Array.isArray(rows)) {
      throw new Error("Supabase responded, but the protected public-release query did not return a valid database response.");
    }
    return {
      host,
      latencyMs: Math.round(performance.now() - startedAt),
      reachable: true,
      details: "Supabase PostgREST is responding. Owner authentication and tenant-scoped access are verified at sign-in."
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(detail.includes("aborted")
      ? "Supabase PostgreSQL connection timed out after 8 seconds."
      : "Could not verify the Supabase PostgreSQL Data API: " + detail);
  } finally {
    window.clearTimeout(timeout);
  }
}

// Master Admin uses a separate Supabase Auth client and encrypted token namespace.
// This keeps the global administrator's credentials completely separate from a
// shop owner's mobile-number verified session.
const masterAdminSecureStorage = {
  getItem: (key: string) => window.beBossDesktop.secureStore.get("master-admin:" + key),
  setItem: (key: string, value: string) => window.beBossDesktop.secureStore.set("master-admin:" + key, value).then(() => undefined),
  removeItem: (key: string) => window.beBossDesktop.secureStore.remove("master-admin:" + key).then(() => undefined)
};

export const masterAdminAuthClient = createClient(url, publishableKey, {
  auth: {
    storage: masterAdminSecureStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce"
  },
  global: {
    headers: { "X-BeBoss-Client": "desktop-master-admin" }
  }
});

export type OwnerCredentials = { username: string; phone: string };

export class OwnerAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerAuthorizationError";
  }
}

export class DeviceFeeConfirmationRequired extends Error {
  readonly monthlyAddonRwf: number;

  constructor(monthlyAddonRwf = 2_000, message = "A new desktop requires owner approval for the monthly device add-on.") {
    super(message);
    this.name = "DeviceFeeConfirmationRequired";
    this.monthlyAddonRwf = Number.isFinite(monthlyAddonRwf) && monthlyAddonRwf > 0 ? Math.floor(monthlyAddonRwf) : 2_000;
  }
}

function isOwnerAuthorizationMessage(value: unknown) {
  const message = typeof value === "string" ? value.toLowerCase() : "";
  return /sign in with the registered shop-owner phone|sms-verified account|registered beboss shop owner|shop has been disabled|owner access .*revoked|not been enrolled as the owner|secure shop-owner enrollment|owner session has expired|unauthorized|forbidden|not authorized/.test(message);
}
export type DesktopAction =
  | "bootstrap"
  | "register_desktop"
  | "restore_preview"
  | "redeem_unlock_code"
  | "save_snapshot"
  | "branch_upsert"
  | "branch_delete"
  | "branch_reconcile"
  | "approval_policy_save"
  | "transfer_create"
  | "transfer_command"
  | "staff_update"
  | "device_create"
  | "device_update"
  | "device_set_active"
  | "device_reinvite"
  | "device_remove"
  | "management_refresh"
  | "management_probe"
  | "create_checkout"
  | "submit_payment_proof"
  | "create_branch_share"
  | "verify_branch_share"
  | "lan_pairing_credentials";

export async function requestOwnerOtp(credentials: OwnerCredentials) {
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
  const { data, error } = await authClient.auth.verifyOtp({
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
  const { data: sessionData } = await authClient.auth.getSession();
  const session = sessionData.session;
  if (!session?.access_token) throw new OwnerAuthorizationError("Your owner session has expired. Verify your phone again.");

  const { data, error } = await authClient.functions.invoke("beboss-desktop", {
    body: buildDesktopActionBody(action, credentials, payload)
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const details = await context.clone().json().catch(() => null);
      const responseMessage = typeof details?.message === "string" ? details.message : "";
      if (details?.requiresDeviceFeeConfirmation === true) {
        throw new DeviceFeeConfirmationRequired(
          Number(details.monthlyAddonRwf) || 2_000,
          responseMessage || "This additional desktop requires approval for its monthly device fee."
        );
      }
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
  const { error } = await authClient.auth.signOut();
  if (error) throw new Error(error.message);
}

export function currentSession(): Promise<Session | null> {
  return authClient.auth.getSession().then(({ data }) => data.session);
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

export type ShopRealtimeChange = {
  table: string;
  operation: string;
  updatedAt: string;
  deviceId: string;
};

/**
 * Subscribe to an owner-authorized private channel. Broadcast payloads contain
 * only the table and change metadata; the app always reloads verified records
 * through the authenticated BeBoss edge function before applying an update.
 */
export function subscribeToShopChanges(
  shopSyncKey: string,
  onChange: (change: ShopRealtimeChange) => void,
  onStatus?: (status: string) => void
) {
  const topic = shopSyncKey.trim();
  if (!topic || topic.length > 200) throw new Error("The shop identity is invalid for realtime subscription.");

  const channel = authClient
    .channel("shop:" + topic, { config: { private: true } })
    .on("broadcast", { event: "shop-data-changed" }, (message) => {
      const payload = message.payload && typeof message.payload === "object"
        ? message.payload as Record<string, unknown>
        : {};
      const table = typeof payload.table === "string" ? payload.table : "";
      if (!table) return;
      onChange({
        table,
        operation: typeof payload.operation === "string" ? payload.operation : "",
        updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
        deviceId: typeof payload.deviceId === "string" ? payload.deviceId : ""
      });
    })
    .subscribe((status) => onStatus?.(status));

  return () => {
    void authClient.removeChannel(channel);
  };
}
