import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Check, Copy, Download, KeyRound, Loader2, MessageCircle, Plus, RefreshCw, Undo2, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { approvePaymentWithCode, createWhatsAppPaymentClaim, deletePaymentRequest, directAutoUnlock, reconcileGatewayRefund, rejectPayment, requestGatewayRefund } from "@/lib/admin.functions";
import { configQuery, paymentsQuery, shopsQuery, type PaymentRequest } from "@/lib/admin-queries";
import { buildUnlockReplyText, buildWhatsAppUrl, calculateSubscriptionFee } from "@/lib/pricing";
import { formatDateTime, formatRwf, relativeTime } from "@/lib/format";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  component: PaymentsPage,
});

type Result = { mode: "CODE" | "DIRECT"; code?: string; days: number; tier: string; total: number; shopName: string; username: string; phone: string };
type Status = "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" | "REDEEMED" | "ALL";
type ClaimSource = "ALL" | "APP" | "WEB" | "WHATSAPP";

function PaymentsPage() {
  const { data, isLoading } = useQuery(paymentsQuery);
  const { data: cfg } = useQuery(configQuery);
  const { data: shops } = useQuery(shopsQuery);
  const ctx = useAdminCtx();
  const isAdmin = !!ctx.data?.isAdmin;
  const a = useAdminText();
  const [status, setStatus] = useState<Status>("PENDING_VERIFICATION");
  const [source, setSource] = useState<ClaimSource>("ALL");
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [manual, setManual] = useState({ shopName: "", username: "", ownerPhone: "", provider: "MTN MoMo" as "MTN MoMo" | "Airtel Money", payerPhone: "", payerName: "", paymentTimeMs: Date.now(), paymentNote: "", months: 1, branches: 1, workers: 1, devices: 1 });
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [rejecting, setRejecting] = useState<PaymentRequest | null>(null);
  const [reason, setReason] = useState("");
  const [verifyingPayment, setVerifyingPayment] = useState<PaymentRequest | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentRequest | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [providerVerified, setProviderVerified] = useState(false);
  const [verificationNote, setVerificationNote] = useState("");
  const [approvalMode, setApprovalMode] = useState<"CODE" | "DIRECT">("CODE");
  const approveFn = useServerFn(approvePaymentWithCode);
  const directUnlockFn = useServerFn(directAutoUnlock);
  const approve = useAdminAction(approveFn, { invalidate: [["admin"]] });
  const directUnlock = useAdminAction(directUnlockFn, { invalidate: [["admin"]] });
  const reject = useAdminAction(useServerFn(rejectPayment), { success: "Payment claim rejected", invalidate: [["admin", "payments"]] });
  const remove = useAdminAction(useServerFn(deletePaymentRequest), { success: "Claim removed", invalidate: [["admin", "payments"]] });
  const createManual = useAdminAction(useServerFn(createWhatsAppPaymentClaim), { success: "WhatsApp payment proof added to the review queue", invalidate: [["admin", "payments"], ["admin", "shops"]] });
  const requestRefund = useAdminAction(useServerFn(requestGatewayRefund), { success: a("Refund request sent to the payment provider"), invalidate: [["admin", "payments"]] });
  const refreshRefund = useAdminAction(useServerFn(reconcileGatewayRefund), { success: a("Provider refund status refreshed"), invalidate: [["admin", "payments"]] });

  const rows = data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length };
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);
  const filtered = rows.filter((r) => (status === "ALL" || r.status === status) && (source === "ALL" || (r.source || "APP") === source) && matches(q, r.shop_name, r.owner_username, r.owner_phone, r.payer_phone, r.payer_full_name, r.generated_unlock_code, r.payment_note, r.admin_verification_note));
  const pending = rows.filter((r) => r.status === "PENDING_VERIFICATION");
  const rate = Number(cfg?.per_device_fee_rwf) || 2000;

  const doApprove = (r: PaymentRequest, note: string) => {
    const onFinished = () => {
      setVerifyingPayment(null);
      setProviderVerified(false);
      setVerificationNote("");
      setApprovalMode("CODE");
    };
    if (approvalMode === "DIRECT") {
      directUnlock.mutate(
        { requestId: r.id, providerVerified: true, verificationNote: note },
        {
          onSuccess: (res) => {
            onFinished();
            setResult({
              mode: "DIRECT",
              days: res.days,
              tier: res.tier,
              total: res.total,
              shopName: res.shopName,
              username: res.username,
              phone: res.phone,
            });
          },
        },
      );
      return;
    }
    approve.mutate(
      { requestId: r.id, providerVerified: true, verificationNote: note },
      {
        onSuccess: (res) => {
          onFinished();
          setResult({
            mode: "CODE",
            code: res.code,
            days: res.days,
            tier: res.tier,
            total: res.total,
            shopName: res.shopName,
            username: res.username,
            phone: res.phone,
          });
        },
      },
    );
  };

  return (
    <div>
      <PageHeader
        title="Payments queue"
        sub="Verify MTN MoMo and Airtel Money claims from the app and website, then unlock shops."
        actions={
          <>
            <Button size="sm" variant="glass" onClick={() => downloadCsv(`beboss-payments-${Date.now()}.csv`, filtered)}>
              <Download /> {a("Export")}
            </Button>
            {isAdmin && pending.length > 0 ? (
              <span className="text-xs text-muted-foreground">{pending.length} claims require individual provider verification before code issuance.</span>
            ) : null}
          </>
        }
      />
      {isAdmin ? (
        <section className="mb-5 overflow-hidden rounded-2xl border border-border bg-card">
          <button
            type="button"
            className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/40"
            aria-expanded={manualOpen}
            onClick={() => setManualOpen((open) => !open)}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Plus className="size-4 text-primary" />
              {a("Add WhatsApp payment proof manually")}
            </span>
            <span className="text-xs text-muted-foreground">{a("For proofs received directly from a customer on WhatsApp")}</span>
          </button>
          {manualOpen ? (
            <form
              className="grid gap-4 border-t border-border p-5"
              onSubmit={(event) => {
                event.preventDefault();
                createManual.mutate(manual, {
                  onSuccess: () => {
                    setManual({ shopName: "", username: "", ownerPhone: "", provider: "MTN MoMo", payerPhone: "", payerName: "", paymentTimeMs: Date.now(), paymentNote: "", months: 1, branches: 1, workers: 1, devices: 1 });
                    setSelectedShopId("");
                    setManualOpen(false);
                  },
                });
              }}
            >
              <div className="space-y-1.5">
                <Label>{a("Select a registered shop (optional)")}</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedShopId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setSelectedShopId(id);
                    const shop = (shops ?? []).find((item) => item.id === id);
                    if (shop) {
                      setManual((current) => ({
                        ...current,
                        shopName: shop.shop_name,
                        username: shop.owner_username,
                        ownerPhone: shop.owner_phone,
                        branches: Math.max(1, shop.branch_count),
                        workers: Math.max(1, shop.worker_count),
                        devices: Math.max(1, shop.device_limit),
                      }));
                    }
                  }}
                >
                  <option value="">{a("Choose an existing shop to fill owner and plan details")}</option>
                  {(shops ?? []).map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.shop_name} — @{shop.owner_username}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{a("You can still enter a new or not-yet-synced shop manually below.")}</p>
              </div>
              <p className="text-sm text-muted-foreground">{a("Enter the customer's registered BeBoss shop, payer details, payment date/time and plan shown in the WhatsApp proof. The claim enters the same queue as Android and website submissions; verify payment against the provider statement before issuing a code.")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ManualField label="Shop name" value={manual.shopName} onChange={(shopName) => setManual({ ...manual, shopName })} required />
                <ManualField label="Registered owner username" value={manual.username} onChange={(username) => setManual({ ...manual, username })} required />
                <ManualField label="Registered owner phone" value={manual.ownerPhone} onChange={(ownerPhone) => setManual({ ...manual, ownerPhone })} required />
                <div className="space-y-1.5">
                  <Label>{a("Payment provider")}</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={manual.provider}
                    onChange={(event) => setManual({ ...manual, provider: event.target.value as "MTN MoMo" | "Airtel Money" })}
                  >
                    <option value="MTN MoMo">MTN MoMo</option>
                    <option value="Airtel Money">Airtel Money</option>
                  </select>
                </div>
                <ManualField label="Payer full name" value={manual.payerName} onChange={(payerName) => setManual({ ...manual, payerName })} required />
                <ManualField label="Payer phone" value={manual.payerPhone} onChange={(payerPhone) => setManual({ ...manual, payerPhone })} required />
                <div className="space-y-1.5"><Label>Payment date and time</Label><Input type="datetime-local" value={new Date(manual.paymentTimeMs - new Date(manual.paymentTimeMs).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} onChange={(event) => setManual({ ...manual, paymentTimeMs: event.target.value ? new Date(event.target.value).getTime() : Date.now() })} required /></div><ManualField label="Payment note (optional)" value={manual.paymentNote} onChange={(paymentNote) => setManual({ ...manual, paymentNote })} />
                <div className="space-y-1.5">
                  <Label>{a("Duration")}</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={manual.months}
                    onChange={(event) => setManual({ ...manual, months: Number(event.target.value) })}
                  >
                    <option value={1}>{a("1 month")}</option>
                    <option value={3}>{a("3 months")}</option>
                    <option value={6}>{a("6 months")}</option>
                    <option value={12}>{a("12 months")}</option>
                  </select>
                </div>
                {(["branches", "workers", "devices"] as const).map((field) => (
                  <div key={field} className="space-y-1.5">
                    <Label>{a(field === "workers" ? "Staff count" : field === "devices" ? "Device count" : "Branch count")}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={field === "workers" ? 500 : 100}
                      value={manual[field]}
                      onChange={(event) => setManual({ ...manual, [field]: Math.max(1, Math.min(field === "workers" ? 500 : 100, Number(event.target.value) || 1)) })}
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">{a("Amount to verify against the provider statement")}</p>
                  <p className="font-display text-2xl font-bold">{formatRwf(calculateSubscriptionFee(manual.branches, manual.workers, manual.months, manual.devices, Number(cfg?.per_device_fee_rwf) || 2000).total)}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setManualOpen(false)}>{a("Cancel")}</Button>
                  <Button type="submit" variant="hero" disabled={createManual.isPending}>
                    {createManual.isPending ? <Loader2 className="animate-spin" /> : <Plus />} {a("Add to payment review queue")}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search shop, @username, phone, payer, payment note…" />
        <FilterChips<Status>
          value={status}
          onChange={setStatus}
          options={[
            { value: "PENDING_VERIFICATION", label: "Pending", count: counts["PENDING_VERIFICATION"] ?? 0 },
            { value: "APPROVED", label: "Approved", count: counts["APPROVED"] ?? 0 },
            { value: "REDEEMED", label: "Redeemed", count: counts["REDEEMED"] ?? 0 },
            { value: "REJECTED", label: "Rejected", count: counts["REJECTED"] ?? 0 },
            { value: "ALL", label: "All", count: counts["ALL"] ?? 0 },
          ]}
        />
        <FilterChips<ClaimSource>
          value={source}
          onChange={setSource}
          options={[
            { value: "ALL", label: "All sources" },
            { value: "APP", label: "Android app", count: rows.filter((r) => !r.source || r.source === "APP").length },
            { value: "WEB", label: "Website", count: rows.filter((r) => r.source === "WEB").length },
            { value: "WHATSAPP", label: "WhatsApp", count: rows.filter((r) => r.source === "WHATSAPP").length },
          ]}
        />
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : !filtered.length ? (
        <EmptyState title="No payment claims here" sub="Claims submitted from the BeBoss app (Settings → License) or the website's My shop page appear instantly." />
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => {
            const calc = calculateSubscriptionFee(r.branch_count, r.worker_count, r.duration_months, r.device_count, Number(r.fee_per_device_rwf) > 0 ? r.fee_per_device_rwf : rate);
            const busy = (approve.isPending && approve.variables?.requestId === r.id);
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{r.shop_name}</h3>
                      <span className="text-sm text-muted-foreground">@{r.owner_username}</span>
                      <StatusBadge status={r.status} />
                      {r.source === "WHATSAPP" ? <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">{a("WhatsApp / manual")}</span> : r.source === "WEB" ? <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{a("Website")}</span> : <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{a("Android app")}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submitted {relativeTime(r.created_at)} • {formatDateTime(r.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl font-bold">{formatRwf(r.amount_rwf)}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.duration_months} mo • {calc.tier} • +{calc.days}d
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <Info label="Provider" value={r.provider} sub={r.gateway_provider ? r.gateway_provider.replaceAll("_", " ") : undefined} />
                  <Info label="Payer" value={r.payer_full_name || "—"} sub={r.payer_phone} />
                  <Info label="Payment time" value={formatDateTime(r.payment_time_ms || r.created_at)} />
                  <Info label="Registered owner phone" value={r.owner_phone} mono />
                  <Info label="Plan" value={`${r.duration_months} mo • ${r.branch_count} br • ${r.worker_count} staff • ${r.device_count} dev`} />
                </dl>
                {r.gateway_provider ? (
                  <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Verified gateway settlement</p>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <Info label="Provider state" value={r.gateway_status.replaceAll("_", " ")} />
                      <Info label="Verified amount" value={r.gateway_verified_at > 0 ? formatRwf(r.gateway_verified_amount_rwf) : "Not verified"} />
                      <Info label="Currency" value={r.gateway_verified_currency || "—"} />
                      <Info label="Provider transaction" value={r.gateway_transaction_id || "—"} mono />
                      <Info label="Provider reference" value={r.gateway_reference || "—"} mono />
                      <Info label="Verified at" value={r.gateway_verified_at > 0 ? formatDateTime(r.gateway_verified_at) : "—"} />
                      <Info label="Refunded to date" value={formatRwf(r.gateway_refunded_amount_rwf || 0)} />
                      <Info label="Refund state" value={(r.gateway_refund_status || "NONE").replaceAll("_", " ")} />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer MTN MoMo / Airtel Money confirmation SMS</p>
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{r.payment_note?.trim() || "No confirmation SMS was supplied. Check the merchant transaction history directly before approving."}</pre>
                  </div>
                )}
                {r.admin_verification_note ? <p className="mt-2 text-xs text-muted-foreground">Admin verification: {r.admin_verification_note}</p> : null}
                {r.amount_rwf !== calc.total ? (
                  <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    {a("Submitted plan amount")} {formatRwf(calc.total)} — {a("must match the provider statement before approval.")}
                  </p>
                ) : null}
                {r.generated_unlock_code ? <p className="mt-3 font-mono text-sm text-success">{r.generated_unlock_code}</p> : null}
                {r.approval_mode === "DIRECT_AUTO_UNLOCK" ? <p className="mt-3 text-sm text-success">{a("Direct auto-unlock — no code needed")}</p> : null}
                {r.rejection_reason ? <p className="mt-3 text-sm text-destructive">{a("Rejected:")} {r.rejection_reason}</p> : null}
                {r.verified_by_admin ? <p className="mt-1 text-xs text-muted-foreground">{a("By")} {r.verified_by_admin}</p> : null}

                {isAdmin ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                    {r.status === "PENDING_VERIFICATION" || r.status === "REJECTED" ? (
                      <>
                        <Button size="sm" variant="success" disabled={busy} onClick={() => {
                            const verifiedGateway = Boolean(r.gateway_provider) &&
                              r.gateway_status === "VERIFIED" &&
                              Number(r.gateway_verified_at) > 0 &&
                              Number(r.gateway_verified_amount_rwf) === Number(r.amount_rwf) &&
                              String(r.gateway_verified_currency).toUpperCase() === "RWF" &&
                              Boolean(r.gateway_transaction_id);
                            setVerifyingPayment(r);
                            setProviderVerified(verifiedGateway);
                            setVerificationNote(verifiedGateway
                              ? `Provider verified: ${r.gateway_provider} transaction ${r.gateway_transaction_id}`
                              : "");
                          }}>
                          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} {a("Review SMS & verify payment")}
                        </Button>

                        {r.status === "PENDING_VERIFICATION" ? (
                          <Button size="sm" variant="ghost" onClick={() => { setRejecting(r); setReason(""); }}>
                            <X /> {a("Reject")}
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {r.status === "APPROVED" && r.generated_unlock_code ? (
                      <Button size="sm" variant="glass" asChild>
                        <a href={buildWhatsAppUrl(r.payer_phone || r.owner_phone, buildUnlockReplyText(r.shop_name, r.owner_username, r.generated_unlock_code, calc.days, calc.tier))} target="_blank" rel="noreferrer">
                          <MessageCircle /> {a("Resend on WhatsApp")}
                        </a>
                      </Button>
                    ) : null}
                    {r.gateway_provider && r.gateway_status === "VERIFIED" &&
                      Number(r.gateway_verified_amount_rwf) > Number(r.gateway_refunded_amount_rwf || 0) &&
                      r.gateway_refund_status !== "PENDING" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={requestRefund.isPending || refreshRefund.isPending}
                        onClick={() => {
                          setRefundTarget(r);
                          setRefundAmount(String(
                            Number(r.gateway_verified_amount_rwf) - Number(r.gateway_refunded_amount_rwf || 0)
                          ));
                          setRefundReason("");
                        }}
                      >
                        <Undo2 /> {a("Request refund")}
                      </Button>
                    ) : null}
                    {r.gateway_latest_refund_id && r.gateway_refund_status === "PENDING" ? (
                      <Button
                        size="sm"
                        variant="glass"
                        disabled={refreshRefund.isPending}
                        onClick={() => refreshRefund.mutate({ refundId: r.gateway_latest_refund_id! })}
                      >
                        {refreshRefund.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        {a("Refresh refund status")}
                      </Button>
                    ) : null}
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground">
                          <Trash2 />
                        </Button>
                      }
                      title={a("Delete this payment claim?")}
                      description={a("This removes the claim from the queue permanently. Issued codes are not affected.")}
                      destructive
                      confirmLabel="Delete"
                      onConfirm={() => remove.mutate({ requestId: r.id })}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!refundTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRefundTarget(null);
            setRefundAmount("");
            setRefundReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{a("Request provider refund")}</DialogTitle>
            <DialogDescription>
              {refundTarget?.shop_name} — {a("original verified payment")} {formatRwf(refundTarget?.gateway_verified_amount_rwf ?? 0)}.
              {a("Refunds are asynchronous. A request being accepted does not mean the funds have reached the customer.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-xl bg-muted/30 p-3 text-sm">
            <p>Provider: {refundTarget?.gateway_provider?.replaceAll("_", " ")}</p>
            <p>{a("Already refunded:")} {formatRwf(refundTarget?.gateway_refunded_amount_rwf ?? 0)}</p>
            <p>{a("Maximum remaining:")} {formatRwf(Math.max(
              0,
              Number(refundTarget?.gateway_verified_amount_rwf ?? 0) - Number(refundTarget?.gateway_refunded_amount_rwf ?? 0)
            ))}</p>
          </div>
          <div className="space-y-2">
            <Label>{a("Refund amount (RWF)")}</Label>
            <Input
              type="number"
              min={1}
              max={Math.max(0, Number(refundTarget?.gateway_verified_amount_rwf ?? 0) - Number(refundTarget?.gateway_refunded_amount_rwf ?? 0))}
              step={1}
              value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{a("Refund reason")}</Label>
            <Textarea value={refundReason} onChange={(event) => setRefundReason(event.target.value)} minLength={5} maxLength={500} rows={3} required />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundTarget(null)}>{a("Cancel")}</Button>
            <Button
              variant="destructive"
              disabled={
                requestRefund.isPending ||
                !Number.isSafeInteger(Number(refundAmount)) ||
                Number(refundAmount) <= 0 ||
                Number(refundAmount) > Math.max(0, Number(refundTarget?.gateway_verified_amount_rwf ?? 0) - Number(refundTarget?.gateway_refunded_amount_rwf ?? 0)) ||
                refundReason.trim().length < 5
              }
              onClick={() => {
                if (!refundTarget) return;
                requestRefund.mutate(
                  {
                    paymentRequestId: refundTarget.id,
                    amountRwf: Number(refundAmount),
                    reason: refundReason.trim(),
                    idempotencyKey: crypto.randomUUID(),
                  },
                  {
                    onSuccess: () => {
                      setRefundTarget(null);
                      setRefundAmount("");
                      setRefundReason("");
                    },
                  },
                );
              }}
            >
              {requestRefund.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
              {a("Initiate refund")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{a("Reject payment claim")}</DialogTitle>
            <DialogDescription>
              {rejecting?.shop_name} — {formatRwf(rejecting?.amount_rwf)}. {a("The owner sees this reason in the app and on the website.")}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={a("MoMo transaction could not be confirmed")} maxLength={500} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reject.isPending}
              onClick={() => rejecting && reject.mutate({ requestId: rejecting.id, reason }, { onSuccess: () => setRejecting(null) })}
            >
              Reject claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!verifyingPayment} onOpenChange={(open) => { if (!open) { setVerifyingPayment(null); setProviderVerified(false); setVerificationNote(""); } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Verify {verifyingPayment?.provider} payment</DialogTitle>
            <DialogDescription>
              {verifyingPayment?.gateway_provider
                ? "BeBoss verifies hosted gateway payments using the signed provider event and a separate provider API/session check. Review the verified amount and registered shop identity before activating the subscription."
                : "Review the customer's SMS, then independently confirm the funds in the official provider merchant transaction history or balance before issuing a BB3 code."}
            </DialogDescription>
          </DialogHeader>
          {verifyingPayment?.gateway_provider ? (
            <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm">
              <p className="font-semibold text-success">{a("Server-verified provider settlement")}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <p>{a("Provider:")} {verifyingPayment.gateway_provider.replaceAll("_", " ")}</p>
                <p>{a("Amount:")} {formatRwf(verifyingPayment.gateway_verified_amount_rwf)} {verifyingPayment.gateway_verified_currency}</p>
                <p className="break-all">{a("Transaction:")} {verifyingPayment.gateway_transaction_id}</p>
                <p>{a("Verified:")} {formatDateTime(verifyingPayment.gateway_verified_at)}</p>
              </div>
            </div>
          ) : (
            <div className="max-h-56 overflow-auto rounded-xl border border-border bg-muted/30 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer-submitted confirmation SMS</p>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm">{verifyingPayment?.payment_note?.trim() || "No SMS was submitted. Do not approve from a claim alone; verify the incoming transaction directly in your merchant account."}</pre>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/30 p-3 text-sm">
            <p><span className="text-muted-foreground">Shop:</span> {verifyingPayment?.shop_name}</p>
            <p><span className="text-muted-foreground">Amount:</span> {formatRwf(verifyingPayment?.amount_rwf ?? 0)}</p>
            <p><span className="text-muted-foreground">Payer:</span> {verifyingPayment?.payer_full_name || "—"}</p>
            <p><span className="text-muted-foreground">Phone:</span> {verifyingPayment?.payer_phone}</p>
          </div>
          <Textarea
            value={verificationNote}
            onChange={(event) => setVerificationNote(event.target.value)}
            rows={3}
            maxLength={500}
            disabled={Boolean(verifyingPayment?.gateway_provider)}
            placeholder="Record what you confirmed in MTN MoMo / Airtel Money merchant history: amount received, sender and time."
          />
          <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 text-sm hover:bg-muted/50">
              <input type="radio" name="approval-mode" className="mt-1 size-4 accent-current" checked={approvalMode === "CODE"} onChange={() => setApprovalMode("CODE")} />
              <span><strong className="block">Issue signed BB3 code</strong><span className="text-xs text-muted-foreground">The owner enters a payment-linked code in the app.</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 text-sm hover:bg-muted/50">
              <input type="radio" name="approval-mode" className="mt-1 size-4 accent-current" checked={approvalMode === "DIRECT"} onChange={() => setApprovalMode("DIRECT")} />
              <span><strong className="block">Unlock shop in cloud</strong><span className="text-xs text-muted-foreground">Activate this registered shop immediately after verification; no code is needed.</span></span>
            </label>
          </div>
          {verifyingPayment?.gateway_provider ? (
            <p className="text-xs text-success">{a("Provider confirmation is server-verified. This action still requires an administrator to check that the payment belongs to the registered BeBoss shop.")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Both options require you to verify the exact payment in the official MTN MoMo / Airtel Money merchant history. A customer SMS or WhatsApp screenshot alone does not confirm settlement.</p>
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                <input type="checkbox" className="mt-1 size-4 accent-current" checked={providerVerified} onChange={(event) => setProviderVerified(event.target.checked)} />
                <span>I independently confirmed that the exact amount was received by BeBoss in the official provider account. The submitted SMS alone is not proof of settlement.</span>
              </label>
            </>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVerifyingPayment(null)}>Cancel</Button>
            <Button
              variant="success"
              disabled={
                (Boolean(verifyingPayment?.gateway_provider)
                  ? !(verifyingPayment?.gateway_status === "VERIFIED" &&
                      Number(verifyingPayment.gateway_verified_at) > 0 &&
                      Number(verifyingPayment.gateway_verified_amount_rwf) === Number(verifyingPayment.amount_rwf) &&
                      String(verifyingPayment.gateway_verified_currency).toUpperCase() === "RWF" &&
                      Boolean(verifyingPayment.gateway_transaction_id))
                  : !providerVerified || verificationNote.trim().length < 5) ||
                approve.isPending || directUnlock.isPending
              }
              onClick={() => verifyingPayment && doApprove(verifyingPayment, verificationNote.trim())}
            >
              {(approve.isPending || directUnlock.isPending) ? <Loader2 className="animate-spin" /> : <KeyRound />}
              {approvalMode === "DIRECT" ? "Verify payment & unlock shop" : "Confirm payment & issue BB3"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ResultDialog result={result} onClose={() => setResult(null)} />
    </div>
  );
}

function ManualField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  const a = useAdminText();
  return (
    <div className="space-y-1.5">
      <Label>{a(label)}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} required={required} maxLength={label.includes("reference") ? 60 : 120} />
    </div>
  );
}

function ResultDialog({ result, onClose }: { result: Result | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const a = useAdminText();
  if (!result) return null;
  const msg = result.mode === "CODE"
    ? buildUnlockReplyText(result.shopName, result.username, result.code ?? "", result.days, result.tier)
    : `✅ BeBoss shop activation confirmed. Shop: ${result.shopName} (@${result.username}). Your subscription is active in BeBoss Cloud for +${result.days} days. No unlock code is required. Open BeBoss while connected to the internet and tap Sync to receive the activation.`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result.mode === "DIRECT" ? "Shop unlocked in cloud" : a("Unlock code issued")}</DialogTitle>
          <DialogDescription>
            {result.shopName} (@{result.username}) • +{result.days} days • {formatRwf(result.total)}
          </DialogDescription>
        </DialogHeader>
        {result.mode === "CODE" ? (
          <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-center">
            <p className="break-all font-mono text-lg font-semibold text-success">{result.code}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-success">
            <p className="font-semibold">Cloud license activated successfully.</p>
            <p className="mt-1">The shop does not need an unlock code. The owner should connect the Android terminal to the internet and run Sync to receive the new subscription status.</p>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          {result.mode === "CODE" ? (
            <Button
              variant="glass"
              onClick={async () => {
                await navigator.clipboard.writeText(result.code ?? "");
                setCopied(true);
              }}
            >
              {copied ? <Check className="text-success" /> : <Copy />} {a("Copy code")}
            </Button>
          ) : null}
          <Button variant="success" asChild>
            <a href={buildWhatsAppUrl(result.phone, msg)} target="_blank" rel="noreferrer">
              <MessageCircle /> {a("Send on WhatsApp")}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  const a = useAdminText();
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{a(label)}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value}</dd>
      {sub ? <dd className="font-mono text-xs text-muted-foreground">{sub}</dd> : null}
    </div>
  );
}
