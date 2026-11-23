import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Download, Pause, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, TableShell, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { deleteDevice, setDeviceActive } from "@/lib/admin.functions";
import { devicesQuery } from "@/lib/admin-queries";
import { formatRwf, relativeTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/devices")({
  component: DevicesPage,
});

type F = "ALL" | "ACTIVE" | "PAUSED" | "STALE";

function DevicesPage() {
  const a = useAdminText();
  const { data, isLoading } = useQuery(devicesQuery);
  const isAdmin = !!useAdminCtx().data?.isAdmin;
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
  const addonMrr = all.filter((d) => d.is_active && !d.is_owner_primary).reduce((a, d) => a + d.monthly_fee_addon_rwf, 0);

  return (
    <div>
      <PageHeader
        title={a("Devices")}
        sub={`Paired terminals across all shops • extra-device add-ons ${formatRwf(addonMrr)} / month`}
        actions={
          <Button size="sm" variant="glass" onClick={() => downloadCsv(`beboss-devices-${Date.now()}.csv`, rows)}>
            <Download /> {a("Export")}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={a("Search device, shop, join code, user, branch…")} />
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
      ) : !rows.length ? (
        <EmptyState title={a("No devices")} sub="Devices register when a shop owner pairs a new phone with a join code." />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{a("Device")}</th>
                <th className="px-4 py-3">{a("Shop")}</th>
                <th className="px-4 py-3">{a("User & branch")}</th>
                <th className="px-4 py-3">{a("Join code")}</th>
                <th className="px-4 py-3">{a("Last sync")}</th>
                <th className="px-4 py-3">{a("Status")}</th>
                {isAdmin ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{d.device_name || "Unnamed device"}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {d.device_id}
                      {d.is_owner_primary ? " • owner" : ` • +${d.monthly_fee_addon_rwf.toLocaleString()} FRw`}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/admin/shops/$shopId" params={{ shopId: d.shop_sync_key }} className="hover:text-primary">
                      {d.shop_name || d.shop_sync_key}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{d.assigned_user_name || d.assigned_username || "—"}</p>
                    <p className="text-muted-foreground">
                      {d.role} • {d.branch_name}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{d.join_code || "—"}</td>
                  <td className={`px-4 py-3 text-xs ${stale(d.last_synced_at) ? "text-warning" : "text-muted-foreground"}`}>{relativeTime(d.last_synced_at)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.is_active ? "ACTIVE" : "SUSPENDED"} />
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: d.id, active: !d.is_active })}>
                          {d.is_active ? <Pause /> : <Play />}
                          {a(d.is_active ? "Pause" : "Resume")}
                        </Button>
                        <ConfirmAction
                          trigger={
                            <Button size="icon" variant="ghost" aria-label={a("Remove device")}>
                              <Trash2 />
                            </Button>
                          }
                          title={a(`Remove ${d.device_name || "this device"}?`)}
                          description={a("The device is unpaired from the shop. It will need a new join code to sync again.")}
                          destructive
                          confirmLabel={a("Remove")}
                          onConfirm={() => del.mutate({ id: d.id })}
                        />
                      </div>
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
