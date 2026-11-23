import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Ban, Copy, Download, KeyRound, MessageCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, TableShell, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { lookupUnlockCode, revokeCode, type UnlockCodeLookupResult } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { codesQuery } from "@/lib/admin-queries";
import { buildUnlockReplyText, buildWhatsAppUrl } from "@/lib/pricing";
import { formatDateTime, formatRwf } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/codes")({
  component: CodesPage,
});

const DURATIONS = [
  { days: 4, months: 0, label: "4 days" },
  { days: 30, months: 1, label: "30 days" },
  { days: 90, months: 3, label: "90 days" },
  { days: 180, months: 6, label: "180 days" },
  { days: 365, months: 12, label: "365 days" },
];
type Tier = "SINGLE" | "DUAL" | "MULTI" | "ANNUAL" | "TRIAL";
type F = "ALL" | "ISSUED" | "REDEEMED" | "REVOKED";

function CodesPage() {
  const a = useAdminText();
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const codes = useQuery(codesQuery);
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("ALL");
  const revoke = useAdminAction(useServerFn(revokeCode), { success: "Code revoked", invalidate: [["admin", "codes"]] });
  const lookupFn = useServerFn(lookupUnlockCode);
  const [lookupValue, setLookupValue] = useState("");
  const [lookupResult, setLookupResult] = useState<UnlockCodeLookupResult | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupPending, setLookupPending] = useState(false);
  const all = codes.data ?? [];

  const submitLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = lookupValue.trim();
    if (!value) return;
    setLookupPending(true);
    setLookupError("");
    setLookupResult(null);
    try {
      const result = await lookupFn({ data: { code: value } });
      setLookupResult(result);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Code lookup failed. Please retry.");
    } finally {
      setLookupPending(false);
    }
  };
  const rows = all.filter((c) => (f === "ALL" || c.status === f) && matches(q, c.unlock_code, c.shop_username, c.shop_phone, c.tier_code, c.issued_by_admin));

  return (
    <div className="space-y-6">
      <PageHeader title={a("Unlock codes")} sub="New BB3 codes use ECDSA P-256 and verify offline with the Android-pinned public key. Legacy BB2 codes are verified online against their original server-issued record." />
      {isAdmin ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="font-semibold">{a("Unlock codes are payment-linked")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{a("New BB3 codes are created only after a submitted payment is manually verified in the Payments queue. Each code is bound to that payment request, shop owner and exact plan.")}</p>
          </div>
          <Button asChild size="sm" variant="hero">
            <Link to="/admin/payments">{a("Review payment proofs")}</Link>
          </Button>
        </section>
      ) : null}
      <section className="rounded-2xl border border-primary/20 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="size-4 text-primary" /> {a("BB3 / BB2 code verification")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Look up the original Supabase issue record. BB3 codes are checked with the Android-pinned ECDSA P-256 public key; legacy BB2 codes are checked against their original issued record. Lookup never redeems a code.
            </p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{a("Admin-only · Read-only")}</span>
        </div>
        <form onSubmit={submitLookup} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={lookupValue}
            onChange={(event) => setLookupValue(event.target.value)}
            placeholder={a("Paste the complete BB3 or BB2 unlock code")}
            className="min-w-0 flex-1 font-mono text-xs sm:text-sm"
            autoComplete="off"
            spellCheck={false}
            aria-label={a("Unlock code to verify")}
          />
          <Button type="submit" disabled={lookupPending || !lookupValue.trim()}>
            {lookupPending ? "Checking…" : "Verify code"}
          </Button>
        </form>
        {lookupError ? <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{lookupError}</p> : null}
        {lookupResult ? (
          <div className={lookupResult.valid ? "mt-4 rounded-xl border border-success/30 bg-success/5 p-4" : "mt-4 rounded-xl border border-warning/30 bg-warning/5 p-4"}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{lookupResult.valid ? "Verified · ready for one-time redemption" : lookupResult.found ? "Issued record found · not redeemable" : "No matching issue record"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{lookupResult.message}</p>
              </div>
              {lookupResult.found ? <StatusBadge status={lookupResult.status} /> : <span className="rounded-full border border-border px-3 py-1 text-xs">{a("NOT FOUND")}</span>}
            </div>
            {lookupResult.found ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{a("Shop account")}</p><p className="mt-1 text-sm font-medium">@{lookupResult.shopUsername}</p><p className="text-xs text-muted-foreground">{lookupResult.shopPhone}</p></div>
                <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{a("Plan")}</p><p className="mt-1 text-sm font-medium">{lookupResult.tier} · {lookupResult.days} days</p><p className="text-xs text-muted-foreground">{formatRwf(lookupResult.amountRwf ?? 0)}</p></div>
                <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{a("Code verification")}</p><p className="mt-1 text-sm font-medium">{lookupResult.format === "BB3" ? (lookupResult.signatureValid ? "ECDSA signature valid" : "ECDSA signature invalid") : "Legacy registry match"}</p><p className="text-xs text-muted-foreground">{lookupResult.accountBindingValid ? "Account and plan match" : "Account or plan mismatch"}</p></div>
                <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{a("Issue details")}</p><p className="mt-1 text-sm">{lookupResult.issuedAt ? formatDateTime(lookupResult.issuedAt) : "Issue date unavailable"}</p><p className="text-xs text-muted-foreground">{lookupResult.issuedBy || "Issuer unavailable"}</p></div>
                {lookupResult.redeemedAt ? <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{a("Redeemed")}</p><p className="mt-1 text-sm">{formatDateTime(lookupResult.redeemedAt)}</p></div> : null}
                {lookupResult.expired ? <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{a("Expiry")}</p><p className="mt-1 text-sm text-destructive">{a("Expired")}</p></div> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={a("Search code, @username, phone, tier…")} />
        <FilterChips<F>
          value={f}
          onChange={setF}
          options={[
            { value: "ALL", label: "All", count: all.length },
            { value: "ISSUED", label: "Issued", count: all.filter((c) => c.status === "ISSUED").length },
            { value: "REDEEMED", label: "Redeemed", count: all.filter((c) => c.status === "REDEEMED").length },
            { value: "REVOKED", label: "Revoked", count: all.filter((c) => c.status === "REVOKED").length },
          ]}
        />
        <Button size="sm" variant="glass" onClick={() => downloadCsv(`beboss-codes-${Date.now()}.csv`, rows)}>
          <Download /> {a("Export")}
        </Button>
      </div>
      {codes.isLoading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title={a("No codes yet")} />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{a("Code")}</th>
                <th className="px-4 py-3">{a("Account")}</th>
                <th className="px-4 py-3">{a("Plan")}</th>
                <th className="px-4 py-3">{a("Issued")}</th>
                <th className="px-4 py-3">{a("Status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3 font-mono text-xs">{c.unlock_code}</td>
                  <td className="px-4 py-3">
                    <p>@{c.shop_username}</p>
                    <p className="text-xs text-muted-foreground">{c.shop_phone}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.tier_code} • +{c.plan_days}d • {formatRwf(c.amount_rwf)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateTime(c.issued_at)}
                    <br />
                    {c.issued_by_admin}
                    {c.redeemed_at ? <><br />{a("Redeemed")} {formatDateTime(c.redeemed_at)}</> : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label={a("Copy code")} onClick={async () => { await navigator.clipboard.writeText(c.unlock_code); toast.success(a("Copied")); }}>
                        <Copy />
                      </Button>
                      <Button size="icon" variant="ghost" asChild aria-label={a("Send on WhatsApp")}>
                        <a href={buildWhatsAppUrl(c.shop_phone, buildUnlockReplyText(c.shop_username, c.shop_username, c.unlock_code, c.plan_days, c.tier_code))} target="_blank" rel="noreferrer">
                          <MessageCircle />
                        </a>
                      </Button>
                      {isAdmin && c.status === "ISSUED" ? (
                        <ConfirmAction
                          trigger={
                            <Button size="icon" variant="ghost" aria-label={a("Revoke code")}>
                              <Ban />
                            </Button>
                          }
                          title={a("Revoke this code?")}
                          description="The code is marked revoked in the registry. Codes already pasted into an offline phone can't be pulled back, so also suspend the shop if needed."
                          destructive
                          confirmLabel={a("Revoke")}
                          onConfirm={() => revoke.mutate({ id: c.id })}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  );
}

