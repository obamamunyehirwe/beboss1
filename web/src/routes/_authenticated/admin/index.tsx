import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Download, ShieldAlert, Smartphone, Store, TrendingUp, Users, Wallet, WifiOff } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard, StatusBadge } from "@/components/admin/ui";
import { auditQuery, codesQuery, devicesQuery, downloadsQuery, paymentsQuery, shopsQuery, syncEventsQuery, usersQuery } from "@/lib/admin-queries";
import { FLAG_LABEL, deviceHealth, licenseFlags } from "@/lib/sync-health";
import { effectiveShopStatus } from "@/lib/pricing";
import { daysLeft, formatRwf, relativeTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Overview,
});

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "var(--success)",
  TRIAL: "var(--warning)",
  EXPIRED: "var(--destructive)",
  SUSPENDED: "var(--chart-5)",
  KILLED: "var(--muted-foreground)",
};

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 12 };

function Overview() {
  const a = useAdminText();
  const shops = useQuery(shopsQuery);
  const pays = useQuery(paymentsQuery);
  const devices = useQuery(devicesQuery);
  const users = useQuery(usersQuery);
  const audit = useQuery(auditQuery);
  const downloads = useQuery(downloadsQuery);
  const codes = useQuery(codesQuery);
  const events = useQuery(syncEventsQuery);

  const attention = useMemo(() => {
    const now = Date.now();
    const flagged = (shops.data ?? [])
      .map((s) => ({ s, flags: licenseFlags(s, codes.data ?? [], pays.data ?? [], now) }))
      .filter((x) => x.flags.length);
    const slowPayments = (pays.data ?? []).filter((p) => p.status === "PENDING_VERIFICATION" && now - p.created_at > 86_400_000);
    const staleDevices = (devices.data ?? []).filter((d) => d.is_active && deviceHealth(d.last_synced_at, now) === "STALE");
    return { flagged, slowPayments, staleDevices };
  }, [shops.data, codes.data, pays.data, devices.data]);

  const m = useMemo(() => {
    const now = Date.now();
    const s = shops.data ?? [];
    const p = pays.data ?? [];
    const statusCounts: Record<string, number> = { ACTIVE: 0, TRIAL: 0, EXPIRED: 0, SUSPENDED: 0, KILLED: 0 };
    let mrr = 0;
    for (const shop of s) {
      const st = effectiveShopStatus(shop, now);
      statusCounts[st] = (statusCounts[st] ?? 0) + 1;
      if (st === "ACTIVE") mrr += Number(shop.monthly_fee_rwf) || 0;
    }
    const approved = p.filter((x) => x.status === "APPROVED" || x.status === "REDEEMED");
    const pending = p.filter((x) => x.status === "PENDING_VERIFICATION");
    const d = new Date();
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const lastMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
    const revThis = approved.filter((x) => x.updated_at >= monthStart).reduce((a, x) => a + x.amount_rwf, 0);
    const revLast = approved.filter((x) => x.updated_at >= lastMonthStart && x.updated_at < monthStart).reduce((a, x) => a + x.amount_rwf, 0);

    const months: { label: string; revenue: number; claims: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
      months.push({
        label: start.toLocaleDateString("en-GB", { month: "short" }),
        revenue: approved.filter((x) => x.updated_at >= start.getTime() && x.updated_at < end).reduce((a, x) => a + x.amount_rwf, 0),
        claims: p.filter((x) => x.created_at >= start.getTime() && x.created_at < end).length,
      });
    }
    const weeks: { label: string; shops: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const end = now - i * 7 * 86_400_000;
      const start = end - 7 * 86_400_000;
      weeks.push({ label: new Date(start).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), shops: s.filter((x) => x.created_at >= start && x.created_at < end).length });
    }
    const expiring = s
      .filter((x) => {
        const st = effectiveShopStatus(x, now);
        return (st === "ACTIVE" || st === "TRIAL") && x.subscription_expires_at - now < 7 * 86_400_000;
      })
      .sort((a, b) => a.subscription_expires_at - b.subscription_expires_at)
      .slice(0, 8);
    const dl30 = (downloads.data ?? []).filter((x) => new Date(x.created_at).getTime() > now - 30 * 86_400_000).length;
    return { statusCounts, mrr, pending, revThis, revLast, months, weeks, expiring, dl30, totalShops: s.length };
  }, [shops.data, pays.data, downloads.data]);

  const pie = Object.entries(m.statusCounts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  const activeDevices = (devices.data ?? []).filter((x) => x.is_active).length;
  const growth = m.revLast ? Math.round(((m.revThis - m.revLast) / m.revLast) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" sub="Live health of every BeBoss shop, payment and device." actions={
        <Button asChild variant="hero" size="sm">
          <Link to="/admin/payments">
            Review payments ({m.pending.length}) <ArrowRight />
          </Link>
        </Button>
      } />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monthly recurring revenue" value={formatRwf(m.mrr)} sub={`${m.statusCounts["ACTIVE"]} paying shops`} icon={Wallet} tone="brand" />
        <StatCard label="Collected this month" value={formatRwf(m.revThis)} sub={growth == null ? `Last month ${formatRwf(m.revLast)}` : `${growth >= 0 ? "+" : ""}${growth}% vs last month`} icon={TrendingUp} tone="success" />
        <StatCard label="Pending verification" value={m.pending.length} sub={formatRwf(m.pending.reduce((a, x) => a + x.amount_rwf, 0)) + " waiting"} icon={CreditCard} tone="warning" />
        <StatCard label="Shops" value={m.totalShops} sub={`${m.statusCounts["TRIAL"]} on trial • ${m.statusCounts["EXPIRED"]} expired`} icon={Store} tone="info" />
        <StatCard label="Paired devices" value={(devices.data ?? []).length} sub={`${activeDevices} active`} icon={Smartphone} />
        <StatCard label="Shop staff accounts" value={(users.data ?? []).length} sub={`${(users.data ?? []).filter((u) => u.is_active).length} active`} icon={Users} />
        <StatCard label="APK downloads (30 days)" value={m.dl30} sub="from website, QR and app" icon={Download} />
        <StatCard label="Suspended / killed" value={m.statusCounts["SUSPENDED"]! + m.statusCounts["KILLED"]!} sub="remote controls applied" icon={AlertTriangle} tone="danger" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="size-4 text-warning" /> {a("Needs attention")}
          </h2>
          <div className="mt-3 space-y-2">
            {attention.slowPayments.length ? (
              <Link to="/admin/payments" className="flex items-center justify-between rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-sm hover:bg-warning/10">
                <span className="flex items-center gap-2">
                  <CreditCard className="size-4 text-warning" /> {attention.slowPayments.length} payment claim(s) waiting over 24 h
                </span>
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
            {attention.staleDevices.length ? (
              <Link to="/admin/sync" className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent">
                <span className="flex items-center gap-2">
                  <WifiOff className="size-4 text-muted-foreground" /> {attention.staleDevices.length} active device(s) haven't synced for 7+ days
                </span>
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
            {attention.flagged.slice(0, 6).map(({ s, flags }) => (
              <Link key={s.id} to="/admin/shops/$shopId" params={{ shopId: s.id }} className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm hover:bg-destructive/10">
                <span className="min-w-0 truncate">
                  {s.shop_name} <span className="text-xs text-muted-foreground">@{s.owner_username}</span>
                </span>
                <span className="shrink-0 text-xs text-destructive">{flags.map((f) => FLAG_LABEL[f]).join(" · ")}</span>
              </Link>
            ))}
            {!attention.slowPayments.length && !attention.staleDevices.length && !attention.flagged.length ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" /> {a("All clear — no license, payment or sync issues.")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Activity className="size-4 text-success" /> {a("Live sync feed")}
            </h2>
            <Link to="/admin/sync" className="text-xs text-primary hover:underline">
              {a("Sync monitor")}
            </Link>
          </div>
          <div className="mt-3 space-y-1.5">
            {(events.data ?? []).slice(0, 7).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-xs">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-foreground">{e.shop_name || e.shop_sync_key || "—"}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {e.entity.replace("_", " ").toLowerCase()} {e.action.replaceAll("_", " ").toLowerCase()}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">{relativeTime(e.created_at)}</span>
              </div>
            ))}
            {!events.data?.length ? <p className="py-6 text-center text-sm text-muted-foreground">{a("Waiting for the first phone to sync.")}</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{a("Verified revenue — last 12 months")}</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m.months}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatRwf(v)} />
                <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{a("Shop status")}</h2>
          <div className="mt-2 h-52">
            {pie.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} stroke="none">
                    {pie.map((e) => (
                      <Cell key={e.name} fill={STATUS_COLORS[e.name] ?? "var(--chart-3)"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">{a("No shops synced yet")}</p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {Object.entries(m.statusCounts).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[k] }} />
                {k} {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{a("New shops per week")}</h2>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.weeks}>
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval={2} />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={24} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="shops" fill="var(--info)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{a("Expiring within 7 days")}</h2>
            <Link to="/admin/shops" className="text-xs text-primary hover:underline">
              {a("All shops")}
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {m.expiring.length ? (
              m.expiring.map((s) => (
                <Link key={s.id} to="/admin/shops/$shopId" params={{ shopId: s.id }} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent">
                  <span className="truncate">
                    {s.shop_name}
                    <span className="ml-1 text-xs text-muted-foreground">@{s.owner_username}</span>
                  </span>
                  <span className="font-mono text-xs text-warning">{Math.max(0, daysLeft(s.subscription_expires_at))}d</span>
                </Link>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{a("Nothing expiring this week.")}</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{a("Recent admin activity")}</h2>
            <Link to="/admin/audit" className="text-xs text-primary hover:underline">
              {a("Audit log")}
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {(audit.data ?? []).slice(0, 7).map((a) => (
              <div key={a.id} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={a.action} />
                  <span className="text-[11px] text-muted-foreground">{relativeTime(a.created_at)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {a.target_id} — {a.details}
                </p>
              </div>
            ))}
            {!audit.data?.length ? <p className="py-6 text-center text-sm text-muted-foreground">{a("No activity yet.")}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
