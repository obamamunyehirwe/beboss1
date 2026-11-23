import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Download, Percent, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { LoadingBlock, PageHeader, StatCard, StatusBadge, TableShell, downloadCsv } from "@/components/admin/ui";
import { devicesQuery, downloadsQuery, paymentsQuery, shopsQuery } from "@/lib/admin-queries";
import { churnRate30, cohorts, conversionRate, isPaid, lastMonths, lifetimeValueByShop, medianApprovalHours, recognizedRevenue } from "@/lib/business-metrics";
import { effectiveShopStatus } from "@/lib/pricing";
import { deviceHealth, HEALTH_LABEL } from "@/lib/sync-health";
import { formatRwf } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics — BeBoss Admin" }, { name: "robots", content: "noindex" }] }),
  component: AnalyticsPage,
});

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 12 };
const PALETTE = ["var(--primary)", "var(--info)", "var(--success)", "var(--warning)", "var(--chart-5)", "var(--chart-3)"];
const short = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

function AnalyticsPage() {
  const a = useAdminText();
  const shops = useQuery(shopsQuery);
  const pays = useQuery(paymentsQuery);
  const devices = useQuery(devicesQuery);
  const downloads = useQuery(downloadsQuery);

  const m = useMemo(() => {
    const now = Date.now();
    const s = shops.data ?? [];
    const p = pays.data ?? [];
    const months = lastMonths(12, now);
    const rec = recognizedRevenue(p, months);
    const cash = months.map((mo) => p.filter((x) => isPaid(x) && x.updated_at >= mo.start && x.updated_at < mo.end).reduce((a, x) => a + x.amount_rwf, 0));
    const trend = months.map((mo, idx) => ({ label: mo.label, recognized: Math.round(rec[mo.key] ?? 0), collected: cash[idx] ?? 0 }));
    let mrr = 0;
    let active = 0;
    for (const shop of s) {
      if (effectiveShopStatus(shop, now) === "ACTIVE") {
        mrr += Number(shop.monthly_fee_rwf) || 0;
        active++;
      }
    }
    const paid = p.filter(isPaid);
    const byProvider = Object.entries(paid.reduce((a: Record<string, number>, x) => ((a[x.provider || "Other"] = (a[x.provider || "Other"] ?? 0) + x.amount_rwf), a), {})).map(([name, value]) => ({ name, value }));
    const byPlan = [1, 3, 6, 12].map((n) => ({ name: `${n} mo`, value: paid.filter((x) => (x.duration_months || 1) === n).reduce((a, x) => a + x.amount_rwf, 0), count: paid.filter((x) => (x.duration_months || 1) === n).length }));
    const bySource = Object.entries(p.reduce((a: Record<string, number>, x) => ((a[x.source || "APP"] = (a[x.source || "APP"] ?? 0) + 1), a), {})).map(([name, value]) => ({ name, value }));
    const dlByChannel = Object.entries((downloads.data ?? []).reduce((a: Record<string, number>, x) => ((a[x.channel || "web"] = (a[x.channel || "web"] ?? 0) + 1), a), {})).map(([name, value]) => ({ name, value }));
    const health = (devices.data ?? []).filter((d) => d.is_active).reduce((a: Record<string, number>, d) => {
      const h = deviceHealth(d.last_synced_at, now);
      a[h] = (a[h] ?? 0) + 1;
      return a;
    }, {});
    const coh = cohorts(s, p, lastMonths(6, now), now);
    const ltv = lifetimeValueByShop(s, p);
    return {
      trend,
      mrr,
      active,
      arpu: active ? mrr / active : 0,
      conversion: conversionRate(s, p),
      churn: churnRate30(s, p, now),
      approvalH: medianApprovalHours(p, now),
      byProvider,
      byPlan,
      bySource,
      dlByChannel,
      health: Object.entries(health).map(([k, v]) => ({ name: HEALTH_LABEL[k as keyof typeof HEALTH_LABEL] ?? k, value: v })),
      coh,
      ltv,
      lifetime: paid.reduce((a, x) => a + x.amount_rwf, 0),
    };
  }, [shops.data, pays.data, devices.data, downloads.data]);

  if (shops.isLoading || pays.isLoading) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={a("Business analytics")}
        sub={a("Subscription revenue, conversion, churn and fleet health — computed live from shop and payment data.")}
        actions={
          <Button size="sm" variant="glass" onClick={() => downloadCsv("beboss-revenue-12m.csv", m.trend)}>
            <Download /> {a("Export revenue CSV")}
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={a("Monthly recurring revenue")} value={formatRwf(m.mrr)} sub={`${m.active} ${a("active paying shops")}`} icon={Wallet} tone="brand" />
        <StatCard label={a("Average revenue per shop")} value={formatRwf(m.arpu)} sub={a("MRR ÷ active shops")} icon={Users} tone="info" />
        <StatCard label={a("Lifetime collected")} value={formatRwf(m.lifetime)} sub={a("all verified payments")} icon={TrendingUp} tone="success" />
        <StatCard label={a("Trial → paid conversion")} value={`${m.conversion.toFixed(1)}%`} sub={a("shops that paid at least once")} icon={Percent} tone="success" />
        <StatCard label={a("Churn (30 days)")} value={`${m.churn.toFixed(1)}%`} sub={a("paying shops whose license lapsed")} icon={TrendingDown} tone={m.churn > 10 ? "danger" : "warning"} />
        <StatCard label={a("Median approval time")} value={m.approvalH ? `${m.approvalH < 1 ? Math.round(m.approvalH * 60) + " min" : m.approvalH.toFixed(1) + " h"}` : "—"} sub={a("claim → approved, last 90 days")} icon={Clock} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">{a("Revenue — recognized vs collected (12 months)")}</h2>
        <p className="text-xs text-muted-foreground">{a("Recognized spreads multi-month plans over the months they cover; collected is cash on approval day.")}</p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={m.trend}>
              <defs>
                <linearGradient id="an-rec" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={short} width={44} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatRwf(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" name="Recognized" dataKey="recognized" stroke="var(--primary)" strokeWidth={2} fill="url(#an-rec)" />
              <Area type="monotone" name="Collected" dataKey="collected" stroke="var(--info)" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Donut title={a("Revenue by provider")} data={m.byProvider} money />
        <Donut title={a("Payment claims by source")} data={m.bySource} />
        <Donut title={a("APK downloads by channel (90d)")} data={m.dlByChannel} />
        <Donut title={a("Active device health")} data={m.health} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{a("Revenue by plan length")}</h2>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.byPlan}>
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={short} width={40} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)" }} formatter={(v: number) => formatRwf(v)} />
                <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{a("Signup cohorts (last 6 months)")}</h2>
          <TableShell>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-medium">{a("Month")}</th>
                  <th className="px-4 py-2 font-medium">{a("Signups")}</th>
                  <th className="px-4 py-2 font-medium">{a("Paid")}</th>
                  <th className="px-4 py-2 font-medium">{a("Active now")}</th>
                </tr>
              </thead>
              <tbody>
                {m.coh.map((c) => (
                  <tr key={c.label} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{c.label}</td>
                    <td className="px-4 py-2 font-mono">{c.signups}</td>
                    <td className="px-4 py-2">
                      <Meter pct={c.conversionPct} label={`${c.converted} · ${c.conversionPct.toFixed(0)}%`} tone="bg-success" />
                    </td>
                    <td className="px-4 py-2">
                      <Meter pct={c.activePct} label={`${c.active} · ${c.activePct.toFixed(0)}%`} tone="bg-primary" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{a("Top shops by lifetime value")}</h2>
          <Button size="sm" variant="ghost" onClick={() => downloadCsv("beboss-shop-ltv.csv", m.ltv.map((x) => ({ shop: x.name, username: x.user, status: x.status, total_rwf: x.total })))}>
            <Download /> CSV
          </Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {m.ltv.slice(0, 10).map((x, i) => (
            <Link key={x.id} to="/admin/shops/$shopId" params={{ shopId: x.id }} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent">
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate">{x.name}</span>
                <StatusBadge status={x.status} />
              </span>
              <span className="shrink-0 font-mono text-xs">{formatRwf(x.total)}</span>
            </Link>
          ))}
          {!m.ltv.length ? <p className="py-6 text-sm text-muted-foreground">{a("No verified payments yet.")}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Meter({ pct, label, tone }: { pct: number; label: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Donut({ title, data, money }: { title: string; data: { name: string; value: number }[]; money?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-2 h-44">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={data.length > 1 ? 3 : 0} stroke="none">
                {data.map((d, i) => (
                  <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => (money ? formatRwf(v) : v.toLocaleString())} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="grid h-full place-items-center text-xs text-muted-foreground">{a("No data yet")}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}
