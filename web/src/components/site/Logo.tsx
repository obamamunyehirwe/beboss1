import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "brand-mark relative inline-flex size-10 shrink-0 overflow-hidden rounded-xl border border-border/70 shadow-brand",
        className,
      )}
    >
      <img
        src="/beboss-brand.svg"
        alt=""
        aria-hidden="true"
        className="size-full object-contain p-0.5"
        loading="eager"
        decoding="async"
        width={40}
        height={40}
      />
    </span>
  );
}

export function Logo({ to = "/", suffix }: { to?: string; suffix?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label={suffix ? `BeBoss ${suffix}` : "BeBoss POS"}>
      <LogoMark />
      <span className="font-display text-2xl font-extrabold tracking-[-0.06em]">
        BeBoss{suffix ? <span className="ml-1.5 text-sm font-medium text-muted-foreground">{suffix}</span> : <span className="brand-pos">POS</span>}
      </span>
    </Link>
  );
}
