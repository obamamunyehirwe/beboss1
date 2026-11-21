import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Bluetooth, Building2, Cloud, Fingerprint, HandCoins, KeyRound, Languages, LineChart, Lock, Printer, Receipt, RefreshCcw, ScanBarcode, ShieldCheck, Smartphone, Split, Users, WifiOff, CheckCircle2, Cpu, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { ReceiptVerifier } from "@/components/site/ReceiptVerifier";
import { SECTORS } from "@/components/site/content";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — BeBoss POS for Android" },
      { name: "description", content: "Offline-first Android POS for recording sales, stock and customer credit, with USSD payment shortcuts and admin-reviewed subscription proofs." },
      { property: "og:title", content: "BeBoss POS features" },
      { property: "og:description", content: "Every tool a growing African retailer needs — offline, multi-branch and in 4 languages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FeaturesPage,
});

const GROUP_ICONS = [
  [ScanBarcode, Split, RefreshCcw, Receipt, Printer],
  [BarChart3, LineChart, HandCoins, Bluetooth],
  [Users, Building2, Smartphone, WifiOff, Cloud],
  [Lock, Fingerprint, ShieldCheck, KeyRound, Languages],
];

function FeaturesPage() {
  const { t, p } = useI18n();
  return (
    <SiteLayout>
      <PageHero eyebrow={t("navFeatures")} title={t("featuresTitle")} sub={t("featuresSub")} />
      <div className="mx-auto max-w-7xl space-y-20 px-4 py-20 sm:px-6">
        {p.features.map((g, gi) => (
          <section key={gi} className="grid gap-8 lg:grid-cols-[280px_1fr]">
            <h2 className="text-2xl font-bold lg:sticky lg:top-24 lg:self-start">{g.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {g.items.map((i, ii) => {
                const Icon = GROUP_ICONS[gi]?.[ii] ?? ShieldCheck;
                return (
                <div key={ii} className="rounded-3xl border border-border bg-card bg-card-sheen p-6 transition-colors hover:border-primary/40">
                  <Icon className="size-6 text-primary" />
                  <h3 className="mt-4 text-lg font-semibold">{i.t}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{i.d}</p>
                </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Cryptographic Receipt Verification Section */}
        <section className="space-y-6">
          <ReceiptVerifier />
        </section>

        {/* Security Deep Dive Matrix */}
        <section className="rounded-[2.5rem] border border-border bg-card p-8 sm:p-12 shadow-soft">
          <div className="max-w-2xl mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              <Lock className="size-3.5" />
              Security implementation notes
            </span>
            <h2 className="mt-2 text-3xl font-bold">Safeguards and their limits</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              BeBoss includes device and application safeguards, but no software can prevent every theft, device compromise, staff error or network risk.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Database className="size-4" /> SQLCipher AES-256
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Database at rest uses SQLCipher encryption. The database passphrase is protected using Android Keystore; hardware-backed availability depends on the device.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Cpu className="size-4" /> ClockGuard Anti-Rollback
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Uses monotonic elapsed time and stored state to detect some clock rollbacks. This is a safeguard, not a guarantee against all device tampering.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <KeyRound className="size-4" /> Constant-Time BB2 Unlock
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                HMAC-SHA256 account-bound unlock codes are compared using MessageDigest.isEqual to reduce timing leakage during code checks.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-surface p-8 sm:p-12">
          <h2 className="text-3xl font-bold">{t("sectorsTitle")}</h2>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {SECTORS.map((s, si) => (
              <div key={si} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-sm">
                <s.icon className="size-5 text-primary" />
                {p.sectors[si] ?? s.name}
              </div>
            ))}
          </div>
          <Button asChild variant="hero" size="lg" className="mt-10">
            <Link to="/download">
              {t("ctaDownload")} <ArrowRight />
            </Link>
          </Button>
        </section>
      </div>
    </SiteLayout>
  );
}
