import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Building2, CheckCircle2,
  Clock3, CreditCard, Database, Download, Filter, Package, RefreshCw,
  Search, Settings, ShieldCheck, ShoppingBag, Smartphone, Truck, Users,
  Wallet, WifiOff
} from "lucide-react";
import { downloadCsv, money, n, rows, s } from "../../lib/format";
import type { CloudState, NavKey, Row, Snapshot } from "../../lib/types";
import { Empty, PageHeading, StatCard, StatusPill } from "../ui";
import "./ManagementPage.css";

type ModuleCategory = "ALL" | "INVENTORY" | "FINANCE" | "PEOPLE" | "NETWORK" | "PLATFORM";
type AlertPriority = "HIGH" | "MEDIUM" | "INFO";
type ManagementAlert = {
  id: string;
  title: string;
  detail: string;
  count: number;
  priority: AlertPriority;
  action: NavKey;
  actionLabel: string;
  icon: typeof AlertTriangle;
};

export function ManagementPage({ cloud, snapshot, offline, onNavigate, onAnnouncementAction, language }: {
  cloud: CloudState; snapshot: Snapshot | null; offline: boolean; onNavigate: (view: NavKey) => void; onAnnouncementAction?: (urlValue: string) => Promise<void>; language: string
}) {
  const [moduleQuery, setModuleQuery] = useState("");
  const [moduleCategory, setModuleCategory] = useState<ModuleCategory>("ALL");
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const products = rows(snapshot?.products).filter((item) => item.isDeleted !== true);
  const lowStock = products.filter((item) => n(item.quantityInStock) <= n(item.lowStockThreshold));
  const customers = rows(snapshot?.customers).filter((item) => item.isDeleted !== true);
  const sales = rows(snapshot?.sales);
  const branches = rows(cloud.branches);
  const staff = rows(cloud.staff);
  const devices = rows(cloud.devices);
  const activeBranches = branches.filter((item) => item.is_active === true);
  const activeStaff = staff.filter((item) => item.is_active === true);
  const activeDevices = devices.filter((item) => item.is_active === true);
  const openTransfers = rows(cloud.transfers).filter((item) => ["REQUESTED", "IN_TRANSIT", "RECEIPT_REQUESTED"].includes(s(item.status).toUpperCase()));
  const pendingDevices = activeDevices.filter((item) => !s(item.device_id));
  const unassignedBranches = activeBranches.filter((item) => !s(item.manager_user_id) && !s(item.manager_name));
  const receivables = customers.reduce((sum, item) => sum + n(item.debtBalance), 0);
  const creditWatch = customers.filter((item) => n(item.debtBalance) > 0).sort((a, b) => n(b.debtBalance) - n(a.debtBalance)).slice(0, 6);
  const activeAdditionalDevices = activeDevices.filter((device) => device.is_owner_primary !== true);
  const monthlyAddon = activeAdditionalDevices.reduce((total, device) => total + Math.max(0, n(device.monthly_fee_addon_rwf)), 0);

  const branchPerformance = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const totals = new Map<string, { count: number; total: number }>();
    for (const sale of rows(snapshot?.sales)) {
      const soldAt = n(sale.saleDate ?? sale.sale_date);
      if (!soldAt || soldAt < monthStart.getTime()) continue;
      const branchId = s(sale.branchId ?? sale.branch_id);
      if (!branchId) continue;
      const current = totals.get(branchId) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += n(sale.totalAmount ?? sale.total_amount ?? sale.total);
      totals.set(branchId, current);
    }
    return rows(cloud.branches).map((branch) => {
      const id = s(branch.id);
      const metric = totals.get(id) ?? { count: 0, total: 0 };
      const target = n(branch.monthly_target_rwf);
      return {
        ...branch,
        branchId: id,
        branchName: s(branch.name) || "Unnamed branch",
        status: branch.is_active === false ? "INACTIVE" : s(branch.operational_status || "OPEN").toUpperCase(),
        monthlySales: metric.total,
        transactionCount: metric.count,
        target,
        targetProgress: target > 0 ? Math.min(100, metric.total / target * 100) : 0
      };
    }).sort((a, b) => b.monthlySales - a.monthlySales);
  }, [cloud.branches, snapshot?.sales]);

  const alerts: ManagementAlert[] = [
    ...(lowStock.length ? [{
      id: "stock", title: "Inventory needs replenishment",
      detail: lowStock.length + " products are at or below their configured reorder threshold.",
      count: lowStock.length, priority: "HIGH" as const, action: "products" as NavKey,
      actionLabel: "Review stock", icon: Package
    }] : []),
    ...(offline ? [{
      id: "offline", title: "Workspace is operating offline",
      detail: "Cloud actions may be unavailable. Review the encrypted sync queue before closing the app.",
      count: 1, priority: "HIGH" as const, action: "sync" as NavKey,
      actionLabel: "Open sync hub", icon: WifiOff
    }] : []),
    ...(openTransfers.length ? [{
      id: "transfers", title: "Stock transfers require follow-up",
      detail: "Requests, in-transit movements or receipts are still open across the branch network.",
      count: openTransfers.length, priority: "MEDIUM" as const, action: "transfers" as NavKey,
      actionLabel: "Review transfers", icon: Truck
    }] : []),
    ...(pendingDevices.length ? [{
      id: "devices", title: "Devices are awaiting first pairing",
      detail: "Active invitations have not yet been redeemed by a terminal.",
      count: pendingDevices.length, priority: "MEDIUM" as const, action: "devices" as NavKey,
      actionLabel: "Manage devices", icon: Smartphone
    }] : []),
    ...(receivables > 0 ? [{
      id: "credit", title: "Customer balances are outstanding",
      detail: "Review credit accounts and follow up on collections before extending more credit.",
      count: customers.filter((item) => n(item.debtBalance) > 0).length, priority: "MEDIUM" as const,
      action: "customers" as NavKey, actionLabel: "Open accounts", icon: Wallet
    }] : []),
    ...(unassignedBranches.length ? [{
      id: "branch-managers", title: "Branches need a manager assignment",
      detail: "Assign an accountable manager to each active location.",
      count: unassignedBranches.length, priority: "INFO" as const, action: "branches" as NavKey,
      actionLabel: "Assign managers", icon: Building2
    }] : []),
    ...(!cloud.verifiedChunks ? [{
      id: "snapshot", title: "No verified cloud snapshot recorded",
      detail: "Refresh the workspace after a terminal has completed its first successful cloud sync.",
      count: 1, priority: "INFO" as const, action: "sync" as NavKey,
      actionLabel: "Check synchronization", icon: RefreshCw
    }] : [])
  ];
  const priorityOrder: Record<AlertPriority, number> = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  const sortedAlerts = [...alerts].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  const attentionCount = alerts.filter((item) => item.priority !== "INFO").reduce((sum, item) => sum + item.count, 0);

  const modules: { title: string; description: string; view: NavKey; icon: typeof Package; value: string; category: Exclude<ModuleCategory, "ALL"> }[] = [
    { title: "Inventory control", description: "Catalogue, pricing, stock adjustments, reorder levels and product lifecycle.", view: "products", icon: Package, value: products.length + " active items", category: "INVENTORY" },
    { title: "Sales operations", description: "Point of sale, transaction history, receipts and payment reconciliation.", view: "sales", icon: ShoppingBag, value: sales.length + " recorded sales", category: "FINANCE" },
    { title: "Customer accounts", description: "Customer directory, credit exposure, balances and payment history.", view: "customers", icon: Users, value: money(receivables) + " receivable", category: "FINANCE" },
    { title: "Purchasing", description: "Supplier purchases, stock inflow, supplier balances and purchase history.", view: "purchases", icon: Truck, value: rows(snapshot?.purchases).length + " purchases", category: "INVENTORY" },
    { title: "Branch network", description: "Manage locations, branch leaders, operating status and targets.", view: "branches", icon: Building2, value: activeBranches.length + " active branches", category: "NETWORK" },
    { title: "People & permissions", description: "Review staff identities, roles, branch assignments and account status.", view: "staff", icon: ShieldCheck, value: activeStaff.length + " active staff", category: "PEOPLE" },
    { title: "POS devices", description: "Register terminals, manage pairing invitations and control device access.", view: "devices", icon: Smartphone, value: activeDevices.length + " active devices", category: "NETWORK" },
    { title: "Stock transfers", description: "Track inter-branch requests, dispatched stock and receipt confirmation.", view: "transfers", icon: Truck, value: openTransfers.length + " open transfers", category: "INVENTORY" },
    { title: "Finance & reports", description: "Revenue, gross profit, margins, credit exposure and operating performance.", view: "reports", icon: BarChart3, value: "Snapshot-derived reports", category: "FINANCE" },
    { title: "Billing & subscription", description: "Plan status, hosted checkout, payment claims and licensed capacity.", view: "billing", icon: CreditCard, value: s(cloud.shop.subscription_status) || "Status unavailable", category: "PLATFORM" },
    { title: "Sync & connectivity", description: "Cloud snapshot, encrypted outbox, verified chunks and synchronization health.", view: "sync", icon: RefreshCw, value: offline ? "Offline queue active" : cloud.verifiedChunks + " verified chunks", category: "PLATFORM" },
    { title: "Backup & recovery", description: "Encrypted local backups, restore validation and signed branch exchange.", view: "backup", icon: Database, value: "Encrypted local storage", category: "PLATFORM" },
    { title: "System health & diagnostics", description: "Inspect native runtime, SQLCipher integrity, network and printer health.", view: "diagnostics", icon: Activity, value: offline ? "Offline diagnostics available" : "Cloud diagnostics available", category: "PLATFORM" },
    { title: "Owner security & access", description: "Verify owner identity and run protected account-management operations.", view: "admin", icon: ShieldCheck, value: "Owner verification protected", category: "PEOPLE" },
    { title: "Platform administration", description: "Open restricted platform-wide administration and governance tools.", view: "masterAdmin", icon: ShieldCheck, value: "Role-protected console", category: "PLATFORM" },
    { title: "Workspace preferences", description: "Configure appearance, language, density, startup view and sync behavior.", view: "settings", icon: Settings, value: "Desktop and shop preferences", category: "PLATFORM" }
  ];

  const filteredModules = useMemo(() => modules.filter((module) => {
    const term = moduleQuery.trim().toLowerCase();
    const matchesCategory = moduleCategory === "ALL" || module.category === moduleCategory;
    const matchesTerm = !term || [module.title, module.description, module.value, module.category]
      .some((value) => s(value).toLowerCase().includes(term));
    return matchesCategory && matchesTerm;
  }), [modules, moduleCategory, moduleQuery]);

  function exportManagementReport() {
    const reportRows: Row[] = [
      { Section: "WORKSPACE", Item: "Shop", Status: "CURRENT", Value: s(cloud.shop.shop_name) || "BeBoss shop", Details: "Management report" },
      { Section: "WORKSPACE", Item: "Generated at", Status: "CURRENT", Value: new Date().toLocaleString(), Details: "Local desktop time" },
      { Section: "SUMMARY", Item: "Active products", Status: "CURRENT", Value: products.length, Details: "Deleted products excluded" },
      { Section: "SUMMARY", Item: "Low-stock products", Status: lowStock.length, Value: lowStock.length, Details: "At or below reorder threshold" },
      { Section: "SUMMARY", Item: "Customer receivables", Status: "REVIEW", Value: Math.round(receivables), Details: customers.filter((item) => n(item.debtBalance) > 0).length + " customer accounts with balances" },
      { Section: "SUMMARY", Item: "Active branches", Status: "CURRENT", Value: activeBranches.length, Details: "Cloud-managed locations" },
      { Section: "SUMMARY", Item: "Active staff", Status: "CURRENT", Value: activeStaff.length, Details: "Active shop identities" },
      { Section: "SUMMARY", Item: "Active devices", Status: "CURRENT", Value: activeDevices.length, Details: "Paired and pending active terminals" },
      { Section: "SUMMARY", Item: "Open stock transfers", Status: openTransfers.length ? "REVIEW" : "CLEAR", Value: openTransfers.length, Details: "Requested, in transit or receipt requested" },
      ...branchPerformance.map((branch) => ({
        Section: "BRANCH", Item: branch.branchName, Status: branch.status,
        Value: Math.round(branch.monthlySales), Details: branch.transactionCount + " sales this month · target " + (branch.target ? Math.round(branch.targetProgress) + "%" : "not set") + " · manager " + (s(branch.manager_name) || "unassigned")
      })),
      ...lowStock.map((item) => ({
        Section: "LOW STOCK", Item: s(item.name) || "Unnamed product", Status: "REORDER",
        Value: n(item.quantityInStock), Details: "Threshold " + n(item.lowStockThreshold) + " · SKU " + (s(item.sku) || s(item.barcode) || "not recorded")
      })),
      ...creditWatch.map((item) => ({
        Section: "CUSTOMER CREDIT", Item: s(item.name) || s(item.fullName) || "Customer account",
        Status: "OUTSTANDING", Value: Math.round(n(item.debtBalance)), Details: "Customer reference " + (s(item.customerCode) || s(item.id))
      })),
      ...openTransfers.map((item) => ({
        Section: "STOCK TRANSFER", Item: s(item.transfer_number) || s(item.id),
        Status: s(item.status), Value: s(item.quantity) || "", Details: s(item.from_branch_name) + " → " + s(item.to_branch_name)
      })),
      ...devices.map((item) => ({
        Section: "DEVICE", Item: s(item.device_name) || s(item.name) || "POS terminal",
        Status: item.is_active ? (s(item.device_id) ? "ACTIVE · PAIRED" : "ACTIVE · PENDING") : "INACTIVE",
        Value: s(item.platform), Details: s(item.branch_name) + " · " + (s(item.assigned_user_name) || "unassigned")
      }))
    ];
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv("BeBoss-Management-Report-" + dateStamp + ".csv",
      ["Section", "Item", "Status", "Value", "Details"], reportRows);
  }

  return <div className="page-stack management-center-page">
    <PageHeading eyebrow="OPERATIONS CONTROL CENTER" title="Management center"
      description="A consolidated operating cockpit for inventory, finance, people, locations, terminals and platform services."
      action={<div className="management-heading-actions">
        <button className="btn-outline" onClick={() => onNavigate("sync")}><RefreshCw size={15} /> Sync health</button>
        <button className="btn-primary" onClick={exportManagementReport}><Download size={15} /> Export report</button>
      </div>} />

    <section className="management-command-hero">
      <div className="management-command-copy">
        <span className="eyebrow">BUSINESS MANAGEMENT · LIVE WORKSPACE DATA</span>
        <h2>{s(cloud.shop.shop_name) || "BeBoss shop"} <em>· Executive control</em></h2>
        <p>Use the attention queue to find operational issues, then open the actual management workflow to resolve them. Reports are generated from the data currently available on this device.</p>
        <div className="management-hero-meta">
          <span className={offline ? "management-connectivity is-offline" : "management-connectivity is-online"}><i />{offline ? "Offline-first mode" : "Cloud connected"}</span>
          <span><Clock3 size={13} />{cloud.snapshotUpdatedAt ? "Snapshot " + new Date(cloud.snapshotUpdatedAt).toLocaleString() : "No snapshot timestamp"}</span>
          <StatusPill value={cloud.verifiedChunks > 0 ? "VERIFIED" : "PENDING"} />
        </div>
      </div>
      <div className="management-command-summary">
        <span className="management-command-summary-label">Open attention items</span>
        <strong>{attentionCount.toLocaleString()}</strong>
        <small>{alerts.length} operational signals · {alerts.filter((item) => item.priority === "HIGH").length} high priority</small>
        <button className="management-summary-link" onClick={() => { setShowAllAlerts(true); document.getElementById("management-attention")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Review attention queue <ArrowRight size={14} /></button>
      </div>
    </section>

    <div className="stat-grid four">
      <StatCard label="Products requiring review" value={lowStock.length.toLocaleString()} sub="At or below reorder threshold" icon={Package} tone="orange" />
      <StatCard label="Outstanding customer credit" value={money(receivables)} sub={customers.length + " customer accounts"} icon={Wallet} tone="blue" />
      <StatCard label="Organization footprint" value={activeBranches.length + " / " + activeStaff.length} sub="Active branches / staff" icon={Building2} tone="purple" />
      <StatCard label="Registered POS terminals" value={activeDevices.length.toLocaleString()} sub={openTransfers.length + " open stock transfers · " + money(monthlyAddon) + " device add-ons"} icon={Smartphone} tone="green" />
    </div>

    <div className="management-control-grid">
      <section className="panel management-attention-panel" id="management-attention">
        <div className="panel-heading">
          <div><span className="eyebrow muted">ACTION REQUIRED · REAL RECORDS</span><h3>Operational attention queue</h3><p>Signals are calculated from the current shop snapshot and cloud management records.</p></div>
          <button className="text-action" onClick={() => setShowAllAlerts((value) => !value)}>{showAllAlerts ? "Show fewer" : "View all"} <ArrowRight size={14} /></button>
        </div>
        {sortedAlerts.length ? <div className="management-alert-list">
          {(showAllAlerts ? sortedAlerts : sortedAlerts.slice(0, 5)).map((alert) => {
            const Icon = alert.icon;
            return <article className={"management-alert-row priority-" + alert.priority.toLowerCase()} key={alert.id}>
              <span className="management-alert-icon"><Icon size={17} /></span>
              <div className="management-alert-copy"><div><strong>{alert.title}</strong><StatusPill value={alert.priority} /></div><p>{alert.detail}</p><small>{alert.count.toLocaleString()} {alert.count === 1 ? "item" : "items"} · {alert.priority === "HIGH" ? "Immediate review" : alert.priority === "MEDIUM" ? "Follow-up recommended" : "Operational improvement"}</small></div>
              <button className="btn-outline small" onClick={() => onNavigate(alert.action)}>{alert.actionLabel} <ArrowRight size={13} /></button>
            </article>;
          })}
        </div> : <div className="management-all-clear"><CheckCircle2 size={22} /><div><strong>No active attention signals</strong><span>No low-stock alerts, pending transfers, unpaired devices or outstanding customer balances were found in the loaded records.</span></div></div>}
      </section>

      <section className="panel management-branch-panel">
        <div className="panel-heading"><div><span className="eyebrow muted">MULTI-LOCATION PERFORMANCE</span><h3>Branch performance</h3><p>Sales are grouped by branch for the current calendar month.</p></div><button className="text-action" onClick={() => onNavigate("branches")}>Manage branches <ArrowRight size={14} /></button></div>
        {branchPerformance.length ? <div className="management-branch-list">
          {branchPerformance.slice(0, 6).map((branch) => <div className="management-branch-row" key={branch.branchId}>
            <div className="management-branch-main"><span className="management-branch-avatar"><Building2 size={15} /></span><div><strong>{branch.branchName}</strong><small>{s(branch.manager_name) || "Manager not assigned"} · {branch.transactionCount} transactions</small></div></div>
            <div className="management-branch-metrics"><strong>{money(branch.monthlySales)}</strong><StatusPill value={branch.status} /></div>
            <div className="management-progress-track"><span style={{ width: branch.target > 0 ? branch.targetProgress + "%" : "0%" }} /></div>
            <small className="management-branch-target">{branch.target > 0 ? branch.targetProgress.toFixed(1) + "% of " + money(branch.target) + " monthly target" : "Monthly target not configured"}</small>
          </div>)}
        </div> : <Empty title="No branch performance data" description="Create a branch and sync branch-attributed sales to see the network performance view." icon={Building2} />}
        <div className="management-branch-footer"><span>{branchPerformance.length} registered locations</span><span>{branchPerformance.filter((branch) => branch.target > 0 && branch.targetProgress >= 100).length} at or above monthly target</span></div>
      </section>
    </div>

    <section className="management-modules">
      <div className="section-title-row"><div><span className="eyebrow muted">MANAGEMENT WORKSPACES</span><h3>Operational modules</h3><p>Search or filter the management tools. Opening a module takes you to its working workflow.</p></div><span className="management-module-count">{filteredModules.length} of {modules.length} workspaces</span></div>
      <div className="management-module-toolbar">
        <label className="management-module-search"><Search size={16} /><input value={moduleQuery} onChange={(event) => setModuleQuery(event.target.value)} placeholder="Find a workspace, action or capability…" /><kbd>Search</kbd></label>
        <div className="management-module-filters" aria-label="Filter management workspaces">
          {(["ALL", "INVENTORY", "FINANCE", "PEOPLE", "NETWORK", "PLATFORM"] as ModuleCategory[]).map((category) => <button key={category} className={moduleCategory === category ? "selected" : ""} onClick={() => setModuleCategory(category)}><Filter size={12} />{category === "ALL" ? "All areas" : category.toLowerCase()}</button>)}
        </div>
      </div>
      <div className="management-module-grid">{filteredModules.map((module) => { const Icon = module.icon; return <button className="management-module" key={module.view} onClick={() => onNavigate(module.view)}><span className="management-module-icon"><Icon size={18} /></span><span className="management-module-copy"><strong>{module.title}</strong><small>{module.description}</small><b>{module.value}</b></span><ArrowRight size={15} className="management-module-arrow" /></button>; })}</div>
      {!filteredModules.length && <Empty title="No matching workspace" description="Try a different search term or choose another management area." icon={Search} />}
    </section>

    <div className="management-bottom-grid">
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">INVENTORY RISK</span><h3>Low-stock watchlist</h3></div><button className="text-action" onClick={() => onNavigate("products")}>Review inventory <ArrowRight size={14} /></button></div>
        {lowStock.length ? <div className="management-watch-list">{lowStock.slice(0, 8).map((item) => <div className="management-watch-row" key={s(item.id)}><span><strong>{s(item.name) || "Unnamed product"}</strong><small>{s(item.sku) || s(item.barcode) || "No SKU recorded"}</small></span><b>{n(item.quantityInStock)} / {n(item.lowStockThreshold)}</b></div>)}</div> : <Empty title="No low-stock alerts" description="No active product currently falls at or below its configured reorder threshold." icon={Package} />}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">CUSTOMER CREDIT CONTROL</span><h3>Largest outstanding balances</h3></div><button className="text-action" onClick={() => onNavigate("customers")}>Open accounts <ArrowRight size={14} /></button></div>
        {creditWatch.length ? <div className="management-watch-list">{creditWatch.map((item) => <div className="management-watch-row" key={"credit-" + s(item.id)}><span><strong>{s(item.name) || s(item.fullName) || "Customer account"}</strong><small>{s(item.phone) || s(item.customerCode) || "Customer credit account"}</small></span><b>{money(n(item.debtBalance))}</b></div>)}</div> : <Empty title="No outstanding customer balances" description="Customer accounts with a positive balance will appear here for quick follow-up." icon={Wallet} />}
      </section>
    </div>
  </div>;
}
