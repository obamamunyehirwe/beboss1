import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Check, Copy, Download, KeyRound, Loader2, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, TableShell, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { issueManualCode, revokeCode } from "@/lib/admin.functions";
import { codesQuery, configQuery, shopsQuery } from "@/lib/admin-queries";
import { computeAccountBindingHash } from "@/lib/bb2";
import { buildUnlockReplyText, buildWhatsAppUrl, calculateSubscriptionFee, normalizePhoneLast9 } from "@/lib/pricing";
import { formatDateTime, formatRwf } from "@/lib/format";

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
      {isAdmin ? <IssueForm /> : null}
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
          <Download /> Export
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
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Status</th>
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
                    {c.redeemed_at ? <><br />Redeemed {formatDateTime(c.redeemed_at)}</> : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label="Copy code" onClick={async () => { await navigator.clipboard.writeText(c.unlock_code); toast.success("Copied"); }}>
                        <Copy />
                      </Button>
                      <Button size="icon" variant="ghost" asChild aria-label="Send on WhatsApp">
                        <a href={buildWhatsAppUrl(c.shop_phone, buildUnlockReplyText(c.shop_username, c.shop_username, c.unlock_code, c.plan_days, c.tier_code))} target="_blank" rel="noreferrer">
                          <MessageCircle />
                        </a>
                      </Button>
                      {isAdmin && c.status === "ISSUED" ? (
                        <ConfirmAction
                          trigger={
                            <Button size="icon" variant="ghost" aria-label="Revoke code">
                              <Ban />
                            </Button>
                          }
                          title="Revoke this code?"
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

function IssueForm() {
  const shops = useQuery(shopsQuery);
  const { data: cfg } = useQuery(configQuery);
  const [shopId, setShopId] = useState<string>("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState<Tier>("SINGLE");
  const [dur, setDur] = useState(DURATIONS[1]!);
  const [plan, setPlan] = useState({ branches: 1, workers: 1, devices: 1 });
  const [extendCloud, setExtendCloud] = useState(true);
  const [hash, setHash] = useState("");
  const [issued, setIssued] = useState<{ code: string; amount: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const issue = useAdminAction(useServerFn(issueManualCode), { success: "Signed BB3 code issued", invalidate: [["admin", "codes"], ["admin", "shops"]] });

  useEffect(() => {
    let live = true;
    if (username.trim() && normalizePhoneLast9(phone).length >= 9) computeAccountBindingHash(username, phone).then((h) => live && setHash(h));
    else setHash("");
    return () => {
      live = false;
    };
  }, [username, phone]);

  const pick = (id: string) => {
    setShopId(id);
    const s = (shops.data ?? []).find((x) => x.id === id);
    if (!s) return;
    setUsername(s.owner_username);
    setPhone(s.owner_phone);
    setPlan({ branches: s.branch_count, workers: s.worker_count, devices: s.device_limit });
    setTier(s.branch_count >= 3 ? "MULTI" : s.branch_count === 2 ? "DUAL" : "SINGLE");
  };

  const amount = useMemo(() => (dur.months === 0 ? 0 : calculateSubscriptionFee(plan.branches, plan.workers, dur.months, plan.devices, Number(cfg?.per_device_fee_rwf) || 2000).total), [plan, dur, cfg]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    issue.mutate(
      { username, phone, months: dur.months, days: dur.days, ...plan, tier: dur.days === 365 && tier !== "TRIAL" ? "ANNUAL" : tier, extendCloud },
      { onSuccess: (r) => setIssued({ code: r.code, amount: r.amount }) },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-2xl border border-border bg-card p-5 xl:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-primary" /> Issue a code manually
        </h2>
        <div className="space-y-1.5">
          <Label>Registered shop</Label>
          <Select value={shopId} onValueChange={pick}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a shop to auto-fill (optional)" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {(shops.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.shop_name} — @{s.owner_username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Owner username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Registered phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={30} />
          </div>
        </div>
        <div>
          <Label>Duration</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <Button key={d.days} type="button" size="sm" variant={dur.days === d.days ? "soft" : "glass"} onClick={() => { setDur(d); if (d.days === 4) setTier("TRIAL"); else if (tier === "TRIAL") setTier("SINGLE"); }}>
                {d.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Tier</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["SINGLE", "DUAL", "MULTI", "ANNUAL", "TRIAL"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(["branches", "workers", "devices"] as const).map((k) => (
            <div key={k} className="space-y-1.5">
              <Label className="capitalize">{k === "workers" ? "Staff" : k}</Label>
              <Input type="number" min={1} max={k === "workers" ? 500 : 100} value={plan[k]} onChange={(e) => setPlan({ ...plan, [k]: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={extendCloud} onCheckedChange={setExtendCloud} />
          Also extend the shop's cloud license so it auto-unlocks on sync
        </label>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-surface-2 p-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Binding preview</p>
        <p className="font-mono text-sm">
          @{username.trim().toLowerCase() || "username"} + *{normalizePhoneLast9(phone) || "#########"} → <span className="text-primary">#{hash || "------"}</span>
        </p>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Amount recorded</p>
        <p className="font-display text-3xl font-bold">{formatRwf(amount)}</p>
        <Button type="submit" variant="hero" disabled={issue.isPending || !hash} className="mt-auto">
          {issue.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Generate signed code
        </Button>
        {issued ? (
          <div className="rounded-xl border border-success/30 bg-success/10 p-3">
            <p className="break-all font-mono text-sm font-semibold text-success">{issued.code}</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="glass" onClick={async () => { await navigator.clipboard.writeText(issued.code); setCopied(true); }}>
                {copied ? <Check className="text-success" /> : <Copy />} Copy
              </Button>
              <Button type="button" size="sm" variant="success" asChild>
                <a href={buildWhatsAppUrl(phone, buildUnlockReplyText(username, username, issued.code, dur.days, tier))} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}
