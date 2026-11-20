import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, FilterChips, LoadingBlock, SearchInput, TableShell, downloadCsv, matches } from "@/components/admin/ui";
import { getShopRecords } from "@/lib/insights.functions";
import { formatDateTime, relativeTime } from "@/lib/format";

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "px-3 py-2 text-sm";

/** Browsable copy of the shop's phone data (products, customers, sales, staff, purchases) from its latest cloud sync. */
export function ShopRecords({ shopId, shopName }: { shopId: string; shopName: string }) {
  const fetchRecords = useServerFn(getShopRecords);
  const q = useQuery({ queryKey: ["admin", "records", shopId], queryFn: () => fetchRecords({ data: { shopId } }), staleTime: 60_000 });
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [debtFilter, setDebtFilter] = useState<"all" | "debt" | "over">("all");
  const r = q.data?.records;
  const slug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || shopId;

  const products = useMemo(
    () =>
      (r?.products ?? []).filter(
        (p) =>
          matches(search, p.name, p.category, p.barcode) &&
          (stockFilter === "all" || (stockFilter === "out" ? p.stock <= 0 : p.stock <= p.threshold)),
      ),
    [r, search, stockFilter],
  );
  const customers = useMemo(
    () => (r?.customers ?? []).filter((c) => matches(search, c.name, c.phone, c.category) && (debtFilter === "all" || (debtFilter === "over" ? c.overLimit : c.debt > 0))),
    [r, search, debtFilter],
  );
  const sales = useMemo(() => (r?.sales ?? []).filter((s) => matches(search, s.receipt, s.method, s.cashier, s.branch, s.customer)), [r, search]);
  const staff = useMemo(() => (r?.staff ?? []).filter((s) => matches(search, s.name, s.username, s.role, s.branch)), [r, search]);
  const purchases = useMemo(() => (r?.purchases ?? []).filter((p) => matches(search, p.supplier, p.product)), [r, search]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <EmptyState title="Couldn't load shop records" sub={q.error instanceof Error ? q.error.message : "Try again"} />;
  if (!r) return <EmptyState title={q.data?.error ? "Snapshot could not be read" : "No phone data synced yet"} sub={q.data?.error ?? "Records appear after the shop's phone runs its first internet sync."} />;
  const cur = r.currency || "FRw";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">From the phone's latest sync · {relativeTime(q.data?.uploadedAt ?? 0)} · amounts in {cur}</p>
        <div className="w-full sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="Search products, customers, receipts…" />
        </div>
      </div>
      <Tabs defaultValue="products">
        <TabsList className="flex-wrap">
          <TabsTrigger value="products">Products ({r.products.length})</TabsTrigger>
          <TabsTrigger value="customers">Customers ({r.customers.length})</TabsTrigger>
          <TabsTrigger value="sales">Sales ({r.sales.length})</TabsTrigger>
          <TabsTrigger value="purchases">Purchases ({r.purchases.length})</TabsTrigger>
          <TabsTrigger value="staff">Staff ({r.staff.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-products.csv`, products.map(({ id: _id, ...p }) => ({ ...p, marginPct: p.marginPct.toFixed(1) })))}>
            <FilterChips
              value={stockFilter}
              onChange={setStockFilter}
              options={[
                { value: "all", label: "All", count: r.products.length },
                { value: "low", label: "Low stock", count: r.products.filter((p) => p.stock <= p.threshold).length },
                { value: "out", label: "Out of stock", count: r.products.filter((p) => p.stock <= 0).length },
              ]}
            />
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[720px]">
              <thead><tr className="border-b border-border"><th className={th}>Product</th><th className={th}>Category</th><th className={th}>Cost</th><th className={th}>Price</th><th className={th}>Margin</th><th className={th}>In stock</th></tr></thead>
              <tbody>
                {products.slice(0, 300).map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className={td}><p className="font-medium">{p.name}</p>{p.barcode ? <p className="font-mono text-xs text-muted-foreground">{p.barcode}</p> : null}</td>
                    <td className={td}>{p.category || "—"}</td>
                    <td className={`${td} font-mono`}>{n(p.cost)}</td>
                    <td className={`${td} font-mono`}>{n(p.price)}</td>
                    <td className={`${td} font-mono ${p.marginPct < 10 ? "text-warning" : "text-success"}`}>{p.marginPct.toFixed(1)}%</td>
                    <td className={td}>
                      <Badge variant={p.stock <= 0 ? "danger" : p.stock <= p.threshold ? "warning" : "muted"}>{n(p.stock)} {p.unit}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!products.length ? <p className="p-6 text-center text-sm text-muted-foreground">No products match.</p> : null}
          </TableShell>
        </TabsContent>

        <TabsContent value="customers" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-customers.csv`, customers.map(({ id: _id, ...c }) => c))}>
            <FilterChips
              value={debtFilter}
              onChange={setDebtFilter}
              options={[
                { value: "all", label: "All", count: r.customers.length },
                { value: "debt", label: "Owes money", count: r.customers.filter((c) => c.debt > 0).length },
                { value: "over", label: "Over credit limit", count: r.customers.filter((c) => c.overLimit).length },
              ]}
            />
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-border"><th className={th}>Customer</th><th className={th}>Phone</th><th className={th}>Type</th><th className={th}>Owes</th><th className={th}>Credit limit</th></tr></thead>
              <tbody>
                {customers.slice(0, 300).map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} font-medium`}>{c.name}</td>
                    <td className={`${td} font-mono text-xs`}>{c.phone || "—"}</td>
                    <td className={td}>{c.category || "—"}</td>
                    <td className={`${td} font-mono ${c.overLimit ? "text-destructive" : c.debt > 0 ? "text-warning" : ""}`}>{n(c.debt)}</td>
                    <td className={`${td} font-mono`}>{c.limit ? n(c.limit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!customers.length ? <p className="p-6 text-center text-sm text-muted-foreground">No customers match.</p> : null}
          </TableShell>
        </TabsContent>

        <TabsContent value="sales" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-sales.csv`, sales.map(({ id: _id, date, ...s }) => ({ date: new Date(date).toISOString(), ...s })))}>
            <p className="text-xs text-muted-foreground">Newest 500 receipts</p>
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[820px]">
              <thead><tr className="border-b border-border"><th className={th}>Receipt</th><th className={th}>When</th><th className={th}>Total</th><th className={th}>Profit</th><th className={th}>Paid by</th><th className={th}>Cashier</th><th className={th}>Branch</th><th className={th}>Items</th></tr></thead>
              <tbody>
                {sales.slice(0, 300).map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} font-mono text-xs`}>{s.receipt}</td>
                    <td className={`${td} text-xs`}>{formatDateTime(s.date)}</td>
                    <td className={`${td} font-mono`}>{n(s.total)}</td>
                    <td className={`${td} font-mono text-success`}>{n(s.profit)}</td>
                    <td className={td}><Badge variant={s.method.includes("DEBT") || s.method.includes("CREDIT") ? "warning" : "muted"}>{s.method}</Badge></td>
                    <td className={td}>{s.cashier || "—"}</td>
                    <td className={td}>{s.branch || "—"}</td>
                    <td className={`${td} font-mono`}>{n(s.items)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sales.length ? <p className="p-6 text-center text-sm text-muted-foreground">No sales match.</p> : null}
          </TableShell>
        </TabsContent>

        <TabsContent value="purchases" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-purchases.csv`, purchases.map(({ id: _id, date, ...p }) => ({ date: new Date(date).toISOString(), ...p })))}>
            <p className="text-xs text-muted-foreground">Supplier deliveries recorded on the phone</p>
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[600px]">
              <thead><tr className="border-b border-border"><th className={th}>When</th><th className={th}>Supplier</th><th className={th}>Product</th><th className={th}>Quantity</th><th className={th}>Cost</th></tr></thead>
              <tbody>
                {purchases.slice(0, 300).map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} text-xs`}>{formatDateTime(p.date)}</td>
                    <td className={td}>{p.supplier || "—"}</td>
                    <td className={`${td} font-medium`}>{p.product}</td>
                    <td className={`${td} font-mono`}>{n(p.quantity)}</td>
                    <td className={`${td} font-mono`}>{n(p.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!purchases.length ? <p className="p-6 text-center text-sm text-muted-foreground">No purchases recorded.</p> : null}
          </TableShell>
        </TabsContent>

        <TabsContent value="staff" className="space-y-3">
          <TableShell>
            <table className="w-full min-w-[520px]">
              <thead><tr className="border-b border-border"><th className={th}>Name</th><th className={th}>Username</th><th className={th}>Role</th><th className={th}>Branch</th><th className={th}>Status</th></tr></thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} font-medium`}>{s.name}</td>
                    <td className={`${td} font-mono text-xs`}>@{s.username}</td>
                    <td className={td}>{s.role}</td>
                    <td className={td}>{s.branch || "—"}</td>
                    <td className={td}><Badge variant={s.active ? "success" : "muted"}>{s.active ? "Active" : "Disabled"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Toolbar({ children, onExport }: { children: React.ReactNode; onExport: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {children}
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download /> CSV
      </Button>
    </div>
  );
}
