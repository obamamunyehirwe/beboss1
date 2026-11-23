import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { AlertTriangle, ArrowLeftRight, BadgeCheck, Boxes, HandCoins, PackageX, Receipt, RefreshCw, ShieldQuestion, TrendingUp, Truck, Wallet } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingBlock, StatCard, downloadCsv } from "@/components/admin/ui";
import { getShopInsights } from "@/lib/insights.functions";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";
import { useI18n } from "@/lib/i18n";

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 12 };
const money = (n: number, cur: string, locale = "en-GB") => `${Math.round(n).toLocaleString(locale)} ${cur}`;
const short = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

export function RetailInsights({ shopId }: { shopId: string }) {
  const a = useAdminText();
  const { lang } = useI18n();
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : lang === "sw" ? "sw-TZ" : "en-GB";
  const fetchInsights = useServerFn(getShopInsights);
  const q = useQuery({
    queryKey: ["admin", "insights", shopId],
    queryFn: () => fetchInsights({ data: { shopId } }),
    staleTime: 0,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <EmptyState title={a("Couldn't load insights")} sub={q.error instanceof Error ? q.error.message : a("Try again")} />;
  const r = q.data;
  if (!r || !r.chunks) return <EmptyState title={a("No branch data synced yet")} sub={a("Insights appear after the shop's phone runs its first internet sync. Sales, stock and debts are read from the phone's signed snapshot.")} />;
  if (r.error || !r.insights) return <EmptyState title={a("Snapshot could not be read")} sub={r.error ?? a("Unknown format")} />;
  const i = r.insights;
  const cur = i.currency || "FRw";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span>
            {a("From")} <span className="text-foreground">{r.branchName}</span> {a("· device")} <span className="font-mono text-xs">{r.deviceId}</span>
          </span>
          <span>
            {r.chunks} {a("chunk(s)")} · {a("uploaded")} {relativeTime(r.uploadedAt, Date.now(), locale)}
          </span>
          {r.signature === "VERIFIED" ? (
            <span className="flex items-center gap-1 text-success"><BadgeCheck className="size-4" /> {a("Signature verified")}</span>
          ) : r.signature === "MISMATCH" ? (
            <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="size-4" /> {a("Signature mismatch — data may be tampered")}</span>
          ) : (
            <span className="flex items-center gap-1"><ShieldQuestion className="size-4" /> {a("Signature not checked (add the snapshot key in Settings)")}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="glass" onClick={() => downloadCsv(`${i.shopName || shopId}-daily-sales.csv`, i.daily)}>{a("Export daily CSV")}</Button>
          <Button size="sm" variant="ghost" onClick={() => q.refetch()} aria-label={a("Reload insights")}>
            <RefreshCw className={q.isFetching ? "animate-spin" : undefined} />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={a("Sales today")} value={money(i.today.revenue, cur, locale)} sub={`${i.today.orders} ${a("receipts")} · ${a("profit")} ${money(i.today.profit, cur, locale)}`} icon={Receipt} tone="brand" />
        <StatCard label={a("Last 30 days")} value={money(i.last30.revenue, cur, locale)} sub={`${i.last30.orders} ${a("receipts")} · ${a("avg")} ${money(i.last30.avgOrder, cur, locale)}`} icon={TrendingUp} tone="success" />
        <StatCard label={a("Profit (30 days)")} value={money(i.last30.profit, cur, locale)} sub={`${i.last30.marginPct.toFixed(1)}% ${a("margin")} · ${i.itemsSold30.toLocaleString(locale)} ${a("items sold")}`} icon={Wallet} tone="info" />
        <StatCard label={a("Customer debts")} value={money(i.debts.total, cur, locale)} sub={`${i.debts.debtors} ${a("debtors")} · ${a("collected")} ${money(i.debts.collected30, cur, locale)} (30d)`} icon={HandCoins} tone="warning" />
        <StatCard label={a("Stock value (cost)")} value={money(i.inventory.costValue, cur, locale)} sub={`${a("Retail")} ${money(i.inventory.retailValue, cur, locale)}`} icon={Boxes} />
        <StatCard label={a("Purchases (30 days)")} value={money(i.activity.purchaseValue30, cur, locale)} sub={`${i.activity.purchaseOrders30} ${a("purchase orders")} · ${i.activity.purchaseUnits30.toLocaleString(locale)} ${a("units")} ${a("from")} ${i.activity.supplierCount30} ${a("suppliers")}`} icon={Truck} tone="info" />
        <StatCard label={a("Stock transfers (30 days)")} value={i.activity.stockTransfers30.toLocaleString(locale)} sub={`${i.activity.stockTransferUnits30.toLocaleString(locale)} ${a("units moved between branches")}`} icon={ArrowLeftRight} />
        <StatCard label={a("Products")} value={i.counts.products} sub={`${i.inventory.outOfStock} ${a("out of stock")} · ${i.lowStock.length} ${a("low")}`} icon={PackageX} tone={i.lowStock.length ? "danger" : "default"} />
        <StatCard label={a("All-time revenue")} value={money(i.allTime.revenue, cur, locale)} sub={`${i.counts.sales.toLocaleString(locale)} ${a("receipts recorded")}`} icon={Receipt} />
        <StatCard label={a("Data snapshot")} value={formatDateTime(i.exportedAt)} sub={`${i.counts.branches} ${a("branches")} · ${i.counts.staff} ${a("staff")} · ${i.counts.customers} ${a("customers")}`} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">{a("Revenue and profit — last 30 days")}</h3>
        <div className="mt-4 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={i.daily}>
              <defs>
                <linearGradient id="ri-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} interval={4} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={short} width={40} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, cur, locale)} />
              <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} fill="url(#ri-rev)" />
              <Area type="monotone" dataKey="profit" stroke="var(--success)" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={a("Top products by profit (30 days)")}>
          {i.topProducts.length ? (
            <ul className="divide-y divide-border">
              {i.topProducts.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{p.name} <span className="text-xs text-muted-foreground">×{p.quantity.toLocaleString(locale)}</span></span>
                  <span className="shrink-0 font-mono text-xs">
                    <span className="text-success">+{short(p.profit)}</span> <span className="text-muted-foreground">/ {short(p.revenue)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <Muted>{a("No sales in the last 30 days.")}</Muted>}
        </Panel>
        <Panel title={a("Low stock — reorder soon")}>
          {i.lowStock.length ? (
            <ul className="divide-y divide-border">
              {i.lowStock.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className={p.inStock <= 0 ? "font-mono text-xs text-destructive" : "font-mono text-xs text-warning"}>
                    {p.inStock} {p.unit} / min {p.threshold}
                  </span>
                </li>
              ))}
            </ul>
          ) : <Muted>{a("Every product is above its alert level.")}</Muted>}
        </Panel>
        <Panel title={a("Payment methods (30 days)")}>
          <MiniBars rows={i.paymentMethods.map((m) => ({ name: m.method, value: m.revenue }))} cur={cur} locale={locale} />
        </Panel>
        <Panel title={a("Sales by category (30 days)")}>
          <MiniBars rows={i.categories.map((c) => ({ name: `${c.name} · ${c.sharePct.toFixed(0)}%`, value: c.revenue }))} cur={cur} locale={locale} />
        </Panel>
        <Panel title={a("Cashier leaderboard (30 days)")}>
          <MiniBars rows={i.cashiers.map((c) => ({ name: `${c.name} · ${c.orders}`, value: c.revenue }))} cur={cur} locale={locale} />
        </Panel>
        <Panel title={a("Biggest customer debts")}>
          {i.debts.top.length ? (
            <ul className="divide-y divide-border">
              {i.debts.top.map((c) => (
                <li key={c.name + c.phone} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{c.name} <span className="text-xs text-muted-foreground">{c.phone}</span></span>
                  <span className={c.limit > 0 && c.balance > c.limit ? "font-mono text-xs text-destructive" : "font-mono text-xs"}>{money(c.balance, cur, locale)}</span>
                </li>
              ))}
            </ul>
          ) : <Muted>{a("No outstanding customer debts.")}</Muted>}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function MiniBars({ rows, cur, locale }: { rows: { name: string; value: number }[]; cur: string; locale: string }) {
  const a = useAdminText();
  if (!rows.length) return <Muted>{a("No data for this period.")}</Muted>;
  return (
    <div style={{ height: Math.max(120, rows.length * 34) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={130} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)" }} formatter={(v: number) => money(v, cur, locale)} />
          <Bar dataKey="value" fill="var(--info)" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
