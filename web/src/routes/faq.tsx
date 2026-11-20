import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { FAQ } from "@/components/site/faq-content";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "BeBoss FAQ — offline POS, MoMo payments and unlock codes" },
      { name: "description", content: "Answers about selling offline, pricing, MTN MoMo and Airtel payments, unlock codes, branches, staff and data security in BeBoss POS." },
      { property: "og:title", content: "BeBoss POS — frequently asked questions" },
      { property: "og:description", content: "Straight answers for shop owners about offline selling, payments, branches and data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return FAQ[lang].filter((x) => !s || x.q.toLowerCase().includes(s) || x.a.toLowerCase().includes(s));
  }, [q, lang]);

  return (
    <SiteLayout>
      <PageHero eyebrow={t("faqEyebrow")} title={t("faqTitle")} sub={t("faqSub")}>
        <div className="relative mt-8 max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("faqSearch")} className="h-12 rounded-2xl pl-11 text-base" aria-label={t("faqSearch")} />
        </div>
      </PageHero>
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        {items.length ? (
          <Accordion type="single" collapsible className="space-y-3">
            {items.map((x, i) => (
              <AccordionItem key={x.q} value={`q${i}`} className="rounded-2xl border border-border bg-card px-5">
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">{x.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{x.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">{t("faqEmpty")}</p>
        )}
        <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface-2 p-8 text-center">
          <h2 className="text-xl font-bold">{t("faqStill")}</h2>
          <Button asChild variant="hero">
            <Link to="/contact">
              <MessageCircle /> {t("faqContact")}
            </Link>
          </Button>
        </div>
      </section>
    </SiteLayout>
  );
}
