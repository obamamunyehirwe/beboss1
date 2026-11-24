import { Activity, ArrowUpRight, Boxes, Printer, Wallet } from "lucide-react";
import { activeProducts, money, n, rows, s } from "../../lib/format";
import type { Snapshot } from "../../lib/types";
import { Empty, PageHeading, StatCard, StatusPill } from "../ui";

const FORECAST_WINDOW_DAYS = 14;
const REORDER_COVER_DAYS = 7;

export function ReportsPage({ snapshot }: { snapshot: Snapshot | null }) {
  const sales = rows(snapshot?.sales);
  const items = rows(snapshot?.saleItems);
  const products = activeProducts(snapshot);
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
  for (const sale of sales) saleDateById.set(s(sale.id), n(sale.saleDate));
  const cutoff = Date.now() - FORECAST_WINDOW_DAYS * 86400000;
  const velocity = new Map<string, number>();
  for (const item of items) {
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

  return <div className="page-stack"><PageHeading title="Reports & insights" description="Sales performance, gross margin, payment distribution, cashier output and 14-day demand forecasting, calculated from the verified shop records." action={<button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> Print report</button>} />
    <div className="stat-grid four"><StatCard label="Lifetime revenue" value={money(revenue)} icon={Wallet} /><StatCard label="Cost of goods sold" value={money(cost)} icon={Boxes} tone="orange" /><StatCard label="Gross profit" value={money(profit)} icon={ArrowUpRight} tone="green" /><StatCard label="Gross margin" value={(revenue > 0 ? profit / revenue * 100 : 0).toFixed(1) + "%"} icon={Activity} tone="purple" /></div>
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