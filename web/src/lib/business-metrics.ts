/** Pure SaaS metrics for the admin Analytics page (inputs are the admin tables' rows). */
import { computeShopKey, effectiveShopStatus } from "./pricing";

const DAY = 86_400_000;

export interface ShopLike {
  id: string;
  shop_name: string;
  owner_username: string;
  monthly_fee_rwf: number;
  subscription_status: string;
  subscription_expires_at: number;
  remote_kill_switch: boolean;
  created_at: number;
}
export interface PaymentLike {
  owner_username: string;
  owner_phone: string;
  provider: string;
  amount_rwf: number;
  duration_months: number;
  status: string;
  created_at: number;
  updated_at: number;
}

export const isPaid = (p: { status: string }) => p.status === "APPROVED" || p.status === "REDEEMED";

function monthKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function lastMonths(n: number, now = Date.now()) {
  const d = new Date(now);
  const out: { key: string; label: string; start: number; end: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const s = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const e = new Date(d.getFullYear(), d.getMonth() - i + 1, 1);
    out.push({ key: monthKey(s.getTime()), label: s.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), start: s.getTime(), end: e.getTime() });
  }
  return out;
}

/** Spreads each paid amount evenly over the months it covers, starting the month it was approved. */
export function recognizedRevenue(payments: PaymentLike[], months: { key: string }[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(months.map((m) => [m.key, 0]));
  for (const p of payments.filter(isPaid)) {
    const n = Math.max(1, Number(p.duration_months) || 1);
    const per = (Number(p.amount_rwf) || 0) / n;
    const start = new Date(Number(p.updated_at));
    for (let i = 0; i < n; i++) {
      const k = monthKey(new Date(start.getFullYear(), start.getMonth() + i, 1).getTime());
      if (k in out) out[k] = (out[k] ?? 0) + per;
    }
  }
  return out;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median hours between a payment claim and its approval (last 90 days). */
export function medianApprovalHours(payments: PaymentLike[], now = Date.now()): number {
  const v = payments.filter((p) => isPaid(p) && now - p.updated_at < 90 * DAY && p.updated_at >= p.created_at).map((p) => (p.updated_at - p.created_at) / 3_600_000);
  return median(v);
}

export function paidShopKeys(payments: PaymentLike[]): Set<string> {
  return new Set(payments.filter(isPaid).map((p) => computeShopKey(p.owner_username, p.owner_phone)));
}

/** Share of shops that ever paid (trial → paid conversion), in percent. */
export function conversionRate(shops: ShopLike[], payments: PaymentLike[]): number {
  if (!shops.length) return 0;
  const paid = paidShopKeys(payments);
  return (shops.filter((s) => paid.has(s.id)).length / shops.length) * 100;
}

/** Paying shops whose license lapsed in the last 30 days, over paying shops at risk in that window. */
export function churnRate30(shops: ShopLike[], payments: PaymentLike[], now = Date.now()): number {
  const paid = paidShopKeys(payments);
  const paying = shops.filter((s) => paid.has(s.id));
  const lapsed = paying.filter((s) => s.subscription_expires_at < now && s.subscription_expires_at >= now - 30 * DAY);
  const atRisk = paying.filter((s) => s.subscription_expires_at >= now - 30 * DAY);
  return atRisk.length ? (lapsed.length / atRisk.length) * 100 : 0;
}

export function cohorts(shops: ShopLike[], payments: PaymentLike[], months: { key: string; label: string; start: number; end: number }[], now = Date.now()) {
  const paid = paidShopKeys(payments);
  return months.map((m) => {
    const c = shops.filter((s) => s.created_at >= m.start && s.created_at < m.end);
    const active = c.filter((s) => effectiveShopStatus(s, now) === "ACTIVE").length;
    const converted = c.filter((s) => paid.has(s.id)).length;
    return { label: m.label, signups: c.length, converted, active, conversionPct: c.length ? (converted / c.length) * 100 : 0, activePct: c.length ? (active / c.length) * 100 : 0 };
  });
}

export function lifetimeValueByShop(shops: ShopLike[], payments: PaymentLike[]) {
  const byKey = new Map<string, number>();
  for (const p of payments.filter(isPaid)) {
    const k = computeShopKey(p.owner_username, p.owner_phone);
    byKey.set(k, (byKey.get(k) ?? 0) + (Number(p.amount_rwf) || 0));
  }
  return shops
    .map((s) => ({ id: s.id, name: s.shop_name, user: s.owner_username, total: byKey.get(s.id) ?? 0, status: effectiveShopStatus(s) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
}
