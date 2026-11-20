import { describe, expect, it } from "vitest";
import { churnRate30, conversionRate, lastMonths, median, medianApprovalHours, recognizedRevenue, type PaymentLike, type ShopLike } from "./business-metrics";

const NOW = new Date(2026, 10, 20, 12).getTime();
const DAY = 86_400_000;
const pay = (o: Partial<PaymentLike>): PaymentLike => ({ owner_username: "mama", owner_phone: "0788123456", provider: "MTN MoMo", amount_rwf: 0, duration_months: 1, status: "APPROVED", created_at: NOW, updated_at: NOW, ...o });
const shop = (o: Partial<ShopLike>): ShopLike => ({ id: "mama_788123456", shop_name: "Mama", owner_username: "mama", monthly_fee_rwf: 5000, subscription_status: "ACTIVE", subscription_expires_at: NOW + 10 * DAY, remote_kill_switch: false, created_at: NOW - 40 * DAY, ...o });

describe("business metrics", () => {
  it("spreads a 3-month payment evenly across the months it covers", () => {
    const months = lastMonths(12, new Date(2027, 1, 1).getTime());
    const rev = recognizedRevenue([pay({ amount_rwf: 13500, duration_months: 3, updated_at: NOW })], months);
    expect(rev["2026-11"]).toBe(4500);
    expect(rev["2026-12"]).toBe(4500);
    expect(rev["2027-01"]).toBe(4500);
  });
  it("ignores pending and rejected payments in revenue", () => {
    const months = lastMonths(1, NOW);
    expect(recognizedRevenue([pay({ amount_rwf: 5000, status: "PENDING_VERIFICATION" }), pay({ amount_rwf: 5000, status: "REJECTED" })], months)["2026-11"]).toBe(0);
  });
  it("median handles even and odd lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("median approval time in hours", () => {
    expect(medianApprovalHours([pay({ created_at: NOW - 2 * 3_600_000, updated_at: NOW }), pay({ created_at: NOW - 6 * 3_600_000, updated_at: NOW })], NOW)).toBe(4);
  });
  it("conversion counts shops with at least one approved payment", () => {
    expect(conversionRate([shop({}), shop({ id: "other_700000000" })], [pay({ amount_rwf: 5000 })])).toBe(50);
  });
  it("churn counts paying shops that lapsed in the last 30 days", () => {
    const shops = [shop({}), shop({ id: "b_788000001", owner_username: "b", subscription_expires_at: NOW - 5 * DAY })];
    const pays = [pay({}), pay({ owner_username: "b", owner_phone: "0788000001" })];
    expect(churnRate30(shops, pays, NOW)).toBe(50);
  });
});
