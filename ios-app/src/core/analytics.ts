import { Branch, Customer, Product, Sale } from './types';

export type BranchPerformanceMetric = {
  branchId: string; branchName: string; branchCode: string; operationalStatus: string;
  revenue: number; cost: number; netProfit: number; marginPercent: number; salesCount: number;
  stockValueRwf: number; dailyTargetRwf: number; monthlyTargetRwf: number; targetProgressPercent: number;
};
export type StaffPerformanceMetric = {
  cashierId: string; cashierName: string; salesCount: number; revenue: number;
  profit: number; averageOrderValue: number; totalDiscountsGiven: number;
};
export type CustomerAgingEntry = {
  customerId: string; customerName: string; phone: string; debtBalance: number; creditLimit: number;
  creditUtilizationPercent: number; isOverLimit: boolean; oldestUnpaidDays: number;
  agingBucket: '0-30d' | '31-60d' | '61-90d' | '90+d'; category: string;
};
export type CustomerAgingSummary = {
  totalReceivable: number; bucket0To30: number; bucket31To60: number;
  bucket61To90: number; bucket90Plus: number; overLimitCount: number; entries: CustomerAgingEntry[];
};
export type CategorySalesMetric = {
  category: string; quantitySold: number; revenue: number; cost: number; profit: number;
  salesCount: number; revenueSharePercent: number;
};
export type AnalyticsPeriod = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL_TIME';

function periodStart(period: AnalyticsPeriod, nowMs: number): number {
  const now = new Date(nowMs);
  if (period === 'TODAY') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === 'THIS_WEEK') {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday.getTime();
  }
  return period === 'THIS_MONTH' ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : 0;
}

export function computeBranchPerformance(
  branches: Branch[], sales: Sale[], products: Product[], period: AnalyticsPeriod, nowMs = Date.now()
): BranchPerformanceMetric[] {
  const start = periodStart(period, nowMs);
  return branches.filter(branch => branch.isActive).map(branch => {
    const branchSales = sales.filter(sale => sale.saleDate >= start && sale.saleDate <= nowMs && sale.branchId === branch.id);
    const branchProducts = products.filter(product => !product.isDeleted && product.branchId === branch.id);
    const revenue = branchSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const cost = branchSales.reduce((sum, sale) => sum + sale.totalCost, 0);
    const profit = branchSales.reduce((sum, sale) => sum + sale.totalProfit, 0);
    const liveStock = branchProducts.reduce((sum, product) => sum + product.costPrice * Math.max(0, product.quantityInStock), 0);
    const daily = Number(branch.dailySalesTargetRwf || 0);
    const monthly = Number(branch.monthlyTargetRwf || 0);
    const target = period === 'TODAY' ? daily : period === 'THIS_WEEK' ? daily * 7
      : period === 'THIS_MONTH' ? (monthly > 0 ? monthly : daily * 30) : monthly;
    return {
      branchId: branch.id, branchName: branch.name, branchCode: branch.code,
      operationalStatus: branch.operationalStatus, revenue, cost, netProfit: profit,
      marginPercent: revenue > 0 ? profit / revenue * 100 : 0,
      salesCount: branchSales.length,
      stockValueRwf: liveStock > 0 ? liveStock : Number(branch.stockValueRwf || 0),
      dailyTargetRwf: daily, monthlyTargetRwf: monthly,
      targetProgressPercent: target > 0 ? Math.max(0, revenue / target * 100) : 0
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export function computeStaffPerformance(sales: Sale[], period: AnalyticsPeriod, branchId = 'ALL', nowMs = Date.now()): StaffPerformanceMetric[] {
  const start = periodStart(period, nowMs);
  const groups = new Map<string, Sale[]>();
  sales.filter(sale => sale.saleDate >= start && sale.saleDate <= nowMs &&
    (branchId === 'ALL' || !branchId || sale.branchId === branchId)).forEach(sale => {
      const name = sale.cashierName.trim() || 'Shop Operator';
      const id = sale.cashierId.trim() || name.toLowerCase();
      const key = id + '\u001f' + name;
      groups.set(key, [...(groups.get(key) || []), sale]);
    });
  return Array.from(groups.entries()).map(([key, rows]) => {
    const [cashierId, cashierName] = key.split('\u001f');
    const revenue = rows.reduce((sum, sale) => sum + sale.totalAmount, 0);
    return {
      cashierId, cashierName, salesCount: rows.length, revenue,
      profit: rows.reduce((sum, sale) => sum + sale.totalProfit, 0),
      averageOrderValue: revenue / rows.length,
      totalDiscountsGiven: rows.reduce((sum, sale) => sum + sale.discountAmount, 0)
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export function computeCustomerAging(customers: Customer[], sales: Sale[], nowMs = Date.now()): CustomerAgingSummary {
  let bucket0To30 = 0, bucket31To60 = 0, bucket61To90 = 0, bucket90Plus = 0, overLimitCount = 0;
  const entries = customers.filter(customer => !customer.isDeleted && customer.debtBalance > 0).map(customer => {
    const oldest = sales.filter(sale => sale.customerId === customer.id && sale.totalAmount > sale.amountPaid + 0.01)
      .reduce<number | null>((value, sale) => value === null || sale.saleDate < value ? sale.saleDate : value, null);
    const age = Math.floor(Math.max(0, nowMs - (oldest ?? customer.updatedAt)) / 86400000);
    const agingBucket: CustomerAgingEntry['agingBucket'] = age <= 30 ? '0-30d' : age <= 60 ? '31-60d' : age <= 90 ? '61-90d' : '90+d';
    if (agingBucket === '0-30d') bucket0To30 += customer.debtBalance;
    else if (agingBucket === '31-60d') bucket31To60 += customer.debtBalance;
    else if (agingBucket === '61-90d') bucket61To90 += customer.debtBalance;
    else bucket90Plus += customer.debtBalance;
    const utilization = customer.creditLimit > 0 ? customer.debtBalance / customer.creditLimit * 100 : 0;
    const over = customer.creditLimit > 0 && customer.debtBalance > customer.creditLimit;
    if (over) overLimitCount += 1;
    return {
      customerId: customer.id, customerName: customer.name, phone: customer.phone,
      debtBalance: customer.debtBalance, creditLimit: customer.creditLimit,
      creditUtilizationPercent: utilization, isOverLimit: over, oldestUnpaidDays: age,
      agingBucket, category: customer.category
    };
  }).sort((a, b) => b.debtBalance - a.debtBalance);
  return {
    totalReceivable: entries.reduce((sum, entry) => sum + entry.debtBalance, 0),
    bucket0To30, bucket31To60, bucket61To90, bucket90Plus, overLimitCount, entries
  };
}

export function computeCategorySalesBreakdown(sales: Sale[]): CategorySalesMetric[] {
  const groups = new Map<string, { quantity: number; revenue: number; cost: number; profit: number; sales: Set<string> }>();
  sales.forEach(sale => (sale.items || []).forEach(line => {
    const category = line.category.trim() || 'General';
    const current = groups.get(category) || { quantity: 0, revenue: 0, cost: 0, profit: 0, sales: new Set<string>() };
    current.quantity += line.quantitySold;
    current.revenue += line.subtotal;
    current.cost += line.costPriceAtSale * line.quantitySold;
    current.profit += line.profit;
    current.sales.add(sale.id);
    groups.set(category, current);
  }));
  const total = Array.from(groups.values()).reduce((sum, item) => sum + item.revenue, 0);
  return Array.from(groups.entries()).map(([category, item]) => ({
    category, quantitySold: item.quantity, revenue: item.revenue, cost: item.cost, profit: item.profit,
    salesCount: item.sales.size, revenueSharePercent: total > 0 ? item.revenue / total * 100 : 0
  })).sort((a, b) => b.revenue - a.revenue);
}
