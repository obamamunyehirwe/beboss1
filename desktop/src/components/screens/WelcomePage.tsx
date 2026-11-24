import { Activity, ArrowRight, ArrowUpRight, BarChart3, Building2, CreditCard, Package, RefreshCw, ShieldCheck, ShoppingCart, Smartphone, Truck, Users, Wallet, Zap } from "lucide-react";
import { money, n, rows, s } from "../../lib/format";
import type { CloudState, NavKey, Row, Snapshot } from "../../lib/types";
import { PageHeading, SalesTable, StatCard, StatusPill } from "../ui";

export function WelcomePage({ cloud, snapshot, offline, revenueToday, profitToday, lowStock, onNavigate, onReceipt }: {
  cloud: CloudState; snapshot: Snapshot | null; offline: boolean; revenueToday: number; profitToday: number;
  lowStock: number; onNavigate: (view: NavKey) => void; onReceipt: (sale: Row) => void
}) {
  const ownerName = s(cloud.owner?.owner_name) || s(cloud.shop.owner_name) || s(snapshot?.shopProfile?.name);
  const firstName = ownerName.trim().split(/\s+/)[0] || s(cloud.owner?.username) || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const products = rows(snapshot?.products).filter((item) => item.isDeleted !== true);
  const customers = rows(snapshot?.customers).filter((item) => item.isDeleted !== true);
  const sales = rows(snapshot?.sales).sort((a, b) => n(b.saleDate) - n(a.saleDate));
  const activeBranches = rows(cloud.branches).filter((item) => item.is_active === true);
  const activeDevices = rows(cloud.devices).filter((item) => item.is_active === true);
  const pendingTransfers = rows(cloud.transfers).filter((item) => ["REQUESTED", "IN_TRANSIT", "RECEIPT_REQUESTED"].includes(s(item.status).toUpperCase()));
  const receivables = customers.reduce((sum, item) => sum + n(item.debtBalance), 0);
  const shortcuts: { title: string; description: string; view: NavKey; icon: typeof ShoppingCart; tone: string }[] = [
    { title: "Start a sale", description: "Open checkout and issue a receipt", view: "checkout", icon: ShoppingCart, tone: "orange" },
    { title: "Manage inventory", description: "Products, stock adjustments and reorder levels", view: "products", icon: Package, tone: "blue" },
    { title: "Review performance", description: "Revenue, margin and sales reports", view: "reports", icon: BarChart3, tone: "green" },
    { title: "Manage your team", description: "Staff roles, assignments and access status", view: "staff", icon: Users, tone: "purple" },
    { title: "Manage branches", description: "Locations and operating targets", view: "branches", icon: Building2, tone: "blue" },
    { title: "Subscription & payments", description: "Plan status, payment claims and renewals", view: "billing", icon: CreditCard, tone: "orange" }
  ];
  return <div className="page-stack">
    <PageHeading eyebrow="YOUR RETAIL WORKSPACE" title={greeting + ", " + firstName} description="Your business workspace is ready. Review today's performance or jump straight into an operation." action={<button className="btn-primary" onClick={() => onNavigate("checkout")}><ShoppingCart size={16} /> New sale</button>} />
    <section className="welcome-hero">
      <div className="welcome-hero-copy">
        <span className={"welcome-live " + (offline ? "offline" : cloud.verifiedChunks > 0 ? "verified" : "pending")}><i />{offline ? "OFFLINE · LOCAL DATA" : cloud.verifiedChunks > 0 ? "CLOUD SNAPSHOT VERIFIED" : "CLOUD VERIFICATION PENDING"}</span>
        <h2>Welcome to <em>{s(cloud.shop.shop_name) || "your BeBoss shop"}</em></h2>
        <p>One workspace for point of sale, inventory, people, branches, finance and secure cross-device operations.</p>
        <div className="welcome-hero-actions"><button className="btn-primary" onClick={() => onNavigate("overview")}><BarChart3 size={16} /> Business overview</button><button className="btn-outline" onClick={() => onNavigate("management")}><Activity size={16} /> Management center</button></div>
      </div>
      <div className="welcome-hero-status">
        <div className="welcome-status-brand"><img src="/beboss-app-icon.png" alt="" /><span><strong>BeBoss Desktop</strong><small>RETAIL OPERATIONS</small></span></div>
        <div className="welcome-status-row"><span><ShieldCheck size={15} /> Signed snapshot</span><StatusPill value={cloud.verifiedChunks > 0 ? "VERIFIED" : "PENDING"} /></div>
        <div className="welcome-status-row"><span><RefreshCw size={15} /> Sync mode</span><strong>{offline ? "Offline queue" : "Connected"}</strong></div>
        <div className="welcome-status-row"><span><Building2 size={15} /> Active branches</span><strong>{activeBranches.length}</strong></div>
        <div className="welcome-status-row"><span><Smartphone size={15} /> Active terminals</span><strong>{activeDevices.length}</strong></div>
        <small className="welcome-snapshot-time">{cloud.snapshotUpdatedAt ? "Last snapshot " + new Date(cloud.snapshotUpdatedAt).toLocaleString() : "No cloud snapshot timestamp yet"}</small>
      </div>
    </section>
    <div className="stat-grid four">
      <StatCard label="Today's revenue" value={money(revenueToday)} sub="From recorded sales today" icon={Wallet} tone="blue" />
      <StatCard label="Today's gross profit" value={money(profitToday)} sub="Saved sale cost basis" icon={ArrowUpRight} tone="green" />
      <StatCard label="Active products" value={products.length.toLocaleString()} sub={lowStock + " at or below reorder level"} icon={Package} tone="orange" />
      <StatCard label="Customer accounts" value={customers.length.toLocaleString()} sub={money(receivables) + " outstanding credit"} icon={Users} tone="purple" />
    </div>
    <section className="welcome-section">
      <div className="section-title-row"><div><span className="eyebrow muted">QUICK ACCESS</span><h3>Continue with your work</h3></div><button className="text-action" onClick={() => onNavigate("management")}>All management areas <ArrowRight size={14} /></button></div>
      <div className="welcome-shortcut-grid">{shortcuts.map((item) => { const Icon = item.icon; return <button className="welcome-shortcut" key={item.view} onClick={() => onNavigate(item.view)}>
        <span className={"welcome-shortcut-icon " + item.tone}><Icon size={19} /></span><span className="welcome-shortcut-copy"><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRight size={15} className="welcome-shortcut-arrow" />
      </button>; })}</div>
    </section>
    <div className="welcome-bottom-grid">
      <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">LATEST ACTIVITY</span><h3>Recent sales</h3></div><button className="text-action" onClick={() => onNavigate("sales")}>Open ledger <ArrowRight size={14} /></button></div><SalesTable sales={sales.slice(0, 5)} onReceipt={onReceipt} /></section>
      <section className="panel welcome-attention">
        <div className="panel-heading"><div><span className="eyebrow muted">OPERATIONS PULSE</span><h3>Items needing attention</h3></div><Zap size={18} className="muted-icon" /></div>
        <button className="welcome-pulse-row" onClick={() => onNavigate("products")}><span className="welcome-pulse-icon warning"><Package size={16} /></span><span><strong>Low-stock products</strong><small>At or below configured threshold</small></span><b>{lowStock}</b></button>
        <button className="welcome-pulse-row" onClick={() => onNavigate("transfers")}><span className="welcome-pulse-icon info"><Truck size={16} /></span><span><strong>Open stock transfers</strong><small>Awaiting receipt or completion</small></span><b>{pendingTransfers.length}</b></button>
        <button className="welcome-pulse-row" onClick={() => onNavigate("billing")}><span className="welcome-pulse-icon success"><CreditCard size={16} /></span><span><strong>Subscription status</strong><small>Managed by verified billing records</small></span><StatusPill value={s(cloud.shop.subscription_status) || "UNKNOWN"} /></button>
        <button className="welcome-pulse-row" onClick={() => onNavigate("sync")}><span className="welcome-pulse-icon info"><RefreshCw size={16} /></span><span><strong>Cloud synchronization</strong><small>{offline ? "Local transactions are waiting to upload" : "Open sync and integrity diagnostics"}</small></span><b>{offline ? "OFFLINE" : cloud.verifiedChunks > 0 ? "OK" : "CHECK"}</b></button>
      </section>
    </div>
  </div>;
}
