import {
  computeBranchPerformance, computeCategorySalesBreakdown, computeCustomerAging, computeStaffPerformance
} from '../src/core/analytics';
import { Branch, Customer, Product, Sale } from '../src/core/types';

const branch = (id: string, overrides: Partial<Branch> = {}): Branch => ({
  id, name: id, code: id.toUpperCase(), locationType: 'STORE', address: '', phone: '',
  managerName: '', isMainBranch: id === 'a', isActive: true, operationalStatus: 'OPEN',
  notes: '', createdAt: 0, updatedAt: 0, dailySalesTargetRwf: 1000, monthlyTargetRwf: 20000,
  ...overrides
});
const product = (id: string, branchId: string, quantity: number): Product => ({
  id, name: id, category: 'General', barcode: '', unit: 'pcs', branchId,
  costPrice: 10, sellingPrice: 20, quantityInStock: quantity, lowStockThreshold: 2,
  isDeleted: false, syncVersion: 1, hlcTimestamp: '0', createdAt: 0, updatedAt: 0
});
const sale = (id: string, date: number, branchId: string, cashierId: string, customerId: string | null, quantity: number): Sale => ({
  id, receiptNumber: id, customerId, customerName: 'Customer',
  saleDate: date, totalAmount: 40, totalCost: 20, totalProfit: 20, discountAmount: 5,
  paymentMethod: 'CASH', paymentStatus: 'PAID', amountPaid: 40, notes: '',
  branchId, branchName: branchId, cashierId, cashierName: cashierId,
  items: [{
    id: id + '-line', saleId: id, productId: 'p', productName: 'Product',
    category: 'Food', unit: 'pcs', quantitySold: quantity, costPriceAtSale: 10,
    unitPriceAtSale: 20, subtotal: 40, profit: 20, branchId
  }]
});
describe('Android analytics parity', () => {
  const now = new Date(2026, 10, 27, 12).getTime();
  const sales = [
    sale('s1', new Date(2026, 10, 26, 12).getTime(), 'a', 'cashier-1', 'c1', 2),
    sale('s2', new Date(2026, 10, 25, 12).getTime(), 'b', 'cashier-2', 'c2', 1)
  ];
  it('computes branch revenue, margin, stock value and target progress', () => {
    const result = computeBranchPerformance([branch('a'), branch('b')], sales, [product('p', 'a', 3)], 'THIS_MONTH', now);
    expect(result[0].branchId).toBe('a');
    expect(result[0].revenue).toBe(40);
    expect(result[0].marginPercent).toBe(50);
    expect(result[0].stockValueRwf).toBe(30);
    expect(result[0].targetProgressPercent).toBeGreaterThan(0);
  });
  it('ranks staff by revenue and captures discounts', () => {
    const result = computeStaffPerformance(sales, 'THIS_MONTH', 'ALL', now);
    expect(result[0].cashierId).toBe('cashier-1');
    expect(result[0].salesCount).toBe(1);
    expect(result[0].totalDiscountsGiven).toBe(5);
  });
  it('ages unpaid customer balances and flags over-limit accounts', () => {
    const customer: Customer = {
      id: 'c1', name: 'A', phone: '', email: '', address: '', city: '', taxIdOrNin: '',
      category: 'Regular Customer', creditLimit: 50, notes: '', debtBalance: 60,
      isDeleted: false, createdAt: 0, updatedAt: now - 40 * 86400000
    };
    const result = computeCustomerAging([customer], [sale('debt', now - 40 * 86400000, 'a', 'c', 'c1', 1)], now);
    expect(result.bucket31To60).toBe(60);
    expect(result.overLimitCount).toBe(1);
    expect(result.entries[0].agingBucket).toBe('31-60d');
  });
  it('groups product lines by category with revenue share', () => {
    const result = computeCategorySalesBreakdown(sales);
    expect(result[0].category).toBe('Food');
    expect(result[0].revenueSharePercent).toBe(100);
    expect(result[0].quantitySold).toBe(3);
  });
});
