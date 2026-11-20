import { describe, expect, it } from "vitest";
import { computeRetailInsights, decodeShareToken, mergeShareJson, periodTotals, pickLatestChunkSet, shareSignature, SHARE_PREFIX, extractShopRecords } from "./snapshot-analytics";

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
  it("decodes a BBSHARE1 token (base64 + gzip JSON)", async () => {
    const b64 = await gzipB64(JSON.stringify({ shopProfile: { shopName: "Mama Shop" } }));
    const json = await decodeShareToken(`${SHARE_PREFIX}ABCDEF0123456789:${b64}`);
    expect((json["shopProfile"] as { shopName: string }).shopName).toBe("Mama Shop");
  });

  it("signs like the phone: first 16 upper-case hex chars of HMAC-SHA256", async () => {
    const sig = await shareSignature("payload", "secret");
    expect(sig).toBe("B82FCB791ACEC57859B989B430A826488CE2E479FDF92326BD0A2E8375A42BA4".slice(0, 16));
  });

  it("uses only the freshest device's chunks", () => {
    const rows = [
      { device_id: "a", updated_at: 10 },
      { device_id: "a#c1", updated_at: 11 },
      { device_id: "b", updated_at: 20 },
    ];
    expect(pickLatestChunkSet(rows).map((r) => r.device_id)).toEqual(["b"]);
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
});
