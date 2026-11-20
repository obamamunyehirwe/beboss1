// BeBoss licensing rules — must stay 1:1 with the Android OfflineSubscriptionManager
// and the database function public.compute_expected_subscription_fee.

export const DAY_MS = 86_400_000;
export const TRIAL_DAYS = 4;
export const DEFAULT_PER_DEVICE_FEE = 2000;

export type TierCode = "SINGLE" | "DUAL" | "MULTI" | "ANNUAL";

export interface FeeBreakdown {
  branches: number;
  workers: number;
  devices: number;
  months: number;
  branchFee: number;
  workerFee: number;
  deviceFee: number;
  extraDevices: number;
  monthly: number;
  discount: number;
  gross: number;
  total: number;
  tier: TierCode;
  days: number;
}

const clampInt = (v: unknown, min = 1) => Math.max(min, Math.floor(Number(v) || 0) || min);

export function branchFeeFor(branches: number): number {
  const b = clampInt(branches);
  if (b === 1) return 5000;
  if (b === 2) return 10000;
  return 20000;
}

export function workerFeeFor(workers: number): number {
  const w = clampInt(workers);
  if (w <= 1) return 0;
  if (w <= 3) return 2000;
  if (w <= 5) return 4000;
  return 4000 + (w - 5) * 1000;
}

export function discountFor(months: number): number {
  const m = clampInt(months);
  if (m === 12) return 20;
  if (m === 3) return 10;
  return 0;
}

export function tierFor(branches: number, months: number): TierCode {
  const b = clampInt(branches);
  const m = clampInt(months);
  if (m >= 12) return "ANNUAL";
  if (b >= 3) return "MULTI";
  if (b === 2) return "DUAL";
  return "SINGLE";
}

export function calculateSubscriptionFee(
  branches: number,
  workers: number,
  months: number,
  devices = 1,
  perDeviceRate = DEFAULT_PER_DEVICE_FEE,
): FeeBreakdown {
  const b = clampInt(branches);
  const w = clampInt(workers);
  const m = clampInt(months);
  const d = clampInt(devices);
  const rate = Number(perDeviceRate) > 0 ? Math.floor(Number(perDeviceRate)) : DEFAULT_PER_DEVICE_FEE;
  const extraDevices = Math.max(0, d - 1);
  const branchFee = branchFeeFor(b);
  const workerFee = workerFeeFor(w);
  const deviceFee = extraDevices * rate;
  const monthly = branchFee + workerFee + deviceFee;
  const discount = discountFor(m);
  const gross = monthly * m;
  const total = gross - Math.floor((gross * discount) / 100);
  return {
    branches: b,
    workers: w,
    devices: d,
    months: m,
    branchFee,
    workerFee,
    deviceFee,
    extraDevices,
    monthly,
    discount,
    gross,
    total,
    tier: tierFor(b, m),
    days: m * 30,
  };
}

export function normalizePhoneLast9(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "").slice(-9);
}

/** Tenant key the Android app sends as X-Shop-Sync-Key: lowercase(username)_last9(phone). */
export function computeShopKey(username: string, phone: string): string {
  const u = String(username ?? "").trim().toLowerCase() || "owner";
  const p = normalizePhoneLast9(phone) || "000000000";
  return `${u}_${p}`;
}

export interface PayConfig {
  mtn_momo_code?: string | null;
  mtn_momo_phone?: string | null;
  airtel_money_phone?: string | null;
}

export function buildMtnUssd(amount: number, cfg: PayConfig): string {
  const code = String(cfg.mtn_momo_code ?? "").trim();
  const phone = String(cfg.mtn_momo_phone ?? "").trim() || "0788765432";
  return code && code !== "0" ? `*182*8*1*${code}*${amount}#` : `*182*1*1*${phone}*${amount}#`;
}

export function buildAirtelUssd(amount: number, cfg: PayConfig): string {
  const phone = String(cfg.airtel_money_phone ?? "").trim() || "0738765432";
  return `*500*1*1*${phone}*${amount}#`;
}

export function toWhatsAppNumber(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `250${digits}`;
  if (digits.startsWith("07")) return `25${digits}`;
  return digits;
}

export function buildWhatsAppUrl(phone: string, text: string): string {
  const wa = toWhatsAppNumber(phone);
  return wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function buildUnlockReplyText(shopName: string, username: string, code: string, days: number, plan: string): string {
  return [
    `*BEBOSS SUBSCRIPTION APPROVED!*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Hello *@${username}* (${shopName}),`,
    `Your Mobile Money payment has been verified!`,
    ``,
    `*Your Unlock Code:*`,
    code,
    ``,
    `• *Plan:* ${plan}`,
    `• *Duration Added:* +${days} Days`,
    ``,
    `*How to Activate:*`,
    `Open BeBoss App -> *Settings* -> *Insert Unlock Code* -> Paste code above & tap *Verify & Activate*.`,
    `Murakoze gukoresha BeBoss!`,
  ].join("\n");
}

export function buildDirectUnlockReplyText(shopName: string, username: string, days: number, plan: string): string {
  return [
    `*BEBOSS DIRECT AUTO-UNLOCK ACTIVATED!*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Hello *@${username}* (${shopName}),`,
    `Your Mobile Money payment has been confirmed and your shop has been *AUTO-UNLOCKED* directly from the BeBoss Admin Console!`,
    ``,
    `• *Plan:* ${plan}`,
    `• *Duration Added:* +${days} Days`,
    `• *Activation:* Automatic when internet syncs (no unlock code required).`,
    ``,
    `Open BeBoss App and your full access is ready. Murakoze gukoresha BeBoss!`,
  ].join("\n");
}

export type ShopLifecycle = "TRIAL" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "KILLED";

/** Effective status as the app would see it, deriving expiry from the timestamp. */
export function effectiveShopStatus(
  shop: { subscription_status: string; subscription_expires_at: number; remote_kill_switch?: boolean },
  now = Date.now(),
): ShopLifecycle {
  if (shop.remote_kill_switch) return "KILLED";
  const s = String(shop.subscription_status || "").toUpperCase();
  if (s === "SUSPENDED") return "SUSPENDED";
  if (Number(shop.subscription_expires_at) < now) return "EXPIRED";
  if (s === "ACTIVE") return "ACTIVE";
  if (s === "TRIAL") return "TRIAL";
  return "EXPIRED";
}

/** New expiry when adding days: stacks on remaining time, never on the past. */
export function extendExpiry(currentExpiresAt: number, addDays: number, now = Date.now()): number {
  return Math.max(Number(currentExpiresAt) || 0, now) + Math.max(0, Math.floor(addDays)) * DAY_MS;
}
