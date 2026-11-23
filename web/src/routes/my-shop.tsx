import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/use-server-fn";
import { Check, Copy, KeyRound, Loader2, Plus, Search, Send, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { liveConfigured } from '@/lib/live-config';
import { ServiceUnavailable } from '@/components/site/ServiceUnavailable';
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import { addMyShopDevice, claimMyShopOwner, confirmMyShopStockTransfer, createGatewayCheckout, deleteMyShopBranch, lookupMyShop, requestMyShopOwnerOtp, requestMyShopStockTransferCancellation, upsertMyShopBranch, upsertMyShopStockTransfer } from "@/lib/public.functions";
import { AnnouncementCard } from "@/components/site/AnnouncementBanner";
import { calculateSubscriptionFee, effectiveShopStatus } from "@/lib/pricing";
import { daysLeft, formatDateTime, formatRwf, relativeTime } from "@/lib/format";
import { deviceHealth } from "@/lib/sync-health";
import { ReceiptVerifier } from "@/components/site/ReceiptVerifier";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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
  component: liveConfigured ? MyShopPage : () => <ServiceUnavailable title="navMyShop" />,
});

type Lookup = Awaited<ReturnType<typeof lookupMyShop>>;

function ownerPhoneE164(value: string): string {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 9 ? digits : digits.startsWith("250") && digits.length === 12 ? digits.slice(3) : digits.startsWith("0") && digits.length === 10 ? digits.slice(1) : "";
  if (!/^7\d{8}$/.test(local)) throw new Error("Enter the registered Rwanda mobile number.");
  return `+250${local}`;
}

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
            <ProofPanel initial={search} />
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
  const registerDevice = useServerFn(addMyShopDevice);
  const sendOwnerOtp = useServerFn(requestMyShopOwnerOtp);
  const enrollOwner = useServerFn(claimMyShopOwner);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Lookup | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [assignedBranchId, setAssignedBranchId] = useState("");
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [issuedInvite, setIssuedInvite] = useState<{ id: string; joinCode: string; expiresAt: number } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (otpSent) {
        const normalizedPhone = ownerPhoneE164(phone);
        const { error } = await supabase.auth.verifyOtp({
          phone: normalizedPhone,
          token: otp.trim(),
          type: "sms",
        });
        if (error) throw new Error("The one-time code is invalid or expired. Request a new code and try again.");
        await enrollOwner({ data: { username, phone } });
        setResult(await lookup({ data: { username, phone } }));
        toast.success("Owner phone verified. My Shop is now securely authenticated.");
      } else {
        const { data: current } = await supabase.auth.getSession();
        const authenticatedUser = current.session?.user;
        if (
          authenticatedUser?.phone_confirmed_at &&
          authenticatedUser.phone &&
          authenticatedUser.phone.replace(/\D/g, "").slice(-9) === phone.replace(/\D/g, "").slice(-9)
        ) {
          await enrollOwner({ data: { username, phone } });
          setResult(await lookup({ data: { username, phone } }));
          toast.success("Owner session verified.");
        } else {
          await sendOwnerOtp({ data: { username, phone } });
          setOtpSent(true);
          toast.info("If the details match a registered shop, an SMS verification code has been sent to its owner phone.");
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : p.myShop.lookupFailed);
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
          <Input id="u" value={username} onChange={(e) => { setUsername(e.target.value); setOtpSent(false); setOtp(""); }} placeholder="mama_shop" required minLength={2} maxLength={80} autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p">{t("phone")}</Label>
          <Input id="p" value={phone} onChange={(e) => { setPhone(e.target.value); setOtpSent(false); setOtp(""); }} placeholder="0788 123 456" required inputMode="tel" maxLength={30} />
        </div>
        {otpSent ? (
          <div className="space-y-2">
            <Label htmlFor="owner-otp">SMS verification code</Label>
            <Input id="owner-otp" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))} required minLength={4} maxLength={8} inputMode="numeric" autoComplete="one-time-code" placeholder="Enter code" />
          </div>
        ) : null}
        <Button type="submit" variant="hero" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : otpSent ? <KeyRound /> : <Search />}
          {otpSent ? "Verify & open My Shop" : "Send owner verification code"}
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
              <TabsTrigger value="branches">
                <Plus className="size-4" /> Branches & Transfers
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

            {/* Branches & Transfers Tab */}
            <TabsContent value="branches" className="pt-3">
              <BranchManager
                username={username}
                phone={phone}
                result={result}
                onRefresh={async () => {
                  try {
                    setResult(await lookup({ data: { username, phone } }));
                  } catch {
                    /* silent refresh */
                  }
                }}
              />
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

      {result && shop ? (
        <div className="rounded-3xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 font-semibold">
            <Smartphone className="size-4 text-primary" /> {t("myDevices")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Device slots, staff roles and branch assignments are shared with the Android app through the same shop cloud account.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {result.devices.map((d) => {
              const h = deviceHealth(d.last_synced_at);
              return (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {d.device_name || d.device_id || "Unpaired device slot"}
                      {d.is_owner_primary ? <span className="text-xs text-muted-foreground"> · {t("ownerPhone")}</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.assigned_user_name} · {d.branch_name} · {d.device_id ? (d.last_synced_at ? relativeTime(d.last_synced_at) : "Waiting for first sync") : "Waiting for pairing"}
                    </p>
                  </div>
                  <Badge variant={!d.is_active ? "danger" : d.device_id ? h === "ONLINE" ? "success" : h === "TODAY" ? "info" : "warning" : "muted"}>
                    {!d.is_active ? t("deviceOff") : d.device_id ? h === "ONLINE" ? t("deviceOnline") : h === "TODAY" ? t("deviceToday") : t("deviceIdle") : "Awaiting pairing"}
                  </Badge>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-surface-2 p-4">
            <div className="flex items-center gap-2">
              <Plus className="size-4 text-primary" />
              <h4 className="font-semibold">Register an additional POS device</h4>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              The owner terminal must already be registered and synced. Choose an active staff account and the branch assigned to that staff member. A single-use join code expires after 60 minutes.
            </p>
            {result.devices.some((d) => d.is_owner_primary && d.is_active && d.device_id) ? (
              <form
                className="mt-4 grid gap-3 md:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const staff = result.staff.filter((u) => u.is_active && u.role !== "OWNER");
                  const branches = result.branches.filter((b) => b.is_active);
                  const userId = assignedUserId || staff[0]?.user_id || "";
                  const assigned = staff.find((u) => u.user_id === userId);
                  const branchId = assignedBranchId || assigned?.assigned_branch_id || "";
                  if (!userId || !branchId || !deviceName.trim()) {
                    toast.error("Select an active staff account, its assigned branch and a device name.");
                    return;
                  }
                  setDeviceBusy(true);
                  setIssuedInvite(null);
                  try {
                    const created = await registerDevice({
                      data: { username, phone, deviceName, assignedUserId: userId, branchId },
                    });
                    setIssuedInvite(created);
                    toast.success("Device slot registered in BeBoss Cloud.");
                    setResult(await lookup({ data: { username, phone } }));
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not register the POS device.");
                  } finally {
                    setDeviceBusy(false);
                  }
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="device-name">Device name</Label>
                  <Input id="device-name" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="e.g. Nyabugogo Counter 2" required maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label>Assigned staff account</Label>
                  <Select value={assignedUserId || result.staff.find((u) => u.is_active && u.role !== "OWNER")?.user_id || ""} onValueChange={(value) => {
                    setAssignedUserId(value);
                    setAssignedBranchId(result.staff.find((u) => u.user_id === value)?.assigned_branch_id || "");
                  }}>
                    <SelectTrigger><SelectValue placeholder="Choose active staff" /></SelectTrigger>
                    <SelectContent>
                      {result.staff.filter((u) => u.is_active && u.role !== "OWNER").map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>{u.full_name} · @{u.username} · {u.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned branch</Label>
                  <Select value={assignedBranchId || result.staff.find((u) => u.user_id === (assignedUserId || result.staff.find((x) => x.is_active && x.role !== "OWNER")?.user_id))?.assigned_branch_id || ""} onValueChange={setAssignedBranchId}>
                    <SelectTrigger><SelectValue placeholder="Choose assigned branch" /></SelectTrigger>
                    <SelectContent>
                      {result.branches.filter((b) => b.is_active && b.id === result.staff.find((u) => u.user_id === (assignedUserId || result.staff.find((x) => x.is_active && x.role !== "OWNER")?.user_id))?.assigned_branch_id).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name} · {b.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="hero" disabled={deviceBusy || result.staff.filter((u) => u.is_active && u.role !== "OWNER").length === 0 || result.branches.filter((b) => b.is_active).length === 0}>
                    {deviceBusy ? <Loader2 className="animate-spin" /> : <Plus />}
                    Register device & create join code
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
                Open the BeBoss Android app on the registered owner terminal, sign in as the owner, and sync once before registering additional devices here.
              </p>
            )}
            {issuedInvite ? (
              <div className="mt-4 rounded-xl border border-primary/30 bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Single-use Android join code</p>
                  <Badge variant="warning">Expires {formatDateTime(issuedInvite.expiresAt)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-lg font-bold tracking-wider">{issuedInvite.joinCode}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(issuedInvite.joinCode);
                      setCopied(issuedInvite.id);
                      toast.success("Join code copied. It will not be shown again after this page is refreshed.");
                    }}
                  >
                    {copied === issuedInvite.id ? <Check /> : <Copy />} Copy code
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  On Android, choose “Join existing shop”, enter the shop owner’s username and phone, paste this code, then create the staff PIN and password for the assigned account.
                </p>
              </div>
            ) : null}
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
                    {formatDateTime(pay.payment_time_ms || pay.created_at)}{pay.payment_note ? ` • ${pay.payment_note}` : ""}
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

function BranchManager({
  username,
  phone,
  result,
  onRefresh,
}: {
  username: string;
  phone: string;
  result: Lookup;
  onRefresh: () => void;
}) {
  const upsertBranch = useServerFn(upsertMyShopBranch);
  const deleteBranch = useServerFn(deleteMyShopBranch);
  const upsertTransfer = useServerFn(upsertMyShopStockTransfer);
  const confirmTransfer = useServerFn(confirmMyShopStockTransfer);
  const requestCancellation = useServerFn(requestMyShopStockTransferCancellation);

  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  type BranchRow = (typeof result.branches)[number];
  const branches: BranchRow[] = result.branches ?? [];
  const transfers = result.stockTransfers ?? [];

  const emptyBranch = {
    id: "",
    name: "",
    code: "",
    address: "",
    phoneBranch: "",
    managerName: "",
    operationalStatus: "OPEN" as "OPEN" | "CLOSED" | "SUSPENDED",
    colorHex: "#FF6B1A",
    dailySalesTargetRwf: 0,
    monthlyTargetRwf: 0,
    openingCashFloat: 0,
    email: "",
    notes: "",
    isMainBranch: false,
  };
  const [form, setForm] = useState(emptyBranch);

  const resetForm = () => {
    setEditing(null);
    setForm(emptyBranch);
  };

  const startEdit = (b: BranchRow) => {
    setEditing(b.id);
    setForm({
      id: b.id,
      name: b.name,
      code: b.code,
      address: b.address,
      phoneBranch: b.phone,
      managerName: b.manager_name,
      operationalStatus: (b.operational_status as "OPEN" | "CLOSED" | "SUSPENDED") ?? "OPEN",
      colorHex: b.color_hex,
      dailySalesTargetRwf: b.daily_sales_target_rwf,
      monthlyTargetRwf: b.monthly_target_rwf,
      openingCashFloat: b.opening_cash_float,
      email: b.email,
      notes: b.notes,
      isMainBranch: b.is_main_branch,
    });
  };

  const saveBranch = async () => {
    if (!form.name.trim()) {
      toast.error("Branch name is required.");
      return;
    }
    setBusy("branch");
    try {
      await upsertBranch({
        data: {
          username,
          phone,
          id: editing ?? crypto.randomUUID(),
          name: form.name,
          code: form.code,
          address: form.address,
          phoneBranch: form.phoneBranch,
          managerName: form.managerName,
          isMainBranch: form.isMainBranch,
          operationalStatus: form.operationalStatus,
          colorHex: form.colorHex,
          dailySalesTargetRwf: form.dailySalesTargetRwf,
          monthlyTargetRwf: form.monthlyTargetRwf,
          openingCashFloat: form.openingCashFloat,
          email: form.email,
          notes: form.notes,
        },
      });
      toast.success(editing ? "Branch updated. It will sync to your phone." : "Branch created. It will sync to your phone.");
      resetForm();
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save branch.");
    } finally {
      setBusy(null);
    }
  };

  const removeBranch = async (id: string) => {
    setBusy(id);
    try {
      await deleteBranch({ data: { username, phone, id } });
      toast.success("Branch removed. It will sync to your phone.");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete branch.");
    } finally {
      setBusy(null);
    }
  };

  const [tf, setTf] = useState({
    productId: "",
    fromBranchId: "",
    toBranchId: "",
    quantity: 1,
    notes: "",
  });

  const saveTransfer = async () => {
    const product = (result.records?.products ?? []).find((item) => String(item.id ?? "") === tf.productId);
    if (!product || !tf.fromBranchId || !tf.toBranchId || !Number.isFinite(tf.quantity) || tf.quantity <= 0) {
      toast.error("Choose a product from the synced inventory, both branches and a positive quantity.");
      return;
    }
    const productBranchId = String(product.branchId ?? "");
    if (productBranchId && productBranchId !== tf.fromBranchId && !(productBranchId === "main_branch" && tf.fromBranchId === "main_branch")) {
      toast.error("The selected product is not assigned to the source branch.");
      return;
    }
    if (tf.fromBranchId === tf.toBranchId) {
      toast.error("Source and destination branches must differ.");
      return;
    }
    setBusy("transfer");
    try {
      const fromName = branches.find((b) => b.id === tf.fromBranchId)?.name ?? "";
      const toName = branches.find((b) => b.id === tf.toBranchId)?.name ?? "";
      await upsertTransfer({
        data: {
          username,
          phone,
          id: crypto.randomUUID(),
          transferNumber: `TRF-${Date.now().toString().slice(-8)}`,
          productId: tf.productId,
          productName: String(product.name ?? ""),
          fromBranchId: tf.fromBranchId,
          fromBranchName: fromName,
          toBranchId: tf.toBranchId,
          toBranchName: toName,
          quantity: tf.quantity,
          unit: String(product.unit ?? "pcs"),
          costValueRwf: Math.max(0, Math.round(Number(product.costPrice ?? 0) * tf.quantity)),
          notes: tf.notes,
          transferredBy: "Shop Owner",
        },
      });
      toast.success("Transfer request queued. A paired phone must validate source stock before inventory is deducted.");
      setTf({ productId: "", fromBranchId: "", toBranchId: "", quantity: 1, notes: "" });
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save transfer.");
    } finally {
      setBusy(null);
    }
  };

  const confirmRx = async (id: string) => {
    setBusy(id);
    try {
      await confirmTransfer({ data: { username, phone, id, receivedBy: "Shop Owner" } });
      toast.success("Receipt request queued. A paired phone will validate it and credit destination stock.");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm transfer.");
    } finally {
      setBusy(null);
    }
  };

  const cancelRx = async (id: string) => {
    setBusy(id);
    try {
      await requestCancellation({
        data: { username, phone, id, actorName: "Shop Owner", reason: "Cancellation requested from the My Shop portal" },
      });
      toast.success("Cancellation request queued. A paired phone will restore source stock when it applies the request.");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not request transfer cancellation.");
    } finally {
      setBusy(null);
    }
  };

  const branchesForSelect = branches.length > 0 ? branches : result.records?.branches.map((b) => ({
    id: b.id,
    name: b.name,
  })) ?? [];
  const branchOptions = branchesForSelect.map((b) => ({ id: b.id, name: b.name }));
  const productOptions = (result.records?.products ?? [])
    .map((p) => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? "Unnamed product"),
      branchId: String(p.branchId ?? ""),
    }))
    .filter((p) => p.id && p.name);
  const selectedProduct = productOptions.find((p) => p.id === tf.productId);
  const sourceBranchOptions = selectedProduct?.branchId
    ? branchOptions.filter((b) => b.id === selectedProduct.branchId || (selectedProduct.branchId === "main_branch" && b.id === "main_branch"))
    : branchOptions;

  return (
    <div className="space-y-6">
      {/* Branches list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Branches ({branches.length})</h4>
          {editing ? (
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Cancel edit
            </Button>
          ) : null}
        </div>
        {branches.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface/50 p-4 text-sm text-muted-foreground">
            No branches yet. Create your first branch below; it will sync to your phone automatically.
          </p>
        ) : (
          <div className="max-h-[320px] overflow-auto rounded-2xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Code</th>
                  <th className="p-3">Manager</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Stock Value</th>
                  <th className="p-3">Products</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {branches.map((b) => (
                  <tr key={b.id} className="hover:bg-surface/50">
                    <td className="p-3 font-medium">
                      {b.name}
                      {b.is_main_branch ? <Badge variant="info" className="ml-2 text-[10px]">HQ</Badge> : null}
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">{b.code || "—"}</td>
                    <td className="p-3 text-muted-foreground">{b.manager_name || "—"}</td>
                    <td className="p-3">
                      <Badge variant={b.operational_status === "OPEN" ? "success" : b.operational_status === "SUSPENDED" ? "danger" : "muted"} className="text-[10px]">
                        {b.operational_status}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono">{formatRwf(b.stock_value_rwf)}</td>
                    <td className="p-3 font-mono">{b.product_count}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(b)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy === b.id} onClick={() => removeBranch(b.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Branch form */}
      <div className="grid gap-4 rounded-2xl border border-border bg-surface-2 p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Branch name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kimironko Branch" />
        </div>
        <div className="space-y-2">
          <Label>Code</Label>
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="BR-02" />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input value={form.phoneBranch} onChange={(e) => setForm({ ...form, phoneBranch: e.target.value })} placeholder="0788 000 000" />
        </div>
        <div className="space-y-2">
          <Label>Manager</Label>
          <Input value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} placeholder="Manager name" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Address</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Kigali, Rwanda" />
        </div>
        <div className="space-y-2">
          <Label>Operational status</Label>
          <Select value={form.operationalStatus} onValueChange={(v) => setForm({ ...form, operationalStatus: v as typeof form.operationalStatus })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">OPEN</SelectItem>
              <SelectItem value="CLOSED">CLOSED</SelectItem>
              <SelectItem value="SUSPENDED">SUSPENDED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Daily sales target (RWF)</Label>
          <Input type="number" min={0} value={form.dailySalesTargetRwf} onChange={(e) => setForm({ ...form, dailySalesTargetRwf: Number(e.target.value) || 0 })} />
        </div>
        <div className="space-y-2">
          <Label>Monthly target (RWF)</Label>
          <Input type="number" min={0} value={form.monthlyTargetRwf} onChange={(e) => setForm({ ...form, monthlyTargetRwf: Number(e.target.value) || 0 })} />
        </div>
        <div className="space-y-2">
          <Label>Opening cash float (RWF)</Label>
          <Input type="number" min={0} value={form.openingCashFloat} onChange={(e) => setForm({ ...form, openingCashFloat: Number(e.target.value) || 0 })} />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="branch@shop.rw" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Notes</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            id="is-main"
            type="checkbox"
            checked={form.isMainBranch}
            onChange={(e) => setForm({ ...form, isMainBranch: e.target.checked })}
            className="size-4 accent-primary"
          />
          <Label htmlFor="is-main">This is the main/head office branch</Label>
        </div>
        <div className="sm:col-span-2">
          <Button variant="hero" disabled={busy === "branch"} onClick={saveBranch}>
            {busy === "branch" ? <Loader2 className="animate-spin" /> : <Plus />}
            {editing ? "Save changes" : "Create branch"}
          </Button>
        </div>
      </div>

      {/* Stock transfers */}
      <div className="space-y-3">
        <h4 className="font-semibold">Stock Transfers ({transfers.length})</h4>
        <div className="grid gap-4 rounded-2xl border border-border bg-surface-2 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Product from synced inventory</Label>
            <Select value={tf.productId} onValueChange={(value) => setTf({ ...tf, productId: value, fromBranchId: "" })}>
              <SelectTrigger><SelectValue placeholder="Choose a synced product" /></SelectTrigger>
              <SelectContent>
                {productOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {productOptions.length === 0 ? <p className="text-xs text-muted-foreground">Sync the Android inventory first. Product names cannot be entered as free text for a stock transfer.</p> : null}
          </div>
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input type="number" min={0} value={tf.quantity} onChange={(e) => setTf({ ...tf, quantity: Number(e.target.value) || 0 })} />
          </div>
          <div className="space-y-2">
            <Label>From branch</Label>
            <Select value={tf.fromBranchId} onValueChange={(v) => setTf({ ...tf, fromBranchId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {sourceBranchOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>To branch</Label>
            <Select value={tf.toBranchId} onValueChange={(v) => setTf({ ...tf, toBranchId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                {branchOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Notes</Label>
            <Input value={tf.notes} onChange={(e) => setTf({ ...tf, notes: e.target.value })} placeholder="Optional" />
          </div>
          <div className="sm:col-span-2">
            <Button variant="hero" disabled={busy === "transfer" || !productOptions.length || !tf.productId}>
              {busy === "transfer" ? <Loader2 className="animate-spin" /> : <Plus />}
              Record transfer
            </Button>
          </div>
        </div>

        {transfers.length > 0 ? (
          <div className="max-h-[320px] overflow-auto rounded-2xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Number</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">From</th>
                  <th className="p-3">To</th>
                  <th className="p-3">Qty</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-surface/50">
                    <td className="p-3 font-mono">{t.transfer_number}</td>
                    <td className="p-3 font-medium">{t.product_name}</td>
                    <td className="p-3 text-muted-foreground">{t.from_branch_name}</td>
                    <td className="p-3 text-muted-foreground">{t.to_branch_name}</td>
                    <td className="p-3 font-mono">{t.quantity} {t.unit}</td>
                    <td className="p-3">
                      <Badge
                        variant={t.status === "COMPLETED" ? "success" : t.status === "REJECTED" ? "danger" : t.status === "CANCELLED" ? "muted" : "warning"}
                        className="text-[10px]"
                      >
                        {t.status}
                      </Badge>
                      {t.status === "REQUESTED" ? <p className="mt-1 text-[10px] text-muted-foreground">Waiting for a paired phone to validate stock</p> : null}
                      {t.status === "RECEIPT_REQUESTED" ? <p className="mt-1 text-[10px] text-muted-foreground">Waiting for the destination phone to confirm receipt</p> : null}
                      {t.status === "CANCEL_REQUESTED" ? <p className="mt-1 text-[10px] text-muted-foreground">Waiting for a paired phone to restore source stock</p> : null}
                      {t.status === "REJECTED" && t.notes ? <p className="mt-1 max-w-[220px] text-[10px] text-destructive">{String(t.notes)}</p> : null}
                    </td>
                    <td className="p-3 text-right">
                      {t.status === "IN_TRANSIT" ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="ghost" size="sm" disabled={busy === t.id} onClick={() => confirmRx(t.id)}>
                            <Check /> Request receipt
                          </Button>
                          <Button variant="ghost" size="sm" disabled={busy === t.id} onClick={() => cancelRx(t.id)}>
                            <Trash2 /> Request cancellation
                          </Button>
                        </div>
                      ) : null}
                      {t.status === "RECEIPT_REQUESTED" || t.status === "CANCEL_REQUESTED" ? <span className="text-muted-foreground">Awaiting mobile processing</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-2xl border border-border bg-surface/50 p-4 text-sm text-muted-foreground">
            No stock transfers yet. Record one above; it will sync to your phone automatically.
          </p>
        )}
      </div>
    </div>
  );
}

function ProofPanel({ initial }: { initial: z.infer<typeof searchSchema> }) {
  const { t } = useI18n();
  const startCheckout = useServerFn(createGatewayCheckout);
  const [f, setF] = useState({
    shopName: "",
    username: "",
    phone: "",
    gateway: "flutterwave" as "flutterwave" | "stripe",
    payerPhone: "",
    payerName: "",
    payerEmail: "",
    months: ([1, 3, 6, 12].includes(Number(initial.m)) ? Number(initial.m) : 1) as 1 | 3 | 6 | 12,
    branches: initial.b ?? 1,
    workers: initial.w ?? 1,
    devices: initial.d ?? 1,
  });
  const [sending, setSending] = useState(false);
  const calc = calculateSubscriptionFee(f.branches, f.workers, f.months, f.devices, 2_000);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const checkout = await startCheckout({ data: f });
      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "The payment provider could not start checkout.");
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
          <Label>Payment gateway</Label>
          <Select value={f.gateway} onValueChange={(v) => set("gateway", v as typeof f.gateway)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="flutterwave">Flutterwave — MTN MoMo, Airtel Money and card</SelectItem>
              <SelectItem value="stripe">Stripe — bank cards (eligible merchant account required)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label="Payer full name" value={f.payerName} onChange={(v) => set("payerName", v)} min={2} max={120} />
        <Field label="Payer phone" value={f.payerPhone} onChange={(v) => set("payerPhone", v)} min={9} max={30} tel />
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="payer-email">Payer email</Label>
          <Input id="payer-email" type="email" value={f.payerEmail} onChange={(e) => set("payerEmail", e.target.value)} required maxLength={254} autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label>{t("calcCycle")}</Label>
          <Select value={String(f.months)} onValueChange={(v) => set("months", Number(v) as typeof f.months)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
          <p className="text-sm font-semibold">Secure hosted checkout</p>
          <p className="mt-2 text-xs text-muted-foreground">
            BeBoss creates your checkout securely on its server. The provider confirms settlement directly to BeBoss; a browser redirect or payment SMS is not treated as proof of payment.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Flutterwave supports RWF card and Rwanda Mobile Money, subject to merchant payment-method activation. Stripe requires an active merchant account in a supported country.
          </p>
        </div>
        <Button type="submit" variant="hero" size="lg" className="mt-auto" disabled={sending}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          Continue to secure payment
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
