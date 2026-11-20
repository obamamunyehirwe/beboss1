/**
 * Decodes the Android app's branch snapshots (BBSHARE1 tokens) and computes retail insights.
 * Token format (ShopDataTransferManager.kt): "BBSHARE1:<16 hex HMAC>:<base64(gzip(utf-8 JSON))>".
 * The payload is signed and compressed, not encrypted. Formulas mirror AnalyticsEngine.kt.
 */

export const SHARE_PREFIX = "BBSHARE1:";
const DAY = 86_400_000;

type Row = Record<string, unknown>;

export interface ShareDataset {
  shopName: string;
  currency: string;
  exportedAt: number;
  products: Row[];
  customers: Row[];
  sales: Row[];
  saleItems: Row[];
  customerPayments: Row[];
  purchases: Row[];
  branches: Row[];
  users: Row[];
}

export function parseShareToken(token: string): { sig: string; payload: string } {
  const t = token.trim();
  if (!t.startsWith(SHARE_PREFIX)) throw new Error("Not a BeBoss share token");
  const rest = t.slice(SHARE_PREFIX.length);
  const i = rest.indexOf(":");
  if (i <= 0) throw new Error("Malformed BeBoss share token");
  return { sig: rest.slice(0, i).toUpperCase(), payload: rest.slice(i + 1) };
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function gunzipBase64(b64: string): Promise<string> {
  const stream = new Response(b64ToBytes(b64) as BodyInit).body!.pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

/** First 16 upper-case hex chars of HMAC-SHA256(payload), as the phone signs it. */
export async function shareSignature(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16).toUpperCase();
}

export async function decodeShareToken(token: string): Promise<Row> {
  const { payload } = parseShareToken(token);
  const json = JSON.parse(await gunzipBase64(payload)) as unknown;
  if (!json || typeof json !== "object") throw new Error("Snapshot payload is not an object");
  return json as Row;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (v == null ? "" : String(v));
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Row[]) : []);

/** Merges chunked exports into one dataset: newest row per id wins, tombstoned ids are dropped. */
export function mergeShareJson(parts: Row[]): ShareDataset {
  const keys = ["products", "customers", "sales", "saleItems", "customerPayments", "purchases", "branches", "users"] as const;
  const maps = Object.fromEntries(keys.map((k) => [k, new Map<string, Row>()])) as Record<(typeof keys)[number], Map<string, Row>>;
  const dead = new Set<string>();
  let shopName = "";
  let currency = "FRw";
  let exportedAt = 0;
  for (const p of parts) {
    const profile = (p["shopProfile"] ?? {}) as Row;
    const meta = (p["metadata"] ?? {}) as Row;
    if (!shopName) shopName = str(profile["shopName"]);
    if (str(profile["currencySymbol"])) currency = str(profile["currencySymbol"]);
    exportedAt = Math.max(exportedAt, num(meta["timestamp"]));
    for (const t of arr(p["tombstones"])) dead.add(str(t["recordId"]));
    for (const k of keys) {
      for (const r of arr(p[k])) {
        const id = str(r["id"]);
        if (!id) continue;
        const prev = maps[k].get(id);
        if (!prev || num(r["updatedAt"]) >= num(prev["updatedAt"])) maps[k].set(id, r);
      }
    }
  }
  const live = (k: (typeof keys)[number]) => [...maps[k].values()].filter((r) => !dead.has(str(r["id"])) && r["isDeleted"] !== true);
  return {
    shopName,
    currency,
    exportedAt,
    products: live("products"),
    customers: live("customers"),
    sales: live("sales"),
    saleItems: [...maps.saleItems.values()],
    customerPayments: live("customerPayments"),
    purchases: live("purchases"),
    branches: live("branches"),
    users: live("users"),
  };
}

export interface PeriodTotals {
  revenue: number;
  cost: number;
  profit: number;
  orders: number;
  avgOrder: number;
  marginPct: number;
}

export interface RetailInsights {
  shopName: string;
  currency: string;
  exportedAt: number;
  counts: { products: number; customers: number; sales: number; branches: number; staff: number };
  today: PeriodTotals;
  last30: PeriodTotals;
  allTime: PeriodTotals;
  itemsSold30: number;
  daily: { day: string; revenue: number; profit: number; orders: number }[];
  topProducts: { name: string; quantity: number; revenue: number; profit: number }[];
  categories: { name: string; revenue: number; sharePct: number }[];
  paymentMethods: { method: string; revenue: number; orders: number }[];
  cashiers: { name: string; revenue: number; orders: number }[];
  branches: { name: string; revenue: number; orders: number }[];
  lowStock: { name: string; inStock: number; threshold: number; unit: string }[];
  inventory: { costValue: number; retailValue: number; skus: number; outOfStock: number };
  debts: { total: number; debtors: number; top: { name: string; phone: string; balance: number; limit: number }[]; collected30: number };
}

export function periodTotals(sales: Row[]): PeriodTotals {
  let revenue = 0;
  let cost = 0;
  let profit = 0;
  for (const s of sales) {
    revenue += num(s["totalAmount"]);
    cost += num(s["totalCost"]);
    profit += num(s["totalProfit"]);
  }
  const orders = sales.length;
  return {
    revenue,
    cost,
    profit,
    orders,
    avgOrder: orders ? revenue / orders : 0,
    marginPct: revenue ? (profit / revenue) * 100 : 0,
  };
}

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function topBy<T>(m: Map<string, T>, score: (t: T) => number, n: number) {
  return [...m.values()].sort((a, b) => score(b) - score(a)).slice(0, n);
}

export function computeRetailInsights(ds: ShareDataset, now = Date.now()): RetailInsights {
  const todayStart = startOfDay(now);
  const since30 = todayStart - 29 * DAY;
  const sales = ds.sales;
  const recent = sales.filter((s) => num(s["saleDate"]) >= since30);
  const recentIds = new Set(recent.map((s) => str(s["id"])));
  const items30 = ds.saleItems.filter((i) => recentIds.has(str(i["saleId"])));

  const daily: RetailInsights["daily"] = [];
  for (let i = 29; i >= 0; i--) {
    const start = todayStart - i * DAY;
    const daySales = recent.filter((s) => num(s["saleDate"]) >= start && num(s["saleDate"]) < start + DAY);
    const t = periodTotals(daySales);
    daily.push({ day: new Date(start).toISOString().slice(0, 10), revenue: t.revenue, profit: t.profit, orders: t.orders });
  }

  const products = new Map<string, { name: string; quantity: number; revenue: number; profit: number }>();
  const cats = new Map<string, { name: string; revenue: number }>();
  let itemsSold30 = 0;
  for (const it of items30) {
    const name = str(it["productName"]) || "Unnamed item";
    const p = products.get(name) ?? { name, quantity: 0, revenue: 0, profit: 0 };
    p.quantity += num(it["quantitySold"]);
    p.revenue += num(it["subtotal"]);
    p.profit += num(it["profit"]);
    products.set(name, p);
    const cn = str(it["category"]) || "Uncategorised";
    const c = cats.get(cn) ?? { name: cn, revenue: 0 };
    c.revenue += num(it["subtotal"]);
    cats.set(cn, c);
    itemsSold30 += num(it["quantitySold"]);
  }
  const catTotal = [...cats.values()].reduce((a, c) => a + c.revenue, 0);

  const group = (key: string, fallback: string) => {
    const m = new Map<string, { name: string; revenue: number; orders: number }>();
    for (const s of recent) {
      const k = str(s[key]) || fallback;
      const g = m.get(k) ?? { name: k, revenue: 0, orders: 0 };
      g.revenue += num(s["totalAmount"]);
      g.orders += 1;
      m.set(k, g);
    }
    return topBy(m, (g) => g.revenue, 8);
  };

  const lowStock = ds.products
    .filter((p) => num(p["quantityInStock"]) <= num(p["lowStockThreshold"]))
    .sort((a, b) => num(a["quantityInStock"]) - num(b["quantityInStock"]))
    .slice(0, 12)
    .map((p) => ({ name: str(p["name"]), inStock: num(p["quantityInStock"]), threshold: num(p["lowStockThreshold"]), unit: str(p["unit"]) }));

  let costValue = 0;
  let retailValue = 0;
  let outOfStock = 0;
  for (const p of ds.products) {
    const q = Math.max(0, num(p["quantityInStock"]));
    costValue += q * num(p["costPrice"]);
    retailValue += q * num(p["sellingPrice"]);
    if (q <= 0) outOfStock++;
  }

  const debtors = ds.customers.filter((c) => num(c["debtBalance"]) > 0);
  const collected30 = ds.customerPayments.filter((p) => num(p["paymentDate"]) >= since30).reduce((a, p) => a + num(p["amount"]), 0);

  return {
    shopName: ds.shopName,
    currency: ds.currency,
    exportedAt: ds.exportedAt,
    counts: { products: ds.products.length, customers: ds.customers.length, sales: sales.length, branches: ds.branches.length, staff: ds.users.length },
    today: periodTotals(sales.filter((s) => num(s["saleDate"]) >= todayStart)),
    last30: periodTotals(recent),
    allTime: periodTotals(sales),
    itemsSold30,
    daily,
    topProducts: topBy(products, (p) => p.profit, 10),
    categories: topBy(cats, (c) => c.revenue, 8).map((c) => ({ ...c, sharePct: catTotal ? (c.revenue / catTotal) * 100 : 0 })),
    paymentMethods: group("paymentMethod", "CASH").map((g) => ({ method: g.name, revenue: g.revenue, orders: g.orders })),
    cashiers: group("cashierName", "Unknown"),
    branches: group("branchName", "Main Store"),
    lowStock,
    inventory: { costValue, retailValue, skus: ds.products.length, outOfStock },
    debts: {
      total: debtors.reduce((a, c) => a + num(c["debtBalance"]), 0),
      debtors: debtors.length,
      top: debtors
        .sort((a, b) => num(b["debtBalance"]) - num(a["debtBalance"]))
        .slice(0, 8)
        .map((c) => ({ name: str(c["name"]), phone: str(c["phone"]), balance: num(c["debtBalance"]), limit: num(c["creditLimit"]) })),
      collected30,
    },
  };
}

/** Picks the freshest device's chunk set: "<device>" plus "<device>#c1", "#c2"... */
export function pickLatestChunkSet<T extends { device_id: string; updated_at: number }>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const base = r.device_id.split("#")[0] ?? r.device_id;
    const g = groups.get(base) ?? [];
    g.push(r);
    groups.set(base, g);
  }
  let best: T[] = [];
  let bestTs = -1;
  for (const g of groups.values()) {
    const ts = Math.max(...g.map((r) => Number(r.updated_at) || 0));
    if (ts > bestTs) {
      bestTs = ts;
      best = g;
    }
  }
  return best;
}

export interface ShopRecords {
  currency: string;
  products: { id: string; name: string; category: string; barcode: string; cost: number; price: number; stock: number; threshold: number; unit: string; marginPct: number }[];
  customers: { id: string; name: string; phone: string; category: string; debt: number; limit: number; overLimit: boolean }[];
  sales: { id: string; receipt: string; date: number; total: number; profit: number; method: string; cashier: string; branch: string; items: number; customer: string }[];
  staff: { id: string; name: string; username: string; role: string; branch: string; active: boolean }[];
  purchases: { id: string; date: number; supplier: string; product: string; quantity: number; cost: number }[];
}

/** Flattens a merged snapshot into browsable admin tables (newest sales first, capped at 500). */
export function extractShopRecords(ds: ShareDataset): ShopRecords {
  const itemCount = new Map<string, number>();
  for (const it of ds.saleItems) {
    const sid = str(it["saleId"]);
    itemCount.set(sid, (itemCount.get(sid) ?? 0) + num(it["quantitySold"]));
  }
  return {
    currency: ds.currency,
    products: ds.products
      .map((p) => {
        const cost = num(p["costPrice"]);
        const price = num(p["sellingPrice"]);
        return {
          id: str(p["id"]),
          name: str(p["name"]) || "Unnamed item",
          category: str(p["category"]),
          barcode: str(p["barcode"]),
          cost,
          price,
          stock: num(p["quantityInStock"]),
          threshold: num(p["lowStockThreshold"]),
          unit: str(p["unit"]),
          marginPct: price ? ((price - cost) / price) * 100 : 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    customers: ds.customers
      .map((c) => {
        const debt = num(c["debtBalance"]);
        const limit = num(c["creditLimit"]);
        return { id: str(c["id"]), name: str(c["name"]), phone: str(c["phone"]), category: str(c["category"]), debt, limit, overLimit: limit > 0 && debt > limit };
      })
      .sort((a, b) => b.debt - a.debt),
    sales: [...ds.sales]
      .sort((a, b) => num(b["saleDate"]) - num(a["saleDate"]))
      .slice(0, 500)
      .map((s) => ({
        id: str(s["id"]),
        receipt: str(s["receiptNumber"]) || str(s["id"]).slice(0, 8),
        date: num(s["saleDate"]),
        total: num(s["totalAmount"]),
        profit: num(s["totalProfit"]),
        method: str(s["paymentMethod"]) || "CASH",
        cashier: str(s["cashierName"]),
        branch: str(s["branchName"]),
        items: itemCount.get(str(s["id"])) ?? 0,
        customer: str(s["customerName"]),
      })),
    staff: ds.users.map((u) => ({
      id: str(u["id"]),
      name: str(u["name"]),
      username: str(u["username"]),
      role: str(u["role"]),
      branch: str(u["assignedBranchName"]),
      active: u["isActive"] !== false,
    })),
    purchases: [...ds.purchases]
      .sort((a, b) => num(b["purchaseDate"] ?? b["createdAt"]) - num(a["purchaseDate"] ?? a["createdAt"]))
      .slice(0, 300)
      .map((p) => ({
        id: str(p["id"]),
        date: num(p["purchaseDate"] ?? p["createdAt"]),
        supplier: str(p["supplierName"]),
        product: str(p["productName"]),
        quantity: num(p["quantityPurchased"]),
        cost: p["totalPurchaseCost"] != null ? num(p["totalPurchaseCost"]) : num(p["unitCostPrice"]) * num(p["quantityPurchased"]),
      })),
  };
}
