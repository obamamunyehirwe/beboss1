import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { PhoneMockup } from "./PhoneMockup";

interface ModernHeroProps {
  version: string;
  liveStats?: {
    shops_active?: number;
    devices_active?: number;
    devices_synced_24h?: number;
  } | null;
}

export function ModernHero({ version, liveStats }: ModernHeroProps) {
  const { t } = useI18n();
  const activeShops = liveStats?.shops_active ?? 0;
  const activeDevices = liveStats?.devices_active ?? 0;
  const syncedDevices = liveStats?.devices_synced_24h ?? 0;

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-ember" aria-hidden="true" />
      <div className="absolute inset-0 bg-grid mask-fade-b" aria-hidden="true" />
      
      {/* Radial glow accents */}
      <div className="pointer-events-none absolute -top-32 left-1/4 size-[600px] rounded-full bg-primary/10 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-20 right-1/4 size-[400px] rounded-full bg-warning/8 blur-[100px]" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
        {/* MOBILE: Stacked layout | DESKTOP: Side-by-side */}
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          {/* LEFT: Copy Section */}
          <div className="animate-fade-up space-y-6">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-border/80 bg-card/90 px-3 py-1.5 shadow-xs backdrop-blur-md">
                <img
                  src="/beboss-app-logo.jpg"
                  alt="Official BeBoss Mobile App Logo"
                  className="size-6 rounded-lg object-cover ring-1 ring-primary/40 shadow-xs"
                />
                <span className="font-display text-xs font-bold text-foreground">BeBoss Android POS</span>
                <span className="size-1.5 rounded-full bg-success" />
                <span className="font-mono text-[10px] text-success font-bold">Official v{version}</span>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
                {t("heroEyebrow")}
              </span>
            </div>

            {/* Main Headline */}
            <div>
              <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
                {t("heroTitleA")}
                <br />
                <span className="text-gradient-brand">{t("heroTitleB")}</span>
              </h1>
              <p className="mt-5 max-w-xl text-base sm:text-lg text-muted-foreground">{t("heroSub")}</p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild variant="hero" size="xl">
                <Link to="/download">
                  <Download />
                  {t("ctaDownload")}
                </Link>
              </Button>
              <Button asChild variant="glass" size="xl">
                <Link to="/pricing">
                  {t("ctaPricing")}
                  <ArrowRight />
                </Link>
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
              <Check className="size-4 text-success" />
              {t("heroTrial")} • Android 7.0+ • v{version}
            </div>

            {/* Inline trust micro-stats */}
            <div className="grid grid-cols-3 gap-3 pt-4">
              {[
                { value: "Offline", label: t("heroOfflineLabel"), color: "text-success" },
                { value: String(activeShops), label: t("heroActiveShops"), color: "text-primary" },
                { value: `${syncedDevices}/${activeDevices || syncedDevices}`, label: t("heroSyncedDevices"), color: "text-warning" },
              ].map(({ value, label, color }) => (
                <div key={label} className="rounded-2xl border border-border/60 bg-card/70 px-3 py-3 backdrop-blur-sm">
                  <p className={`font-display text-xl font-extrabold ${color}`}>{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Phone Mockup - Hidden on mobile, visible on desktop */}
          <div className="hidden lg:flex flex-col items-center justify-center">
            <PhoneMockup />
          </div>
        </div>
      </div>

      {/* MOBILE: Phone display below hero on small screens */}
      <div className="lg:hidden px-4 py-8 sm:px-6">
        <div className="flex justify-center">
          <div className="w-full max-w-sm">
            <PhoneMockup />
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="relative border-y border-border bg-surface/70">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-border px-4 sm:px-6 md:grid-cols-4 md:divide-x">
          {(["stat1", "stat2", "stat3", "stat4"] as const).map((k) => (
            <div key={k} className="px-4 py-5 text-center text-sm font-medium">
              {t(k)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
