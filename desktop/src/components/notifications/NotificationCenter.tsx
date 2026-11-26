import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  CreditCard,
  Info,
  Megaphone,
  MonitorSmartphone,
  OctagonX,
  PackageSearch,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { notify, notificationStore, useNotifications } from "../../lib/notifications";
import { focusMainWindow, osNotificationPermission, requestOsNotificationPermission } from "../../lib/notifications/native";
import type { NotificationCategory, NotificationItem, NotificationSeverity } from "../../lib/notifications/types";
import "./notifications.css";

const CATEGORY_ICON: Record<NotificationCategory, typeof Info> = {
  system: Info,
  sync: RefreshCw,
  security: ShieldAlert,
  billing: CreditCard,
  stock: PackageSearch,
  announcement: Megaphone,
};

const SEVERITY_ICON: Record<NotificationSeverity, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: OctagonX,
};

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 45_000) return "now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return minutes + "m";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d";
  return new Date(timestamp).toLocaleDateString();
}

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const { items, unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const seenUnread = useRef(unreadCount);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (unreadCount > seenUnread.current) {
      setPulsing(true);
      const timer = window.setTimeout(() => setPulsing(false), 1200);
      seenUnread.current = unreadCount;
      return () => window.clearTimeout(timer);
    }
    seenUnread.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("beboss:notification-open", handler);
    return () => window.removeEventListener("beboss:notification-open", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const latestUnread = useMemo(() => items.find((item) => !item.read), [items]);

  return <>
    <button
      type="button"
      className={"notification-bell icon-btn" + (pulsing ? " pulsing" : "") + (open ? " active" : "")}
      onClick={() => setOpen((value) => !value)}
      title={unreadCount > 0 ? unreadCount + " unread notifications" : "Notifications"}
      aria-label={unreadCount > 0 ? unreadCount + " unread notifications" : "Notifications"}
      aria-expanded={open}
    >
      {unreadCount > 0 ? <BellRing size={18} /> : <Bell size={18} />}
      {unreadCount > 0 && <span className="notification-bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <NotificationCenterPanel latestUnreadId={latestUnread?.id} onClose={() => setOpen(false)} />}
  </>;
}

function NotificationCenterPanel({ latestUnreadId, onClose }: { latestUnreadId?: string; onClose: () => void }) {
  const { items, settings, unreadCount } = useNotifications();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [osPermission, setOsPermission] = useState(osNotificationPermission());

  useEffect(() => {
    if (latestUnreadId) notificationStore.markRead(latestUnreadId);
  }, [latestUnreadId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (tab === "unread" && item.read) return false;
      if (category !== "all" && item.category !== category) return false;
      if (needle && !(item.title.toLowerCase().includes(needle) || (item.body ?? "").toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [items, tab, category, query]);

  const groups = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    filtered.forEach((item) => {
      const label = dayLabel(item.createdAt);
      const bucket = map.get(label);
      if (bucket) bucket.push(item);
      else map.set(label, [item]);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const categories = useMemo(() => {
    const present = new Set(items.map((item) => item.category));
    return (Object.keys(CATEGORY_ICON) as NotificationCategory[]).filter((key) => present.has(key));
  }, [items]);

  async function toggleOsNotifications() {
    if (settings.osEnabled) {
      notificationStore.updateSettings({ osEnabled: false });
      setOsPermission(osNotificationPermission());
      return;
    }
    const granted = await requestOsNotificationPermission();
    setOsPermission(osNotificationPermission());
    if (granted) notificationStore.updateSettings({ osEnabled: true });
  }

  return <div className="notification-layer" role="presentation">
    <button type="button" className="notification-backdrop" aria-label="Close notifications" onClick={onClose} />
    <aside className="notification-panel" role="dialog" aria-label="Notification center">
      <header className="notification-panel-header">
        <div className="notification-panel-title">
          <span className="notification-title-icon"><BellRing size={18} /></span>
          <div>
            <strong>Notifications</strong>
            <small>{unreadCount > 0 ? unreadCount + " unread" : "You are all caught up"}</small>
          </div>
        </div>
        <div className="notification-panel-header-actions">
          <button type="button" className={"notification-icon-btn" + (prefsOpen ? " active" : "")} onClick={() => setPrefsOpen((value) => !value)} title="Notification preferences" aria-label="Notification preferences"><Settings2 size={17} /></button>
          <button type="button" className="notification-icon-btn" onClick={onClose} title="Close" aria-label="Close notification center"><X size={18} /></button>
        </div>
      </header>

      {prefsOpen && <section className="notification-prefs" aria-label="Notification preferences">
        <div className="notification-prefs-row">
          <span className="notification-prefs-icon"><MonitorSmartphone size={16} /></span>
          <div className="notification-prefs-copy">
            <strong>Desktop notifications</strong>
            <small>{osPermission === "unsupported" ? "Not supported in this runtime" : osPermission === "denied" ? "Blocked by the system" : "Show real OS toasts outside the app"}</small>
          </div>
          <button
            type="button"
            className={"notification-toggle" + (settings.osEnabled ? " on" : "")}
            onClick={() => void toggleOsNotifications()}
            disabled={osPermission === "unsupported" || osPermission === "denied"}
            role="switch"
            aria-checked={settings.osEnabled}
            aria-label="Toggle desktop notifications"
          ><span /></button>
        </div>
        <div className="notification-prefs-row">
          <span className="notification-prefs-icon"><Volume2 size={16} /></span>
          <div className="notification-prefs-copy">
            <strong>Sound</strong>
            <small>Play a subtle chime for new alerts</small>
          </div>
          <button
            type="button"
            className={"notification-toggle" + (settings.soundEnabled ? " on" : "")}
            onClick={() => notificationStore.updateSettings({ soundEnabled: !settings.soundEnabled })}
            role="switch"
            aria-checked={settings.soundEnabled}
            aria-label="Toggle notification sound"
          ><span /></button>
        </div>
        <div className="notification-prefs-row">
          <span className="notification-prefs-icon"><Trash2 size={16} /></span>
          <div className="notification-prefs-copy">
            <strong>History retention</strong>
            <small>Older notifications are pruned automatically</small>
          </div>
          <select
            className="notification-prefs-select"
            value={settings.retentionDays}
            onChange={(event) => notificationStore.updateSettings({ retentionDays: Number(event.target.value) })}
            aria-label="Notification history retention"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </section>}

      <div className="notification-toolbar">
        <div className="notification-tabs" role="tablist" aria-label="Notification filters">
          <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All{items.length > 0 ? " · " + items.length : ""}</button>
          <button type="button" role="tab" aria-selected={tab === "unread"} className={tab === "unread" ? "active" : ""} onClick={() => setTab("unread")}>Unread{unreadCount > 0 ? " · " + unreadCount : ""}</button>
        </div>
        <label className="notification-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notifications…" aria-label="Search notifications" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={13} /></button>}
        </label>
      </div>

      {categories.length > 1 && <div className="notification-category-row" role="group" aria-label="Filter by category">
        <button type="button" className={"notification-chip" + (category === "all" ? " active" : "")} onClick={() => setCategory("all")}>All types</button>
        {categories.map((key) => {
          const Icon = CATEGORY_ICON[key];
          return <button key={key} type="button" className={"notification-chip" + (category === key ? " active" : "")} onClick={() => setCategory(key)}><Icon size={13} />{key}</button>;
        })}
      </div>}

      <div className="notification-list">
        {groups.length === 0 && <div className="notification-empty">
          <span className="notification-empty-icon"><CheckCheck size={30} /></span>
          <strong>{items.length === 0 ? "No notifications yet" : "Nothing matches this filter"}</strong>
          <p>{items.length === 0 ? "Sync alerts, security events, low-stock warnings and announcements will appear here as they happen." : "Try a different search or category."}</p>
        </div>}
        {groups.map(([label, groupItems]) => <section key={label} className="notification-group">
          <h3 className="notification-group-label">{label}</h3>
          {groupItems.map((item) => {
            const SeverityIcon = SEVERITY_ICON[item.severity];
            return <article key={item.id} className={"notification-item sev-" + item.severity + (item.read ? "" : " unread")}>
              <span className="notification-item-icon"><SeverityIcon size={17} /></span>
              <div className="notification-item-copy">
                <div className="notification-item-head">
                  <strong>{item.title}</strong>
                  <time dateTime={new Date(item.createdAt).toISOString()}>{relativeTime(item.createdAt)}</time>
                </div>
                {item.body && <p>{item.body}</p>}
                {item.actions && item.actions.length > 0 && <div className="notification-item-actions">
                  {item.actions.map((action) => <button key={action.label} type="button" onClick={action.onClick}>{action.label}</button>)}
                </div>}
              </div>
              <div className="notification-item-side">
                {!item.read && <span className="notification-unread-dot" aria-label="Unread" />}
                <button type="button" className="notification-item-btn" onClick={() => notificationStore.markRead(item.id)} title="Mark as read" aria-label="Mark as read"><Check size={14} /></button>
                <button type="button" className="notification-item-btn danger" onClick={() => notificationStore.dismiss(item.id)} title="Dismiss" aria-label="Dismiss notification"><X size={14} /></button>
              </div>
            </article>;
          })}
        </section>)}
      </div>

      <footer className="notification-panel-footer">
        <button type="button" className="notification-footer-btn" onClick={() => notificationStore.markAllRead()} disabled={unreadCount === 0}><CheckCheck size={15} />Mark all read</button>
        <button type="button" className="notification-footer-btn danger" onClick={() => notificationStore.clearAll()} disabled={items.length === 0}><Trash2 size={15} />Clear all</button>
      </footer>
    </aside>
  </div>;
}

interface ToastEntry {
  id: string;
  title: string;
  body?: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
}

export function NotificationToasts() {
  const { items } = useNotifications();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(items.map((item) => item.id));
      return;
    }
    const fresh = items.filter((item) => !seen.current!.has(item.id) && !item.read);
    fresh.forEach((item) => seen.current!.add(item.id));
    if (fresh.length === 0) return;
    setToasts((current) => [...current, ...fresh.map((item) => ({ id: item.id, title: item.title, body: item.body, severity: item.severity, category: item.category }))].slice(-4));
    fresh.forEach((item) => {
      const timer = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== item.id));
      }, 6000);
      timers.current.push(timer);
    });
  }, [items]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  if (toasts.length === 0) return null;
  return <div className="notification-toast-stack" aria-live="polite">
    {toasts.map((toast) => {
      const SeverityIcon = SEVERITY_ICON[toast.severity];
      return <div key={toast.id} className={"notification-toast sev-" + toast.severity}>
        <button
          type="button"
          className="notification-toast-main"
          onClick={() => {
            notificationStore.markRead(toast.id);
            dismissToast(toast.id);
            void focusMainWindow();
            window.dispatchEvent(new CustomEvent("beboss:notification-open"));
          }}
        >
          <span className="notification-toast-icon"><SeverityIcon size={18} /></span>
          <span className="notification-toast-copy">
            <strong>{toast.title}</strong>
            {toast.body && <small>{toast.body}</small>}
          </span>
        </button>
        <button type="button" className="notification-toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss"><X size={14} /></button>
      </div>;
    })}
  </div>;
}

export interface NotificationBridgeProps {
  offline: boolean;
  lowStock: number;
  ownerName: string | null;
  announcements: Array<Record<string, unknown>>;
}

/**
 * Turns real desktop app state into notifications. This bridge only reads
 * existing state and never mutates app data or API connections.
 */
export function NotificationBridge({ offline, lowStock, ownerName, announcements }: NotificationBridgeProps) {
  const prevOffline = useRef(offline);
  const prevLowStock = useRef(lowStock);
  const prevOwner = useRef(ownerName);
  const seenAnnouncements = useRef<Set<string> | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as Record<string, unknown> | undefined;
      if (!detail || typeof detail.title !== "string" || !detail.title.trim()) return;
      void notify({
        title: detail.title,
        body: typeof detail.body === "string" ? detail.body : undefined,
        category: typeof detail.category === "string" ? (detail.category as NotificationCategory) : "system",
        severity: typeof detail.severity === "string" ? (detail.severity as NotificationSeverity) : "info",
        dedupeKey: typeof detail.dedupeKey === "string" ? detail.dedupeKey : undefined,
      });
    };
    window.addEventListener("beboss:notify", handler);
    return () => window.removeEventListener("beboss:notify", handler);
  }, []);

  useEffect(() => {
    if (offline && !prevOffline.current) {
      void notify({
        category: "sync",
        severity: "warning",
        title: "Offline mode enabled",
        body: "Sales and stock changes are queued in the encrypted local database and will sync when the connection returns.",
        dedupeKey: "sync-offline",
      });
    } else if (!offline && prevOffline.current) {
      void notify({
        category: "sync",
        severity: "success",
        title: "Back online",
        body: "The cloud connection was restored. Queued changes are being synchronized.",
        dedupeKey: "sync-online",
      });
    }
    prevOffline.current = offline;
  }, [offline]);

  useEffect(() => {
    if (lowStock > prevLowStock.current && lowStock > 0) {
      void notify({
        category: "stock",
        severity: "warning",
        title: "Low stock warning",
        body: lowStock + (lowStock === 1 ? " product is" : " products are") + " at or below the reorder threshold. Review inventory to avoid stockouts.",
        dedupeKey: "stock-low",
      });
    }
    prevLowStock.current = lowStock;
  }, [lowStock]);

  useEffect(() => {
    if (ownerName && !prevOwner.current) {
      void notify({
        category: "security",
        severity: "success",
        title: "Signed in securely",
        body: "Welcome back, " + ownerName + ". Your owner session is active on this device.",
        dedupeKey: "auth-welcome",
      });
    }
    prevOwner.current = ownerName;
  }, [ownerName]);

  useEffect(() => {
    if (seenAnnouncements.current === null) {
      seenAnnouncements.current = new Set(announcements.map((row) => String(row.id ?? row.title ?? "")).filter(Boolean));
      return;
    }
    const fresh = announcements.filter((row) => {
      const key = String(row.id ?? row.title ?? "");
      return key && !seenAnnouncements.current!.has(key);
    });
    fresh.forEach((row) => seenAnnouncements.current!.add(String(row.id ?? row.title ?? "")));
    fresh.slice(0, 3).forEach((row) => {
      void notify({
        category: "announcement",
        severity: "info",
        title: String(row.title ?? "New announcement"),
        body: typeof row.body === "string" ? row.body.slice(0, 240) : "Open Billing to read the full announcement.",
        dedupeKey: "announcement-" + String(row.id ?? row.title ?? ""),
      });
    });
  }, [announcements]);

  return null;
}