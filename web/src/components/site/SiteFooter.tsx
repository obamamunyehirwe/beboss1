import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Logo } from "./Logo";

export function SiteFooter() {
  const { t, p } = useI18n();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{t("footerTag")}</p>
          <p className="font-mono text-xs text-muted-foreground">EN • RW • FR • SW</p>
        </div>
        <FooterCol title={p.common.footProduct} links={[["/features", t("navFeatures")], ["/how-it-works", t("navHow")], ["/pricing", t("navPricing")], ["/download", t("navDownload")]]} />
        <FooterCol title={p.common.footOwners} links={[["/my-shop", t("navMyShop")], ["/guide", t("navGuide")], ["/contact", t("navContact")]]} />
        <FooterCol title={p.common.footResources} links={[["/faq", t("navFaq")], ["/status", t("navStatus")], ["/changelog", t("navChangelog")]]} />
        <FooterCol title={p.common.footTeam} links={[["/admin", t("navAdmin")]]} />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} BeBoss POS. {t("rights")}</span>
          <span>Kigali, Rwanda</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="mb-3 font-display text-sm font-semibold">{title}</h4>
      <ul className="space-y-2">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
