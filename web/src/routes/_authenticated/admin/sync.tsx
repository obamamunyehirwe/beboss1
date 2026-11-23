import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import {
  Activity, Download, Radio, Trash2, Wifi, AlertTriangle,
  Boxes,
  Clock,
  CreditCard,
  KeyRound,
  Smartphone,
  Store,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatCard, StatusBadge, TableShell, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { useNow } from "@/hooks/use-now";
import { deleteSnapshot } from "@/lib/admin.functions";
import { branchesQuery, deviceSecurityTelemetryQuery, devicesQuery, shopsQuery, snapshotsQuery, stockTransfersQuery, syncEventsQuery, usersQuery, type DeviceSecurityTelemetry, type ShopAccount, type ShopBranch, type ShopStockTransfer, type ShopUser, type SyncEvent } from "@/lib/admin-queries";
import { formatDateTime, relativeTime } from "@/lib/format";
import { DAY, HEALTH_LABEL, HOUR, deviceHealth, type DeviceHealth } from "@/lib/sync-health";
import { cn } from "@/lib/utils";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/sync")({
  component: SyncMonitor,
  errorComponent: SyncRouteError,
});

const ENTITY_ICON: Record<string, typeof Store> = {
  SHOP: Store,
  DEVICE: Smartphone,
  STAFF: Users,
  SNAPSHOT: Boxes,
  PAYMENT: CreditCard,
  UNLOCK_CODE: KeyRound,
};
const ENTITY_LABEL: Record<string, string> = {
  SHOP: "Shop",
  DEVICE: "Device",
  STAFF: "Staff",
  SNAPSHOT: "Branch data",
  PAYMENT: "Payment",
  UNLOCK_CODE: "Unlock code",
};
type EntityFilter = "ALL" | keyof typeof ENTITY_LABEL;
type HealthFilter = "ALL" | DeviceHealth;

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 12 };

function SyncMonitor() {
  const a = useAdminText();
  const now = useNow(10_000);
  const events = useQuery(syncEventsQuery);
  const shops = useQuery(shopsQuery);
  const devices = useQuery(devicesQuery);
  const securityTelemetry = useQuery(deviceSecurityTelemetryQuery);
  const staff = useQuery(usersQuery);
  const snaps = useQuery(snapshotsQuery);
  const branches = useQuery(branchesQuery);
  const transfers = useQuery(stockTransfersQuery);

  const shopRows = useMemo<ShopSyncRow[]>(() => {
    const eventRows = events.data ?? [];
    const deviceRows = devices.data ?? [];
    const staffRows = staff.data ?? [];
    const snapshotRows = snaps.data ?? [];
    const branchRows = branches.data ?? [];
    const transferRows = transfers.data ?? [];
    return (shops.data ?? []).map((shop) => {
      const shopDevices = deviceRows.filter((d) => d.shop_sync_key === shop.id);
      const shopStaff = staffRows.filter((u) => u.shop_sync_key === shop.id);
      const shopSnapshots = snapshotRows.filter((s) => s.shop_sync_key === shop.id);
      const shopBranches = branchRows.filter((branch) => branch.shop_sync_key === shop.id);
      const shopTransfers = transferRows.filter((transfer) => transfer.shop_sync_key === shop.id);
      const shopEvents = eventRows.filter((e) => e.shop_sync_key === shop.id);
      const latestEvent = shopEvents.reduce<SyncEvent | null>((latest, current) => {
        if (!latest) return current;
        return Date.parse(current.created_at) > Date.parse(latest.created_at) ? current : latest;
      }, null);
      // Payment/admin audit events are not device sync heartbeats. Count only
      // snapshot uploads, device syncs, shop heartbeats and persisted device times.
      const syncSignals = shopEvents.filter((event) =>
        (event.entity === "SNAPSHOT" && event.action === "UPLOADED") ||
        (event.entity === "DEVICE" && event.action === "SYNCED") ||
        (event.entity === "SHOP" && event.action === "HEARTBEAT")
      );
      const latestSyncSignal = syncSignals.reduce<SyncEvent | null>((latest, current) => {
        if (!latest) return current;
        return Date.parse(current.created_at) > Date.parse(latest.created_at) ? current : latest;
      }, null);
      const deviceLastSync = shopDevices.reduce((latest, d) => Math.max(latest, Number(d.last_synced_at) || 0), 0);
      const snapshotLastSync = shopSnapshots.reduce((latest, s) => Math.max(latest, Number(s.updated_at) || 0), 0);
      const eventLastSync = latestSyncSignal ? Date.parse(latestSyncSignal.created_at) || 0 : 0;
      const lastSyncAt = Math.max(deviceLastSync, snapshotLastSync, eventLastSync);
      return {
        ...shop,
        devicesTotal: shopDevices.length,
        activeDevices: shopDevices.filter((d) => d.is_active).length,
        staffTotal: shopStaff.length,
        activeStaff: shopStaff.filter((u) => u.is_active).length,
        snapshotsTotal: shopSnapshots.length,
        branchesTotal: shopBranches.length,
        transfersTotal: shopTransfers.length,
        lastSyncAt,
        health: deviceHealth(lastSyncAt, now),
        latestEvent,
      };
    }).sort((left, right) => right.lastSyncAt - left.lastSyncAt);
  }, [events.data, shops.data, devices.data, staff.data, snaps.data, branches.data, transfers.data, now]);

  const retryAll = () => Promise.all([
    events.refetch(), shops.refetch(), devices.refetch(), securityTelemetry.refetch(), staff.refetch(), snaps.refetch(), branches.refetch(), transfers.refetch(),
  ]);

  const stats = useMemo(() => {
    const ev = events.data ?? [];
    const dv = devices.data ?? [];
    const health: Record<DeviceHealth, number> = { ONLINE: 0, TODAY: 0, IDLE: 0, STALE: 0, NEVER: 0 };
    for (const d of dv) health[deviceHealth(d.last_synced_at, now)]++;
    const last24 = ev.filter((e) => now - new Date(e.created_at).getTime() < DAY);
    const hours: { h: string; events: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const end = now - i * HOUR;
      const start = end - HOUR;
      hours.push({
        h: new Date(start).toLocaleTimeString("en-GB", { hour: "2-digit" }) + "h",
        events: last24.filter((e) => {
          const t = new Date(e.created_at).getTime();
          return t >= start && t < end;
        }).length,
      });
    }
    // Derive this KPI from the query results directly. Do not make the stats
    // memo depend on the separately-created shopRows memo (prevents TDZ regressions).
    const knownShopIds = new Set((shops.data ?? []).map((shop) => shop.id));
    const activeSince = now - 15 * 60_000;
    const activeShopIds = new Set<string>();
    for (const device of dv) {
      const lastSync = Number(device.last_synced_at) || 0;
      if (device.is_active && lastSync >= activeSince && knownShopIds.has(device.shop_sync_key)) {
        activeShopIds.add(device.shop_sync_key);
      }
    }
    for (const snapshot of snaps.data ?? []) {
      const lastSync = Number(snapshot.updated_at) || 0;
      if (lastSync >= activeSince && knownShopIds.has(snapshot.shop_sync_key)) {
        activeShopIds.add(snapshot.shop_sync_key);
      }
    }
    for (const event of ev) {
      const isSyncHeartbeat =
        (event.entity === "SNAPSHOT" && event.action === "UPLOADED") ||
        (event.entity === "DEVICE" && event.action === "SYNCED") ||
        (event.entity === "SHOP" && event.action === "HEARTBEAT");
      const createdAt = Date.parse(event.created_at);
      if (isSyncHeartbeat && createdAt >= activeSince && knownShopIds.has(event.shop_sync_key)) {
        activeShopIds.add(event.shop_sync_key);
      }
    }
    const activeShops = activeShopIds.size;

    // Failure telemetry is not yet uploaded by the offline Android outbox. Never
    // turn the absence of cloud failure events into a misleading 0% failure rate.
    const reportedFailures = last24.filter((e) => e.action.includes("FAILED")).length;
    const snapshotUploads24h = last24.filter((e) => e.entity === "SNAPSHOT" && e.action === "UPLOADED").length;

    // Shop totals come from shop_accounts, not devices: a valid shop can have no
    // paired device row while its first snapshot is still being provisioned.
    const totalShops = (shops.data ?? []).length;
    const snapshots = (snaps.data ?? []).length;
    const totalBranches = (branches.data ?? []).length;
    const totalTransfers = (transfers.data ?? []).length;
    const activeStaff = (staff.data ?? []).filter((u) => u.is_active).length;
    const staleDevices = dv.filter((d) => d.is_active && deviceHealth(d.last_synced_at, now) === "STALE").length;
    const securityAlerts = (securityTelemetry.data ?? []).filter((d) =>
      d.clock_rollback_detected || d.is_rooted || d.has_hooking || d.is_emulator || d.risk_score >= 40
    ).length;

    return {
      health,
      last24: last24.length,
      hours,
      activeShops,
      lastEvent: ev[0] ?? null,
      totalShops,
      activeStaff,
      totalStaff: (staff.data ?? []).length,
      reportedFailures,
      snapshotUploads24h,
      snapshots,
      totalBranches,
      totalTransfers,
      staleDevices,
      securityAlerts,
    };
  }, [events.data, shops.data, devices.data, securityTelemetry.data, staff.data, snaps.data, branches.data, transfers.data, now]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={a("Cloud sync monitor")}
        sub="Every phone → cloud sync as it happens: shop registrations, devices, staff, branch data, payments and code redemptions."
        actions={
          <span className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success">
            <Radio className="size-3.5 animate-pulse" />
            {stats.lastEvent ? `${a("Last cloud event")} ${relativeTime(stats.lastEvent.created_at, now)}` : a("Listening for cloud events")}
          </span>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <StatCard label="Total Shops" value={stats.totalShops} sub="registered businesses" icon={Store} tone="brand" />
        <StatCard label="Active Now" value={stats.activeShops} sub="sync signal in last 15 min" icon={Wifi} tone="success" />
        <StatCard label="Synced Staff" value={stats.activeStaff} sub={`${stats.totalStaff} staff accounts across shops`} icon={Users} tone="info" />
        <StatCard label="Snapshot Uploads (24h)" value={stats.snapshotUploads24h} sub="uploaded phone datasets" icon={Activity} tone="info" />
        <StatCard label="Reported Failures" value={stats.reportedFailures} sub="cloud-reported only; local retries stay on device" icon={AlertTriangle} tone={stats.reportedFailures > 0 ? "danger" : "info"} />
        <StatCard label="Branch Snapshots" value={stats.snapshots} sub="stored phone datasets" icon={Boxes} tone="brand" />
        <StatCard label="Registered Branches" value={stats.totalBranches} sub="normalized cross-shop branch records" icon={Store} tone="info" />
        <StatCard label="Stock Transfers" value={stats.totalTransfers} sub="cross-branch stock movements" icon={Boxes} tone="info" />
        <StatCard label="Stale Devices" value={stats.staleDevices} sub="active, no sync for 7+ days" icon={Clock} tone={stats.staleDevices > 0 ? "danger" : "success"} />
        <StatCard label="Security Alerts" value={stats.securityAlerts} sub="rollback, root, hooking, emulator or high risk" icon={AlertTriangle} tone={stats.securityAlerts > 0 ? "danger" : "success"} />
      </div>

      {[
        { label: "Cloud events", query: events },
        { label: "Shops", query: shops },
        { label: "Devices", query: devices },
        { label: "Security telemetry", query: securityTelemetry },
        { label: "Staff", query: staff },
        { label: "Snapshots", query: snaps },
        { label: "Branches", query: branches },
        { label: "Stock transfers", query: transfers },
      ].some(({ query }) => query.isError) ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <div className="min-w-0">
            <p className="font-semibold text-warning">{a("Some cloud sync data could not be loaded")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                ["Cloud events", events.error],
                ["Shops", shops.error],
                ["Devices", devices.error],
                ["Security telemetry", securityTelemetry.error],
                ["Staff", staff.error],
                ["Snapshots", snaps.error],
                ["Branches", branches.error],
                ["Stock transfers", transfers.error],
              ].filter(([, error]) => Boolean(error)).map(([label, error]) => `${label}: ${error instanceof Error ? error.message : "request failed"}`).join(" · ")}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void retryAll()}>
            <Radio /> {a("Retry cloud data")}
          </Button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">{a("Cloud activity — last 24 hours")}</h2>
        <div className="mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.hours}>
              <XAxis dataKey="h" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval={3} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="events" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Tabs defaultValue="live">
        <TabsList className="flex-wrap">
          <TabsTrigger value="live">{a("Live activity")} ({(events.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="shops">{a("Shops")} ({(shops.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="users">{a("Synced users")} ({(staff.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="devices">{a("Device health")} ({(devices.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="security">Security &amp; GPS ({(securityTelemetry.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="snapshots">{a("Branch snapshots")} ({(snaps.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="branches">{a("All branches")} ({(branches.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="transfers">{a("Stock transfers")} ({(transfers.data ?? []).length})</TabsTrigger>
        </TabsList>
        <TabsContent value="live">
          <LiveActivity events={events.data ?? []} loading={events.isLoading} now={now} />
        </TabsContent>
        <TabsContent value="shops">
          <ShopSyncTable rows={shopRows} loading={shops.isLoading || devices.isLoading || staff.isLoading || snaps.isLoading || branches.isLoading || transfers.isLoading} />
        </TabsContent>
        <TabsContent value="users">
          <SyncedUsersTable rows={staff.data ?? []} loading={staff.isLoading} />
        </TabsContent>
        <TabsContent value="devices">
          <DeviceHealthTable now={now} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTelemetryTable rows={securityTelemetry.data ?? []} loading={securityTelemetry.isLoading} now={now} />
        </TabsContent>
        <TabsContent value="snapshots">
          <Snapshots now={now} />
        </TabsContent>
        <TabsContent value="branches">
          <BranchesTable rows={branches.data ?? []} loading={branches.isLoading} />
        </TabsContent>
        <TabsContent value="transfers">
          <StockTransfersTable rows={transfers.data ?? []} loading={transfers.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type ShopSyncRow = ShopAccount & {
  devicesTotal: number;
  activeDevices: number;
  staffTotal: number;
  activeStaff: number;
  snapshotsTotal: number;
  branchesTotal: number;
  transfersTotal: number;
  lastSyncAt: number;
  health: DeviceHealth;
  latestEvent: SyncEvent | null;
};

function ShopSyncTable({ rows, loading }: { rows: ShopSyncRow[]; loading: boolean }) {
  const a = useAdminText();
  const [q, setQ] = useState("");
  const [health, setHealth] = useState<HealthFilter>("ALL");
  const filtered = rows.filter((shop) =>
    (health === "ALL" || shop.health === health) &&
    matches(q, shop.shop_name, shop.owner_name, shop.owner_username, shop.owner_phone, shop.id, shop.subscription_status),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={a("Search shop, owner, phone or sync status…")} />
        <FilterChips<HealthFilter>
          value={health}
          onChange={setHealth}
          options={[
            { value: "ALL", label: a("All shops"), count: rows.length },
            ...(["ONLINE", "TODAY", "IDLE", "STALE", "NEVER"] as const).map((value) => ({
              value,
              label: HEALTH_LABEL[value],
              count: rows.filter((shop) => shop.health === value).length,
            })),
          ]}
        />
        <Button size="sm" variant="glass" className="ml-auto" onClick={() => downloadCsv(
          `beboss-shop-sync-${Date.now()}.csv`,
          filtered.map((shop) => ({
            shop: shop.shop_name, owner: shop.owner_name, username: shop.owner_username,
            phone: shop.owner_phone, status: shop.subscription_status, syncHealth: shop.health,
            lastSync: shop.lastSyncAt ? new Date(shop.lastSyncAt).toISOString() : "",
            devices: shop.devicesTotal, activeDevices: shop.activeDevices,
            users: shop.staffTotal, activeUsers: shop.activeStaff, snapshots: shop.snapshotsTotal,
            branches: shop.branchesTotal, stockTransfers: shop.transfersTotal,
            latestEvent: shop.latestEvent?.action ?? "",
          })),
        )}>
          <Download /> {a("Export shops")}
        </Button>
      </div>
      {loading ? <LoadingBlock /> : !filtered.length ? (
        <EmptyState title={a("No registered shops match")} sub={a("Shops appear here after their account or first cloud sync is registered.")} />
      ) : (
        <TableShell>
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{a("Shop / owner")}</th>
                <th className="px-4 py-3">{a("Subscription")}</th>
                <th className="px-4 py-3">{a("Sync health")}</th>
                <th className="px-4 py-3">{a("Devices")}</th>
                <th className="px-4 py-3">{a("Users")}</th>
                <th className="px-4 py-3">{a("Snapshots")}</th>
                <th className="px-4 py-3">{a("Branches")}</th>
                <th className="px-4 py-3">{a("Transfers")}</th>
                <th className="px-4 py-3">{a("Last cloud sync")}</th>
                <th className="px-4 py-3">{a("Latest event")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((shop) => (
                <tr key={shop.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <Link to="/admin/shops/$shopId" params={{ shopId: shop.id }} className="font-medium hover:text-primary">
                      {shop.shop_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">@{shop.owner_username} · {shop.owner_phone}</p>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={shop.subscription_status} /></td>
                  <td className="px-4 py-3"><StatusBadge status={shop.health} /></td>
                  <td className="px-4 py-3 font-mono">{shop.activeDevices}/{shop.devicesTotal}</td>
                  <td className="px-4 py-3 font-mono">{shop.activeStaff}/{shop.staffTotal}</td>
                  <td className="px-4 py-3 font-mono">{shop.snapshotsTotal}</td>
                  <td className="px-4 py-3 font-mono">{shop.branchesTotal}</td>
                  <td className="px-4 py-3 font-mono">{shop.transfersTotal}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" title={shop.lastSyncAt ? formatDateTime(shop.lastSyncAt) : a("No cloud sync recorded")}>
                    {shop.lastSyncAt ? relativeTime(shop.lastSyncAt) : a("Never")}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {shop.latestEvent ? (
                      <span title={shop.latestEvent.detail}>
                        {shop.latestEvent.entity} · {shop.latestEvent.action.replaceAll("_", " ").toLowerCase()}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
      <p className="text-xs text-muted-foreground">{a("Showing")} {filtered.length.toLocaleString()} {a("of")} {rows.length.toLocaleString()} {a("shops")}.</p>
    </div>
  );
}

function SyncedUsersTable({ rows, loading }: { rows: ShopUser[]; loading: boolean }) {
  const a = useAdminText();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"ALL" | "OWNER" | "MANAGER" | "CASHIER">("ALL");
  const filtered = rows.filter((user) =>
    (role === "ALL" || user.role === role) &&
    matches(q, user.full_name, user.username, user.phone, user.shop_name, user.shop_sync_key, user.assigned_branch_name),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={a("Search name, username, phone, shop or branch…")} />
        <FilterChips
          value={role}
          onChange={setRole}
          options={[
            { value: "ALL", label: a("All roles"), count: rows.length },
            { value: "OWNER", label: a("Owners"), count: rows.filter((u) => u.role === "OWNER").length },
            { value: "MANAGER", label: a("Managers"), count: rows.filter((u) => u.role === "MANAGER").length },
            { value: "CASHIER", label: a("Cashiers"), count: rows.filter((u) => u.role === "CASHIER").length },
          ]}
        />
        <Button size="sm" variant="glass" className="ml-auto" onClick={() => downloadCsv(
          `beboss-synced-users-${Date.now()}.csv`,
          filtered.map((user) => ({
            name: user.full_name, username: user.username, phone: user.phone,
            role: user.role, shop: user.shop_name, shopKey: user.shop_sync_key,
            branch: user.assigned_branch_name, active: user.is_active,
            updatedAt: new Date(user.updated_at).toISOString(),
          })),
        )}>
          <Download /> {a("Export users")}
        </Button>
      </div>
      {loading ? <LoadingBlock /> : !filtered.length ? (
        <EmptyState title={a("No synced shop users match")} sub={a("Owner, manager and cashier accounts appear after their shop syncs with BeBoss Cloud.")} />
      ) : (
        <TableShell>
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{a("Person")}</th>
                <th className="px-4 py-3">{a("Shop")}</th>
                <th className="px-4 py-3">{a("Role")}</th>
                <th className="px-4 py-3">{a("Branch")}</th>
                <th className="px-4 py-3">{a("Status")}</th>
                <th className="px-4 py-3">{a("Last updated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{user.full_name || user.username}</p>
                    <p className="text-xs text-muted-foreground">@{user.username} · {user.phone || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/admin/shops/$shopId" params={{ shopId: user.shop_sync_key }} className="hover:text-primary">
                      {user.shop_name || user.shop_sync_key}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={user.role} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{user.assigned_branch_name || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={user.is_active ? "ACTIVE" : "SUSPENDED"} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" title={formatDateTime(user.updated_at)}>
                    {relativeTime(user.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
      <p className="text-xs text-muted-foreground">{a("Showing")} {filtered.length.toLocaleString()} {a("of")} {rows.length.toLocaleString()} {a("synced staff accounts")}.</p>
    </div>
  );
}

function BranchesTable({ rows, loading }: { rows: ShopBranch[]; loading: boolean }) {
  const a = useAdminText();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const filtered = rows.filter((branch) =>
    (status === "ALL" || (status === "ACTIVE" ? branch.is_active : !branch.is_active)) &&
    matches(q, branch.shop_name, branch.shop_sync_key, branch.name, branch.code, branch.address, branch.phone, branch.manager_name, branch.operational_status),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={a("Search branch, shop, manager, code or address…")} />
        <FilterChips
          value={status}
          onChange={setStatus}
          options={[
            { value: "ALL", label: a("All branches"), count: rows.length },
            { value: "ACTIVE", label: a("Active"), count: rows.filter((branch) => branch.is_active).length },
            { value: "INACTIVE", label: a("Inactive"), count: rows.filter((branch) => !branch.is_active).length },
          ]}
        />
        <Button size="sm" variant="glass" className="ml-auto" onClick={() => downloadCsv(
          `beboss-all-branches-${Date.now()}.csv`,
          filtered.map((branch) => ({
            shop: branch.shop_name, shopKey: branch.shop_sync_key, branch: branch.name, code: branch.code,
            address: branch.address, phone: branch.phone, manager: branch.manager_name,
            mainBranch: branch.is_main_branch, active: branch.is_active,
            operationalStatus: branch.operational_status, products: branch.product_count,
            stockValueRwf: branch.stock_value_rwf, dailyTargetRwf: branch.daily_sales_target_rwf,
            monthlyTargetRwf: branch.monthly_target_rwf, updatedAt: new Date(branch.updated_at).toISOString(),
            lastModifiedDevice: branch.last_modified_device_id, syncVersion: branch.sync_version,
          })),
        )}>
          <Download /> {a("Export branches")}
        </Button>
      </div>
      {loading ? <LoadingBlock /> : !filtered.length ? (
        <EmptyState title={a("No synchronized branches found")} sub={a("Branch records appear here when a shop device or owner portal syncs branch data to Supabase.")} />
      ) : (
        <TableShell>
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{a("Shop")}</th>
                <th className="px-4 py-3">{a("Branch")}</th>
                <th className="px-4 py-3">{a("Manager / contact")}</th>
                <th className="px-4 py-3">{a("Operations")}</th>
                <th className="px-4 py-3">{a("Products / stock")}</th>
                <th className="px-4 py-3">{a("Targets")}</th>
                <th className="px-4 py-3">{a("Last synced")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((branch) => (
                <tr key={branch.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <Link to="/admin/shops/$shopId" params={{ shopId: branch.shop_sync_key }} className="font-medium hover:text-primary">
                      {branch.shop_name || branch.shop_sync_key}
                    </Link>
                    <p className="text-xs text-muted-foreground">{branch.shop_sync_key}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{branch.name} {branch.is_main_branch ? <span className="text-xs text-primary">· {a("Main")}</span> : null}</p>
                    <p className="text-xs text-muted-foreground">{branch.code || "—"} · {branch.address || a("No address")}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{branch.manager_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{branch.phone || branch.email || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={branch.is_active ? branch.operational_status || "ACTIVE" : "INACTIVE"} />
                    <p className="mt-1 text-xs text-muted-foreground">{branch.is_active ? a("Active") : a("Inactive")}</p>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <p>{branch.product_count.toLocaleString()} {a("products")}</p>
                    <p className="text-xs text-muted-foreground">{Number(branch.stock_value_rwf || 0).toLocaleString()} FRw</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <p>{Number(branch.daily_sales_target_rwf || 0).toLocaleString()} FRw / {a("day")}</p>
                    <p>{Number(branch.monthly_target_rwf || 0).toLocaleString()} FRw / {a("month")}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" title={formatDateTime(branch.updated_at)}>
                    {relativeTime(branch.updated_at)}
                    <p className="font-mono text-[10px]">{branch.last_modified_device_id || "—"} · v{branch.sync_version}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
      <p className="text-xs text-muted-foreground">{a("Showing")} {filtered.length.toLocaleString()} {a("of")} {rows.length.toLocaleString()} {a("branches across all shops")}.</p>
    </div>
  );
}

function StockTransfersTable({ rows, loading }: { rows: ShopStockTransfer[]; loading: boolean }) {
  const a = useAdminText();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const statuses = Array.from(new Set(rows.map((transfer) => transfer.status).filter(Boolean))).sort();
  const filtered = rows.filter((transfer) =>
    (status === "ALL" || transfer.status === status) &&
    matches(q, transfer.shop_name, transfer.shop_sync_key, transfer.transfer_number, transfer.product_name,
      transfer.from_branch_name, transfer.to_branch_name, transfer.transferred_by, transfer.received_by, transfer.notes),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={a("Search shop, transfer, product, branch or staff…")} />
        <FilterChips
          value={status}
          onChange={setStatus}
          options={[
            { value: "ALL", label: a("All statuses"), count: rows.length },
            ...statuses.map((value) => ({ value, label: a(value.replaceAll("_", " ")), count: rows.filter((transfer) => transfer.status === value).length })),
          ]}
        />
        <Button size="sm" variant="glass" className="ml-auto" onClick={() => downloadCsv(
          `beboss-stock-transfers-${Date.now()}.csv`,
          filtered.map((transfer) => ({
            shop: transfer.shop_name, shopKey: transfer.shop_sync_key, transfer: transfer.transfer_number,
            product: transfer.product_name, from: transfer.from_branch_name, to: transfer.to_branch_name,
            quantity: transfer.quantity, unit: transfer.unit, costValueRwf: transfer.cost_value_rwf,
            status: transfer.status, transferredBy: transfer.transferred_by, receivedBy: transfer.received_by,
            transferDate: new Date(transfer.transfer_date).toISOString(), receivedAt: transfer.received_at,
            notes: transfer.notes, synced: transfer.synced, updatedAt: new Date(transfer.updated_at).toISOString(),
            lastModifiedDevice: transfer.last_modified_device_id,
          })),
        )}>
          <Download /> {a("Export transfers")}
        </Button>
      </div>
      {loading ? <LoadingBlock /> : !filtered.length ? (
        <EmptyState title={a("No stock transfers found")} sub={a("Stock movements between branches are listed here after a shop syncs them to Supabase.")} />
      ) : (
        <TableShell>
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{a("Shop / transfer")}</th>
                <th className="px-4 py-3">{a("Product")}</th>
                <th className="px-4 py-3">{a("Movement")}</th>
                <th className="px-4 py-3">{a("Quantity / value")}</th>
                <th className="px-4 py-3">{a("Status")}</th>
                <th className="px-4 py-3">{a("Transferred / received by")}</th>
                <th className="px-4 py-3">{a("Transfer date")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((transfer) => (
                <tr key={transfer.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <Link to="/admin/shops/$shopId" params={{ shopId: transfer.shop_sync_key }} className="font-medium hover:text-primary">
                      {transfer.shop_name || transfer.shop_sync_key}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{transfer.transfer_number || transfer.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{transfer.product_name || transfer.product_id}</p>
                    {transfer.notes ? <p className="max-w-[240px] truncate text-xs text-muted-foreground" title={transfer.notes}>{transfer.notes}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <p>{transfer.from_branch_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">→ {transfer.to_branch_name || "—"}</p>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <p>{Number(transfer.quantity).toLocaleString()} {transfer.unit}</p>
                    <p className="text-xs text-muted-foreground">{Number(transfer.cost_value_rwf || 0).toLocaleString()} FRw</p>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={transfer.status} /><p className="mt-1 text-xs text-muted-foreground">{transfer.synced ? a("Synced") : a("Pending sync")}</p></td>
                  <td className="px-4 py-3 text-xs">
                    <p>{transfer.transferred_by || "—"}</p>
                    <p className="text-muted-foreground">{transfer.received_by || a("Awaiting receipt")}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" title={formatDateTime(transfer.transfer_date)}>
                    {transfer.transfer_date ? formatDateTime(transfer.transfer_date) : "—"}
                    <p>{transfer.received_at ? relativeTime(transfer.received_at) : ""}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
      <p className="text-xs text-muted-foreground">{a("Showing")} {filtered.length.toLocaleString()} {a("of")} {rows.length.toLocaleString()} {a("stock transfers across all shops")}.</p>
    </div>
  );
}

function SyncRouteError({ error, reset }: { error: Error; reset: () => void }) {
  const a = useAdminText();
  return (
    <div role="alert" className="mx-auto max-w-2xl space-y-4 rounded-3xl border border-warning/40 bg-card p-8">
      <div className="flex items-center gap-3 text-warning">
        <AlertTriangle className="size-6" />
        <h1 className="text-xl font-bold">{a("Cloud sync page could not load")}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{error.message || a("An unexpected error interrupted this page.")}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}><Radio /> {a("Try again")}</Button>
        <Button asChild variant="outline"><Link to="/admin">{a("Back to admin overview")}</Link></Button>
      </div>
    </div>
  );
}

function LiveActivity({ events, loading, now }: { events: SyncEvent[]; loading: boolean; now: number }) {
  const a = useAdminText();
  const [f, setF] = useState<EntityFilter>("ALL");
  const [q, setQ] = useState("");
  const rows = events.filter((e) => (f === "ALL" || e.entity === f) && matches(q, e.shop_name, e.shop_sync_key, e.action, e.detail, e.device_id));
  const count = (k: string) => events.filter((e) => e.entity === k).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search shop, device, detail…" />
        <FilterChips<EntityFilter>
          value={f}
          onChange={setF}
          options={[{ value: "ALL", label: "All", count: events.length }, ...Object.keys(ENTITY_LABEL).map((k) => ({ value: k as EntityFilter, label: ENTITY_LABEL[k] ?? k, count: count(k) }))]}
        />
        <Button size="sm" variant="glass" className="ml-auto" onClick={() => downloadCsv(`beboss-sync-${Date.now()}.csv`, rows.map((r) => ({ ...r })))}>
          <Download /> {a("Export")}
        </Button>
      </div>
      {loading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title="No sync activity yet" sub="As soon as a phone with BeBoss goes online, its sync shows up here in real time." />
      ) : (
        <ol className="relative space-y-2 border-l border-border pl-5">
          {rows.slice(0, 250).map((e) => {
            const Icon = ENTITY_ICON[e.entity] ?? Activity;
            const fresh = now - new Date(e.created_at).getTime() < 60_000;
            return (
              <li key={e.id} className={cn("relative rounded-2xl border border-border bg-card px-4 py-3 transition-colors", fresh && "border-primary/50 bg-primary/5 animate-fade-up")}>
                <span className={cn("absolute -left-[29px] top-4 grid size-6 place-items-center rounded-full border border-border bg-background", fresh && "border-primary text-primary")}>
                  <Icon className="size-3" />
                </span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {ENTITY_LABEL[e.entity] ?? e.entity} · {e.action.replaceAll("_", " ").toLowerCase()}
                    </span>
                    <StatusBadge status={e.actor} />
                  </div>
                  <span className="text-[11px] text-muted-foreground" title={formatDateTime(e.created_at)}>
                    {relativeTime(e.created_at, now)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.shop_sync_key ? (
                    <Link to="/admin/shops/$shopId" params={{ shopId: e.shop_sync_key }} className="text-foreground hover:text-primary">
                      {e.shop_name || e.shop_sync_key}
                    </Link>
                  ) : null}
                  {e.device_id ? <span className="font-mono"> · {e.device_id}</span> : null}
                  {e.detail ? <span> · {e.detail}</span> : null}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function DeviceHealthTable({ now }: { now: number }) {
  const { data, isLoading } = useQuery(devicesQuery);
  const [f, setF] = useState<HealthFilter>("ALL");
  const [q, setQ] = useState("");
  const all = (data ?? []).map((d) => ({ ...d, health: deviceHealth(d.last_synced_at, now) }));
  const rows = all
    .filter((d) => (f === "ALL" || d.health === f) && matches(q, d.shop_name, d.device_name, d.device_id, d.assigned_username, d.branch_name))
    .sort((a, b) => b.last_synced_at - a.last_synced_at);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search shop, device, user, branch…" />
        <FilterChips<HealthFilter>
          value={f}
          onChange={setF}
          options={[
            { value: "ALL", label: "All", count: all.length },
            ...(["ONLINE", "TODAY", "IDLE", "STALE", "NEVER"] as const).map((h) => ({ value: h, label: HEALTH_LABEL[h], count: all.filter((d) => d.health === h).length })),
          ]}
        />
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title="No devices" />
      ) : (
        <TableShell>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Shop / branch</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Last sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{d.device_name || d.device_id}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {d.device_id}
                      {d.is_owner_primary ? " · owner phone" : ""}
                      {!d.is_active ? " · deactivated" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/admin/shops/$shopId" params={{ shopId: d.shop_sync_key }} className="hover:text-primary">
                      {d.shop_name || d.shop_sync_key}
                    </Link>
                    <p className="text-xs text-muted-foreground">{d.branch_name}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {d.assigned_user_name || d.assigned_username} <span className="text-muted-foreground">· {d.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.health} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" title={formatDateTime(d.last_synced_at)}>
                    {d.last_synced_at ? relativeTime(d.last_synced_at, now) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  );
}


function SecurityTelemetryTable({
  rows,
  loading,
  now,
}: {
  rows: DeviceSecurityTelemetry[];
  loading: boolean;
  now: number;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ALERTS" | "ROLLBACK" | "CLEAR">("ALL");
  const filtered = rows.filter((row) => {
    const alert = row.clock_rollback_detected || row.is_rooted || row.has_hooking || row.is_emulator || row.risk_score >= 40;
    const matchesFilter =
      filter === "ALL" ||
      (filter === "ALERTS" && alert) ||
      (filter === "ROLLBACK" && row.clock_rollback_detected) ||
      (filter === "CLEAR" && !alert);
    return matchesFilter && matches(
      q,
      row.shop_name,
      row.shop_sync_key,
      row.device_id,
      row.device_name,
      row.posture_label,
      row.tamper_reason,
      row.location_label,
      row.permissions_summary,
    );
  });

  const getSummary = (value: DeviceSecurityTelemetry["message_summary_json"]) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search shop, device, security signal, GPS label…" />
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "All devices", count: rows.length },
            { value: "ALERTS", label: "Security alerts", count: rows.filter((r) => r.clock_rollback_detected || r.is_rooted || r.has_hooking || r.is_emulator || r.risk_score >= 40).length },
            { value: "ROLLBACK", label: "Clock rollback", count: rows.filter((r) => r.clock_rollback_detected).length },
            { value: "CLEAR", label: "No flagged signals", count: rows.filter((r) => !r.clock_rollback_detected && !r.is_rooted && !r.has_hooking && !r.is_emulator && r.risk_score < 40).length },
          ]}
        />
        <Button
          size="sm"
          variant="glass"
          className="ml-auto"
          onClick={() => downloadCsv(
            "beboss-device-security-telemetry-" + Date.now() + ".csv",
            filtered.map((r) => ({
              shop: r.shop_name,
              shopSyncKey: r.shop_sync_key,
              device: r.device_name,
              deviceId: r.device_id,
              riskScore: r.risk_score,
              posture: r.posture_label,
              rooted: r.is_rooted,
              hooking: r.has_hooking,
              emulator: r.is_emulator,
              clockRollback: r.clock_rollback_detected,
              tamperIncidents: r.tamper_incident_count,
              clockSkewMs: r.clock_skew_ms,
              tamperReason: r.tamper_reason,
              location: r.location_label,
              latitude: r.latitude,
              longitude: r.longitude,
              gpsAccuracyMeters: r.accuracy_meters,
              gpsCapturedAt: r.location_captured_at ? new Date(r.location_captured_at).toISOString() : "",
              outboundPending: r.unsynced_messages_count,
              messageSummary: JSON.stringify(r.message_summary_json),
              permissions: r.permissions_summary,
              inspectedAt: r.inspected_at ? new Date(r.inspected_at).toISOString() : "",
              updatedAt: new Date(r.updated_at).toISOString(),
            })),
          )}
        >
          <Download /> Export security data
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        GPS is optional and is uploaded only while location permission is granted, using a recent foreground fix. Message data is aggregate-only: phone numbers and message previews stay on the device. “Sent” records mean the app initiated a dispatch, not confirmed delivery.
      </p>

      {loading ? <LoadingBlock /> : !filtered.length ? (
        <EmptyState
          title="No device security telemetry"
          sub="Paired terminals appear here after a successful online security sync. Missing data is not treated as a clean device."
        />
      ) : (
        <TableShell>
          <table className="w-full min-w-[1440px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Device / shop</th>
                <th className="px-4 py-3">Risk posture</th>
                <th className="px-4 py-3">Tamper detection</th>
                <th className="px-4 py-3">GPS / location</th>
                <th className="px-4 py-3">Outbound activity</th>
                <th className="px-4 py-3">Permissions</th>
                <th className="px-4 py-3">Last inspected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => {
                const alert = row.clock_rollback_detected || row.is_rooted || row.has_hooking || row.is_emulator || row.risk_score >= 40;
                const status = row.clock_rollback_detected
                  ? "CLOCK ROLLBACK"
                  : row.risk_score >= 70
                    ? "CRITICAL RISK"
                    : row.risk_score >= 40 || row.is_rooted || row.has_hooking
                      ? "HIGH RISK"
                      : alert
                        ? "REVIEW"
                        : row.risk_score > 0
                          ? "ELEVATED"
                          : "NO FLAGGED SIGNAL";
                const summary = getSummary(row.message_summary_json);
                const channels = getSummary(summary.channels as DeviceSecurityTelemetry["message_summary_json"]);
                const statuses = getSummary(summary.statuses as DeviceSecurityTelemetry["message_summary_json"]);
                const recorded = Number(summary.record_count ?? 0);
                const hasGps = row.location_captured_at > 0 &&
                  Number.isFinite(row.latitude) && Number.isFinite(row.longitude);
                const mapUrl = hasGps
                  ? "https://www.google.com/maps?q=" + row.latitude + "," + row.longitude
                  : null;

                return (
                  <tr key={row.id} className="align-top hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.device_name || row.device_id}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{row.device_id}</p>
                      <Link to="/admin/shops/$shopId" params={{ shopId: row.shop_sync_key }} className="text-xs text-primary hover:underline">
                        {row.shop_name || row.shop_sync_key}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                      <p className="mt-1 font-mono text-xs">Risk {row.risk_score}/100</p>
                      <p className="text-[11px] text-muted-foreground">{row.posture_label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Root {row.is_rooted ? "yes" : "no"} · Hook {row.has_hooking ? "yes" : "no"} · Emulator {row.is_emulator ? "yes" : "no"}
                      </p>
                    </td>
                    <td className="max-w-[260px] px-4 py-3 text-xs">
                      <p>{row.clock_rollback_detected ? "Clock rollback detected" : "No rollback reported"}</p>
                      <p className="mt-1 text-muted-foreground">{row.tamper_reason || "No additional tamper reason"}</p>
                      <p className="mt-1 text-muted-foreground">
                        Incidents: {row.tamper_incident_count} · Skew: {row.clock_skew_ms.toLocaleString()} ms
                      </p>
                      <p className="text-muted-foreground">Keystore: {row.keystore_backing || "Unknown"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>{row.location_label || "GPS unavailable"}</p>
                      {mapUrl ? (
                        <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary hover:underline">
                          Open map · ±{Math.round(row.accuracy_meters)} m
                        </a>
                      ) : <p className="mt-1 text-muted-foreground">No recent permitted GPS fix</p>}
                      <p className="mt-1 text-muted-foreground">
                        {row.location_captured_at ? relativeTime(row.location_captured_at, now) : "Not captured"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>{recorded} recent dispatch records</p>
                      <p className="mt-1 text-muted-foreground">
                        {Object.entries(channels).map(([name, count]) => name + ": " + String(count)).join(" · ") || "No channel activity"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {Object.entries(statuses).map(([name, count]) => name + ": " + String(count)).join(" · ") || "No status summary"}
                      </p>
                      <p className="mt-1 text-muted-foreground">Pending upload: {row.unsynced_messages_count}</p>
                    </td>
                    <td className="max-w-[230px] px-4 py-3 text-xs text-muted-foreground">{row.permissions_summary || "Not reported"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" title={formatDateTime(row.inspected_at)}>
                      {row.inspected_at ? relativeTime(row.inspected_at, now) : "Not inspected"}
                      <p className="mt-1">Cloud update: {relativeTime(row.updated_at, now)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} device records. No telemetry row means “not reported”, not “verified”.
      </p>
    </div>
  );
}

function Snapshots({ now }: { now: number }) {
  const a = useAdminText();
  const { data, isLoading } = useQuery(snapshotsQuery);
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const [q, setQ] = useState("");
  const del = useAdminAction(useServerFn(deleteSnapshot), { success: "Snapshot removed", invalidate: [["admin", "snapshots"]] });
  const rows = (data ?? []).filter((s) => matches(q, s.shop_name, s.owner_username, s.branch_name, s.device_id, s.records_summary));
  const stale = rows.filter((s) => now - s.updated_at > 14 * DAY);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search shop, branch, device, summary…" />
        {isAdmin && stale.length ? (
          <ConfirmAction
            trigger={
              <Button size="sm" variant="glass">
                <Trash2 /> {a("Prune stale snapshots")} ({stale.length})
              </Button>
            }
            title={a("Remove stale snapshots?")}
            description={a("Snapshots not refreshed for 14+ days are deleted. Active devices re-upload fresh ones on their next sync.")}
            confirmLabel="Prune"
            destructive
            onConfirm={() => stale.forEach((s) => del.mutate({ id: s.id }))}
          />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Snapshots are HMAC-signed and compressed; they are relayed through the cloud and can be inspected only by authorized admin sessions.</p>
      {isLoading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title="No snapshots" sub="Multi-branch shops upload snapshots automatically when online." />
      ) : (
        <TableShell>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Updated</th>
                {isAdmin ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <Link to="/admin/shops/$shopId" params={{ shopId: s.shop_sync_key }} className="hover:text-primary">
                      {s.shop_name || s.shop_sync_key}
                    </Link>
                    <p className="text-xs text-muted-foreground">@{s.owner_username}</p>
                  </td>
                  <td className="px-4 py-3">{s.branch_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.device_id}</td>
                  <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">{s.records_summary || "—"}</td>
                  <td className={cn("px-4 py-3 text-xs", now - s.updated_at > 14 * DAY ? "text-warning" : "text-muted-foreground")} title={formatDateTime(s.updated_at)}>
                    {relativeTime(s.updated_at, now)}
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-3 text-right">
                      <ConfirmAction
                        trigger={
                          <Button size="icon" variant="ghost" aria-label="Delete snapshot">
                            <Trash2 />
                          </Button>
                        }
                        title={a("Delete this snapshot?")}
                        description="The branch device re-uploads it on its next sync."
                        destructive
                        confirmLabel="Delete"
                        onConfirm={() => del.mutate({ id: s.id })}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  );
}
