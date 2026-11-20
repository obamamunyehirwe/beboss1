import { Link } from "@tanstack/react-router";
import { Check, Copy, MessageCircle, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { formatRwf } from "@/lib/format";
import { buildAirtelUssd, buildMtnUssd, buildWhatsAppUrl, calculateSubscriptionFee, type PayConfig } from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface Props {
  config: (PayConfig & { per_device_fee_rwf?: number | null; admin_whatsapp_number?: string | null; mtn_recipient_name?: string | null; airtel_recipient_name?: string | null }) | null;
}

export function PricingCalculator({ config }: Props) {
  const { t } = useI18n();
  const [branches, setBranches] = useState(1);
  const [workers, setWorkers] = useState(1);
  const [devices, setDevices] = useState(1);
  const [months, setMonths] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const cfg = config ?? {};
  const calc = useMemo(() => calculateSubscriptionFee(branches, workers, months, devices, Number(cfg.per_device_fee_rwf) || 2000), [branches, workers, months, devices, cfg.per_device_fee_rwf]);
  const mtn = buildMtnUssd(calc.total, cfg);
  const airtel = buildAirtelUssd(calc.total, cfg);

  const copy = async (v: string) => {
    await navigator.clipboard.writeText(v);
    setCopied(v);
    toast.success(t("copied"));
    window.setTimeout(() => setCopied(null), 1600);
  };

  const wa = cfg.admin_whatsapp_number
    ? buildWhatsAppUrl(
        cfg.admin_whatsapp_number,
        `Hello BeBoss, I'd like the plan: ${branches} branch(es), ${workers} staff, ${devices} device(s), ${months} month(s) = ${formatRwf(calc.total)}.`,
      )
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-5 rounded-3xl border border-border bg-card bg-card-sheen p-6">
        <Stepper label={t("calcBranches")} value={branches} onChange={setBranches} max={20} hint={formatRwf(calc.branchFee)} />
        <Stepper label={t("calcWorkers")} value={workers} onChange={setWorkers} max={50} hint={calc.workerFee ? `+${formatRwf(calc.workerFee)}` : "—"} />
        <Stepper label={t("calcDevices")} value={devices} onChange={setDevices} max={20} hint={calc.deviceFee ? `+${formatRwf(calc.deviceFee)}` : "—"} />
        <div>
          <p className="mb-2 text-sm font-medium">{t("calcCycle")}</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 3, 6, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                className={cn(
                  "rounded-xl border px-2 py-2.5 text-sm transition-colors",
                  months === m ? "border-primary bg-primary/12 text-primary" : "border-border hover:bg-accent",
                )}
              >
                {m} {m === 1 ? t("calcMonth") : t("calcMonths")}
                {m === 3 ? <span className="block text-[10px] text-success">-10%</span> : m === 12 ? <span className="block text-[10px] text-success">-20%</span> : <span className="block text-[10px] opacity-0">.</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-3xl border border-primary/30 bg-surface-2 p-6 shadow-brand">
        <Row label={t("calcBranchFee")} value={formatRwf(calc.branchFee)} />
        <Row label={t("calcStaffFee")} value={formatRwf(calc.workerFee)} />
        <Row label={t("calcDeviceFee")} value={formatRwf(calc.deviceFee)} />
        <Row label={t("calcMonthly")} value={formatRwf(calc.monthly)} strong />
        {calc.discount ? <Row label={`${t("calcDiscount")} (${calc.discount}%)`} value={`-${formatRwf(calc.gross - calc.total)}`} accent /> : null}
        <div className="flex items-end justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">{t("calcTotal")}</span>
          <span className="font-display text-4xl font-extrabold text-gradient-brand">{formatRwf(calc.total)}</span>
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("dialThis")}</p>
          <UssdRow brand="MTN MoMo" sub={cfg.mtn_recipient_name ?? ""} code={mtn} copied={copied === mtn} onCopy={() => copy(mtn)} />
          <UssdRow brand="Airtel Money" sub={cfg.airtel_recipient_name ?? ""} code={airtel} copied={copied === airtel} onCopy={() => copy(airtel)} />
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <Button asChild variant="hero" className="flex-1">
            <Link to="/my-shop" search={{ pay: 1, b: branches, w: workers, d: devices, m: months }}>{t("submitProof")}</Link>
          </Button>
          {wa ? (
            <Button asChild variant="glass">
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle />
                {t("askWhatsApp")}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange, max, hint }: { label: string; value: number; onChange: (n: number) => void; max: number; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="font-mono text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="icon" variant="glass" onClick={() => onChange(Math.max(1, value - 1))} aria-label={`Decrease ${label}`}>
          <Minus />
        </Button>
        <span className="w-8 text-center font-display text-xl font-bold">{value}</span>
        <Button type="button" size="icon" variant="glass" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Increase ${label}`}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono", strong && "font-semibold text-foreground", accent && "text-success")}>{value}</span>
    </div>
  );
}

function UssdRow({ brand, sub, code, copied, onCopy }: { brand: string; sub: string; code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {brand}
          {sub ? ` • ${sub}` : ""}
        </p>
        <a href={`tel:${encodeURIComponent(code)}`} className="block truncate font-mono text-base font-semibold text-primary">
          {code}
        </a>
      </div>
      <Button type="button" size="icon" variant="ghost" onClick={onCopy} aria-label={`Copy ${brand} code`}>
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}
