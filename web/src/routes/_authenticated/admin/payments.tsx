import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Download, KeyRound, Loader2, MessageCircle, Plus, Trash2, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { approvePaymentWithCode, createWhatsAppPaymentClaim, deletePaymentRequest, directAutoUnlock, rejectPayment } from "@/lib/admin.functions";
import { configQuery, paymentsQuery, type PaymentRequest } from "@/lib/admin-queries";
import { buildDirectUnlockReplyText, buildUnlockReplyText, buildWhatsAppUrl, calculateSubscriptionFee } from "@/lib/pricing";
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
  const ctx = useAdminCtx();
  const qc = useQueryClient();
  const isAdmin = !!ctx.data?.isAdmin;
  const a = useAdminText();
  const [status, setStatus] = useState<Status>("PENDING_VERIFICATION");
  const [source, setSource] = useState<ClaimSource>("ALL");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ shopName: "", username: "", ownerPhone: "", provider: "MTN MoMo" as "MTN MoMo" | "Airtel Money", payerPhone: "", payerName: "", telcoReference: "", months: 1, branches: 1, workers: 1, devices: 1 });
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [rejecting, setRejecting] = useState<PaymentRequest | null>(null);
  const [reason, setReason] = useState("");
  const [batching, setBatching] = useState(false);

  const approveFn = useServerFn(approvePaymentWithCode);
  const directFn = useServerFn(directAutoUnlock);
  const approve = useAdminAction(approveFn, { invalidate: [["admin"]] });
  const direct = useAdminAction(directFn, { invalidate: [["admin"]] });
  const reject = useAdminAction(useServerFn(rejectPayment), { success: "Payment claim rejected", invalidate: [["admin", "payments"]] });
  const remove = useAdminAction(useServerFn(deletePaymentRequest), { success: "Claim removed", invalidate: [["admin", "payments"]] });
  const createManual = useAdminAction(useServerFn(createWhatsAppPaymentClaim), { success: "WhatsApp payment proof added to the review queue", invalidate: [["admin", "payments"], ["admin", "shops"]] });

  const rows = data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length };
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);
  const filtered = rows.filter((r) => (status === "ALL" || r.status === status) && (source === "ALL" || (r.source || "APP") === source) && matches(q, r.shop_name, r.owner_username, r.owner_phone, r.payer_phone, r.payer_full_name, r.telco_reference, r.generated_unlock_code));
  const pending = rows.filter((r) => r.status === "PENDING_VERIFICATION");
  const rate = Number(cfg?.per_device_fee_rwf) || 2000;

  const doApprove = (r: PaymentRequest) =>
    approve.mutate({ requestId: r.id }, {
      onSuccess: (res) => setResult({ mode: "CODE", code: res.code, days: res.days, tier: res.tier, total: res.total, shopName: res.shopName, username: res.username, phone: res.phone }),
    });
  const doDirect = (r: PaymentRequest) =>
    direct.mutate({ requestId: r.id }, { onSuccess: (res) => setResult({ mode: "DIRECT", days: res.days, tier: res.tier, total: res.total, shopName: res.shopName, username: res.username, phone: res.phone }) });

  const batch = async () => {
    setBatching(true);
    let ok = 0;
    for (const r of pending) {
      try {
        await approveFn({ data: { requestId: r.id } });
        ok++;
      } catch (e) {
        toast.error(`${r.shop_name}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setBatching(false);
    await qc.invalidateQueries({ queryKey: ["admin"] });
    toast.success(`Approved ${ok} of ${pending.length} claims`);
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
            {isAdmin && pending.length > 1 ? (
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="hero" disabled={batching}>
                    {batching ? <Loader2 className="animate-spin" /> : <KeyRound />} {a("Approve all")} {pending.length}
                  </Button>
                }
                title={`Approve ${pending.length} pending claims?`}
                description={a("Each claim gets a signed BB3 unlock code and its shop is extended. Only do this after confirming every transaction in your MoMo/Airtel statement.")}
                confirmLabel="Approve all"
                onConfirm={batch}
              />
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
                    setManual({ shopName: "", username: "", ownerPhone: "", provider: "MTN MoMo", payerPhone: "", payerName: "", telcoReference: "", months: 1, branches: 1, workers: 1, devices: 1 });
                    setManualOpen(false);
                  },
                });
              }}
            >
              <p className="text-sm text-muted-foreground">{a("Enter the customer's registered BeBoss shop details and the transaction information shown in the WhatsApp proof. The claim will enter the same queue as Android and website submissions; payment still needs to be verified against the provider statement.")}</p>
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
                <ManualField label="Mobile-money transaction reference" value={manual.telcoReference} onChange={(telcoReference) => setManual({ ...manual, telcoReference: telcoReference.toUpperCase() })} required />
                <div className="space-y-1.5">
                  <Label>{a("Duration")}</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={manual.months}
                    onChange={(event) => setManual({ ...manual, months: Number(event.target.value) })}
                  >
                    <option value={1}>1 month</option>
                    <option value={3}>3 months</option>
                    <option value={6}>6 months</option>
                    <option value={12}>12 months</option>
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
        <SearchInput value={q} onChange={setQ} placeholder="Search shop, @username, phone, payer, reference…" />
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
            const calc = calculateSubscriptionFee(r.branch_count, r.worker_count, r.duration_months, r.device_count, rate);
            const busy = (approve.isPending && approve.variables?.requestId === r.id) || (direct.isPending && direct.variables?.requestId === r.id);
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
                  <Info label="Provider" value={r.provider} />
                  <Info label="Payer" value={r.payer_full_name || "—"} sub={r.payer_phone} />
                  <Info label="Transaction reference" value={r.telco_reference || "—"} mono />
                  <Info label="Registered owner phone" value={r.owner_phone} mono />
                  <Info label="Plan" value={`${r.branch_count} br • ${r.worker_count} staff • ${r.device_count} dev`} />
                </dl>
                {r.amount_rwf !== calc.total ? (
                  <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    {a("Current pricing for this plan is")} {formatRwf(calc.total)} — {a("approving will record that amount.")}
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
                        <Button size="sm" variant="success" disabled={busy} onClick={() => doApprove(r)}>
                          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} {a("Verify & issue BB3 code")}
                        </Button>
                        <Button size="sm" variant="soft" disabled={busy} onClick={() => doDirect(r)}>
                          <Zap /> {a("Direct auto-unlock")}
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

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{a("Reject payment claim")}</DialogTitle>
            <DialogDescription>
              {rejecting?.shop_name} — {formatRwf(rejecting?.amount_rwf)} ref {rejecting?.telco_reference || "—"}. {a("The owner sees this reason in the app and on the website.")}
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
  const msg = result.mode === "CODE" && result.code ? buildUnlockReplyText(result.shopName, result.username, result.code, result.days, result.tier) : buildDirectUnlockReplyText(result.shopName, result.username, result.days, result.tier);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{a(result.mode === "CODE" ? "Unlock code issued" : "Shop auto-unlocked")}</DialogTitle>
          <DialogDescription>
            {result.shopName} (@{result.username}) • +{result.days} days • {formatRwf(result.total)}
          </DialogDescription>
        </DialogHeader>
        {result.code ? (
          <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-center">
            <p className="break-all font-mono text-lg font-semibold text-success">{result.code}</p>
          </div>
        ) : (
          <p className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-success">{a("The app unlocks automatically on its next sync — no code needed.")}</p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          {result.code ? (
            <Button
              variant="glass"
              onClick={async () => {
                await navigator.clipboard.writeText(result.code!);
                setCopied(true);
              }}
            >
              {copied ? <Check className="text-success" /> : <Copy />} Copy code
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
