import { Activity, ArrowUpRight, Boxes, Download, Printer, Store, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { activeProducts, downloadCsv, money, n, rows, s } from "../../lib/format";
import type { Row, Snapshot } from "../../lib/types";
import { Empty, PageHeading, StatCard, StatusPill } from "../ui";

const HISTORY_DAYS = 56;
const FORECAST_HALF_LIFE_DAYS = 28;
const LEAD_TIME_DAYS = 7;
const REVIEW_PERIOD_DAYS = 7;
const SAFETY_STOCK_Z_90 = 1.28;
const DAY_MS = 86400000;

type ForecastRow = {
  product: Row;
  sold: number;
  avgPerDay: number;
  leadDemand: number;
  reviewDemand: number;
  safetyStock: number;
  reorderPoint: number;
  suggestedQty: number;
  stock: number;
  coverDays: number;
  trendPercent: number;
  hasTrendComparison: boolean;
  salesDays: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  urgency: "CRITICAL" | "LOW" | "REORDER";
};

function matchesBranch(recordBranchId: unknown, branchFilter: string) {
  if (!branchFilter || branchFilter === "ALL") return true;
  const record = s(recordBranchId);
  return record === branchFilter || (branchFilter === "main_branch" && !record);
}

function localDayStart(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Mirrors the offline Android statistical forecast: 56 daily observations,
 * a 28-day half-life, a bounded trend blend, weekday shrinkage and 90% safety stock.
 * It is deliberately transparent and marks sparse history as low confidence.
 */
function forecastProduct(product: Row, sales: Row[], items: Row[], branchFilter: string, nowMs: number): ForecastRow {
  const todayStart = localDayStart(nowMs);
  const dayStarts = Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const date = new Date(todayStart);
    date.setDate(date.getDate() + index - (HISTORY_DAYS - 1));
    return localDayStart(date.getTime());
  });
  const eligibleSales = new Map<string, Row>();
  for (const sale of sales) {
    const saleDate = n(sale.saleDate);
    if (saleDate >= dayStarts[0] && saleDate <= nowMs && matchesBranch(sale.branchId, branchFilter)) {
      eligibleSales.set(s(sale.id), sale);
    }
  }

  const dailyDemand = Array(HISTORY_DAYS).fill(0) as number[];
  for (const item of items) {
    if (s(item.productId) !== s(product.id)) continue;
    const quantity = n(item.quantitySold);
    if (quantity <= 0) continue;
    const sale = eligibleSales.get(s(item.saleId));
    if (!sale) continue;
    if (!matchesBranch(s(item.branchId) || sale.branchId, branchFilter)) continue;
    const saleDay = localDayStart(n(sale.saleDate));
    const index = dayStarts.findIndex((start, position) => saleDay >= start && (position === dayStarts.length - 1 || saleDay < dayStarts[position + 1]));
    if (index >= 0) dailyDemand[index] += quantity;
  }

  const sold = dailyDemand.reduce((sum, quantity) => sum + quantity, 0);
  const salesDays = dailyDemand.filter((quantity) => quantity > 0).length;
  const confidence: ForecastRow["confidence"] = salesDays >= 21 ? "HIGH" : salesDays >= 8 ? "MEDIUM" : "LOW";
  let weightedUnits = 0;
  let totalWeight = 0;
  dailyDemand.forEach((quantity, index) => {
    const ageDays = HISTORY_DAYS - 1 - index;
    const weight = Math.exp(-Math.LN2 * ageDays / FORECAST_HALF_LIFE_DAYS);
    weightedUnits += quantity * weight;
    totalWeight += weight;
  });
  const weightedAverage = totalWeight > 0 ? weightedUnits / totalWeight : 0;
  const recent14 = dailyDemand.slice(-14).reduce((sum, value) => sum + value, 0) / 14;
  const previous14 = dailyDemand.slice(28, 42).reduce((sum, value) => sum + value, 0) / 14;
  const hasTrendComparison = previous14 > 0;
  const trendPercent = hasTrendComparison
    ? Math.max(-100, Math.min(300, ((recent14 - previous14) / previous14) * 100))
    : 0;
  const trendRatio = hasTrendComparison ? Math.max(0.7, Math.min(1.4, recent14 / previous14)) : 1;
  const trendFactor = 0.85 + 0.15 * trendRatio;
  const avgPerDay = sold > 0 ? (weightedAverage * 0.7 + recent14 * 0.3) * trendFactor : 0;

  const dailyMean = sold / HISTORY_DAYS;
  const variance = dailyDemand.reduce((sum, quantity) => sum + Math.pow(quantity - dailyMean, 2), 0) / HISTORY_DAYS;
  const dailyStdDev = Math.sqrt(variance);
  const weekdayTotals = Array(7).fill(0) as number[];
  const weekdayCounts = Array(7).fill(0) as number[];
  dailyDemand.forEach((quantity, index) => {
    const date = new Date(dayStarts[index]);
    weekdayTotals[date.getDay()] += quantity;
    weekdayCounts[date.getDay()] += 1;
  });
  const forecastForDays = (days: number) => {
    let expected = 0;
    const nextDay = new Date(todayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    for (let offset = 0; offset < days; offset++) {
      const date = new Date(nextDay);
      date.setDate(date.getDate() + offset);
      const weekday = date.getDay();
      const baseline = dailyMean;
      const factor = baseline <= 0 || weekdayCounts[weekday] < 4
        ? 1
        : Math.max(0.6, Math.min(1.5, ((weekdayTotals[weekday] / weekdayCounts[weekday]) * 0.65 + baseline * 0.35) / baseline));
      expected += avgPerDay * factor;
    }
    return expected;
  };

  const leadDemand = forecastForDays(LEAD_TIME_DAYS);
  const reviewDemand = forecastForDays(REVIEW_PERIOD_DAYS);
  const safetyStock = SAFETY_STOCK_Z_90 * dailyStdDev * Math.sqrt(LEAD_TIME_DAYS);
  const stock = Math.max(0, n(product.quantityInStock));
  const threshold = Math.max(0, n(product.lowStockThreshold));
  const reorderPoint = sold > 0 ? Math.max(leadDemand + safetyStock, threshold) : threshold;
  const targetStock = sold > 0 ? Math.max(leadDemand + reviewDemand + safetyStock, threshold * 2, 1) : Math.max(threshold * 2, 1);
  const suggestedQty = stock <= Math.max(reorderPoint, threshold)
    ? Math.max(1, Math.ceil(Math.max(0, targetStock - stock)))
    : 0;
  const coverDays = avgPerDay > 0 ? stock / avgPerDay : Number.POSITIVE_INFINITY;
  const urgency: ForecastRow["urgency"] = stock <= 0 || (avgPerDay > 0 && coverDays <= LEAD_TIME_DAYS)
    ? "CRITICAL"
    : stock <= threshold || (avgPerDay > 0 && coverDays <= LEAD_TIME_DAYS + REVIEW_PERIOD_DAYS)
      ? "LOW"
      : "REORDER";
  return {
    product, sold, avgPerDay, leadDemand, reviewDemand, safetyStock, reorderPoint, suggestedQty,
    stock, coverDays, trendPercent, hasTrendComparison, salesDays, confidence, urgency
  };
}

export function ReportsPage({ snapshot }: { snapshot: Snapshot | null }) {
  const [range, setRange] = useState("30D");
  const [branchFilter, setBranchFilter] = useState("ALL");
  const allSales = rows(snapshot?.sales);
  const allItems = rows(snapshot?.saleItems);
  const allCustomers = rows(snapshot?.customers).filter((customer) => customer.isDeleted !== true);
  const allBranches = rows(snapshot?.branches).filter((branch) => branch.isActive !== false);
  const rangeDays = range === "7D" ? 7 : range === "30D" ? 30 : range === "90D" ? 90 : range === "365D" ? 365 : 0;
  const periodStart = rangeDays ? Date.now() - rangeDays * DAY_MS : 0;
  const sales = allSales.filter((sale) => (!periodStart || n(sale.saleDate) >= periodStart) && matchesBranch(sale.branchId, branchFilter));
  const saleIds = new Set(sales.map((sale) => s(sale.id)));
  const items = allItems.filter((item) => saleIds.has(s(item.saleId)));
  const products = activeProducts(snapshot).filter((product) => matchesBranch(product.branchId, branchFilter));
  const previousStart = rangeDays ? periodStart - rangeDays * DAY_MS : 0;
  const previousSales = rangeDays
    ? allSales.filter((sale) => n(sale.saleDate) >= previousStart && n(sale.saleDate) < periodStart && matchesBranch(sale.branchId, branchFilter))
    : [];
  const revenue = sales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const cost = sales.reduce((sum, sale) => sum + n(sale.totalCost), 0);
  const profit = sales.reduce((sum, sale) => sum + n(sale.totalProfit), 0);
  const previousRevenue = previousSales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const revenueChange = previousRevenue > 0 ? ((revenue - previousRevenue) / previousRevenue) * 100 : null;

  const trend = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 14 }, (_, index) => {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (13 - index));
      return { key: day.toDateString(), label: day.toLocaleDateString(undefined, { day: "numeric", month: "short" }), revenue: 0, profit: 0 };
    });
    const byDay = new Map(days.map((day) => [day.key, day]));
    for (const sale of sales) {
      const day = new Date(localDayStart(n(sale.saleDate))).toDateString();
      const bucket = byDay.get(day);
      if (bucket) { bucket.revenue += n(sale.totalAmount); bucket.profit += n(sale.totalProfit); }
    }
    return days;
  }, [sales]);
  const maxTrend = Math.max(1, ...trend.map((day) => day.revenue));

  const customerMetrics = useMemo(() => {
    const activity = new Map<string, { name: string; spend: number; count: number }>();
    for (const sale of sales) {
      const key = s(sale.customerId) || s(sale.customerName) || "WALK_IN";
      const current = activity.get(key) ?? { name: s(sale.customerName) || "Walk-in Customer", spend: 0, count: 0 };
      current.spend += n(sale.totalAmount);
      current.count += 1;
      activity.set(key, current);
    }
    const ranked = [...activity.values()].filter((item) => item.name !== "Walk-in Customer" && item.count > 0).sort((a, b) => b.spend - a.spend);
    const owing = allCustomers.filter((customer) => n(customer.debtBalance) > 0);
    const aging = owing.map((customer) => {
      const unpaid = allSales.filter((sale) => s(sale.customerId) === s(customer.id) && n(sale.totalAmount) > n(sale.amountPaid) + 0.01);
      const oldestSale = unpaid.length ? Math.min(...unpaid.map((sale) => n(sale.saleDate))) : n(customer.updatedAt);
      const ageDays = Math.max(0, Math.floor((Date.now() - (oldestSale || Date.now())) / DAY_MS));
      const bucket = ageDays <= 30 ? "0–30 days" : ageDays <= 60 ? "31–60 days" : ageDays <= 90 ? "61–90 days" : "90+ days";
      const limit = n(customer.creditLimit);
      return { customer, ageDays, bucket, overLimit: limit > 0 && n(customer.debtBalance) > limit };
    }).sort((a, b) => n(b.customer.debtBalance) - n(a.customer.debtBalance));
    const bucketTotals = new Map<string, number>([["0–30 days", 0], ["31–60 days", 0], ["61–90 days", 0], ["90+ days", 0]]);
    for (const row of aging) bucketTotals.set(row.bucket, (bucketTotals.get(row.bucket) ?? 0) + n(row.customer.debtBalance));
    return {
      unique: ranked.length,
      repeat: ranked.filter((item) => item.count > 1).length,
      top: ranked.slice(0, 6),
      aging,
      buckets: [...bucketTotals.entries()],
      receivables: owing.reduce((sum, customer) => sum + n(customer.debtBalance), 0),
      overLimitCount: aging.filter((item) => item.overLimit).length
    };
  }, [sales, allCustomers, allSales]);

  const methods = new Map<string, number>();
  for (const sale of sales) {
    const key = s(sale.paymentMethod) || "OTHER";
    methods.set(key, (methods.get(key) ?? 0) + n(sale.totalAmount));
  }
  const paymentMix = [...methods.entries()].sort((a, b) => b[1] - a[1]);

  const staff = new Map<string, { revenue: number; profit: number; discounts: number; count: number }>();
  for (const sale of sales) {
    const key = s(sale.cashierId) || s(sale.cashierName) || "Unknown";
    const current = staff.get(key) ?? { revenue: 0, profit: 0, discounts: 0, count: 0 };
    current.revenue += n(sale.totalAmount);
    current.profit += n(sale.totalProfit);
    current.discounts += n(sale.discountAmount);
    current.count += 1;
    staff.set(key, current);
  }
  const staffRanking = [...staff.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 12);

  const productById = new Map(products.map((product) => [s(product.id), product]));
  const category = new Map<string, { qty: number; revenue: number }>();
  const productPerformance = new Map<string, { qty: number; revenue: number }>();
  for (const item of items) {
    const product = productById.get(s(item.productId));
    const categoryName = s(item.category) || s(product?.category) || "Uncategorized";
    const categoryCurrent = category.get(categoryName) ?? { qty: 0, revenue: 0 };
    categoryCurrent.qty += n(item.quantitySold);
    categoryCurrent.revenue += n(item.subtotal);
    category.set(categoryName, categoryCurrent);
    const productName = s(item.productName) || s(product?.name) || "Product";
    const productCurrent = productPerformance.get(productName) ?? { qty: 0, revenue: 0 };
    productCurrent.qty += n(item.quantitySold);
    productCurrent.revenue += n(item.subtotal);
    productPerformance.set(productName, productCurrent);
  }
  const topProducts = [...productPerformance.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);
  const categoryBreakdown = [...category.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const forecast = products.map((product) => forecastProduct(product, allSales, allItems, branchFilter, Date.now()))
    .filter((row) => row.suggestedQty > 0)
    .sort((a, b) => (a.urgency === b.urgency ? a.coverDays - b.coverDays : a.urgency === "CRITICAL" ? -1 : b.urgency === "CRITICAL" ? 1 : a.urgency === "LOW" ? -1 : 1));
  const reorderCount = forecast.filter((row) => row.urgency === "CRITICAL").length;

  const branchMetrics = allBranches.filter((branch) => branchFilter === "ALL" || s(branch.id) === branchFilter).map((branch) => {
    const branchSales = sales.filter((sale) => matchesBranch(sale.branchId, s(branch.id)));
    const branchProducts = rows(snapshot?.products).filter((product) => product.isDeleted !== true && matchesBranch(product.branchId, s(branch.id)));
    const branchRevenue = branchSales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
    const branchProfit = branchSales.reduce((sum, sale) => sum + n(sale.totalProfit), 0);
    const stockCost = branchProducts.reduce((sum, product) => sum + Math.max(0, n(product.quantityInStock)) * Math.max(0, n(product.costPrice)), 0);
    const target = range === "7D"
      ? n(branch.dailySalesTargetRwf) * 7
      : range === "30D" ? n(branch.monthlyTargetRwf) || n(branch.dailySalesTargetRwf) * 30
      : range === "90D" ? n(branch.monthlyTargetRwf) * 3
      : range === "365D" ? n(branch.monthlyTargetRwf) * 12
      : 0;
    return {
      id: s(branch.id), name: s(branch.name) || "Branch", code: s(branch.code),
      status: s(branch.operationalStatus) || "OPEN", salesCount: branchSales.length,
      revenue: branchRevenue, profit: branchProfit, stockCost,
      margin: branchRevenue > 0 ? branchProfit / branchRevenue * 100 : 0,
      target, targetProgress: target > 0 ? branchRevenue / target * 100 : null
    };
  }).sort((a, b) => b.revenue - a.revenue);

  function exportReport() {
    downloadCsv("beboss-business-report-" + Date.now() + ".csv",
      ["saleId", "saleDate", "branchId", "cashierName", "customerName", "paymentMethod", "totalAmount", "totalCost", "totalProfit", "amountPaid"],
      sales.map((sale) => ({
        saleId: s(sale.id), saleDate: new Date(n(sale.saleDate)).toISOString(), branchId: s(sale.branchId),
        cashierName: s(sale.cashierName), customerName: s(sale.customerName), paymentMethod: s(sale.paymentMethod),
        totalAmount: n(sale.totalAmount), totalCost: n(sale.totalCost), totalProfit: n(sale.totalProfit), amountPaid: n(sale.amountPaid)
      }))
    );
  }

  return <div className="page-stack">
    <PageHeading title="Business intelligence & analytics"
      description="Branch-aware financial reporting, staff productivity, customer receivables and mobile-equivalent demand planning calculated from the synchronized BeBoss ledger."
      action={<div className="heading-actions">
        <select aria-label="Analytics date range" className="report-range-select" value={range} onChange={(event) => setRange(event.target.value)}>
          <option value="7D">Last 7 days</option><option value="30D">Last 30 days</option><option value="90D">Last 90 days</option><option value="365D">Last 12 months</option><option value="ALL">All history</option>
        </select>
        <select aria-label="Analytics branch" className="report-range-select" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
          <option value="ALL">All branches</option>{allBranches.map((branch) => <option key={s(branch.id)} value={s(branch.id)}>{s(branch.name) || s(branch.code)}</option>)}
        </select>
        <button className="btn-outline" onClick={exportReport}><Download size={16} /> Export CSV</button>
        <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> Print report</button>
      </div>} />
    <div className="report-period-caption">
      <span>{range === "ALL" ? "All synchronized sales history" : "Reporting period · " + rangeDays + " days"}</span>
      <span>{sales.length.toLocaleString()} transactions · {branchFilter === "ALL" ? "all branches" : allBranches.find((branch) => s(branch.id) === branchFilter)?.name || "selected branch"}</span>
      {revenueChange !== null && <strong className={revenueChange >= 0 ? "report-positive" : "report-negative"}>{revenueChange >= 0 ? "+" : ""}{revenueChange.toFixed(1)}% vs previous period</strong>}
    </div>
    <div className="stat-grid four">
      <StatCard label="Sales revenue" value={money(revenue)} icon={Wallet} sub={range === "ALL" ? "All recorded history" : "Selected reporting period"} />
      <StatCard label="Cost of goods sold" value={money(cost)} icon={Boxes} tone="orange" />
      <StatCard label="Gross profit" value={money(profit)} icon={ArrowUpRight} tone="green" />
      <StatCard label="Gross margin" value={(revenue > 0 ? profit / revenue * 100 : 0).toFixed(1) + "%"} icon={Activity} tone="purple" />
    </div>

    <section className="panel report-trend-panel">
      <div className="panel-heading"><div><span className="eyebrow muted">DAILY PERFORMANCE</span><h3>Revenue & gross profit · last 14 days</h3></div><div className="report-legend"><span><i className="revenue-dot" />Revenue</span><span><i className="profit-dot" />Gross profit</span></div></div>
      <div className="report-trend-chart">{trend.map((day) => <div className="report-trend-day" key={day.key} title={day.label + " · Revenue " + money(day.revenue) + " · Profit " + money(day.profit)}>
        <div className="report-trend-bars"><i className="report-bar-revenue" style={{ height: (day.revenue / maxTrend * 100) + "%" }} /><i className="report-bar-profit" style={{ height: (day.profit / maxTrend * 100) + "%" }} /></div>
        <small>{day.label}</small>
      </div>)}</div>
      <p className="panel-hint">The chart uses saved transaction dates and amounts. Days without transactions remain at zero; no sales are invented.</p>
    </section>

    <div className="stat-grid four">
      <StatCard label="Active customers in sales" value={customerMetrics.unique.toLocaleString()} icon={Users} />
      <StatCard label="Repeat customers" value={customerMetrics.repeat.toLocaleString()} icon={Users} tone="green" />
      <StatCard label="Customer receivables" value={money(customerMetrics.receivables)} icon={Wallet} tone="orange" />
      <StatCard label="Average order value" value={money(sales.length ? revenue / sales.length : 0)} icon={ArrowUpRight} />
    </div>

    <section className="panel forecast-panel">
      <div className="panel-heading"><div><span className="eyebrow muted">DEMAND PLANNING · 56-DAY HISTORY</span><h3>Replenishment recommendations</h3></div><span className={"alert-count " + (forecast.length > 0 ? "" : "ok")}>{forecast.length} suggested orders</span></div>
      {forecast.length ? <div className="table-wrap"><table className="forecast-table"><thead><tr><th>Product</th><th>On hand</th><th>Sold · 56d</th><th>Daily forecast</th><th>Lead demand + safety</th><th>Days cover</th><th>Order qty</th><th>Confidence</th><th>Priority</th></tr></thead><tbody>
        {forecast.slice(0, 40).map((row) => <tr key={s(row.product.id)}>
          <td><strong>{s(row.product.name) || "Item"}</strong><small className="cell-sub">{s(row.product.unit) || "pcs"} · reorder point {row.reorderPoint.toFixed(1)}</small></td>
          <td>{row.stock.toLocaleString()}</td><td>{row.sold.toLocaleString()}</td><td>{row.avgPerDay.toFixed(2)}</td>
          <td>{(row.leadDemand + row.safetyStock).toFixed(1)}</td>
          <td className={row.urgency === "CRITICAL" ? "strong warn-text" : ""}>{Number.isFinite(row.coverDays) ? row.coverDays.toFixed(1) + "d" : "No demand"}</td>
          <td className="strong">{row.suggestedQty.toLocaleString()} {s(row.product.unit) || "pcs"}</td>
          <td><StatusPill value={row.confidence} /></td><td><StatusPill value={row.urgency} /></td>
        </tr>)}
      </tbody></table></div> : <Empty title="No replenishment action required" description="The current catalogue has no products at or below their lead-time reorder point. New sales update this analysis automatically." icon={Activity} />}
      <p className="panel-hint">This offline statistical model uses a 56-day recency-weighted baseline, a bounded 14-day trend adjustment, weekday seasonality when enough observations exist, and a 90% service-level safety-stock estimate. Planning defaults are {LEAD_TIME_DAYS} lead-time days plus {REVIEW_PERIOD_DAYS} review days; low-volume history is labelled low confidence. Review supplier lead times before placing an order.</p>
    </section>

    <div className="stat-grid four">
      {customerMetrics.buckets.map(([label, amount]) => <StatCard key={label} label={"Receivables · " + label} value={money(amount)} icon={Wallet} tone={label === "90+ days" ? "red" : label === "0–30 days" ? "green" : "orange"} />)}
    </div>

    <div className="report-grid">
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">CUSTOMER VALUE</span><h3>Highest-value customers</h3></div></div>
        {customerMetrics.top.length ? customerMetrics.top.map((customer, index) => <div className="rank-row" key={customer.name + index}><span className="rank-num">{index + 1}</span><span className="rank-name">{customer.name}<small>{customer.count} transactions</small></span><strong>{money(customer.spend)}</strong></div>) : <Empty title="No named customer sales" description="Attach customers to sales at checkout to build lifetime-value and repeat-purchase analysis." />}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">PAYMENT MIX</span><h3>Revenue by payment method</h3></div></div>
        {paymentMix.length ? paymentMix.map(([method, amount]) => <div className="metric-row" key={method}><div><strong>{method.replaceAll("_", " ")}</strong><small>{revenue ? Math.round(amount / revenue * 100) : 0}% of revenue</small></div><div className="metric-track"><span style={{ width: (revenue ? amount / revenue * 100 : 0) + "%" }} /></div><b>{money(amount)}</b></div>) : <Empty title="No payment records" description="Completed sales will appear in this report." />}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">PRODUCT PERFORMANCE</span><h3>Top products by revenue</h3></div></div>
        {topProducts.length ? topProducts.map(([name, value], index) => <div className="rank-row" key={name}><span className="rank-num">{index + 1}</span><span className="rank-name">{name}<small>{value.qty} units sold</small></span><strong>{money(value.revenue)}</strong></div>) : <Empty title="No product performance data" description="Sales with line items build this ranking." />}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">CATEGORY PERFORMANCE</span><h3>Revenue by category</h3></div></div>
        {categoryBreakdown.length ? categoryBreakdown.slice(0, 8).map(([name, value]) => <div className="metric-row" key={name}><div><strong>{name}</strong><small>{value.qty} units</small></div><div className="metric-track"><span style={{ width: (revenue ? value.revenue / revenue * 100 : 0) + "%" }} /></div><b>{money(value.revenue)}</b></div>) : <Empty title="No category breakdown" description="Product categories are taken from the catalogue and saved sales lines." />}
      </section>
    </div>

    <section className="panel span-2"><div className="panel-heading"><div><span className="eyebrow muted">CASHIER OUTPUT</span><h3>Staff performance</h3></div></div>
      {staffRanking.length ? <div className="table-wrap"><table><thead><tr><th>Operator</th><th>Transactions</th><th>Average order</th><th>Discounts</th><th>Revenue</th><th>Gross profit</th></tr></thead><tbody>{staffRanking.map(([key, value]) => {
        const sample = sales.find((sale) => (s(sale.cashierId) || s(sale.cashierName) || "Unknown") === key);
        return <tr key={key}><td><strong>{s(sample?.cashierName) || key}</strong></td><td>{value.count}</td><td>{money(value.revenue / value.count)}</td><td>{money(value.discounts)}</td><td className="strong">{money(value.revenue)}</td><td>{money(value.profit)}</td></tr>;
      })}</tbody></table></div> : <Empty title="No operator records" description="Sales are grouped by the cashier identity stored with each transaction." />}
    </section>

    <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">MULTI-BRANCH PERFORMANCE</span><h3>Branch comparison</h3></div><Store size={18} className="muted-icon" /></div>
      {branchMetrics.length ? <div className="table-wrap"><table><thead><tr><th>Branch</th><th>Operational state</th><th>Transactions</th><th>Revenue</th><th>Gross profit</th><th>Margin</th><th>Stock at cost</th><th>Target progress</th></tr></thead><tbody>{branchMetrics.map((branch) => <tr key={branch.id}>
        <td><strong>{branch.name}</strong><small className="cell-sub">{branch.code}</small></td><td><StatusPill value={branch.status} /></td><td>{branch.salesCount}</td><td>{money(branch.revenue)}</td><td>{money(branch.profit)}</td><td>{branch.margin.toFixed(1)}%</td><td>{money(branch.stockCost)}</td><td>{branch.targetProgress === null ? "Target not configured" : branch.targetProgress.toFixed(1) + "%"}</td>
      </tr>)}</tbody></table></div> : <Empty title="No branch performance records" description="Create or synchronize active branches to compare operating performance." />}
    </section>

    <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">CREDIT RISK · CUSTOMER AGING</span><h3>Outstanding customer balances</h3></div><span className="alert-count">{customerMetrics.overLimitCount} over credit limit</span></div>
      {customerMetrics.aging.length ? <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Outstanding</th><th>Credit limit</th><th>Oldest unpaid</th><th>Aging bucket</th><th>Risk</th></tr></thead><tbody>{customerMetrics.aging.slice(0, 30).map((row) => <tr key={s(row.customer.id)}>
        <td><strong>{s(row.customer.name)}</strong><small className="cell-sub">{s(row.customer.phone)}</small></td><td className="strong">{money(row.customer.debtBalance)}</td><td>{n(row.customer.creditLimit) > 0 ? money(row.customer.creditLimit) : "No limit"}</td><td>{row.ageDays} days</td><td>{row.bucket}</td><td><StatusPill value={row.overLimit ? "OVER LIMIT" : row.ageDays > 30 ? "OVERDUE" : "CURRENT"} /></td>
      </tr>)}</tbody></table></div> : <Empty title="No customer receivables" description="Customers with outstanding balances appear here, grouped by the age of their oldest unpaid sale." />}
      <p className="panel-hint">Aging uses each customer's oldest sale whose total exceeds its recorded amount paid, matching the Android reporting rule. Where no unpaid sale exists, the customer's last update timestamp is used as the fallback age reference.</p>
    </section>
  </div>;
}