import { Link } from "@tanstack/react-router";
import { ArrowRight, Download, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const { t, p } = useI18n();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { to: "/features", label: t("navFeatures") },
    { to: "/how-it-works", label: t("navHow") },
    { to: "/pricing", label: t("navPricing") },
    { to: "/download", label: t("navDownload") },
    { to: "/guide", label: t("navGuide") },
    { to: "/my-shop", label: t("navMyShop") },
    { to: "/contact", label: t("navContact") },
  ] as const;

  return (
    <header
      className={cn(
        "site-nav fixed inset-x-0 top-0 z-50 border-b border-border/70 transition-all duration-300",
        scrolled && "site-nav-scrolled",
      )}
    >
      <div className="site-nav-inner mx-auto flex h-[76px] max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6 xl:px-8">
        <div className="site-brand-wrap">
          <Logo />
          <span className="site-brand-caption">{t("footerTag")}</span>
        </div>

        <nav className="site-primary-nav" aria-label={p.common.menu}>
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="site-nav-link"
              activeProps={{ className: "site-nav-link site-nav-link-active" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="site-nav-actions">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button asChild variant="hero" size="sm" className="site-download-cta">
            <Link to="/download">
              <Download />
              <span>{t("ctaDownload")}</span>
              <ArrowRight className="site-cta-arrow" />
            </Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="site-menu-trigger"
                aria-label={p.common.openMenu}
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="site-mobile-sheet w-[min(88vw,390px)] p-0">
              <SheetTitle className="sr-only">{p.common.menu}</SheetTitle>
              <div className="site-sheet-head">
                <Logo suffix="Menu" />
                <p>{t("footerTag")}</p>
              </div>
              <nav className="site-sheet-links" aria-label={p.common.menu}>
                {links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="site-sheet-link"
                    activeProps={{ className: "site-sheet-link site-sheet-link-active" }}
                  >
                    <span>{link.label}</span>
                    <ArrowRight size={16} />
                  </Link>
                ))}
                <Link to="/admin" className="site-sheet-link site-sheet-admin">
                  <span>{t("navAdmin")}</span>
                  <ArrowRight size={16} />
                </Link>
              </nav>
              <div className="site-sheet-foot">
                <Button asChild variant="hero" className="w-full">
                  <Link to="/download">
                    <Download />
                    {t("ctaDownload")}
                  </Link>
                </Button>
                <div className="site-sheet-controls">
                  <LanguageSwitcher />
                  <ThemeToggle />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
