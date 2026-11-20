import { Cloud, Router, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n-dict";
import { cn } from "@/lib/utils";

const NODES: { icon: typeof Cloud; t: TKey; d: TKey }[] = [
  { icon: Smartphone, t: "hwNode1T", d: "hwNode1D" },
  { icon: Router, t: "hwNode2T", d: "hwNode2D" },
  { icon: Cloud, t: "hwNode3T", d: "hwNode3D" },
  { icon: ShieldCheck, t: "hwNode4T", d: "hwNode4D" },
];

/** Four-stage data path with an auto-advancing highlight; tap a stage to pin it. */
export function ArchitectureFlow() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (pinned) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % NODES.length), 2600);
    return () => window.clearInterval(id);
  }, [pinned]);

  return (
    <div>
      <ol className="grid gap-3 md:grid-cols-4">
        {NODES.map((n, i) => (
          <li key={n.t} className="relative">
            <button
              type="button"
              onClick={() => {
                setActive(i);
                setPinned(true);
              }}
              className={cn(
                "flex h-full w-full flex-col items-start gap-3 rounded-3xl border p-5 text-left transition-all",
                active === i ? "border-primary/60 bg-primary/10 shadow-brand" : "border-border bg-card hover:border-primary/30",
              )}
            >
              <span className={cn("grid size-12 place-items-center rounded-2xl transition-colors", active === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <n.icon className="size-6" />
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">0{i + 1}</span>
              <span className="font-display text-lg font-semibold">{t(n.t)}</span>
              <span className="text-sm text-muted-foreground">{t(n.d)}</span>
            </button>
            {i < NODES.length - 1 ? (
              <span aria-hidden="true" className={cn("absolute -right-3 top-11 z-10 hidden h-0.5 w-3 md:block", active === i ? "bg-flow-line animate-flow" : "bg-border")} />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
