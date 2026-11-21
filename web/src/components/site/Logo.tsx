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
        src="/beboss-app-icon.png"
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
    <Link
      to={to}
      className="brand-lockup flex min-w-0 items-center gap-2.5"
      aria-label={suffix ? `BeBoss ${suffix}` : "BeBoss POS"}
    >
      <span className="brand-wordmark" aria-hidden="true">
        <img
          src="/beboss-wordmark-dark.png"
          alt=""
          className="brand-wordmark-image brand-wordmark-dark"
          loading="eager"
          decoding="async"
          width={720}
          height={160}
        />
        <img
          src="/beboss-wordmark-light.png"
          alt=""
          className="brand-wordmark-image brand-wordmark-light"
          loading="eager"
          decoding="async"
          width={720}
          height={160}
        />
      </span>
      {suffix ? <span className="brand-suffix">{suffix}</span> : null}
    </Link>
  );
}
