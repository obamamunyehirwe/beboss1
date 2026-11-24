import { describe, expect, it } from "vitest";
import {
  computeRetailInsights,
  decodeShareToken,
  mergeShareJson,
  periodTotals,
  pickLatestChunkSet,
  pickLatestDeviceChunkSet,
  shareSignature,
  shareSignatureV1,
  SHARE_PREFIX,
  SHARE_PREFIX_V1,
  SHARE_PREFIX_V2,
  parseShareToken,
  verifyAndDecodeToken,
  extractShopRecords,
} from "./snapshot-analytics";

async function gzipB64(text: string) {
  const stream = new Response(text).body!.pipeThrough(new CompressionStream("gzip"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

const NOW = new Date("2026-11-20T12:00:00").getTime();
const DAY = 86_400_000;

describe("snapshot tokens", () => {
  it("decodes a legacy BBSHARE1 token without a secret (backwards-compatible decode)", async () => {
    const b64 = await gzipB64(JSON.stringify({ shopProfile: { shopName: "Mama Shop" } }));
    const json = await decodeShareToken(`${SHARE_PREFIX}ABCDEF0123456789:${b64}`);
    expect((json["shopProfile"] as { shopName: string }).shopName).toBe("Mama Shop");
  });

  it("signs with the full 256-bit HMAC-SHA256 tag (64 upper-case hex chars)", async () => {
    const sig = await shareSignature("payload", "secret");
    expect(sig).toBe("B82FCB791ACEC57859B989B430A826488CE2E479FDF92326BD0A2E8375A42BA4");
    expect(sig.length).toBe(64);
  });

  it("derives the legacy V1 64-bit tag from the full HMAC", async () => {
    const sig = await shareSignatureV1("payload", "secret");
    expect(sig).toBe("B82FCB791ACEC578");
    expect(sig.length).toBe(16);
  });

  it("parses V1 and BBSHARE2 token prefixes and versions", () => {
    const v1 = parseShareToken(`${SHARE_PREFIX_V1}ABCD:payload`);
    expect(v1.version).toBe(1);
    expect(v1.prefix).toBe(SHARE_PREFIX_V1);
    expect(v1.sig).toBe("ABCD");
    expect(v1.payload).toBe("payload");
    const v2 = parseShareToken(`${SHARE_PREFIX_V2}ABCDEF0123456789012345678901234567890123456789012345678901234567890123:payload`);
    expect(v2.version).toBe(2);
    expect(v2.prefix).toBe(SHARE_PREFIX_V2);
    expect(v2.payload).toBe("payload");
  });

  it("verifies and decodes a valid BBSHARE2 token with the server secret", async () => {
    const b64 = await gzipB64(JSON.stringify({ shopProfile: { shopName: "Mama Shop" } }));
    const sig = await shareSignature(b64, "server-secret");
    const token = `${SHARE_PREFIX_V2}${sig}:${b64}`;
    const json = await verifyAndDecodeToken(token, "server-secret");
    expect((json["shopProfile"] as { shopName: string }).shopName).toBe("Mama Shop");
  });

  it("verifies and decodes a valid legacy BBSHARE1 token during migration", async () => {
    const b64 = await gzipB64(JSON.stringify({ shopProfile: { shopName: "Mama Shop" } }));
    const sig = await shareSignatureV1(b64, "server-secret");
    const token = `${SHARE_PREFIX_V1}${sig}:${b64}`;
    const json = await verifyAndDecodeToken(token, "server-secret");
    expect((json["shopProfile"] as { shopName: string }).shopName).toBe("Mama Shop");
  });

  it("rejects a tampered BBSHARE2 signature fail-closed", async () => {
    const b64 = await gzipB64(JSON.stringify({ shopProfile: { shopName: "Mama Shop" } }));
    const sig = await shareSignature(b64, "server-secret");
    const tamperedSig = "0000000000000000000000000000000000000000000000000000000000000000";
    await expect(verifyAndDecodeToken(`${SHARE_PREFIX_V2}${tamperedSig}:${b64}`, "server-secret")).rejects.toThrow(/HMAC integrity check/);
  });

  it("rejects a wrong secret fail-closed", async () => {
    const b64 = await gzipB64(JSON.stringify({ shopProfile: { shopName: "Mama Shop" } }));
    const sig = await shareSignature(b64, "server-secret");
    const token = `${SHARE_PREFIX_V2}${sig}:${b64}`;
    await expect(verifyAndDecodeToken(token, "wrong-secret")).rejects.toThrow(/HMAC integrity check/);
  });

  it("rejects a malformed signature length", async () => {
    const b64 = await gzipB64(JSON.stringify({ shopProfile: { shopName: "Mama Shop" } }));
    await expect(verifyAndDecodeToken(`${SHARE_PREFIX_V2}short:${b64}`, "server-secret")).rejects.toThrow(/invalid format/);
  });

  it("rejects an unknown token prefix", async () => {
    await expect(verifyAndDecodeToken("BBSHARE9:deadbeef:payload", "server-secret")).rejects.toThrow(/Not a BeBoss share token/);
  });

  it("uses the latest complete generation from every device", () => {
    const rows = [
      { device_id: "a", sync_generation: "old", chunk_index: 0, chunk_count: 2, updated_at: 10 },
      { device_id: "a#c1", sync_generation: "old", chunk_index: 1, chunk_count: 2, updated_at: 11 },
      { device_id: "a", sync_generation: "new", chunk_index: 0, chunk_count: 1, updated_at: 30 },
      { device_id: "b", sync_generation: "other", chunk_index: 0, chunk_count: 1, updated_at: 20 },
      { device_id: "c", sync_generation: "incomplete", chunk_index: 0, chunk_count: 2, updated_at: 40 },
    ];
    expect(pickLatestChunkSet(rows).map((r) => `${r.device_id}:${r.sync_generation}`)).toEqual(["a:new", "b:other"]);
  });

  it("keeps the public shop lookup scoped to one complete device snapshot", () => {
    const rows = [
      { device_id: "a", sync_generation: "a1", chunk_index: 0, chunk_count: 1, updated_at: 10 },
      { device_id: "b", sync_generation: "b1", chunk_index: 0, chunk_count: 1, updated_at: 20 },
    ];
    expect(pickLatestDeviceChunkSet(rows).map((r) => r.device_id)).toEqual(["b"]);
  });
});

describe("retail insights (AnalyticsEngine formulas)", () => {
  const ds = mergeShareJson([
    {
      shopProfile: { shopName: "Mama Shop", currencySymbol: "FRw" },
      sales: [
        { id: "s1", totalAmount: 10000, totalCost: 7000, totalProfit: 3000, paymentMethod: "CASH", saleDate: NOW - 1000, updatedAt: 1 },
        { id: "s2", totalAmount: 5000, totalCost: 4000, totalProfit: 1000, paymentMethod: "MOMO", saleDate: NOW - 3 * DAY, updatedAt: 1 },
        { id: "s3", totalAmount: 9999, totalCost: 0, totalProfit: 9999, saleDate: NOW - DAY, updatedAt: 1 },
      ],
      saleItems: [
        { id: "i1", saleId: "s1", productName: "Milk", category: "Dairy", quantitySold: 4, subtotal: 10000, profit: 3000 },
        { id: "i2", saleId: "s2", productName: "Rice", category: "Grains", quantitySold: 1, subtotal: 5000, profit: 1000 },
      ],
      products: [
        { id: "p1", name: "Milk", quantityInStock: 2, lowStockThreshold: 5, costPrice: 1000, sellingPrice: 1500, updatedAt: 1 },
        { id: "p2", name: "Rice", quantityInStock: 10, lowStockThreshold: 5, costPrice: 4000, sellingPrice: 5000, updatedAt: 1 },
      ],
      customers: [{ id: "c1", name: "Aline", debtBalance: 7000, updatedAt: 1 }],
      tombstones: [{ recordId: "s3" }],
    },
  ]);
  const ins = computeRetailInsights(ds, NOW);

  it("drops tombstoned sales", () => expect(ins.counts.sales).toBe(2));
  it("revenue, profit and margin over 30 days", () => {
    expect(ins.last30.revenue).toBe(15000);
    expect(ins.last30.profit).toBe(4000);
    expect(Math.round(ins.last30.marginPct)).toBe(27);
    expect(ins.last30.avgOrder).toBe(7500);
  });
  it("today's totals only include today's sales", () => expect(ins.today.revenue).toBe(10000));
  it("counts items sold (fixes the app's always-zero total)", () => expect(ins.itemsSold30).toBe(5));
  it("includes phone purchase and branch-transfer activity in the 30-day view", () => {
    const activity = computeRetailInsights(
      mergeShareJson([{
        purchases: [
          { id: "purchase-1", purchaseDate: NOW - DAY, quantityPurchased: 12, totalPurchaseCost: 18000, supplierName: "Kabuye" },
          { id: "purchase-2", purchaseDate: NOW - 2 * DAY, quantityPurchased: 5, unitCostPrice: 1000, supplierName: "Kabuye" },
        ],
        stockTransfers: [
          { id: "transfer-1", transferDate: NOW - DAY, quantity: 4 },
        ],
      }]),
      NOW,
    ).activity;
    expect(activity.purchaseOrders30).toBe(2);
    expect(activity.purchaseUnits30).toBe(17);
    expect(activity.purchaseValue30).toBe(23000);
    expect(activity.supplierCount30).toBe(1);
    expect(activity.stockTransfers30).toBe(1);
    expect(activity.stockTransferUnits30).toBe(4);
  });
  it("ranks top products by profit", () => expect(ins.topProducts[0]?.name).toBe("Milk"));
  it("flags low stock at or below threshold", () => expect(ins.lowStock.map((p) => p.name)).toEqual(["Milk"]));
  it("values inventory at cost and retail", () => {
    expect(ins.inventory.costValue).toBe(42000);
    expect(ins.inventory.retailValue).toBe(53000);
  });
  it("sums outstanding customer debt", () => expect(ins.debts.total).toBe(7000));
  it("period totals of nothing are zero", () => expect(periodTotals([]).marginPct).toBe(0));
});

describe("extractShopRecords", () => {
  const ds = mergeShareJson([
    {
      shopProfile: { shopName: "Duka", currencySymbol: "FRw" },
      products: [
        { id: "p1", name: "Sugar", costPrice: 1300, sellingPrice: 1600, quantityInStock: 2, lowStockThreshold: 5, updatedAt: 1 },
        { id: "p2", name: "Bread", costPrice: 800, sellingPrice: 1000, quantityInStock: 20, lowStockThreshold: 5, updatedAt: 1 },
      ],
      customers: [{ id: "c1", name: "Aline", debtBalance: 15000, creditLimit: 10000, updatedAt: 1 }],
      sales: [
        { id: "s1", receiptNumber: "R-1", saleDate: 1000, totalAmount: 3200, totalProfit: 600, paymentMethod: "CASH", updatedAt: 1 },
        { id: "s2", receiptNumber: "R-2", saleDate: 2000, totalAmount: 1000, totalProfit: 200, paymentMethod: "MOMO", updatedAt: 1 },
      ],
      saleItems: [
        { id: "i1", saleId: "s1", quantitySold: 2 },
        { id: "i2", saleId: "s2", quantitySold: 1 },
      ],
      purchases: [{ id: "u1", supplierName: "Kabuye", productName: "Sugar", quantityPurchased: 10, unitCostPrice: 1300, purchaseDate: 500, updatedAt: 1 }],
      customerPayments: [{ id: "cp1", customerName: "Aline", amount: 3000, paymentDate: 2500, paymentMethod: "CASH" }],
      branches: [{ id: "b1", name: "Main", isMainBranch: true, isActive: true }],
      stockTransfers: [{ id: "t1", transferNumber: "T-1", productName: "Sugar", quantity: 3, status: "RECEIVED", transferDate: 1000 }],
    },
  ]);
  const r = extractShopRecords(ds);

  it("computes product margin from cost and selling price", () => {
    expect(r.products.find((p) => p.id === "p1")?.marginPct).toBeCloseTo(18.75, 2);
  });
  it("flags customers whose debt is above their credit limit", () => {
    expect(r.customers[0]?.overLimit).toBe(true);
  });
  it("lists newest sales first with their item quantities", () => {
    expect(r.sales.map((s) => s.receipt)).toEqual(["R-2", "R-1"]);
    expect(r.sales[1]?.items).toBe(2);
  });
  it("computes purchase cost from unit cost when no total is sent", () => {
    expect(r.purchases[0]?.cost).toBe(13000);
  });
  it("exposes debt payments, branch data, and stock transfers", () => {
    expect(r.payments[0]?.amount).toBe(3000);
    expect(r.branches[0]?.isMain).toBe(true);
    expect(r.stockTransfers[0]?.number).toBe("T-1");
  });
  it("does not truncate phone sales or purchases", () => {
    const sales = Array.from({ length: 501 }, (_, i) => ({ id: `s${i}`, saleDate: i, updatedAt: i }));
    const purchases = Array.from({ length: 301 }, (_, i) => ({ id: `p${i}`, purchaseDate: i }));
    const allRecords = extractShopRecords(mergeShareJson([{ sales, purchases }]));
    expect(allRecords.sales).toHaveLength(501);
    expect(allRecords.purchases).toHaveLength(301);
  });
});
