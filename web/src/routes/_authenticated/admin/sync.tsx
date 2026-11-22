import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { devicesQuery, shopsQuery, snapshotsQuery, syncEventsQuery, type SyncEvent } from "@/lib/admin-queries";
import { formatDateTime, relativeTime } from "@/lib/format";
import { DAY, HEALTH_LABEL, HOUR, deviceHealth, type DeviceHealth } from "@/lib/sync-health";
import { cn } from "@/lib/utils";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/sync")({
  component: SyncMonitor,
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
  const snaps = useQuery(snapshotsQuery);

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
    // Count activity that is actually emitted by the mobile-to-cloud sync triggers.
    const syncActivity = last24.filter((e) =>
      (e.entity === "SNAPSHOT" && e.action === "UPLOADED") ||
      (e.entity === "DEVICE" && e.action === "SYNCED") ||
      (e.entity === "SHOP" && ["HEARTBEAT", "REGISTERED"].includes(e.action))
    );
    const activeShops = new Set(
      syncActivity
        .filter((e) => now - new Date(e.created_at).getTime() < 15 * 60_000)
        .map((e) => e.shop_sync_key)
        .filter(Boolean),
    ).size;

    // Failure telemetry is not yet uploaded by the offline Android outbox. Never
    // turn the absence of cloud failure events into a misleading 0% failure rate.
    const reportedFailures = last24.filter((e) => e.action.includes("FAILED")).length;
    const snapshotUploads24h = last24.filter((e) => e.entity === "SNAPSHOT" && e.action === "UPLOADED").length;

    // Shop totals come from shop_accounts, not devices: a valid shop can have no
    // paired device row while its first snapshot is still being provisioned.
    const totalShops = (shops.data ?? []).length;
    const snapshots = (snaps.data ?? []).length;
    const staleDevices = dv.filter((d) => d.is_active && deviceHealth(d.last_synced_at, now) === "STALE").length;

    return {
      health,
      last24: last24.length,
      hours,
      activeShops,
      lastEvent: ev[0] ?? null,
      totalShops,
      reportedFailures,
      snapshotUploads24h,
      snapshots,
      staleDevices,
    };
  }, [events.data, shops.data, devices.data, snaps.data, now]);

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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Total Shops" value={stats.totalShops} sub="registered businesses" icon={Store} tone="brand" />
        <StatCard label="Active Now" value={stats.activeShops} sub="sync signal in last 15 min" icon={Wifi} tone="success" />
        <StatCard label="Snapshot Uploads (24h)" value={stats.snapshotUploads24h} sub="uploaded phone datasets" icon={Activity} tone="info" />
        <StatCard label="Reported Failures" value={stats.reportedFailures} sub="cloud-reported only; local retries stay on device" icon={AlertTriangle} tone={stats.reportedFailures > 0 ? "danger" : "info"} />
        <StatCard label="Branch Snapshots" value={stats.snapshots} sub="stored phone datasets" icon={Boxes} tone="brand" />
        <StatCard label="Stale Devices" value={stats.staleDevices} sub="active, no sync for 7+ days" icon={Clock} tone={stats.staleDevices > 0 ? "danger" : "success"} />
      </div>

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
          <TabsTrigger value="live">{a("Live activity")}</TabsTrigger>
          <TabsTrigger value="devices">{a("Device health")} ({(devices.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="snapshots">{a("Branch snapshots")} ({(snaps.data ?? []).length})</TabsTrigger>
        </TabsList>
        <TabsContent value="live">
          <LiveActivity events={events.data ?? []} loading={events.isLoading} now={now} />
        </TabsContent>
        <TabsContent value="devices">
          <DeviceHealthTable now={now} />
        </TabsContent>
        <TabsContent value="snapshots">
          <Snapshots now={now} />
        </TabsContent>
      </Tabs>
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
  const a = useAdminText();
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
