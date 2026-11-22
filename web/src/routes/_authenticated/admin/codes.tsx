import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Ban, Copy, Download, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, TableShell, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { revokeCode } from "@/lib/admin.functions";
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
  const all = codes.data ?? [];
  const rows = all.filter((c) => (f === "ALL" || c.status === f) && matches(q, c.unlock_code, c.shop_username, c.shop_phone, c.tier_code, c.issued_by_admin));

  return (
    <div className="space-y-6">
      <PageHeader title="Unlock codes" sub="New BB3 codes use ECDSA P-256 and verify offline with the Android-pinned public key. Legacy BB2 codes are verified online against their original server-issued record." />
      {isAdmin ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="font-semibold">Unlock codes are payment-linked</p>
            <p className="mt-1 text-sm text-muted-foreground">New BB3 codes are created only after a submitted payment is manually verified in the Payments queue. Each code is bound to that payment request, shop owner and exact plan.</p>
          </div>
          <Button asChild size="sm" variant="hero">
            <Link to="/admin/payments">Review payment proofs</Link>
          </Button>
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search code, @username, phone, tier…" />
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
        <EmptyState title="No codes yet" />
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
                          confirmLabel="Revoke"
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

