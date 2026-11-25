import { useMemo, useState } from "react";
import { Activity, ArrowUpRight, Boxes, CreditCard, Search, ShieldCheck, ShoppingCart, Tags, TrendingUp, Users, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activeCustomers, activeProducts, money, n, rows, s } from "../../lib/format";
import type { CloudState, NavKey, Snapshot } from "../../lib/types";
import { Empty, PageHeading, SalesTable, StatCard } from "../ui";

export function OverviewPage({ cloud, snapshot, offline, revenueToday, profitToday, stockCost, receivables, lowStock, onNavigate, onOpenCommand }: {
  cloud: CloudState; snapshot: Snapshot | null; offline: boolean; revenueToday: number; profitToday: number;
  stockCost: number; receivables: number; lowStock: number; onNavigate: (view: NavKey) => void; onOpenCommand?: () => void
}) {
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(7);
  const sales = rows(snapshot?.sales).sort((a, b) => n(b.saleDate) - n(a.saleDate));
  const products = activeProducts(snapshot);
  const debtors = activeCustomers(snapshot)
    .filter((c) => n(c.debtBalance) > 0)
    .sort((a, b) => n(b.debtBalance) - n(a.debtBalance));

  const trendData = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: rangeDays }, (_, i) => {
      const day = new Date(today.getTime() - (rangeDays - 1 - i) * 86400000);
      const key = day.toDateString();
      const daySales = sales.filter((r) => new Date(n(r.saleDate)).toDateString() === key);
      const revenue = daySales.reduce((sum, r) => sum + n(r.totalAmount), 0);
      const profit = daySales.reduce((sum, r) => sum + n(r.totalProfit), 0);
      const label = rangeDays <= 7
        ? day.toLocaleDateString(undefined, { weekday: "short" })
        : day.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return { label, revenue, profit };
    });
  }, [sales, rangeDays]);

  const paymentMix = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const sale of sales) {
      const method = s(sale.paymentMethod) || "Cash";
      const amt = n(sale.totalAmount);
      map.set(method, (map.get(method) || 0) + amt);
      total += amt;
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([method, amount]) => ({ method, amount, pct: total > 0 ? Math.round((amount / total) * 100) : 0 }));
  }, [sales]);

  const bestProducts = rows(snapshot?.saleItems).reduce((map, item) => {
    const key = s(item.productName) || "Product";
    map.set(key, (map.get(key) || 0) + n(item.quantitySold));
    return map;
  }, new Map<string, number>());
  const top = [...bestProducts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return <div className="page-stack">
    <PageHeading eyebrow="SHOP PERFORMANCE" title={"Good " + (new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening") + ", " + (s(cloud.shop.owner_name).split(" ")[0] || "Owner")} description={offline ? "Showing protected local business data. New changes will upload when the connection returns." : cloud.verifiedChunks > 0 ? "Showing the latest signed cloud snapshot. The local sync queue reports any changes still awaiting upload." : "Showing the local workspace. The first signed cloud snapshot is not yet verified."} action={<div className="heading-actions"><button className="btn-outline" onClick={() => onNavigate("customers")}><Wallet size={16} /> Debit desk</button><button className="btn-primary" onClick={() => onNavigate("checkout")}><ShoppingCart size={17} /> New sale</button></div>} />

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
        <div className="hero-quick-actions">
          {onOpenCommand && <button className="hero-command" onClick={onOpenCommand}><Search size={15} /><span>Quick command</span><kbd>Ctrl K</kbd></button>}
          <button className="hero-pill-btn" onClick={() => onNavigate("customers")}><Users size={14} /> {debtors.length} debtors</button>
          <button className="hero-pill-btn" onClick={() => onNavigate("reports")}><TrendingUp size={14} /> Analytics</button>
        </div>
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
    <div className="dashboard-grid">
      <section className="panel span-2">
        <div className="panel-heading">
          <div><span className="eyebrow muted">REVENUE &amp; PROFIT TELEMETRY</span><h3>Sales performance ({rangeDays}d)</h3></div>
          <div className="heading-actions">
            <div className="filter-tabs compact">
              {([7, 14, 30] as const).map((days) => (
                <button key={days} className={rangeDays === days ? "active" : ""} onClick={() => setRangeDays(days)}>{days}D</button>
              ))}
            </div>
            <button className="btn-outline small" onClick={() => onNavigate("reports")}>Full report <ArrowUpRight size={14} /></button>
          </div>
        </div>
        <div className="analytics-chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="overviewRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="overviewProf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--green)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={54} tickFormatter={(v: number) => v >= 1000 ? Math.round(v / 1000) + "k" : String(v)} />
              <Tooltip formatter={(val: number, name: string) => [money(val), name === "revenue" ? "Revenue" : "Gross profit"]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2.5} fill="url(#overviewRev)" />
              <Area type="monotone" dataKey="profit" stroke="var(--green)" strokeWidth={2} fill="url(#overviewProf)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="analytics-legend">
          <span><i className="dot-rev" /> Revenue</span>
          <span><i className="dot-prof" /> Gross profit</span>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">INVENTORY ALERTS</span><h3>Stock health</h3></div><span className="alert-count">{lowStock}</span></div>
        <div className="health-row"><span className="health-dot danger" /><div><strong>{lowStock} low-stock items</strong><small>At or below reorder threshold</small></div><button className="text-btn" onClick={() => onNavigate("products")}>Review</button></div>
        <div className="health-row"><span className="health-dot good" /><div><strong>{products.length - lowStock} healthy items</strong><small>Above reorder threshold</small></div></div>
        <div className="health-row"><span className="health-dot warn" /><div><strong>{debtors.length} open debit accounts</strong><small>{money(receivables)} outstanding</small></div><button className="text-btn" onClick={() => onNavigate("customers")}>Collect</button></div>
        <div className="health-foot"><span>Active terminals</span><strong>{rows(cloud.devices).filter((d) => d.is_active).length}</strong></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">PAYMENT MIX</span><h3>Tender channels</h3></div><CreditCard size={18} className="muted-icon" /></div>
        {paymentMix.length ? <div className="mix-list">
          {paymentMix.map((item) => (
            <div className="mix-row" key={item.method}>
              <div className="mix-head"><strong>{item.method}</strong><span>{money(item.amount)} · <b>{item.pct}%</b></span></div>
              <div className="mix-bar"><span style={{ width: Math.max(4, item.pct) + "%" }} /></div>
            </div>
          ))}
        </div> : <Empty title="No payment history" description="Completed sales will summarize Cash, MoMo, Bank, and Credit share." />}
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">TOP MOVERS</span><h3>Best-selling products</h3></div><Tags size={18} className="muted-icon" /></div>
        {top.length ? <div className="rank-list">{top.map(([name, quantity], i) => <div className="rank-row" key={name}><span className="rank-num">{i + 1}</span><span className="rank-name">{name}</span><strong>{quantity.toLocaleString()} units</strong></div>)}</div> : <Empty title="No product movement yet" description="Completed sales will build your product ranking." />}
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">DEBIT WATCHLIST</span><h3>Top receivables</h3></div><button className="text-btn" onClick={() => onNavigate("customers")}>Open desk</button></div>
        {debtors.length ? <div className="rank-list">{debtors.slice(0, 5).map((c, i) => <div className="rank-row" key={s(c.id)}><span className="rank-num">{i + 1}</span><span className="rank-name">{s(c.name)}</span><strong>{money(c.debtBalance)}</strong></div>)}</div> : <Empty title="All accounts settled" description="No customer currently carries an unpaid balance." />}
      </section>
      <section className="panel span-2">
        <div className="panel-heading"><div><span className="eyebrow muted">RECENT ACTIVITY</span><h3>Latest sales</h3></div><button className="btn-outline small" onClick={() => onNavigate("sales")}>View ledger <ArrowUpRight size={14} /></button></div>
        <SalesTable sales={sales.slice(0, 6)} />
      </section>
    </div>
  </div>;
}