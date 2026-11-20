import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Download, KeyRound, Loader2, MessageCircle, Trash2, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { approvePaymentWithCode, deletePaymentRequest, directAutoUnlock, rejectPayment } from "@/lib/admin.functions";
import { configQuery, paymentsQuery, type PaymentRequest } from "@/lib/admin-queries";
import { buildDirectUnlockReplyText, buildUnlockReplyText, buildWhatsAppUrl, calculateSubscriptionFee } from "@/lib/pricing";
import { formatDateTime, formatRwf, relativeTime } from "@/lib/format";
import { useAdminCtx } from "@/hooks/use-admin-ctx";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  component: PaymentsPage,
});

type Result = { mode: "CODE" | "DIRECT"; code?: string; days: number; tier: string; total: number; shopName: string; username: string; phone: string };
type Status = "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" | "REDEEMED" | "ALL";

function PaymentsPage() {
  const { data, isLoading } = useQuery(paymentsQuery);
  const { data: cfg } = useQuery(configQuery);
  const ctx = useAdminCtx();
  const qc = useQueryClient();
  const isAdmin = !!ctx.data?.isAdmin;
  const [status, setStatus] = useState<Status>("PENDING_VERIFICATION");
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

  const rows = data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length };
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);
  const filtered = rows.filter((r) => (status === "ALL" || r.status === status) && matches(q, r.shop_name, r.owner_username, r.owner_phone, r.payer_phone, r.payer_full_name, r.telco_reference, r.generated_unlock_code));
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
              <Download /> Export
            </Button>
            {isAdmin && pending.length > 1 ? (
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="hero" disabled={batching}>
                    {batching ? <Loader2 className="animate-spin" /> : <KeyRound />} Approve all {pending.length}
                  </Button>
                }
                title={`Approve ${pending.length} pending claims?`}
                description="Each claim gets a signed BB2 unlock code and its shop is extended. Only do this after confirming every transaction in your MoMo/Airtel statement."
                confirmLabel="Approve all"
                onConfirm={batch}
              />
            ) : null}
          </>
        }
      />
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
                      {r.source === "WEB" ? <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">via website</span> : null}
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
                  <Info label="Transaction ref" value={r.telco_reference || "—"} mono />
                  <Info label="Registered phone" value={r.owner_phone} mono />
                  <Info label="Plan" value={`${r.branch_count} br • ${r.worker_count} staff • ${r.device_count} dev`} />
                </dl>
                {r.amount_rwf !== calc.total ? (
                  <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    Current pricing for this plan is {formatRwf(calc.total)} — approving will record that amount.
                  </p>
                ) : null}
                {r.generated_unlock_code ? <p className="mt-3 font-mono text-sm text-success">{r.generated_unlock_code}</p> : null}
                {r.approval_mode === "DIRECT_AUTO_UNLOCK" ? <p className="mt-3 text-sm text-success">Direct auto-unlock — no code needed</p> : null}
                {r.rejection_reason ? <p className="mt-3 text-sm text-destructive">Rejected: {r.rejection_reason}</p> : null}
                {r.verified_by_admin ? <p className="mt-1 text-xs text-muted-foreground">By {r.verified_by_admin}</p> : null}

                {isAdmin ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                    {r.status === "PENDING_VERIFICATION" || r.status === "REJECTED" ? (
                      <>
                        <Button size="sm" variant="success" disabled={busy} onClick={() => doApprove(r)}>
                          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Verify & issue BB2 code
                        </Button>
                        <Button size="sm" variant="soft" disabled={busy} onClick={() => doDirect(r)}>
                          <Zap /> Direct auto-unlock
                        </Button>
                        {r.status === "PENDING_VERIFICATION" ? (
                          <Button size="sm" variant="ghost" onClick={() => { setRejecting(r); setReason(""); }}>
                            <X /> Reject
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {r.status === "APPROVED" && r.generated_unlock_code ? (
                      <Button size="sm" variant="glass" asChild>
                        <a href={buildWhatsAppUrl(r.payer_phone || r.owner_phone, buildUnlockReplyText(r.shop_name, r.owner_username, r.generated_unlock_code, calc.days, calc.tier))} target="_blank" rel="noreferrer">
                          <MessageCircle /> Resend on WhatsApp
                        </a>
                      </Button>
                    ) : null}
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground">
                          <Trash2 />
                        </Button>
                      }
                      title="Delete this payment claim?"
                      description="This removes the claim from the queue permanently. Issued codes are not affected."
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
            <DialogTitle>Reject payment claim</DialogTitle>
            <DialogDescription>
              {rejecting?.shop_name} — {formatRwf(rejecting?.amount_rwf)} ref {rejecting?.telco_reference || "—"}. The owner sees this reason in the app and on the website.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="MoMo transaction could not be confirmed" maxLength={500} />
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

function ResultDialog({ result, onClose }: { result: Result | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!result) return null;
  const msg = result.mode === "CODE" && result.code ? buildUnlockReplyText(result.shopName, result.username, result.code, result.days, result.tier) : buildDirectUnlockReplyText(result.shopName, result.username, result.days, result.tier);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result.mode === "CODE" ? "Unlock code issued" : "Shop auto-unlocked"}</DialogTitle>
          <DialogDescription>
            {result.shopName} (@{result.username}) • +{result.days} days • {formatRwf(result.total)}
          </DialogDescription>
        </DialogHeader>
        {result.code ? (
          <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-center">
            <p className="break-all font-mono text-lg font-semibold text-success">{result.code}</p>
          </div>
        ) : (
          <p className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-success">The app unlocks automatically on its next sync — no code needed.</p>
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
              <MessageCircle /> Send on WhatsApp
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value}</dd>
      {sub ? <dd className="font-mono text-xs text-muted-foreground">{sub}</dd> : null}
    </div>
  );
}
