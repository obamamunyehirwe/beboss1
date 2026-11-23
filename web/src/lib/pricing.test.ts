import { describe, expect, it } from "vitest";
import { calculateSubscriptionFee, computeShopKey, buildMtnUssd, buildAirtelUssd, extendExpiry, effectiveShopStatus, DAY_MS } from "./pricing";

describe("BeBoss subscription pricing", () => {
  it("single branch, solo, 1 month costs 5,000 FRw", () => {
    expect(calculateSubscriptionFee(1, 1, 1, 1).total).toBe(5000);
  });
  it("2 branches cost 10,000 and 3+ branches cost 20,000 per month", () => {
    expect(calculateSubscriptionFee(2, 1, 1).monthly).toBe(10000);
    expect(calculateSubscriptionFee(5, 1, 1).monthly).toBe(20000);
  });
  it("worker add-on: 2-3 = +2,000, 4-5 = +4,000, 7 workers = +6,000", () => {
    expect(calculateSubscriptionFee(1, 3, 1).workerFee).toBe(2000);
    expect(calculateSubscriptionFee(1, 5, 1).workerFee).toBe(4000);
    expect(calculateSubscriptionFee(1, 7, 1).workerFee).toBe(6000);
  });
  it("each extra device adds exactly 2,000 FRw even when a stale client rate is supplied", () => {
    expect(calculateSubscriptionFee(1, 1, 1, 3).deviceFee).toBe(4000);
    expect(calculateSubscriptionFee(1, 1, 1, 2, 500).deviceFee).toBe(2000);
    expect(calculateSubscriptionFee(1, 1, 1, 2, 9000).deviceFee).toBe(2000);
  });
  it("3 months gets 10% off and 12 months 20% off", () => {
    // matches the server-side trigger result verified against the database (43,200)
    expect(calculateSubscriptionFee(2, 4, 3, 2).total).toBe(43200);
    expect(calculateSubscriptionFee(1, 1, 12).total).toBe(48000);
    expect(calculateSubscriptionFee(1, 1, 12).tier).toBe("ANNUAL");
  });
  it("plan days are 30 per month", () => {
    expect(calculateSubscriptionFee(1, 1, 3).days).toBe(90);
  });
});

describe("tenant key and USSD", () => {
  it("normalizes +250 and 07 phones to the same key", () => {
    expect(computeShopKey("Mama_Shop", "+250 788 123 456")).toBe("mama_shop_788123456");
    expect(computeShopKey("mama_shop", "0788123456")).toBe("mama_shop_788123456");
  });
  it("uses MoMo merchant code when set, otherwise phone transfer", () => {
    expect(buildMtnUssd(5000, { mtn_momo_code: "054321" })).toBe("*182*8*1*054321*5000#");
    expect(buildMtnUssd(5000, { mtn_momo_code: "", mtn_momo_phone: "0788000000" })).toBe("*182*1*1*0788000000*5000#");
    expect(buildAirtelUssd(5000, { airtel_money_phone: "0738000000" })).toBe("*500*1*1*0738000000*5000#");
  });
});

describe("license lifecycle", () => {
  const now = 1_800_000_000_000;
  it("extension stacks on remaining time", () => {
    expect(extendExpiry(now + 5 * DAY_MS, 30, now)).toBe(now + 35 * DAY_MS);
    expect(extendExpiry(now - 10 * DAY_MS, 30, now)).toBe(now + 30 * DAY_MS);
  });
  it("expired timestamp shows EXPIRED even if status says ACTIVE", () => {
    expect(effectiveShopStatus({ subscription_status: "ACTIVE", subscription_expires_at: now - 1 }, now)).toBe("EXPIRED");
    expect(effectiveShopStatus({ subscription_status: "ACTIVE", subscription_expires_at: now + 1, remote_kill_switch: true }, now)).toBe("KILLED");
  });
});
