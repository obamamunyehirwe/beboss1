import { useState } from "react";
import { ArrowRight, BarChart3, Building2, CreditCard, Database, Package, RefreshCw, Settings, ShieldCheck, ShoppingBag, Smartphone, Truck, Users, Wallet } from "lucide-react";
import { money, n, rows, s } from "../../lib/format";
import type { CloudState, NavKey, Snapshot } from "../../lib/types";
import { Empty, PageHeading, StatCard, StatusPill } from "../ui";

type ModuleCategory = "ALL" | "COMMERCIAL" | "OPERATIONS" | "SYSTEM";

export function ManagementPage({ cloud, snapshot, offline, onNavigate }: {
  cloud: CloudState; snapshot: Snapshot | null; offline: boolean; onNavigate: (view: NavKey) => void
}) {
  const [category, setCategory] = useState<ModuleCategory>("ALL");
  const products = rows(snapshot?.products).filter((item) => item.isDeleted !== true);
  const lowStock = products.filter((item) => n(item.quantityInStock) <= n(item.lowStockThreshold));
  const customers = rows(snapshot?.customers).filter((item) => item.isDeleted !== true);
  const debtors = customers.filter((item) => n(item.debtBalance) > 0).sort((a, b) => n(b.debtBalance) - n(a.debtBalance));
  const sales = rows(snapshot?.sales);
  const activeBranches = rows(cloud.branches).filter((item) => item.is_active === true);
  const activeStaff = rows(cloud.staff).filter((item) => item.is_active === true);
  const activeDevices = rows(cloud.devices).filter((item) => item.is_active === true);
  const openTransfers = rows(cloud.transfers).filter((item) => ["REQUESTED", "IN_TRANSIT", "RECEIPT_REQUESTED"].includes(s(item.status).toUpperCase()));
  const receivables = customers.reduce((sum, item) => sum + n(item.debtBalance), 0);
  const totalLimits = customers.reduce((sum, item) => sum + n(item.creditLimit), 0);
  const stockHealthPct = products.length ? Math.round(((products.length - lowStock.length) / products.length) * 100) : 100;
  const creditUtilPct = totalLimits > 0 ? Math.min(100, Math.round((receivables / totalLimits) * 100)) : 0;
  const deviceOnlinePct = rows(cloud.devices).length ? Math.round((activeDevices.length / rows(cloud.devices).length) * 100) : 100;

  const modules: { title: string; description: string; view: NavKey; icon: typeof Package; value: string; cat: Exclude<ModuleCategory, "ALL"> }[] = [
    { title: "Inventory control", description: "Catalogue, pricing, quantities, adjustments and reorder levels.", view: "products", icon: Package, value: products.length + " active items", cat: "COMMERCIAL" },
    { title: "Sales operations", description: "Checkout, ledger, receipt reprints and payment reconciliation.", view: "sales", icon: ShoppingBag, value: sales.length + " recorded sales", cat: "COMMERCIAL" },
    { title: "Debit & customer desk", description: "Receivables aging, credit limits, collections and Customer 360.", view: "customers", icon: Users, value: money(receivables) + " receivable", cat: "COMMERCIAL" },
    { title: "Purchasing", description: "Supplier purchases, stock inflow and purchase history.", view: "purchases", icon: Truck, value: rows(snapshot?.purchases).length + " purchases", cat: "COMMERCIAL" },
    { title: "Branch network", description: "Manage active business locations and operating profiles.", view: "branches", icon: Building2, value: activeBranches.length + " active branches", cat: "OPERATIONS" },
    { title: "People & permissions", description: "Review enrolled staff, roles, assignments and account status.", view: "staff", icon: ShieldCheck, value: activeStaff.length + " active staff", cat: "OPERATIONS" },
    { title: "POS devices", description: "Review registered terminals and device invitations.", view: "devices", icon: Smartphone, value: activeDevices.length + " active devices", cat: "OPERATIONS" },
    { title: "Stock transfers", description: "Track inter-branch stock requests and receipts.", view: "transfers", icon: Truck, value: openTransfers.length + " open transfers", cat: "OPERATIONS" },
    { title: "Finance & reports", description: "Revenue, gross profit, margins and operating performance.", view: "reports", icon: BarChart3, value: "Snapshot-derived reports", cat: "SYSTEM" },
    { title: "Billing & subscription", description: "Plan status, hosted checkout and payment claim history.", view: "billing", icon: CreditCard, value: s(cloud.shop.subscription_status) || "Status unavailable", cat: "SYSTEM" },
    { title: "Sync & connectivity", description: "Cloud snapshot, pending outbox and synchronization health.", view: "sync", icon: RefreshCw, value: offline ? "Offline queue active" : cloud.verifiedChunks + " verified chunks", cat: "SYSTEM" },
    { title: "Backup & recovery", description: "Encrypted local backups and signed branch exchange.", view: "backup", icon: Database, value: "Encrypted local storage", cat: "SYSTEM" }
  ];
  const visibleModules = category === "ALL" ? modules : modules.filter((m) => m.cat === category);

  return <div className="page-stack">
    <PageHeading eyebrow="OPERATIONS CONTROL CENTER" title="Management center" description="A live operating view across inventory, financial activity, organization, devices and platform services." action={<button className="btn-outline" onClick={() => onNavigate("settings")}><Settings size={16} /> Workspace settings</button>} />
    <section className="management-hero"><div><span className="eyebrow">BUSINESS MANAGEMENT</span><h2>{s(cloud.shop.shop_name) || "BeBoss shop"}<em> · Control center</em></h2><p>Management data is read from the authenticated shop snapshot and verified cloud management records. Changes open their dedicated workflows.</p></div><div className="management-hero-status"><span className={offline ? "is-offline" : "is-online"} /><strong>{offline ? "Offline-first mode" : "Cloud connected"}</strong><small>{cloud.snapshotUpdatedAt ? "Snapshot " + new Date(cloud.snapshotUpdatedAt).toLocaleString() : "No cloud snapshot timestamp"}</small><StatusPill value={cloud.verifiedChunks > 0 ? "VERIFIED" : "PENDING"} /></div></section>
    <div className="stat-grid four">
      <StatCard label="Products requiring review" value={lowStock.length.toLocaleString()} sub="At or below reorder threshold" icon={Package} tone="orange" />
      <StatCard label="Outstanding customer debit" value={money(receivables)} sub={debtors.length + " open of " + customers.length + " accounts"} icon={Wallet} tone="blue" />
      <StatCard label="Organization footprint" value={activeBranches.length + " / " + activeStaff.length} sub="Active branches / staff" icon={Building2} tone="purple" />
      <StatCard label="Registered POS terminals" value={activeDevices.length.toLocaleString()} sub={openTransfers.length + " open stock transfers"} icon={Smartphone} tone="green" />
    </div>
    <div className="mgmt-gauges">
      <div className="mgmt-gauge-card">
        <div className="mgmt-gauge-head"><span>Inventory health</span><strong>{stockHealthPct}%</strong></div>
        <div className="mix-bar"><span style={{ width: stockHealthPct + "%", background: "var(--green)" }} /></div>
        <small>{products.length - lowStock.length} of {products.length} SKUs above reorder threshold</small>
      </div>
      <div className="mgmt-gauge-card">
        <div className="mgmt-gauge-head"><span>Credit portfolio utilization</span><strong>{creditUtilPct}%</strong></div>
        <div className="mix-bar"><span style={{ width: creditUtilPct + "%", background: creditUtilPct > 80 ? "var(--red)" : "var(--accent)" }} /></div>
        <small>{money(receivables)} exposed across {debtors.length} debtor accounts</small>
      </div>
      <div className="mgmt-gauge-card">
        <div className="mgmt-gauge-head"><span>Terminal readiness</span><strong>{deviceOnlinePct}%</strong></div>
        <div className="mix-bar"><span style={{ width: deviceOnlinePct + "%", background: "var(--blue)" }} /></div>
        <small>{activeDevices.length} active terminal{activeDevices.length === 1 ? "" : "s"} connected</small>
      </div>
    </div>
    <section className="management-modules"><div className="section-title-row"><div><span className="eyebrow muted">MANAGEMENT WORKSPACES</span><h3>Operational modules</h3><p>Choose an area to review records or perform an authorized operation.</p></div>
      <div className="filter-tabs">
        {([["ALL", "All (" + modules.length + ")"], ["COMMERCIAL", "Commercial"], ["OPERATIONS", "Operations"], ["SYSTEM", "Finance & System"]] as const).map(([key, label]) => (
          <button key={key} className={category === key ? "active" : ""} onClick={() => setCategory(key)}>{label}</button>
        ))}
      </div>
    </div>
      <div className="management-module-grid">{visibleModules.map((module) => { const Icon = module.icon; return <button className="management-module" key={module.view} onClick={() => onNavigate(module.view)}><span className="management-module-icon"><Icon size={18} /></span><span className="management-module-copy"><strong>{module.title}</strong><small>{module.description}</small><b>{module.value}</b></span><ArrowRight size={15} className="management-module-arrow" /></button>; })}</div>
    </section>
    <div className="management-bottom-grid three">
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">INVENTORY RISK</span><h3>Low-stock watchlist</h3></div><button className="text-action" onClick={() => onNavigate("products")}>Review inventory <ArrowRight size={14} /></button></div>
        {lowStock.length ? <div className="management-watch-list">{lowStock.slice(0, 6).map((item) => <div className="management-watch-row" key={s(item.id)}><span><strong>{s(item.name) || "Unnamed product"}</strong><small>{s(item.sku) || s(item.barcode) || "No SKU recorded"}</small></span><b>{n(item.quantityInStock)} / {n(item.lowStockThreshold)}</b></div>)}</div> : <Empty title="No low-stock alerts" description="No active product currently falls at or below its configured reorder threshold." icon={Package} />}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">DEBIT EXPOSURE</span><h3>Top debtor accounts</h3></div><button className="text-action" onClick={() => onNavigate("customers")}>Debit desk <ArrowRight size={14} /></button></div>
        {debtors.length ? <div className="management-watch-list">{debtors.slice(0, 6).map((c) => <div className="management-watch-row" key={s(c.id)}><span><strong>{s(c.name)}</strong><small>{s(c.phone) || s(c.category) || "Customer"}</small></span><b>{money(c.debtBalance)}</b></div>)}</div> : <Empty title="Zero outstanding debit" description="All customer credit accounts are currently settled." icon={Wallet} />}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">ORGANIZATION STATUS</span><h3>Branches & terminals</h3></div><button className="text-action" onClick={() => onNavigate("branches")}>Manage network <ArrowRight size={14} /></button></div>
        {rows(cloud.branches).length || rows(cloud.devices).length ? <div className="management-watch-list">
          {rows(cloud.branches).slice(0, 3).map((item) => <div className="management-watch-row" key={"branch-" + s(item.id)}><span><strong>{s(item.name) || s(item.branch_name) || "Branch " + s(item.id).slice(0, 8)}</strong><small>Branch</small></span><StatusPill value={item.is_active ? "ACTIVE" : "INACTIVE"} /></div>)}
          {rows(cloud.devices).slice(0, 3).map((item) => <div className="management-watch-row" key={"device-" + s(item.id)}><span><strong>{s(item.device_name) || s(item.name) || "POS terminal"}</strong><small>{s(item.platform) || "Registered device"}</small></span><StatusPill value={item.is_active ? "ACTIVE" : "INACTIVE"} /></div>)}
        </div> : <Empty title="No registered locations or terminals" description="Authorized branch and device records appear here after registration." icon={Building2} />}
      </section>
    </div>
  </div>;
}
