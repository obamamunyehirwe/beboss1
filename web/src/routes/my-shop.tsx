import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Loader2, Search, Send, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import { lookupMyShop, submitPaymentProof } from "@/lib/public.functions";
import { publicSiteQuery } from "@/lib/queries";
import { AnnouncementCard } from "@/components/site/AnnouncementBanner";
import { buildAirtelUssd, buildMtnUssd, calculateSubscriptionFee, effectiveShopStatus } from "@/lib/pricing";
import { daysLeft, formatDateTime, formatRwf, relativeTime } from "@/lib/format";
import { deviceHealth } from "@/lib/sync-health";
import { ReceiptVerifier } from "@/components/site/ReceiptVerifier";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  pay: z.coerce.number().optional(),
  b: z.coerce.number().int().min(1).max(100).optional(),
  w: z.coerce.number().int().min(1).max(500).optional(),
  d: z.coerce.number().int().min(1).max(100).optional(),
  m: z.coerce.number().int().optional(),
});

export const Route = createFileRoute("/my-shop")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "My shop — check your BeBoss license & payments" },
      { name: "description", content: "Shop owners: check your BeBoss plan, expiry date, payment verification status and unlock codes, or submit a MoMo payment proof." },
      { property: "og:title", content: "Check your BeBoss shop license" },
      { property: "og:description", content: "See your plan status and unlock codes, or submit your Mobile Money payment proof." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyShopPage,
});

type Lookup = Awaited<ReturnType<typeof lookupMyShop>>;

function statusVariant(s: string) {
  if (s === "ACTIVE" || s === "APPROVED" || s === "ISSUED") return "success" as const;
  if (s === "TRIAL" || s === "PENDING_VERIFICATION") return "warning" as const;
  if (s === "REDEEMED") return "info" as const;
  return "danger" as const;
}

function MyShopPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const [tab, setTab] = useState(search.pay ? "pay" : "check");
  return (
    <SiteLayout>
      <PageHero eyebrow={t("navMyShop")} title={t("myShopTitle")} sub={t("myShopSub")} />
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="check">
              <Search className="size-4" /> {t("lookup")}
            </TabsTrigger>
            <TabsTrigger value="pay">
              <Send className="size-4" /> {t("submitProof")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="check">
            <LookupPanel />
          </TabsContent>
          <TabsContent value="pay">
            <ProofPanel initial={search} onDone={() => setTab("check")} />
          </TabsContent>
        </Tabs>
      </div>
    </SiteLayout>
  );
}

function LookupPanel() {
  const { t, p } = useI18n();
  const st = (s: string) => p.myShop.status[s] ?? s.replaceAll("_", " ");
  const lookup = useServerFn(lookupMyShop);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Lookup | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      setResult(await lookup({ data: { username, phone } }));
    } catch (err) {
      console.error(err);
      toast.error(p.myShop.lookupFailed);
    } finally {
      setLoading(false);
    }
  };

  const shop = result?.shop;
  const status = shop ? effectiveShopStatus(shop) : null;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-border bg-card p-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="u">{t("username")}</Label>
          <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="mama_shop" required minLength={2} maxLength={80} autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p">{t("phone")}</Label>
          <Input id="p" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0788 123 456" required inputMode="tel" maxLength={30} />
        </div>
        <Button type="submit" variant="hero" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Search />}
          {t("lookup")}
        </Button>
      </form>

      {result && !shop && result.payments.length === 0 ? <p className="rounded-2xl border border-border bg-card p-6 text-muted-foreground">{t("notFound")}</p> : null}

      {result?.announcements?.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t("myShopNews")}</p>
          {result.announcements.map((a) => (
            <AnnouncementCard key={a.id} a={a} />
          ))}
        </div>
      ) : null}

      {shop && status ? (
        <div className="rounded-3xl border border-border bg-surface-2 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">@{shop.owner_username}</p>
              <h2 className="text-2xl font-bold">{shop.shop_name}</h2>
            </div>
            <Badge variant={statusVariant(status)} className="text-sm">
              {st(status)}
            </Badge>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <Stat label={t("expires")} value={formatDateTime(shop.subscription_expires_at)} sub={`${daysLeft(shop.subscription_expires_at)} ${p.common.days}`} />
            <Stat label={t("calcBranches")} value={String(shop.branch_count)} />
            <Stat label={t("calcWorkers")} value={String(shop.worker_count)} />
            <Stat label={t("calcMonthly")} value={formatRwf(shop.monthly_fee_rwf)} />
          </div>
        </div>
      ) : null}

      {/* Synced Phone Records Suite */}
      {result && result.records && (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold">Synced Cloud Store Records</h3>
                <Badge variant="success" className="text-xs">Live from Android</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Relayed from mobile devices • Last sync: {relativeTime(result.snapshotUploadedAt || Date.now())} • Currency: {result.records.currency || "FRw"}
              </p>
            </div>
          </div>

          <Tabs defaultValue="prods">
            <TabsList className="flex-wrap">
              <TabsTrigger value="prods">
                Products ({result.records.products.length})
              </TabsTrigger>
              <TabsTrigger value="debts">
                Customer Debts ({result.records.customers.filter((c) => c.debt > 0).length})
              </TabsTrigger>
              <TabsTrigger value="sales">
                Recent Sales ({result.records.sales.length})
              </TabsTrigger>
              <TabsTrigger value="staff">
                Staff Directory ({result.records.staff.length})
              </TabsTrigger>
            </TabsList>

            {/* Products Tab */}
            <TabsContent value="prods" className="space-y-3 pt-3">
              <div className="max-h-[360px] overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-surface uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Product</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Stock</th>
                      <th className="p-3">Buying Cost</th>
                      <th className="p-3">Selling Price</th>
                      <th className="p-3">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.records.products.map((p) => {
                      const isLow = p.stock <= p.threshold;
                      return (
                        <tr key={p.id} className="hover:bg-surface/50">
                          <td className="p-3 font-medium">
                            {p.name}
                            {p.barcode && <span className="block font-mono text-[10px] text-muted-foreground">{p.barcode}</span>}
                          </td>
                          <td className="p-3 text-muted-foreground">{p.category || "General"}</td>
                          <td className="p-3 font-mono font-bold">
                            <span className={cn(p.stock <= 0 ? "text-destructive" : isLow ? "text-warning" : "text-foreground")}>
                              {p.stock} {isLow && (p.stock <= 0 ? "(Out)" : "(Low)")}
                            </span>
                          </td>
                          <td className="p-3 font-mono">{formatRwf(p.cost)}</td>
                          <td className="p-3 font-mono font-bold text-foreground">{formatRwf(p.price)}</td>
                          <td className="p-3 font-mono text-success">+{p.marginPct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Debts Tab */}
            <TabsContent value="debts" className="space-y-3 pt-3">
              <div className="max-h-[360px] overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-surface uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">Debt Balance</th>
                      <th className="p-3">Credit Limit</th>
                      <th className="p-3 text-right">Reminder Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.records.customers.map((c) => {
                      const waMsg = `Hello ${c.name}, this is a polite reminder from ${shop?.shop_name || "your store"} regarding your outstanding balance of ${formatRwf(c.debt)}. Murakoze!`;
                      return (
                        <tr key={c.id} className="hover:bg-surface/50">
                          <td className="p-3 font-medium">
                            {c.name}
                            {c.category && <span className="block text-[10px] text-muted-foreground">{c.category}</span>}
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">{c.phone || "—"}</td>
                          <td className="p-3 font-mono font-bold text-warning">{formatRwf(c.debt)}</td>
                          <td className="p-3 font-mono">{formatRwf(c.limit)}</td>
                          <td className="p-3 text-right">
                            {c.phone && c.debt > 0 ? (
                              <Button size="sm" variant="glass" asChild className="h-7 text-[11px]">
                                <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noreferrer">
                                  WhatsApp Reminder
                                </a>
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-[11px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Sales Tab */}
            <TabsContent value="sales" className="space-y-3 pt-3">
              <div className="max-h-[360px] overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-surface uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Receipt No</th>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Total</th>
                      <th className="p-3">Net Profit</th>
                      <th className="p-3">Payment Method</th>
                      <th className="p-3">Cashier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {result.records.sales.map((s) => (
                      <tr key={s.id} className="hover:bg-surface/50">
                        <td className="p-3 font-bold text-foreground">{s.receipt}</td>
                        <td className="p-3 text-muted-foreground font-sans">{formatDateTime(s.date)}</td>
                        <td className="p-3 font-bold text-foreground">{formatRwf(s.total)}</td>
                        <td className="p-3 text-success">+{formatRwf(s.profit)}</td>
                        <td className="p-3 font-sans">
                          <Badge variant={s.method.includes("DEBT") ? "warning" : "muted"} className="text-[10px]">
                            {s.method}
                          </Badge>
                        </td>
                        <td className="p-3 font-sans text-muted-foreground">{s.cashier || "Counter"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Staff Tab */}
            <TabsContent value="staff" className="space-y-3 pt-3">
              <div className="max-h-[360px] overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-surface uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Staff Member</th>
                      <th className="p-3">Username</th>
                      <th className="p-3">Branch</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.records.staff.map((st) => (
                      <tr key={st.id} className="hover:bg-surface/50">
                        <td className="p-3 font-medium">{st.name}</td>
                        <td className="p-3 font-mono text-muted-foreground">@{st.username}</td>
                        <td className="p-3 text-muted-foreground">{st.branch || "Main Branch"}</td>
                        <td className="p-3 font-semibold">{st.role}</td>
                        <td className="p-3">
                          <Badge variant={st.active ? "success" : "muted"} className="text-[10px]">
                            {st.active ? "Active" : "Disabled"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Snapshots Notice if no records decoded yet */}
      {result && shop && (!result.records || result.records.products.length === 0) && (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Cloud Sync Snapshot Status</p>
          <p className="mt-1">
            {result.snapshots && result.snapshots.length > 0
              ? `Your phone has uploaded ${result.snapshots.length} cloud snapshot(s). Latest summary: "${result.snapshots[0]?.records_summary || "Sync active"}".`
              : "No phone snapshot is available yet. BeBoss uploads records automatically when the phone has internet access; keep the app open briefly and check again."}
          </p>
        </div>
      )}

      {/* Receipt Verifier Section */}
      {result && shop && (
        <div className="mt-8">
          <ReceiptVerifier />
        </div>
      )}

      {result && result.devices.length ? (
        <div className="rounded-3xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 font-semibold">
            <Smartphone className="size-4 text-primary" /> {t("myDevices")}
          </h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {result.devices.map((d) => {
              const h = deviceHealth(d.last_synced_at);
              return (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {d.device_name || d.device_id}
                      {d.is_owner_primary ? <span className="text-xs text-muted-foreground"> · {t("ownerPhone")}</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.assigned_user_name} · {d.branch_name} · {d.last_synced_at ? relativeTime(d.last_synced_at) : "—"}
                    </p>
                  </div>
                  <Badge variant={!d.is_active ? "danger" : h === "ONLINE" ? "success" : h === "TODAY" ? "info" : "warning"}>
                    {!d.is_active ? t("deviceOff") : h === "ONLINE" ? t("deviceOnline") : h === "TODAY" ? t("deviceToday") : t("deviceIdle")}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {result && result.codes.length ? (
        <div className="rounded-3xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 font-semibold">
            <KeyRound className="size-4 text-primary" /> {t("unlockCodes")}
          </h3>
          <div className="mt-4 space-y-2">
            {result.codes.map((c) => (
              <div key={c.unlock_code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
                <div>
                  <p className="font-mono text-sm">{c.unlock_code}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.tier_code} • +{c.plan_days}d • {formatDateTime(c.issued_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(c.status)}>{st(c.status)}</Badge>
                  {c.status === "ISSUED" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await navigator.clipboard.writeText(c.unlock_code);
                        setCopied(c.unlock_code);
                        toast.success(t("copied"));
                      }}
                    >
                      {copied === c.unlock_code ? <Check className="text-success" /> : <Copy />}
                      {t("copy")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result && result.payments.length ? (
        <div className="rounded-3xl border border-border bg-card p-6">
          <h3 className="font-semibold">{t("payments")}</h3>
          <div className="mt-4 space-y-2">
            {result.payments.map((pay) => (
              <div key={pay.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {pay.provider} • {formatRwf(pay.amount_rwf)} • {pay.duration_months} {t("calcMonths")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.myShop.ref} {pay.telco_reference || "—"} • {formatDateTime(pay.created_at)}
                    {pay.rejection_reason ? ` • ${pay.rejection_reason}` : ""}
                  </p>
                </div>
                <Badge variant={statusVariant(pay.status)}>{st(pay.status)}</Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProofPanel({ initial, onDone }: { initial: z.infer<typeof searchSchema>; onDone: () => void }) {
  const { t, p } = useI18n();
  const submit = useServerFn(submitPaymentProof);
  const { data: site } = useQuery(publicSiteQuery);
  const [f, setF] = useState({
    shopName: "",
    username: "",
    phone: "",
    provider: "MTN MoMo" as "MTN MoMo" | "Airtel Money",
    payerPhone: "",
    payerName: "",
    telcoReference: "",
    months: ([1, 3, 6, 12].includes(Number(initial.m)) ? Number(initial.m) : 1) as 1 | 3 | 6 | 12,
    branches: initial.b ?? 1,
    workers: initial.w ?? 1,
    devices: initial.d ?? 1,
  });
  const [sending, setSending] = useState(false);
  const cfg = site?.config ?? {};
  const calc = calculateSubscriptionFee(f.branches, f.workers, f.months, f.devices, Number(site?.config?.per_device_fee_rwf) || 2000);
  const ussd = f.provider === "MTN MoMo" ? buildMtnUssd(calc.total, cfg) : buildAirtelUssd(calc.total, cfg);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await submit({ data: { ...f, ussd } });
      toast.success(p.myShop.proofSent);
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(p.myShop.sendFailed);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="grid gap-4 rounded-3xl border border-border bg-card p-6 sm:grid-cols-2">
        <Field label={t("shopName")} value={f.shopName} onChange={(v) => set("shopName", v)} min={2} max={120} />
        <Field label={t("username")} value={f.username} onChange={(v) => set("username", v)} min={2} max={80} />
        <Field label={t("phone")} value={f.phone} onChange={(v) => set("phone", v)} min={9} max={30} tel />
        <div className="space-y-2">
          <Label>{t("payWith")}</Label>
          <Select value={f.provider} onValueChange={(v) => set("provider", v as typeof f.provider)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MTN MoMo">MTN MoMo</SelectItem>
              <SelectItem value="Airtel Money">Airtel Money</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label={p.myShop.payerName} value={f.payerName} onChange={(v) => set("payerName", v)} min={2} max={120} />
        <Field label={p.myShop.payerPhone} value={f.payerPhone} onChange={(v) => set("payerPhone", v)} min={9} max={30} tel />
        <Field label={p.myShop.txRef} value={f.telcoReference} onChange={(v) => set("telcoReference", v)} min={4} max={60} />
        <div className="space-y-2">
          <Label>{t("calcCycle")}</Label>
          <Select value={String(f.months)} onValueChange={(v) => set("months", Number(v) as typeof f.months)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 3, 6, 12].map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} {m === 1 ? t("calcMonth") : t("calcMonths")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NumField label={t("calcBranches")} value={f.branches} onChange={(v) => set("branches", v)} max={100} />
        <NumField label={t("calcWorkers")} value={f.workers} onChange={(v) => set("workers", v)} max={500} />
        <NumField label={t("calcDevices")} value={f.devices} onChange={(v) => set("devices", v)} max={100} />
      </div>
      <div className="flex flex-col gap-4 rounded-3xl border border-primary/30 bg-surface-2 p-6">
        <p className="text-sm text-muted-foreground">{t("calcTotal")}</p>
        <p className="font-display text-4xl font-extrabold text-gradient-brand">{formatRwf(calc.total)}</p>
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-xs text-muted-foreground">{t("dialThis")}</p>
          <a href={`tel:${encodeURIComponent(ussd)}`} className="font-mono text-lg font-semibold text-primary">
            {ussd}
          </a>
        </div>
        <p className="text-xs text-muted-foreground">{p.myShop.amountNote}</p>
        <Button type="submit" variant="hero" size="lg" className="mt-auto" disabled={sending}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          {t("submitProof")}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, min, max, tel }: { label: string; value: string; onChange: (v: string) => void; min: number; max: number; tel?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} required minLength={min} maxLength={max} inputMode={tel ? "tel" : undefined} />
    </div>
  );
}

function NumField({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min={1} max={max} value={value} onChange={(e) => onChange(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/50 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
