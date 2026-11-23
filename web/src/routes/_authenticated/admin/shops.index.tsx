import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Download, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, TableShell, downloadCsv, matches } from "@/components/admin/ui";
import { codesQuery, devicesQuery, paymentsQuery, shopsQuery } from "@/lib/admin-queries";
import { FLAG_LABEL, licenseFlags } from "@/lib/sync-health";
import { effectiveShopStatus, type ShopLifecycle } from "@/lib/pricing";
import { daysLeft, formatDate, formatRwf, relativeTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/shops/")({
  component: ShopsPage,
});

type F = ShopLifecycle | "ALL" | "EXPIRING" | "FLAGGED";
type SortKey = "updated" | "expiry" | "fee" | "name";

function ShopsPage() {
  const a = useAdminText();
  const { data, isLoading } = useQuery(shopsQuery);
  const { data: devices } = useQuery(devicesQuery);
  const { data: codes } = useQuery(codesQuery);
  const { data: pays } = useQuery(paymentsQuery);
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("ALL");
  const [sort, setSort] = useState<SortKey>("updated");
  const [now] = useState(() => Date.now());

  const enriched = useMemo(
    () =>
      (data ?? []).map((s) => ({
        ...s,
        eff: effectiveShopStatus(s, now),
        dev: (devices ?? []).filter((d) => d.shop_sync_key === s.id).length,
        flags: licenseFlags(s, codes ?? [], pays ?? [], now),
      })),
    [data, devices, codes, pays, now],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: enriched.length, EXPIRING: 0 };
    enriched.forEach((s) => {
      c[s.eff] = (c[s.eff] ?? 0) + 1;
      if (s.flags.length) c["FLAGGED"] = (c["FLAGGED"] ?? 0) + 1;
      if ((s.eff === "ACTIVE" || s.eff === "TRIAL") && s.subscription_expires_at - now < 7 * 86_400_000) c["EXPIRING"] = (c["EXPIRING"] ?? 0) + 1;
    });
    return c;
  }, [enriched, now]);

  const rows = enriched
    .filter((s) => {
      if (f === "ALL") return true;
      if (f === "FLAGGED") return s.flags.length > 0;
      if (f === "EXPIRING") return (s.eff === "ACTIVE" || s.eff === "TRIAL") && s.subscription_expires_at - now < 7 * 86_400_000;
      return s.eff === f;
    })
    .filter((s) => matches(q, s.shop_name, s.owner_name, s.owner_username, s.owner_phone, s.id))
    .sort((a, b) => {
      if (sort === "expiry") return a.subscription_expires_at - b.subscription_expires_at;
      if (sort === "fee") return b.monthly_fee_rwf - a.monthly_fee_rwf;
      if (sort === "name") return a.shop_name.localeCompare(b.shop_name);
      return b.updated_at - a.updated_at;
    });

  return (
    <div>
      <PageHeader
        title="Shops"
        sub="Every registered BeBoss shop, its license, quotas and remote controls."
        actions={
          <Button size="sm" variant="glass" onClick={() => downloadCsv(`beboss-shops-${Date.now()}.csv`, rows.map(({ eff, dev, flags, ...r }) => ({ ...r, effective_status: eff, paired_devices: dev, review_flags: flags.join(" ") })))}>
            <Download /> Export
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search shop, owner, @username or phone…" />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="updated">{a("Last synced")}</option>
          <option value="expiry">{a("Expiry soonest")}</option>
          <option value="fee">{a("Highest fee")}</option>
          <option value="name">{a("Name A–Z")}</option>
        </select>
      </div>
      <div className="mb-4">
        <FilterChips<F>
          value={f}
          onChange={setF}
          options={[
            { value: "ALL", label: "All", count: counts["ALL"] ?? 0 },
            { value: "ACTIVE", label: "Active", count: counts["ACTIVE"] ?? 0 },
            { value: "TRIAL", label: "Trial", count: counts["TRIAL"] ?? 0 },
            { value: "EXPIRING", label: "Expiring ≤7d", count: counts["EXPIRING"] ?? 0 },
            { value: "EXPIRED", label: "Expired", count: counts["EXPIRED"] ?? 0 },
            { value: "SUSPENDED", label: "Suspended", count: counts["SUSPENDED"] ?? 0 },
            { value: "KILLED", label: "Kill switch", count: counts["KILLED"] ?? 0 },
            { value: "FLAGGED", label: "Needs review", count: counts["FLAGGED"] ?? 0 },
          ]}
        />
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title="No shops match" sub="Shops appear here automatically when the BeBoss app syncs with internet." />
      ) : (
        <TableShell>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{a("Shop")}</th>
                <th className="px-4 py-3">{a("Status")}</th>
                <th className="px-4 py-3">{a("Expires")}</th>
                <th className="px-4 py-3">{a("Plan")}</th>
                <th className="px-4 py-3">{a("Fee / mo")}</th>
                <th className="px-4 py-3">{a("Last sync")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => {
                const dl = daysLeft(s.subscription_expires_at, now);
                return (
                  <tr key={s.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <Link to="/admin/shops/$shopId" params={{ shopId: s.id }} className="font-medium hover:text-primary">
                        {s.shop_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        @{s.owner_username} • {s.owner_phone}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.eff} />
                      {s.flags.length ? (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive" title={s.flags.map((x) => FLAG_LABEL[x]).join(", ")}>
                          <ShieldAlert className="size-3" /> {FLAG_LABEL[s.flags[0]!]}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p>{formatDate(s.subscription_expires_at)}</p>
                      <p className={`text-xs ${dl < 0 ? "text-destructive" : dl <= 7 ? "text-warning" : "text-muted-foreground"}`}>{dl < 0 ? `${-dl} ${a("days ago")}` : `${dl} ${a("days left")}`}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.branch_count} {a("branches")} • {s.worker_count} {a("staff")} • {s.dev}/{s.device_limit} {a("devices")}
                    </td>
                    <td className="px-4 py-3 font-mono">{formatRwf(s.monthly_fee_rwf)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{relativeTime(s.updated_at, now)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/admin/shops/$shopId" params={{ shopId: s.id }} className="inline-flex text-muted-foreground hover:text-foreground" aria-label={`${a("Open shop")} ${s.shop_name}`}>
                        <ChevronRight className="size-4" />
                      </Link>
                    </td>
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
