import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, Crown, ShoppingCart, Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "BeBoss guide — playbooks for owners, managers and cashiers" },
      { name: "description", content: "Step-by-step BeBoss playbooks: setting up a shop, daily cashier routine, debt collection, restocking with forecasts, adding devices and paying your license." },
      { property: "og:title", content: "BeBoss POS guide & FAQ" },
      { property: "og:description", content: "Learn BeBoss step by step and find answers to common questions." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuidePage,
});

const ROLE_ICONS = [Crown, Briefcase, ShoppingCart];

function GuidePage() {
  const { t, p } = useI18n();
  return (
    <SiteLayout>
      <PageHero eyebrow={t("navGuide")} title={t("guideTitle")} sub={t("guideSub")} />
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {p.guide.playbooks.map((pb, pi) => {
            const Icon = ROLE_ICONS[pi] ?? Crown;
            return (
            <article key={pi} className="rounded-3xl border border-border bg-card p-7">
              <Icon className="size-7 text-primary" />
              <h2 className="mt-4 text-xl font-bold">{pb.role}</h2>
              <ol className="mt-5 space-y-3">
                {pb.steps.map((s, i) => (
                  <li key={s} className="flex gap-3 text-sm text-muted-foreground">
                    <span className="mt-0.5 font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </article>
            );
          })}
        </div>
        <section className="mt-16 rounded-3xl border border-primary/30 bg-surface-2 p-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Lightbulb className="size-6 text-warning" /> {p.guide.tipsTitle}
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {p.guide.tips.map((tip) => (
              <li key={tip} className="rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm">
                {tip}
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-16 grid gap-8 lg:grid-cols-[300px_1fr]">
          <h2 className="text-3xl font-bold">{t("faq")}</h2>
          <Accordion type="single" collapsible className="rounded-3xl border border-border bg-card px-6">
            {p.guide.faq.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-left">{q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </div>
    </SiteLayout>
  );
}
