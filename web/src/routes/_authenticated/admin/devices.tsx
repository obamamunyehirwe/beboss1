import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Download, Pause, Play, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, TableShell, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { deleteDevice, setDeviceActive } from "@/lib/admin.functions";
import { deviceCredentialRolloutQuery, devicesQuery, deviceSecurityTelemetryQuery } from "@/lib/admin-queries";
import { formatRwf, relativeTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/devices")({
  component: DevicesPage,
});

type F = "ALL" | "ACTIVE" | "PAUSED" | "STALE";

function DevicesPage() {
  const a = useAdminText();
  const { data, isLoading, isError, error, refetch } = useQuery(devicesQuery);
  const telemetry = useQuery(deviceSecurityTelemetryQuery);
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const rollout = useQuery({ ...deviceCredentialRolloutQuery, enabled: isAdmin });
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("ALL");
  const toggle = useAdminAction(useServerFn(setDeviceActive), { success: "Device updated", invalidate: [["admin", "devices"]] });
  const del = useAdminAction(useServerFn(deleteDevice), { success: "Device removed", invalidate: [["admin", "devices"]] });
  const now = Date.now();
  const stale = (t: number) => !t || now - t > 7 * 86_400_000;
  const all = data ?? [];
  const rows = all
    .filter((d) => (f === "ALL" ? true : f === "ACTIVE" ? d.is_active : f === "PAUSED" ? !d.is_active : stale(d.last_synced_at)))
    .filter((d) => matches(q, d.device_name, d.device_id, d.shop_name, d.join_code, d.assigned_username, d.assigned_user_name, d.branch_name));
  const telemetryByDevice = useMemo(
    () => new Map((telemetry.data ?? []).map((item) => [`${item.shop_sync_key}::${item.device_id}`, item] as const)),
    [telemetry.data],
  );
  const addonMrr = all.filter((d) => d.is_active && !d.is_owner_primary).reduce((a, d) => a + d.monthly_fee_addon_rwf, 0);
  const rolloutRows = rollout.data ?? [];
  const rolloutTotals = rolloutRows.reduce((total, shop) => ({
    active: total.active + shop.active_device_count,
    secured: total.secured + shop.enrolled_device_count,
    missing: total.missing + shop.missing_device_count,
    retired: total.retired + (shop.legacy_sync_disabled ? 1 : 0),
    ready: total.ready + (shop.ready_to_retire ? 1 : 0),
  }), { active: 0, secured: 0, missing: 0, retired: 0, ready: 0 });

  return (
    <div>
      <PageHeader
        title="Devices"
        sub={`Paired terminals across all shops • extra-device add-ons ${formatRwf(addonMrr)} / month`}
        actions={
          <Button size="sm" variant="glass" onClick={() => downloadCsv(`beboss-devices-${Date.now()}.csv`, rows)}>
            <Download /> {a("Export")}
          </Button>
        }
      />
      {isAdmin ? (
        <section className="mb-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm" aria-labelledby="device-credential-rollout-heading">
          <div className="flex flex-col gap-3 border-b border-border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4 text-primary" />
                <h2 id="device-credential-rollout-heading">{a("Android device security rollout")}</h2>
              </div>
              <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                {a("Owner-approved credential migration status. No tokens or hashes are shown.")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => rollout.refetch()} disabled={rollout.isFetching}>
              <RefreshCw className={rollout.isFetching ? "animate-spin" : ""} /> {a("Refresh")}
            </Button>
          </div>
          {rollout.isLoading ? (
            <div className="p-5"><LoadingBlock /></div>
          ) : rollout.isError ? (
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" role="alert">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <span>{a("Security rollout status could not be loaded.")} {rollout.error instanceof Error ? rollout.error.message : ""}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => rollout.refetch()}>{a("Retry security status")}</Button>
            </div>
          ) : (
            <div className="p-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {[
                  { label: "Shops", value: rolloutRows.length },
                  { label: "Active terminals", value: rolloutTotals.active },
                  { label: "Secured terminals", value: rolloutTotals.secured },
                  { label: "Missing credentials", value: rolloutTotals.missing },
                  { label: "Ready for owner approval", value: rolloutTotals.ready },
                  { label: "Legacy retired", value: rolloutTotals.retired },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-xs text-muted-foreground">{a(metric.label)}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{metric.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">{a("Shop")}</th>
                      <th className="px-4 py-3">{a("Device credentials")}</th>
                      <th className="px-4 py-3">{a("Legacy sync")}</th>
                      <th className="px-4 py-3">{a("Migration status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rolloutRows.map((shop) => {
                      const status = shop.legacy_sync_disabled
                        ? { label: "Retired", style: "bg-success/10 text-success" }
                        : shop.ready_to_retire
                          ? { label: "Ready for owner approval", style: "bg-primary/10 text-primary" }
                          : shop.active_device_count === 0
                            ? { label: "No active terminals", style: "bg-muted text-muted-foreground" }
                            : { label: "Enroll devices before retiring legacy sync.", style: "bg-warning/10 text-warning" };
                      return (
                        <tr key={shop.shop_sync_key} className="hover:bg-accent/30">
                          <td className="px-4 py-3">
                            <Link to="/admin/shops/$shopId" params={{ shopId: shop.shop_sync_key }} className="font-medium hover:text-primary">
                              {shop.shop_name || shop.shop_sync_key}
                            </Link>
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            <span className="font-semibold">{shop.enrolled_device_count} / {shop.active_device_count}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{shop.missing_device_count} {a("missing")}</span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={shop.legacy_sync_disabled ? "RETIRED" : "LEGACY ENABLED"} />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.style}`}>{a(status.label)}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {!rolloutRows.length ? (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">{a("No registered shops to report.")}</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {a("Legacy sync is retired only by the verified shop owner after every active terminal is enrolled and tested. Admins can monitor coverage but cannot force a cutover here.")}
              </p>
            </div>
          )}
        </section>
      ) : null}
      {telemetry.isError ? (
        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>Device security and location reports could not be loaded. Device pairing data is still available.</span>
          <Button size="sm" variant="outline" onClick={() => telemetry.refetch()}>Retry reports</Button>
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search device, shop, join code, user, branch…" />
        <FilterChips<F>
          value={f}
          onChange={setF}
          options={[
            { value: "ALL", label: "All", count: all.length },
            { value: "ACTIVE", label: "Active", count: all.filter((d) => d.is_active).length },
            { value: "PAUSED", label: "Paused", count: all.filter((d) => !d.is_active).length },
            { value: "STALE", label: "No sync 7d+", count: all.filter((d) => stale(d.last_synced_at)).length },
          ]}
        />
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-sm text-destructive">{a("Device records could not be loaded.")} {error instanceof Error ? error.message : ""}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>{a("Retry")}</Button>
        </div>
      ) : !rows.length ? (
        <EmptyState title="No devices" sub="Devices register when a shop owner pairs a new phone with a join code." />
      ) : (
        <TableShell>
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Platform & software</th>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">User & branch</th>
                <th className="px-4 py-3">Join code</th>
                <th className="px-4 py-3">Last sync</th>
                <th className="px-4 py-3">Security</th>
                <th className="px-4 py-3">Last shared location</th>
                <th className="px-4 py-3">Status</th>
                {isAdmin ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => {
                const report = telemetryByDevice.get(`${d.shop_sync_key}::${d.device_id}`);
                const platform = report?.device_platform || (String(d.device_id || "").startsWith("DESKTOP:") ? "DESKTOP" : "ANDROID");
                const optedIn = !!report && /(?:^|;)location_sharing=enabled(?:;|$)/i.test(report.permissions_summary || "");
                const latitude = Number(report?.latitude ?? 0);
                const longitude = Number(report?.longitude ?? 0);
                const capturedAt = Number(report?.location_captured_at ?? 0);
                const hasLocation = optedIn && capturedAt > 0 && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && (latitude !== 0 || longitude !== 0);
                return (
                  <tr key={d.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{d.device_name || "Unnamed device"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{d.device_id || "Awaiting pairing"}</span>
                        {d.is_owner_primary ? <span className="text-[10px] text-muted-foreground">• owner</span> : Number(d.monthly_fee_addon_rwf) > 0 ? (
                          <span className="text-[10px] text-muted-foreground">+{d.monthly_fee_addon_rwf.toLocaleString()} FRw / {a("per month")}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium">{platform}</p>
                      <p>{[report?.manufacturer, report?.model].filter(Boolean).join(" ") || "Hardware not reported"}</p>
                      <p className="text-muted-foreground">{report?.os_release ? `OS ${report.os_release} · API ${report.sdk_int}` : "OS version unavailable"}</p>
                      <p className="text-muted-foreground">{report?.app_version ? `BeBoss ${report.app_version} (${report.app_build})` : telemetry.isLoading ? "Loading device report…" : "App version unavailable"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/admin/shops/$shopId" params={{ shopId: d.shop_sync_key }} className="hover:text-primary">
                        {d.shop_name || d.shop_sync_key}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>{d.assigned_user_name || d.assigned_username || "—"}</p>
                      <p className="text-muted-foreground">{d.role} • {d.branch_name}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{d.join_code || "—"}</td>
                    <td className={`px-4 py-3 text-xs ${stale(d.last_synced_at) ? "text-warning" : "text-muted-foreground"}`}>{relativeTime(d.last_synced_at)}</td>
                    <td className="px-4 py-3 text-xs">
                      {report ? <><StatusBadge status={report.risk_score >= 50 ? "HIGH RISK" : report.posture_label || "REPORTED"} /><p className="mt-1 text-muted-foreground">{Number(report.risk_score)}/100 · {relativeTime(report.updated_at)}</p></> : <span className="text-muted-foreground">{telemetry.isLoading ? "Loading…" : "Awaiting report"}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {hasLocation ? (
                        <><a className="font-medium text-primary underline underline-offset-2" href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`} target="_blank" rel="noreferrer">{report?.location_label || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}</a><p className="mt-1 text-muted-foreground">Captured {new Date(capturedAt).toLocaleString()} · ±{Math.round(Number(report?.accuracy_meters ?? 0))}m</p></>
                      ) : <span className="text-muted-foreground">{optedIn ? "Opted in · No recent foreground fix" : report ? "Not shared by device" : telemetry.isLoading ? "Loading report…" : "No report"}</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={d.is_active ? "ACTIVE" : "SUSPENDED"} /></td>
                    {isAdmin ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: d.id, active: !d.is_active })}>
                            {d.is_active ? <Pause /> : <Play />}
                            {a(d.is_active ? "Pause" : "Resume")}
                          </Button>
                          <ConfirmAction
                            trigger={<Button size="icon" variant="ghost" aria-label={a("Remove device")}><Trash2 /></Button>}
                            title={a(`Remove ${d.device_name || "this device"}?`)}
                            description={a("The device is unpaired from the shop. It will need a new join code to sync again.")}
                            destructive confirmLabel="Remove"
                            onConfirm={() => del.mutate({ id: d.id })}
                          />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  );
}
