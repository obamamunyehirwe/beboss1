import { Cloud, Plus, Smartphone, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Sale = { id: number; amount: number; at: string };
const AMOUNTS = [1100, 2700, 4500, 7500, 600, 3200, 11300, 1600];

/** Interactive operational simulation of offline-first selling: sales queue on the phone and drain to the cloud when the network returns. */
export function OfflineSimulator() {
  const { t, p } = useI18n();
  const [online, setOnline] = useState(false);
  const [queue, setQueue] = useState<Sale[]>([]);
  const [synced, setSynced] = useState<Sale[]>([]);
  const [flying, setFlying] = useState<Sale | null>(null);
  const seq = useRef(1);

  const sell = () => {
    const n = seq.current++;
    const sale = { id: n, amount: AMOUNTS[n % AMOUNTS.length] ?? 1000, at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
    setQueue((q) => [...q, sale]);
  };

  useEffect(() => {
    if (!online || flying || !queue.length) return;
    const next = queue[0]!;
    setFlying(next);
    setQueue((q) => q.slice(1));
    const id = window.setTimeout(() => {
      setSynced((s) => [next, ...s].slice(0, 30));
      setFlying(null);
    }, 1100);
    return () => window.clearTimeout(id);
  }, [online, flying, queue]);

  const total = (xs: Sale[]) => xs.reduce((a, s) => a + s.amount, 0).toLocaleString("en-US");

  return (
    <div className="rounded-[2rem] border border-border bg-card p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <label className={cn("flex cursor-pointer items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition-colors", online ? "border-success/50 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive")}>
          {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          {online ? t("hwSimOnline") : t("hwSimOffline")}
          <Switch checked={online} onCheckedChange={setOnline} aria-label={p.offline.toggle} />
        </label>
        <Button variant="hero" onClick={sell}>
          <Plus /> {t("hwSimSell")}
        </Button>
      </div>

      <div className="mt-8 grid items-stretch gap-4 md:grid-cols-[1fr_minmax(80px,1fr)_1fr]">
        <div className="rounded-3xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Smartphone className="size-4 text-primary" /> {p.offline.counterPhone}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("hwSimQueued")}: <span className="font-mono text-warning">{queue.length}</span> · {total(queue)} FRw
          </p>
          <ul className="mt-3 min-h-28 space-y-1.5">
            {queue.slice(-5).map((s) => (
              <li key={s.id} className="flex animate-pop justify-between rounded-xl border border-warning/40 bg-warning/10 px-3 py-1.5 font-mono text-xs">
                <span>#{s.id} · {s.at}</span>
                <span>{s.amount.toLocaleString("en-US")}</span>
              </li>
            ))}
            {!queue.length ? <li className="py-6 text-center text-xs text-muted-foreground">{t("hwSimHint")}</li> : null}
          </ul>
        </div>

        <div className="relative flex min-h-16 items-center">
          <div className={cn("hidden h-0.5 w-full md:block", online ? "bg-flow-line animate-flow" : "bg-border")} />
          <div className={cn("mx-auto h-16 w-0.5 md:hidden", online ? "bg-flow-line-y" : "bg-border")} />
          {flying ? (
            <span key={flying.id} className="absolute top-1/2 hidden animate-travel rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-bold text-primary-foreground shadow-brand md:block">
              #{flying.id}
            </span>
          ) : null}
          {flying ? <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pop rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-bold text-primary-foreground md:hidden">#{flying.id}</span> : null}
        </div>

        <div className="rounded-3xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Cloud className="size-4 text-info" /> {p.offline.cloud}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("hwSimSynced")}: <span className="font-mono text-success">{synced.length}</span> · {total(synced)} FRw
          </p>
          <ul className="mt-3 min-h-28 space-y-1.5">
            {synced.slice(0, 5).map((s) => (
              <li key={s.id} className="flex animate-pop justify-between rounded-xl border border-success/40 bg-success/10 px-3 py-1.5 font-mono text-xs">
                <span>#{s.id} · {s.at}</span>
                <span>{s.amount.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
