import { Activity, ArrowUpRight, Boxes, Printer, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { activeProducts, money, n, rows, s } from "../../lib/format";
import type { Snapshot } from "../../lib/types";
import { Empty, PageHeading, StatCard, StatusPill } from "../ui";

const FORECAST_WINDOW_DAYS = 14;
const REORDER_COVER_DAYS = 7;

export function ReportsPage({ snapshot }: { snapshot: Snapshot | null }) {
  const [range, setRange] = useState("30D");
  const allSales = rows(snapshot?.sales);
  const allItems = rows(snapshot?.saleItems);
  const rangeDays = range === "7D" ? 7 : range === "30D" ? 30 : range === "90D" ? 90 : range === "365D" ? 365 : 0;
  const periodStart = rangeDays ? Date.now() - rangeDays * 86400000 : 0;
  const sales = allSales.filter((sale) => !periodStart || n(sale.saleDate) >= periodStart);
  const saleIds = new Set(sales.map((sale) => s(sale.id)));
  const items = allItems.filter((item) => saleIds.has(s(item.saleId)));
  const products = activeProducts(snapshot);
  const customers = rows(snapshot?.customers).filter((customer) => customer.isDeleted !== true);
  const currentRevenue = sales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const previousStart = rangeDays ? periodStart - rangeDays * 86400000 : 0;
  const previousRevenue = rangeDays
    ? allSales.filter((sale) => n(sale.saleDate) >= previousStart && n(sale.saleDate) < periodStart)
        .reduce((sum, sale) => sum + n(sale.totalAmount), 0)
    : 0;
  const revenueChange = previousRevenue > 0 ? (currentRevenue - previousRevenue) / previousRevenue * 100 : null;
  const customerMetrics = useMemo(() => {
    const activity = new Map<string, { name: string; spend: number; count: number }>();
    for (const sale of sales) {
      const key = s(sale.customerId) || s(sale.customerName) || "WALK_IN";
      const old = activity.get(key) ?? { name: s(sale.customerName) || "Walk-in Customer", spend: 0, count: 0 };
      old.spend += n(sale.totalAmount); old.count += 1; activity.set(key, old);
    }
    const ranked = [...activity.values()].filter((item) => item.name !== "Walk-in Customer" && item.count > 0)
      .sort((a, b) => b.spend - a.spend);
    return {
      unique: ranked.length,
      repeat: ranked.filter((item) => item.count > 1).length,
      top: ranked.slice(0, 6),
      receivables: customers.reduce((sum, customer) => sum + n(customer.debtBalance), 0)
    };
  }, [sales, customers]);
  const trend = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 14 }, (_, index) => {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (13 - index));
      const key = day.toDateString();
      return { key, label: day.toLocaleDateString(undefined, { day: "numeric", month: "short" }), revenue: 0, profit: 0 };
    });
    const dayMap = new Map(days.map((day) => [day.key, day]));
    for (const sale of allSales) {
      const date = new Date(n(sale.saleDate));
      const bucket = dayMap.get(new Date(date.getFullYear(), date.getMonth(), date.getDate()).toDateString());
      if (bucket) { bucket.revenue += n(sale.totalAmount); bucket.profit += n(sale.totalProfit); }
    }
    return days;
  }, [allSales]);
  const maxTrend = Math.max(1, ...trend.map((day) => day.revenue));
  const revenue = sales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const cost = sales.reduce((sum, sale) => sum + n(sale.totalCost), 0);
  const profit = sales.reduce((sum, sale) => sum + n(sale.totalProfit), 0);
  const methods = new Map<string, number>();
  for (const sale of sales) { const key = s(sale.paymentMethod) || "OTHER"; methods.set(key, (methods.get(key) || 0) + n(sale.totalAmount)); }
  const staff = new Map<string, { revenue: number; count: number }>();
  for (const sale of sales) { const key = s(sale.cashierName) || "Unknown"; const old = staff.get(key) || { revenue: 0, count: 0 }; old.revenue += n(sale.totalAmount); old.count++; staff.set(key, old); }
  const top = new Map<string, { qty: number; revenue: number }>();
  for (const item of items) { const key = s(item.productName) || "Product"; const old = top.get(key) || { qty: 0, revenue: 0 }; old.qty += n(item.quantitySold); old.revenue += n(item.subtotal); top.set(key, old); }
  const values = [...methods.entries()].sort((a, b) => b[1] - a[1]);
  const topProducts = [...top.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);
  const topStaff = [...staff.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);

  const saleDateById = new Map<string, number>();
  for (const sale of allSales) saleDateById.set(s(sale.id), n(sale.saleDate));
  const cutoff = Date.now() - FORECAST_WINDOW_DAYS * 86400000;
  const velocity = new Map<string, number>();
  for (const item of allItems) {
    const saleDate = saleDateById.get(s(item.saleId)) ?? 0;
    if (saleDate >= cutoff) {
      const key = s(item.productId) || s(item.productName);
      velocity.set(key, (velocity.get(key) || 0) + n(item.quantitySold));
    }
  }
  const forecast = products.map((p) => {
    const sold = velocity.get(s(p.id)) || 0;
    const avgPerDay = sold / FORECAST_WINDOW_DAYS;
    const stock = n(p.quantityInStock);
    const coverDays = avgPerDay > 0 ? stock / avgPerDay : Infinity;
    const status = stock <= 0 ? "OUT" : coverDays <= REORDER_COVER_DAYS ? "REORDER" : coverDays <= REORDER_COVER_DAYS * 2 ? "WATCH" : "HEALTHY";
    return { product: p, sold, avgPerDay, stock, coverDays, status };
  }).sort((a, b) => a.coverDays - b.coverDays);
  const reorderCount = forecast.filter((f) => f.status === "REORDER" || f.status === "OUT").length;

  return <div className="page-stack">
    <PageHeading title="Business intelligence & analytics" description="Revenue, margins, customer retention, collection exposure, payment mix, staff productivity, product demand and branch performance calculated from the synchronized BeBoss ledger." action={<div className="heading-actions"><select aria-label="Analytics date range" className="report-range-select" value={range} onChange={(event) => setRange(event.target.value)}><option value="7D">Last 7 days</option><option value="30D">Last 30 days</option><option value="90D">Last 90 days</option><option value="365D">Last 12 months</option><option value="ALL">All history</option></select><button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> Print report</button></div>} />
    <div className="report-period-caption"><span>{range === "ALL" ? "All synchronized sales history" : "Reporting period · " + rangeDays + " days"}</span><span>{sales.length.toLocaleString()} transactions in range</span>{revenueChange !== null && <strong className={revenueChange >= 0 ? "report-positive" : "report-negative"}>{revenueChange >= 0 ? "+" : ""}{revenueChange.toFixed(1)}% vs previous period</strong>}</div>
    <div className="stat-grid four"><StatCard label="Sales revenue" value={money(revenue)} icon={Wallet} sub={range === "ALL" ? "All recorded history" : "Selected reporting period"} /><StatCard label="Cost of goods sold" value={money(cost)} icon={Boxes} tone="orange" /><StatCard label="Gross profit" value={money(profit)} icon={ArrowUpRight} tone="green" /><StatCard label="Gross margin" value={(revenue > 0 ? profit / revenue * 100 : 0).toFixed(1) + "%"} icon={Activity} tone="purple" /></div>
    <section className="panel report-trend-panel">
      <div className="panel-heading"><div><span className="eyebrow muted">DAILY PERFORMANCE</span><h3>Revenue & gross profit · last 14 days</h3></div><div className="report-legend"><span><i className="revenue-dot"/>Revenue</span><span><i className="profit-dot"/>Gross profit</span></div></div>
      <div className="report-trend-chart">{trend.map((day) => <div className="report-trend-day" key={day.key} title={day.label + " · Revenue " + money(day.revenue) + " · Profit " + money(day.profit)}>
        <div className="report-trend-bars"><i className="report-bar-revenue" style={{height:(day.revenue/maxTrend*100)+"%"}}/><i className="report-bar-profit" style={{height:(day.profit/maxTrend*100)+"%"}}/></div>
        <small>{day.label}</small>
      </div>)}</div>
      <p className="panel-hint">The chart uses saved sale dates and amounts. Days with no recorded sales remain at zero; the chart does not forecast or invent transactions.</p>
    </section>
    <div className="stat-grid four"><StatCard label="Active customers in sales" value={customerMetrics.unique.toLocaleString()} icon={Users}/><StatCard label="Repeat customers" value={customerMetrics.repeat.toLocaleString()} icon={Users} tone="green"/><StatCard label="Customer receivables" value={money(customerMetrics.receivables)} icon={Wallet} tone="orange"/><StatCard label="Average order value" value={money(sales.length ? revenue / sales.length : 0)} icon={ArrowUpRight}/></div>
    <section className="panel forecast-panel">
      <div className="panel-heading"><div><span className="eyebrow muted">DEMAND FORECAST</span><h3>14-day moving average & stock cover</h3></div><span className={"alert-count " + (reorderCount > 0 ? "" : "ok")}>{reorderCount} to reorder</span></div>
      {forecast.length ? <div className="table-wrap"><table className="forecast-table"><thead><tr><th>Product</th><th>Stock</th><th>Sold (14d)</th><th>Avg / day</th><th>Days cover</th><th>Signal</th></tr></thead><tbody>
        {forecast.slice(0, 30).map((f) => <tr key={s(f.product.id)}>
          <td><strong>{s(f.product.name) || "Item"}</strong><small className="cell-sub">{s(f.product.unit) || "pcs"}</small></td>
          <td>{f.stock.toLocaleString()}</td>
          <td>{f.sold.toLocaleString()}</td>
          <td>{f.avgPerDay.toFixed(2)}</td>
          <td className={f.coverDays <= REORDER_COVER_DAYS ? "strong warn-text" : ""}>{Number.isFinite(f.coverDays) ? Math.round(f.coverDays) + " days" : "—"}</td>
          <td><StatusPill value={f.status === "OUT" ? "OUT STOCK" : f.status === "REORDER" ? "REORDER" : f.status === "WATCH" ? "WATCH" : "HEALTHY"} /></td>
        </tr>)}
      </tbody></table></div> : <Empty title="No forecasting data yet" description="Record sales on a BeBoss terminal to build demand forecasts." icon={Activity} />}
      <p className="panel-hint">Days cover = current stock ÷ average daily units sold over the last {FORECAST_WINDOW_DAYS} days. Items at or below {REORDER_COVER_DAYS} days of cover are flagged for reordering.</p>
    </section>
    <div className="report-grid">
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">CUSTOMER VALUE</span><h3>Highest-value customers</h3></div></div>
        {customerMetrics.top.length ? customerMetrics.top.map((customer, index) => <div className="rank-row" key={customer.name + index}><span className="rank-num">{index + 1}</span><span className="rank-name">{customer.name}<small>{customer.count} transactions</small></span><strong>{money(customer.spend)}</strong></div>) : <Empty title="No named customer sales" description="Attach customers to sales at checkout to build lifetime value and repeat-customer analysis."/>}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">PAYMENT MIX</span><h3>Revenue by payment method</h3></div></div>{values.length ? values.map(([method, amount]) => <div className="metric-row" key={method}><div><strong>{method.replaceAll("_", " ")}</strong><small>{revenue ? Math.round(amount / revenue * 100) : 0}% of revenue</small></div><div className="metric-track"><span style={{ width: (revenue ? amount / revenue * 100 : 0) + "%" }} /></div><b>{money(amount)}</b></div>) : <Empty title="No payment records" description="Completed sales will appear in this report." />}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">PRODUCT PERFORMANCE</span><h3>Top products by revenue</h3></div></div>{topProducts.length ? topProducts.map(([name, value], i) => <div className="rank-row" key={name}><span className="rank-num">{i + 1}</span><span className="rank-name">{name}<small>{value.qty} units sold</small></span><strong>{money(value.revenue)}</strong></div>) : <Empty title="No product performance data" description="Sales with line items build this ranking." />}</section>
      <section className="panel span-2"><div className="panel-heading"><div><span className="eyebrow muted">CASHIER OUTPUT</span><h3>Sales by operator</h3></div></div><div className="table-wrap"><table><thead><tr><th>Cashier</th><th>Transactions</th><th>Average order</th><th>Total revenue</th></tr></thead><tbody>{topStaff.map(([name, value]) => <tr key={name}><td><strong>{name}</strong></td><td>{value.count}</td><td>{money(value.revenue / value.count)}</td><td className="strong">{money(value.revenue)}</td></tr>)}</tbody></table></div>{!topStaff.length && <Empty title="No cashier records" description="Sales are grouped by the operator saved with each transaction." />}</section>
    </div>
  </div>;
}