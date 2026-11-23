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
  stockTransfers: Row[];
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

function deduplicateStaff(rows: Row[]): Row[] {
  const byId = new Map<string, Row>();
  for (const row of rows) {
    const id = str(row["id"] ?? row["userId"]).trim();
    const key = id ? `id:${id}` : `username:${str(row["username"]).trim().toLowerCase()}`;
    if (key === "username:") continue;
    const previous = byId.get(key);
    if (!previous) {
      byId.set(key, row);
      continue;
    }
    const previousUpdated = num(previous["updatedAt"]);
    const currentUpdated = num(row["updatedAt"]);
    const previousActive = previous["isActive"] !== false;
    const currentActive = row["isActive"] !== false;
    if ((currentActive && !previousActive) ||
        (currentActive === previousActive && currentUpdated >= previousUpdated)) {
      byId.set(key, row);
    }
  }

  // Very old snapshots can contain different IDs for the same username.
  // The Room migration now prevents new collisions; collapse historical ones here.
  const byUsername = new Map<string, Row>();
  for (const row of byId.values()) {
    const username = str(row["username"]).trim().toLowerCase();
    const key = username || `id:${str(row["id"])}`;
    const previous = byUsername.get(key);
    if (!previous || num(row["updatedAt"]) > num(previous["updatedAt"]) ||
        (num(row["updatedAt"]) === num(previous["updatedAt"]) &&
         row["isActive"] !== false && previous["isActive"] === false)) {
      byUsername.set(key, row);
    }
  }

  return [...byUsername.values()].filter((row) => {
    const username = str(row["username"]).trim().toLowerCase();
    const name = str(row["name"]).trim().toLowerCase();
    return !(
      (username === "owner" && name === "store owner") ||
      (username === "manager" && name === "store manager") ||
      (username === "cashier" && name === "store cashier")
    );
  });
}

/** Merges chunked exports into one dataset: newest row per id wins, tombstoned ids are dropped. */
export function mergeShareJson(parts: Row[]): ShareDataset {
  const keys = ["products", "customers", "sales", "saleItems", "customerPayments", "purchases", "stockTransfers", "branches", "users"] as const;
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
    saleItems: live("saleItems"),
    customerPayments: live("customerPayments"),
    purchases: live("purchases"),
    stockTransfers: live("stockTransfers"),
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
  activity: {
    purchaseOrders30: number;
    purchaseUnits30: number;
    purchaseValue30: number;
    supplierCount30: number;
    stockTransfers30: number;
    stockTransferUnits30: number;
  };
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

  const purchases30 = ds.purchases.filter((p) => (num(p["purchaseDate"]) || num(p["createdAt"])) >= since30);
  const purchaseValue30 = purchases30.reduce(
    (sum, p) => sum + (num(p["totalPurchaseCost"]) || num(p["quantityPurchased"]) * num(p["unitCostPrice"])),
    0,
  );
  const supplierCount30 = new Set(purchases30.map((p) => str(p["supplierName"]).trim().toLowerCase()).filter(Boolean)).size;
  const transfers30 = ds.stockTransfers.filter((t) => (num(t["transferDate"]) || num(t["createdAt"])) >= since30);

  const debtors = ds.customers.filter((c) => num(c["debtBalance"]) > 0);
  const collected30 = ds.customerPayments.filter((p) => num(p["paymentDate"]) >= since30).reduce((a, p) => a + num(p["amount"]), 0);

  return {
    shopName: ds.shopName,
    currency: ds.currency,
    exportedAt: ds.exportedAt,
    counts: { products: ds.products.length, customers: ds.customers.length, sales: sales.length, branches: ds.branches.length, staff: deduplicateStaff(ds.users).length },
    today: periodTotals(sales.filter((s) => num(s["saleDate"]) >= todayStart)),
    last30: periodTotals(recent),
    allTime: periodTotals(sales),
    itemsSold30,
    activity: {
      purchaseOrders30: purchases30.length,
      purchaseUnits30: purchases30.reduce((sum, p) => sum + num(p["quantityPurchased"]), 0),
      purchaseValue30,
      supplierCount30,
      stockTransfers30: transfers30.length,
      stockTransferUnits30: transfers30.reduce((sum, t) => sum + num(t["quantity"]), 0),
    },
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

/** Returns the newest complete snapshot generation from every device, not a partial single-device view. */
export function pickLatestChunkSet<
  T extends {
    device_id: string;
    updated_at: number;
    sync_generation?: string;
    chunk_index?: number;
    chunk_count?: number;
    records_summary?: string;
  },
>(rows: T[]): T[] {
  const byDevice = new Map<string, T[]>();
  for (const row of rows) {
    const base = row.device_id.replace(/#c\d+$/, "");
    const group = byDevice.get(base) ?? [];
    group.push(row);
    byDevice.set(base, group);
  }

  const selected: T[] = [];
  for (const deviceRows of byDevice.values()) {
    const generations = new Map<string, T[]>();
    for (const row of deviceRows) {
      const generation = row.sync_generation ?? "";
      const group = generations.get(generation) ?? [];
      group.push(row);
      generations.set(generation, group);
    }

    const latest = [...generations.values()].sort(
      (a, b) => Math.max(...b.map((row) => Number(row.updated_at) || 0)) - Math.max(...a.map((row) => Number(row.updated_at) || 0)),
    )[0];
    if (!latest?.length) continue;

    const generation = latest[0]?.sync_generation ?? "";
    const expected = generation
      ? Math.max(...latest.map((row) => Number(row.chunk_count) || 0))
      : Number(/\((\d+) chunk\(s\)\)/.exec(latest[0]?.records_summary ?? "")?.[1]) || latest.length;
    const indexes = latest.map((row) => {
      const suffix = /#c(\d+)$/.exec(row.device_id)?.[1];
      return generation ? Number(row.chunk_index) : suffix ? Number(suffix) : 0;
    });
    const hasCompleteIndexes =
      expected > 0 &&
      indexes.length === expected &&
      indexes.every((index) => Number.isInteger(index) && index >= 0 && index < expected) &&
      new Set(indexes).size === expected;
    if (!hasCompleteIndexes) continue;

    selected.push(...latest.slice().sort((a, b) => indexes[latest.indexOf(a)] - indexes[latest.indexOf(b)]));
  }
  return selected;
}

/** Keeps the legacy owner portal scoped to the freshest device snapshot. */
export function pickLatestDeviceChunkSet<
  T extends {
    device_id: string;
    updated_at: number;
    sync_generation?: string;
    chunk_index?: number;
    chunk_count?: number;
    records_summary?: string;
  },
>(rows: T[]): T[] {
  const complete = pickLatestChunkSet(rows);
  const byDevice = new Map<string, T[]>();
  for (const row of complete) {
    const base = row.device_id.replace(/#c\d+$/, "");
    const group = byDevice.get(base) ?? [];
    group.push(row);
    byDevice.set(base, group);
  }
  return [...byDevice.values()].sort(
    (a, b) => Math.max(...b.map((row) => Number(row.updated_at) || 0)) - Math.max(...a.map((row) => Number(row.updated_at) || 0)),
  )[0] ?? [];
}

export interface ShopRecords {
  currency: string;
  products: { id: string; name: string; category: string; barcode: string; cost: number; price: number; stock: number; threshold: number; unit: string; marginPct: number; branch: string; updatedAt: number }[];
  customers: { id: string; name: string; phone: string; email: string; address: string; city: string; category: string; debt: number; limit: number; overLimit: boolean; notes: string }[];
  sales: { id: string; receipt: string; date: number; total: number; cost: number; profit: number; discount: number; amountPaid: number; status: string; method: string; cashier: string; branch: string; items: number; customer: string; notes: string }[];
  saleItems: { id: string; receipt: string; product: string; category: string; quantity: number; unit: string; cost: number; price: number; subtotal: number; profit: number; branch: string }[];
  payments: { id: string; date: number; customer: string; amount: number; previousDebt: number; remainingDebt: number; method: string; receipt: string; recordedBy: string; branch: string; notes: string }[];
  branches: { id: string; name: string; code: string; address: string; phone: string; manager: string; active: boolean; isMain: boolean }[];
  stockTransfers: { id: string; number: string; date: number; product: string; fromBranch: string; toBranch: string; quantity: number; unit: string; status: string; transferredBy: string; notes: string }[];
  staff: {
    id: string;
    name: string;
    username: string;
    role: string;
    branch: string;
    active: boolean;
    canSellPOS: boolean;
    canApplyDiscounts: boolean;
    canManageInventory: boolean;
    canViewCostAndProfit: boolean;
    canViewAnalytics: boolean;
    canManageCustomers: boolean;
    canCollectDebt: boolean;
    canDeleteRecords: boolean;
    canExportReports: boolean;
    canManageCollaborators: boolean;
    canManageShopSettings: boolean;
    canExportImportData: boolean;
  }[];
  purchases: { id: string; date: number; supplier: string; supplierPhone: string; product: string; quantity: number; cost: number; paymentStatus: string; invoice: string; branch: string; recordedBy: string; notes: string }[];
}

/** Flattens the complete merged phone snapshot into browsable admin tables. */
export function extractShopRecords(ds: ShareDataset): ShopRecords {
  const staffRows = deduplicateStaff(ds.users);
  const itemCount = new Map<string, number>();
  for (const it of ds.saleItems) {
    const sid = str(it["saleId"]);
    itemCount.set(sid, (itemCount.get(sid) ?? 0) + num(it["quantitySold"]));
  }
  const receipts = new Map(ds.sales.map((sale) => [str(sale["id"]), str(sale["receiptNumber"]) || str(sale["id"]).slice(0, 8)]));
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
          branch: str(p["branchId"]),
          updatedAt: num(p["updatedAt"]),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    customers: ds.customers
      .map((c) => {
        const debt = num(c["debtBalance"]);
        const limit = num(c["creditLimit"]);
        return {
          id: str(c["id"]),
          name: str(c["name"]),
          phone: str(c["phone"]),
          email: str(c["email"]),
          address: str(c["address"]),
          city: str(c["city"]),
          category: str(c["category"]),
          debt,
          limit,
          overLimit: limit > 0 && debt > limit,
          notes: str(c["notes"]),
        };
      })
      .sort((a, b) => b.debt - a.debt),
    sales: [...ds.sales]
      .sort((a, b) => num(b["saleDate"]) - num(a["saleDate"]))
      .map((s) => ({
        id: str(s["id"]),
        receipt: str(s["receiptNumber"]) || str(s["id"]).slice(0, 8),
        date: num(s["saleDate"]),
        total: num(s["totalAmount"]),
        cost: num(s["totalCost"]),
        profit: num(s["totalProfit"]),
        discount: num(s["discountAmount"]),
        amountPaid: num(s["amountPaid"]),
        status: str(s["paymentStatus"]),
        method: str(s["paymentMethod"]) || "CASH",
        cashier: str(s["cashierName"]),
        branch: str(s["branchName"]),
        items: itemCount.get(str(s["id"])) ?? 0,
        customer: str(s["customerName"]),
        notes: str(s["notes"]),
      })),
    saleItems: [...ds.saleItems]
      .sort((a, b) => str(a["saleId"]).localeCompare(str(b["saleId"])))
      .map((item) => ({
        id: str(item["id"]),
        receipt: receipts.get(str(item["saleId"])) ?? str(item["saleId"]),
        product: str(item["productName"]),
        category: str(item["category"]),
        quantity: num(item["quantitySold"]),
        unit: str(item["unit"]),
        cost: num(item["costPriceAtSale"]),
        price: num(item["unitPriceAtSale"]),
        subtotal: num(item["subtotal"]),
        profit: num(item["profit"]),
        branch: str(item["branchId"]),
      })),
    payments: [...ds.customerPayments]
      .sort((a, b) => num(b["paymentDate"]) - num(a["paymentDate"]))
      .map((payment) => ({
        id: str(payment["id"]),
        date: num(payment["paymentDate"]),
        customer: str(payment["customerName"]),
        amount: num(payment["amount"]),
        previousDebt: num(payment["previousDebt"]),
        remainingDebt: num(payment["remainingDebt"]),
        method: str(payment["paymentMethod"]),
        receipt: str(payment["receiptNumber"]),
        recordedBy: str(payment["recordedBy"]),
        branch: str(payment["branchName"]),
        notes: str(payment["notes"]),
      })),
    branches: ds.branches.map((branch) => ({
      id: str(branch["id"]),
      name: str(branch["name"]),
      code: str(branch["code"]),
      address: str(branch["address"]),
      phone: str(branch["phone"]),
      manager: str(branch["managerName"]),
      active: branch["isActive"] !== false,
      isMain: branch["isMainBranch"] === true,
    })),
    stockTransfers: [...ds.stockTransfers]
      .sort((a, b) => num(b["transferDate"]) - num(a["transferDate"]))
      .map((transfer) => ({
        id: str(transfer["id"]),
        number: str(transfer["transferNumber"]),
        date: num(transfer["transferDate"]),
        product: str(transfer["productName"]),
        fromBranch: str(transfer["fromBranchName"]),
        toBranch: str(transfer["toBranchName"]),
        quantity: num(transfer["quantity"]),
        unit: str(transfer["unit"]),
        status: str(transfer["status"]),
        transferredBy: str(transfer["transferredBy"]),
        notes: str(transfer["notes"]),
      })),
    staff: staffRows.map((u) => ({
      id: str(u["id"]),
      name: str(u["name"]),
      username: str(u["username"]),
      role: str(u["role"]),
      branch: str(u["assignedBranchName"]),
      active: u["isActive"] !== false,
      canSellPOS: u["canSellPOS"] === true,
      canApplyDiscounts: u["canApplyDiscounts"] === true,
      canManageInventory: u["canManageInventory"] === true,
      canViewCostAndProfit: u["canViewCostAndProfit"] === true,
      canManageCustomers: u["canManageCustomers"] === true,
      canViewAnalytics: u["canViewAnalytics"] === true,
      canCollectDebt: u["canCollectDebt"] === true,
      canDeleteRecords: u["canDeleteRecords"] === true,
      canExportReports: u["canExportReports"] === true,
      canManageCollaborators: u["canManageCollaborators"] === true,
      canManageShopSettings: u["canManageShopSettings"] === true,
      canExportImportData: u["canExportImportData"] === true,
    })),
    purchases: [...ds.purchases]
      .sort((a, b) => num(b["purchaseDate"] ?? b["createdAt"]) - num(a["purchaseDate"] ?? a["createdAt"]))
      .map((p) => ({
        id: str(p["id"]),
        date: num(p["purchaseDate"] ?? p["createdAt"]),
        supplier: str(p["supplierName"]),
        supplierPhone: str(p["supplierPhone"]),
        product: str(p["productName"]),
        quantity: num(p["quantityPurchased"]),
        cost: p["totalPurchaseCost"] != null ? num(p["totalPurchaseCost"]) : num(p["unitCostPrice"]) * num(p["quantityPurchased"]),
        paymentStatus: str(p["paymentStatus"]),
        invoice: str(p["invoiceNumber"]),
        branch: str(p["branchName"]),
        recordedBy: str(p["purchasedByName"]),
        notes: str(p["notes"]),
      })),
  };
}
