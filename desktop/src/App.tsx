import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bell, Building2, Check, ChevronDown,
  ClipboardList, CreditCard, Database, LayoutDashboard, LoaderCircle, LogOut, Menu,
  Package, RefreshCw, Search, Settings, ShoppingCart, Smartphone, Truck, UserRound,
  Users, Warehouse, X, Zap
} from "lucide-react";
import { callDesktopApi, currentSession, signOut, type OwnerCredentials } from "./lib/cloud";
import { ensureSnapshot, errorText, isToday, n, rows, s } from "./lib/format";
import { mergeSnapshots } from "./lib/snapshot-merge";
import type { CloudState, NavKey, ReceiptPayload, Snapshot } from "./lib/types";
import { AuthScreen } from "./components/AuthScreen";
import { ReceiptPreview } from "./components/ReceiptPreview";
import { LoginHint } from "./components/ui";
import { OverviewPage } from "./components/screens/OverviewPage";
import { CheckoutPage } from "./components/screens/CheckoutPage";
import { ProductsPage } from "./components/screens/ProductsPage";
import { SalesPage } from "./components/screens/SalesPage";
import { CustomersPage } from "./components/screens/CustomersPage";
import { PurchasesPage } from "./components/screens/PurchasesPage";
import { ReportsPage } from "./components/screens/ReportsPage";
import { BranchesPage } from "./components/screens/BranchesPage";
import { StaffPage } from "./components/screens/StaffPage";
import { DevicesPage } from "./components/screens/DevicesPage";
import { TransfersPage } from "./components/screens/TransfersPage";
import { BillingPage } from "./components/screens/BillingPage";
import { DiagnosticsPage } from "./components/screens/DiagnosticsPage";
import { BackupPage } from "./components/screens/BackupPage";
import { SettingsPage } from "./components/screens/SettingsPage";
import { SetupWizard } from "./components/SetupWizard";

const NAV: { id: NavKey; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Workspace" },
  { id: "checkout", label: "Point of sale", icon: ShoppingCart, group: "Workspace" },
  { id: "products", label: "Inventory", icon: Package, group: "Operations" },
  { id: "sales", label: "Sales ledger", icon: ClipboardList, group: "Operations" },
  { id: "customers", label: "Customers & credit", icon: Users, group: "Operations" },
  { id: "purchases", label: "Purchasing", icon: Truck, group: "Operations" },
  { id: "reports", label: "Reports & insights", icon: BarChart3, group: "Intelligence" },
  { id: "branches", label: "Branches", icon: Building2, group: "Organization" },
  { id: "staff", label: "Staff access", icon: UserRound, group: "Organization" },
  { id: "devices", label: "POS terminals", icon: Smartphone, group: "Organization" },
  { id: "transfers", label: "Stock transfers", icon: Warehouse, group: "Organization" },
  { id: "billing", label: "Subscription", icon: CreditCard, group: "Administration" },
  { id: "diagnostics", label: "System diagnostics", icon: Activity, group: "Administration" },
  { id: "backup", label: "Backup & recovery", icon: Database, group: "Administration" },
  { id: "settings", label: "Shop settings", icon: Settings, group: "Administration" }
];

export default function App() {
  const [owner, setOwner] = useState<OwnerCredentials | null>(null);
  const [cloud, setCloud] = useState<CloudState | null>(null);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [view, setView] = useState<NavKey>("overview");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null);

  async function saveCache(credentials: OwnerCredentials, data: CloudState) {
    try {
      await window.beBossDesktop.secureStore.set("shop-cache:" + credentials.username, JSON.stringify({
        savedAt: Date.now(), shop: data.shop, owner: data.owner, snapshot: data.snapshot,
        snapshotUpdatedAt: data.snapshotUpdatedAt, verifiedChunks: data.verifiedChunks,
        payments: data.payments, codes: data.codes, devices: data.devices, branches: data.branches,
        transfers: data.transfers, staff: data.staff, announcements: data.announcements, serverTime: data.serverTime
      }));
    } catch (e) { console.warn("Encrypted cache could not be updated", e); }
  }

  async function bootstrap(credentials: OwnerCredentials, showBusy = true) {
    if (showBusy) setBusy(true);
    setError(""); setNotice("");
    try {
      const response = await callDesktopApi<CloudState & { ok: true }>("bootstrap", credentials);
      const pending = await window.beBossDesktop.local.pending();
      let next = { ...response, snapshot: ensureSnapshot(response.snapshot) } as CloudState;
      if (pending.length && next.snapshot) {
        const latest = ensureSnapshot(pending[pending.length - 1].payload as Snapshot);
        if (latest) {
          const merge = mergeSnapshots(next.snapshot, latest);
          const merged = await callDesktopApi<{ ok: true; uploadedAt: number; snapshot: Snapshot }>("save_snapshot", credentials, {
            deviceId, expectedUpdatedAt: next.snapshotUpdatedAt, snapshot: merge.snapshot
          });
          next = { ...next, snapshot: ensureSnapshot(merged.snapshot), snapshotUpdatedAt: merged.uploadedAt };
          await window.beBossDesktop.local.acknowledge(pending.map((item) => item.id));
          if (merge.conflictsResolved > 0) setNotice(`Reconnected and merged ${merge.conflictsResolved} concurrent record update(s) using BeBoss version and tombstone rules.`);
        }
      }
      setCloud(next); setOwner(credentials); setOffline(false);
      await saveCache(credentials, next);
      setNotice("Shop data verified and synchronized with BeBoss Cloud.");
      setTimeout(() => setNotice(""), 5000);
      return true;
    } catch (e) {
      const message = errorText(e);
      const cached = await window.beBossDesktop.secureStore.get("shop-cache:" + credentials.username).catch(() => null);
      if (cached) {
        try {
          const stored = JSON.parse(cached) as CloudState;
          if (stored.shop && stored.snapshotUpdatedAt !== undefined) {
            const localSnapshot = await window.beBossDesktop.local.load().catch(() => null);
            setCloud({ ...stored, snapshot: ensureSnapshot(localSnapshot || stored.snapshot) });
            setOwner(credentials); setOffline(true);
            setError("Cloud unavailable: using the encrypted local SQLite snapshot. Changes will sync when online. " + message);
            return true;
          }
        } catch { /* ignore corrupt cache */ }
      }
      if (cloud?.snapshot) {
        const localSnapshot = await window.beBossDesktop.local.load().catch(() => null);
        setCloud({ ...cloud, snapshot: ensureSnapshot(localSnapshot || cloud.snapshot) });
        setOwner(credentials); setOffline(true);
        setError("Cloud unavailable: using the encrypted local SQLite snapshot. Changes will sync when online. " + message);
        return true;
      }
      setError(message);
      return false;
    } finally { if (showBusy) setBusy(false); }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const idValue = await window.beBossDesktop.getDeviceId();
        if (alive) setDeviceId(idValue);
        const setupValue = await window.beBossDesktop.secureStore.get("desktop-setup-complete");
        if (alive) setSetupComplete(setupValue === "true");
        const session = await currentSession();
        const identity = await window.beBossDesktop.secureStore.get("owner-identity");
        if (session && identity) {
          const parsed = JSON.parse(identity) as OwnerCredentials;
          if (parsed.username && parsed.phone && alive) { setOwner(parsed); await bootstrap(parsed); }
        }
      } catch (e) { if (alive) setError(errorText(e)); }
      finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!owner || !offline) return;
    const retrySync = () => { if (navigator.onLine) void bootstrap(owner, false); };
    window.addEventListener("online", retrySync);
    const retryTimer = window.setInterval(retrySync, 30_000);
    return () => { window.removeEventListener("online", retrySync); window.clearInterval(retryTimer); };
  }, [owner, offline]);

  async function authenticated(credentials: OwnerCredentials) { await bootstrap(credentials); }
  async function refresh() { if (owner) await bootstrap(owner); }

  async function commitSnapshot(mutator: (next: Snapshot) => void, operation = "SNAPSHOT_MUTATION") {
    if (!owner || !cloud) return;
    if (!cloud.snapshot) throw new Error("Sync the registered Android terminal once to initialize the shop business snapshot.");
    const next = structuredClone(cloud.snapshot);
    mutator(next);
    const subscriptionStatus = s(cloud.shop.subscription_status || next.shopProfile.subscriptionStatus).toUpperCase();
    const subscriptionExpiresAt = n(cloud.shop.subscription_expires_at || next.shopProfile.subscriptionExpiresAt);
    const requiresActiveSubscription = operation === "SALE";
    if (offline) {
      const localTransaction = await window.beBossDesktop.local.queue(operation, next, deviceId, cloud.snapshotUpdatedAt, requiresActiveSubscription, subscriptionExpiresAt, subscriptionStatus);
      setCloud({ ...cloud, snapshot: ensureSnapshot(localTransaction.payload as Snapshot) });
      setNotice("Saved securely on this device. It will sync automatically when the connection returns.");
      return;
    }
    const localTransaction = await window.beBossDesktop.local.queue(operation, next, deviceId, cloud.snapshotUpdatedAt, requiresActiveSubscription, subscriptionExpiresAt, subscriptionStatus);
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await callDesktopApi<{ ok: true; uploadedAt: number; snapshot: Snapshot }>(
        "save_snapshot", owner, { deviceId, expectedUpdatedAt: cloud.snapshotUpdatedAt, snapshot: localTransaction.payload }
      );
      const updated = { ...cloud, snapshot: ensureSnapshot(response.snapshot), snapshotUpdatedAt: response.uploadedAt };
      setCloud(updated);
      await window.beBossDesktop.local.acknowledge([localTransaction.id]);
      await saveCache(owner, updated);
      setNotice("Changes saved to the shared BeBoss shop snapshot.");
      setTimeout(() => setNotice(""), 4500);
    } catch (e) {
      const message = errorText(e);
      if (!navigator.onLine || /failed to fetch|network|timeout|connection|offline/i.test(message)) {
        setCloud({ ...cloud, snapshot: ensureSnapshot(localTransaction.payload as Snapshot) }); setOffline(true); setError("");
        setNotice("Saved securely on this device. It will sync automatically when the connection returns."); return;
      }
      if (/newer shop data|snapshot/i.test(message)) {
        setCloud({ ...cloud, snapshot: ensureSnapshot(localTransaction.payload as Snapshot) }); setOffline(true); setError("");
        setNotice("Cloud data changed during this save. The local transaction is preserved; BeBoss is refreshing and merging before retrying."); return;
      }
      setError(message);
      if (message.toLowerCase().includes("newer shop data") || message.toLowerCase().includes("snapshot")) {
        setNotice("Refresh the shop to merge the latest phone and desktop updates before retrying.");
      }
      throw e;
    } finally { setBusy(false); }
  }

  async function callAction(action: Parameters<typeof callDesktopApi>[0], payload: Record<string, unknown>) {
    if (!owner || offline) throw new Error("Reconnect and verify the shop owner before changing cloud management records.");
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await callDesktopApi(action, owner, payload);
      await bootstrap(owner, false);
      return result as Record<string, any>;
    } catch (e) { setError(errorText(e)); throw e; }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try {
      await signOut();
      await window.beBossDesktop.secureStore.remove("owner-identity");
      setOwner(null); setCloud(null); setOffline(false); setView("overview"); setError(""); setNotice("");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (setupComplete === null) {
    return <div className="setup-loading"><LoaderCircle className="spin" size={28} /><span>Preparing BeBoss Desktop…</span></div>;
  }
  if (!setupComplete) {
    return <SetupWizard onComplete={() => setSetupComplete(true)} />;
  }
  if (!owner || !cloud) {
    return <><AuthScreen onAuthenticated={authenticated} />{busy && <div className="global-loading"><LoaderCircle className="spin" size={26} /><span>Connecting to BeBoss Cloud…</span></div>}{error && <div className="login-error">{error}<button onClick={() => setError("")}><X size={15} /></button></div>}</>;
  }

  const snapshot = ensureSnapshot(cloud.snapshot);
  const pageTitle = NAV.find((item) => item.id === view)?.label ?? "Overview";
  const products = rows(snapshot?.products).filter((p) => p.isDeleted !== true);
  const sales = rows(snapshot?.sales).sort((a, b) => n(b.saleDate) - n(a.saleDate));
  const customers = rows(snapshot?.customers).filter((c) => c.isDeleted !== true);
  const todaysSales = sales.filter((sale) => isToday(sale.saleDate));
  const revenueToday = todaysSales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const profitToday = todaysSales.reduce((sum, sale) => sum + n(sale.totalProfit), 0);
  const stockCost = products.reduce((sum, p) => sum + n(p.costPrice) * n(p.quantityInStock), 0);
  const receivables = customers.reduce((sum, c) => sum + n(c.debtBalance), 0);
  const lowStock = products.filter((p) => n(p.quantityInStock) <= n(p.lowStockThreshold)).length;

  function openReceipt(sale: Record<string, any>, saleItems?: Record<string, any>[]) {
    setReceipt({
      sale,
      items: saleItems ?? rows(snapshot?.saleItems).filter((item) => s(item.saleId) === s(sale.id)),
      profile: snapshot?.shopProfile ?? {}
    });
  }

  return <div className="app-shell">
    <aside className={"sidebar " + (menuOpen ? "open" : "")}>
      <div className="brand-row"><span className="brand-mark brand-logo-mark"><img src="/beboss-app-icon.png" alt="BeBoss" /></span><div><strong>BeBoss</strong><small>RETAIL COMMAND</small></div><span className="desktop-tag">DESKTOP</span></div>
      <div className="shop-switcher"><span className="shop-avatar">{s(cloud.shop.shop_name).slice(0, 1).toUpperCase() || "B"}</span><div><strong>{s(cloud.shop.shop_name) || "My Shop"}</strong><small>@{owner.username}</small></div><ChevronDown size={15} /></div>
      <nav className="side-nav">
        {["Workspace", "Operations", "Intelligence", "Organization", "Administration"].map((group) => <div className="nav-group" key={group}>
          <span className="nav-label">{group}</span>
          {NAV.filter((item) => item.group === group).map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={"nav-link " + (view === item.id ? "selected" : "")} onClick={() => { setView(item.id); setMenuOpen(false); }}>
              <Icon size={17} /><span>{item.label}</span>
              {item.id === "products" && lowStock > 0 && <em>{lowStock}</em>}
            </button>;
          })}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="support-card"><span><Zap size={15} /></span><strong>BeBoss sync</strong><small>{offline ? "Offline · local changes queued" : cloud.verifiedChunks ? "Snapshot integrity verified" : "No signed snapshot uploaded yet"}</small></div>
        <button className="nav-link" onClick={() => setView("settings")}><Settings size={17} /><span>Workspace preferences</span></button>
        <button className="profile-row" onClick={logout}><span className="profile-avatar">{owner.username.slice(0, 1).toUpperCase()}</span><span><strong>{owner.username}</strong><small>Shop owner</small></span><LogOut size={16} /></button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu icon-btn" onClick={() => setMenuOpen((v) => !v)}><Menu size={20} /></button><div className="breadcrumb"><span>BeBoss</span><b>/</b><strong>{pageTitle}</strong></div></div>
        <div className="topbar-right">
          <label className="global-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products, sales, customers…" /></label>
          <button className={"connection-chip " + (offline ? "offline" : "online")} onClick={refresh} title="Refresh cloud data"><span className="connection-dot" />{offline ? "Offline cache" : "Cloud synced"}</button>
          <button className="icon-btn" onClick={refresh} title="Refresh"><RefreshCw size={17} className={busy ? "spin" : ""} /></button>
          <button className="icon-btn" onClick={() => setView("billing")} title="Announcements and billing"><Bell size={17} /></button>
        </div>
      </header>

      <div className="page-content">
        {error && <div className="global-alert error"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
        {notice && <div className="global-alert success"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}
        {offline && <div className="offline-banner"><AlertTriangle size={17} /><span>Offline-first mode. Sales and stock changes are saved in an encrypted SQLite transaction queue and will sync when the connection returns.</span></div>}
        {!snapshot && <LoginHint />}
        {view === "overview" && <OverviewPage cloud={cloud} snapshot={snapshot} revenueToday={revenueToday} profitToday={profitToday} stockCost={stockCost} receivables={receivables} lowStock={lowStock} onNavigate={setView} />}
        {view === "checkout" && <CheckoutPage snapshot={snapshot} onCommit={commitSnapshot} onReceipt={openReceipt} offline={offline} busy={busy} />}
        {view === "products" && <ProductsPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} query={search} />}
        {view === "sales" && <SalesPage snapshot={snapshot} query={search} onReceipt={openReceipt} />}
        {view === "customers" && <CustomersPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} query={search} />}
        {view === "purchases" && <PurchasesPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} />}
        {view === "reports" && <ReportsPage snapshot={snapshot} />}
        {view === "branches" && <BranchesPage cloud={cloud} onAction={callAction} offline={offline} />}
        {view === "staff" && <StaffPage cloud={cloud} onAction={callAction} offline={offline} />}
        {view === "devices" && <DevicesPage cloud={cloud} onAction={callAction} offline={offline} />}
        {view === "transfers" && <TransfersPage cloud={cloud} snapshot={snapshot} onAction={callAction} offline={offline} />}
        {view === "billing" && <BillingPage cloud={cloud} onNavigate={setView} onCheckout={async (payload) => {
          const result = await callAction("create_checkout", payload);
          if (result.checkoutUrl) {
            await window.beBossDesktop.openExternal(s(result.checkoutUrl));
            setNotice("Secure hosted checkout opened in your browser. BeBoss will activate the plan only after the provider confirms payment.");
          } else if (result.pending) {
            setNotice(s(result.message) || "The provider response is being reconciled. Review the payment queue before retrying.");
          }
        }} />}
        {view === "diagnostics" && <DiagnosticsPage cloud={cloud} snapshot={snapshot} onRefresh={refresh} />}
        {view === "backup" && <BackupPage snapshot={snapshot} cloud={cloud} onCommit={commitSnapshot} offline={offline} />}
        {view === "settings" && <SettingsPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} />}
        <footer className="app-footer"><span>BeBoss Desktop · Version {window.beBossDesktop.version}</span><span>Last cloud snapshot {new Date(cloud.snapshotUpdatedAt || 0).toLocaleString()} · {cloud.verifiedChunks} verified chunks</span></footer>
      </div>
    </main>
    {receipt && <ReceiptPreview receipt={receipt} onClose={() => setReceipt(null)} />}
  </div>;
}