import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { AlertTriangle, ArrowLeftRight, BadgeCheck, Boxes, HandCoins, PackageX, Receipt, RefreshCw, ShieldQuestion, TrendingUp, Truck, Wallet } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingBlock, StatCard, downloadCsv } from "@/components/admin/ui";
import { getShopInsights } from "@/lib/insights.functions";
import { formatDateTime, relativeTime } from "@/lib/format";

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 12 };
const money = (n: number, cur: string) => `${Math.round(n).toLocaleString("en-US")} ${cur}`;
const short = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

export function RetailInsights({ shopId }: { shopId: string }) {
  const fetchInsights = useServerFn(getShopInsights);
  const q = useQuery({
    queryKey: ["admin", "insights", shopId],
    queryFn: () => fetchInsights({ data: { shopId } }),
    staleTime: 0,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <EmptyState title="Couldn't load insights" sub={q.error instanceof Error ? q.error.message : "Try again"} />;
  const r = q.data;
  if (!r || !r.chunks) return <EmptyState title="No branch data synced yet" sub="Insights appear after the shop's phone runs its first internet sync. Sales, stock and debts are read from the phone's signed snapshot." />;
  if (r.error || !r.insights) return <EmptyState title="Snapshot could not be read" sub={r.error ?? "Unknown format"} />;
  const i = r.insights;
  const cur = i.currency || "FRw";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span>
            From <span className="text-foreground">{r.branchName}</span> · device <span className="font-mono text-xs">{r.deviceId}</span>
          </span>
          <span>
            {r.chunks} chunk(s) · uploaded {relativeTime(r.uploadedAt)}
          </span>
          {r.signature === "VERIFIED" ? (
            <span className="flex items-center gap-1 text-success"><BadgeCheck className="size-4" /> Signature verified</span>
          ) : r.signature === "MISMATCH" ? (
            <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="size-4" /> Signature mismatch — data may be tampered</span>
          ) : (
            <span className="flex items-center gap-1"><ShieldQuestion className="size-4" /> Signature not checked (add the snapshot key in Settings)</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="glass" onClick={() => downloadCsv(`${i.shopName || shopId}-daily-sales.csv`, i.daily)}>Export daily CSV</Button>
          <Button size="sm" variant="ghost" onClick={() => q.refetch()} aria-label="Reload insights">
            <RefreshCw className={q.isFetching ? "animate-spin" : undefined} />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales today" value={money(i.today.revenue, cur)} sub={`${i.today.orders} receipts · profit ${money(i.today.profit, cur)}`} icon={Receipt} tone="brand" />
        <StatCard label="Last 30 days" value={money(i.last30.revenue, cur)} sub={`${i.last30.orders} receipts · avg ${money(i.last30.avgOrder, cur)}`} icon={TrendingUp} tone="success" />
        <StatCard label="Profit (30 days)" value={money(i.last30.profit, cur)} sub={`${i.last30.marginPct.toFixed(1)}% margin · ${i.itemsSold30.toLocaleString()} items sold`} icon={Wallet} tone="info" />
        <StatCard label="Customer debts" value={money(i.debts.total, cur)} sub={`${i.debts.debtors} debtors · collected ${money(i.debts.collected30, cur)} in 30d`} icon={HandCoins} tone="warning" />
        <StatCard label="Stock value (cost)" value={money(i.inventory.costValue, cur)} sub={`Retail ${money(i.inventory.retailValue, cur)}`} icon={Boxes} />
        <StatCard label="Purchases (30 days)" value={money(i.activity.purchaseValue30, cur)} sub={`${i.activity.purchaseOrders30} purchase orders · ${i.activity.purchaseUnits30.toLocaleString()} units from ${i.activity.supplierCount30} suppliers`} icon={Truck} tone="info" />
        <StatCard label="Stock transfers (30 days)" value={i.activity.stockTransfers30.toLocaleString()} sub={`${i.activity.stockTransferUnits30.toLocaleString()} units moved between branches`} icon={ArrowLeftRight} />
        <StatCard label="Products" value={i.counts.products} sub={`${i.inventory.outOfStock} out of stock · ${i.lowStock.length} low`} icon={PackageX} tone={i.lowStock.length ? "danger" : "default"} />
        <StatCard label="All-time revenue" value={money(i.allTime.revenue, cur)} sub={`${i.counts.sales.toLocaleString()} receipts recorded`} icon={Receipt} />
        <StatCard label="Data snapshot" value={formatDateTime(i.exportedAt)} sub={`${i.counts.branches} branches · ${i.counts.staff} staff · ${i.counts.customers} customers`} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">Revenue and profit — last 30 days</h3>
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
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, cur)} />
              <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} fill="url(#ri-rev)" />
              <Area type="monotone" dataKey="profit" stroke="var(--success)" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Top products by profit (30 days)">
          {i.topProducts.length ? (
            <ul className="divide-y divide-border">
              {i.topProducts.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{p.name} <span className="text-xs text-muted-foreground">×{p.quantity.toLocaleString()}</span></span>
                  <span className="shrink-0 font-mono text-xs">
                    <span className="text-success">+{short(p.profit)}</span> <span className="text-muted-foreground">/ {short(p.revenue)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <Muted>No sales in the last 30 days.</Muted>}
        </Panel>
        <Panel title="Low stock — reorder soon">
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
          ) : <Muted>Every product is above its alert level.</Muted>}
        </Panel>
        <Panel title="Payment methods (30 days)">
          <MiniBars rows={i.paymentMethods.map((m) => ({ name: m.method, value: m.revenue }))} cur={cur} />
        </Panel>
        <Panel title="Sales by category (30 days)">
          <MiniBars rows={i.categories.map((c) => ({ name: `${c.name} · ${c.sharePct.toFixed(0)}%`, value: c.revenue }))} cur={cur} />
        </Panel>
        <Panel title="Cashier leaderboard (30 days)">
          <MiniBars rows={i.cashiers.map((c) => ({ name: `${c.name} · ${c.orders}`, value: c.revenue }))} cur={cur} />
        </Panel>
        <Panel title="Biggest customer debts">
          {i.debts.top.length ? (
            <ul className="divide-y divide-border">
              {i.debts.top.map((c) => (
                <li key={c.name + c.phone} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{c.name} <span className="text-xs text-muted-foreground">{c.phone}</span></span>
                  <span className={c.limit > 0 && c.balance > c.limit ? "font-mono text-xs text-destructive" : "font-mono text-xs"}>{money(c.balance, cur)}</span>
                </li>
              ))}
            </ul>
          ) : <Muted>No outstanding customer debts.</Muted>}
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

function MiniBars({ rows, cur }: { rows: { name: string; value: number }[]; cur: string }) {
  if (!rows.length) return <Muted>No data for this period.</Muted>;
  return (
    <div style={{ height: Math.max(120, rows.length * 34) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={130} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)" }} formatter={(v: number) => money(v, cur)} />
          <Bar dataKey="value" fill="var(--info)" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
