import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bluetooth,
  Building2,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  Fingerprint,
  HandCoins,
  KeyRound,
  Languages,
  LineChart,
  Lock,
  Network,
  Printer,
  Receipt,
  RefreshCcw,
  ScanBarcode,
  ShieldCheck,
  Smartphone,
  Split,
  Users,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { ReceiptVerifier } from "@/components/site/ReceiptVerifier";
import { SECTORS } from "@/components/site/content";
import { useI18n } from "@/lib/i18n";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "BeBoss POS features — checkout, inventory and multi-branch operations" },
      {
        name: "description",
        content:
          "Explore BeBoss Android POS capabilities: offline sales, inventory, customer credit, staff roles, branch operations, encrypted local storage and the central web admin console.",
      },
      { property: "og:title", content: "BeBoss POS — product capabilities" },
      {
        property: "og:description",
        content:
          "A connected retail operating platform designed to grow from one counter to multi-location teams.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/Friendly%20Modern%20Store%20Checkout.png" },
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

const SCALE_CAPABILITIES = [
  {
    icon: Building2,
    title: "Multi-location operations",
    body: "Organize staff and terminals by branch, review branch-level performance, and record stock movements between locations. Consolidated visibility is designed to help an operator manage more than one counter without losing local accountability.",
    tag: "Branch-aware workflows",
  },
  {
    icon: Users,
    title: "People and permissions",
    body: "Separate owner, manager and cashier responsibilities with named staff accounts and PIN-based operator access. Staff activity can be reviewed against the shop and branch context instead of relying on one shared counter login.",
    tag: "Role-based access",
  },
  {
    icon: Database,
    title: "Offline-to-cloud data flow",
    body: "Sales and stock operations are recorded locally on the Android terminal. Encrypted device-to-device transfer can use the shop's Wi-Fi or hotspot, while cloud synchronization uses the configured Supabase project when internet access is available.",
    tag: "Local-first architecture",
  },
  {
    icon: Activity,
    title: "Central operating oversight",
    body: "The web Admin Center brings together shop records, device controls, payment claims, unlock-code issuance, release management, inbox, announcements, audit activity and operational analytics.",
    tag: "Web command center",
  },
];

function FeaturesPage() {
  const { t, p } = useI18n();
  const a = useAdminText();
  return (
    <SiteLayout>
      <PageHero eyebrow={t("navFeatures")} title={t("featuresTitle")} sub={t("featuresSub")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="hero" size="lg">
            <Link to="/download">
              {a("Download the Android app")} <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="glass" size="lg">
            <Link to="/pricing">
              {a("View plans")} <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </PageHero>

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16 sm:px-6 sm:py-20">
        <section aria-labelledby="feature-catalog-title" className="space-y-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <CheckCircle2 className="size-3.5" />
              {a("Product capability map")}
            </div>
            <h2 id="feature-catalog-title" className="mt-4 text-3xl font-bold sm:text-4xl">
              {a("Daily retail work, connected from the counter to management")}
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              {a("BeBoss combines checkout, stock movement, customer balances, staff workflows and operational reporting in one Android-first system. The capabilities below describe what the product is built to do; each rollout should validate its devices, staff roles, branch structure and data before going live.")}
            </p>
          </div>

          {p.features.map((g, gi) => (
            <section key={gi} className="grid gap-6 border-t border-border pt-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">{a("Capability group")} 0{gi + 1}</p>
                <h3 className="mt-2 text-2xl font-bold">{g.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {gi === 0
                    ? a("Fast, accountable transactions for busy tills and customer-facing teams.")
                    : gi === 1
                      ? a("Stock and money records that help managers make decisions from recorded business activity.")
                      : gi === 2
                        ? a("Keep each branch and operator connected while preserving local workflows.")
                        : a("Protect business records and make access to the operating system accountable.")}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {g.items.map((item, ii) => {
                  const Icon = GROUP_ICONS[gi]?.[ii] ?? ShieldCheck;
                  return (
                    <article key={ii} className="group rounded-3xl border border-border bg-card bg-card-sheen p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40">
                      <span className="grid size-11 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <h4 className="mt-4 text-lg font-semibold">{item.t}</h4>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.d}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </section>

        <section aria-labelledby="scale-title" className="overflow-hidden rounded-[2.5rem] border border-border bg-card p-6 shadow-soft sm:p-10 lg:p-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              <Network className="size-3.5" />
              {a("Built for growing operations")}
            </div>
            <h2 id="scale-title" className="mt-4 text-3xl font-bold sm:text-4xl">
              {a("Start with one store. Keep the operating model as the business expands.")}
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              {a("The same product model supports a single counter, a multi-branch retailer, a pharmacy group, a wholesale operation or a growing distribution business. Larger deployments should be rolled out by branch and role, with named operational owners and acceptance checks at each stage.")}
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {SCALE_CAPABILITIES.map((item) => (
              <article key={item.title} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="size-5" />
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{a(item.tag)}</span>
                </div>
                <h3 className="mt-4 font-semibold">{a(item.title)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{a(item.body)}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 grid gap-4 border-t border-border pt-6 md:grid-cols-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{a("01 · Configure")}</p>
              <h3 className="mt-2 font-semibold">{a("Map the organisation")}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{a("Define shops, branches, terminals, staff responsibilities and product ownership before rollout.")}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{a("02 · Pilot")}</p>
              <h3 className="mt-2 font-semibold">{a("Validate real workflows")}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{a("Test checkout, offline operation, printer models, stock reconciliation, payment review and device recovery with representative teams.")}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{a("03 · Expand")}</p>
              <h3 className="mt-2 font-semibold">{a("Roll out with oversight")}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{a("Use central administration and branch-level routines to extend the deployment after each pilot gate is accepted.")}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]">
          <div className="rounded-[2.5rem] border border-border bg-card p-6 sm:p-9">
            <div className="flex items-center gap-3 text-primary">
              <ShieldCheck className="size-6" />
              <span className="text-xs font-bold uppercase tracking-[0.16em]">{a("Security implementation")}</span>
            </div>
            <h2 className="mt-3 text-3xl font-bold">{a("Safeguards with clear boundaries")}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {a("BeBoss uses multiple layers of protection, but software cannot eliminate every device, staff, network or operational risk. Hardware-backed Keystore support depends on the Android device, and a checksum should not be confused with a digital signature.")}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-4">
                <Database className="size-5 text-primary" />
                <h3 className="mt-3 font-semibold">{a("Encrypted local database")}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{a("Room and SQLCipher protect local business records at rest; Android Keystore protects the database key material.")}</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-4">
                <Cpu className="size-5 text-primary" />
                <h3 className="mt-3 font-semibold">{a("Device integrity signals")}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{a("Clock rollback detection and device security telemetry help administrators investigate unusual device state.")}</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-4">
                <KeyRound className="size-5 text-primary" />
                <h3 className="mt-3 font-semibold">{a("Payment-linked BB3 codes")}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{a("New BB3 codes use server-side ECDSA P-256 signatures and bind activation to a verified payment claim and registered shop.")}</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-4">
                <Lock className="size-5 text-primary" />
                <h3 className="mt-3 font-semibold">{a("Scoped shop data")}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{a("Shop-scoped access policies are used to separate customer business records between tenants.")}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2.5rem] border border-warning/25 bg-warning/5 p-6 sm:p-9">
            <div className="flex items-center gap-3 text-warning">
              <CheckCircle2 className="size-6" />
              <span className="text-xs font-bold uppercase tracking-[0.16em]">{a("Operational transparency")}</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold">{a("Important integration boundaries")}</h2>
            <div className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground">
              <p><strong className="text-foreground">{a("Mobile Money:")}</strong> {a("payment instructions and proof submission are supported, but settlement must be checked against the official MTN MoMo or Airtel Money merchant record before an administrator approves activation. Do not treat a customer screenshot or SMS as settlement confirmation.")}</p>
              <p><strong className="text-foreground">{a("Receipt verification:")}</strong> {a("the receipt checksum detects changes to included receipt fields. It is not a PKI digital signature and should not be presented as independent proof of issuer identity.")}</p>
              <p><strong className="text-foreground">{a("Enterprise integrations:")}</strong> {a("external ERP connectors, corporate SSO, contractual uptime SLAs and independent compliance certifications are not represented as delivered capabilities by this release.")}</p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <ReceiptVerifier />
        </section>

        <section className="rounded-[2rem] border border-border bg-surface p-8 sm:p-12">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{a("Where BeBoss fits")}</p>
            <h2 className="mt-2 text-3xl font-bold">{t("sectorsTitle")}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {a("The product's checkout, stock, customer balance and branch workflows can be configured for a wide range of retail and service operations.")}
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {SECTORS.map((sector, index) => (
              <div key={index} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-sm">
                <sector.icon className="size-5 shrink-0 text-primary" />
                <span>{p.sectors[index] ?? sector.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button asChild variant="hero" size="lg">
              <Link to="/download">
                {a("Download BeBoss")} <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <Link to="/contact">{a("Discuss a multi-branch pilot")} <ArrowUpRight /></Link>
            </Button>
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}
