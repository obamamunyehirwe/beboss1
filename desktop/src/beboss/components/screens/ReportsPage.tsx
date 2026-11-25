import { useMemo, useState } from "react";
import { Activity, ArrowUpRight, Boxes, Download, Printer, TrendingUp, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activeProducts, downloadCsv, money, n, rows, s } from "../../lib/format";
import type { Snapshot } from "../../lib/types";
import { Empty, PageHeading, StatCard, StatusPill } from "../ui";

const FORECAST_WINDOW_DAYS = 14;
const REORDER_COVER_DAYS = 7;

export function ReportsPage({ snapshot }: { snapshot: Snapshot | null }) {
  const [range, setRange] = useState<"7D" | "30D" | "ALL">("ALL");
  const allSales = rows(snapshot?.sales);
  const allItems = rows(snapshot?.saleItems);
  const products = activeProducts(snapshot);

  const sales = useMemo(() => {
    if (range === "ALL") return allSales;
    const days = range === "7D" ? 7 : 30;
    const cutoff = Date.now() - days * 86_400_000;
    return allSales.filter((sale) => n(sale.saleDate) >= cutoff);
  }, [allSales, range]);

  const saleIds = useMemo(() => new Set(sales.map((sale) => s(sale.id))), [sales]);
  const items = useMemo(() => allItems.filter((item) => saleIds.has(s(item.saleId))), [allItems, saleIds]);

  const revenue = sales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const profit = sales.reduce((sum, sale) => sum + n(sale.totalProfit), 0);
  const cost = sales.reduce((sum, sale) => sum + (n(sale.totalCost) || Math.max(0, n(sale.totalAmount) - n(sale.totalProfit))), 0);
  const avgOrder = sales.length > 0 ? revenue / sales.length : 0;

  const trendData = useMemo(() => {
    const days = range === "30D" ? 14 : 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: days }, (_, idx) => {
      const d = new Date(today.getTime() - (days - 1 - idx) * 86_400_000);
      const daySales = allSales.filter((r) => new Date(n(r.saleDate)).toDateString() === d.toDateString());
      return {
        day: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
        revenue: daySales.reduce((sum, r) => sum + n(r.totalAmount), 0),
        profit: daySales.reduce((sum, r) => sum + n(r.totalProfit), 0),
      };
    });
  }, [allSales, range]);
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

  return <div className="page-stack"><PageHeading title="Reports & insights" description="Sales performance, gross margin, payment distribution, cashier output and 14-day demand forecasting, calculated from the verified shop records." action={<div className="heading-actions"><button className="btn-outline" onClick={() => downloadCsv("beboss-analytics-" + Date.now() + ".csv", ["receiptNumber", "customerName", "cashierName", "paymentMethod", "paymentStatus", "totalAmount", "totalProfit"], sales)}><Download size={15} /> Export CSV</button><button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> Print report</button></div>} />
    <div className="toolbar">
      <div className="filter-tabs">
        {([["7D", "Last 7 days"], ["30D", "Last 30 days"], ["ALL", "All time"]] as const).map(([key, label]) => (
          <button key={key} className={range === key ? "active" : ""} onClick={() => setRange(key)}>{label}</button>
        ))}
      </div>
      <span className="muted">{sales.length} transactions · Avg ticket {money(avgOrder)}</span>
    </div>
    <div className="stat-grid four"><StatCard label={range === "ALL" ? "Lifetime revenue" : "Period revenue"} value={money(revenue)} sub={sales.length + " sales"} icon={Wallet} tone="blue" /><StatCard label="Cost of goods sold" value={money(cost)} sub="Item cost basis" icon={Boxes} tone="orange" /><StatCard label="Gross profit" value={money(profit)} sub={"Avg order " + money(avgOrder)} icon={ArrowUpRight} tone="green" /><StatCard label="Gross margin" value={(revenue > 0 ? profit / revenue * 100 : 0).toFixed(1) + "%"} sub="Net margin ratio" icon={Activity} tone="purple" /></div>
    <section className="panel analytics-chart-panel">
      <div className="panel-heading"><div><span className="eyebrow muted">REVENUE &amp; PROFIT TRAJECTORY</span><h3>Daily performance curve</h3></div><span className="analytics-legend"><span><i className="dot-rev" /> Revenue</span><span><i className="dot-prof" /> Gross profit</span></span></div>
      <div className="analytics-chart-box">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trendData} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="bbRevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="bbProfGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--green)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="day" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? Math.round(v / 1000) + "k" : String(v)} />
            <Tooltip formatter={(val: unknown) => money(val)} contentStyle={{ background: "var(--panel)", border: "1px solid var(--border-strong)", borderRadius: "12px", color: "var(--text-strong)", fontSize: "13px" }} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--accent)" strokeWidth={2.4} fill="url(#bbRevGrad)" />
            <Area type="monotone" dataKey="profit" name="Gross Profit" stroke="var(--green)" strokeWidth={2.2} fill="url(#bbProfGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
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
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">PAYMENT MIX</span><h3>Revenue by payment method</h3></div></div>{values.length ? values.map(([method, amount]) => <div className="metric-row" key={method}><div><strong>{method.replaceAll("_", " ")}</strong><small>{revenue ? Math.round(amount / revenue * 100) : 0}% of revenue</small></div><div className="metric-track"><span style={{ width: (revenue ? amount / revenue * 100 : 0) + "%" }} /></div><b>{money(amount)}</b></div>) : <Empty title="No payment records" description="Completed sales will appear in this report." />}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">PRODUCT PERFORMANCE</span><h3>Top products by revenue</h3></div></div>{topProducts.length ? topProducts.map(([name, value], i) => <div className="rank-row" key={name}><span className="rank-num">{i + 1}</span><span className="rank-name">{name}<small>{value.qty} units sold</small></span><strong>{money(value.revenue)}</strong></div>) : <Empty title="No product performance data" description="Sales with line items build this ranking." />}</section>
      <section className="panel span-2"><div className="panel-heading"><div><span className="eyebrow muted">CASHIER OUTPUT</span><h3>Sales by operator</h3></div></div><div className="table-wrap"><table><thead><tr><th>Cashier</th><th>Transactions</th><th>Average order</th><th>Total revenue</th></tr></thead><tbody>{topStaff.map(([name, value]) => <tr key={name}><td><strong>{name}</strong></td><td>{value.count}</td><td>{money(value.revenue / value.count)}</td><td className="strong">{money(value.revenue)}</td></tr>)}</tbody></table></div>{!topStaff.length && <Empty title="No cashier records" description="Sales are grouped by the operator saved with each transaction." />}</section>
    </div>
  </div>;
}