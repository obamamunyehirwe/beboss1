import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-9 shrink-0 overflow-hidden rounded-lg border border-border", className)}>
      <img
        src="/beboss-app-logo.jpg"
        alt="BeBoss Logo"
        className="size-full object-cover"
        loading="eager"
      />
    </span>
  );
}

export function Logo({ to = "/", suffix }: { to?: string; suffix?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-2xl font-extrabold tracking-[-0.06em]">
        BeBoss{suffix ? <span className="ml-1.5 text-sm font-medium text-muted-foreground">{suffix}</span> : <span className="brand-pos">POS</span>}
      </span>
    </Link>
  );
}
