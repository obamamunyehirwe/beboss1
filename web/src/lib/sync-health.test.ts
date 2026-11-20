import { describe, expect, it } from "vitest";
import { deviceHealth, licenseFlags, MINUTE, DAY } from "./sync-health";

const now = 1_800_000_000_000;
const shop = { id: "mama_788123456", owner_username: "Mama", subscription_status: "ACTIVE", subscription_expires_at: now + 10 * DAY, remote_kill_switch: false, auto_unlocked_at: 0 };

describe("deviceHealth", () => {
  it("is online within 15 minutes", () => expect(deviceHealth(now - 14 * MINUTE, now)).toBe("ONLINE"));
  it("is synced today within 24 hours", () => expect(deviceHealth(now - 16 * MINUTE, now)).toBe("TODAY"));
  it("is idle under 7 days", () => expect(deviceHealth(now - 3 * DAY, now)).toBe("IDLE"));
  it("is stale after 7 days", () => expect(deviceHealth(now - 8 * DAY, now)).toBe("STALE"));
  it("never synced when 0", () => expect(deviceHealth(0, now)).toBe("NEVER"));
});

describe("licenseFlags", () => {
  it("flags an active shop with no payment, code or direct unlock", () => {
    expect(licenseFlags(shop, [], [], now)).toContain("UNVERIFIED_PAID");
  });
  it("does not flag when a redeemed code exists for the owner (case-insensitive)", () => {
    expect(licenseFlags(shop, [{ shop_username: "mama", status: "REDEEMED" }], [], now)).not.toContain("UNVERIFIED_PAID");
  });
  it("does not flag when an approved payment exists", () => {
    expect(licenseFlags(shop, [], [{ owner_username: "mama", status: "APPROVED" }], now)).not.toContain("UNVERIFIED_PAID");
  });
  it("ignores revoked codes", () => {
    expect(licenseFlags(shop, [{ shop_username: "mama", status: "REVOKED" }], [], now)).toContain("UNVERIFIED_PAID");
  });
  it("does not flag trial shops", () => {
    expect(licenseFlags({ ...shop, subscription_status: "TRIAL" }, [], [], now)).toEqual([]);
  });
});
