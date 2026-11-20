import { CheckCircle2, ShieldAlert, ShieldCheck, Sparkles, AlertTriangle, ArrowRight, RefreshCw, Copy, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatRwf } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function computeReceiptSeal(tin: string, receiptNo: string, isoTimestamp: string, total: number): Promise<string> {
  const payload = `${tin.trim()}|${receiptNo.trim()}|${isoTimestamp.trim()}|${Math.round(total)}`;
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `BB-${hex.slice(0, 10).toUpperCase()}`;
}

const PRESETS = [
  {
    name: "Sample checksum match",
    tin: "100294819",
    receiptNo: "REC-2026-004812",
    timestamp: "2026-11-20T12:30:00.000Z",
    total: 14700,
    expectedSeal: "", // calculated on mount
    tampered: false,
    shopName: "Sample Shop A",
  },
  {
    name: "Sample checksum mismatch",
    tin: "100883712",
    receiptNo: "REC-2026-001923",
    timestamp: "2026-11-20T10:15:00.000Z",
    total: 35000, // staff artificially modified total, but printed old seal!
    expectedSeal: "BB-9A1F4C2E88", // old seal for 3500 FRw
    tampered: true,
    shopName: "Sample Shop B",
  },
  {
    name: "Sample checksum match 2",
    tin: "100551920",
    receiptNo: "REC-2026-009214",
    timestamp: "2026-11-20T14:45:00.000Z",
    total: 8200,
    expectedSeal: "",
    tampered: false,
    shopName: "Sample Shop C",
  },
];

export function ReceiptVerifier() {
  const [tin, setTin] = useState(PRESETS[0].tin);
  const [receiptNo, setReceiptNo] = useState(PRESETS[0].receiptNo);
  const [timestamp, setTimestamp] = useState(PRESETS[0].timestamp);
  const [total, setTotal] = useState(String(PRESETS[0].total));
  const [claimedSeal, setClaimedSeal] = useState("");
  const [computedSeal, setComputedSeal] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  // Initialize preset 0 seal
  useMemo(async () => {
    const s = await computeReceiptSeal(PRESETS[0].tin, PRESETS[0].receiptNo, PRESETS[0].timestamp, PRESETS[0].total);
    setClaimedSeal(s);
    setComputedSeal(s);
  }, []);

  const loadPreset = async (p: typeof PRESETS[number]) => {
    setTin(p.tin);
    setReceiptNo(p.receiptNo);
    setTimestamp(p.timestamp);
    setTotal(String(p.total));
    if (p.tampered) {
      setClaimedSeal(p.expectedSeal);
    } else {
      const s = await computeReceiptSeal(p.tin, p.receiptNo, p.timestamp, p.total);
      setClaimedSeal(s);
    }
    const real = await computeReceiptSeal(p.tin, p.receiptNo, p.timestamp, Number(p.total) || 0);
    setComputedSeal(real);
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const seal = await computeReceiptSeal(tin, receiptNo, timestamp, Number(total) || 0);
      setComputedSeal(seal);
    } finally {
      setVerifying(false);
    }
  };

  const isMatch = computedSeal && claimedSeal && computedSeal.toUpperCase().trim() === claimedSeal.toUpperCase().trim();
  const rawPayload = `${tin.trim()}|${receiptNo.trim()}|${timestamp.trim()}|${Math.round(Number(total) || 0)}`;

  return (
    <div className="rounded-[2.5rem] border border-border bg-card p-6 sm:p-8 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="size-3.5" />
            Unkeyed checksum demonstration
          </span>
          <h3 className="mt-2 text-2xl font-bold tracking-tight">Receipt checksum comparison</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This demo hashes the TIN, receipt number, timestamp and total. A matching unkeyed checksum does not prove who issued a receipt, prevent edits, or establish fiscal compliance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Load sample:</span>
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              type="button"
              onClick={() => loadPreset(p)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-medium transition-all",
                p.tampered
                  ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "border-border bg-surface hover:border-primary/40 hover:text-primary"
              )}
            >
              {p.tampered ? "Tampered Test" : `Sample ${i + 1}`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Input Fields */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rv-tin" className="text-xs">Shop TIN / Tax ID</Label>
              <Input
                id="rv-tin"
                value={tin}
                onChange={(e) => { setTin(e.target.value); setComputedSeal(null); }}
                placeholder="100294819"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-rec" className="text-xs">Receipt Number</Label>
              <Input
                id="rv-rec"
                value={receiptNo}
                onChange={(e) => { setReceiptNo(e.target.value); setComputedSeal(null); }}
                placeholder="REC-2026-004812"
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rv-time" className="text-xs">ISO 8601 Timestamp</Label>
              <Input
                id="rv-time"
                value={timestamp}
                onChange={(e) => { setTimestamp(e.target.value); setComputedSeal(null); }}
                placeholder="2026-11-20T12:30:00.000Z"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-total" className="text-xs">Total Amount (FRw)</Label>
              <Input
                id="rv-total"
                type="number"
                value={total}
                onChange={(e) => { setTotal(e.target.value); setComputedSeal(null); }}
                placeholder="14700"
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rv-seal" className="text-xs">Claimed Seal on Receipt (`BB-XXXXXXXXXX`)</Label>
            <div className="flex gap-2">
              <Input
                id="rv-seal"
                value={claimedSeal}
                onChange={(e) => setClaimedSeal(e.target.value.toUpperCase())}
                placeholder="BB-XXXXXXXXXX"
                className="font-mono text-sm uppercase tracking-wider"
              />
              <Button type="button" variant="hero" onClick={handleVerify} disabled={verifying}>
                <RefreshCw className={cn("size-4", verifying && "animate-spin")} />
                Verify
              </Button>
            </div>
          </div>

          {/* Canonical String breakdown */}
          <div className="rounded-2xl border border-border bg-surface p-3 text-xs">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Canonical Digest Payload</p>
            <p className="mt-1 font-mono break-all text-primary text-[11px] bg-background/50 p-2 rounded-lg border border-border">
              {rawPayload}
            </p>
          </div>
        </div>

        {/* Verification Result Card */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-surface-2 p-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Authenticity Status</span>
              {computedSeal && claimedSeal ? (
                isMatch ? (
                  <Badge variant="success" className="px-3 py-1 text-xs">
                    <CheckCircle2 className="mr-1 size-3.5" /> AUTHENTIC & VALID
                  </Badge>
                ) : (
                  <Badge variant="danger" className="px-3 py-1 text-xs">
                    <ShieldAlert className="mr-1 size-3.5" /> FORGERY DETECTED
                  </Badge>
                )
              ) : (
                <Badge variant="muted" className="text-xs">Awaiting Verification</Badge>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-xs text-muted-foreground">Computed SHA-256 Fingerprint</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="font-mono text-lg font-bold text-foreground">
                    {computedSeal || "—"}
                  </p>
                  {computedSeal && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(computedSeal);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-xs text-muted-foreground">Claimed Seal on Physical / WhatsApp Receipt</p>
                <p className="mt-1 font-mono text-lg font-bold text-muted-foreground">
                  {claimedSeal || "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border p-4 text-xs leading-relaxed">
            {computedSeal && claimedSeal ? (
              isMatch ? (
                <div className="space-y-1.5 text-success">
                  <p className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" /> Checksum matches these fields
                  </p>
                  <p className="text-success/90">
                    The checksum matches the supplied TIN, receipt number, timestamp and total. It does not authenticate the issuer or verify line items.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 text-destructive">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> Checksum mismatch
                  </p>
                  <p className="text-destructive/90">
                    The supplied checksum differs from the value computed for these fields. This alone does not identify what changed or prove fraud.
                  </p>
                </div>
              )
            ) : (
              <p className="text-muted-foreground">
                Tap <strong>Verify</strong> to compute a SHA-256 checksum. This unkeyed example is not a signature and cannot guarantee that a receipt was not altered.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
