import { Activity, ArrowRight, ArrowUpRight, Boxes, CreditCard, Search, ShieldCheck, ShoppingCart, Tags, Wallet } from "lucide-react";
import { activeProducts, money, n, rows, s } from "../../lib/format";
import type { CloudState, NavKey, Snapshot } from "../../lib/types";
import { Empty, PageHeading, SalesTable, StatCard } from "../ui";

export function OverviewPage({ cloud, snapshot, revenueToday, profitToday, stockCost, receivables, lowStock, onNavigate, onOpenCommand }: {
  cloud: CloudState; snapshot: Snapshot | null; revenueToday: number; profitToday: number;
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
  const bestProducts = rows(snapshot?.saleItems).reduce((map, item) => {
    const key = s(item.productName) || "Product";
    map.set(key, (map.get(key) || 0) + n(item.quantitySold));
    return map;
  }, new Map<string, number>());
  const top = [...bestProducts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return <div className="page-stack">
    <PageHeading eyebrow="SHOP PERFORMANCE" title={"Good " + (new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening") + ", " + (s(cloud.shop.owner_name).split(" ")[0] || "Owner")} description="Your business at a glance. These figures come from the latest verified shop snapshot." action={<button className="btn-primary" onClick={() => onNavigate("checkout")}><ShoppingCart size={17} /> New sale</button>} />

    <section className="command-hero">
      <div className="command-hero-copy">
        <span className="hero-live"><i /> VERIFIED CLOUD WORKSPACE</span>
        <h2>Every sale. Every branch.<em>One clear view.</em></h2>
        <p>Your desktop and registered phone work from the same verified BeBoss business records. Changes are saved to the shared cloud snapshot.</p>
        <div className="hero-facts"><span><strong>{products.length.toLocaleString()}</strong> active products</span><span><strong>{rows(cloud.devices).filter((device) => device.is_active).length}</strong> active terminals</span><span><strong>{rows(cloud.branches).filter((branch) => branch.is_active).length}</strong> active branches</span></div>
        {onOpenCommand && <button className="hero-command" onClick={onOpenCommand}><Search size={15} /><span>Quick command</span><kbd>Ctrl K</kbd></button>}
      </div>
      <div className="hero-scene" aria-hidden="true">
        <div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" />
        <div className="hero-glass-card hero-glass-main">
          <div className="hero-glass-brand"><img src="/beboss-app-icon.png" alt="" /><span><strong>BeBoss Cloud</strong><small>RETAIL OPERATIONS</small></span><i /></div>
          <div className="hero-glass-divider" />
          <span className="hero-glass-label">TODAY'S REVENUE</span><strong className="hero-glass-value">{money(revenueToday)}</strong>
          <div className="hero-glass-foot"><span><ShieldCheck size={13} /> Snapshot verified</span><span>{cloud.verifiedChunks} chunks</span></div>
        </div>
        <div className="hero-glass-card hero-glass-float"><span className="hero-float-icon"><Activity size={16} /></span><span><strong>Live business data</strong><small>Phone ↔ Desktop</small></span><b>SYNCED</b></div>
        <div className="hero-orbit-dot" />
      </div>
    </section>
    <div className="stat-grid four">
      <StatCard label="Today's revenue" value={money(revenueToday)} sub="Gross sales collected today" icon={Wallet} tone="blue" />
      <StatCard label="Today's gross profit" value={money(profitToday)} sub="Based on item cost at sale" icon={ArrowUpRight} tone="green" />
      <StatCard label="Inventory cost value" value={money(stockCost)} sub={products.length + " active products"} icon={Boxes} tone="purple" />
      <StatCard label="Customer receivables" value={money(receivables)} sub="Outstanding shop credit" icon={CreditCard} tone="orange" />
    </div>
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