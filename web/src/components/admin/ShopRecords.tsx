import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, FilterChips, LoadingBlock, SearchInput, TableShell, downloadCsv, matches } from "@/components/admin/ui";
import { getShopRecords } from "@/lib/insights.functions";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "px-3 py-2 text-sm";
const PAGE_SIZE = 100;

/** Browsable copy of all operational records from the shop's latest complete phone sync. */
export function ShopRecords({ shopId, shopName }: { shopId: string; shopName: string }) {
  const a = useAdminText();
  const fetchRecords = useServerFn(getShopRecords);
  const q = useQuery({
    queryKey: ["admin", "records", shopId],
    queryFn: () => fetchRecords({ data: { shopId } }),
    staleTime: 0,
    refetchInterval: 30_000,
  });
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [debtFilter, setDebtFilter] = useState<"all" | "debt" | "over">("all");
  const [pages, setPages] = useState<Record<string, number>>({});
  const r = q.data?.records;
  const slug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || shopId;
  const page = (key: string) => pages[key] ?? 0;
  const pageItems = <T,>(key: string, rows: T[]) => rows.slice(page(key) * PAGE_SIZE, (page(key) + 1) * PAGE_SIZE);
  const pager = (key: string, total: number) => (
    <Pager page={page(key)} total={total} onChange={(next) => setPages((current) => ({ ...current, [key]: next }))} />
  );
  const updateSearch = (value: string) => {
    setSearch(value);
    setPages({});
  };

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
  const saleItems = useMemo(() => (r?.saleItems ?? []).filter((s) => matches(search, s.receipt, s.product, s.category, s.branch)), [r, search]);
  const payments = useMemo(() => (r?.payments ?? []).filter((p) => matches(search, p.customer, p.method, p.receipt, p.recordedBy, p.branch)), [r, search]);
  const staff = useMemo(() => (r?.staff ?? []).filter((s) => matches(search, s.name, s.username, s.role, s.branch)), [r, search]);
  const purchases = useMemo(() => (r?.purchases ?? []).filter((p) => matches(search, p.supplier, p.product, p.invoice, p.branch)), [r, search]);
  const branches = useMemo(() => (r?.branches ?? []).filter((b) => matches(search, b.name, b.code, b.address, b.manager)), [r, search]);
  const transfers = useMemo(() => (r?.stockTransfers ?? []).filter((t) => matches(search, t.number, t.product, t.fromBranch, t.toBranch, t.status)), [r, search]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <EmptyState title={a("Couldn't load shop records")} sub={q.error instanceof Error ? q.error.message : "Try again"} />;
  if (!r) return <EmptyState title={q.data?.error ? "Snapshot could not be read" : "No phone data synced yet"} sub={q.data?.error ?? "Records sync automatically when the shop's phone has internet access."} />;
  const cur = r.currency || "FRw";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">From the phone's latest sync · {relativeTime(q.data?.uploadedAt ?? 0)} · amounts in {cur}</p>
        <div className="w-full sm:w-72">
          <SearchInput value={search} onChange={updateSearch} placeholder="Search products, customers, receipts…" />
        </div>
      </div>
      <Tabs defaultValue="products">
        <TabsList className="flex-wrap">
          <TabsTrigger value="products">Products ({r.products.length})</TabsTrigger>
          <TabsTrigger value="customers">Customers ({r.customers.length})</TabsTrigger>
          <TabsTrigger value="sales">Sales ({r.sales.length})</TabsTrigger>
          <TabsTrigger value="sale-items">Sale items ({r.saleItems.length})</TabsTrigger>
          <TabsTrigger value="payments">Debt payments ({r.payments.length})</TabsTrigger>
          <TabsTrigger value="purchases">Purchases ({r.purchases.length})</TabsTrigger>
          <TabsTrigger value="branches">Branches ({r.branches.length})</TabsTrigger>
          <TabsTrigger value="transfers">Stock transfers ({r.stockTransfers.length})</TabsTrigger>
          <TabsTrigger value="staff">Staff ({r.staff.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-products.csv`, products.map(({ id: _id, ...p }) => ({ ...p, marginPct: p.marginPct.toFixed(1) })))}>
            <FilterChips
              value={stockFilter}
              onChange={(value) => {
                setStockFilter(value);
                setPages({});
              }}
              options={[
                { value: "all", label: "All", count: r.products.length },
                { value: "low", label: "Low stock", count: r.products.filter((p) => p.stock <= p.threshold).length },
                { value: "out", label: "Out of stock", count: r.products.filter((p) => p.stock <= 0).length },
              ]}
            />
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[720px]">
              <thead><tr className="border-b border-border"><th className={th}>{a("Product")}</th><th className={th}>{a("Category")}</th><th className={th}>{a("Cost")}</th><th className={th}>{a("Price")}</th><th className={th}>{a("Margin")}</th><th className={th}>{a("In stock")}</th></tr></thead>
              <tbody>
                {pageItems("products", products).map((p) => (
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
            {!products.length ? <p className="p-6 text-center text-sm text-muted-foreground">{a("No products match.")}</p> : null}
          </TableShell>
          {pager("products", products.length)}
        </TabsContent>

        <TabsContent value="customers" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-customers.csv`, customers.map(({ id: _id, ...c }) => c))}>
            <FilterChips
              value={debtFilter}
              onChange={(value) => {
                setDebtFilter(value);
                setPages({});
              }}
              options={[
                { value: "all", label: "All", count: r.customers.length },
                { value: "debt", label: "Owes money", count: r.customers.filter((c) => c.debt > 0).length },
                { value: "over", label: "Over credit limit", count: r.customers.filter((c) => c.overLimit).length },
              ]}
            />
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-border"><th className={th}>{a("Customer")}</th><th className={th}>{a("Phone")}</th><th className={th}>{a("Type")}</th><th className={th}>{a("Owes")}</th><th className={th}>{a("Credit limit")}</th></tr></thead>
              <tbody>
                {pageItems("customers", customers).map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} font-medium`}>{c.name}</td>
                    <td className={`${td} text-xs`}>{[c.phone, c.email, c.address, c.city].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={td}>{c.category || "—"}</td>
                    <td className={`${td} font-mono ${c.overLimit ? "text-destructive" : c.debt > 0 ? "text-warning" : ""}`}>{n(c.debt)}</td>
                    <td className={`${td} font-mono`}>{c.limit ? n(c.limit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!customers.length ? <p className="p-6 text-center text-sm text-muted-foreground">{a("No customers match.")}</p> : null}
          </TableShell>
          {pager("customers", customers.length)}
        </TabsContent>

        <TabsContent value="sales" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-sales.csv`, sales.map(({ id: _id, date, ...s }) => ({ date: new Date(date).toISOString(), ...s })))}>
            <p className="text-xs text-muted-foreground">{sales.length.toLocaleString()} receipts · full history</p>
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[820px]">
              <thead><tr className="border-b border-border"><th className={th}>{a("Receipt")}</th><th className={th}>{a("When")}</th><th className={th}>{a("Total")}</th><th className={th}>{a("Profit")}</th><th className={th}>{a("Paid by")}</th><th className={th}>{a("Cashier")}</th><th className={th}>{a("Branch")}</th><th className={th}>{a("Items")}</th></tr></thead>
              <tbody>
                {pageItems("sales", sales).map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} font-mono text-xs`}>{s.receipt}</td>
                    <td className={`${td} text-xs`}>{formatDateTime(s.date)}</td>
                    <td className={`${td} font-mono`} title={`Cost ${n(s.cost)} · Paid ${n(s.amountPaid)} · Discount ${n(s.discount)}`}>{n(s.total)}</td>
                    <td className={`${td} font-mono text-success`}>{n(s.profit)}</td>
                    <td className={td}><Badge variant={s.method.includes("DEBT") || s.method.includes("CREDIT") ? "warning" : "muted"}>{s.method}</Badge></td>
                    <td className={td}>{s.cashier || "—"}</td>
                    <td className={td}>{s.branch || "—"}</td>
                    <td className={`${td} font-mono`}>{n(s.items)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sales.length ? <p className="p-6 text-center text-sm text-muted-foreground">{a("No sales match.")}</p> : null}
          </TableShell>
          {pager("sales", sales.length)}
        </TabsContent>

        <TabsContent value="purchases" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-purchases.csv`, purchases.map(({ id: _id, date, ...p }) => ({ date: new Date(date).toISOString(), ...p })))}>
            <p className="text-xs text-muted-foreground">{a("Supplier deliveries recorded on the phone")}</p>
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[600px]">
              <thead><tr className="border-b border-border"><th className={th}>{a("When")}</th><th className={th}>{a("Supplier")}</th><th className={th}>{a("Product")}</th><th className={th}>{a("Quantity")}</th><th className={th}>{a("Cost")}</th></tr></thead>
              <tbody>
                {pageItems("purchases", purchases).map((p) => (
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
            {!purchases.length ? <p className="p-6 text-center text-sm text-muted-foreground">{a("No purchases recorded.")}</p> : null}
          </TableShell>
          {pager("purchases", purchases.length)}
        </TabsContent>

        <TabsContent value="staff" className="space-y-3">
          <TableShell>
            <table className="w-full min-w-[720px]">
              <thead><tr className="border-b border-border"><th className={th}>{a("Name")}</th><th className={th}>{a("Username")}</th><th className={th}>{a("Role")}</th><th className={th}>{a("Branch")}</th><th className={th}>{a("Permissions")}</th><th className={th}>{a("Status")}</th></tr></thead>
              <tbody>
                {pageItems("staff", staff).map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} font-medium`}>{s.name}</td>
                    <td className={`${td} font-mono text-xs`}>@{s.username}</td>
                    <td className={td}>{s.role}</td>
                    <td className={td}>{s.branch || "—"}</td>
                    <td className={`${td} text-xs`}>
                      {[
                        s.canSellPOS && "POS",
                        s.canApplyDiscounts && "discounts",
                        s.canManageInventory && "inventory",
                        s.canViewCostAndProfit && "cost/profit",
                        s.canViewAnalytics && "analytics",
                        s.canManageCustomers && "customers",
                        s.canCollectDebt && "debt",
                        s.canDeleteRecords && "delete",
                        s.canExportReports && "reports",
                        s.canManageCollaborators && "staff",
                        s.canManageShopSettings && "settings",
                        s.canExportImportData && "data transfer",
                      ].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className={td}><Badge variant={s.active ? "success" : "muted"}>{s.active ? "Active" : "Disabled"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          {pager("staff", staff.length)}
        </TabsContent>

        <TabsContent value="sale-items" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-sale-items.csv`, saleItems.map(({ id: _id, ...item }) => item))}>
            <p className="text-xs text-muted-foreground">{saleItems.length.toLocaleString()} line items from recorded receipts</p>
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[820px]">
              <thead><tr className="border-b border-border"><th className={th}>{a("Receipt")}</th><th className={th}>{a("Product")}</th><th className={th}>{a("Category")}</th><th className={th}>{a("Quantity")}</th><th className={th}>{a("Unit price")}</th><th className={th}>{a("Subtotal")}</th><th className={th}>{a("Profit")}</th></tr></thead>
              <tbody>
                {pageItems("sale-items", saleItems).map((item) => (
                  <tr key={item.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} font-mono text-xs`}>{item.receipt}</td>
                    <td className={`${td} font-medium`}>{item.product}</td>
                    <td className={td}>{item.category || "—"}</td>
                    <td className={`${td} font-mono`}>{n(item.quantity)} {item.unit}</td>
                    <td className={`${td} font-mono`}>{n(item.price)}</td>
                    <td className={`${td} font-mono`}>{n(item.subtotal)}</td>
                    <td className={`${td} font-mono text-success`}>{n(item.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!saleItems.length ? <p className="p-6 text-center text-sm text-muted-foreground">{a("No sale items recorded.")}</p> : null}
          </TableShell>
          {pager("sale-items", saleItems.length)}
        </TabsContent>

        <TabsContent value="payments" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-debt-payments.csv`, payments.map(({ id: _id, ...payment }) => ({ ...payment, date: new Date(payment.date).toISOString() })))}>
            <p className="text-xs text-muted-foreground">{payments.length.toLocaleString()} customer payments</p>
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[820px]">
              <thead><tr className="border-b border-border"><th className={th}>{a("When")}</th><th className={th}>{a("Customer")}</th><th className={th}>{a("Amount")}</th><th className={th}>{a("Previous debt")}</th><th className={th}>{a("Remaining")}</th><th className={th}>{a("Method")}</th><th className={th}>{a("Recorded by")}</th></tr></thead>
              <tbody>
                {pageItems("payments", payments).map((payment) => (
                  <tr key={payment.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} text-xs`}>{formatDateTime(payment.date)}</td>
                    <td className={td}>{payment.customer}</td>
                    <td className={`${td} font-mono`}>{n(payment.amount)}</td>
                    <td className={`${td} font-mono`}>{n(payment.previousDebt)}</td>
                    <td className={`${td} font-mono`}>{n(payment.remainingDebt)}</td>
                    <td className={td}>{payment.method || "—"}</td>
                    <td className={td}>{payment.recordedBy || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!payments.length ? <p className="p-6 text-center text-sm text-muted-foreground">{a("No customer payments recorded.")}</p> : null}
          </TableShell>
          {pager("payments", payments.length)}
        </TabsContent>

        <TabsContent value="branches" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-branches.csv`, branches.map(({ id: _id, ...branch }) => branch))}>
            <p className="text-xs text-muted-foreground">{branches.length.toLocaleString()} branches from the phone's latest sync</p>
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[680px]">
              <thead><tr className="border-b border-border"><th className={th}>{a("Branch")}</th><th className={th}>{a("Code")}</th><th className={th}>{a("Address")}</th><th className={th}>{a("Phone")}</th><th className={th}>{a("Manager")}</th><th className={th}>{a("Status")}</th></tr></thead>
              <tbody>
                {pageItems("branches", branches).map((branch) => (
                  <tr key={branch.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} font-medium`}>{branch.name}{branch.isMain ? " · Main" : ""}</td>
                    <td className={td}>{branch.code || "—"}</td>
                    <td className={td}>{branch.address || "—"}</td>
                    <td className={td}>{branch.phone || "—"}</td>
                    <td className={td}>{branch.manager || "—"}</td>
                    <td className={td}><Badge variant={branch.active ? "success" : "muted"}>{branch.active ? "Active" : "Inactive"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!branches.length ? <p className="p-6 text-center text-sm text-muted-foreground">{a("No branches recorded.")}</p> : null}
          </TableShell>
          {pager("branches", branches.length)}
        </TabsContent>

        <TabsContent value="transfers" className="space-y-3">
          <Toolbar onExport={() => downloadCsv(`${slug}-stock-transfers.csv`, transfers.map(({ id: _id, ...transfer }) => ({ ...transfer, date: new Date(transfer.date).toISOString() })))}>
            <p className="text-xs text-muted-foreground">{transfers.length.toLocaleString()} stock transfers</p>
          </Toolbar>
          <TableShell>
            <table className="w-full min-w-[820px]">
              <thead><tr className="border-b border-border"><th className={th}>{a("Transfer")}</th><th className={th}>{a("When")}</th><th className={th}>{a("Product")}</th><th className={th}>{a("From")}</th><th className={th}>{a("To")}</th><th className={th}>{a("Quantity")}</th><th className={th}>{a("Status")}</th></tr></thead>
              <tbody>
                {pageItems("transfers", transfers).map((transfer) => (
                  <tr key={transfer.id} className="border-b border-border/60 last:border-0">
                    <td className={`${td} font-mono text-xs`}>{transfer.number || transfer.id}</td>
                    <td className={`${td} text-xs`}>{formatDateTime(transfer.date)}</td>
                    <td className={td}>{transfer.product}</td>
                    <td className={td}>{transfer.fromBranch}</td>
                    <td className={td}>{transfer.toBranch}</td>
                    <td className={`${td} font-mono`}>{n(transfer.quantity)} {transfer.unit}</td>
                    <td className={td}>{transfer.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!transfers.length ? <p className="p-6 text-center text-sm text-muted-foreground">{a("No stock transfers recorded.")}</p> : null}
          </TableShell>
          {pager("transfers", transfers.length)}
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

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const a = useAdminText();
  const pageCount = Math.ceil(total / PAGE_SIZE);
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
      <span>
        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
      </span>
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onChange(page - 1)}>
        {a("Previous")}
      </Button>
      <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => onChange(page + 1)}>
        {a("Next")}
      </Button>
    </div>
  );
}
