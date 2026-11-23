import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { ArrowLeft, Ban, CalendarPlus, KeyRound, MessageCircle, Power, RotateCcw, Save, ShieldOff, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmAction, EmptyState, LoadingBlock, StatCard, StatusBadge, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { deleteShop, extendShop, resetShopTrial, setShopStatus, updateShopControls, updateShopLimits } from "@/lib/admin.functions";
import { codesQuery, configQuery, devicesQuery, paymentsQuery, shopsQuery, snapshotsQuery, syncEventsQuery, usersQuery } from "@/lib/admin-queries";
import { FLAG_LABEL, deviceHealth, licenseFlags } from "@/lib/sync-health";
import { buildWhatsAppUrl, calculateSubscriptionFee, computeShopKey, effectiveShopStatus } from "@/lib/pricing";
import { daysLeft, formatDateTime, formatRwf, relativeTime } from "@/lib/format";
import { RetailInsights } from "@/components/admin/RetailInsights";
import { ShopRecords } from "@/components/admin/ShopRecords";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/shops/$shopId")({
  component: ShopDetail,
});

function ShopDetail() {
  const a = useAdminText();
  const { shopId } = Route.useParams();
  const navigate = useNavigate();
  const ctx = useAdminCtx();
  const isAdmin = !!ctx.data?.isAdmin;
  const shops = useQuery(shopsQuery);
  const devices = useQuery(devicesQuery);
  const users = useQuery(usersQuery);
  const pays = useQuery(paymentsQuery);
  const codes = useQuery(codesQuery);
  const snaps = useQuery(snapshotsQuery);
  const { data: cfg } = useQuery(configQuery);
  const events = useQuery(syncEventsQuery);
  const shop = (shops.data ?? []).find((s) => s.id === shopId);

  const inv = [["admin", "shops"]] as const;
  const extend = useAdminAction(useServerFn(extendShop), { success: "License extended", invalidate: inv });
  const trial = useAdminAction(useServerFn(resetShopTrial), { success: "4-day trial reset", invalidate: inv });
  const status = useAdminAction(useServerFn(setShopStatus), { success: "Status updated", invalidate: inv });
  const limits = useAdminAction(useServerFn(updateShopLimits), { success: (r: { monthly: number }) => `Quotas saved — ${formatRwf(r.monthly)} / month`, invalidate: inv });
  const controls = useAdminAction(useServerFn(updateShopControls), { success: "Remote controls saved", invalidate: inv });
  const del = useAdminAction(useServerFn(deleteShop), { success: "Shop deleted", invalidate: [["admin"]] });

  const [q, setQ] = useState({ branches: 1, workers: 1, devices: 1 });
  const [c, setC] = useState({ killSwitch: false, minAppVersion: "2.1.0", notes: "", adminWhatsapp: "" });
  const [custom, setCustom] = useState(30);
  useEffect(() => {
    if (!shop) return;
    setQ({ branches: shop.branch_count, workers: shop.worker_count, devices: shop.device_limit });
    setC({ killSwitch: shop.remote_kill_switch, minAppVersion: shop.min_app_version, notes: shop.admin_notes, adminWhatsapp: shop.admin_whatsapp });
  }, [shop]);

  if (shops.isLoading) return <LoadingBlock />;
  if (!shop) return <EmptyState title="Shop not found" sub="It may have been deleted." />;

  const eff = effectiveShopStatus(shop);
  const dl = daysLeft(shop.subscription_expires_at);
  const calc = calculateSubscriptionFee(q.branches, q.workers, 1, q.devices, Number(cfg?.per_device_fee_rwf) || 2000);
  const shopDevices = (devices.data ?? []).filter((d) => d.shop_sync_key === shopId);
  const shopEvents = (events.data ?? []).filter((e) => e.shop_sync_key === shopId);
  const flags = licenseFlags(shop, codes.data ?? [], pays.data ?? []);
  const shopUsers = (users.data ?? []).filter((u) => u.shop_sync_key === shopId);
  const shopPays = (pays.data ?? []).filter((p) => computeShopKey(p.owner_username, p.owner_phone) === shopId);
  const shopCodes = (codes.data ?? []).filter((x) => computeShopKey(x.shop_username, x.shop_phone) === shopId);
  const shopSnaps = (snaps.data ?? []).filter((s) => s.shop_sync_key === shopId);
  const paid = shopPays.filter((p) => p.status === "APPROVED" || p.status === "REDEEMED").reduce((a, p) => a + p.amount_rwf, 0);

  return (
    <div className="space-y-6">
      <Link to="/admin/shops" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {a("All shops")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{shop.shop_name}</h1>
            <StatusBadge status={eff} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {shop.owner_name || "Owner"} • @{shop.owner_username} • {shop.owner_phone} • <span className="font-mono">{shop.id}</span>
          </p>
        </div>
        <Button variant="glass" size="sm" asChild>
          <a href={buildWhatsAppUrl(shop.owner_phone, `Hello ${shop.owner_name || "@" + shop.owner_username}, this is the BeBoss team about ${shop.shop_name}.`)} target="_blank" rel="noreferrer">
            <MessageCircle /> {a("WhatsApp owner")}
          </a>
        </Button>
      </div>

      {flags.length ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <ShieldOff className="size-4 text-destructive" />
          <span className="font-medium text-destructive">{flags.map((f) => FLAG_LABEL[f]).join(" · ")}</span>
          <span className="text-muted-foreground">
            {flags.includes("UNVERIFIED_PAID") ? a("No approved payment, issued code or direct unlock is on record for this owner. Verify before trusting this license.") : ""}
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Expires" value={formatDateTime(shop.subscription_expires_at)} sub={dl < 0 ? `${-dl} days ago` : `${dl} days left`} tone={dl < 0 ? "danger" : dl <= 7 ? "warning" : "success"} />
        <StatCard label="Monthly fee" value={formatRwf(shop.monthly_fee_rwf)} sub={`${shop.branch_count} branches • ${shop.worker_count} staff`} />
        <StatCard label="Devices" value={`${shopDevices.length} / ${shop.device_limit}`} sub={`${shopDevices.filter((d) => d.is_active).length} active`} />
        <StatCard label="Lifetime paid" value={formatRwf(paid)} sub={`Last sync ${relativeTime(shop.updated_at)}`} tone="brand" />
      </div>

      {isAdmin ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarPlus className="size-4 text-primary" /> License
            </h2>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[4, 30, 90, 365].map((d) => (
                <Button key={d} size="sm" variant="glass" disabled={extend.isPending} onClick={() => extend.mutate({ shopId, days: d, autoUnlock: false })}>
                  +{d}d
                </Button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input type="number" min={1} max={1000} value={custom} onChange={(e) => setCustom(Math.max(1, Number(e.target.value) || 1))} />
              <Button size="sm" variant="soft" onClick={() => extend.mutate({ shopId, days: custom, autoUnlock: false })}>
                Extend
              </Button>
            </div>
            <Button className="mt-3 w-full" size="sm" variant="success" onClick={() => extend.mutate({ shopId, days: 30, autoUnlock: true })}>
              <Zap /> {a("Direct auto-unlock +30d")}
            </Button>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
              <Button size="sm" variant="ghost" onClick={() => trial.mutate({ shopId })}>
                <RotateCcw /> {a("Reset trial")}
              </Button>
              {shop.subscription_status === "SUSPENDED" ? (
                <Button size="sm" variant="ghost" onClick={() => status.mutate({ shopId, status: "ACTIVE" })}>
                  <Power /> {a("Reactivate")}
                </Button>
              ) : (
                <ConfirmAction
                  trigger={
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <Ban /> {a("Suspend")}
                    </Button>
                  }
                  title={`${a("Suspend")} ${shop.shop_name}?`}
                  description="The app locks on its next sync until you reactivate the shop. Local data stays safe on the device."
                  confirmLabel={a("Suspend")}
                  destructive
                  onConfirm={() => status.mutate({ shopId, status: "SUSPENDED" })}
                />
              )}
              <Button size="sm" variant="ghost" onClick={() => status.mutate({ shopId, status: "EXPIRED" })}>
                Mark expired
              </Button>
              <Button size="sm" variant="ghost" onClick={() => status.mutate({ shopId, status: "ACTIVE" })}>
                Mark active
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="size-4 text-primary" /> {a("Quotas & pricing")}
            </h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {(["branches", "workers", "devices"] as const).map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label className="capitalize">{k === "workers" ? "Staff" : k}</Label>
                  <Input type="number" min={1} max={k === "workers" ? 500 : 100} value={q[k]} onChange={(e) => setQ({ ...q, [k]: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
              <Line l="Branch plan" v={formatRwf(calc.branchFee)} />
              <Line l="Staff add-on" v={formatRwf(calc.workerFee)} />
              <Line l="Extra devices" v={formatRwf(calc.deviceFee)} />
              <Line l="New monthly fee" v={formatRwf(calc.monthly)} strong />
            </div>
            <Button className="mt-3 w-full" size="sm" variant="hero" disabled={limits.isPending} onClick={() => limits.mutate({ shopId, ...q })}>
              <Save /> Save quotas
            </Button>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldOff className="size-4 text-primary" /> {a("Remote controls")}
            </h2>
            <div className="mt-4 flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <div>
                <p className="text-sm font-medium">{a("Kill switch")}</p>
                <p className="text-xs text-muted-foreground">{a("Locks every device of this shop on next sync")}</p>
              </div>
              <Switch checked={c.killSwitch} onCheckedChange={(v) => setC({ ...c, killSwitch: v })} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{a("Min app version")}</Label>
                <Input value={c.minAppVersion} onChange={(e) => setC({ ...c, minAppVersion: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{a("Support WhatsApp")}</Label>
                <Input value={c.adminWhatsapp} onChange={(e) => setC({ ...c, adminWhatsapp: e.target.value })} placeholder="2507…" />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label>{a("Private admin notes")}</Label>
              <Textarea rows={3} value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} maxLength={2000} />
            </div>
            <Button className="mt-3 w-full" size="sm" variant="soft" disabled={controls.isPending} onClick={() => controls.mutate({ shopId, ...c })}>
              <Save /> Save controls
            </Button>
          </section>
        </div>
      ) : null}

      <Tabs defaultValue="insights">
        <TabsList className="flex-wrap">
          <TabsTrigger value="insights">{a("Retail insights")}</TabsTrigger>
          <TabsTrigger value="records">{a("Shop records")}</TabsTrigger>
          <TabsTrigger value="devices">Devices ({shopDevices.length})</TabsTrigger>
          <TabsTrigger value="users">Staff ({shopUsers.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({shopPays.length})</TabsTrigger>
          <TabsTrigger value="codes">Codes ({shopCodes.length})</TabsTrigger>
          <TabsTrigger value="sync">Branch sync ({shopSnaps.length})</TabsTrigger>
          <TabsTrigger value="activity">Sync activity ({shopEvents.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="insights">
          <RetailInsights shopId={shopId} />
        </TabsContent>
        <TabsContent value="records">
          <ShopRecords shopId={shopId} shopName={shop.shop_name} />
        </TabsContent>
        <TabsContent value="devices">
          <MiniList empty="No paired devices" rows={shopDevices.map((d) => ({ k: d.id, a: `${d.device_name || d.device_id}${d.is_owner_primary ? " • owner" : ""}${d.is_active ? "" : " • deactivated"}`, b: `${d.assigned_user_name || d.assigned_username} • ${d.role} • ${d.branch_name}`, c: deviceHealth(d.last_synced_at), d: `synced ${relativeTime(d.last_synced_at)}` }))} />
        </TabsContent>
        <TabsContent value="users">
          <MiniList empty="No staff synced" rows={shopUsers.map((u) => ({ k: u.id, a: `${u.full_name} (@${u.username})`, b: `${u.role} • ${u.assigned_branch_name} • ${u.phone}`, c: u.is_active ? "ACTIVE" : "SUSPENDED", d: relativeTime(u.updated_at) }))} />
        </TabsContent>
        <TabsContent value="payments">
          <MiniList empty="No payments" rows={shopPays.map((p) => ({ k: p.id, a: `${formatRwf(p.amount_rwf)} • ${p.provider}`, b: `${p.duration_months} mo • ${p.branch_count} branches • ${p.device_count} devices`, c: p.status, d: formatDateTime(p.created_at) }))} />
        </TabsContent>
        <TabsContent value="codes">
          <MiniList empty="No codes" rows={shopCodes.map((x) => ({ k: x.id, a: x.unlock_code, b: `${x.tier_code} • +${x.plan_days}d • ${formatRwf(x.amount_rwf)}`, c: x.status, d: formatDateTime(x.issued_at), mono: true }))} />
        </TabsContent>
        <TabsContent value="activity">
          <MiniList empty="No sync activity recorded yet" rows={shopEvents.map((e) => ({ k: String(e.id), a: `${e.entity.replace("_", " ").toLowerCase()} · ${e.action.replaceAll("_", " ").toLowerCase()}`, b: [e.device_id, e.detail].filter(Boolean).join(" · ") || "—", c: e.actor, d: relativeTime(e.created_at) }))} />
        </TabsContent>
        <TabsContent value="sync">
          <MiniList empty="No branch snapshots" rows={shopSnaps.map((s) => ({ k: s.id, a: s.branch_name, b: s.records_summary || s.device_id, c: "ACTIVE", d: relativeTime(s.updated_at) }))} />
        </TabsContent>
      </Tabs>

      {isAdmin ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <div>
            <h2 className="font-semibold text-destructive">{a("Delete shop")}</h2>
            <p className="text-sm text-muted-foreground">{a("Removes the cloud record with its devices, staff directory and snapshots. Data on the phones is not erased.")}</p>
          </div>
          <ConfirmAction
            trigger={
              <Button variant="destructive" size="sm">
                <Trash2 /> Delete shop
              </Button>
            }
            title={`${a("Delete shop")} ${shop.shop_name}?`}
            description="This cannot be undone. If the app syncs again, the shop will re-register as a new trial."
            destructive
            confirmLabel={a("Delete permanently")}
            onConfirm={() => del.mutate({ shopId, cascade: true }, { onSuccess: () => navigate({ to: "/admin/shops" }) })}
          />
        </section>
      ) : null}
    </div>
  );
}

function Line({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{l}</span>
      <span className={strong ? "font-mono font-semibold text-primary" : "font-mono"}>{v}</span>
    </div>
  );
}

function MiniList({ rows, empty }: { rows: { k: string; a: string; b: string; c: string; d: string; mono?: boolean }[]; empty: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card">
      {rows.map((r) => (
        <div key={r.k} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className={r.mono ? "font-mono text-sm" : "text-sm font-medium"}>{r.a}</p>
            <p className="truncate text-xs text-muted-foreground">{r.b}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{r.d}</span>
            <StatusBadge status={r.c} />
          </div>
        </div>
      ))}
    </div>
  );
}
