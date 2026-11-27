import { buildReorderSuggestions, forecastProductDemand } from '../src/core/forecast';
import { Product, Sale } from '../src/core/types';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1', name: 'Milk', category: 'Dairy', barcode: '123', unit: 'bottle',
    branchId: 'main_branch', costPrice: 500, sellingPrice: 800, quantityInStock: 5,
    lowStockThreshold: 4, isDeleted: false, syncVersion: 1, hlcTimestamp: '0',
    createdAt: 0, updatedAt: 0, ...overrides
  };
}

function sale(date: number, quantity: number, branchId = 'main_branch'): Sale {
  return {
    id: 'sale-' + date + '-' + quantity, receiptNumber: 'R', customerId: null,
    customerName: 'Walk-in', saleDate: date, totalAmount: 800, totalCost: 500,
    totalProfit: 300, discountAmount: 0, paymentMethod: 'CASH', paymentStatus: 'PAID',
    amountPaid: 800, notes: '', branchId, branchName: 'HQ',
    cashierId: 'owner', cashierName: 'Owner',
    items: [{
      id: 'line-' + date, saleId: 'sale-' + date, productId: 'product-1',
      productName: 'Milk', category: 'Dairy', unit: 'bottle',
      quantitySold: quantity, costPriceAtSale: 500, unitPriceAtSale: 800,
      subtotal: 800 * quantity, profit: 300 * quantity, branchId
    }]
  };
}

describe('BeBoss 56-day demand forecasting', () => {
  it('returns a no-history result without inventing sales', () => {
    const result = forecastProductDemand(product(), [], { nowMs: new Date(2026, 10, 27, 12).getTime() });
    expect(result.hasDemandHistory).toBe(false);
    expect(result.unitsSoldInHistory).toBe(0);
  });

  it('uses local sale history and returns bounded lead-time reorder recommendations', () => {
    const now = new Date(2026, 10, 27, 12).getTime();
    const records: Sale[] = [];
    for (let day = 0; day < 56; day += 1) {
      const date = new Date(2026, 9, 3 + day, 12).getTime();
      if (day % 2 === 0) records.push(sale(date, 2));
    }
    const result = forecastProductDemand(product({ quantityInStock: 0 }), records, { nowMs: now, leadTimeDays: 7 });
    expect(result.hasDemandHistory).toBe(true);
    expect(result.unitsSoldInHistory).toBeGreaterThan(0);
    expect(result.forecastDailyDemand).toBeGreaterThan(0);
    expect(result.reorderPoint).toBeGreaterThan(0);
    expect(result.suggestedOrderQuantity).toBeGreaterThan(0);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.confidence);
  });

  it('isolates records by selected branch', () => {
    const now = new Date(2026, 10, 27, 12).getTime();
    const recent = new Date(2026, 10, 26, 12).getTime();
    const data = [sale(recent, 9, 'branch-a'), sale(recent, 1, 'branch-b')];
    const branchA = forecastProductDemand(product(), data, { branchId: 'branch-a', nowMs: now });
    const branchB = forecastProductDemand(product(), data, { branchId: 'branch-b', nowMs: now });
    expect(branchA.unitsSoldInHistory).toBe(9);
    expect(branchB.unitsSoldInHistory).toBe(1);
  });

  it('does not recommend order quantity below zero when stock is adequate', () => {
    const now = new Date(2026, 10, 27, 12).getTime();
    const records = Array.from({ length: 30 }, (_, index) =>
      sale(new Date(2026, 9, 28 + index, 12).getTime(), 1)
    );
    const suggestions = buildReorderSuggestions([product({ quantityInStock: 100 })], records, { nowMs: now });
    expect(suggestions).toHaveLength(0);
  });
});
