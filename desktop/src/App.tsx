import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell, Boxes,
  Building2, CalendarDays, Check, ChevronDown, CircleDollarSign, ClipboardList,
  CreditCard, Download, FileText, LayoutDashboard, LoaderCircle, LogOut, Menu,
  Monitor, Package, Plus, Printer, RefreshCw, Search, Settings, ShieldCheck,
  ShoppingBag, ShoppingCart, Smartphone, Sparkles, Store, Tags, Truck, Users,
  Wallet, Warehouse, X, Zap, Copy, Pencil, Trash2, UserRound, Clock3
} from "lucide-react";
import {
  authClient, callDesktopApi, currentSession, requestOwnerOtp, signOut,
  toOwnerPhoneE164, verifyOwnerOtp, type OwnerCredentials
} from "./lib/cloud";

type Row = Record<string, any>;
type Snapshot = {
  metadata: Row;
  shopProfile: Row;
  products: Row[];
  customers: Row[];
  sales: Row[];
  saleItems: Row[];
  customerPayments: Row[];
  purchases: Row[];
  stockTransfers: Row[];
  branches: Row[];
  users: Row[];
  tombstones: Row[];
};
type CloudState = {
  shop: Row;
  owner: Row;
  snapshot: Snapshot | null;
  snapshotUpdatedAt: number;
  verifiedChunks: number;
  payments: Row[];
  codes: Row[];
  devices: Row[];
  branches: Row[];
  transfers: Row[];
  staff: Row[];
  announcements: Row[];
  serverTime: number;
};
type NavKey = "overview" | "checkout" | "products" | "sales" | "customers" | "purchases" | "reports" | "branches" | "staff" | "devices" | "transfers" | "billing" | "settings";

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
  { id: "settings", label: "Shop settings", icon: Settings, group: "Administration" }
];

const blankSnapshot = (): Snapshot => ({
  metadata: {}, shopProfile: {}, products: [], customers: [], sales: [], saleItems: [],
  customerPayments: [], purchases: [], stockTransfers: [], branches: [], users: [], tombstones: []
});
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((x) => x && typeof x === "object") : [];
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const s = (value: unknown) => value == null ? "" : String(value);
const id = () => crypto.randomUUID();
const money = (value: unknown) => "FRw " + Math.round(n(value)).toLocaleString("en-US");
const dateTime = (value: unknown) => n(value) ? new Date(n(value)).toLocaleString() : "—";
const dateOnly = (value: unknown) => n(value) ? new Date(n(value)).toLocaleDateString() : "—";
const isToday = (value: unknown) => n(value) > 0 && new Date(n(value)).toDateString() === new Date().toDateString();
const activeProducts = (snapshot: Snapshot | null) => rows(snapshot?.products).filter((p) => p.isDeleted !== true);
const activeCustomers = (snapshot: Snapshot | null) => rows(snapshot?.customers).filter((c) => c.isDeleted !== true);
const activeStaff = (data: CloudState | null) => rows(data?.staff).filter((u) => u.is_active !== false);
const errorText = (error: unknown) => error instanceof Error ? error.message : "An unexpected BeBoss operation failed.";

function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  return /[",\\r\\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
}
function downloadCsv(filename: string, columns: string[], data: Row[]) {
  const content = "\\uFEFF" + [
    columns.map(csvCell).join(","),
    ...data.map((row) => columns.map((column) => csvCell(row[column])).join(","))
  ].join("\\r\\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
function parseCsv(input: string): string[][] {
  const output: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\\n" || char === "\\r") && !quoted) {
      if (char === "\\r" && input[i + 1] === "\\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim() !== "")) output.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) output.push(row);
  }
  return output;
}

function ensureSnapshot(value: Snapshot | null): Snapshot | null {
  if (!value) return null;
  return {
    metadata: value.metadata ?? {},
    shopProfile: value.shopProfile ?? {},
    products: rows(value.products), customers: rows(value.customers), sales: rows(value.sales),
    saleItems: rows(value.saleItems), customerPayments: rows(value.customerPayments),
    purchases: rows(value.purchases), stockTransfers: rows(value.stockTransfers),
    branches: rows(value.branches), users: rows(value.users), tombstones: rows(value.tombstones)
  };
}

function StatCard({ label, value, sub, icon: Icon, tone = "blue" }: {
  label: string; value: string; sub?: string; icon: typeof Activity; tone?: string
}) {
  return <article className="stat-card">
    <div className={"stat-icon tone-" + tone}><Icon size={19} /></div>
    <div className="stat-copy"><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>
  </article>;
}

function StatusPill({ value }: { value: string }) {
  const clean = value.toUpperCase();
  const tone = ["ACTIVE", "PAID", "APPROVED", "COMPLETED", "OPEN", "TRIAL"].includes(clean) ? "good"
    : ["PENDING", "PENDING_VERIFICATION", "IN_TRANSIT", "REQUESTED", "RECEIPT_REQUESTED"].includes(clean) ? "warn"
    : ["REJECTED", "EXPIRED", "SUSPENDED", "CANCELLED", "CLOSED"].includes(clean) ? "bad" : "neutral";
  return <span className={"status-pill " + tone}>{value.replaceAll("_", " ")}</span>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (owner: OwnerCredentials) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const normalized = toOwnerPhoneE164(phone);
      const owner = { username: username.trim().toLowerCase(), phone: normalized };
      await requestOwnerOtp(owner);
      setPhone(normalized);
      setSent(true);
      setNotice("If the details match a registered shop owner, an SMS verification code has been sent to the registered phone.");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const normalized = toOwnerPhoneE164(phone);
      await verifyOwnerOtp(normalized, code);
      await window.beBossDesktop.secureStore.set("owner-identity", JSON.stringify({ username: username.trim().toLowerCase(), phone: normalized }));
      await onAuthenticated({ username: username.trim().toLowerCase(), phone: normalized });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return <div className="auth-shell">
    <div className="auth-art">
      <div className="auth-brand"><span className="brand-mark"><Store size={23} /></span><span>BeBoss</span><small>DESKTOP</small></div>
      <div className="auth-headline">
        <span className="eyebrow"><Sparkles size={14} /> RETAIL OPERATIONS PLATFORM</span>
        <h1>Run your business.<br /><em>From one command centre.</em></h1>
        <p>Sales, inventory, customers, branches and staff — in sync with your BeBoss shop.</p>
      </div>
      <div className="auth-showcase">
        <div className="showcase-top"><span>SHOP PERFORMANCE</span><span className="live-dot">CLOUD CONNECTED</span></div>
        <div className="showcase-chart">
          {[26, 42, 34, 61, 49, 75, 62, 88, 72, 96, 81, 100].map((v, i) => <span key={i} style={{ height: v + "%" }} />)}
        </div>
        <div className="showcase-bottom"><span>Sales intelligence</span><span>Inventory control</span><span>Multi-branch sync</span></div>
      </div>
      <div className="auth-foot">SECURE OWNER ACCESS · ENGLISH · IKINYARWANDA · FRANÇAIS · KISWAHILI</div>
    </div>
    <div className="auth-panel">
      <div className="auth-form-wrap">
        <div className="auth-form-icon"><ShieldCheck size={23} /></div>
        <span className="eyebrow muted">OWNER SIGN IN</span>
        <h2>Welcome to BeBoss</h2>
        <p className="muted">Verify the mobile number already registered to your shop. Desktop access is granted only to an active, verified shop owner.</p>
        <form onSubmit={sent ? verifyCode : sendCode} className="auth-form">
          <label>Shop owner username
            <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={2} maxLength={80} autoComplete="username" required disabled={sent} placeholder="your-shop-username" />
          </label>
          <label>Registered mobile number
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" required disabled={sent} placeholder="+250 7XX XXX XXX" />
          </label>
          {sent && <label>SMS verification code
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" minLength={4} maxLength={8} required placeholder="Enter the code received by SMS" autoFocus />
          </label>}
          {error && <div className="inline-alert error"><AlertTriangle size={16} />{error}</div>}
          {notice && <div className="inline-alert info"><ShieldCheck size={16} />{notice}</div>}
          <button className="btn-primary full" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : sent ? <ShieldCheck size={18} /> : <Smartphone size={18} />}
            {busy ? "Please wait…" : sent ? "Verify owner and open desktop" : "Send secure verification code"}
          </button>
          {sent && <button type="button" className="btn-quiet full" onClick={() => { setSent(false); setCode(""); setNotice(""); }}>Change owner details</button>}
        </form>
        <div className="auth-secure"><ShieldCheck size={15} /> Your session is encrypted by the operating-system keyring.</div>
      </div>
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: {
  eyebrow?: string; title: string; description?: string; action?: React.ReactNode
}) {
  return <div className="page-heading">
    <div><span className="eyebrow muted">{eyebrow || "BEBOSS WORKSPACE"}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {action && <div className="heading-actions">{action}</div>}
  </div>;
}

function Empty({ title, description, icon: Icon = Boxes }: { title: string; description: string; icon?: typeof Package }) {
  return <div className="empty-state"><span><Icon size={25} /></span><strong>{title}</strong><p>{description}</p></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal-card"><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>{children}</section>
  </div>;
}

function LoginHint() {
  return <div className="sync-hint"><AlertTriangle size={17} /><div><strong>Waiting for the first shop snapshot</strong><span>Open the registered BeBoss Android terminal, complete one successful cloud sync, then refresh this desktop workspace.</span></div></div>;
}

export default function App() {
  const [owner, setOwner] = useState<OwnerCredentials | null>(null);
  const [cloud, setCloud] = useState<CloudState | null>(null);
  const [view, setView] = useState<NavKey>("overview");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  async function saveCache(credentials: OwnerCredentials, data: CloudState) {
    try {
      await window.beBossDesktop.secureStore.set("shop-cache:" + credentials.username, JSON.stringify({
        savedAt: Date.now(),
        shop: data.shop,
        owner: data.owner,
        snapshot: data.snapshot,
        snapshotUpdatedAt: data.snapshotUpdatedAt,
        verifiedChunks: data.verifiedChunks,
        payments: data.payments,
        codes: data.codes,
        devices: data.devices,
        branches: data.branches,
        transfers: data.transfers,
        staff: data.staff,
        announcements: data.announcements,
        serverTime: data.serverTime
      }));
    } catch (e) { console.warn("Encrypted cache could not be updated", e); }
  }

  async function bootstrap(credentials: OwnerCredentials, showBusy = true) {
    if (showBusy) setBusy(true);
    setError(""); setNotice("");
    try {
      const response = await callDesktopApi<CloudState & { ok: true }>("bootstrap", credentials);
      const next = { ...response, snapshot: ensureSnapshot(response.snapshot) } as CloudState;
      setCloud(next);
      setOwner(credentials);
      setOffline(false);
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
            setCloud({ ...stored, snapshot: ensureSnapshot(stored.snapshot) });
            setOwner(credentials);
            setOffline(true);
            setError("Cloud unavailable: showing the last verified, encrypted snapshot in read-only mode. " + message);
            return true;
          }
        } catch { /* ignore corrupt cache */ }
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
        const session = await currentSession();
        const identity = await window.beBossDesktop.secureStore.get("owner-identity");
        if (session && identity) {
          const parsed = JSON.parse(identity) as OwnerCredentials;
          if (parsed.username && parsed.phone && alive) {
            setOwner(parsed);
            await bootstrap(parsed);
          }
        }
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, []);

  async function authenticated(credentials: OwnerCredentials) {
    await bootstrap(credentials);
  }

  async function refresh() {
    if (!owner) return;
    await bootstrap(owner);
  }

  async function commitSnapshot(mutator: (next: Snapshot) => void) {
    if (!owner || !cloud) return;
    if (offline) throw new Error("Reconnect to BeBoss Cloud before making a change. Cached data is read-only.");
    if (!cloud.snapshot) throw new Error("Sync the registered Android terminal once to initialize the shop business snapshot.");
    const next = structuredClone(cloud.snapshot);
    mutator(next);
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await callDesktopApi<{ ok: true; uploadedAt: number; snapshot: Snapshot }>(
        "save_snapshot", owner, {
          deviceId, expectedUpdatedAt: cloud.snapshotUpdatedAt, snapshot: next
        }
      );
      const updated = { ...cloud, snapshot: ensureSnapshot(response.snapshot), snapshotUpdatedAt: response.uploadedAt };
      setCloud(updated);
      await saveCache(owner, updated);
      setNotice("Changes saved to the shared BeBoss shop snapshot.");
      setTimeout(() => setNotice(""), 4500);
    } catch (e) {
      const message = errorText(e);
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
      return result as Row;
    } catch (e) {
      setError(errorText(e));
      throw e;
    } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try {
      await signOut();
      await window.beBossDesktop.secureStore.remove("owner-identity");
      setOwner(null); setCloud(null); setOffline(false); setView("overview");
      setError(""); setNotice("");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (!owner || !cloud) {
    return <><AuthScreen onAuthenticated={authenticated} />{busy && <div className="global-loading"><LoaderCircle className="spin" size={26} /><span>Connecting to BeBoss Cloud…</span></div>}{error && <div className="login-error">{error}<button onClick={() => setError("")}><X size={15} /></button></div>}</>;
  }

  const snapshot = ensureSnapshot(cloud.snapshot);
  const pageTitle = NAV.find((item) => item.id === view)?.label ?? "Overview";
  const products = activeProducts(snapshot);
  const sales = rows(snapshot?.sales).sort((a, b) => n(b.saleDate) - n(a.saleDate));
  const customers = activeCustomers(snapshot);
  const todaysSales = sales.filter((sale) => isToday(sale.saleDate));
  const revenueToday = todaysSales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const profitToday = todaysSales.reduce((sum, sale) => sum + n(sale.totalProfit), 0);
  const stockCost = products.reduce((sum, p) => sum + n(p.costPrice) * n(p.quantityInStock), 0);
  const receivables = customers.reduce((sum, c) => sum + n(c.debtBalance), 0);
  const lowStock = products.filter((p) => n(p.quantityInStock) <= n(p.lowStockThreshold)).length;
  const allTimeRevenue = sales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);

  return <div className="app-shell">
    <aside className={"sidebar " + (menuOpen ? "open" : "")}>
      <div className="brand-row"><span className="brand-mark"><Store size={22} /></span><div><strong>BeBoss</strong><small>RETAIL COMMAND</small></div><span className="desktop-tag">DESKTOP</span></div>
      <div className="shop-switcher"><span className="shop-avatar">{s(cloud.shop.shop_name).slice(0,1).toUpperCase() || "B"}</span><div><strong>{s(cloud.shop.shop_name) || "My Shop"}</strong><small>@{owner.username}</small></div><ChevronDown size={15} /></div>
      <nav className="side-nav">
        {["Workspace","Operations","Intelligence","Organization","Administration"].map((group) => <div className="nav-group" key={group}>
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
        <div className="support-card"><span><Zap size={15} /></span><strong>BeBoss sync</strong><small>{offline ? "Offline · read-only cache" : cloud.verifiedChunks ? "Snapshot integrity verified" : "No signed snapshot uploaded yet"}</small></div>
        <button className="nav-link" onClick={() => setView("settings")}><Settings size={17} /><span>Workspace preferences</span></button>
        <button className="profile-row" onClick={logout}><span className="profile-avatar">{owner.username.slice(0,1).toUpperCase()}</span><span><strong>{owner.username}</strong><small>Shop owner</small></span><LogOut size={16} /></button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu icon-btn" onClick={() => setMenuOpen((v) => !v)}><Menu size={20} /></button><div className="breadcrumb"><span>BeBoss</span><b>/</b><strong>{pageTitle}</strong></div></div>
        <div className="topbar-right">
          <label className="global-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products, sales, customers…" /></label>
          <button className={"connection-chip " + (offline ? "offline" : "online")} onClick={refresh} title="Refresh cloud data">
            <span className="connection-dot" />{offline ? "Offline cache" : "Cloud synced"}
          </button>
          <button className="icon-btn" onClick={refresh} title="Refresh"><RefreshCw size={17} className={busy ? "spin" : ""} /></button>
          <button className="icon-btn" onClick={() => setView("billing")} title="Announcements and billing"><Bell size={17} /></button>
        </div>
      </header>

      <div className="page-content">
        {error && <div className="global-alert error"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
        {notice && <div className="global-alert success"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}
        {offline && <div className="offline-banner"><AlertTriangle size={17} /><span>Offline read-only mode. Your last verified shop snapshot is displayed from encrypted local storage. Reconnect and refresh before making changes.</span></div>}
        {!snapshot && <LoginHint />}
        {view === "overview" && <OverviewPage cloud={cloud} snapshot={snapshot} revenueToday={revenueToday} profitToday={profitToday} stockCost={stockCost} receivables={receivables} lowStock={lowStock} onNavigate={setView} />}
        {view === "checkout" && <CheckoutPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} busy={busy} />}
        {view === "products" && <ProductsPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} query={search} />}
        {view === "sales" && <SalesPage snapshot={snapshot} query={search} />}
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
        {view === "settings" && <SettingsPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} />}
        <footer className="app-footer"><span>BeBoss Desktop · Version {window.beBossDesktop.version}</span><span>Last cloud snapshot {dateTime(cloud.snapshotUpdatedAt)} · {cloud.verifiedChunks} verified chunks</span></footer>
      </div>
    </main>
  </div>;
}

function OverviewPage({ cloud, snapshot, revenueToday, profitToday, stockCost, receivables, lowStock, onNavigate }: {
  cloud: CloudState; snapshot: Snapshot | null; revenueToday: number; profitToday: number;
  stockCost: number; receivables: number; lowStock: number; onNavigate: (view: NavKey) => void
}) {
  const sales = rows(snapshot?.sales).sort((a,b) => n(b.saleDate) - n(a.saleDate));
  const products = activeProducts(snapshot);
  const today = new Date(); today.setHours(0,0,0,0);
  const lastDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today.getTime() - (6 - i) * 86400000);
    const total = sales.filter((r) => new Date(n(r.saleDate)).toDateString() === day.toDateString()).reduce((sum,r) => sum + n(r.totalAmount),0);
    return { label: day.toLocaleDateString(undefined,{weekday:"short"}), total };
  });
  const maxDay = Math.max(1, ...lastDays.map((day) => day.total));
  const bestProducts = rows(snapshot?.saleItems).reduce((map, item) => {
    const key = s(item.productName) || "Product";
    map.set(key, (map.get(key) || 0) + n(item.quantitySold));
    return map;
  }, new Map<string, number>());
  const top = [...bestProducts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);

  return <div className="page-stack">
    <PageHeading eyebrow="SHOP PERFORMANCE" title={"Good " + (new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening") + ", " + (s(cloud.shop.owner_name).split(" ")[0] || "Owner")} description="Your business at a glance. These figures come from the latest verified shop snapshot." action={<button className="btn-primary" onClick={() => onNavigate("checkout")}><ShoppingCart size={17} /> New sale</button>} />
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
        <div className="health-foot"><span>Active terminals</span><strong>{rows(cloud.devices).filter((d)=>d.is_active).length}</strong></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">TOP MOVERS</span><h3>Best-selling products</h3></div><Tags size={18} className="muted-icon" /></div>
        {top.length ? <div className="rank-list">{top.map(([name,quantity],i)=><div className="rank-row" key={name}><span className="rank-num">{i+1}</span><span className="rank-name">{name}</span><strong>{quantity.toLocaleString()} units</strong></div>)}</div> : <Empty title="No product movement yet" description="Completed sales will build your product ranking." />}
      </section>
      <section className="panel span-2">
        <div className="panel-heading"><div><span className="eyebrow muted">RECENT ACTIVITY</span><h3>Latest sales</h3></div><button className="btn-outline small" onClick={() => onNavigate("sales")}>View ledger <ArrowUpRight size={14} /></button></div>
        <SalesTable sales={sales.slice(0,6)} />
      </section>
    </div>
  </div>;
}

function SalesTable({ sales }: { sales: Row[] }) {
  if (!sales.length) return <Empty title="No sales recorded" description="Sales made on a paired BeBoss terminal or this desktop appear here." icon={ShoppingBag} />;
  return <div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Cashier</th><th>Payment</th><th className="right">Total</th><th>Status</th></tr></thead><tbody>
    {sales.map((sale)=> <tr key={s(sale.id)}><td className="mono">{s(sale.receiptNumber)||s(sale.id).slice(0,8)}</td><td>{dateTime(sale.saleDate)}</td><td>{s(sale.customerName)||"Walk-in"}</td><td>{s(sale.cashierName)||"—"}</td><td>{s(sale.paymentMethod)||"—"}</td><td className="right strong">{money(sale.totalAmount)}</td><td><StatusPill value={s(sale.paymentStatus)||"PAID"} /></td></tr>)}
  </tbody></table></div>;
}

function productsForExport(snapshot:Snapshot|null) { return activeProducts(snapshot); }

function ProductsPage({ snapshot, onCommit, offline, query }: {
  snapshot: Snapshot | null; onCommit: (mutator:(next:Snapshot)=>void)=>Promise<void>; offline:boolean; query:string
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState({ name:"", category:"General", barcode:"", costPrice:"", sellingPrice:"", quantityInStock:"0", lowStockThreshold:"5", unit:"pcs", branchId:"main_branch" });
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const list = activeProducts(snapshot).filter((p)=> {
    const q = query.trim().toLowerCase();
    const fitsQuery = !q || [p.name,p.barcode,p.category].some((v)=>s(v).toLowerCase().includes(q));
    const fitsFilter = filter === "ALL" || (filter === "LOW" && n(p.quantityInStock) <= n(p.lowStockThreshold)) || (filter === "OUT" && n(p.quantityInStock) <= 0);
    return fitsQuery && fitsFilter;
  });
  const branches = rows(snapshot?.branches).filter((b)=>b.isActive !== false);

  function startEdit(product?: Row) {
    const p = product ?? {};
    setEditing(product ?? null);
    setDraft({
      name:s(p.name), category:s(p.category)||"General", barcode:s(p.barcode),
      costPrice:String(p.costPrice ?? ""), sellingPrice:String(p.sellingPrice ?? ""),
      quantityInStock:String(p.quantityInStock ?? 0), lowStockThreshold:String(p.lowStockThreshold ?? 5),
      unit:s(p.unit)||"pcs", branchId:s(p.branchId)||"main_branch"
    });
    setOpen(true);
  }
  async function save(event:React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      if (!draft.name.trim()) throw new Error("Product name is required.");
      const now=Date.now();
      const product = {
        id: editing ? s(editing.id) : id(), name:draft.name.trim(), category:draft.category.trim()||"General",
        barcode:draft.barcode.trim(), costPrice:Math.max(0,n(draft.costPrice)), sellingPrice:Math.max(0,n(draft.sellingPrice)),
        quantityInStock:Math.max(0,n(draft.quantityInStock)), lowStockThreshold:Math.max(0,n(draft.lowStockThreshold)),
        unit:draft.unit, branchId:draft.branchId, isDeleted:false,
        createdAt:editing ? n(editing.createdAt)||now : now, updatedAt:now,
        syncVersion:(editing ? n(editing.syncVersion) : 0)+1, hlcTimestamp:now<<16, lastModifiedDeviceId:"DESKTOP"
      };
      await onCommit((next)=> {
        const at=next.products.findIndex((p)=>s(p.id)===product.id);
        if(at>=0) next.products[at]=product; else next.products.unshift(product);
        next.tombstones=next.tombstones.filter((t)=>!(s(t.tableName)==="products"&&s(t.recordId)===product.id));
      });
      setOpen(false);
    } finally { setBusy(false); }
  }
  async function remove(product:Row) {
    if(!confirm("Deactivate " + s(product.name) + "? Historical sales will be kept.")) return;
    const now=Date.now();
    await onCommit((next)=>{
      const target=next.products.find((p)=>s(p.id)===s(product.id));
      if(target) { target.isDeleted=true; target.updatedAt=now; target.hlcTimestamp=now<<16; target.lastModifiedDeviceId="DESKTOP"; }
      next.tombstones.push({id:"products:"+s(product.id),tableName:"products",recordId:s(product.id),deletedAt:now,hlcTimestamp:now<<16,deletedByDeviceId:"DESKTOP"});
    });
  }
  async function importProducts(event:React.ChangeEvent<HTMLInputElement>) {
    const input=event.currentTarget;
    const file=input.files?.[0];
    if(!file) return;
    setImporting(true);
    try {
      if(file.size>5*1024*1024) throw new Error("Choose a CSV file smaller than 5 MB.");
      const matrix=parseCsv(await file.text());
      if(matrix.length<2) throw new Error("The CSV has no product rows.");
      const headers=matrix[0]!.map((value)=>value.replace(/^\\uFEFF/,"").trim().toLowerCase());
      const column=(...names:string[])=>headers.findIndex((header)=>names.includes(header));
      const nameIndex=column("name","product","productname","product_name");
      const priceIndex=column("sellingprice","selling_price","price");
      if(nameIndex<0||priceIndex<0) throw new Error("CSV must include name and sellingPrice columns.");
      const get=(cells:string[],...names:string[])=>{
        const at=column(...names);
        return at>=0?String(cells[at]??"").trim():"";
      };
      const numeric=(value:string,label:string,defaultValue:number)=>{
        if(value==="") return defaultValue;
        const parsed=Number(value);
        if(!Number.isFinite(parsed)||parsed<0) throw new Error("Invalid "+label+" value in CSV.");
        return parsed;
      };
      const records=matrix.slice(1).filter((cells)=>cells.some((cell)=>cell.trim()!==""));
      if(records.length>100000) throw new Error("A single CSV import is limited to 100,000 product rows.");
      let imported=0;
      const now=Date.now();
      await onCommit((next)=>{
        for(const cells of records){
          const name=get(cells,"name","product","productname","product_name");
          if(!name) continue;
          const barcode=get(cells,"barcode","sku");
          const branchRaw=get(cells,"branchid","branch_id");
          const branchId=branchRaw==="main_branch"||branches.some((branch)=>s(branch.id)===branchRaw)?branchRaw:"main_branch";
          const existing=next.products.find((product)=>
            (barcode&&s(product.barcode)===barcode)||
            (!barcode&&s(product.name).trim().toLowerCase()===name.toLowerCase()&&s(product.branchId||"main_branch")===branchId)
          );
          const productId=existing?s(existing.id):(get(cells,"id")||id());
          const product={
            id:productId,name,category:get(cells,"category")||"General",barcode,
            costPrice:numeric(get(cells,"costprice","cost_price"),"cost price",n(existing?.costPrice)),
            sellingPrice:numeric(get(cells,"sellingprice","selling_price","price"),"selling price",0),
            quantityInStock:numeric(get(cells,"quantityinstock","quantity_in_stock","quantity","stock"),"stock",n(existing?.quantityInStock)),
            lowStockThreshold:numeric(get(cells,"lowstockthreshold","low_stock_threshold","reorderlevel","reorder_level"),"reorder threshold",5),
            unit:get(cells,"unit")||"pcs",branchId,isDeleted:false,
            createdAt:existing?n(existing.createdAt)||now:now,updatedAt:now,
            syncVersion:(existing?n(existing.syncVersion):0)+1,hlcTimestamp:now<<16,lastModifiedDeviceId:"DESKTOP"
          };
          const at=next.products.findIndex((row)=>s(row.id)===product.id);
          if(at>=0) next.products[at]=product; else next.products.unshift(product);
          next.tombstones=next.tombstones.filter((t)=>!(s(t.tableName)==="products"&&s(t.recordId)===product.id));
          imported++;
        }
      });
      if(imported===0) throw new Error("No usable product rows were found in the CSV.");
      alert(imported+" products imported and synchronized to the shop.");
    } catch(error) {
      alert(errorText(error));
    } finally {
      setImporting(false);
      input.value="";
    }
  }

  return <div className="page-stack">
    <PageHeading title="Inventory management" description="Control product catalogue, stock valuation, pricing and reorder levels." action={<div className="heading-actions"><button className="btn-outline" disabled={!snapshot} onClick={()=>downloadCsv("beboss-products-"+Date.now()+".csv",["id","name","category","barcode","costPrice","sellingPrice","quantityInStock","lowStockThreshold","unit","branchId"],productsForExport(snapshot))}><Download size={15}/> Export CSV</button><button className="btn-outline" disabled={offline||importing} onClick={()=>fileInput.current?.click()}><Download size={15}/>{importing?"Importing…":"Import CSV"}</button><button className="btn-primary" onClick={()=>startEdit()} disabled={offline}><Plus size={17}/> Add product</button><input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={importProducts}/></div>} />
    <div className="toolbar"><div className="filter-tabs">{[["ALL","All products"],["LOW","Low stock"],["OUT","Out of stock"]].map(([key,label])=><button key={key} className={filter===key?"active":""} onClick={()=>setFilter(key)}>{label}</button>)}</div><span className="muted">{list.length} products shown</span></div>
    {!snapshot ? <Empty title="Shop data is not initialized" description="Sync the registered Android terminal to load the real product catalogue."/> :
    list.length ? <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Product</th><th>Barcode</th><th>Category</th><th>Stock</th><th>Cost</th><th>Selling price</th><th>Margin</th><th></th></tr></thead><tbody>
      {list.map((p)=><tr key={s(p.id)}><td><div className="product-cell"><span className="product-icon"><Package size={16}/></span><div><strong>{s(p.name)}</strong><small>{s(p.unit)||"pcs"} · {s(p.branchId)||"Main branch"}</small></div></div></td><td className="mono">{s(p.barcode)||"—"}</td><td>{s(p.category)}</td><td><span className={"stock-value "+(n(p.quantityInStock)<=0?"negative":n(p.quantityInStock)<=n(p.lowStockThreshold)?"warning":"")}>{n(p.quantityInStock).toLocaleString()} {s(p.unit)}</span></td><td>{money(p.costPrice)}</td><td className="strong">{money(p.sellingPrice)}</td><td>{money(n(p.sellingPrice)-n(p.costPrice))}</td><td><div className="row-actions"><button className="icon-btn" title="Edit product" onClick={()=>startEdit(p)} disabled={offline}><Pencil size={15}/></button><button className="icon-btn danger-icon" title="Deactivate product" onClick={()=>remove(p)} disabled={offline}><Trash2 size={15}/></button></div></td></tr>)}
    </tbody></table></div></div> : <Empty title="No matching products" description="Try another filter or add a product to your catalogue."/>}
    {open && <Modal title={editing?"Edit product":"Add product"} onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={save}>
      <label className="field-wide">Product name<input required maxLength={160} value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})}/></label>
      <label>Category<input value={draft.category} maxLength={80} onChange={(e)=>setDraft({...draft,category:e.target.value})}/></label>
      <label>Barcode<input value={draft.barcode} maxLength={80} onChange={(e)=>setDraft({...draft,barcode:e.target.value})}/></label>
      <label>Cost price (FRw)<input type="number" min="0" step="1" value={draft.costPrice} onChange={(e)=>setDraft({...draft,costPrice:e.target.value})}/></label>
      <label>Selling price (FRw)<input type="number" min="0" step="1" value={draft.sellingPrice} onChange={(e)=>setDraft({...draft,sellingPrice:e.target.value})}/></label>
      <label>Stock quantity<input type="number" min="0" step="0.001" value={draft.quantityInStock} onChange={(e)=>setDraft({...draft,quantityInStock:e.target.value})}/></label>
      <label>Low-stock threshold<input type="number" min="0" step="0.001" value={draft.lowStockThreshold} onChange={(e)=>setDraft({...draft,lowStockThreshold:e.target.value})}/></label>
      <label>Unit<select value={draft.unit} onChange={(e)=>setDraft({...draft,unit:e.target.value})}>{["pcs","kg","g","litre","ml","pack","box","bottle","m","pair","set"].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Branch<select value={draft.branchId} onChange={(e)=>setDraft({...draft,branchId:e.target.value})}><option value="main_branch">Main branch</option>{branches.map((b)=><option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label>
      <div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>}Save product</button></div>
    </form></Modal>}
  </div>;
}

function CheckoutPage({ snapshot, onCommit, offline, busy }: {
  snapshot:Snapshot|null; onCommit:(mutator:(next:Snapshot)=>void)=>Promise<void>; offline:boolean; busy:boolean
}) {
  const products=activeProducts(snapshot);
  const customers=activeCustomers(snapshot);
  const [search,setSearch]=useState("");
  const [customerId,setCustomerId]=useState("");
  const [payment,setPayment]=useState("CASH");
  const [discount,setDiscount]=useState("0");
  const [amountPaid,setAmountPaid]=useState("");
  const [cart,setCart]=useState<{product:Row;quantity:number}[]>([]);
  const [notes,setNotes]=useState("");
  const [done,setDone]=useState("");
  const filtered=products.filter((p)=>[p.name,p.barcode,p.category].some((v)=>s(v).toLowerCase().includes(search.toLowerCase())));
  const subtotal=cart.reduce((sum,item)=>sum+n(item.product.sellingPrice)*item.quantity,0);
  const discountAmount=Math.max(0,Math.min(subtotal,n(discount)));
  const total=Math.max(0,subtotal-discountAmount);
  const paid=payment==="DEBT"?0:amountPaid===""?total:Math.max(0,n(amountPaid));
  const debt=Math.max(0,total-paid);
  const selectedCustomer=customers.find((c)=>s(c.id)===customerId);

  function add(product:Row) {
    if(n(product.quantityInStock)<=0) return;
    setCart((old)=>{
      const exists=old.find((item)=>s(item.product.id)===s(product.id));
      if(exists) return old.map((item)=>s(item.product.id)===s(product.id)?{...item,quantity:Math.min(n(product.quantityInStock),item.quantity+1)}:item);
      return [...old,{product,quantity:1}];
    });
  }
  async function completeSale() {
    if(!cart.length) throw new Error("Add at least one product to the cart.");
    if(payment==="DEBT"&&!selectedCustomer) throw new Error("Select a customer before creating a credit sale.");
    if(debt>0&&!selectedCustomer) throw new Error("Select a customer or collect the full sale amount.");
    if(selectedCustomer&&debt+n(selectedCustomer.debtBalance)>n(selectedCustomer.creditLimit)) throw new Error("This sale would exceed the customer's credit limit.");
    const now=Date.now();
    const saleId=id();
    const receiptNumber="BB-"+now.toString().slice(-10);
    const items=cart.map((item)=>({
      id:id(),saleId,productId:s(item.product.id),productName:s(item.product.name),category:s(item.product.category),
      unit:s(item.product.unit)||"pcs",quantitySold:item.quantity,costPriceAtSale:n(item.product.costPrice),
      unitPriceAtSale:n(item.product.sellingPrice),subtotal:n(item.product.sellingPrice)*item.quantity,
      profit:(n(item.product.sellingPrice)-n(item.product.costPrice))*item.quantity,branchId:s(item.product.branchId)||"main_branch"
    }));
    const totalCost=items.reduce((sum,item)=>sum+item.costPriceAtSale*item.quantitySold,0);
    const sale={
      id:saleId,customerId:customerId||null,customerName:selectedCustomer?s(selectedCustomer.name):"Walk-in Customer",
      saleDate:now,totalAmount:total,totalCost,totalProfit:total-totalCost,discountAmount,
      paymentMethod:payment,paymentStatus:debt<=0.01?"PAID":paid>0?"PARTIAL":"UNPAID",
      amountPaid:Math.min(total,paid),notes:notes.trim(),receiptNumber,
      branchId:s(cart[0]?.product.branchId)||"main_branch",branchName:"",cashierId:"DESKTOP",
      cashierName:"Desktop Owner",synced:false,updatedAt:now,syncVersion:1,hlcTimestamp:now<<16,lastModifiedDeviceId:"DESKTOP"
    };
    await onCommit((next)=>{
      next.sales.unshift(sale);
      next.saleItems.push(...items);
      for(const item of items) {
        const p=next.products.find((product)=>s(product.id)===item.productId);
        if(p) { p.quantityInStock=Math.max(0,n(p.quantityInStock)-item.quantitySold);p.updatedAt=now;p.hlcTimestamp=now<<16;p.syncVersion=n(p.syncVersion)+1;p.lastModifiedDeviceId="DESKTOP"; }
      }
      if(selectedCustomer && debt>0) {
        const c=next.customers.find((customer)=>s(customer.id)===customerId);
        if(c) {
          c.debtBalance=n(c.debtBalance)+debt;
          c.updatedAt=now;
          c.hlcTimestamp=now<<16;
          c.syncVersion=n(c.syncVersion)+1;
          c.lastModifiedDeviceId="DESKTOP";
        }
      }
    });
    setDone(receiptNumber);setCart([]);setDiscount("0");setAmountPaid("");setNotes("");
  }

  return <div className="page-stack">
    <PageHeading eyebrow="POINT OF SALE" title="New sale" description="Search the shop catalogue, add products, collect payment and post a sale to the shared BeBoss ledger." action={<span className="secure-label"><ShieldCheck size={15}/> Online, owner-authorized checkout</span>} />
    {!snapshot?<Empty title="No verified product catalogue" description="Sync the shop's Android terminal before starting desktop sales."/>:<div className="pos-layout">
      <section className="pos-products">
        <div className="pos-search"><Search size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search product or scan a barcode…"/></div>
        <div className="product-grid">{filtered.map((p)=><button key={s(p.id)} className="product-tile" onClick={()=>add(p)} disabled={offline||n(p.quantityInStock)<=0}>
          <span className="tile-image"><Package size={22}/></span><strong>{s(p.name)}</strong><small>{s(p.category)} · {n(p.quantityInStock)} {s(p.unit)||"pcs"} left</small><b>{money(p.sellingPrice)}</b>
        </button>)}</div>
        {!filtered.length&&<Empty title="No products found" description="Change your search term or scan another barcode."/>}
      </section>
      <section className="pos-cart panel">
        <div className="panel-heading"><div><span className="eyebrow muted">CURRENT ORDER</span><h3>Cart ({cart.length})</h3></div><button className="text-btn" onClick={()=>setCart([])} disabled={!cart.length}>Clear cart</button></div>
        <div className="cart-lines">{cart.map((item)=><div className="cart-line" key={s(item.product.id)}>
          <div className="cart-info"><strong>{s(item.product.name)}</strong><small>{money(item.product.sellingPrice)} each</small></div>
          <div className="quantity-control"><button onClick={()=>setCart((old)=>old.map((x)=>s(x.product.id)===s(item.product.id)?{...x,quantity:Math.max(1,x.quantity-1)}:x))}>−</button><span>{item.quantity}</span><button onClick={()=>setCart((old)=>old.map((x)=>s(x.product.id)===s(item.product.id)?{...x,quantity:Math.min(n(x.product.quantityInStock),x.quantity+1)}:x))} disabled={item.quantity>=n(item.product.quantityInStock)}>+</button></div>
          <strong className="line-total">{money(n(item.product.sellingPrice)*item.quantity)}</strong>
        </div>)}
        {!cart.length&&<Empty title="Your cart is empty" description="Select products from the catalogue to begin." icon={ShoppingCart}/>}</div>
        <div className="checkout-fields">
          <label>Customer<select value={customerId} onChange={(e)=>setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.map((c)=><option key={s(c.id)} value={s(c.id)}>{s(c.name)} · Due {money(c.debtBalance)}</option>)}</select></label>
          <div className="field-pair"><label>Discount (FRw)<input type="number" min="0" max={subtotal} value={discount} onChange={(e)=>setDiscount(e.target.value)}/></label><label>Payment method<select value={payment} onChange={(e)=>setPayment(e.target.value)}>{[["CASH","Cash"],["MOMO","MTN MoMo"],["AIRTEL","Airtel Money"],["CARD","Card"],["DEBT","Customer credit"]].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label></div>
          {payment!=="DEBT"&&<label>Amount received (FRw)<input type="number" min="0" value={amountPaid} onChange={(e)=>setAmountPaid(e.target.value)} placeholder={String(total)}/></label>}
          <label>Sale notes<input value={notes} onChange={(e)=>setNotes(e.target.value)} maxLength={500} placeholder="Optional cashier note"/></label>
          <div className="totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Discount</span><strong>− {money(discountAmount)}</strong></div><div className="grand-total"><span>Total</span><strong>{money(total)}</strong></div><div><span>Received</span><strong>{money(paid)}</strong></div>{debt>0&&<div className="due-row"><span>Customer balance due</span><strong>{money(debt)}</strong></div>}</div>
          <button className="btn-primary full" disabled={offline||busy||!cart.length} onClick={()=>completeSale().catch((e)=>alert(errorText(e)))}><Check size={18}/>{busy?"Saving sale…":"Complete sale"}</button>
          {done&&<div className="sale-complete"><Check size={17}/><span>Sale saved · receipt {done}</span><button onClick={()=>window.print()}><Printer size={15}/> Print</button></div>}
        </div>
      </section>
    </div>}
  </div>;
}

function SalesPage({ snapshot, query }: { snapshot:Snapshot|null; query:string }) {
  const list=rows(snapshot?.sales).sort((a,b)=>n(b.saleDate)-n(a.saleDate)).filter((sale)=>[sale.receiptNumber,sale.customerName,sale.cashierName,sale.paymentMethod].some((v)=>s(v).toLowerCase().includes(query.toLowerCase())));
  const total=list.reduce((sum,sale)=>sum+n(sale.totalAmount),0);
  return <div className="page-stack"><PageHeading title="Sales ledger" description="A complete, searchable register of sales synchronized from all shop terminals." action={<div className="heading-actions"><button className="btn-outline" onClick={()=>downloadCsv("beboss-sales-"+Date.now()+".csv",["receiptNumber","saleDate","customerName","cashierName","paymentMethod","paymentStatus","amountPaid","totalAmount","totalCost","totalProfit","discountAmount","branchId"],list)}><Download size={15}/> Export CSV</button><button className="btn-outline" onClick={()=>window.print()}><Printer size={16}/> Print ledger</button></div>}/>
    <div className="stat-grid three"><StatCard label="Transactions" value={list.length.toLocaleString()} icon={ShoppingBag}/><StatCard label="Gross sales" value={money(total)} icon={CircleDollarSign} tone="green"/><StatCard label="Average order" value={money(list.length?total/list.length:0)} icon={Activity} tone="purple"/></div>
    <div className="panel table-panel"><SalesTable sales={list}/></div>
  </div>;
}

function CustomersPage({ snapshot, onCommit, offline, query }: {
  snapshot:Snapshot|null; onCommit:(mutator:(next:Snapshot)=>void)=>Promise<void>; offline:boolean; query:string
}) {
  const [open,setOpen]=useState(false);
  const [paymentTarget,setPaymentTarget]=useState<Row|null>(null);
  const [draft,setDraft]=useState({name:"",phone:"",email:"",address:"",creditLimit:"500000",notes:""});
  const [payment,setPayment]=useState({amount:"",method:"Cash",notes:""});
  const list=activeCustomers(snapshot).filter((c)=>[c.name,c.phone,c.email].some((v)=>s(v).toLowerCase().includes(query.toLowerCase())));
  function openCustomer(c?:Row) {
    setDraft({name:s(c?.name),phone:s(c?.phone),email:s(c?.email),address:s(c?.address),creditLimit:String(c?.creditLimit??500000),notes:s(c?.notes)});
    setOpen(true);
  }
  async function saveCustomer(e:React.FormEvent) {
    e.preventDefault();
    if(!draft.name.trim()) throw new Error("Customer name is required.");
    const now=Date.now();
    const customer={
      id:id(),name:draft.name.trim(),phone:draft.phone.trim(),email:draft.email.trim(),address:draft.address.trim(),
      city:"",taxIdOrNin:"",category:"Regular Customer",creditLimit:Math.max(0,n(draft.creditLimit)),notes:draft.notes.trim(),
      debtBalance:0,isDeleted:false,createdAt:now,updatedAt:now,syncVersion:1,hlcTimestamp:now<<16,lastModifiedDeviceId:"DESKTOP"
    };
    await onCommit((next)=>next.customers.unshift(customer));
    setOpen(false);
  }
  async function collect(e:React.FormEvent) {
    e.preventDefault();
    const target=paymentTarget!;
    const amount=n(payment.amount);
    if(amount<=0||amount>n(target.debtBalance)) throw new Error("Enter a payment greater than zero and no larger than the outstanding debt.");
    const now=Date.now();
    await onCommit((next)=>{
      const c=next.customers.find((row)=>s(row.id)===s(target.id));
      if(!c) throw new Error("The customer record changed. Refresh and retry.");
      const previous=n(c.debtBalance);
      c.debtBalance=Math.max(0,previous-amount);c.updatedAt=now;c.hlcTimestamp=now<<16;c.syncVersion=n(c.syncVersion)+1;c.lastModifiedDeviceId="DESKTOP";
      next.customerPayments.unshift({id:id(),customerId:s(c.id),customerName:s(c.name),amount,previousDebt:previous,remainingDebt:c.debtBalance,
        paymentMethod:payment.method,notes:payment.notes.trim(),receiptNumber:"PAY-"+now.toString().slice(-8),paymentDate:now,
        recordedBy:"Desktop Owner",branchId:"main_branch",branchName:"Main Branch"});
    });
    setPaymentTarget(null);setPayment({amount:"",method:"Cash",notes:""});
  }

  return <div className="page-stack"><PageHeading title="Customers & credit" description="Manage customer contacts, credit limits, receivables and payment collection." action={<div className="heading-actions"><button className="btn-outline" onClick={()=>downloadCsv("beboss-customers-"+Date.now()+".csv",["id","name","phone","email","address","category","creditLimit","debtBalance","notes"],list)}><Download size={15}/> Export CSV</button><button className="btn-primary" onClick={()=>openCustomer()} disabled={offline}><Plus size={17}/> Add customer</button></div>}/>
    <div className="stat-grid three"><StatCard label="Customers" value={list.length.toLocaleString()} icon={Users}/><StatCard label="Outstanding credit" value={money(list.reduce((sum,c)=>sum+n(c.debtBalance),0))} icon={Wallet} tone="orange"/><StatCard label="Over credit limit" value={String(list.filter((c)=>n(c.creditLimit)>0&&n(c.debtBalance)>n(c.creditLimit)).length)} icon={AlertTriangle} tone="red"/></div>
    <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Credit limit</th><th>Outstanding</th><th>Utilization</th><th>Last updated</th><th></th></tr></thead><tbody>
      {list.map((c)=>{const due=n(c.debtBalance),limit=n(c.creditLimit);return <tr key={s(c.id)}><td><strong>{s(c.name)}</strong><small className="cell-sub">{s(c.email)}</small></td><td>{s(c.phone)||"—"}</td><td>{money(limit)}</td><td className="strong">{money(due)}</td><td><div className="util-bar"><span style={{width:(limit>0?Math.min(100,due/limit*100):0)+"%"}}/></div><small>{limit>0?Math.round(due/limit*100)+"%":"No credit limit"}</small></td><td>{dateOnly(c.updatedAt)}</td><td>{due>0&&<button className="btn-outline small" disabled={offline} onClick={()=>setPaymentTarget(c)}>Collect</button>}</td></tr>})}
    </tbody></table></div>{!list.length&&<Empty title="No customer records" description="Customers created on BeBoss terminals will synchronize here."/>}</div>
    {open&&<Modal title="Add customer" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={(e)=>saveCustomer(e).catch((x)=>alert(errorText(x)))}><label className="field-wide">Customer name<input required value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})}/></label><label>Phone<input value={draft.phone} onChange={(e)=>setDraft({...draft,phone:e.target.value})}/></label><label>Email<input type="email" value={draft.email} onChange={(e)=>setDraft({...draft,email:e.target.value})}/></label><label className="field-wide">Address<input value={draft.address} onChange={(e)=>setDraft({...draft,address:e.target.value})}/></label><label>Credit limit (FRw)<input type="number" min="0" value={draft.creditLimit} onChange={(e)=>setDraft({...draft,creditLimit:e.target.value})}/></label><label className="field-wide">Notes<input value={draft.notes} onChange={(e)=>setDraft({...draft,notes:e.target.value})}/></label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary"><Check size={16}/>Save customer</button></div></form></Modal>}
    {paymentTarget&&<Modal title={"Collect from "+s(paymentTarget.name)} onClose={()=>setPaymentTarget(null)}><form className="form-grid" onSubmit={(e)=>collect(e).catch((x)=>alert(errorText(x)))}><div className="field-wide debt-summary"><span>Outstanding debt</span><strong>{money(paymentTarget.debtBalance)}</strong></div><label>Amount received (FRw)<input type="number" min="1" max={n(paymentTarget.debtBalance)} required value={payment.amount} onChange={(e)=>setPayment({...payment,amount:e.target.value})}/></label><label>Payment method<select value={payment.method} onChange={(e)=>setPayment({...payment,method:e.target.value})}>{["Cash","MTN MoMo","Airtel Money","Bank","Card"].map(v=><option key={v}>{v}</option>)}</select></label><label className="field-wide">Reference / notes<input value={payment.notes} onChange={(e)=>setPayment({...payment,notes:e.target.value})}/></label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={()=>setPaymentTarget(null)}>Cancel</button><button className="btn-primary"><Wallet size={16}/>Record payment</button></div></form></Modal>}
  </div>;
}

function PurchasesPage({ snapshot, onCommit, offline }: {
  snapshot:Snapshot|null; onCommit:(mutator:(next:Snapshot)=>void)=>Promise<void>; offline:boolean
}) {
  const [form,setForm]=useState({productId:"",quantity:"1",unitCost:"",sellingPrice:"",supplier:"",supplierPhone:"",paymentStatus:"PAID_CASH",invoice:"",notes:""});
  const products=activeProducts(snapshot);
  const purchases=rows(snapshot?.purchases).sort((a,b)=>n(b.purchaseDate)-n(a.purchaseDate));
  async function record(e:React.FormEvent) {
    e.preventDefault();
    const p=products.find((x)=>s(x.id)===form.productId);
    const quantity=n(form.quantity),unitCost=n(form.unitCost);
    if(!p||quantity<=0||unitCost<0) throw new Error("Choose a product and a valid purchase quantity/cost.");
    const now=Date.now();
    const purchase={
      id:id(),productId:s(p.id),productName:s(p.name),category:s(p.category),supplierName:form.supplier.trim()||"Direct Supplier",
      supplierPhone:form.supplierPhone.trim(),quantityPurchased:quantity,unitCostPrice:unitCost,totalPurchaseCost:quantity*unitCost,
      sellingPriceAtPurchase:n(form.sellingPrice)||n(p.sellingPrice),paymentStatus:form.paymentStatus,invoiceNumber:form.invoice.trim(),
      branchId:s(p.branchId)||"main_branch",branchName:"Main Store",purchasedByUserId:"DESKTOP",purchasedByName:"Desktop Owner",
      notes:form.notes.trim(),purchaseDate:now,isSynced:false,createdAt:now
    };
    await onCommit((next)=>{
      next.purchases.unshift(purchase);
      const product=next.products.find((x)=>s(x.id)===s(p.id));
      if(product){product.quantityInStock=n(product.quantityInStock)+quantity;product.costPrice=unitCost;product.sellingPrice=purchase.sellingPriceAtPurchase;product.updatedAt=now;product.hlcTimestamp=now<<16;product.syncVersion=n(product.syncVersion)+1;product.lastModifiedDeviceId="DESKTOP";}
    });
    setForm({productId:"",quantity:"1",unitCost:"",sellingPrice:"",supplier:"",supplierPhone:"",paymentStatus:"PAID_CASH",invoice:"",notes:""});
  }
  return <div className="page-stack"><PageHeading title="Purchasing & suppliers" description="Record supplier purchases and update stock quantity and product cost in one saved transaction." action={<button className="btn-outline" onClick={()=>downloadCsv("beboss-purchases-"+Date.now()+".csv",["id","invoiceNumber","purchaseDate","productId","productName","supplierName","supplierPhone","quantityPurchased","unitCostPrice","totalPurchaseCost","paymentStatus","branchId","purchasedByName"],purchases)}><Download size={15}/> Export CSV</button>}/>
    <div className="panel purchase-form"><div className="panel-heading"><div><span className="eyebrow muted">STOCK INFLOW</span><h3>Record a purchase</h3></div><Truck size={19} className="muted-icon"/></div>
      {!products.length?<Empty title="Add products first" description="Purchases are linked to existing catalogue products."/>:<form className="form-grid" onSubmit={(e)=>record(e).catch((x)=>alert(errorText(x)))}>
        <label className="field-wide">Product<select required value={form.productId} onChange={(e)=>{const p=products.find((x)=>s(x.id)===e.target.value);setForm({...form,productId:e.target.value,unitCost:p?String(p.costPrice):"",sellingPrice:p?String(p.sellingPrice):""})}}><option value="">Choose product</option>{products.map((p)=><option key={s(p.id)} value={s(p.id)}>{s(p.name)} · {n(p.quantityInStock)} in stock</option>)}</select></label>
        <label>Quantity<input type="number" min="0.001" step="0.001" value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})}/></label><label>Unit cost (FRw)<input type="number" min="0" value={form.unitCost} onChange={(e)=>setForm({...form,unitCost:e.target.value})}/></label>
        <label>New selling price (FRw)<input type="number" min="0" value={form.sellingPrice} onChange={(e)=>setForm({...form,sellingPrice:e.target.value})}/></label><label>Supplier name<input value={form.supplier} onChange={(e)=>setForm({...form,supplier:e.target.value})}/></label>
        <label>Supplier phone<input value={form.supplierPhone} onChange={(e)=>setForm({...form,supplierPhone:e.target.value})}/></label><label>Payment status<select value={form.paymentStatus} onChange={(e)=>setForm({...form,paymentStatus:e.target.value})}>{["PAID_CASH","PAID_MOMO","PAID_BANK","SUPPLIER_CREDIT"].map(v=><option key={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
        <label>Invoice number<input value={form.invoice} onChange={(e)=>setForm({...form,invoice:e.target.value})}/></label><label className="field-wide">Notes<input value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label>
        <div className="form-footer field-wide"><span>Purchase total <strong>{money(n(form.quantity)*n(form.unitCost))}</strong></span><button className="btn-primary" disabled={offline}><Plus size={16}/> Save purchase & update stock</button></div>
      </form>}
    </div>
    <div className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">PURCHASE HISTORY</span><h3>{purchases.length} recorded purchases</h3></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Invoice</th><th>Product</th><th>Supplier</th><th>Quantity</th><th>Total cost</th><th>Status</th></tr></thead><tbody>
      {purchases.map((p)=><tr key={s(p.id)}><td>{dateOnly(p.purchaseDate)}</td><td className="mono">{s(p.invoiceNumber)||"—"}</td><td>{s(p.productName)}</td><td>{s(p.supplierName)}</td><td>{n(p.quantityPurchased)} {s(p.unit)||"pcs"}</td><td className="strong">{money(p.totalPurchaseCost)}</td><td><StatusPill value={s(p.paymentStatus)||"PAID"}/></td></tr>)}
    </tbody></table></div>{!purchases.length&&<Empty title="No purchases recorded" description="Purchase records are synchronized with the mobile app."/>}</div>
  </div>;
}

function ReportsPage({ snapshot }: { snapshot:Snapshot|null }) {
  const sales=rows(snapshot?.sales);
  const items=rows(snapshot?.saleItems);
  const revenue=sales.reduce((sum,sale)=>sum+n(sale.totalAmount),0);
  const cost=sales.reduce((sum,sale)=>sum+n(sale.totalCost),0);
  const profit=sales.reduce((sum,sale)=>sum+n(sale.totalProfit),0);
  const methods=new Map<string,number>();
  for(const sale of sales){const key=s(sale.paymentMethod)||"OTHER";methods.set(key,(methods.get(key)||0)+n(sale.totalAmount));}
  const staff=new Map<string,{revenue:number;count:number}>();
  for(const sale of sales){const key=s(sale.cashierName)||"Unknown";const old=staff.get(key)||{revenue:0,count:0};old.revenue+=n(sale.totalAmount);old.count++;staff.set(key,old);}
  const top=new Map<string,{qty:number;revenue:number}>();
  for(const item of items){const key=s(item.productName)||"Product";const old=top.get(key)||{qty:0,revenue:0};old.qty+=n(item.quantitySold);old.revenue+=n(item.subtotal);top.set(key,old);}
  const values=[...methods.entries()].sort((a,b)=>b[1]-a[1]);
  const topProducts=[...top.entries()].sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,8);
  const topStaff=[...staff.entries()].sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,8);
  return <div className="page-stack"><PageHeading title="Reports & insights" description="Sales performance, gross margin, payment distribution and cashier output, calculated from the verified shop records." action={<button className="btn-outline" onClick={()=>window.print()}><Printer size={16}/> Print report</button>}/>
    <div className="stat-grid four"><StatCard label="Lifetime revenue" value={money(revenue)} icon={Wallet}/><StatCard label="Cost of goods sold" value={money(cost)} icon={Boxes} tone="orange"/><StatCard label="Gross profit" value={money(profit)} icon={ArrowUpRight} tone="green"/><StatCard label="Gross margin" value={(revenue>0?profit/revenue*100:0).toFixed(1)+"%"} icon={Activity} tone="purple"/></div>
    <div className="report-grid">
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">PAYMENT MIX</span><h3>Revenue by payment method</h3></div></div>{values.length?values.map(([method,amount])=><div className="metric-row" key={method}><div><strong>{method.replaceAll("_"," ")}</strong><small>{revenue?Math.round(amount/revenue*100):0}% of revenue</small></div><div className="metric-track"><span style={{width:(revenue?amount/revenue*100:0)+"%"}}/></div><b>{money(amount)}</b></div>):<Empty title="No payment records" description="Completed sales will appear in this report."/>}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow muted">PRODUCT PERFORMANCE</span><h3>Top products by revenue</h3></div></div>{topProducts.length?topProducts.map(([name,value],i)=><div className="rank-row" key={name}><span className="rank-num">{i+1}</span><span className="rank-name">{name}<small>{value.qty} units sold</small></span><strong>{money(value.revenue)}</strong></div>):<Empty title="No product performance data" description="Sales with line items build this ranking."/>}</section>
      <section className="panel span-2"><div className="panel-heading"><div><span className="eyebrow muted">CASHIER OUTPUT</span><h3>Sales by operator</h3></div></div><div className="table-wrap"><table><thead><tr><th>Cashier</th><th>Transactions</th><th>Average order</th><th>Total revenue</th></tr></thead><tbody>{topStaff.map(([name,value])=><tr key={name}><td><strong>{name}</strong></td><td>{value.count}</td><td>{money(value.revenue/value.count)}</td><td className="strong">{money(value.revenue)}</td></tr>)}</tbody></table></div>{!topStaff.length&&<Empty title="No cashier records" description="Sales are grouped by the operator saved with each transaction."/>}</section>
    </div>
  </div>;
}

function BranchesPage({ cloud, onAction, offline }: { cloud:CloudState; onAction:(action:any,payload:Row)=>Promise<Row>; offline:boolean }) {
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState<Row|null>(null);
  const [draft,setDraft]=useState({name:"",code:"",address:"",phone:"",managerName:"",isMainBranch:false,operationalStatus:"OPEN",dailySalesTargetRwf:"0",monthlyTargetRwf:"0",openingCashFloat:"0",email:"",notes:""});
  const list=rows(cloud.branches);
  function start(branch?:Row) {
    setEditing(branch??null);
    setDraft({
      name:s(branch?.name),code:s(branch?.code),address:s(branch?.address),phone:s(branch?.phone),managerName:s(branch?.manager_name),
      isMainBranch:branch?.is_main_branch===true,operationalStatus:s(branch?.operational_status)||"OPEN",
      dailySalesTargetRwf:String(branch?.daily_sales_target_rwf??0),monthlyTargetRwf:String(branch?.monthly_target_rwf??0),
      openingCashFloat:String(branch?.opening_cash_float??0),email:s(branch?.email),notes:s(branch?.notes)
    });
    setOpen(true);
  }
  async function save(e:React.FormEvent) {
    e.preventDefault();
    await onAction("branch_upsert",{branch:{
      id:editing?s(editing.id):id(),name:draft.name,code:draft.code,address:draft.address,phone:draft.phone,managerName:draft.managerName,
      isMainBranch:draft.isMainBranch,operationalStatus:draft.operationalStatus,dailySalesTargetRwf:n(draft.dailySalesTargetRwf),
      monthlyTargetRwf:n(draft.monthlyTargetRwf),openingCashFloat:n(draft.openingCashFloat),email:draft.email,notes:draft.notes,
      colorHex:s(editing?.color_hex)||"#FF6B1A",stockValueRwf:n(editing?.stock_value_rwf),productCount:n(editing?.product_count)
    }});
    setOpen(false);
  }
  async function deactivate(branch:Row) {
    if(!confirm("Deactivate branch "+s(branch.name)+"? Existing records remain in the shop history.")) return;
    await onAction("branch_delete",{id:s(branch.id)});
  }
  return <div className="page-stack"><PageHeading title="Branch management" description="Manage branch identity, daily and monthly targets, operational state and store details." action={<button className="btn-primary" disabled={offline} onClick={()=>start()}><Plus size={17}/> Add branch</button>}/>
    <div className="stat-grid three"><StatCard label="Branches" value={String(list.length)} icon={Building2}/><StatCard label="Operational" value={String(list.filter((b)=>b.is_active&&b.operational_status==="OPEN").length)} icon={Check} tone="green"/><StatCard label="Branch stock value" value={money(list.reduce((sum,b)=>sum+n(b.stock_value_rwf),0))} icon={Warehouse} tone="purple"/></div>
    <div className="branch-grid">{list.map((b)=><article className="branch-card" key={s(b.id)}><div className="branch-card-top"><span className="branch-symbol"><Store size={20}/></span><StatusPill value={s(b.operational_status)||"OPEN"}/></div><h3>{s(b.name)}</h3><span className="mono muted">{s(b.code)||"No branch code"}</span><p>{s(b.address)||"No address saved"}</p><div className="branch-metrics"><div><small>Daily target</small><strong>{money(b.daily_sales_target_rwf)}</strong></div><div><small>Stock value</small><strong>{money(b.stock_value_rwf)}</strong></div></div><div className="branch-card-foot"><span>{b.is_main_branch?"Main branch":s(b.manager_name)||"No manager"}</span><div><button className="icon-btn" disabled={offline} onClick={()=>start(b)}><Pencil size={15}/></button>{!b.is_main_branch&&<button className="icon-btn danger-icon" disabled={offline} onClick={()=>deactivate(b)}><Trash2 size={15}/></button>}</div></div></article>)}</div>
    {!list.length&&<Empty title="No branches in cloud" description="Create a branch or sync the Android owner terminal to load existing branches." icon={Building2}/>}
    {open&&<Modal title={editing?"Edit branch":"Create branch"} onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={(e)=>save(e).catch((x)=>alert(errorText(x)))}><label className="field-wide">Branch name<input required value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})}/></label><label>Branch code<input value={draft.code} onChange={(e)=>setDraft({...draft,code:e.target.value})}/></label><label>Manager name<input value={draft.managerName} onChange={(e)=>setDraft({...draft,managerName:e.target.value})}/></label><label>Phone<input value={draft.phone} onChange={(e)=>setDraft({...draft,phone:e.target.value})}/></label><label>Email<input type="email" value={draft.email} onChange={(e)=>setDraft({...draft,email:e.target.value})}/></label><label className="field-wide">Address<input value={draft.address} onChange={(e)=>setDraft({...draft,address:e.target.value})}/></label><label>Operating status<select value={draft.operationalStatus} onChange={(e)=>setDraft({...draft,operationalStatus:e.target.value})}>{["OPEN","CLOSED","SUSPENDED"].map(v=><option key={v}>{v}</option>)}</select></label><label>Daily sales target<input type="number" min="0" value={draft.dailySalesTargetRwf} onChange={(e)=>setDraft({...draft,dailySalesTargetRwf:e.target.value})}/></label><label>Monthly sales target<input type="number" min="0" value={draft.monthlyTargetRwf} onChange={(e)=>setDraft({...draft,monthlyTargetRwf:e.target.value})}/></label><label>Opening float<input type="number" min="0" value={draft.openingCashFloat} onChange={(e)=>setDraft({...draft,openingCashFloat:e.target.value})}/></label><label className="field-wide">Operational notes<input value={draft.notes} onChange={(e)=>setDraft({...draft,notes:e.target.value})}/></label><label className="checkbox-field field-wide"><input type="checkbox" checked={draft.isMainBranch} onChange={(e)=>setDraft({...draft,isMainBranch:e.target.checked})}/> Set as main branch</label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary"><Check size={16}/>Save branch</button></div></form></Modal>}
  </div>;
}

function StaffPage({ cloud, onAction, offline }: { cloud:CloudState; onAction:(action:any,payload:Row)=>Promise<Row>; offline:boolean }) {
  const [editing,setEditing]=useState<Row|null>(null);
  const [role,setRole]=useState("CASHIER");
  const [branchId,setBranchId]=useState("");
  const [active,setActive]=useState(true);
  const staff=rows(cloud.staff);
  const branches=rows(cloud.branches).filter((b)=>b.is_active);
  function open(user:Row) {setEditing(user);setRole(s(user.role)||"CASHIER");setBranchId(s(user.assigned_branch_id));setActive(user.is_active!==false);}
  async function save(e:React.FormEvent) {
    e.preventDefault();
    await onAction("staff_update",{userId:s(editing?.user_id),role,branchId,isActive:active});
    setEditing(null);
  }
  return <div className="page-stack"><PageHeading title="Staff & access control" description="Manage enrolled staff roles, branch assignments and activation. PIN/password enrollment remains on the owner's secure mobile terminal."/>
    <div className="info-note"><ShieldCheck size={17}/><span>Desktop permissions are applied to the cloud staff mirror. Owner credentials, PIN hashes and passwords are never displayed or downloaded by this application.</span></div>
    <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Staff member</th><th>Username</th><th>Role</th><th>Assigned branch</th><th>State</th><th></th></tr></thead><tbody>
      {staff.map((u)=><tr key={s(u.user_id)}><td><div className="staff-person"><span>{s(u.full_name).slice(0,1).toUpperCase()}</span><strong>{s(u.full_name)}</strong></div></td><td className="mono">@{s(u.username)}</td><td><StatusPill value={s(u.role)}/></td><td>{s(u.assigned_branch_name)||"All branches"}</td><td><StatusPill value={u.is_active===false?"INACTIVE":"ACTIVE"}/></td><td><button className="btn-outline small" disabled={offline||u.role==="OWNER"} onClick={()=>open(u)}>Manage access</button></td></tr>)}
    </tbody></table></div>{!staff.length&&<Empty title="No staff synchronized" description="Create staff identities on the registered Android owner terminal. Existing roles and branch access can then be managed here." icon={Users}/>}</div>
    {editing&&<Modal title={"Manage "+s(editing.full_name)} onClose={()=>setEditing(null)}><form className="form-grid" onSubmit={(e)=>save(e).catch((x)=>alert(errorText(x)))}><div className="field-wide staff-edit-identity"><strong>{s(editing.full_name)}</strong><small>@{s(editing.username)}</small></div><label>Role<select value={role} onChange={(e)=>setRole(e.target.value)}>{["MANAGER","CASHIER"].map(v=><option key={v}>{v}</option>)}</select></label><label>Assigned branch<select value={branchId} onChange={(e)=>setBranchId(e.target.value)}><option value="">All branches</option>{branches.map((b)=><option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><label className="checkbox-field field-wide"><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)}/> Allow this staff account to operate</label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={()=>setEditing(null)}>Cancel</button><button className="btn-primary"><Check size={16}/>Save access</button></div></form></Modal>}
  </div>;
}

function DevicesPage({ cloud, onAction, offline }: { cloud:CloudState; onAction:(action:any,payload:Row)=>Promise<Row>; offline:boolean }) {
  const [open,setOpen]=useState(false);
  const [deviceName,setDeviceName]=useState("");
  const [userId,setUserId]=useState("");
  const [branchId,setBranchId]=useState("");
  const [invite,setInvite]=useState<Row|null>(null);
  const devices=rows(cloud.devices);
  const staff=activeStaff(cloud).filter((u)=>u.role!=="OWNER");
  const branches=rows(cloud.branches).filter((b)=>b.is_active);
  async function create(e:React.FormEvent) {
    e.preventDefault();
    const result=await onAction("device_create",{deviceName,assignedUserId:userId,branchId});
    setOpen(false);setDeviceName("");setUserId("");setBranchId("");
    setInvite(result);
  }
  return <div className="page-stack"><PageHeading title="POS terminal fleet" description="Register and pair additional BeBoss devices with named staff and branch assignments." action={<button className="btn-primary" disabled={offline} onClick={()=>setOpen(true)}><Plus size={17}/> Invite terminal</button>}/>
    <div className="stat-grid three"><StatCard label="Registered devices" value={String(devices.length)} icon={Smartphone}/><StatCard label="Active terminals" value={String(devices.filter((d)=>d.is_active).length)} icon={Monitor} tone="green"/><StatCard label="Monthly add-on" value={money(Math.max(0,devices.filter((d)=>d.is_active&&!d.is_owner_primary).length*2000))} icon={CreditCard} tone="purple"/></div>
    <div className="device-grid">{devices.map((d)=><article className="device-card" key={s(d.id)}><div className="device-top"><span className="device-icon"><Smartphone size={21}/></span><StatusPill value={d.is_active?"ACTIVE":"REVOKED"}/></div><h3>{s(d.device_name)||"Paired terminal"}</h3><p>{s(d.assigned_user_name)||"Unassigned staff"} · {s(d.role)}</p><div className="device-detail"><span>Branch</span><strong>{s(d.branch_name)||"Main branch"}</strong></div><div className="device-detail"><span>Last sync</span><strong>{n(d.last_synced_at)?dateTime(d.last_synced_at):"Not yet paired"}</strong></div><div className="device-card-foot"><span>{d.is_owner_primary?"Owner terminal":"FRw 2,000 / month"}</span><span className="mono">{s(d.device_id).slice(0,18)||"Pending invite"}</span></div></article>)}</div>
    {!devices.length&&<Empty title="No paired devices" description="Open the owner Android device online and sync its device registry before inviting a terminal." icon={Smartphone}/>}
    {open&&<Modal title="Invite a POS terminal" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={(e)=>create(e).catch((x)=>alert(errorText(x)))}><label className="field-wide">Device name<input required value={deviceName} onChange={(e)=>setDeviceName(e.target.value)} placeholder="Front counter PC"/></label><label className="field-wide">Assigned staff<select required value={userId} onChange={(e)=>{const u=staff.find((x)=>s(x.user_id)===e.target.value);setUserId(e.target.value);if(u)setBranchId(s(u.assigned_branch_id));}}><option value="">Select staff</option>{staff.map((u)=><option key={s(u.user_id)} value={s(u.user_id)}>{s(u.full_name)} · {s(u.role)}</option>)}</select></label><label className="field-wide">Branch<select required value={branchId} onChange={(e)=>setBranchId(e.target.value)}><option value="">Select branch</option>{branches.map((b)=><option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><div className="info-note field-wide"><ShieldCheck size={16}/> The invite is single-use and expires after one hour. The additional terminal adds FRw 2,000 per month.</div><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary"><Smartphone size={16}/> Create invite</button></div></form></Modal>}
    {invite&&<Modal title="Secure device invitation" onClose={()=>setInvite(null)}><div className="invite-code"><span>ONE-TIME PAIRING CODE</span><strong>{s(invite.joinCode)}</strong><button className="btn-outline" onClick={()=>navigator.clipboard.writeText(s(invite.joinCode))}><Copy size={15}/> Copy code</button></div><div className="inline-alert info"><Clock3 size={16}/> This invitation expires {dateTime(invite.expiresAt)}. Enter it on the new BeBoss Android terminal to complete pairing.</div></Modal>}
  </div>;
}

function TransfersPage({ cloud, snapshot, onAction, offline }: { cloud:CloudState; snapshot:Snapshot|null; onAction:(action:any,payload:Row)=>Promise<Row>; offline:boolean }) {
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState({productId:"",fromBranchId:"",toBranchId:"",quantity:"1",notes:""});
  const transfers=rows(cloud.transfers);
  const products=activeProducts(snapshot);
  const branches=rows(cloud.branches).filter((b)=>b.is_active);
  async function create(e:React.FormEvent) {
    e.preventDefault();
    const p=products.find((x)=>s(x.id)===form.productId);
    const from=branches.find((x)=>s(x.id)===form.fromBranchId);
    const to=branches.find((x)=>s(x.id)===form.toBranchId);
    if(!p||!from||!to||n(form.quantity)<=0) throw new Error("Choose a product, source/destination branches and quantity.");
    const result=await onAction("transfer_create",{id:id(),productId:form.productId,fromBranchId:form.fromBranchId,toBranchId:form.toBranchId,quantity:n(form.quantity),notes:form.notes});
    setOpen(false);setForm({productId:"",fromBranchId:"",toBranchId:"",quantity:"1",notes:""});
    alert("Transfer " + s(result.transferNumber) + " has been sent to paired BeBoss terminals for stock validation.");
  }
  async function command(t:Row,cmd:string) {
    await onAction("transfer_command",{id:s(t.id),command:cmd});
  }
  return <div className="page-stack"><PageHeading title="Inter-branch stock transfers" description="Request branch-to-branch stock movement and track mobile terminal validation and destination receipt." action={<button className="btn-primary" disabled={offline||!products.length||branches.length<2} onClick={()=>setOpen(true)}><Plus size={17}/> New transfer</button>}/>
    <div className="info-note"><Activity size={17}/> Transfers requested from desktop are cloud commands. A paired Android terminal validates source stock and processes the movement; the destination terminal confirms receipt.</div>
    <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Transfer</th><th>Product</th><th>Route</th><th>Quantity</th><th>Requested</th><th>Status</th><th></th></tr></thead><tbody>
      {transfers.map((t)=><tr key={s(t.id)}><td className="mono">{s(t.transfer_number)}</td><td><strong>{s(t.product_name)}</strong></td><td>{s(t.from_branch_name)} <ArrowRight size={13}/> {s(t.to_branch_name)}</td><td>{n(t.quantity)} {s(t.unit)||"pcs"}</td><td>{dateTime(t.transfer_date)}</td><td><StatusPill value={s(t.status)}/></td><td>{t.status==="IN_TRANSIT"?<div className="row-actions"><button className="btn-outline small" disabled={offline} onClick={()=>command(t,"RECEIPT").catch((e)=>alert(errorText(e)))}>Request receipt</button><button className="icon-btn danger-icon" disabled={offline} title="Request cancellation" onClick={()=>command(t,"CANCEL").catch((e)=>alert(errorText(e)))}><X size={15}/></button></div>:<span className="muted small-text">Mobile processing</span>}</td></tr>)}
    </tbody></table></div>{!transfers.length&&<Empty title="No stock transfers" description="Create a transfer request between two active branches." icon={Truck}/>}</div>
    {open&&<Modal title="Create transfer request" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={(e)=>create(e).catch((x)=>alert(errorText(x)))}><label className="field-wide">Product<select required value={form.productId} onChange={(e)=>setForm({...form,productId:e.target.value})}><option value="">Select product</option>{products.map((p)=><option key={s(p.id)} value={s(p.id)}>{s(p.name)} · {n(p.quantityInStock)} {s(p.unit)}</option>)}</select></label><label>From branch<select required value={form.fromBranchId} onChange={(e)=>setForm({...form,fromBranchId:e.target.value})}><option value="">Source</option>{branches.map((b)=><option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><label>To branch<select required value={form.toBranchId} onChange={(e)=>setForm({...form,toBranchId:e.target.value})}><option value="">Destination</option>{branches.map((b)=><option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><label>Quantity<input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})}/></label><label className="field-wide">Notes<input value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={()=>setOpen(false)}>Cancel</button><button className="btn-primary"><Truck size={16}/> Submit transfer</button></div></form></Modal>}
  </div>;
}

function BillingPage({ cloud, onNavigate, onCheckout }: {
  cloud:CloudState;
  onNavigate:(view:NavKey)=>void;
  onCheckout:(payload:Row)=>Promise<void>;
}) {
  const shop=cloud.shop;
  const payments=rows(cloud.payments);
  const codes=rows(cloud.codes);
  const expired=n(shop.subscription_expires_at)<Date.now();
  const [renewOpen,setRenewOpen]=useState(false);
  const [gateway,setGateway]=useState("flutterwave");
  const [months,setMonths]=useState("1");
  const [payerPhone,setPayerPhone]=useState(s(shop.owner_phone));
  const [payerName,setPayerName]=useState(s(shop.owner_name)||s(shop.owner_username));
  const [payerEmail,setPayerEmail]=useState("");
  const [checkoutBusy,setCheckoutBusy]=useState(false);
  const [checkoutError,setCheckoutError]=useState("");
  const [checkoutNotice,setCheckoutNotice]=useState("");
  const billingMonths=n(months);
  const monthly=n(shop.monthly_fee_rwf);
  const gross=monthly*billingMonths;
  const discount=billingMonths===12?20:billingMonths===3?10:0;
  const estimatedTotal=gross-Math.floor(gross*discount/100);
  async function submitCheckout(event:React.FormEvent) {
    event.preventDefault();
    setCheckoutBusy(true);setCheckoutError("");setCheckoutNotice("");
    try {
      await onCheckout({
        gateway,months:billingMonths,payerPhone,payerName,payerEmail
      });
      setRenewOpen(false);
    } catch(error) {
      setCheckoutError(errorText(error));
    } finally { setCheckoutBusy(false); }
  }
  return <div className="page-stack"><PageHeading title="Subscription & payments" description="Review the active shop plan, payment claims and issued activation records." action={<><button className="btn-outline" onClick={()=>onNavigate("devices")}><Smartphone size={16}/> Manage devices</button><button className="btn-primary" onClick={()=>setRenewOpen(true)}><CreditCard size={16}/> Renew or upgrade</button></>}/>
    <section className="plan-card"><div><span className="eyebrow">CURRENT SHOP PLAN</span><h2>{s(shop.subscription_status)||"UNAVAILABLE"}</h2><p>{s(shop.shop_name)} · {s(shop.business_type)||"Retail"}</p></div><div className="plan-expiry"><span>Subscription expiry</span><strong>{dateTime(shop.subscription_expires_at)}</strong><StatusPill value={expired?"EXPIRED":s(shop.subscription_status)||"TRIAL"}/></div><div className="plan-summary"><span>Monthly plan price</span><strong>{money(shop.monthly_fee_rwf)}</strong><small>{n(shop.branch_count)} branches · {n(shop.worker_count)} staff · {n(shop.device_count)} devices</small></div></section>
    <div className="two-col"><section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">PAYMENT CLAIMS</span><h3>Recent claims</h3></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Provider</th><th>Amount</th><th>Duration</th><th>Status</th></tr></thead><tbody>{payments.map((p)=><tr key={s(p.id)}><td>{dateOnly(p.created_at)}</td><td>{s(p.provider)}</td><td>{money(p.amount_rwf)}</td><td>{n(p.duration_months)} months</td><td><StatusPill value={s(p.status)}/></td></tr>)}</tbody></table></div>{!payments.length&&<Empty title="No payment claims" description="Payment claims submitted for this shop will appear here."/>}</section>
    <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">ACTIVATION CODES</span><h3>Issued codes</h3></div></div><div className="table-wrap"><table><thead><tr><th>Plan</th><th>Days</th><th>Status</th><th>Issued</th></tr></thead><tbody>{codes.map((c)=><tr key={s(c.unlock_code)}><td>{s(c.tier_code)}</td><td>{n(c.plan_days)}</td><td><StatusPill value={s(c.status)}/></td><td>{dateOnly(c.issued_at)}</td></tr>)}</tbody></table></div>{!codes.length&&<Empty title="No activation codes" description="Verified payment claims and unlock codes are recorded here."/>}</section></div>
    <section className="panel announcements"><div className="panel-heading"><div><span className="eyebrow muted">BEBOSS NOTICES</span><h3>Shop announcements</h3></div><Bell size={18} className="muted-icon"/></div>{rows(cloud.announcements).length?rows(cloud.announcements).map((a)=><div className="announcement-row" key={s(a.id)}><StatusPill value={s(a.severity)}/><div><strong>{s(a.title)}</strong><p>{s(a.body)}</p></div></div>):<Empty title="No active announcements" description="Important service updates for shop owners appear here." icon={Bell}/>}</section>
    {renewOpen&&<Modal title="Secure subscription checkout" onClose={()=>{if(!checkoutBusy)setRenewOpen(false);}}><form className="form-grid" onSubmit={(event)=>submitCheckout(event)}>
      <div className="field-wide checkout-plan-summary">
        <div><span>Current monthly plan</span><strong>{money(monthly)}</strong></div>
        <div><span>Registered usage</span><strong>{n(shop.branch_count)} branches · {n(shop.worker_count)} staff · {n(shop.device_count)} devices</strong></div>
        <div><span>Estimated total</span><strong className="checkout-total">{money(estimatedTotal)}</strong><small>{billingMonths} month{billingMonths===1?"":"s"} · {discount?discount+"% multi-month discount":"no discount"}</small></div>
      </div>
      <label className="field-wide">Payment provider<select value={gateway} onChange={(e)=>setGateway(e.target.value)}><option value="flutterwave">Flutterwave · MTN MoMo, Airtel Money or card</option><option value="stripe">Stripe · bank card</option></select></label>
      <label>Billing cycle<select value={months} onChange={(e)=>setMonths(e.target.value)}>{[1,3,6,12].map((value)=><option key={value} value={String(value)}>{value} month{value===1?"":"s"}{value===3?" · 10% discount":value===12?" · 20% discount":""}</option>)}</select></label>
      <label>Payer mobile number<input required value={payerPhone} onChange={(e)=>setPayerPhone(e.target.value)} placeholder="+250 7XX XXX XXX"/></label>
      <label>Payer full name<input required minLength={2} maxLength={120} value={payerName} onChange={(e)=>setPayerName(e.target.value)}/></label>
      <label>Payer email<input required type="email" maxLength={254} value={payerEmail} onChange={(e)=>setPayerEmail(e.target.value)} placeholder="billing@example.com"/></label>
      {checkoutError&&<div className="inline-alert error field-wide"><AlertTriangle size={15}/>{checkoutError}</div>}
      {checkoutNotice&&<div className="inline-alert info field-wide"><Activity size={15}/>{checkoutNotice}</div>}
      <div className="info-note field-wide"><ShieldCheck size={16}/> Payment runs on the provider's secure hosted checkout. BeBoss will activate the subscription only after its verified payment webhook confirms settlement. A browser return or SMS is not proof of payment.</div>
      <div className="modal-actions field-wide"><button type="button" className="btn-outline" disabled={checkoutBusy} onClick={()=>setRenewOpen(false)}>Cancel</button><button className="btn-primary" disabled={checkoutBusy}>{checkoutBusy?<LoaderCircle size={16} className="spin"/>:<CreditCard size={16}/>}Continue to hosted checkout</button></div>
    </form></Modal>}
  </div>;
}

function SettingsPage({ snapshot, onCommit, offline }: {
  snapshot:Snapshot|null; onCommit:(mutator:(next:Snapshot)=>void)=>Promise<void>; offline:boolean
}) {
  const profile=snapshot?.shopProfile??{};
  const [draft,setDraft]=useState({shopName:s(profile.shopName),ownerName:s(profile.name),phone:s(profile.phone),email:s(profile.email),address:s(profile.address),tin:s(profile.tinNumber),taxRate:String(profile.taxRate??0),receiptHeader:s(profile.receiptHeader),receiptFooter:s(profile.receiptFooter),currency:s(profile.currencySymbol)||"FRw",dailyTarget:String(profile.dailySalesTarget??0),monthlyTarget:String(profile.monthlyRevenueTarget??0)});
  useEffect(()=>{setDraft({shopName:s(profile.shopName),ownerName:s(profile.name),phone:s(profile.phone),email:s(profile.email),address:s(profile.address),tin:s(profile.tinNumber),taxRate:String(profile.taxRate??0),receiptHeader:s(profile.receiptHeader),receiptFooter:s(profile.receiptFooter),currency:s(profile.currencySymbol)||"FRw",dailyTarget:String(profile.dailySalesTarget??0),monthlyTarget:String(profile.monthlyRevenueTarget??0)});},[snapshot?.shopProfile?.updatedAt]);
  async function save(e:React.FormEvent) {
    e.preventDefault();
    await onCommit((next)=>{
      const now=Date.now();
      next.shopProfile={...next.shopProfile,shopName:draft.shopName.trim(),name:draft.ownerName.trim(),phone:draft.phone.trim(),email:draft.email.trim(),address:draft.address.trim(),tinNumber:draft.tin.trim(),taxRate:Math.max(0,Math.min(100,n(draft.taxRate))),receiptHeader:draft.receiptHeader.trim(),receiptFooter:draft.receiptFooter.trim(),currencySymbol:draft.currency.trim()||"FRw",dailySalesTarget:n(draft.dailyTarget),monthlyRevenueTarget:n(draft.monthlyTarget),updatedAt:now,hlcTimestamp:now<<16,lastModifiedDeviceId:"DESKTOP"};
    });
  }
  return <div className="page-stack"><PageHeading title="Shop settings" description="Configure business identity, receipt details, tax presentation and sales targets."/>
    <div className="settings-layout"><form className="panel settings-form" onSubmit={(e)=>save(e).catch((x)=>alert(errorText(x)))}><div className="panel-heading"><div><span className="eyebrow muted">BUSINESS PROFILE</span><h3>Shop identity</h3></div><Store size={18} className="muted-icon"/></div>
      <div className="form-grid"><label className="field-wide">Shop name<input required value={draft.shopName} onChange={(e)=>setDraft({...draft,shopName:e.target.value})}/></label><label>Owner name<input value={draft.ownerName} onChange={(e)=>setDraft({...draft,ownerName:e.target.value})}/></label><label>Business phone<input value={draft.phone} onChange={(e)=>setDraft({...draft,phone:e.target.value})}/></label><label>Email<input type="email" value={draft.email} onChange={(e)=>setDraft({...draft,email:e.target.value})}/></label><label>Tax identification number<input value={draft.tin} onChange={(e)=>setDraft({...draft,tin:e.target.value})}/></label><label className="field-wide">Shop address<input value={draft.address} onChange={(e)=>setDraft({...draft,address:e.target.value})}/></label><label>Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={draft.taxRate} onChange={(e)=>setDraft({...draft,taxRate:e.target.value})}/></label><label>Currency symbol<input value={draft.currency} onChange={(e)=>setDraft({...draft,currency:e.target.value})}/></label><label>Daily sales target (FRw)<input type="number" min="0" value={draft.dailyTarget} onChange={(e)=>setDraft({...draft,dailyTarget:e.target.value})}/></label><label>Monthly revenue target (FRw)<input type="number" min="0" value={draft.monthlyTarget} onChange={(e)=>setDraft({...draft,monthlyTarget:e.target.value})}/></label></div>
      <div className="panel-subhead"><strong>Receipt content</strong><small>These fields are synchronized with the shop profile.</small></div><div className="form-grid"><label className="field-wide">Receipt header<input value={draft.receiptHeader} onChange={(e)=>setDraft({...draft,receiptHeader:e.target.value})}/></label><label className="field-wide">Receipt footer<input value={draft.receiptFooter} onChange={(e)=>setDraft({...draft,receiptFooter:e.target.value})}/></label></div>
      <div className="form-footer"><span className="muted small-text">Owner-only configuration change</span><button className="btn-primary" disabled={offline}><Check size={16}/> Save settings</button></div>
    </form><aside className="panel settings-side"><div className="panel-heading"><div><span className="eyebrow muted">WORKSPACE SECURITY</span><h3>Connected account</h3></div><ShieldCheck size={18} className="green-icon"/></div><div className="security-line"><span>Signed in as</span><strong>@{s(profile.ownerUsername)||"shop owner"}</strong></div><div className="security-line"><span>Owner verification</span><StatusPill value="ACTIVE"/></div><div className="security-line"><span>Snapshot integrity</span><StatusPill value={snapshot?"VERIFIED":"NOT SYNCED"}/></div><div className="security-line"><span>Local session storage</span><strong>OS encrypted</strong></div><div className="security-line"><span>Data writes</span><strong>Owner verified cloud API</strong></div><div className="security-warning"><AlertTriangle size={16}/><span>Subscription, unlock-code and platform-admin controls cannot be changed from shop profile settings.</span></div></aside></div>
  </div>;
}
