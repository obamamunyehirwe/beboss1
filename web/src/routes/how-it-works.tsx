import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Ban, CalendarClock, Clock, Download, Fingerprint, GitMerge, Inbox, KeyRound, Lock, ReceiptText, Send, ShieldCheck, Smartphone, Sparkles, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArchitectureFlow } from "@/components/site/ArchitectureFlow";
import { OfflineSimulator } from "@/components/site/OfflineSimulator";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n-dict";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How BeBoss works — offline POS, branch sync & secure unlock" },
      { name: "description", content: "See how BeBoss sells with no internet, syncs branches over local Wi-Fi, backs up to the cloud and unlocks with account-bound BB2 codes paid by Mobile Money." },
      { property: "og:title", content: "How BeBoss works — offline-first POS for African shops" },
      { property: "og:description", content: "Try the offline simulator and see how sales, branches, payments and unlock codes flow from the counter to the cloud." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/Friendly%20Modern%20Store%20Checkout.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowItWorks,
});

const UNLOCK: { icon: typeof Sparkles; t: TKey; d: TKey }[] = [
  { icon: Sparkles, t: "hwU1T", d: "hwU1D" },
  { icon: Wallet, t: "hwU2T", d: "hwU2D" },
  { icon: Send, t: "hwU3T", d: "hwU3D" },
  { icon: Inbox, t: "hwU4T", d: "hwU4D" },
  { icon: KeyRound, t: "hwU5T", d: "hwU5D" },
];
const SECURITY: { icon: typeof Lock; t: TKey; d: TKey }[] = [
  { icon: Lock, t: "hwS1T", d: "hwS1D" },
  { icon: Fingerprint, t: "hwS2T", d: "hwS2D" },
  { icon: ReceiptText, t: "hwS3T", d: "hwS3D" },
  { icon: Clock, t: "hwS4T", d: "hwS4D" },
  { icon: KeyRound, t: "hwS5T", d: "hwS5D" },
  { icon: Ban, t: "hwS6T", d: "hwS6D" },
];
const ENGINE: { icon: typeof Lock; t: TKey; d: TKey }[] = [
  { icon: Inbox, t: "hwE1T", d: "hwE1D" },
  { icon: GitMerge, t: "hwE2T", d: "hwE2D" },
  { icon: Trash2, t: "hwE3T", d: "hwE3D" },
  { icon: ShieldCheck, t: "hwE4T", d: "hwE4D" },
];

function HowItWorks() {
  const { t, p } = useI18n();
  return (
    <SiteLayout>
      <PageHero eyebrow={t("hwEyebrow")} title={t("hwTitle")} sub={t("hwSub")}>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="hero" size="lg">
            <Link to="/download">
              <Download /> {t("ctaDownload")}
            </Link>
          </Button>
          <Button asChild variant="glass" size="lg">
            <a href="#simulator">
              {t("hwSimTitle")} <ArrowRight />
            </a>
          </Button>
        </div>
      </PageHero>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold sm:text-4xl">{t("hwArchTitle")}</h2>
        <div className="mt-10">
          <ArchitectureFlow />
        </div>
      </section>

      <section id="simulator" className="scroll-mt-20 border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-bold sm:text-4xl">{t("hwSimTitle")}</h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{t("hwSimSub")}</p>
          <div className="mt-10">
            <OfflineSimulator />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold sm:text-4xl">{t("hwSyncTitle")}</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ENGINE.map((e) => (
            <div key={e.t} className="rounded-3xl border border-border bg-card bg-card-sheen p-6">
              <e.icon className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold">{t(e.t)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(e.d)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-bold sm:text-4xl">{t("hwUnlockTitle")}</h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{t("hwUnlockSub")}</p>
          <ol className="relative mt-12 grid gap-4 lg:grid-cols-5">
            <span aria-hidden="true" className="absolute left-6 right-6 top-6 hidden h-0.5 bg-flow-line animate-flow lg:block" />
            {UNLOCK.map((u, i) => (
              <li key={u.t} className="relative flex gap-4 lg:flex-col">
                <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-brand">
                  <u.icon className="size-5" />
                </span>
                <div>
                  <p className="font-mono text-[11px] text-muted-foreground">STEP {i + 1}</p>
                  <h3 className="font-semibold">{t(u.t)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(u.d)}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap items-center gap-3 rounded-3xl border border-border bg-card p-5">
            <code className="rounded-xl bg-muted px-3 py-2 font-mono text-sm text-primary">BB2-SINGLE-30-5137-DB099F-027658B6</code>
            <span className="text-sm text-muted-foreground">{p.how.codeLegend}</span>
            <Button asChild variant="soft" size="sm" className="ml-auto">
              <Link to="/my-shop">
                <CalendarClock /> {t("navMyShop")}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold sm:text-4xl">{t("hwSecTitle")}</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECURITY.map((s) => (
            <div key={s.t} className="flex gap-4 rounded-3xl border border-border bg-card p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-success/12 text-success">
                <s.icon className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold">{t(s.t)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(s.d)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-gradient-brand p-10 text-primary-foreground sm:p-14">
          <div className="absolute inset-0 bg-grid opacity-30" aria-hidden="true" />
          <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-3xl font-extrabold sm:text-4xl">{t("finalTitle")}</h2>
              <p className="mt-2 max-w-xl opacity-85">{t("finalSub")}</p>
            </div>
            <Button asChild size="xl" variant="secondary">
              <Link to="/download">
                <Smartphone /> {t("ctaDownload")}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
