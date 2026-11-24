import { createClient, type Session } from "@supabase/supabase-js";

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

export type OwnerCredentials = { username: string; phone: string };
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
  if (!session?.access_token) throw new Error("Your owner session has expired. Verify your phone again.");

  const { data, error } = await authClient.functions.invoke("beboss-desktop", {
    body: { action, ...credentials, ...payload }
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const details = await context.clone().json().catch(() => null);
      if (typeof details?.message === "string") throw new Error(details.message);
    }
    throw new Error(error.message || "The BeBoss cloud request failed.");
  }
  if (!data || data.ok !== true) {
    throw new Error(typeof data?.message === "string" ? data.message : "The BeBoss cloud request was rejected.");
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
