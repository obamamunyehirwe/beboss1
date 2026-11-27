import { Activity, ArrowRight, ArrowUpRight, Boxes, Building2, CreditCard, Search, ShieldCheck, ShoppingCart, Tags, Truck, Wallet } from "lucide-react";
import { activeProducts, money, n, rows, s } from "../../lib/format";
import type { CloudState, NavKey, Snapshot } from "../../lib/types";
import { Empty, PageHeading, SalesTable, StatCard } from "../ui";

export function OverviewPage({ cloud, snapshot, offline, revenueToday, profitToday, stockCost, receivables, lowStock, onNavigate, onOpenCommand }: {
  cloud: CloudState; snapshot: Snapshot | null; offline: boolean; revenueToday: number; profitToday: number;
  stockCost: number; receivables: number; lowStock: number; onNavigate: (view: NavKey) => void; onOpenCommand?: () => void
}) {
  const sales = rows(snapshot?.sales).sort((a, b) => n(b.saleDate) - n(a.saleDate));
  const products = activeProducts(snapshot);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lastDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today.getTime() - (6 - i) * 86400000);
    const total = sales.filter((r) => new Date(n(r.saleDate)).toDateString() === day.toDateString()).reduce((sum, r) => sum + n(r.totalAmount), 0);
    return { label: day.toLocaleDateString(undefined, { weekday: "short" }), total };
  });
  const maxDay = Math.max(1, ...lastDays.map((day) => day.total));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const monthSales = sales.filter((sale) => n(sale.saleDate ?? sale.sale_date) >= monthStart);
  const monthRevenue = monthSales.reduce((sum, sale) => sum + n(sale.totalAmount ?? sale.total_amount ?? sale.total), 0);
  const monthProfit = monthSales.reduce((sum, sale) => sum + n(sale.totalProfit ?? sale.total_profit), 0);
  const activeBranches = rows(cloud.branches).filter((branch) => branch.is_active !== false);
  const branchPerformance = activeBranches.map((branch) => {
    const branchId = s(branch.id);
    const branchSales = monthSales.filter((sale) => s(sale.branchId ?? sale.branch_id) === branchId);
    const revenue = branchSales.reduce((sum, sale) => sum + n(sale.totalAmount ?? sale.total_amount ?? sale.total), 0);
    const target = Math.max(0, n(branch.monthly_target_rwf));
    return {
      id: branchId, name: s(branch.name) || "Unnamed location",
      manager: s(branch.manager_name) || "Manager not assigned",
      revenue, transactions: branchSales.length, target,
      progress: target > 0 ? Math.min(100, revenue / target * 100) : 0,
      status: s(branch.operational_status || "OPEN").toUpperCase()
    };
  }).sort((a, b) => b.revenue - a.revenue);
  const targetTotal = branchPerformance.reduce((sum, branch) => sum + branch.target, 0);
  const targetCoverage = targetTotal > 0 ? monthRevenue / targetTotal * 100 : 0;
  const openTransfers = rows(cloud.transfers).filter((transfer) =>
    ["REQUESTED", "IN_TRANSIT", "RECEIPT_REQUESTED", "CANCEL_REQUESTED"].includes(s(transfer.status).toUpperCase())
  );
  const agedTransfers = openTransfers.filter((transfer) => {
    const createdAt = n(transfer.transfer_date ?? transfer.created_at);
    return createdAt > 0 && Date.now() - createdAt > 24 * 60 * 60 * 1000;
  });
  const activeDevices = rows(cloud.devices).filter((device) => device.is_active !== false);
  const bestProducts = rows(snapshot?.saleItems).reduce((map, item) => {
    const key = s(item.productName) || "Product";
    map.set(key, (map.get(key) || 0) + n(item.quantitySold));
    return map;
  }, new Map<string, number>());
  const top = [...bestProducts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return <div className="page-stack">
    <PageHeading eyebrow="SHOP PERFORMANCE" title={"Good " + (new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening") + ", " + (s(cloud.shop.owner_name).split(" ")[0] || "Owner")} description={offline ? "Showing protected local business data. New changes will upload when the connection returns." : cloud.verifiedChunks > 0 ? "Showing the latest signed cloud snapshot. The local sync queue reports any changes still awaiting upload." : "Showing the local workspace. The first signed cloud snapshot is not yet verified."} action={<button className="btn-primary" onClick={() => onNavigate("checkout")}><ShoppingCart size={17} /> New sale</button>} />

    <section className="command-hero">
      <div className="command-hero-copy">
        <span className={"hero-live" + (offline ? " offline" : cloud.verifiedChunks > 0 ? "" : " pending")}><i /> {offline ? "LOCAL WORKSPACE · OFFLINE QUEUE" : cloud.verifiedChunks > 0 ? "VERIFIED CLOUD SNAPSHOT" : "CLOUD SYNC NOT VERIFIED"}</span>
        <h2>Every sale. Every branch.<em>One clear view.</em></h2>
        <p>{offline
          ? "This terminal is in offline-first mode. New sales and stock changes are protected in the encrypted local database and queued for upload when the connection returns."
          : cloud.verifiedChunks > 0
            ? "This workspace has a verified signed cloud snapshot. New changes are recorded locally first and synchronized through the protected sync queue."
            : "The local workspace is ready, but no verified cloud snapshot is available yet. Complete owner pairing and the first successful sync to connect your phone and desktop."}</p>
        <div className="hero-facts"><span><strong>{products.length.toLocaleString()}</strong> active products</span><span><strong>{rows(cloud.devices).filter((device) => device.is_active).length}</strong> active terminals</span><span><strong>{rows(cloud.branches).filter((branch) => branch.is_active).length}</strong> active branches</span></div>
        {onOpenCommand && <button className="hero-command" onClick={onOpenCommand}><Search size={15} /><span>Quick command</span><kbd>Ctrl K</kbd></button>}
      </div>
      <div className="hero-scene" aria-hidden="true">
        <div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" />
        <div className="hero-glass-card hero-glass-main">
          <div className="hero-glass-brand"><img src="/beboss-app-icon.png" alt="" /><span><strong>BeBoss Workspace</strong><small>RETAIL OPERATIONS</small></span><i className={offline ? "offline" : cloud.verifiedChunks > 0 ? "verified" : "pending"} /></div>
          <div className="hero-glass-divider" />
          <span className="hero-glass-label">TODAY'S REVENUE</span><strong className="hero-glass-value">{money(revenueToday)}</strong>
          <div className="hero-glass-foot"><span><ShieldCheck size={13} /> {cloud.verifiedChunks > 0 ? "Last snapshot verified" : "No verified snapshot"}</span><span>{cloud.verifiedChunks} chunks</span></div>
        </div>
        <div className="hero-glass-card hero-glass-float"><span className="hero-float-icon"><Activity size={16} /></span><span><strong>{offline ? "Local-first mode" : cloud.verifiedChunks > 0 ? "Verified cloud data" : "Cloud sync pending"}</strong><small>{offline ? "Changes wait in encrypted queue" : cloud.snapshotUpdatedAt ? "Last snapshot " + new Date(cloud.snapshotUpdatedAt).toLocaleString() : "No cloud snapshot available"}</small></span><b>{offline ? "OFFLINE" : cloud.verifiedChunks > 0 ? "VERIFIED" : "PENDING"}</b></div>
        <div className="hero-orbit-dot" />
      </div>
    </section>
    <div className="stat-grid four">
      <StatCard label="Today's revenue" value={money(revenueToday)} sub="Gross sales collected today" icon={Wallet} tone="blue" />
      <StatCard label="Today's gross profit" value={money(profitToday)} sub="Based on item cost at sale" icon={ArrowUpRight} tone="green" />
      <StatCard label="Inventory cost value" value={money(stockCost)} sub={products.length + " active products"} icon={Boxes} tone="purple" />
      <StatCard label="Customer receivables" value={money(receivables)} sub="Outstanding shop credit" icon={CreditCard} tone="orange" />
    </div>
    <section className="panel span-2 executive-network-panel">
      <div className="panel-heading">
        <div><span className="eyebrow muted">EXECUTIVE OPERATIONS · MONTH TO DATE</span><h3>Branch and stock-location performance</h3>
          <p className="panel-hint">Live figures are derived from the latest available shop snapshot and branch registry.</p>
        </div>
        <button className="btn-outline small" onClick={() => onNavigate("branches")}><Building2 size={14} /> Manage locations <ArrowRight size={14} /></button>
      </div>
      <div className="executive-network-kpis">
        <article><span>Network revenue</span><strong>{money(monthRevenue)}</strong><small>{monthSales.length.toLocaleString()} transactions this month</small></article>
        <article><span>Gross profit</span><strong>{money(monthProfit)}</strong><small>Recorded sale-cost basis</small></article>
        <article><span>Target coverage</span><strong>{targetTotal > 0 ? Math.round(targetCoverage) + "%" : "Not set"}</strong><small>{targetTotal > 0 ? money(targetTotal) + " combined branch target" : "Set monthly targets for comparison"}</small></article>
        <article className={agedTransfers.length ? "attention" : ""}><span>Open stock movements</span><strong>{openTransfers.length.toLocaleString()}</strong><small>{agedTransfers.length} waiting longer than 24 hours</small></article>
      </div>
      <div className="executive-branch-list">
        {branchPerformance.length ? branchPerformance.slice(0, 6).map((branch, index) => <div className="executive-branch-row" key={branch.id || branch.name}>
          <span className="executive-branch-rank">{index + 1}</span>
          <div className="executive-branch-identity"><strong>{branch.name}</strong><small>{branch.manager} · {branch.status.replaceAll("_", " ")}</small></div>
          <div className="executive-branch-progress"><div><span>{branch.target > 0 ? Math.round(branch.progress) + "% of target" : "No target set"}</span><strong>{money(branch.revenue)}</strong></div>
            <div className="executive-branch-track"><i style={{ width: branch.progress + "%" }} /></div></div>
          <span className="executive-branch-transactions">{branch.transactions} sales</span>
        </div>) : <Empty title="No active locations available" description="Create or synchronize a branch to see location-level performance." icon={Building2} />}
      </div>
      {openTransfers.length > 0 && <div className="executive-network-foot"><Truck size={15} /><span>{agedTransfers.length ? agedTransfers.length + " transfer(s) need attention after 24 hours." : "Stock movements are being processed across the network."}</span><button className="text-btn" onClick={() => onNavigate("transfers")}>Review transfers</button></div>}
      <div className="executive-network-meta"><span><ShieldCheck size={13} /> {offline ? "Protected local snapshot · changes queued for cloud" : cloud.verifiedChunks > 0 ? "Verified cloud snapshot" : "Cloud snapshot not yet verified"}</span><span>{activeBranches.length} active locations · {activeDevices.length} active devices</span></div>
    </section>
    <div className="dashboard-grid">
      <section className="panel span-2">
        <div className="panel-heading"><div><span className="eyebrow muted">SALES TREND</span><h3>Last seven days</h3></div><button className="btn-outline small" onClick={() => onNavigate("reports")}>Full report <ArrowUpRight size={14} /></button></div>
        <div className="bar-chart">
          {lastDays.map((day) => <div className="bar-column" key={day.label}><strong>{day.total ? money(day.total) : "—"}</strong><div className="bar-track"><span style={{ height: Math.max(3, day.total / maxDay * 100) + "%" }} /></div><small>{day.label}</small></div>)}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">INVENTORY ALERTS</span><h3>Stock health</h3></div><span className="alert-count">{lowStock}</span></div>
        <div className="health-row"><span className="health-dot danger" /><div><strong>{lowStock} low-stock items</strong><small>At or below reorder threshold</small></div><button className="text-btn" onClick={() => onNavigate("products")}>Review</button></div>
        <div className="health-row"><span className="health-dot good" /><div><strong>{products.length - lowStock} healthy items</strong><small>Above reorder threshold</small></div></div>
        <div className="health-foot"><span>Active terminals</span><strong>{rows(cloud.devices).filter((d) => d.is_active).length}</strong></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">TOP MOVERS</span><h3>Best-selling products</h3></div><Tags size={18} className="muted-icon" /></div>
        {top.length ? <div className="rank-list">{top.map(([name, quantity], i) => <div className="rank-row" key={name}><span className="rank-num">{i + 1}</span><span className="rank-name">{name}</span><strong>{quantity.toLocaleString()} units</strong></div>)}</div> : <Empty title="No product movement yet" description="Completed sales will build your product ranking." />}
      </section>
      <section className="panel span-2">
        <div className="panel-heading"><div><span className="eyebrow muted">RECENT ACTIVITY</span><h3>Latest sales</h3></div><button className="btn-outline small" onClick={() => onNavigate("sales")}>View ledger <ArrowUpRight size={14} /></button></div>
        <SalesTable sales={sales.slice(0, 6)} />
      </section>
    </div>
  </div>;
}