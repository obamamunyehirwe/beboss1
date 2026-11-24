import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, AlertCircle, Archive, ArrowDownToLine, ArrowLeftRight, BarChart3, Barcode,
  Bell, Building2, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign,
  Cloud, CloudOff, CreditCard, Download, FileText, Gauge, HardDrive, LayoutDashboard,
  LockKeyhole, LogOut, Package, PackagePlus, Plus, Printer, RefreshCw, Search, Settings,
  ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Trash2, TrendingDown, TrendingUp,
  Truck, Users, Wallet, Wifi, WifiOff, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requestMyShopOwnerOtp, claimMyShopOwner, lookupMyShop, addMyShopDevice } from "@/lib/public.functions";
import { computeShopKey } from "@/lib/pricing";

export const Route = createFileRoute("/desktop")({
  component: BeBossDesktopWorkspace,
});

type Row = Record<string, any>;
type Section =
  | "overview" | "pos" | "inventory" | "customers" | "sales" | "purchases"
  | "transfers" | "branches" | "staff" | "devices" | "analytics" | "reports"
  | "billing" | "settings" | "sync";

type Dataset = {
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

type DesktopCache = {
  version: 1;
  desktopId: string;
  shopId: string;
  username: string;
  phone: string;
  dataset: Dataset;
  cachedAt: number;
  verifiedAt: number;
  subscriptionExpiresAt: number;
  dirty: boolean;
  heldCarts?: HeldCart[];
};

type CartLine = { productId: string; quantity: number; customPrice: number | null };
type HeldCart = {
  id: string; label: string; createdAt: number; items: CartLine[];
  discount: string; paid: string; paymentMethod: string; selectedCustomer: string;
  splitCash: string; splitMomo: string;
};

const money = (amount: unknown, currency = "FRw") =>
  currency + " " + new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(Number(amount) || 0);
const asNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asText = (value: unknown, fallback = "") => value == null ? fallback : String(value);
const nowMs = () => Date.now();
const uuid = () => crypto.randomUUID();
const initials = (value: string) => value.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "B";
const dateLabel = (value: unknown) => {
  const date = new Date(asNumber(value));
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};
const dayStart = (value = Date.now()) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const newHlc = (previous: unknown = 0, at = Date.now()) => {
  let prior = 0n;
  try { prior = BigInt(asText(previous, "0")); } catch { prior = 0n; }
  const priorPhysical = prior >> 16n;
  const physical = BigInt(Math.max(0, Math.floor(at)));
  if (physical > priorPhysical) return (physical << 16n).toString();
  const logical = (prior & 65535n) + 1n;
  return ((priorPhysical << 16n) | (logical > 65535n ? 65535n : logical)).toString();
};
const stamp = (row: Row, deviceId: string, at = Date.now()) => ({
  ...row,
  updatedAt: at,
  syncVersion: Math.max(0, asNumber(row.syncVersion, 0)) + 1,
  hlcTimestamp: newHlc(row.hlcTimestamp, at),
  lastModifiedDeviceId: deviceId,
});
const record = (value: Row, deviceId: string, at = Date.now()) => stamp({
  id: uuid(), ...value, createdAt: at, updatedAt: at, syncVersion: 1,
}, deviceId, at);
const defaultDataset = (shop: Row, username: string, phone: string): Dataset => {
  const shopName = asText(shop.shop_name, "My Business");
  const mainBranch: Row = {
    id: "main_branch", name: "Main Branch", code: "BR-01", address: "", phone: "",
    managerUserId: "", managerName: "", isMainBranch: true, isActive: true,
    operationalStatus: "OPEN", colorHex: "#F97316", dailySalesTargetRwf: 0,
    monthlyTargetRwf: 0, openingCashFloat: 0, productCount: 0, stockValueRwf: 0,
    createdAt: nowMs(), updatedAt: nowMs(), syncVersion: 1, hlcTimestamp: "0",
    lastModifiedDeviceId: "DESKTOP",
  };
  return {
    metadata: { app: "BeBoss", version: "3.0", schemaVersion: 3, timestamp: nowMs(), exportedBy: username, exportedByRole: "OWNER" },
    shopProfile: {
      id: 1, name: asText(shop.owner_name), phone, email: "", shopName,
      address: "", currencyCode: "RWF", currencySymbol: "FRw", taxRate: 0,
      tinNumber: "", receiptFooter: "Thank you for your business!", receiptHeader: "",
      dailySalesTarget: 0, monthlyRevenueTarget: 0, targetMarginPercent: 25,
      cashRegisterFloat: 0, showTaxOnReceipt: true, businessType: asText(shop.business_type, "sector_retail"),
      updatedAt: nowMs(), createdAt: nowMs(), syncVersion: 1, hlcTimestamp: "0",
      lastModifiedDeviceId: "DESKTOP",
    },
    products: [], customers: [], sales: [], saleItems: [], customerPayments: [],
    purchases: [], stockTransfers: [], branches: [mainBranch], users: [], tombstones: [],
  };
};
const normaliseDataset = (input: unknown, shop: Row, username: string, phone: string): Dataset => {
  const source = input && typeof input === "object" ? input as Row : {};
  const base = defaultDataset(shop, username, phone);
  const result: Dataset = {
    metadata: source.metadata && typeof source.metadata === "object" ? source.metadata : base.metadata,
    shopProfile: source.shopProfile && typeof source.shopProfile === "object"
      ? { ...base.shopProfile, ...source.shopProfile, id: 1, shopName: asText(source.shopProfile.shopName, base.shopProfile.shopName) }
      : base.shopProfile,
    products: Array.isArray(source.products) ? source.products : [],
    customers: Array.isArray(source.customers) ? source.customers : [],
    sales: Array.isArray(source.sales) ? source.sales : [],
    saleItems: Array.isArray(source.saleItems) ? source.saleItems : [],
    customerPayments: Array.isArray(source.customerPayments) ? source.customerPayments : [],
    purchases: Array.isArray(source.purchases) ? source.purchases : [],
    stockTransfers: Array.isArray(source.stockTransfers) ? source.stockTransfers : [],
    branches: Array.isArray(source.branches) && source.branches.length ? source.branches : base.branches,
    users: Array.isArray(source.users) ? source.users : [],
    tombstones: Array.isArray(source.tombstones) ? source.tombstones : [],
  };
  return result;
};
const emptyAnalytics = (dataset: Dataset) => {
  const today = dataset.sales.filter((sale) => asNumber(sale.saleDate) >= dayStart());
  const last30 = dataset.sales.filter((sale) => asNumber(sale.saleDate) >= nowMs() - 30 * 86400000);
  const sum = (rows: Row[], key: string) => rows.reduce((total, row) => total + asNumber(row[key]), 0);
  const topMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of dataset.saleItems) {
    const key = asText(item.productId);
    const row = topMap.get(key) || { name: asText(item.productName, "Item"), quantity: 0, revenue: 0 };
    row.quantity += asNumber(item.quantitySold);
    row.revenue += asNumber(item.subtotal);
    topMap.set(key, row);
  }
  const lowStock = dataset.products.filter((p) => !p.isDeleted && asNumber(p.quantityInStock) <= asNumber(p.lowStockThreshold, 5));
  const stockValue = dataset.products.reduce((total, p) => total + asNumber(p.quantityInStock) * asNumber(p.costPrice), 0);
  const daily = Array.from({ length: 7 }, (_, index) => {
    const start = dayStart() - (6 - index) * 86400000;
    const daySales = dataset.sales.filter((sale) => asNumber(sale.saleDate) >= start && asNumber(sale.saleDate) < start + 86400000);
    return { label: new Date(start).toLocaleDateString(undefined, { weekday: "short" }), revenue: sum(daySales, "totalAmount") };
  });
  return {
    todayRevenue: sum(today, "totalAmount"), todayProfit: sum(today, "totalProfit"), todayOrders: today.length,
    revenue30: sum(last30, "totalAmount"), profit30: sum(last30, "totalProfit"), orders30: last30.length,
    stockValue, inventoryCount: dataset.products.filter((p) => !p.isDeleted).length,
    customerCount: dataset.customers.filter((p) => !p.isDeleted).length,
    lowStock, debt: dataset.customers.reduce((total, c) => total + asNumber(c.debtBalance), 0),
    topProducts: [...topMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6),
    daily,
  };
};
function forecastProduct(dataset: Dataset, productId: string, branchId = "ALL", now = Date.now()) {
  const horizon = 56;
  const today = new Date(now); today.setHours(0,0,0,0);
  const starts = Array.from({length:horizon},(_,i)=>{const d=new Date(today);d.setDate(d.getDate()+i-(horizon-1));return d.getTime();});
  const demand = new Array<number>(horizon).fill(0);
  const sales = new Map(dataset.sales.filter(s=>s.saleDate>=starts[0]&&s.saleDate<=now).filter(s=>branchId==="ALL"||s.branchId===branchId).map(s=>[s.id,s]));
  for (const item of dataset.saleItems) {
    if(item.productId!==productId||asNumber(item.quantitySold)<=0) continue;
    const sale=sales.get(item.saleId); if(!sale) continue;
    if(branchId!=="ALL"&&asText(item.branchId,sale.branchId)!==branchId) continue;
    let lo=0,hi=starts.length-1,index=-1;
    while(lo<=hi){const mid=(lo+hi)>>>1;if(starts[mid]<=sale.saleDate){index=mid;lo=mid+1;}else hi=mid-1;}
    if(index>=0)demand[index]+=asNumber(item.quantitySold);
  }
  const units=demand.reduce((a,b)=>a+b,0), salesDays=demand.filter(x=>x>0).length;
  if(!units)return {unitsSold:0,dailyDemand:0,leadTimeDemand:0,reviewDemand:0,safetyStock:0,trendPercent:0,confidence:"LOW",salesDays:0};
  let weighted=0,weights=0;
  demand.forEach((q,i)=>{const age=horizon-1-i,w=Math.exp(-Math.LN2*age/28);weighted+=q*w;weights+=w;});
  const baseline=weighted/weights,recent=demand.slice(-14).reduce((a,b)=>a+b,0)/14,previous=demand.slice(28,42).reduce((a,b)=>a+b,0)/14;
  const hasTrend=previous>0,trend=hasTrend?Math.max(-100,Math.min(300,(recent-previous)/previous*100)):0;
  const ratio=hasTrend?Math.max(.7,Math.min(1.4,recent/previous)):1;
  const daily=(baseline*.7+recent*.3)*(.85+.15*ratio),mean=units/horizon;
  const variance=demand.reduce((a,q)=>a+(q-mean)**2,0)/horizon,sd=Math.sqrt(variance);
  const totals=new Array<number>(8).fill(0),counts=new Array<number>(8).fill(0);
  demand.forEach((q,i)=>{const day=new Date(starts[i]).getDay()||7;totals[day]+=q;counts[day]++;});
  const factor=(day:number)=>{if(counts[day]<4||mean<=0)return 1;return Math.max(.6,Math.min(1.5,(totals[day]/counts[day]*.65+mean*.35)/mean));};
  const next=new Date(today);next.setDate(next.getDate()+1);
  const forecast=(days:number)=>{let total=0;const d=new Date(next);for(let i=0;i<days;i++){if(i)d.setDate(d.getDate()+1);total+=daily*factor(d.getDay()||7);}return total;};
  return {unitsSold:units,dailyDemand:daily,leadTimeDemand:forecast(7),reviewDemand:forecast(7),safetyStock:1.28*sd*Math.sqrt(7),trendPercent:trend,confidence:salesDays>=21?"HIGH":salesDays>=8?"MEDIUM":"LOW",salesDays};
}
const csv = (rows: Row[], columns: string[]) => [
  columns.join(","),
  ...rows.map((row) => columns.map((key) => {
    const value = asText(row[key]);
    return '"' + value.replaceAll('"', '""') + '"';
  }).join(",")),
].join("\r\n");
const download = (name: string, content: string, type = "text/plain;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const navigation: { id: Section; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Workspace" },
  { id: "pos", label: "Point of sale", icon: ShoppingCart, group: "Workspace" },
  { id: "inventory", label: "Inventory", icon: Package, group: "Operations" },
  { id: "customers", label: "Customers & credit", icon: Users, group: "Operations" },
  { id: "sales", label: "Sales history", icon: ShoppingBag, group: "Operations" },
  { id: "purchases", label: "Purchases & suppliers", icon: Truck, group: "Operations" },
  { id: "transfers", label: "Branch transfers", icon: ArrowLeftRight, group: "Operations" },
  { id: "branches", label: "Branches", icon: Building2, group: "Company" },
  { id: "staff", label: "Staff & permissions", icon: ShieldCheck, group: "Company" },
  { id: "devices", label: "Devices", icon: Smartphone, group: "Company" },
  { id: "analytics", label: "Analytics & forecast", icon: BarChart3, group: "Intelligence" },
  { id: "reports", label: "Reports & exports", icon: FileText, group: "Intelligence" },
  { id: "billing", label: "Subscription", icon: CreditCard, group: "Account" },
  { id: "sync", label: "Cloud sync", icon: Cloud, group: "Account" },
  { id: "settings", label: "Business settings", icon: Settings, group: "Account" },
];

function BeBossDesktopWorkspace() {
  const [section, setSection] = useState<Section>("overview");
  const [cache, setCache] = useState<DesktopCache | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const datasetRef = useRef<Dataset | null>(null);
  const cacheRef = useRef<DesktopCache | null>(null);
  const syncLock = useRef(false);
  const bootStarted = useRef(false);
  const [booting, setBooting] = useState(true);
  const [storageReady, setStorageReady] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [dirty, setDirty] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(0);
  const [syncMessage, setSyncMessage] = useState("Connect to BeBoss Cloud to load your business.");
  const [otpStage, setOtpStage] = useState(false);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [shop, setShop] = useState<Row | null>(null);
  const [devices, setDevices] = useState<Row[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [splitCash, setSplitCash] = useState("");
  const [splitMomo, setSplitMomo] = useState("");
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [ownerPortal, setOwnerPortal] = useState<Row | null>(null);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [deviceForm, setDeviceForm] = useState<Row>({});
  const [deviceInvite, setDeviceInvite] = useState<Row | null>(null);
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [selectedCustomer, setSelectedCustomer] = useState("walk-in");
  const [barcode, setBarcode] = useState("");
  const [receipt, setReceipt] = useState<Row | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [form, setForm] = useState<Row>({});
  const [updateInfo, setUpdateInfo] = useState<{ state: string; version?: string | null } | null>(null);
  const [query, setQuery] = useState("");

  const bridge = typeof window !== "undefined" ? window.beBossDesktop : undefined;
  const currency = asText(dataset?.shopProfile.currencySymbol, "FRw");
  const analytics = useMemo(() => dataset ? emptyAnalytics(dataset) : null, [dataset]);
  const licenseExpired = useMemo(() => {
    if (!cache) return false;
    const expiry = asNumber(shop?.subscription_expires_at, cache.subscriptionExpiresAt);
    const status = asText(shop?.subscription_status, "TRIAL").toUpperCase();
    return status === "SUSPENDED" || status === "EXPIRED" || expiry <= Date.now() || Boolean(shop?.remote_kill_switch);
  }, [cache, shop]);
  const visibleProducts = useMemo(() => (dataset?.products || []).filter((p) =>
    p.isDeleted !== true &&
    (branchFilter === "ALL" || !p.branchId || p.branchId === branchFilter) &&
    (asText(p.name) + " " + asText(p.category) + " " + asText(p.barcode)).toLowerCase().includes(search.toLowerCase())
  ), [dataset, branchFilter, search]);
  const visibleCustomers = useMemo(() => (dataset?.customers || []).filter((c) =>
    c.isDeleted !== true && (asText(c.name) + " " + asText(c.phone)).toLowerCase().includes(search.toLowerCase())
  ), [dataset, search]);
  const activeBranches = (dataset?.branches || []).filter((branch) => branch.isActive !== false);

  const persistCache = useCallback(async (nextDataset: Dataset, nextDirty: boolean) => {
    datasetRef.current = nextDataset;
    setDataset(nextDataset);
    setDirty(nextDirty);
    const current = cacheRef.current;
    if (!current || !bridge?.isDesktop) return;
    const updated: DesktopCache = { ...current, dataset: nextDataset, cachedAt: Date.now(), dirty: nextDirty };
    cacheRef.current = updated;
    setCache(updated);
    try {
      await bridge.writeWorkspaceCache(JSON.stringify(updated));
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Could not save the encrypted local workspace.");
      toast.error("Local encrypted workspace could not be saved.");
    }
  }, [bridge]);

  const persistHeldCarts = useCallback(async (next: HeldCart[]) => {
    setHeldCarts(next);
    const current = cacheRef.current;
    if (!current || !bridge?.isDesktop) return;
    const updated = { ...current, heldCarts: next, cachedAt: Date.now() };
    cacheRef.current = updated;
    setCache(updated);
    await bridge.writeWorkspaceCache(JSON.stringify(updated));
  }, [bridge]);

  const mergeServerState = useCallback((remote: Row, currentShop: Row, ownerName: string, ownerPhone: string) => {
    const normalized = normaliseDataset(remote, currentShop, ownerName, ownerPhone);
    datasetRef.current = normalized;
    setDataset(normalized);
    return normalized;
  }, []);

  const loadFromCloud = useCallback(async (currentCache: DesktopCache) => {
    const { data, error } = await supabase.functions.invoke("desktop-workspace", {
      body: { action: "load", shopId: currentCache.shopId, desktopId: currentCache.desktopId },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(asText(data?.error, "BeBoss could not load the cloud workspace."));
    const remoteShop = data.shop as Row;
    setShop(remoteShop);
    setDevices(Array.isArray(data.devices) ? data.devices : []);
    setStaffDirectory(Array.isArray(data.staff) ? data.staff : []);
    try {
      const portalData = await lookupMyShop({ data: { username: currentCache.username, phone: currentCache.phone } });
      setOwnerPortal(portalData as Row);
    } catch (portalError) {
      console.warn("[BeBoss Desktop] Owner portal projection unavailable:", portalError);
    }
    const normalized = mergeServerState(data.dataset, remoteShop, currentCache.username, currentCache.phone);
    const verifiedAt = Date.now();
    const refreshed: DesktopCache = {
      ...currentCache, dataset: normalized, cachedAt: verifiedAt, verifiedAt,
      subscriptionExpiresAt: asNumber(remoteShop.subscription_expires_at, currentCache.subscriptionExpiresAt),
      dirty: false,
    };
    cacheRef.current = refreshed;
    setCache(refreshed);
    setDirty(false);
    setLastSyncedAt(asNumber(data.snapshots?.lastUpdatedAt, verifiedAt));
    setSyncMessage("Cloud workspace loaded. " + asText(data.snapshots?.deviceCount, "0") + " device snapshot(s) verified.");
    await bridge?.writeWorkspaceCache(JSON.stringify(refreshed));
    return normalized;
  }, [bridge, mergeServerState]);

  const syncNow = useCallback(async (candidate?: Dataset) => {
    const current = cacheRef.current;
    const source = candidate || datasetRef.current;
    if (!current || !source) throw new Error("Load a registered BeBoss shop before synchronizing.");
    if (!navigator.onLine) {
      setOffline(true);
      setSyncMessage("Offline. Changes are stored in encrypted local workspace and queued for the next connection.");
      return false;
    }
    if (syncLock.current) return false;
    if (licenseExpired) throw new Error("This shop subscription is expired or suspended. Renew it before synchronizing business operations.");
    syncLock.current = true;
    setSyncing(true);
    setSyncMessage("Verifying cloud revision and publishing changes…");
    try {
      const { data, error } = await supabase.functions.invoke("desktop-workspace", {
        body: { action: "save", shopId: current.shopId, desktopId: current.desktopId, dataset: source },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(asText(data?.error, "Cloud synchronization was rejected."));
      const refreshed = await loadFromCloud(current);
      const saved = { ...cacheRef.current!, dataset: refreshed, dirty: false, cachedAt: Date.now(), verifiedAt: Date.now() };
      cacheRef.current = saved;
      setCache(saved);
      setDirty(false);
      await bridge?.writeWorkspaceCache(JSON.stringify(saved));
      setLastSyncedAt(asNumber(data.uploadedAt, Date.now()));
      setSyncMessage("Synced " + asText(data.records, "business records") + " successfully.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cloud synchronization failed.";
      setSyncMessage(message);
      throw error;
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [bridge, licenseExpired, loadFromCloud]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      if (bootStarted.current) return;
      bootStarted.current = true;
      try {
        if (!bridge?.isDesktop) {
          setSyncMessage("Open this workspace in the BeBoss Desktop application to use encrypted offline storage and native desktop services.");
          return;
        }
        const secure = await bridge.isSecureStorageAvailable();
        if (!active) return;
        setStorageReady(secure);
        if (!secure) {
          setSyncMessage("Operating-system encryption is unavailable. Sign-in and business data are disabled rather than stored in plaintext.");
          return;
        }
        const raw = await bridge.readWorkspaceCache();
        if (!active) return;
        let saved: DesktopCache | null = null;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as DesktopCache;
            if (parsed.version === 1 && parsed.shopId && parsed.desktopId && parsed.dataset) saved = parsed;
          } catch {
            await bridge.clearWorkspaceCache();
          }
        }
        if (saved) {
          setHeldCarts(Array.isArray(saved.heldCarts) ? saved.heldCarts : []);
          cacheRef.current = saved;
          setCache(saved);
          datasetRef.current = saved.dataset;
          setDataset(saved.dataset);
          setUsername(saved.username);
          setPhone(saved.phone);
          setDirty(saved.dirty);
          setLastSyncedAt(saved.verifiedAt);
          const session = await supabase.auth.getSession();
          if (session.data.session && navigator.onLine) {
            try {
              if (saved.dirty) await syncNow(saved.dataset);
              else await loadFromCloud(saved);
            } catch {
              setOffline(true);
              setSyncMessage("Cloud is unavailable. Your encrypted local workspace remains available.");
            }
          } else {
            setOffline(true);
            setSyncMessage("Using the last encrypted workspace snapshot. Reconnect to verify cloud status and synchronize.");
          }
        } else {
          const session = await supabase.auth.getSession();
          if (session.data.session) await supabase.auth.signOut();
        }
      } catch (error) {
        setSyncMessage(error instanceof Error ? error.message : "Desktop initialization failed.");
      } finally {
        if (active) setBooting(false);
      }
    };
    void boot();
    return () => { active = false; };
  }, [bridge, loadFromCloud, syncNow]);

  useEffect(() => {
    const online = () => { setOffline(false); if (cacheRef.current) void syncNow().catch((error) => toast.error(error.message)); };
    const offlineEvent = () => { setOffline(true); setSyncMessage("Offline. Local encrypted work continues; cloud changes are queued."); };
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineEvent);
    const timer = window.setInterval(() => {
      if (navigator.onLine && cacheRef.current && datasetRef.current && !syncLock.current && (dirty || Date.now() - lastSyncedAt > 5 * 60000)) {
        void syncNow().catch(() => {});
      }
    }, 60000);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineEvent);
      window.clearInterval(timer);
    };
  }, [dirty, lastSyncedAt, syncNow]);

  useEffect(() => {
    if (!dirty || !dataset || !cache || offline || syncing || licenseExpired) return;
    const timer = window.setTimeout(() => { void syncNow().catch(() => {}); }, 2200);
    return () => window.clearTimeout(timer);
  }, [dataset, dirty, cache, offline, syncing, licenseExpired, syncNow]);

  const updateData = useCallback((transform: (current: Dataset) => Dataset) => {
    const current = datasetRef.current;
    if (!current) return;
    if (licenseExpired) {
      toast.error("The subscription is expired or suspended. Renew the business account to continue.");
      return;
    }
    const next = transform(current);
    next.metadata = { ...next.metadata, timestamp: Date.now(), exportedBy: cacheRef.current?.username || "Owner", exportedByRole: "OWNER" };
    void persistCache(next, true);
  }, [licenseExpired, persistCache]);

  const mutate = useCallback(<K extends keyof Dataset>(key: K, updater: (rows: Dataset[K]) => Dataset[K]) => {
    updateData((current) => ({ ...current, [key]: updater(current[key]) }));
  }, [updateData]);

  const addRecord = useCallback((key: keyof Dataset, value: Row) => {
    const deviceId = cacheRef.current?.desktopId || "DESKTOP-LOCAL";
    const made = record(value, deviceId);
    mutate(key as any, (rows: any) => [...rows, made]);
    return made;
  }, [mutate]);

  const updateRecord = useCallback((key: keyof Dataset, id: string, patch: Row) => {
    const deviceId = cacheRef.current?.desktopId || "DESKTOP-LOCAL";
    mutate(key as any, (rows: any[]) => rows.map((row) => row.id === id ? stamp({ ...row, ...patch }, deviceId) : row));
  }, [mutate]);

  const deleteRecord = useCallback((key: keyof Dataset, row: Row) => {
    const deviceId = cacheRef.current?.desktopId || "DESKTOP-LOCAL";
    const at = Date.now();
    const tombstone = {
      id: key + ":" + asText(row.id), tableName: key, recordId: asText(row.id),
      deletedAt: at, hlcTimestamp: newHlc(row.hlcTimestamp, at), deletedByDeviceId: deviceId,
    };
    updateData((current) => ({
      ...current,
      [key]: (current[key] as Row[]).filter((item) => item.id !== row.id),
      tombstones: [...current.tombstones.filter((item) => item.id !== tombstone.id), tombstone],
    }));
  }, [updateData]);

  const loginRequest = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await requestMyShopOwnerOtp({ data: { username: username.trim(), phone: phone.trim() } });
      setOtpStage(true);
      toast.success("A verification code was requested for the registered owner phone.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not request owner verification.");
    } finally { setBusy(false); }
  };

  const verifyOwner = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const digits = phone.replace(/\D/g, "");
      const local = digits.length === 9 ? digits : digits.startsWith("250") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : "";
      if (!/^7\d{8}$/.test(local)) throw new Error("Enter the Rwanda phone number registered to this BeBoss shop.");
      const e164 = "+250" + local;
      const { data: auth, error: authError } = await supabase.auth.verifyOtp({ phone: e164, token: otp.trim(), type: "sms" });
      if (authError || !auth.session) throw authError || new Error("The SMS verification code was not accepted.");
      await claimMyShopOwner({ data: { username: username.trim(), phone: e164 } });
      const shopId = computeShopKey(username, e164);
      const existingId = cacheRef.current?.desktopId || "DESKTOP-" + uuid().toUpperCase();
      const initialCache: DesktopCache = {
        version: 1, desktopId: existingId, shopId, username: username.trim(),
        phone: e164, dataset: defaultDataset({}, username, e164), cachedAt: Date.now(),
        verifiedAt: 0, subscriptionExpiresAt: 0, dirty: false, heldCarts: [],
      };
      cacheRef.current = initialCache;
      setCache(initialCache);
      datasetRef.current = initialCache.dataset;
      setDataset(initialCache.dataset);
      await bridge?.writeWorkspaceCache(JSON.stringify(initialCache));
      const loaded = await loadFromCloud(initialCache);
      if (!loaded.products.length && !loaded.customers.length && !loaded.sales.length) {
        const initialised = normaliseDataset(loaded, { shop_name: loaded.shopProfile.shopName, owner_name: loaded.shopProfile.name }, username, e164);
        datasetRef.current = initialised;
        await persistCache(initialised, true);
      }
      setOtpStage(false);
      setOtp("");
      toast.success("Owner verified. The business workspace is connected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Owner verification failed.");
    } finally { setBusy(false); }
  };

  const logout = async () => {
    try { await supabase.auth.signOut(); } catch { /* local encrypted cache is still explicitly cleared below */ }
    await bridge?.clearWorkspaceCache();
    cacheRef.current = null;
    datasetRef.current = null;
    setCache(null); setDataset(null); setShop(null); setDevices([]);
    setDirty(false); setHeldCarts([]); setOtpStage(false); setOtp("");
    setSyncMessage("Signed out. Your next session must verify the registered shop owner phone again.");
  };

  const createSale = () => {
    if (!dataset || cart.length === 0) return;
    const lines = cart.map((line) => {
      const product = dataset.products.find((item) => item.id === line.productId);
      if (!product) throw new Error("A cart item is no longer available in inventory.");
      const price = line.customPrice === null ? asNumber(product.sellingPrice) : line.customPrice;
      const quantity = Math.max(0, line.quantity);
      if (quantity <= 0 || quantity > asNumber(product.quantityInStock)) throw new Error("A sale quantity exceeds available stock for " + product.name + ".");
      return { product, price, quantity };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const discountValue = Math.min(subtotal, Math.max(0, asNumber(discount)));
    const total = Math.max(0, subtotal - discountValue);
    const splitTotal = asNumber(splitCash) + asNumber(splitMomo);
    const amountPaid = Math.min(total, Math.max(0, paymentMethod === "SPLIT" ? splitTotal : paymentMethod === "DEBT" ? (paid.trim() ? asNumber(paid) : 0) : (paid.trim() ? asNumber(paid) : total)));
    const customer = dataset.customers.find((item) => item.id === selectedCustomer);
    if ((paymentMethod === "DEBT" || (paymentMethod === "SPLIT" && amountPaid < total)) && !customer) throw new Error("Select a registered customer before posting an unpaid or partial sale.");
    if (paymentMethod === "SPLIT" && splitTotal <= 0) throw new Error("Enter a cash or mobile-money amount for the split payment.");
    if (customer && total > amountPaid && asNumber(customer.creditLimit) > 0 && asNumber(customer.debtBalance) + total - amountPaid > asNumber(customer.creditLimit)) throw new Error("This sale would exceed the customer credit limit.");
    const at = Date.now();
    const deviceId = cache?.desktopId || "DESKTOP-LOCAL";
    const saleId = uuid();
    const receiptNo = "BB-" + new Date(at).toISOString().replace(/\D/g, "").slice(2, 14);
    const sale = record({
      id: saleId, customerId: customer?.id || null, customerName: customer?.name || "Walk-in Customer",
      saleDate: at, totalAmount: total, totalCost: lines.reduce((sum, line) => sum + asNumber(line.product.costPrice) * line.quantity, 0),
      totalProfit: total - lines.reduce((sum, line) => sum + asNumber(line.product.costPrice) * line.quantity, 0),
      discountAmount: discountValue, paymentMethod, paymentStatus: amountPaid >= total ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID",
      amountPaid, notes: paymentMethod === "SPLIT" ? "Split tender cash " + asNumber(splitCash) + " / MoMo " + asNumber(splitMomo) : "", receiptNumber: receiptNo, branchId: branchFilter === "ALL" ? activeBranches[0]?.id || "main_branch" : branchFilter,
      branchName: activeBranches.find((item) => item.id === (branchFilter === "ALL" ? activeBranches[0]?.id : branchFilter))?.name || "Main Branch",
      cashierId: "desktop-owner", cashierName: cache?.username || "Shop Owner",
    }, deviceId, at);
    const saleLines = lines.map((line) => record({
      saleId, productId: line.product.id, productName: line.product.name, category: line.product.category,
      unit: line.product.unit, quantitySold: line.quantity, costPriceAtSale: line.product.costPrice,
      unitPriceAtSale: line.price, subtotal: line.price * line.quantity,
      profit: (line.price - asNumber(line.product.costPrice)) * line.quantity,
      branchId: sale.branchId,
    }, deviceId, at));
    updateData((current) => ({
      ...current,
      sales: [...current.sales, sale],
      saleItems: [...current.saleItems, ...saleLines],
      products: current.products.map((product) => {
        const sold = lines.find((line) => line.product.id === product.id);
        return sold ? stamp({ ...product, quantityInStock: Math.max(0, asNumber(product.quantityInStock) - sold.quantity) }, deviceId, at) : product;
      }),
      customers: customer && total > amountPaid
        ? current.customers.map((item) => item.id === customer.id ? stamp({ ...item, debtBalance: asNumber(item.debtBalance) + total - amountPaid }, deviceId, at) : item)
        : current.customers,
    }));
    setReceipt({ sale, lines: saleLines, shopName: dataset.shopProfile.shopName, currency });
    setCart([]); setDiscount("0"); setPaid(""); setSplitCash(""); setSplitMomo(""); setSelectedCustomer("walk-in");
    toast.success("Sale " + receiptNo + " posted to the local ledger.");
  };

  const holdCurrentCart = async () => {
    if (!cart.length) return;
    const held: HeldCart = { id: uuid(), label: "Held sale " + new Date().toLocaleTimeString(), createdAt: Date.now(), items: cart, discount, paid, paymentMethod, selectedCustomer, splitCash, splitMomo };
    const next = [held, ...heldCarts].slice(0, 50);
    await persistHeldCarts(next);
    setCart([]); setDiscount("0"); setPaid(""); setSplitCash(""); setSplitMomo(""); setSelectedCustomer("walk-in"); setPaymentMethod("CASH");
    toast.success("Sale placed on hold in the encrypted desktop workspace.");
  };
  const resumeHeldCart = async (held: HeldCart) => {
    setCart(held.items); setDiscount(held.discount); setPaid(held.paid); setPaymentMethod(held.paymentMethod);
    setSelectedCustomer(held.selectedCustomer); setSplitCash(held.splitCash); setSplitMomo(held.splitMomo);
    await persistHeldCarts(heldCarts.filter(item => item.id !== held.id)); setSection("pos");
    toast.success("Held sale restored.");
  };
  const addToCart = (product: Row) => {
    if (asNumber(product.quantityInStock) <= 0) { toast.error("This item is out of stock."); return; }
    setCart((current) => {
      const found = current.find((line) => line.productId === product.id);
      if (!found) return [...current, { productId: product.id, quantity: 1, customPrice: null }];
      return current.map((line) => line.productId === product.id ? { ...line, quantity: Math.min(asNumber(product.quantityInStock), line.quantity + 1) } : line);
    });
  };

  const collectDebt = (customer: Row, amount: number, method: string, note: string) => {
    if (amount <= 0 || amount > asNumber(customer.debtBalance)) throw new Error("Payment must be positive and cannot exceed the customer's outstanding balance.");
    const at = Date.now();
    const payment = record({
      customerId: customer.id, customerName: customer.name, amount,
      previousDebt: asNumber(customer.debtBalance), remainingDebt: Math.max(0, asNumber(customer.debtBalance) - amount),
      paymentMethod: method, notes: note, receiptNumber: "PAY-" + String(at).slice(-8),
      paymentDate: at, recordedBy: cache?.username || "Shop Owner",
      branchId: branchFilter === "ALL" ? activeBranches[0]?.id || "main_branch" : branchFilter,
      branchName: activeBranches.find((item) => item.id === branchFilter)?.name || "Main Branch",
    }, cache?.desktopId || "DESKTOP-LOCAL", at);
    updateData((current) => ({
      ...current,
      customers: current.customers.map((row) => row.id === customer.id ? stamp({ ...row, debtBalance: Math.max(0, asNumber(row.debtBalance) - amount) }, cache?.desktopId || "DESKTOP-LOCAL", at) : row),
      customerPayments: [...current.customerPayments, payment],
    }));
  };

  const postPurchase = (event: FormEvent) => {
    event.preventDefault();
    if (!dataset) return;
    try {
      const product = dataset.products.find((p) => p.id === form.productId);
      if (!product) throw new Error("Choose an inventory item for this purchase.");
      const quantity = asNumber(form.quantity);
      const unitCost = asNumber(form.unitCost);
      if (quantity <= 0 || unitCost < 0) throw new Error("Enter a valid quantity and unit cost.");
      const at = Date.now();
      const purchase = record({
        productId: product.id, productName: product.name, category: product.category,
        supplierName: asText(form.supplierName, "Local Supplier"), supplierPhone: asText(form.supplierPhone),
        quantityPurchased: quantity, unitCostPrice: unitCost, totalPurchaseCost: quantity * unitCost,
        sellingPriceAtPurchase: asNumber(form.sellingPrice, asNumber(product.sellingPrice)),
        paymentStatus: asText(form.paymentStatus, "PAID_CASH"), invoiceNumber: asText(form.invoiceNumber),
        branchId: asText(form.branchId, activeBranches[0]?.id || "main_branch"),
        branchName: activeBranches.find((item) => item.id === asText(form.branchId))?.name || "Main Branch",
        purchasedByUserId: "desktop-owner", purchasedByName: cache?.username || "Shop Owner",
        notes: asText(form.notes), purchaseDate: at, isSynced: false,
      }, cache?.desktopId || "DESKTOP-LOCAL", at);
      updateData((current) => ({
        ...current,
        purchases: [...current.purchases, purchase],
        products: current.products.map((p) => p.id === product.id ? stamp({
          ...p, quantityInStock: asNumber(p.quantityInStock) + quantity,
          costPrice: unitCost, sellingPrice: asNumber(form.sellingPrice, asNumber(p.sellingPrice)),
          branchId: asText(form.branchId, p.branchId),
        }, cache?.desktopId || "DESKTOP-LOCAL", at) : p),
      }));
      setShowPurchaseForm(false); setForm({});
      toast.success("Purchase received and stock ledger updated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Purchase could not be posted."); }
  };

  const createTransfer = (event: FormEvent) => {
    event.preventDefault();
    if (!dataset) return;
    try {
      const product = dataset.products.find((p) => p.id === form.productId);
      const from = dataset.branches.find((b) => b.id === form.fromBranchId);
      const to = dataset.branches.find((b) => b.id === form.toBranchId);
      const quantity = asNumber(form.quantity);
      if (!product || !from || !to || from.id === to.id || quantity <= 0 || quantity > asNumber(product.quantityInStock)) {
        throw new Error("Choose valid source and destination branches, an item, and a quantity within available stock.");
      }
      const at = Date.now();
      const transfer = record({
        transferNumber: "TRF-" + String(at).slice(-8), productId: product.id, productName: product.name,
        fromBranchId: from.id, fromBranchName: from.name, toBranchId: to.id, toBranchName: to.name,
        quantity, unit: product.unit, costValueRwf: Math.round(quantity * asNumber(product.costPrice)),
        transferDate: at, status: "IN_TRANSIT", notes: asText(form.notes),
        transferredBy: cache?.username || "Shop Owner", receivedBy: "", receivedAt: 0,
        lastModifiedDeviceId: "WEB",
      }, "WEB", at);
      transfer.lastModifiedDeviceId = "WEB";
      updateData((current) => ({ ...current, stockTransfers: [...current.stockTransfers, transfer] }));
      setShowTransferForm(false); setForm({});
      toast.success("Transfer command published. The destination terminal will apply it on its next sync.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Transfer could not be created."); }
  };

  const changeTransfer = (transfer: Row, action: "receive" | "cancel") => {
    const at = Date.now();
    const status = action === "receive" ? "COMPLETED" : "CANCELLED";
    updateData((current) => ({
      ...current,
      stockTransfers: current.stockTransfers.map((row) => row.id === transfer.id ? { ...row, status, receivedBy: cache?.username || "Shop Owner", receivedAt: action === "receive" ? at : asNumber(row.receivedAt), lastModifiedDeviceId: "WEB", updatedAt: at, hlcTimestamp: newHlc(row.hlcTimestamp, at) } : row),
    }));
    toast.success(action === "receive" ? "Receipt confirmation command sent." : "Transfer cancellation command sent.");
  };

  const printReceipt = async () => {
    if (!receipt) return;
    if (bridge?.isDesktop) {
      const result = await bridge.printCurrentPage();
      if (!result.success) toast.error(result.failureReason || "Print failed.");
    } else window.print();
  };

  const openExport = (kind: "products" | "customers" | "sales" | "purchases") => {
    if (!dataset) return;
    const cols: Record<string, string[]> = {
      products: ["id", "name", "category", "barcode", "costPrice", "sellingPrice", "quantityInStock", "lowStockThreshold", "unit", "branchId"],
      customers: ["id", "name", "phone", "email", "address", "category", "creditLimit", "debtBalance"],
      sales: ["id", "receiptNumber", "saleDate", "customerName", "totalAmount", "totalCost", "totalProfit", "paymentMethod", "paymentStatus", "amountPaid", "branchName", "cashierName"],
      purchases: ["id", "productName", "supplierName", "supplierPhone", "quantityPurchased", "unitCostPrice", "totalPurchaseCost", "paymentStatus", "invoiceNumber", "purchaseDate"],
    };
    const rows = dataset[kind] as Row[];
    download("beboss-" + kind + "-" + new Date().toISOString().slice(0, 10) + ".csv", csv(rows, cols[kind]), "text/csv;charset=utf-8");
  };

  const createBackup = () => {
    if (!dataset) return;
    const payload = { ...dataset, metadata: { ...dataset.metadata, app: "BeBoss", format: "beboss_branch_datashare_v3", schemaVersion: 3, timestamp: Date.now() } };
    download("BeBoss-" + (dataset.shopProfile.shopName || "Business").replace(/[^a-z0-9_-]/gi, "_") + "-" + Date.now() + ".beboss", JSON.stringify(payload, null, 2), "application/json");
  };

  const restoreBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Row;
      const incoming = normaliseDataset(parsed, shop || {}, username, phone);
      if (!incoming.shopProfile.shopName) throw new Error("This backup does not contain a BeBoss shop profile.");
      if (!window.confirm("Restore this backup into the current registered shop? Records will be merged by ID and version on the next cloud synchronization.")) return;
      updateData((current) => {
        const keys: (keyof Dataset)[] = ["products", "customers", "sales", "saleItems", "customerPayments", "purchases", "stockTransfers", "branches", "users"];
        const next = { ...current };
        for (const key of keys) {
          const byId = new Map((current[key] as Row[]).map((row) => [row.id, row]));
          for (const row of incoming[key] as Row[]) {
            const old = byId.get(row.id);
            if (!old || asNumber(row.updatedAt) >= asNumber(old.updatedAt)) byId.set(row.id, row);
          }
          (next as Row)[key] = [...byId.values()];
        }
        next.tombstones = [...current.tombstones, ...incoming.tombstones];
        return next;
      });
      toast.success("Backup merged into the encrypted local ledger.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "The backup could not be read."); }
  };

  const updateBusinessProfile = (patch: Row) => {
    if (!dataset) return;
    updateData((current) => ({
      ...current,
      shopProfile: stamp({ ...current.shopProfile, ...patch }, cache?.desktopId || "DESKTOP-LOCAL"),
    }));
    toast.success("Business settings saved locally.");
  };

  if (booting) return <FullScreenMessage title="Preparing BeBoss Desktop" detail="Checking the encrypted device vault and restoring the business workspace…" />;
  if (!bridge?.isDesktop) return <FullScreenMessage title="BeBoss Desktop is required" detail="Open this route in the installed desktop application. The desktop client provides operating-system encrypted offline data and protected device services." />;
  if (!storageReady) return <FullScreenMessage title="Secure storage is unavailable" detail={syncMessage} />;
  if (!cache || !dataset) {
    return (
      <div className="min-h-screen bg-[#090f1a] px-5 py-10 text-white">
        <div className="mx-auto grid min-h-[80vh] max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[.2em] text-orange-300">
              <span className="h-2 w-2 rounded-full bg-orange-400" /> BeBoss Enterprise Workspace
            </div>
            <h1 className="mt-8 max-w-2xl text-5xl font-black leading-[1.05] tracking-tight">Every branch. Every sale. One command centre.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Secure owner access, offline-ready operations, inventory intelligence, customer credit, multi-branch stock movement and verified cloud synchronization with BeBoss Android terminals.</p>
            <div className="mt-10 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
              {["Point of sale","Stock control","Customer credit","Purchasing","Branch commands","Live reporting"].map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm font-semibold">{item}</div>)}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-[#111c2d] p-7 shadow-2xl shadow-black/30">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-500 text-xl font-black text-black">B</div>
              <div><div className="text-xl font-bold">Owner verification</div><div className="text-xs text-slate-400">SMS one-time password • secure tenant binding</div></div>
            </div>
            {!otpStage ? (
              <form className="mt-8 space-y-4" onSubmit={loginRequest}>
                <Field label="Shop owner username"><input required minLength={2} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="Registered owner username" className={inputClass} /></Field>
                <Field label="Registered Rwanda phone"><input required value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+250 7XX XXX XXX" className={inputClass} /></Field>
                <button disabled={busy} className={primaryButton + " w-full"}>{busy ? "Requesting verification…" : "Send secure verification code"}</button>
                <p className="text-xs leading-6 text-slate-500">The phone number must match the number already registered to this shop. The form does not reveal whether a username or shop exists.</p>
              </form>
            ) : (
              <form className="mt-8 space-y-4" onSubmit={verifyOwner}>
                <Field label="SMS verification code"><input required inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter the code sent to the registered phone" className={inputClass} /></Field>
                <button disabled={busy} className={primaryButton + " w-full"}>{busy ? "Verifying owner…" : "Verify and open workspace"}</button>
                <button type="button" onClick={() => setOtpStage(false)} className={secondaryButton + " w-full"}>Change owner details</button>
              </form>
            )}
            <div className="mt-7 flex items-center gap-2 border-t border-white/10 pt-5 text-xs text-slate-500"><LockKeyhole size={14} /> Encrypted session storage on this computer</div>
          </div>
        </div>
      </div>
    );
  }

  const totalCart = cart.reduce((sum, line) => {
    const product = dataset.products.find((p) => p.id === line.productId);
    return sum + (line.customPrice === null ? asNumber(product?.sellingPrice) : line.customPrice) * line.quantity;
  }, 0);
  const selectedBranch = branchFilter === "ALL" ? "All branches" : activeBranches.find((b) => b.id === branchFilter)?.name || "Branch";
  const groups = [...new Set(navigation.map((item) => item.group))];
  const pageTitle = navigation.find((item) => item.id === section)?.label || "Overview";

  return (
    <div className="min-h-screen bg-[#0a111c] text-slate-100">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[270px] flex-col border-r border-white/[.07] bg-[#0c1522] xl:flex">
          <div className="flex h-[76px] items-center gap-3 border-b border-white/[.07] px-6">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500 text-lg font-black text-[#10151b]">B</div>
            <div><div className="text-lg font-black tracking-tight">BeBoss</div><div className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">Desktop Enterprise</div></div>
          </div>
          <div className="border-b border-white/[.07] p-4">
            <div className="rounded-2xl border border-white/[.08] bg-white/[.035] p-3">
              <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-widest text-slate-500">Business</span><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">OWNER</span></div>
              <div className="mt-2 truncate text-sm font-bold">{dataset.shopProfile.shopName}</div>
              <div className="mt-1 truncate text-xs text-slate-500">@{cache.username}</div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {groups.map((group) => (
              <div key={group} className="mb-5">
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-600">{group}</div>
                <div className="space-y-1">
                  {navigation.filter((item) => item.group === group).map((item) => {
                    const Icon = item.icon;
                    return <button key={item.id} onClick={() => setSection(item.id)} className={"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition " + (section === item.id ? "bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/20" : "text-slate-400 hover:bg-white/[.05] hover:text-white")}>
                      <Icon size={17} strokeWidth={1.8} /><span className="flex-1">{item.label}</span>
                      {item.id === "inventory" && analytics?.lowStock.length ? <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-[10px] text-rose-300">{analytics.lowStock.length}</span> : null}
                    </button>;
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-white/[.07] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">{offline ? <WifiOff size={14} className="text-amber-300" /> : <Wifi size={14} className="text-emerald-300" />}{offline ? "Offline workspace" : "Cloud connected"}<span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" /></div>
            <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"><LogOut size={16} /> Sign out securely</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 xl:ml-[270px]">
          <header className="sticky top-0 z-20 flex min-h-[76px] flex-wrap items-center justify-between gap-4 border-b border-white/[.07] bg-[#0a111c]/90 px-5 py-3 backdrop-blur-xl lg:px-8">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-orange-300">Business command centre <ChevronRight size={12} /> {selectedBranch}</div>
              <h1 className="mt-1 text-xl font-black tracking-tight">{pageTitle}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Branch filter" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="max-w-40 rounded-xl border border-white/10 bg-[#111c2b] px-3 py-2 text-xs text-slate-200 outline-none"><option value="ALL">All branches</option>{activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              <div className={"flex items-center gap-2 rounded-xl border px-3 py-2 text-xs " + (dirty ? "border-amber-400/20 bg-amber-400/10 text-amber-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200")}>{syncing ? <RefreshCw size={14} className="animate-spin" /> : dirty ? <CloudOff size={14} /> : <Cloud size={14} />}{syncing ? "Syncing" : dirty ? "Pending sync" : "Synchronized"}</div>
              <button onClick={() => void syncNow().then(() => toast.success("Cloud sync completed.")).catch((error) => toast.error(error.message))} disabled={syncing || offline || licenseExpired} className={secondaryButton}><RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Sync now</button>
              <label className={secondaryButton + " cursor-pointer"}><Archive size={14} /> Import backup<input className="hidden" type="file" accept=".beboss,.json,application/json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void restoreBackup(file); e.currentTarget.value = ""; }} /></label>
            </div>
          </header>

          <div className="p-5 lg:p-8">
            {licenseExpired && <div className="mb-6 flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"><AlertCircle size={18} /> Subscription expired or suspended. Business mutations are locked until renewed. <button onClick={() => setSection("billing")} className="ml-auto font-bold underline">Renew</button></div>}
            {offline && <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[.08] p-4 text-sm text-amber-100"><WifiOff size={17} /> Offline mode: records are saved to encrypted local storage and will synchronize when the connection returns.</div>}

            {section === "overview" && analytics && <OverviewPanel
              analytics={analytics} dataset={dataset} currency={currency} lastSyncedAt={lastSyncedAt}
              setSection={setSection} createBackup={createBackup} />
            }

            {section === "pos" && <section className="grid gap-6 2xl:grid-cols-[1.35fr_.75fr]">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="text-2xl font-black">Fast checkout</h2><p className="mt-1 text-sm text-slate-500">Keyboard-wedge USB barcode scanners, searchable catalog and branch-aware stock.</p></div>
                  <div className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-slate-400"><Barcode size={14} className="mr-2 inline" />Scan barcode then press Enter</div>
                </div>
                <div className="relative"><Barcode size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-300" /><input autoFocus value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { const found = dataset.products.find((p) => p.barcode === barcode.trim() && p.isDeleted !== true); if (found) addToCart(found); else toast.error("No inventory item matches that barcode."); setBarcode(""); } }} placeholder="Scan item barcode or enter SKU…" className={inputClass + " pl-11"} /></div>
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {visibleProducts.slice(0, 18).map((product) => <button key={product.id} onClick={() => addToCart(product)} className="rounded-2xl border border-white/[.08] bg-[#111c2b] p-4 text-left transition hover:border-orange-400/40 hover:bg-orange-400/[.06]">
                    <div className="flex items-start justify-between gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-orange-400/10 text-orange-300"><Package size={17} /></div><span className={"rounded-full px-2 py-1 text-[10px] " + (asNumber(product.quantityInStock) <= asNumber(product.lowStockThreshold) ? "bg-rose-400/10 text-rose-300" : "bg-emerald-400/10 text-emerald-300")}>{asNumber(product.quantityInStock)} {product.unit}</span></div>
                    <div className="mt-4 line-clamp-1 font-bold">{product.name}</div><div className="mt-1 text-xs text-slate-500">{product.category || "General"} · {product.barcode || "No barcode"}</div>
                    <div className="mt-3 flex items-center justify-between"><span className="font-black text-orange-300">{money(product.sellingPrice, currency)}</span><Plus size={17} className="text-slate-500" /></div>
                  </button>)}
                </div>
              </div>
              <div className="rounded-3xl border border-white/[.08] bg-[#111c2b] p-5">
                <div className="flex items-center justify-between"><h3 className="text-lg font-black">Current basket</h3><span className="rounded-full bg-white/10 px-2.5 py-1 text-xs">{cart.length} lines</span></div>
                <div className="mt-4 max-h-[390px] space-y-3 overflow-y-auto">
                  {cart.map((line) => {
                    const p = dataset.products.find((item) => item.id === line.productId);
                    if (!p) return null;
                    const price = line.customPrice === null ? asNumber(p.sellingPrice) : line.customPrice;
                    return <div key={line.productId} className="rounded-xl border border-white/[.06] bg-white/[.025] p-3">
                      <div className="flex items-center justify-between gap-2"><span className="font-semibold">{p.name}</span><button onClick={() => setCart((rows) => rows.filter((item) => item.productId !== line.productId))} className="text-slate-600 hover:text-rose-300"><X size={15} /></button></div>
                      <div className="mt-2 flex items-center justify-between"><div className="flex items-center gap-2"><button onClick={() => setCart((rows) => rows.map((item) => item.productId === line.productId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))} className={smallButton}>−</button><span className="w-7 text-center text-sm tabular-nums">{line.quantity}</span><button onClick={() => setCart((rows) => rows.map((item) => item.productId === line.productId ? { ...item, quantity: Math.min(asNumber(p.quantityInStock), item.quantity + 1) } : item))} className={smallButton}>+</button></div><span className="font-bold">{money(price * line.quantity, currency)}</span></div>
                    </div>;
                  })}
                  {cart.length === 0 && <div className="grid min-h-40 place-items-center text-center text-sm text-slate-500">Choose products or scan a barcode to begin a sale.</div>}
                </div>
                <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                  <Field label="Customer"><select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className={inputClass}><option value="walk-in">Walk-in customer</option>{dataset.customers.filter((c) => c.isDeleted !== true).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></Field>
                  <div className="grid grid-cols-2 gap-3"><Field label="Discount (amount)"><input type="number" min="0" max={totalCart} value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputClass} /></Field><Field label="Amount paid"><input type="number" min="0" value={paid} placeholder={String(Math.max(0, totalCart - asNumber(discount)))} onChange={(e) => setPaid(e.target.value)} className={inputClass} /></Field></div>
                  <Field label="Payment method"><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}><option value="CASH">Cash</option><option value="MOMO">Mobile Money</option><option value="CARD">Card / POS</option><option value="BANK">Bank transfer</option><option value="DEBT">Customer credit</option><option value="SPLIT">Split cash + MoMo</option></select></Field>
                  {paymentMethod === "SPLIT" && <div className="grid grid-cols-2 gap-3"><Field label="Cash portion"><input type="number" min="0" value={splitCash} onChange={e=>setSplitCash(e.target.value)} className={inputClass}/></Field><Field label="Mobile Money portion"><input type="number" min="0" value={splitMomo} onChange={e=>setSplitMomo(e.target.value)} className={inputClass}/></Field></div>}
                  <div className="flex justify-between text-sm text-slate-400"><span>Subtotal</span><span>{money(totalCart, currency)}</span></div>
                  <div className="flex justify-between text-sm text-slate-400"><span>Discount</span><span>−{money(discount, currency)}</span></div>
                  {asNumber(dataset.shopProfile.taxRate)>0 && <div className="flex justify-between text-xs text-slate-500"><span>Included VAT ({dataset.shopProfile.taxRate}%)</span><span>{money(Math.max(0,totalCart-asNumber(discount))*asNumber(dataset.shopProfile.taxRate)/(100+asNumber(dataset.shopProfile.taxRate)),currency)}</span></div>}
                  <div className="flex justify-between border-t border-white/10 pt-3 text-xl font-black"><span>Total due</span><span className="text-orange-300">{money(Math.max(0, totalCart - asNumber(discount)), currency)}</span></div>
                  <div className="grid grid-cols-2 gap-2"><button disabled={!cart.length || licenseExpired} onClick={() => void holdCurrentCart()} className={secondaryButton + " w-full"}><Archive size={15}/> Hold sale</button><button disabled={!cart.length || licenseExpired} onClick={() => { try { createSale(); } catch (error) { toast.error(error instanceof Error ? error.message : "Sale could not be completed."); } }} className={primaryButton + " w-full"}><CheckCircle2 size={16} /> Complete sale</button></div>
                  {heldCarts.length>0 && <SectionCard title={"Held sales ("+heldCarts.length+")"}><div className="space-y-2">{heldCarts.slice(0,8).map(held=><div key={held.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/5 p-2"><div><div className="text-xs font-bold">{held.label}</div><div className="text-[10px] text-slate-500">{held.items.length} lines · {dateLabel(held.createdAt)}</div></div><div className="flex gap-1"><button onClick={()=>void resumeHeldCart(held)} className={smallButton}>Resume</button><button onClick={()=>void persistHeldCarts(heldCarts.filter(x=>x.id!==held.id))} className={smallButton}><Trash2 size={12}/></button></div></div>)}</div></SectionCard>}
                </div>
              </div>
            </section>}

            {section === "inventory" && <section className="space-y-5">
              <PageHeading title="Inventory intelligence" subtitle="Catalog, pricing, barcode, branch stock, stock valuation and reorder control." action={<button onClick={() => { setForm({ name: "", category: "General", costPrice: "", sellingPrice: "", quantityInStock: "0", lowStockThreshold: "5", unit: "pcs", barcode: "", branchId: activeBranches[0]?.id || "main_branch" }); setShowProductForm(true); }} className={primaryButton}><Plus size={15} /> Add product</button>} />
              <SearchBar value={search} onChange={setSearch} placeholder="Search product, category or barcode…" />
              {showProductForm && !form.id && <ProductForm form={form} setForm={setForm} branches={activeBranches} onCancel={() => setShowProductForm(false)} onSubmit={() => {
                if (!asText(form.name).trim()) { toast.error("Product name is required."); return; }
                const made = record({ ...form, name: asText(form.name).trim(), costPrice: asNumber(form.costPrice), sellingPrice: asNumber(form.sellingPrice), quantityInStock: asNumber(form.quantityInStock), lowStockThreshold: asNumber(form.lowStockThreshold), branchId: asText(form.branchId), isDeleted: false }, cache.desktopId);
                updateData((current) => ({ ...current, products: [...current.products, made] }));
                setShowProductForm(false); toast.success("Product added to inventory.");
              }} />}
              <div className="grid gap-3 md:grid-cols-4"><Metric label="Catalog items" value={analytics?.inventoryCount || 0} /><Metric label="Low stock" value={analytics?.lowStock.length || 0} tone="warning" /><Metric label="Cost valuation" value={money(analytics?.stockValue || 0, currency)} /><Metric label="Stock units" value={dataset.products.reduce((s, p) => s + asNumber(p.quantityInStock), 0).toLocaleString()} /></div>
              <DataTable headers={["Product","SKU / Barcode","Category","Stock","Cost","Selling price","Margin","Actions"]} empty="No inventory records match your search." rows={visibleProducts.map((p) => [
                <div><div className="font-bold">{p.name}</div><div className="text-xs text-slate-500">{activeBranches.find((b) => b.id === p.branchId)?.name || "All branches"}</div></div>,
                <span className="font-mono text-xs">{p.barcode || "—"}</span>, p.category || "General",
                <span className={asNumber(p.quantityInStock) <= asNumber(p.lowStockThreshold) ? "font-bold text-rose-300" : "font-semibold"}>{p.quantityInStock} {p.unit}</span>,
                money(p.costPrice, currency), money(p.sellingPrice, currency),
                <span>{asNumber(p.sellingPrice) > 0 ? Math.round((asNumber(p.sellingPrice) - asNumber(p.costPrice)) / asNumber(p.sellingPrice) * 100) : 0}%</span>,
                <div className="flex gap-2"><button title="Edit product" onClick={() => { setForm({ ...p }); setShowProductForm(true); }} className={smallButton}><Settings size={13} /></button><button title="Delete product" onClick={() => { if (window.confirm("Delete " + p.name + "? A sync tombstone will prevent old devices from restoring it.")) deleteRecord("products", p); }} className={smallButton}><Trash2 size={13} /></button></div>,
              ])} />
              {showProductForm && form.id && <Modal title="Edit inventory item" onClose={() => setShowProductForm(false)}><ProductForm form={form} setForm={setForm} branches={activeBranches} onCancel={() => setShowProductForm(false)} onSubmit={() => {
                updateRecord("products", form.id, { ...form, costPrice: asNumber(form.costPrice), sellingPrice: asNumber(form.sellingPrice), quantityInStock: asNumber(form.quantityInStock), lowStockThreshold: asNumber(form.lowStockThreshold) });
                setShowProductForm(false); toast.success("Product details updated.");
              }} /></Modal>}
            </section>}

            {section === "customers" && <section className="space-y-5">
              <PageHeading title="Customer relationships & credit" subtitle="Customer profiles, credit limits, outstanding balances and receipted debt collection." action={<button onClick={() => { setForm({ name: "", phone: "", email: "", address: "", category: "Regular Customer", creditLimit: 500000, debtBalance: 0, notes: "" }); setShowCustomerForm(true); }} className={primaryButton}><Plus size={15} /> Add customer</button>} />
              <SearchBar value={search} onChange={setSearch} placeholder="Search customers by name or phone…" />
              <div className="grid gap-3 md:grid-cols-3"><Metric label="Customers" value={analytics?.customerCount || 0} /><Metric label="Outstanding customer debt" value={money(analytics?.debt || 0, currency)} tone="warning" /><Metric label="Payments recorded" value={dataset.customerPayments.length} /></div>
              {showCustomerForm && <Modal title="Register customer" onClose={() => setShowCustomerForm(false)}><CustomerForm form={form} setForm={setForm} onCancel={() => setShowCustomerForm(false)} onSubmit={() => {
                if (!asText(form.name).trim()) { toast.error("Customer name is required."); return; }
                addRecord("customers", { ...form, name: asText(form.name).trim(), creditLimit: asNumber(form.creditLimit), debtBalance: 0, isDeleted: false });
                setShowCustomerForm(false); toast.success("Customer profile created.");
              }} /></Modal>}
              <DataTable headers={["Customer","Contact","Category","Credit limit","Outstanding debt","Actions"]} empty="No matching customers." rows={visibleCustomers.map((c) => [
                <div className="flex items-center gap-3"><Avatar name={c.name} /><div><div className="font-bold">{c.name}</div><div className="text-xs text-slate-500">{c.email || c.address || "Customer profile"}</div></div></div>,
                c.phone || "—", c.category || "Regular",
                money(c.creditLimit, currency), <span className={asNumber(c.debtBalance) > 0 ? "font-bold text-amber-300" : "text-emerald-300"}>{money(c.debtBalance, currency)}</span>,
                <div className="flex flex-wrap gap-2"><button onClick={() => { const raw = window.prompt("Payment amount in RWF", String(c.debtBalance || "")); if (raw === null) return; try { collectDebt(c, asNumber(raw), "Cash", "Desktop debt collection"); toast.success("Customer payment recorded."); } catch (error) { toast.error(error instanceof Error ? error.message : "Payment rejected."); } }} disabled={asNumber(c.debtBalance) <= 0} className={smallButton}>Collect debt</button><button onClick={() => { setForm({ ...c }); setShowCustomerForm(true); }} className={smallButton}><Settings size={13} /></button><button onClick={() => deleteRecord("customers", c)} className={smallButton}><Trash2 size={13} /></button></div>,
              ])} />
              {showCustomerForm && form.id && <Modal title="Update customer" onClose={() => setShowCustomerForm(false)}><CustomerForm form={form} setForm={setForm} onCancel={() => setShowCustomerForm(false)} onSubmit={() => { updateRecord("customers", form.id, { ...form, creditLimit: asNumber(form.creditLimit) }); setShowCustomerForm(false); toast.success("Customer profile updated."); }} /></Modal>}
              <SectionCard title="Recent debt receipts"><DataTable headers={["Receipt","Customer","Paid","Method","Date","Remaining"]} empty="No customer payments recorded yet." rows={[...dataset.customerPayments].sort((a,b)=>asNumber(b.paymentDate)-asNumber(a.paymentDate)).slice(0,12).map((p)=>[p.receiptNumber,p.customerName,money(p.amount,currency),p.paymentMethod,dateLabel(p.paymentDate),money(p.remainingDebt,currency)])} /></SectionCard>
            </section>}

            {section === "sales" && <section className="space-y-5">
              <PageHeading title="Sales ledger" subtitle="Receipts, payment status, cashier accountability and sales evidence." action={<button onClick={() => openExport("sales")} className={secondaryButton}><Download size={15} /> Export CSV</button>} />
              <SearchBar value={search} onChange={setSearch} placeholder="Search receipt, customer or cashier…" />
              <div className="grid gap-3 md:grid-cols-4"><Metric label="All-time transactions" value={dataset.sales.length} /><Metric label="Revenue today" value={money(analytics?.todayRevenue || 0, currency)} /><Metric label="Profit today" value={money(analytics?.todayProfit || 0, currency)} tone="positive" /><Metric label="30-day revenue" value={money(analytics?.revenue30 || 0, currency)} /></div>
              <DataTable headers={["Receipt / date","Customer","Items","Total","Paid","Payment status","Cashier","Branch"]} empty="No sales records found." rows={[...dataset.sales].filter((s) => (asText(s.receiptNumber)+" "+asText(s.customerName)+" "+asText(s.cashierName)).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>asNumber(b.saleDate)-asNumber(a.saleDate)).map((s)=>[
                <div><div className="font-mono font-bold text-orange-300">{s.receiptNumber || s.id.slice(0,8)}</div><div className="text-xs text-slate-500">{dateLabel(s.saleDate)}</div></div>,
                s.customerName || "Walk-in", dataset.saleItems.filter((item)=>item.saleId===s.id).reduce((n,item)=>n+asNumber(item.quantitySold),0),
                money(s.totalAmount,currency),money(s.amountPaid,currency),
                <span className={"rounded-full px-2 py-1 text-[10px] font-bold "+(s.paymentStatus==="PAID"?"bg-emerald-400/10 text-emerald-300":"bg-amber-400/10 text-amber-300")}>{s.paymentStatus}</span>,
                s.cashierName || "—", s.branchName || "—",
              ])} />
            </section>}

            {section === "purchases" && <section className="space-y-5">
              <PageHeading title="Purchasing & supplier ledger" subtitle="Capture supplier invoices, purchase quantities, cost prices and inventory receipts." action={<button onClick={() => { setForm({ productId: dataset.products[0]?.id || "", quantity: "1", unitCost: "", sellingPrice: "", supplierName: "", supplierPhone: "", paymentStatus: "PAID_CASH", invoiceNumber: "", branchId: activeBranches[0]?.id || "main_branch", notes: "" }); setShowPurchaseForm(true); }} className={primaryButton}><PackagePlus size={15} /> Record purchase</button>} />
              {showPurchaseForm && <Modal title="Receive supplier purchase" onClose={() => setShowPurchaseForm(false)}><form onSubmit={postPurchase} className="grid gap-3 sm:grid-cols-2">
                <Field label="Inventory item"><select required value={form.productId || ""} onChange={(e)=>setForm({...form,productId:e.target.value})} className={inputClass}>{dataset.products.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                <Field label="Receiving branch"><select value={form.branchId} onChange={(e)=>setForm({...form,branchId:e.target.value})} className={inputClass}>{activeBranches.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
                <Field label="Supplier name"><input required value={form.supplierName||""} onChange={(e)=>setForm({...form,supplierName:e.target.value})} className={inputClass}/></Field>
                <Field label="Supplier phone"><input value={form.supplierPhone||""} onChange={(e)=>setForm({...form,supplierPhone:e.target.value})} className={inputClass}/></Field>
                <Field label="Quantity received"><input type="number" min="0.001" step="any" required value={form.quantity||""} onChange={(e)=>setForm({...form,quantity:e.target.value})} className={inputClass}/></Field>
                <Field label="Unit cost"><input type="number" min="0" step="any" required value={form.unitCost||""} onChange={(e)=>setForm({...form,unitCost:e.target.value})} className={inputClass}/></Field>
                <Field label="New selling price"><input type="number" min="0" step="any" value={form.sellingPrice||""} onChange={(e)=>setForm({...form,sellingPrice:e.target.value})} className={inputClass}/></Field>
                <Field label="Invoice number"><input value={form.invoiceNumber||""} onChange={(e)=>setForm({...form,invoiceNumber:e.target.value})} className={inputClass}/></Field>
                <Field label="Purchase settlement"><select value={form.paymentStatus} onChange={(e)=>setForm({...form,paymentStatus:e.target.value})} className={inputClass}><option value="PAID_CASH">Paid cash</option><option value="PAID_MOMO">Paid MoMo</option><option value="PAID_BANK">Paid bank</option><option value="SUPPLIER_CREDIT">Supplier credit</option></select></Field>
                <Field label="Notes"><input value={form.notes||""} onChange={(e)=>setForm({...form,notes:e.target.value})} className={inputClass}/></Field>
                <div className="col-span-full flex justify-end gap-2"><button type="button" onClick={()=>setShowPurchaseForm(false)} className={secondaryButton}>Cancel</button><button className={primaryButton}><Check size={15}/> Receive stock</button></div>
              </form></Modal>}
              <div className="grid gap-3 md:grid-cols-3"><Metric label="Purchase records" value={dataset.purchases.length}/><Metric label="Purchase spend" value={money(dataset.purchases.reduce((s,p)=>s+asNumber(p.totalPurchaseCost),0),currency)}/><Metric label="Supplier accounts" value={new Set(dataset.purchases.map(p=>asText(p.supplierName))).size}/></div>
              <DataTable headers={["Date / invoice","Supplier","Product","Quantity","Unit cost","Total cost","Settlement","Branch"]} empty="No supplier purchases yet." rows={[...dataset.purchases].sort((a,b)=>asNumber(b.purchaseDate)-asNumber(a.purchaseDate)).map((p)=>[
                <div><div className="font-bold">{p.invoiceNumber||"No invoice"}</div><div className="text-xs text-slate-500">{dateLabel(p.purchaseDate)}</div></div>,
                <div>{p.supplierName}<div className="text-xs text-slate-500">{p.supplierPhone}</div></div>,p.productName,p.quantityPurchased,money(p.unitCostPrice,currency),money(p.totalPurchaseCost,currency),p.paymentStatus,p.branchName
              ])}/>
            </section>}

            {section === "transfers" && <section className="space-y-5">
              <PageHeading title="Inter-branch stock commands" subtitle="Create movements, send receipt-confirmation and cancellation commands to Android terminals." action={<button onClick={()=>{setForm({productId:dataset.products[0]?.id||"",fromBranchId:activeBranches[0]?.id||"",toBranchId:activeBranches[1]?.id||"",quantity:"1",notes:""});setShowTransferForm(true);}} className={primaryButton}><Plus size={15}/> New transfer</button>} />
              {showTransferForm && <Modal title="Create branch transfer" onClose={()=>setShowTransferForm(false)}><form onSubmit={createTransfer} className="grid gap-3 sm:grid-cols-2">
                <Field label="Product"><select value={form.productId} onChange={(e)=>setForm({...form,productId:e.target.value})} className={inputClass}>{dataset.products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.quantityInStock} {p.unit}</option>)}</select></Field>
                <Field label="Quantity"><input type="number" min="0.001" step="any" value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})} className={inputClass}/></Field>
                <Field label="From branch"><select value={form.fromBranchId} onChange={(e)=>setForm({...form,fromBranchId:e.target.value})} className={inputClass}>{activeBranches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
                <Field label="To branch"><select value={form.toBranchId} onChange={(e)=>setForm({...form,toBranchId:e.target.value})} className={inputClass}>{activeBranches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
                <Field label="Transfer notes"><input value={form.notes||""} onChange={(e)=>setForm({...form,notes:e.target.value})} className={inputClass}/></Field>
                <div className="col-span-full flex justify-end gap-2"><button type="button" onClick={()=>setShowTransferForm(false)} className={secondaryButton}>Cancel</button><button className={primaryButton}>Send transfer request</button></div>
              </form><p className="mt-4 text-xs text-amber-200">The receiving/dispatch Android device applies inventory changes using its transactional transfer manager during its next sync. Do not manually alter source or destination stock while the command is pending.</p></Modal>}
              <DataTable headers={["Transfer","Product","From","To","Quantity","Status","Updated","Actions"]} empty="No branch transfers have been created." rows={[...dataset.stockTransfers].sort((a,b)=>asNumber(b.updatedAt)-asNumber(a.updatedAt)).map((t)=>[
                <span className="font-mono text-xs font-bold">{t.transferNumber||t.id.slice(0,8)}</span>,t.productName,t.fromBranchName,t.toBranchName,t.quantity+" "+(t.unit||"pcs"),
                <StatusPill status={t.status}/>,dateLabel(t.updatedAt||t.transferDate),
                <div className="flex gap-2">{t.status==="IN_TRANSIT"&&<button onClick={()=>changeTransfer(t,"receive")} className={smallButton}>Confirm received</button>}{t.status==="IN_TRANSIT"&&<button onClick={()=>changeTransfer(t,"cancel")} className={smallButton}>Cancel</button>}</div>
              ])}/>
            </section>}

            {section === "branches" && <section className="space-y-5">
              <PageHeading title="Branch operations" subtitle="Branch directory, operating status, managers, opening floats and commercial targets." action={<button onClick={()=>{setForm({name:"",code:"",address:"",phone:"",managerName:"",isMainBranch:false,isActive:true,operationalStatus:"OPEN",dailySalesTargetRwf:0,monthlyTargetRwf:0,openingCashFloat:0,notes:""});setShowBranchForm(true);}} className={primaryButton}><Plus size={15}/> Add branch</button>}/>
              {showBranchForm&&<Modal title="Register business branch" onClose={()=>setShowBranchForm(false)}><form onSubmit={(e)=>{e.preventDefault();if(!asText(form.name).trim()){toast.error("Branch name is required.");return;}const newBranch=record({...form,name:asText(form.name).trim(),isMainBranch:dataset.branches.length===0,openingCashFloat:asNumber(form.openingCashFloat),dailySalesTargetRwf:asNumber(form.dailySalesTargetRwf),monthlyTargetRwf:asNumber(form.monthlyTargetRwf),stockValueRwf:0,productCount:0},cache.desktopId);updateData((current)=>({...current,branches:[...current.branches,newBranch]}));setShowBranchForm(false);toast.success("Branch created and queued for cloud publication.");}} className="grid gap-3 sm:grid-cols-2">
                {(["name","code","address","phone","managerName","dailySalesTargetRwf","monthlyTargetRwf","openingCashFloat","notes"] as string[]).map(k=><Field key={k} label={k.replace(/([A-Z])/g," $1")}><input value={form[k]??""} onChange={(e)=>setForm({...form,[k]:e.target.value})} className={inputClass}/></Field>)}
                <Field label="Operational status"><select value={form.operationalStatus} onChange={(e)=>setForm({...form,operationalStatus:e.target.value})} className={inputClass}><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="SUSPENDED">Suspended</option></select></Field>
                <div className="col-span-full flex justify-end gap-2"><button type="button" onClick={()=>setShowBranchForm(false)} className={secondaryButton}>Cancel</button><button className={primaryButton}>Create branch</button></div>
              </form></Modal>}
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{dataset.branches.map((branch)=>{const branchProducts=dataset.products.filter((p)=>p.branchId===branch.id||!p.branchId);const value=branchProducts.reduce((sum,p)=>sum+asNumber(p.quantityInStock)*asNumber(p.costPrice),0);const sales=dataset.sales.filter((s)=>s.branchId===branch.id);return <div key={branch.id} className="rounded-3xl border border-white/[.08] bg-[#111c2b] p-5"><div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-400/10 text-orange-300"><Building2 size={20}/></div><StatusPill status={branch.operationalStatus||"OPEN"}/></div><div className="mt-5 text-xl font-black">{branch.name}</div><div className="mt-1 text-xs text-slate-500">{branch.code||"No branch code"} · {branch.address||"Address not set"}</div><div className="mt-5 grid grid-cols-2 gap-3"><MiniMetric label="Stock value" value={money(value,currency)}/><MiniMetric label="Sales" value={sales.length}/><MiniMetric label="Daily target" value={money(branch.dailySalesTargetRwf,currency)}/><MiniMetric label="Opening float" value={money(branch.openingCashFloat,currency)}/></div><div className="mt-5 flex items-center justify-between border-t border-white/[.07] pt-4 text-xs text-slate-400"><span>{branch.managerName||"Manager not assigned"}</span><span>{branch.isMainBranch?"Main branch":branch.isActive===false?"Inactive":"Active"}</span></div><div className="mt-3 flex justify-end gap-2"><button onClick={()=>{setForm({...branch});setShowBranchForm(true);}} className={smallButton}>Edit</button><button onClick={()=>updateRecord("branches",branch.id,{isActive:branch.isActive===false,operationalStatus:branch.isActive===false?"OPEN":"CLOSED"})} className={smallButton}>{branch.isActive===false?"Activate":"Close branch"}</button></div></div>})}</div>
              {showBranchForm&&form.id&&<Modal title="Edit branch" onClose={()=>setShowBranchForm(false)}><form onSubmit={(e)=>{e.preventDefault();updateRecord("branches",form.id,{...form,dailySalesTargetRwf:asNumber(form.dailySalesTargetRwf),monthlyTargetRwf:asNumber(form.monthlyTargetRwf),openingCashFloat:asNumber(form.openingCashFloat)});setShowBranchForm(false);}} className="grid gap-3 sm:grid-cols-2">{(["name","code","address","phone","managerName","dailySalesTargetRwf","monthlyTargetRwf","openingCashFloat","notes"] as string[]).map(k=><Field key={k} label={k.replace(/([A-Z])/g," $1")}><input value={form[k]??""} onChange={(e)=>setForm({...form,[k]:e.target.value})} className={inputClass}/></Field>)}<div className="col-span-full flex justify-end gap-2"><button type="button" onClick={()=>setShowBranchForm(false)} className={secondaryButton}>Cancel</button><button className={primaryButton}>Save changes</button></div></form></Modal>}
            </section>}

            {section === "staff" && <section className="space-y-5">
              <PageHeading title="Staff & access governance" subtitle="Review mobile staff accounts, role scope, branch assignments and active status."/>
              <div className="rounded-2xl border border-blue-400/20 bg-blue-400/[.07] p-4 text-sm text-blue-100">Staff authentication credentials and PIN hashes are never copied to the desktop or the cloud snapshot. New staff credentials must be created securely on an enrolled Android owner terminal; this workspace manages the shared staff role and access metadata only.</div>
              <DataTable headers={["Staff member","Username","Role","Assigned branch","Status","Permissions"]} empty="Staff directory is empty. Create staff profiles on the owner Android terminal and synchronize the shop." rows={(dataset.users.length?dataset.users:staffDirectory).map((u)=>[
                <div><div className="font-bold">{u.name||u.full_name}</div><div className="text-xs text-slate-500">{u.phone||""}</div></div>,
                <span className="font-mono text-xs">{u.username}</span>,
                <select value={u.role||"CASHIER"} onChange={(e)=>updateRecord("users",u.id,{role:e.target.value,updatedAt:Date.now()})} className="rounded-lg border border-white/10 bg-[#162437] px-2 py-1 text-xs"><option value="OWNER">Owner</option><option value="MANAGER">Manager</option><option value="CASHIER">Cashier</option></select>,
                <select value={u.assignedBranchId||""} onChange={(e)=>{const b=activeBranches.find(x=>x.id===e.target.value);updateRecord("users",u.id,{assignedBranchId:e.target.value,assignedBranchName:b?.name||"All Branches"});}} className="max-w-40 rounded-lg border border-white/10 bg-[#162437] px-2 py-1 text-xs"><option value="">All branches</option>{activeBranches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>,
                <button onClick={()=>updateRecord("users",u.id,{isActive:u.isActive===false})} className={u.isActive===false?"text-rose-300":"text-emerald-300"}>{u.isActive===false?"Inactive":"Active"}</button>,
                <div className="flex flex-wrap gap-1">{["canSellPOS","canManageInventory","canViewAnalytics","canCollectDebt","canExportReports"].map((perm)=>{const label=perm.replace("can","").replace(/([A-Z])/g," $1");return <button key={perm} onClick={()=>updateRecord("users",u.id,{[perm]:u[perm]===false})} title={label} className={"rounded-md px-2 py-1 text-[10px] "+(u[perm]===false?"bg-white/5 text-slate-600":"bg-emerald-400/10 text-emerald-200")}>{label}</button>;})}</div>,
              ])}/>
            </section>}

            {section === "devices" && <section className="space-y-5">
              <PageHeading title="Terminal fleet" subtitle="Review enrolled Android endpoints, issue single-use terminal pairing codes and control device access." action={<button onClick={()=>{setDeviceForm({deviceName:"Branch terminal",assignedUserId:dataset.users.find(u=>u.role!=="OWNER"&&u.isActive!==false)?.id||"",branchId:activeBranches[0]?.id||""});setDeviceInvite(null);setShowDeviceForm(true);}} className={primaryButton}><Plus size={15}/> Pair Android terminal</button>}/>
              {showDeviceForm && <Modal title="Create secure terminal invitation" onClose={()=>setShowDeviceForm(false)}><form onSubmit={async(e)=>{e.preventDefault();setBusy(true);try{const result=await addMyShopDevice({data:{username:cache.username,phone:cache.phone,deviceName:asText(deviceForm.deviceName),assignedUserId:asText(deviceForm.assignedUserId),branchId:asText(deviceForm.branchId)}});setDeviceInvite(result as Row);setShowDeviceForm(false);toast.success("Single-use pairing invitation issued.");}catch(error){toast.error(error instanceof Error?error.message:"Could not issue a terminal invite.");}finally{setBusy(false);}}} className="space-y-3">
                <Field label="Terminal name"><input required value={deviceForm.deviceName||""} onChange={e=>setDeviceForm({...deviceForm,deviceName:e.target.value})} className={inputClass}/></Field>
                <Field label="Assigned staff member"><select required value={deviceForm.assignedUserId||""} onChange={e=>setDeviceForm({...deviceForm,assignedUserId:e.target.value})} className={inputClass}><option value="">Select staff</option>{dataset.users.filter(u=>u.isActive!==false&&u.role!=="OWNER").map(u=><option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}</select></Field>
                <Field label="Assigned branch"><select required value={deviceForm.branchId||""} onChange={e=>setDeviceForm({...deviceForm,branchId:e.target.value})} className={inputClass}>{activeBranches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
                <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowDeviceForm(false)} className={secondaryButton}>Cancel</button><button disabled={busy||!dataset.users.some(u=>u.role!=="OWNER")} className={primaryButton}>{busy?"Issuing…":"Generate pairing code"}</button></div>
              </form></Modal>}
              {deviceInvite&&<Modal title="One-time terminal pairing code" onClose={()=>setDeviceInvite(null)}><p className="text-sm text-slate-400">Give this code to the new Android terminal. It expires at {dateLabel(deviceInvite.expiresAt)} and is displayed only once.</p><div className="my-5 rounded-2xl border border-orange-400/20 bg-orange-400/10 p-5 text-center font-mono text-xl font-black tracking-wider text-orange-200">{deviceInvite.joinCode}</div><button onClick={()=>void navigator.clipboard.writeText(asText(deviceInvite.joinCode)).then(()=>toast.success("Pairing code copied."))} className={primaryButton+" w-full"}>Copy pairing code</button></Modal>}
              <div className="grid gap-3 md:grid-cols-3"><Metric label="Known terminals" value={devices.length}/><Metric label="Active terminals" value={devices.filter((d)=>d.is_active).length}/><Metric label="Inactive terminals" value={devices.filter((d)=>!d.is_active).length}/></div>
              <DataTable headers={["Device","Terminal ID","Role","Assigned staff","Branch","Last sync","Status","Action"]} empty="No terminal registry data is available yet." rows={devices.map((d)=>[
                <div className="flex items-center gap-2"><Smartphone size={16} className="text-orange-300"/><span className="font-semibold">{d.device_name||"BeBoss terminal"}</span></div>,
                <span className="font-mono text-[10px]">{d.device_id||d.id}</span>,d.role||"—",d.assigned_user_name||"—",d.branch_name||"—",dateLabel(d.last_synced_at),
                <StatusPill status={d.is_active?"ACTIVE":"PAUSED"}/>,
                <button disabled={!d.is_active||d.is_owner_primary} onClick={async()=>{if(!window.confirm("Pause this terminal?"))return;try{const {data,error}=await supabase.functions.invoke("desktop-workspace",{body:{action:"device-pause",shopId:cache.shopId,desktopId:cache.desktopId,deviceRecordId:d.id}});if(error)throw error;if(!data?.ok)throw new Error(data?.error||"Device pause failed");setDevices((list)=>list.map((x)=>x.id===d.id?{...x,is_active:false}:x));toast.success("Terminal paused.");}catch(error){toast.error(error instanceof Error?error.message:"Could not pause terminal.");}}} className={smallButton}>{d.is_owner_primary?"Primary owner":d.is_active?"Pause device":"Paused"}</button>
              ])}/>
              <div className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4 text-sm text-slate-400">Pairing invitations are issued through the existing owner-device registry. Every invitation is single-use, short-lived and bound to a staff member and active branch. Additional terminal fees follow the existing shop subscription rules.</div>
            </section>}

            {section === "analytics" && analytics && <section className="space-y-5">
              <PageHeading title="Business analytics & demand forecast" subtitle="Live calculations from the shared sales, stock, purchasing and customer ledgers." action={<button onClick={()=>openExport("sales")} className={secondaryButton}><Download size={15}/> Export sales data</button>}/>
              <div className="grid gap-3 md:grid-cols-4"><Metric label="Revenue · 30 days" value={money(analytics.revenue30,currency)}/><Metric label="Gross profit · 30 days" value={money(analytics.profit30,currency)} tone="positive"/><Metric label="Average ticket" value={money(analytics.orders30?analytics.revenue30/analytics.orders30:0,currency)}/><Metric label="Stock at cost" value={money(analytics.stockValue,currency)}/></div>
              <SectionCard title="Daily revenue · last 7 days"><div className="flex h-52 items-end gap-3 px-2 pt-4">{analytics.daily.map((d)=>{const max=Math.max(1,...analytics.daily.map(x=>x.revenue));return <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div title={money(d.revenue,currency)} className="w-full max-w-16 rounded-t-lg bg-gradient-to-t from-orange-600 to-orange-300" style={{height:Math.max(3,d.revenue/max*100)+"%"}}/><div className="text-[10px] text-slate-500">{d.label}</div></div>;})}</div></SectionCard>
              <div className="grid gap-5 xl:grid-cols-2"><SectionCard title="Top-selling items"><div className="space-y-4">{analytics.topProducts.map((p,i)=><div key={p.name} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-xs font-bold text-slate-400">{i+1}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{p.name}</div><div className="text-xs text-slate-500">{p.quantity} units sold</div></div><div className="text-sm font-bold">{money(p.revenue,currency)}</div></div>)}</div></SectionCard><SectionCard title="Inventory reorder forecast"><div className="space-y-3">{dataset.products.filter(p=>p.isDeleted!==true).map(p=>{const saleDates=new Map(dataset.sales.map(sale=>[sale.id,asNumber(sale.saleDate)]));const result=forecastProduct(dataset,p.id,branchFilter);const demand=result.dailyDemand;const cover=demand>0?asNumber(p.quantityInStock)/demand:Infinity;const target=result.leadTimeDemand+result.safetyStock;const suggested=Math.max(0,Math.ceil(target-asNumber(p.quantityInStock)));return {p,demand,cover,suggested,result};}).filter(x=>x.suggested>0||x.p.quantityInStock<=x.p.lowStockThreshold).sort((a,b)=>a.cover-b.cover).slice(0,12).map(x=><div key={x.p.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] bg-white/[.025] p-3"><div><div className="text-sm font-bold">{x.p.name}</div><div className="text-xs text-slate-500">Stock {x.p.quantityInStock} · {x.demand.toFixed(2)} forecast/day · {x.result.salesDays}/56 days</div></div><div className="text-right"><div className="font-black text-amber-300">{x.suggested} units</div><div className="text-[10px] text-slate-500">{Number.isFinite(x.cover)?x.cover.toFixed(1)+" days cover":"No demand history"} · {x.result.confidence} confidence · {Math.ceil(x.result.safetyStock)} safety units</div></div></div>)}{analytics.lowStock.length===0&&<p className="text-sm text-slate-500">No items are currently below their reorder threshold.</p>}</div></SectionCard></div>
            </section>}

            {section === "reports" && <section className="space-y-5">
              <PageHeading title="Reports, data export & recovery" subtitle="Download source records for finance, reconcile inventory and protect the business ledger."/>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                {([{key:"sales",title:"Sales ledger",desc:"Receipts, payment method, gross and margin",icon:ShoppingBag},{key:"products",title:"Inventory register",desc:"Barcode, stock, cost and price",icon:Package},{key:"customers",title:"Customer balances",desc:"Profiles, limits and outstanding debt",icon:Users},{key:"purchases",title:"Supplier purchases",desc:"Invoices, received stock and costs",icon:Truck}] as const).map(item=><button key={item.key} onClick={()=>openExport(item.key)} className="rounded-2xl border border-white/[.08] bg-[#111c2b] p-5 text-left hover:border-orange-400/30"><item.icon size={22} className="text-orange-300"/><div className="mt-4 font-bold">{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.desc}</div><div className="mt-5 flex items-center gap-2 text-xs font-bold text-orange-300">Download CSV <ArrowDownToLine size={14}/></div></button>)}
              </div>
              <SectionCard title="Full BeBoss backup"><p className="text-sm leading-6 text-slate-400">Export the business snapshot using the same collection names as BeBoss Android. Backup files contain operational business records, not staff password or PIN hashes.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={createBackup} className={primaryButton}><Archive size={15}/> Download .beboss backup</button><label className={secondaryButton+" cursor-pointer"}><Download size={15}/> Restore / merge backup<input type="file" accept=".beboss,.json,application/json" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];if(f)void restoreBackup(f);e.currentTarget.value="";}}/></label></div></SectionCard>
              <SectionCard title="Print"><p className="text-sm text-slate-400">Use the native print dialog for the active business page or last completed sale receipt.</p><button onClick={()=>receipt?void printReceipt():bridge?.printCurrentPage().then(r=>{if(!r.success)toast.error(r.failureReason||"Print failed");})} className={secondaryButton+" mt-4"}><Printer size={15}/> Open native print dialog</button></SectionCard>
            </section>}

            {section === "billing" && <section className="space-y-5">
              <PageHeading title="Subscription & account health" subtitle="The desktop is bound to the existing shop subscription, branch count and enrolled workforce."/>
              <div className="rounded-3xl border border-white/[.08] bg-[#111c2b] p-6">
                <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-xs uppercase tracking-widest text-slate-500">Current subscription</div><div className="mt-2 text-3xl font-black">{asText(shop?.subscription_status,"UNKNOWN")}</div><div className="mt-2 text-sm text-slate-400">Expires {dateLabel(shop?.subscription_expires_at)}</div></div><StatusPill status={licenseExpired?"EXPIRED":asText(shop?.subscription_status,"TRIAL")}/></div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3"><MiniMetric label="Branches" value={shop?.branch_count||dataset.branches.length}/><MiniMetric label="Workers" value={shop?.worker_count||dataset.users.length}/><MiniMetric label="Devices registered" value={shop?.device_count||devices.length}/></div>
                <a href="/my-shop" className={primaryButton+" mt-6 inline-flex"}>Manage payment, activation codes & subscription <ChevronRight size={15}/></a>
              </div>
              <SectionCard title="Payment requests & activation history">
                <DataTable headers={["Date","Provider","Amount","Status","Reference"]} empty="No subscription payment requests are listed." rows={(ownerPortal?.payments||[]).map((p:Row)=>[
                  dateLabel(p.created_at),p.provider||p.gateway_provider||"—",money(p.amount_rwf,"RWF"),<StatusPill status={p.status}/>,p.gateway_reference||p.id
                ])}/>
                <div className="mt-5 grid gap-5 xl:grid-cols-2">
                  <div><h4 className="mb-2 text-sm font-bold">Unlock codes</h4><DataTable headers={["Code","Plan","Status","Issued"]} empty="No activation codes." rows={(ownerPortal?.codes||[]).map((x:Row)=>[
                    <span className="font-mono">{x.unlock_code}</span>,x.tier_code+" · "+x.plan_days+" days",<StatusPill status={x.status}/>,dateLabel(x.issued_at)
                  ])}/></div>
                  <div><h4 className="mb-2 text-sm font-bold">BeBoss announcements</h4><div className="space-y-2">{(ownerPortal?.announcements||[]).map((a:Row)=><div key={a.id} className="rounded-xl border border-white/5 p-3"><div className="text-sm font-bold">{a.title||a.subject||"BeBoss update"}</div><p className="mt-1 text-xs text-slate-400">{a.body||a.message||""}</p><div className="mt-2 text-[10px] text-slate-600">{dateLabel(a.starts_at||a.created_at)}</div></div>)}{!(ownerPortal?.announcements||[]).length&&<p className="text-xs text-slate-500">No current announcements.</p>}</div></div>
                </div>
              </SectionCard>
            </section>}

            {section === "sync" && <section className="space-y-5">
              <PageHeading title="Synchronization control plane" subtitle="Encrypted local ledger, HMAC-verified Android snapshots and version-aware cloud publication." action={<button onClick={()=>void syncNow().then(()=>toast.success("Sync complete")).catch((e)=>toast.error(e.message))} className={primaryButton} disabled={syncing||offline||licenseExpired}><RefreshCw size={15} className={syncing?"animate-spin":""}/> Run full synchronization</button>}/>
              <div className="grid gap-3 md:grid-cols-3"><Metric label="Pending local changes" value={dirty?"Yes":"No"} tone={dirty?"warning":"positive"}/><Metric label="Last verified sync" value={lastSyncedAt?dateLabel(lastSyncedAt):"Not yet synced"}/><Metric label="Terminal snapshots" value={devices.length}/></div>
              <SectionCard title="Sync health"><div className="flex items-start gap-3"><div className={"rounded-xl p-3 "+(offline?"bg-amber-400/10 text-amber-300":"bg-emerald-400/10 text-emerald-300")}>{offline?<WifiOff size={21}/>:<Cloud size={21}/>}</div><div className="min-w-0 flex-1"><div className="font-bold">{offline?"Working offline":syncing?"Synchronizing with BeBoss Cloud":dirty?"Changes waiting to sync":"Cloud workspace is synchronized"}</div><p className="mt-1 break-words text-sm leading-6 text-slate-400">{syncMessage}</p></div></div><div className="mt-5 grid gap-2 text-xs text-slate-500 sm:grid-cols-2"><div>Desktop installation: <span className="font-mono text-slate-300">{cache.desktopId}</span></div><div>Tenant: <span className="font-mono text-slate-300">{cache.shopId}</span></div><div>Encrypted cache: <span className="text-emerald-300">Enabled</span></div><div>Snapshot format: <span className="font-mono text-slate-300">BBSHARE1 / schema v3</span></div></div></SectionCard>
              <SectionCard title="Sync collections"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(["products","customers","sales","saleItems","customerPayments","purchases","stockTransfers","branches","users","tombstones"] as const).map(key=><div key={key} className="flex items-center justify-between rounded-xl border border-white/[.06] bg-white/[.025] p-3 text-sm"><span className="capitalize text-slate-300">{key.replace(/([A-Z])/g," $1")}</span><span className="font-mono text-xs text-slate-400">{dataset[key].length}</span></div>)}</div></SectionCard>
            </section>}

            {section === "settings" && <section className="space-y-5">
              <PageHeading title="Business configuration" subtitle="Receipt identity, tax, commercial targets and default operational values."/>
              <SectionCard title="Business profile"><form onSubmit={(e)=>{e.preventDefault();updateBusinessProfile(form);setForm({});}} className="grid gap-4 sm:grid-cols-2">
                {(["shopName","name","phone","email","address","tinNumber","currencySymbol","currencyCode","receiptHeader","receiptFooter","businessType"] as const).map(key=><Field key={key} label={key.replace(/([A-Z])/g," $1")}><input defaultValue={asText(dataset.shopProfile[key])} onChange={(e)=>setForm((v)=>({...v,[key]:e.target.value}))} className={inputClass}/></Field>)}
                <Field label="Tax rate (%)"><input type="number" min="0" max="100" step="any" defaultValue={asNumber(dataset.shopProfile.taxRate)} onChange={(e)=>setForm((v)=>({...v,taxRate:asNumber(e.target.value)}))} className={inputClass}/></Field>
                <Field label="Target margin (%)"><input type="number" min="0" max="100" step="any" defaultValue={asNumber(dataset.shopProfile.targetMarginPercent,25)} onChange={(e)=>setForm((v)=>({...v,targetMarginPercent:asNumber(e.target.value)}))} className={inputClass}/></Field>
                <Field label="Daily sales target"><input type="number" min="0" defaultValue={asNumber(dataset.shopProfile.dailySalesTarget)} onChange={(e)=>setForm((v)=>({...v,dailySalesTarget:asNumber(e.target.value)}))} className={inputClass}/></Field>
                <Field label="Monthly revenue target"><input type="number" min="0" defaultValue={asNumber(dataset.shopProfile.monthlyRevenueTarget)} onChange={(e)=>setForm((v)=>({...v,monthlyRevenueTarget:asNumber(e.target.value)}))} className={inputClass}/></Field>
                <div className="col-span-full flex justify-end"><button className={primaryButton}><Check size={15}/> Save business profile</button></div>
              </form></SectionCard>
              <SectionCard title="Desktop application"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">Application updates</div><div className="text-xs text-slate-500">Check the signed BeBoss Desktop release channel.</div>{updateInfo&&<div className="mt-2 text-xs text-emerald-300">{updateInfo.state}{updateInfo.version?" · "+updateInfo.version:""}</div>}</div><button onClick={async()=>{try{const res=await bridge?.checkForUpdates();setUpdateInfo(res||null);toast.success("Update check completed.");}catch(e){toast.error(e instanceof Error?e.message:"Update check failed.");}}} className={secondaryButton}><RefreshCw size={14}/> Check for updates</button></div></SectionCard>
            </section>}
          </div>
        </main>
      </div>

      {receipt && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"><div className="mx-auto max-w-lg rounded-3xl bg-white p-7 text-slate-900 shadow-2xl"><div id="beboss-receipt" className="font-mono text-sm"><div className="text-center"><div className="text-2xl font-black">{receipt.shopName}</div><div className="mt-1 text-xs">OFFICIAL SALES RECEIPT</div><div className="mt-3 border-y border-dashed border-slate-400 py-2 text-xs">{receipt.sale.receiptNumber}<br/>{dateLabel(receipt.sale.saleDate)}</div></div><div className="my-4 space-y-2">{receipt.lines.map((line:Row)=><div key={line.id} className="flex justify-between gap-4"><span>{line.productName} × {line.quantitySold}</span><span>{money(line.subtotal,currency)}</span></div>)}</div><div className="border-t border-dashed border-slate-400 pt-3"><div className="flex justify-between"><span>Total</span><strong>{money(receipt.sale.totalAmount,currency)}</strong></div><div className="mt-1 flex justify-between"><span>Paid</span><strong>{money(receipt.sale.amountPaid,currency)}</strong></div><div className="mt-1 flex justify-between"><span>Payment</span><strong>{receipt.sale.paymentMethod}</strong></div></div><div className="mt-5 text-center text-xs">Thank you for your business.</div></div><div className="mt-6 flex justify-end gap-2"><button onClick={()=>setReceipt(null)} className={secondaryButton}>Close</button><button onClick={()=>void printReceipt()} className={primaryButton}><Printer size={15}/> Print receipt</button></div></div></div>}
    </div>
  );
}

const inputClass = "w-full rounded-xl border border-white/10 bg-[#0d1928] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400/50 focus:ring-2 focus:ring-orange-400/10";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-[#141821] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[.08] disabled:opacity-40";
const smallButton = "inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[.04] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-orange-400/30 hover:text-orange-200 disabled:opacity-40";

function Field({label,children}:{label:string;children:ReactNode}) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-400">{label}</span>{children}</label>;
}
function PageHeading({title,subtitle,action}:{title:string;subtitle:string;action?:ReactNode}) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-black tracking-tight">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>{action}</div>;
}
function SearchBar({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}) {
  return <div className="relative max-w-xl"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"/><input value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className={inputClass+" pl-10"}/></div>;
}
function Metric({label,value,tone="normal"}:{label:string;value:ReactNode;tone?:"normal"|"positive"|"warning"}) {
  return <div className="rounded-2xl border border-white/[.08] bg-[#111c2b] p-4"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">{label}</div><div className={"mt-2 break-words text-xl font-black "+(tone==="positive"?"text-emerald-300":tone==="warning"?"text-amber-300":"text-slate-100")}>{value}</div></div>;
}
function MiniMetric({label,value}:{label:string;value:ReactNode}) {
  return <div className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div><div className="mt-1 text-sm font-bold">{value}</div></div>;
}
function SectionCard({title,children}:{title:string;children:ReactNode}) {
  return <div className="rounded-2xl border border-white/[.08] bg-[#111c2b] p-5"><h3 className="mb-4 font-black">{title}</h3>{children}</div>;
}
function Avatar({name}:{name:string}) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-400/10 text-xs font-black text-orange-300">{initials(asText(name))}</span>;
}
function StatusPill({status}:{status:unknown}) {
  const text=asText(status,"UNKNOWN").toUpperCase();
  const good=["ACTIVE","OPEN","COMPLETED","PAID","TRIAL"].includes(text);
  const bad=["EXPIRED","SUSPENDED","CANCELLED","PAUSED","CLOSED"].includes(text);
  return <span className={"inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold "+(good?"bg-emerald-400/10 text-emerald-300":bad?"bg-rose-400/10 text-rose-300":"bg-amber-400/10 text-amber-200")}>{text.replaceAll("_"," ")}</span>;
}
function DataTable({headers,rows,empty}:{headers:string[];rows:ReactNode[][];empty:string}) {
  return <div className="overflow-hidden rounded-2xl border border-white/[.08] bg-[#111c2b]"><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-white/[.035] text-[10px] uppercase tracking-widest text-slate-500"><tr>{headers.map((h)=><th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead><tbody className="divide-y divide-white/[.06]">{rows.length?rows.map((row,i)=><tr key={i} className="hover:bg-white/[.02]">{row.map((cell,j)=><td key={j} className="px-4 py-3 align-middle text-slate-300">{cell}</td>)}</tr>):<tr><td colSpan={headers.length} className="px-4 py-12 text-center text-sm text-slate-500">{empty}</td></tr>}</tbody></table></div></div>;
}
function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  return <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><div className="my-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111c2b] p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-xl font-black">{title}</h3><button onClick={onClose} className={smallButton}><X size={15}/></button></div>{children}</div></div>;
}
function ProductForm({form,setForm,branches,onCancel,onSubmit}:{form:Row;setForm:(v:Row)=>void;branches:Row[];onCancel:()=>void;onSubmit:()=>void}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Product name"><input required value={form.name||""} onChange={(e)=>setForm({...form,name:e.target.value})} className={inputClass}/></Field>
    <Field label="Category"><input value={form.category||""} onChange={(e)=>setForm({...form,category:e.target.value})} className={inputClass}/></Field>
    <Field label="Barcode / SKU"><input value={form.barcode||""} onChange={(e)=>setForm({...form,barcode:e.target.value})} className={inputClass}/></Field>
    <Field label="Unit"><select value={form.unit||"pcs"} onChange={(e)=>setForm({...form,unit:e.target.value})} className={inputClass}>{["pcs","kg","g","litre","ml","pack","box","bottle","metre","pair"].map(x=><option key={x}>{x}</option>)}</select></Field>
    <Field label="Cost price"><input type="number" min="0" step="any" value={form.costPrice??""} onChange={(e)=>setForm({...form,costPrice:e.target.value})} className={inputClass}/></Field>
    <Field label="Selling price"><input type="number" min="0" step="any" value={form.sellingPrice??""} onChange={(e)=>setForm({...form,sellingPrice:e.target.value})} className={inputClass}/></Field>
    <Field label="Quantity in stock"><input type="number" step="any" value={form.quantityInStock??""} onChange={(e)=>setForm({...form,quantityInStock:e.target.value})} className={inputClass}/></Field>
    <Field label="Low stock threshold"><input type="number" step="any" value={form.lowStockThreshold??5} onChange={(e)=>setForm({...form,lowStockThreshold:e.target.value})} className={inputClass}/></Field>
    <Field label="Branch"><select value={form.branchId||""} onChange={(e)=>setForm({...form,branchId:e.target.value})} className={inputClass}>{branches.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
    <div className="col-span-full flex justify-end gap-2"><button onClick={onCancel} className={secondaryButton}>Cancel</button><button onClick={onSubmit} className={primaryButton}><Check size={15}/> Save product</button></div>
  </div>;
}
function CustomerForm({form,setForm,onCancel,onSubmit}:{form:Row;setForm:(v:Row)=>void;onCancel:()=>void;onSubmit:()=>void}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    {(["name","phone","email","address","city","category","creditLimit","notes"] as string[]).map(k=><Field key={k} label={k.replace(/([A-Z])/g," $1")}><input value={form[k]??""} onChange={(e)=>setForm({...form,[k]:e.target.value})} className={inputClass}/></Field>)}
    <div className="col-span-full flex justify-end gap-2"><button onClick={onCancel} className={secondaryButton}>Cancel</button><button onClick={onSubmit} className={primaryButton}><Check size={15}/> Save customer</button></div>
  </div>;
}
function OverviewPanel({analytics,dataset,currency,lastSyncedAt,setSection,createBackup}:{analytics:ReturnType<typeof emptyAnalytics>;dataset:Dataset;currency:string;lastSyncedAt:number;setSection:(s:Section)=>void;createBackup:()=>void}) {
  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.2em] text-orange-300">Operational intelligence</div><h2 className="mt-2 text-3xl font-black tracking-tight">Good business starts with visibility.</h2><p className="mt-2 text-sm text-slate-500">{dataset.shopProfile.shopName} · {new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</p></div><div className="flex gap-2"><button onClick={()=>setSection("pos")} className={primaryButton}><ShoppingCart size={15}/> Start checkout</button><button onClick={createBackup} className={secondaryButton}><Archive size={15}/> Backup</button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4"><Metric label="Today's revenue" value={money(analytics.todayRevenue,currency)} tone="positive"/><Metric label="Today's gross profit" value={money(analytics.todayProfit,currency)} tone="positive"/><Metric label="Transactions today" value={analytics.todayOrders}/><Metric label="Outstanding customer debt" value={money(analytics.debt,currency)} tone="warning"/></div>
    <div className="grid gap-5 2xl:grid-cols-[1.2fr_.8fr]">
      <SectionCard title="Revenue performance · 7 days"><div className="flex h-52 items-end gap-3 px-2 pt-4">{analytics.daily.map((day)=>{const max=Math.max(1,...analytics.daily.map((x)=>x.revenue));return <div key={day.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div title={money(day.revenue,currency)} className="w-full max-w-16 rounded-t-lg bg-gradient-to-t from-orange-600 to-orange-300" style={{height:Math.max(3,day.revenue/max*100)+"%"}}/><span className="text-[10px] text-slate-500">{day.label}</span></div>;})}</div></SectionCard>
      <SectionCard title="Operational health"><div className="space-y-4">{[{label:"Inventory catalogue",value:analytics.inventoryCount,detail:"Tracked items",icon:Package},{label:"Low stock alerts",value:analytics.lowStock.length,detail:"Items to reorder",icon:AlertCircle},{label:"Customer accounts",value:analytics.customerCount,detail:"Active profiles",icon:Users},{label:"Supplier receipts",value:dataset.purchases.length,detail:"Purchase records",icon:Truck}].map((item)=>{const Icon=item.icon;return <div key={item.label} className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[.05] text-orange-300"><Icon size={17}/></div><div className="flex-1"><div className="text-sm font-semibold">{item.label}</div><div className="text-xs text-slate-500">{item.detail}</div></div><div className="text-lg font-black">{item.value}</div></div>;})}</div></SectionCard>
    </div>
    <div className="grid gap-4 md:grid-cols-3"><button onClick={()=>setSection("inventory")} className="rounded-2xl border border-white/[.08] bg-[#111c2b] p-5 text-left hover:border-orange-400/30"><Package size={20} className="text-orange-300"/><div className="mt-4 font-bold">Manage inventory</div><p className="mt-1 text-xs text-slate-500">Catalog, pricing, barcodes and stock levels.</p></button><button onClick={()=>setSection("customers")} className="rounded-2xl border border-white/[.08] bg-[#111c2b] p-5 text-left hover:border-orange-400/30"><Users size={20} className="text-orange-300"/><div className="mt-4 font-bold">Collect customer credit</div><p className="mt-1 text-xs text-slate-500">View balances and record payments.</p></button><button onClick={()=>setSection("analytics")} className="rounded-2xl border border-white/[.08] bg-[#111c2b] p-5 text-left hover:border-orange-400/30"><Gauge size={20} className="text-orange-300"/><div className="mt-4 font-bold">Open forecast centre</div><p className="mt-1 text-xs text-slate-500">Sales trends, profit and reorder suggestions.</p></button></div>
    <div className="text-xs text-slate-600">Last verified cloud revision: {lastSyncedAt?dateLabel(lastSyncedAt):"No cloud revision verified yet"}.</div>
  </section>;
}
function FullScreenMessage({title,detail}:{title:string;detail:string}) {
  return <div className="grid min-h-screen place-items-center bg-[#090f1a] px-6 text-white"><div className="max-w-lg rounded-3xl border border-white/10 bg-[#111c2b] p-8"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-400/10 text-orange-300"><LockKeyhole size={22}/></div><h1 className="mt-5 text-2xl font-black">{title}</h1><p className="mt-3 text-sm leading-7 text-slate-400">{detail}</p></div></div>;
}
