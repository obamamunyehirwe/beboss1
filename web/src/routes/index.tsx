import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Check, Download, Languages, ShieldCheck, TrendingUp,
  Zap, Cpu, Store, Smartphone, Wifi, WifiOff, Activity, Lock,
  BarChart3, Users, Package, RefreshCw, Globe
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ModernHero } from "@/components/site/ModernHero";
import { PricingCalculator } from "@/components/site/PricingCalculator";
import { WebPosTerminal } from "@/components/site/CheckoutDemo";
import { ReceiptVerifier } from "@/components/site/ReceiptVerifier";
import { OfflineSimulator } from "@/components/site/OfflineSimulator";
import { ArchitectureFlow } from "@/components/site/ArchitectureFlow";
import { FEATURES, LEAKS, SECTORS } from "@/components/site/content";
import { useI18n } from "@/lib/i18n";
import { LANGS } from "@/lib/i18n-dict";
import { publicSiteQuery, platformStatsQuery } from "@/lib/queries";
import { formatRwf } from "@/lib/format";
import counterImgAsset from "@/assets/counter-printer.jpg.asset.json";
const counterImg = counterImgAsset.url;

export const Route = createFileRoute("/")(
  {
    head: () => ({
      meta: [
        { title: "BeBoss POS — Run every shop from one Android phone" },
        { name: "description", content: "Offline-first Android business records for Rwandan shops: sales, stock and customer credit. Mobile-money payments use the operator's USSD flow and require separate verification." },
        { property: "og:title", content: "BeBoss POS — Run every shop from one Android phone" },
        { property: "og:description", content: "Record sales, stock and customer credit offline. Mobile-money settlement is completed and verified separately with the operator or shop administrator." },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    }),
    loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQuery),
    component: Home,
  }
);

function Home() {
  const { t, p } = useI18n();
  const { data } = useSuspenseQuery(publicSiteQuery);
  const { data: statsData } = useQuery({ ...platformStatsQuery, suspense: false } as any);
  const stats = (statsData as any)?.stats;
  const version = data.current?.version_name ?? data.config?.apk_version ?? "2.0.0";
  const [monthlyRev, setMonthlyRev] = useState(6000000);

  const illustrativeAmounts = [
    Math.round(monthlyRev * 0.045),
    Math.round(monthlyRev * 0.04),
    Math.round(monthlyRev * 0.05),
  ];
  const illustrativeTotal = illustrativeAmounts.reduce((sum, amount) => sum + amount, 0);

  return (
    <SiteLayout>
      {/* MODERN HERO SECTION */}
      <ModernHero version={version} />

      {/* LEAKS */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-4xl font-bold sm:text-5xl">{t("leaksTitle")}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{t("leaksSub")}</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {LEAKS.map((l, i) => (
            <div key={l.t} className="group rounded-3xl border border-border bg-card bg-card-sheen p-6 transition-all hover:-translate-y-1 hover:border-primary/40">
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              <l.icon className="mt-4 size-7 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{t(l.t)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(l.d)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* INTERACTIVE ROI PLAYBOOK CALCULATOR */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="rounded-[2.5rem] border border-primary/30 bg-surface-2 p-8 sm:p-12 shadow-soft">
          <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                <TrendingUp className="size-3.5" />
                Illustrative scenario — validate in a pilot
              </span>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">
                Measure a baseline before installation
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                These example percentages are assumptions, not measured BeBoss results. Record baseline sales, stock variance, debt collection, reconciliation time and reorder frequency, then compare after 4–8 weeks and include setup and support costs.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4 text-right">
              <span className="text-xs text-muted-foreground">Monthly Turnover:</span>
              <p className="font-display text-2xl font-bold text-foreground">{formatRwf(monthlyRev)}</p>
            </div>
          </div>

          <div className="mt-8 space-y-6">
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Small Boutique (1M FRw)</span>
                <span>Busy Grocery (6M FRw)</span>
                <span>Wholesale Depot (20M+ FRw)</span>
              </div>
              <input
                type="range"
                min={1000000}
                max={20000000}
                step={500000}
                value={monthlyRev}
                onChange={(e) => setMonthlyRev(Number(e.target.value))}
                className="w-full accent-primary h-2 bg-border rounded-lg cursor-pointer"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-4">
              <div className="rounded-2xl border border-border bg-card p-5">
                <span className="text-xs text-muted-foreground">1. Illustrative cash/split-payment scenario (4.5%)</span>
                <p className="font-display text-xl font-bold text-success mt-2">+{formatRwf(illustrativeAmounts[0])}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Assumption only; compare recorded tender and cash-up results.</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <span className="text-xs text-muted-foreground">2. Illustrative customer-credit scenario (4.0%)</span>
                <p className="font-display text-xl font-bold text-success mt-2">+{formatRwf(illustrativeAmounts[1])}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Assumption only; a ledger cannot ensure repayment.</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <span className="text-xs text-muted-foreground">3. Illustrative stock scenario (5.0%)</span>
                <p className="font-display text-xl font-bold text-success mt-2">+{formatRwf(illustrativeAmounts[2])}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Assumption only; stock insight depends on accurate records.</p>
              </div>

              <div className="rounded-2xl border border-primary/40 bg-primary/10 p-5">
                <span className="text-xs text-primary font-semibold">Illustrative scenario total</span>
                <p className="font-display text-2xl font-extrabold text-primary mt-2">+{formatRwf(illustrativeTotal)} / mo</p>
                <p className="text-[11px] text-muted-foreground mt-1">Not a forecast, verified saving or promised return.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="grid gap-4 rounded-[2rem] border border-border bg-card bg-card-sheen p-6 sm:grid-cols-2 sm:p-10 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">{t("whyTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("whySub")}</p>
          </div>
          {(["why1L", "why2L", "why3L", "why4L"] as const).map((l) => (
            <div key={l} className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <p className="font-display text-lg font-bold text-foreground">{t(l)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* LIVE CLOUD COUNTER TERMINAL */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Zap className="size-3.5" />
                Live Cloud Counter Station
              </span>
              <h2 className="mt-3 text-4xl font-bold sm:text-5xl">{t("demoTitle")}</h2>
              <p className="mt-4 text-lg text-muted-foreground">{t("demoSub")}</p>
            </div>
            <Button asChild variant="glass">
              <Link to="/how-it-works">
                {t("hwLearn")} <ArrowRight />
              </Link>
            </Button>
          </div>
          <WebPosTerminal />
        </div>
      </section>

      {/* CRYPTOGRAPHIC RECEIPT VERIFIER */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <ReceiptVerifier />
      </section>

      {/* ARCHITECTURE & OFFLINE-FIRST FLOW */}
      <section className="border-y border-border bg-surface/50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-12">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-info/30 bg-info/10 px-3 py-1 text-xs font-semibold text-info">
              <Cpu className="size-3.5" />
              Hybrid Logical Clock & Offline Durability
            </span>
            <h2 className="mt-3 text-4xl font-bold sm:text-5xl">How BeBoss Syncs Without Outages</h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Counter checkout never freezes when cellular data drops. Data is committed atomically to Room SQLite with SQLCipher encryption, relayed across local Wi-Fi Hotspots, and synced to Supabase Cloud whenever internet returns.
            </p>
          </div>

          <ArchitectureFlow />
          <OfflineSimulator />
        </div>
      </section>

      {/* FEATURES + IMAGE */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-border">
            <img src={counterImg} alt={p.home.counterAlt} loading="lazy" className="h-full min-h-[380px] w-full object-cover" />
            <div className="absolute inset-x-4 bottom-4 glass rounded-2xl border border-border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4 text-success" /> {p.home.sealed}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">58mm Bluetooth or 80mm counter printers • WhatsApp sharing • TIN/VAT breakdown</p>
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-bold sm:text-5xl">{t("featuresTitle")}</h2>
            <p className="mt-4 text-lg text-muted-foreground">{t("featuresSub")}</p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.t} className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
                    <f.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{t(f.t)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t(f.d)}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button asChild variant="link" className="mt-8 px-0">
              <Link to="/features">
                {t("navFeatures")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* SECTORS MARQUEE */}
      <section className="overflow-hidden py-20">
        <h2 className="mx-auto max-w-7xl px-4 text-center text-3xl font-bold sm:px-6">{t("sectorsTitle")}</h2>
        <div className="relative mt-10 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-3">
            {[...SECTORS, ...SECTORS].map((s, i) => (
              <span key={i} className="flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm">
                <s.icon className="size-4 text-primary" />
                {s.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-4xl font-bold sm:text-5xl">{t("howTitle")}</h2>
          <Button asChild variant="link" className="px-0">
            <Link to="/how-it-works">
              {t("hwLearn")} <ArrowRight />
            </Link>
          </Button>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-4">
          {([["how1T", "how1D"], ["how2T", "how2D"], ["how3T", "how3D"], ["how4T", "how4D"]] as const).map(([a, b], i) => (
            <li key={a} className="relative rounded-3xl border border-border bg-card p-6">
              <span className="font-display text-5xl font-extrabold text-primary/25">{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold">{t(a)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(b)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* LANGUAGES */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-4 py-20 text-center sm:px-6">
          <Languages className="size-10 text-primary" />
          <h2 className="text-4xl font-bold">{t("langTitle")}</h2>
          <p className="max-w-2xl text-lg text-muted-foreground">{t("langSub")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {LANGS.map((l) => (
              <span key={l.code} className="rounded-2xl border border-border bg-card px-6 py-4">
                <span className="block font-mono text-xs text-primary">{l.short}</span>
                <span className="font-display text-lg font-semibold">{l.label}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-4xl font-bold sm:text-5xl">{t("pricingTitle")}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{t("pricingSub")}</p>
        </div>
        <PricingCalculator config={data.config} />
      </section>

      {/* FINAL CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-gradient-brand p-10 text-primary-foreground sm:p-16">
          <div className="absolute inset-0 bg-grid opacity-30" aria-hidden="true" />
          <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-4xl font-extrabold sm:text-5xl">{t("finalTitle")}</h2>
              <p className="mt-3 max-w-xl text-lg opacity-85">{t("finalSub")}</p>
            </div>
            <Button asChild size="xl" variant="secondary">
              <Link to="/download">
                <Download />
                {t("ctaDownload")}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
