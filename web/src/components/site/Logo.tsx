import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative grid size-9 place-items-center rounded-xl bg-gradient-brand shadow-brand", className)}>
      <svg viewBox="0 0 24 24" className="size-5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 4h8a4 4 0 0 1 0 8H5zM5 12h9a4 4 0 0 1 0 8H5z" />
      </svg>
    </span>
  );
}

export function Logo({ to = "/", suffix }: { to?: string; suffix?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-lg font-bold tracking-tight">
        BeBoss{suffix ? <span className="ml-1.5 text-sm font-medium text-muted-foreground">{suffix}</span> : null}
      </span>
    </Link>
  );
}
