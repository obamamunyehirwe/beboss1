import { effectiveShopStatus } from "./pricing";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type DeviceHealth = "ONLINE" | "TODAY" | "IDLE" | "STALE" | "NEVER";

/** How recently a device reached the cloud: online < 15 min, today < 24 h, idle < 7 days, otherwise stale. */
export function deviceHealth(lastSyncedAt: number | null | undefined, now = Date.now()): DeviceHealth {
  if (!lastSyncedAt || lastSyncedAt <= 0) return "NEVER";
  const age = now - lastSyncedAt;
  if (age < 15 * MINUTE) return "ONLINE";
  if (age < DAY) return "TODAY";
  if (age < 7 * DAY) return "IDLE";
  return "STALE";
}

export const HEALTH_LABEL: Record<DeviceHealth, string> = {
  ONLINE: "Online",
  TODAY: "Synced today",
  IDLE: "Idle",
  STALE: "Stale (7d+)",
  NEVER: "Never synced",
};

type ShopLike = {
  id: string;
  owner_username: string;
  subscription_status: string;
  subscription_expires_at: number;
  remote_kill_switch: boolean;
  auto_unlocked_at: number;
};
type CodeLike = { shop_username: string; status: string };
type PayLike = { owner_username: string; status: string };

export type LicenseFlag = "UNVERIFIED_PAID" | "KILL_SWITCH" | "EXPIRED_STILL_ACTIVE";

/**
 * Flags shops whose license state needs an admin's eye:
 * - UNVERIFIED_PAID: the shop reports a paid ACTIVE license, but there is no issued/redeemed code,
 *   no approved/redeemed payment and no admin direct unlock on record.
 * - EXPIRED_STILL_ACTIVE: reports ACTIVE although the expiry date has passed.
 * - KILL_SWITCH: remotely locked.
 */
export function licenseFlags(shop: ShopLike, codes: CodeLike[], payments: PayLike[], now = Date.now()): LicenseFlag[] {
  const flags: LicenseFlag[] = [];
  const user = shop.owner_username.trim().toLowerCase();
  if (shop.remote_kill_switch) flags.push("KILL_SWITCH");
  if (shop.subscription_status === "ACTIVE") {
    if (shop.subscription_expires_at <= now) flags.push("EXPIRED_STILL_ACTIVE");
    const hasCode = codes.some((c) => c.shop_username.trim().toLowerCase() === user && (c.status === "ISSUED" || c.status === "REDEEMED"));
    const hasPay = payments.some((p) => p.owner_username.trim().toLowerCase() === user && (p.status === "APPROVED" || p.status === "REDEEMED"));
    if (!hasCode && !hasPay && !(shop.auto_unlocked_at > 0) && effectiveShopStatus(shop, now) === "ACTIVE") flags.push("UNVERIFIED_PAID");
  }
  return flags;
}

export const FLAG_LABEL: Record<LicenseFlag, string> = {
  UNVERIFIED_PAID: "Paid status with no verified payment",
  KILL_SWITCH: "Kill switch on",
  EXPIRED_STILL_ACTIVE: "Expired but reports active",
};
