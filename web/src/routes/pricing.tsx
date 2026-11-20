import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, PhoneCall, Send } from "lucide-react";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { PricingCalculator } from "@/components/site/PricingCalculator";
import { useI18n } from "@/lib/i18n";
import { publicSiteQuery } from "@/lib/queries";
import { formatRwf } from "@/lib/format";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — BeBoss POS from 5,000 FRw per month" },
      { name: "description", content: "Transparent BeBoss pricing: 5,000 FRw/month for one branch, staff and device add-ons, 10% off quarterly and 20% off yearly. Pay with MTN MoMo or Airtel Money." },
      { property: "og:title", content: "BeBoss POS pricing" },
      { property: "og:description", content: "Calculate your exact monthly price and get the MoMo or Airtel USSD code to pay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQuery),
  component: PricingPage,
});

function PricingPage() {
  const { t, p } = useI18n();
  const { data } = useSuspenseQuery(publicSiteQuery);
  const rate = Number(data.config?.per_device_fee_rwf) || 2000;
  const tiers = [5000, 10000, 20000].map((price, i) => ({ price, name: p.pricing.tiers[i]?.name ?? "", note: p.pricing.tiers[i]?.note ?? "" }));
  return (
    <SiteLayout>
      <PageHero eyebrow={t("navPricing")} title={t("pricingTitle")} sub={t("pricingSub")} />
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((tier, i) => (
            <div key={tier.name} className={`rounded-3xl border p-7 ${i === 0 ? "border-primary/40 bg-surface-2 shadow-brand" : "border-border bg-card"}`}>
              <p className="text-sm text-muted-foreground">{tier.name}</p>
              <p className="mt-2 font-display text-4xl font-extrabold">
                {formatRwf(tier.price)}
                <span className="text-base font-medium text-muted-foreground"> / {t("calcMonth")}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{tier.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <p className="rounded-2xl border border-border px-4 py-3">{p.pricing.staffLine}</p>
          <p className="rounded-2xl border border-border px-4 py-3">{p.pricing.devicesLine.replace("{rate}", rate.toLocaleString())}</p>
          <p className="rounded-2xl border border-border px-4 py-3">{p.pricing.discountsLine}</p>
        </div>
        <h2 className="mb-6 mt-16 text-3xl font-bold">{p.pricing.exactPrice}</h2>
        <PricingCalculator config={data.config} />
        <h2 className="mb-6 mt-20 text-3xl font-bold">{p.pricing.howPaying}</h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {[PhoneCall, Send, CheckCircle2, KeyRound].map((icon, i) => ({ icon, t: p.pricing.steps[i]?.t ?? "", d: p.pricing.steps[i]?.d ?? "" })).map((s, i) => (
            <li key={s.t} className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <s.icon className="size-6 text-primary" />
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>

        {/* Enterprise Comparison & ROI Value Matrix */}
        <section className="mt-20 rounded-[2.5rem] border border-border bg-card p-8 sm:p-12 shadow-soft">
          <div className="max-w-2xl mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <CheckCircle2 className="size-3.5" />
              Pilot measurement guide
            </span>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Measure outcomes before claiming savings</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              BeBoss has not established a representative reconciliation baseline. Before rollout, record the merchant's current process, then compare sales, settlement records, stock counts, debt collection and reconciliation time after 4–8 weeks. Include setup and support costs.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-4">Operational Area</th>
                  <th className="p-4">Baseline to record</th>
                  <th className="p-4">What BeBoss records</th>
                  <th className="p-4">Pilot measure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-surface/50">
                  <td className="p-4 font-semibold text-foreground">Cash & Split Payment Drift</td>
                  <td className="p-4 text-muted-foreground text-xs">How cash and operator settlement records are currently matched to sales.</td>
                  <td className="p-4 text-xs font-medium text-foreground">Recorded payment method, split tender, amount paid and change.</td>
                  <td className="p-4 text-xs">Mismatch rate between BeBoss sales, cash counts and MoMo settlement records.</td>
                </tr>
                <tr className="hover:bg-surface/50">
                  <td className="p-4 font-semibold text-foreground">Customer Debt (Amadeni)</td>
                  <td className="p-4 text-muted-foreground text-xs">Outstanding receivables, collection timing and staff time spent following up.</td>
                  <td className="p-4 text-xs font-medium text-foreground">Customer balances, credit limits, payments and optional reminders.</td>
                  <td className="p-4 text-xs">Collection rate and time spent; reminders do not guarantee repayment.</td>
                </tr>
                <tr className="hover:bg-surface/50">
                  <td className="p-4 font-semibold text-foreground">Stockout & Shelf Depletion</td>
                  <td className="p-4 text-muted-foreground text-xs">Opening quantities, units, purchase costs, physical counts and reorder frequency.</td>
                  <td className="p-4 text-xs font-medium text-foreground">Product catalogue, recorded purchases, sales and stock adjustments.</td>
                  <td className="p-4 text-xs">Stock variance and reorder frequency; insights depend on accurate entries.</td>
                </tr>
                <tr className="hover:bg-surface/50">
                  <td className="p-4 font-semibold text-foreground">Staff Voids & Fraud Control</td>
                  <td className="p-4 text-muted-foreground text-xs">Existing till-close, refund, void and staff-activity records.</td>
                  <td className="p-4 text-xs font-medium text-foreground">Operator activity and recorded refund or void events.</td>
                  <td className="p-4 text-xs">Reconciliation time and differences found; records do not prevent every loss.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}
