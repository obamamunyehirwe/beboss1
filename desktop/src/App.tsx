import { useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bell, Building2, Briefcase, Check, ChevronDown,
  ClipboardList, CreditCard, Database, Home, LayoutDashboard, LoaderCircle, LogOut, Menu,
  Package, RefreshCw, Search, Settings, ShieldCheck, ShoppingCart, Smartphone, Truck, UserRound,
  Users, Warehouse, X, Zap, Languages
} from "lucide-react";
import { callDesktopApi, currentSession, signOut, OwnerAuthorizationError, type OwnerCredentials } from "./lib/cloud";
import { ensureSnapshot, errorText, isToday, n, rows, s } from "./lib/format";
import { mergeSnapshots } from "./lib/snapshot-merge";
import type { CloudState, DesktopPreferences, NavKey, ReceiptPayload, Row, Snapshot } from "./lib/types";
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
import { SyncHubPage } from "./components/screens/SyncHubPage";
import { OwnerAccessPage } from "./components/screens/OwnerAccessPage";
import { BackupPage } from "./components/screens/BackupPage";
import { SettingsPage } from "./components/screens/SettingsPage";
import { WelcomePage } from "./components/screens/WelcomePage";
import { ManagementPage } from "./components/screens/ManagementPage";
import { LandingPage } from "./components/LandingPage";
import { CommandPalette } from "./components/CommandPalette";
import { SetupWizard } from "./components/SetupWizard";
import { applyDesktopLanguage, DESKTOP_LANGUAGES } from "./lib/i18n";
import type { StaffUpdate } from "./components/screens/StaffPage";

function isDesktopInstallId(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = {
  theme: "system", density: "comfortable", accent: "orange", defaultView: "welcome",
  language: "en", autoSync: true, refreshMinutes: 5, reducedMotion: false
};

function normalizeDesktopPreferences(value: unknown): DesktopPreferences {
  const saved = value && typeof value === "object" ? value as Partial<DesktopPreferences> : {};
  const themes = ["dark", "light", "system"];
  const densities = ["comfortable", "compact"];
  const accents = ["orange", "blue", "green"];
  const views = ["welcome", "overview", "management"];
  const refreshIntervals = [0, 1, 5, 15];
  const languages = ["en", "rw", "fr", "sw"];
  return {
    language: languages.includes(String(saved.language)) ? saved.language as DesktopPreferences["language"] : DEFAULT_DESKTOP_PREFERENCES.language,
    theme: themes.includes(String(saved.theme)) ? saved.theme as DesktopPreferences["theme"] : DEFAULT_DESKTOP_PREFERENCES.theme,
    density: densities.includes(String(saved.density)) ? saved.density as DesktopPreferences["density"] : DEFAULT_DESKTOP_PREFERENCES.density,
    accent: accents.includes(String(saved.accent)) ? saved.accent as DesktopPreferences["accent"] : DEFAULT_DESKTOP_PREFERENCES.accent,
    defaultView: views.includes(String(saved.defaultView)) ? saved.defaultView as DesktopPreferences["defaultView"] : DEFAULT_DESKTOP_PREFERENCES.defaultView,
    autoSync: typeof saved.autoSync === "boolean" ? saved.autoSync : DEFAULT_DESKTOP_PREFERENCES.autoSync,
    refreshMinutes: refreshIntervals.includes(Number(saved.refreshMinutes)) ? Number(saved.refreshMinutes) as DesktopPreferences["refreshMinutes"] : DEFAULT_DESKTOP_PREFERENCES.refreshMinutes,
    reducedMotion: typeof saved.reducedMotion === "boolean" ? saved.reducedMotion : DEFAULT_DESKTOP_PREFERENCES.reducedMotion
  };
}

const NAV: { id: NavKey; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "welcome", label: "Welcome", icon: Home, group: "Workspace" },
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Workspace" },
  { id: "management", label: "Management center", icon: Briefcase, group: "Workspace" },
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
  { id: "sync", label: "Sync hub", icon: RefreshCw, group: "Administration" },
  { id: "admin", label: "Owner access", icon: ShieldCheck, group: "Administration" },
  { id: "backup", label: "Backup & recovery", icon: Database, group: "Administration" },
  { id: "settings", label: "Shop settings", icon: Settings, group: "Administration" }
];

export default function App() {
  const [startupReady, setStartupReady] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [owner, setOwner] = useState<OwnerCredentials | null>(null);
  const [cloud, setCloud] = useState<CloudState | null>(null);
  const [view, setView] = useState<NavKey>("welcome");
  const [preferences, setPreferences] = useState<DesktopPreferences>(DEFAULT_DESKTOP_PREFERENCES);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null);
  const syncProbeRef = useRef({ ownerKey: "", managementVersion: "", snapshotUpdatedAt: 0, inFlight: false });

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

  async function invalidateOwnerAuthorization() {
    await signOut().catch(() => undefined);
    await window.beBossDesktop.secureStore.remove("owner-identity").catch(() => false);
    setOwner(null); setCloud(null); setOffline(false); setShowAuth(true);
    setError("Owner authorization is no longer valid. Verify the registered owner phone again before opening cached shop data.");
  }

  async function bootstrap(credentials: OwnerCredentials, showBusy = true) {
    if (showBusy) setBusy(true);
    setError(""); setNotice("");
    try {
      let installationId = deviceId;
      if (!installationId) installationId = await window.beBossDesktop.getDeviceId().catch(() => "");
      if (!isDesktopInstallId(installationId)) {
        throw new Error("This desktop installation could not create a persistent device identity. Restart BeBoss and retry.");
      }
      if (installationId !== deviceId) setDeviceId(installationId);
      const userAgent = navigator.userAgent;
      const platform = /Windows/i.test(userAgent) ? "Windows" : /Mac OS X|Macintosh/i.test(userAgent) ? "macOS" : /Linux/i.test(userAgent) ? "Linux" : "Desktop";
      const response = await callDesktopApi<CloudState & { ok: true; desktopDevice: Row }>(
        "bootstrap",
        credentials,
        { deviceId: installationId, deviceName: "BeBoss Desktop · " + platform }
      );
      const pending = await window.beBossDesktop.local.pending();
      let next = { ...response, snapshot: ensureSnapshot(response.snapshot) } as CloudState;
      if (pending.length && next.snapshot) {
        const latest = ensureSnapshot(pending[pending.length - 1].payload as Snapshot);
        if (latest) {
          const merge = mergeSnapshots(next.snapshot, latest);
          const merged = await callDesktopApi<{ ok: true; uploadedAt: number; snapshot: Snapshot }>("save_snapshot", credentials, {
            deviceId: installationId, expectedUpdatedAt: next.snapshotUpdatedAt, snapshot: merge.snapshot
          });
          next = { ...next, snapshot: ensureSnapshot(merged.snapshot), snapshotUpdatedAt: merged.uploadedAt };
          await window.beBossDesktop.local.acknowledge(pending.map((item) => item.id));
          if (merge.conflictsResolved > 0) setNotice(`Reconnected and merged ${merge.conflictsResolved} concurrent record update(s) using BeBoss version and tombstone rules.`);
        }
      }
      setCloud(next); setOwner(credentials); setOffline(false);
      await saveCache(credentials, next);
      setNotice("Shop data and this licensed desktop installation are synchronized with BeBoss Cloud.");
      window.setTimeout(() => setNotice(""), 5000);
      return true;
    } catch (e) {
      const message = errorText(e);
      if (e instanceof OwnerAuthorizationError) {
        await invalidateOwnerAuthorization();
        return false;
      }
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
        const [completedAt, completedVersion, privacyConsent] = await Promise.all([
          window.beBossDesktop.secureStore.get("installation-setup-completed-at"),
          window.beBossDesktop.secureStore.get("installation-setup-version"),
          window.beBossDesktop.secureStore.get("installation-privacy-consent")
        ]);
        const setupIsCurrent = completedVersion === window.beBossDesktop.version;
        const privacyIsAccepted = Boolean(privacyConsent?.startsWith("v1:"));
        if (alive) setSetupRequired(!completedAt || !setupIsCurrent || !privacyIsAccepted);
      } catch (e) {
        if (alive) {
          setSetupRequired(true);
          setError(errorText(e));
        }
      } finally {
        if (alive) setStartupReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root || !preferencesReady) return;
    return applyDesktopLanguage(root, preferences.language);
  }, [preferences.language, preferencesReady, owner, view, setupRequired]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await window.beBossDesktop.secureStore.get("desktop-preferences");
        if (stored && alive) {
          const next = normalizeDesktopPreferences(JSON.parse(stored));
          setPreferences(next);
          setView(next.defaultView);
        }
      } catch (e) {
        if (alive) setError("Desktop preferences could not be loaded: " + errorText(e));
      } finally {
        if (alive) setPreferencesReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!startupReady || setupRequired || !preferencesReady) return;
    let alive = true;
    (async () => {
      try {
        const idValue = await window.beBossDesktop.getDeviceId();
        if (alive) setDeviceId(idValue);
      } catch (e) {
        if (alive) setError("Desktop device initialization failed: " + errorText(e));
      }
    })();
    return () => { alive = false; };
  }, [startupReady, setupRequired, preferencesReady]);

  useEffect(() => {
    if (!owner || !offline || !preferences.autoSync) return;
    const retrySync = () => { if (navigator.onLine && !busy) void bootstrap(owner, false); };
    window.addEventListener("online", retrySync);
    const retryTimer = window.setInterval(retrySync, 30_000);
    return () => { window.removeEventListener("online", retrySync); window.clearInterval(retryTimer); };
  }, [owner, offline, preferences.autoSync, busy]);

  useEffect(() => {
    if (!owner || offline || !preferences.autoSync) return;
    const ownerKey = owner.username.trim().toLowerCase() + ":" + owner.phone.replace(/\\D/g, "");
    if (syncProbeRef.current.ownerKey !== ownerKey) {
      syncProbeRef.current = {
        ownerKey,
        managementVersion: "",
        snapshotUpdatedAt: n(cloud?.snapshotUpdatedAt),
        inFlight: false
      };
    }
    let disposed = false;
    const probeAndSync = async () => {
      const current = syncProbeRef.current;
      if (disposed || current.inFlight || busy || !navigator.onLine || document.visibilityState === "hidden") return;
      current.inFlight = true;
      try {
        const probe = await callDesktopApi<{
          ok: true; managementVersion: string; latestSnapshotUpdatedAt: number; serverTime: number;
        }>("management_probe", owner);
        if (disposed) return;
        const latestSnapshotAt = n(probe.latestSnapshotUpdatedAt);
        const snapshotChanged = latestSnapshotAt > Math.max(current.snapshotUpdatedAt, n(cloud?.snapshotUpdatedAt));
        const managementChanged = current.managementVersion !== "" && probe.managementVersion !== current.managementVersion;
        if (snapshotChanged) {
          const refreshed = await bootstrap(owner, false);
          if (refreshed) current.snapshotUpdatedAt = latestSnapshotAt;
        } else if (managementChanged) {
          await refreshManagement();
        }
        current.managementVersion = probe.managementVersion;
      } catch (e) {
        // Probe failures are non-destructive: local work stays in the encrypted outbox
        // and the next connectivity/focus/interval probe retries without spamming alerts.
        console.warn("BeBoss change probe failed; the next sync cycle will retry.", e);
      } finally {
        current.inFlight = false;
      }
    };
    const handleFocus = () => { void probeAndSync(); };
    const handleOnline = () => { void probeAndSync(); };
    void probeAndSync();
    const timer = window.setInterval(() => { void probeAndSync(); }, 30_000);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [owner, offline, preferences.autoSync, busy, cloud?.snapshotUpdatedAt]);

  useEffect(() => {
    if (!owner || offline || !preferences.autoSync || preferences.refreshMinutes === 0) return;
    const timer = window.setInterval(() => {
      if (navigator.onLine && !busy) void bootstrap(owner, false);
    }, preferences.refreshMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [owner, offline, preferences.autoSync, preferences.refreshMinutes, busy]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function authenticated(credentials: OwnerCredentials) {
    const ready = await bootstrap(credentials);
    if (ready) {
      setShowAuth(false);
      setView(preferences.defaultView);
    } else {
      setShowAuth(true);
    }
  }
  async function enterSignIn() {
    setBusy(true); setError("");
    try {
      const [session, identity] = await Promise.all([
        currentSession(),
        window.beBossDesktop.secureStore.get("owner-identity")
      ]);
      if (session && identity) {
        const parsed = JSON.parse(identity) as OwnerCredentials;
        if (parsed.username && parsed.phone) {
          const restored = await bootstrap(parsed, false);
          if (restored) {
            setShowAuth(false);
            setView(preferences.defaultView);
            return;
          }
        }
      }
      setShowAuth(true);
    } catch (e) {
      setError(errorText(e));
      setShowAuth(true);
    } finally { setBusy(false); }
  }
  async function refresh() { if (owner) await bootstrap(owner); }
  async function saveDesktopPreferences(value: DesktopPreferences) {
    const next = normalizeDesktopPreferences(value);
    await window.beBossDesktop.secureStore.set("desktop-preferences", JSON.stringify(next));
    await window.beBossDesktop.secureStore.set("ui-language", next.language.toUpperCase());
    setPreferences(next);
  }

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
      if (e instanceof OwnerAuthorizationError) {
        await invalidateOwnerAuthorization();
        throw e;
      }
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

  async function refreshManagement() {
    if (!owner || offline) throw new Error("Reconnect the owner account before refreshing cloud management records.");
    const management = await callDesktopApi<{
      ok: true; shop: Row; devices: Row[]; branches: Row[]; transfers: Row[];
      staff: Row[]; announcements: Row[]; payments: Row[]; codes: Row[]; serverTime: number;
    }>("management_refresh", owner);
    if (!cloud) return;
    const updated: CloudState = {
      ...cloud,
      shop: management.shop,
      devices: rows(management.devices),
      branches: rows(management.branches),
      transfers: rows(management.transfers),
      staff: rows(management.staff),
      announcements: rows(management.announcements),
      payments: rows(management.payments),
      codes: rows(management.codes),
      serverTime: management.serverTime
    };
    setCloud(updated);
    setOffline(false);
    await saveCache(owner, updated);
  }

  async function callAction(action: Parameters<typeof callDesktopApi>[0], payload: Record<string, unknown>) {
    if (!owner || offline) throw new Error("Reconnect and verify the shop owner before changing cloud management records.");
    setBusy(true); setError(""); setNotice("");
    try {
      const currentActorDeviceId = "DESKTOP:" + deviceId;
      const result = await callDesktopApi(action, owner, {
        ...payload,
        actorDeviceId: currentActorDeviceId,
        currentDeviceId: currentActorDeviceId
      });
      await refreshManagement();
      setNotice("Shop management changes are saved to BeBoss Cloud.");
      window.setTimeout(() => setNotice(""), 4500);
      return result as Record<string, any>;
    } catch (e) {
      if (e instanceof OwnerAuthorizationError) await invalidateOwnerAuthorization();
      else setError(errorText(e));
      throw e;
    } finally { setBusy(false); }
  }

  async function openAnnouncementAction(urlValue: string) {
    const url = urlValue.trim();
    const internal: Record<string, NavKey> = {
      "/": "welcome", "/inventory": "products", "/products": "products",
      "/sales": "sales", "/customers": "customers", "/purchases": "purchases",
      "/branches": "branches", "/devices": "devices", "/staff": "staff",
      "/billing": "billing", "/reports": "reports", "/sync": "sync",
      "/settings": "settings", "/management": "management"
    };
    const path = url.split("?")[0].split("#")[0];
    const route = internal[path];
    if (route) { setView(route); setMenuOpen(false); return; }
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.protocol !== "https:") throw new Error("Announcement links must use HTTPS.");
      await window.beBossDesktop.openExternal(parsed.toString());
    } catch (e) { setError(errorText(e)); }
  }

  async function saveStaffAccess(input: StaffUpdate) {
    if (!owner || offline) throw new Error("Reconnect the owner account before editing staff access.");
    if (!input.userId.trim()) throw new Error("A staff account identifier is required.");
    setBusy(true); setError(""); setNotice("");
    try {
      // Read the latest signed snapshot before changing the staff mirror so permission
      // changes merge against current Android edits, never the desktop's stale cache.
      const latest = await callDesktopApi<CloudState & { ok: true }>("bootstrap", owner);
      const base = ensureSnapshot(latest.snapshot);
      const targetStaff = rows(latest.staff).find((staff) => s(staff.user_id) === input.userId);
      const targetUsername = s(targetStaff?.username).toLowerCase();
      const users = rows(base?.users);
      const index = users.findIndex((item) =>
        s(item.id) === input.userId ||
        (targetUsername && s(item.username).toLowerCase() === targetUsername)
      );
      if (input.permissions && index < 0) {
        throw new Error("This staff member's permission profile is not in the latest signed mobile snapshot. Synchronize the Android owner terminal before editing granular permissions.");
      }

      await callDesktopApi("staff_update", owner, {
        userId: input.userId, role: input.role, branchId: input.branchId, isActive: input.isActive
      });

      if (base && index >= 0) {
        const next = structuredClone(base);
        const now = Date.now();
        next.users[index] = {
          ...next.users[index],
          ...(input.permissions ?? {}),
          role: input.role,
          assignedBranchId: input.branchId,
          isActive: input.isActive,
          updatedAt: now,
          hlcTimestamp: now,
          lastModifiedDeviceId: "DESKTOP"
        };
        const queued = await window.beBossDesktop.local.queue(
          "STAFF_ACCESS_UPDATE", next, deviceId, latest.snapshotUpdatedAt, false,
          n(latest.shop.subscription_expires_at), s(latest.shop.subscription_status).toUpperCase()
        );
        try {
          const saved = await callDesktopApi<{ ok: true; uploadedAt: number; snapshot: Snapshot }>(
            "save_snapshot", owner, { deviceId, expectedUpdatedAt: latest.snapshotUpdatedAt, snapshot: queued.payload }
          );
          await window.beBossDesktop.local.acknowledge([queued.id]);
          const updated: CloudState = {
            ...latest,
            snapshot: ensureSnapshot(saved.snapshot),
            snapshotUpdatedAt: saved.uploadedAt,
            staff: rows(latest.staff).map((staff) => s(staff.user_id) === input.userId
              ? { ...staff, role: input.role, assigned_branch_id: input.branchId,
                  assigned_branch_name: rows(latest.branches).find((branch) => s(branch.id) === input.branchId)?.name || "All Branches",
                  is_active: input.isActive }
              : staff)
          };
          setCloud(updated); setOffline(false);
          await saveCache(owner, updated);
        } catch (saveError) {
          const message = errorText(saveError);
          if (/newer shop data|snapshot/i.test(message)) {
            const recovered = await bootstrap(owner, false);
            if (recovered) {
              setNotice("Staff access was saved. BeBoss refreshed and merged it with the latest mobile and desktop snapshot.");
              return;
            }
          }
          if (!navigator.onLine || /failed to fetch|network|timeout|connection|offline/i.test(message)) {
            const updated: CloudState = {
              ...latest,
              snapshot: ensureSnapshot(queued.payload as Snapshot),
              staff: rows(latest.staff).map((staff) => s(staff.user_id) === input.userId
                ? { ...staff, role: input.role, assigned_branch_id: input.branchId,
                    assigned_branch_name: rows(latest.branches).find((branch) => s(branch.id) === input.branchId)?.name || "All Branches",
                    is_active: input.isActive }
                : staff)
            };
            setCloud(updated); setOffline(true);
            setNotice("Staff access is saved to the encrypted local outbox and will synchronize when the connection returns.");
            return;
          }
          throw saveError;
        }
      } else {
        // The staff cloud mirror may exist before its first mobile snapshot enrollment.
        // Basic access changes remain available, but granular permission writes do not.
        const updated: CloudState = {
          ...latest,
          staff: rows(latest.staff).map((staff) => s(staff.user_id) === input.userId
            ? { ...staff, role: input.role, assigned_branch_id: input.branchId,
                assigned_branch_name: rows(latest.branches).find((branch) => s(branch.id) === input.branchId)?.name || "All Branches",
                is_active: input.isActive }
            : staff)
        };
        setCloud(updated);
        await saveCache(owner, updated);
      }
      await bootstrap(owner, false);
      setNotice("Staff role, branch, operating state and available mobile permissions were synchronized.");
    } catch (e) {
      if (e instanceof OwnerAuthorizationError) await invalidateOwnerAuthorization();
      else setError(errorText(e));
      throw e;
    } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try {
      await signOut();
      await window.beBossDesktop.secureStore.remove("owner-identity");
      setOwner(null); setCloud(null); setOffline(false); setView("welcome"); setShowAuth(false); setError(""); setNotice("");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (!startupReady || !preferencesReady) {
    return <div className="setup-loading"><LoaderCircle className="spin" size={28} /><span>Preparing BeBoss Desktop…</span></div>;
  }

  if (setupRequired) {
    return <SetupWizard
      initialPreferences={preferences}
      onComplete={async (nextPreferences, privacyAccepted) => {
        if (!privacyAccepted) throw new Error("Privacy and device-access acknowledgement is required.");
        await saveDesktopPreferences(nextPreferences);
        await window.beBossDesktop.secureStore.set("installation-privacy-consent", "v1:" + new Date().toISOString());
        await window.beBossDesktop.secureStore.set("installation-setup-version", window.beBossDesktop.version);
        await window.beBossDesktop.secureStore.set("installation-setup-completed-at", new Date().toISOString());
        setError(""); setSetupRequired(false); setShowAuth(false);
      }}
    />;
  }

  if (!owner || !cloud) {
    if (!showAuth) {
      return <>
        <LandingPage
          language={preferences.language}
          theme={preferences.theme}
          onLanguageChange={(language: DesktopPreferences["language"]) => void saveDesktopPreferences({ ...preferences, language })}
          onThemeChange={(theme: DesktopPreferences["theme"]) => void saveDesktopPreferences({ ...preferences, theme })}
          onSignIn={() => void enterSignIn()}
        />
        {busy && <div className="global-loading"><LoaderCircle className="spin" size={26} /><span>Verifying your owner session…</span></div>}
        {error && <div className="login-error">{error}<button onClick={() => setError("")}><X size={15} /></button></div>}
      </>;
    }
    return <>
      <AuthScreen onAuthenticated={authenticated} onBack={() => { setShowAuth(false); setError(""); }} theme={preferences.theme} />
      {busy && <div className="global-loading"><LoaderCircle className="spin" size={26} /><span>Connecting to BeBoss Cloud…</span></div>}
      {error && <div className="login-error">{error}<button onClick={() => setError("")}><X size={15} /></button></div>}
    </>;
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

  return <div className="app-shell" data-theme={preferences.theme} data-density={preferences.density} data-accent={preferences.accent} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-language={preferences.language}>
    {menuOpen && <button type="button" className="sidebar-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />}
    <aside className={"sidebar " + (menuOpen ? "open" : "")} id="desktop-navigation">
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
        <div className="topbar-left"><button type="button" className="mobile-menu icon-btn" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="desktop-navigation" onClick={() => setMenuOpen((v) => !v)}><Menu size={20} /></button><div className="breadcrumb"><span>BeBoss</span><b>/</b><strong>{pageTitle}</strong></div></div>
        <div className="topbar-right">
          <button className="command-btn" onClick={() => setPaletteOpen(true)} title="Command menu (Ctrl+K)"><Search size={15} /><span>Command</span><kbd>Ctrl K</kbd></button>
          <label className="desktop-language-control"><Languages size={15} /><select aria-label="Interface language" value={preferences.language} onChange={(event) => void saveDesktopPreferences({ ...preferences, language: event.target.value as DesktopPreferences["language"] })}>{DESKTOP_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.short}</option>)}</select></label>
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
        {view === "welcome" && <WelcomePage cloud={cloud} snapshot={snapshot} offline={offline} revenueToday={revenueToday} profitToday={profitToday} lowStock={lowStock} onNavigate={setView} onReceipt={openReceipt} onAnnouncementAction={openAnnouncementAction} language={preferences.language} />}
        {view === "management" && <ManagementPage cloud={cloud} snapshot={snapshot} offline={offline} onNavigate={setView} onAnnouncementAction={openAnnouncementAction} language={preferences.language} />}
        {view === "overview" && <OverviewPage cloud={cloud} snapshot={snapshot} offline={offline} revenueToday={revenueToday} profitToday={profitToday} stockCost={stockCost} receivables={receivables} lowStock={lowStock} onNavigate={setView} onOpenCommand={() => setPaletteOpen(true)} />}
        {view === "checkout" && <CheckoutPage snapshot={snapshot} onCommit={commitSnapshot} onReceipt={openReceipt} offline={offline} busy={busy} />}
        {view === "products" && <ProductsPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} query={search} />}
        {view === "sales" && <SalesPage snapshot={snapshot} query={search} onReceipt={openReceipt} />}
        {view === "customers" && <CustomersPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} query={search} onReceipt={openReceipt} />}
        {view === "purchases" && <PurchasesPage snapshot={snapshot} onCommit={commitSnapshot} offline={offline} />}
        {view === "reports" && <ReportsPage snapshot={snapshot} />}
        {view === "branches" && <BranchesPage cloud={cloud} snapshot={snapshot} onAction={callAction} onRefresh={refreshManagement} offline={offline} />}
        {view === "staff" && <StaffPage cloud={cloud} snapshot={snapshot} onSaveStaff={saveStaffAccess} offline={offline} />}
        {view === "devices" && <DevicesPage cloud={cloud} onAction={callAction} onRefresh={refreshManagement} offline={offline} currentDeviceId={"DESKTOP:" + deviceId} />}
        {view === "transfers" && <TransfersPage cloud={cloud} snapshot={snapshot} onAction={callAction} offline={offline} />}
        {view === "billing" && <BillingPage cloud={cloud} onNavigate={setView} onCheckout={async (payload) => {
          const result = await callAction("create_checkout", payload);
          if (result.checkoutUrl) {
            await window.beBossDesktop.openExternal(s(result.checkoutUrl));
            setNotice("Secure hosted checkout opened in your browser. BeBoss will activate the plan only after the provider confirms payment.");
          } else if (result.pending) {
            setNotice(s(result.message) || "The provider response is being reconciled. Review the payment queue before retrying.");
          }
        }} onPaymentProof={async (payload) => {
          const result = await callAction("submit_payment_proof", payload);
          setNotice("Mobile Money claim saved as pending verification. BeBoss will not activate the subscription until an administrator independently verifies the payment.");
          return result as Row;
        }} />}
        {view === "diagnostics" && <DiagnosticsPage cloud={cloud} snapshot={snapshot} onRefresh={refresh} />}
        {view === "sync" && <SyncHubPage cloud={cloud} deviceId={deviceId} offline={offline} onRefresh={refresh} />}
        {view === "admin" && <OwnerAccessPage cloud={cloud} />}
        {view === "backup" && <BackupPage snapshot={snapshot} cloud={cloud} onCommit={commitSnapshot}
          onCreateBranchShare={async (branchIdFilter) => {
            const result = await callAction("create_branch_share", { snapshot, branchIdFilter });
            return s(result.token);
          }}
          onVerifyBranchShare={async (token) => {
            const result = await callAction("verify_branch_share", { token });
            if (!result.snapshot || typeof result.snapshot !== "object") throw new Error("The server did not return a verified branch snapshot.");
            return result.snapshot as Snapshot;
          }}
        />}
        {view === "settings" && <SettingsPage snapshot={snapshot} cloud={cloud} onCommit={commitSnapshot} offline={offline} preferences={preferences} onSavePreferences={saveDesktopPreferences} onNavigate={setView} onRefresh={refresh} version={window.beBossDesktop.version} />}
        <footer className="app-footer"><span>BeBoss Desktop · Version {window.beBossDesktop.version}</span><span>Last cloud snapshot {new Date(cloud.snapshotUpdatedAt || 0).toLocaleString()} · {cloud.verifiedChunks} verified chunks</span></footer>
      </div>
    </main>
    {receipt && <ReceiptPreview receipt={receipt} onClose={() => setReceipt(null)} />}
    {paletteOpen && <CommandPalette
      cloud={cloud}
      snapshot={snapshot}
      nav={NAV}
      onClose={() => setPaletteOpen(false)}
      onNavigate={(nextView) => { setSearch(""); setView(nextView); }}
      onQuickSearch={(nextView, term) => { setSearch(term); setView(nextView); }}
      onRefresh={() => { void refresh(); }}
    />}
  </div>;
}