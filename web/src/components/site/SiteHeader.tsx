import { Link } from "@tanstack/react-router";
import { Download, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ThemeToggle } from './ThemeToggle';
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const { t, p } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
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
    <header className={cn("site-nav fixed inset-x-0 top-0 z-50 border-b border-border bg-background transition-shadow", scrolled && "shadow-sm")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground bg-accent/60" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <nav className="compact-nav" aria-label={p.common.menu}>{links.slice(0,3).map(l=><Link key={l.to} to={l.to} activeProps={{className:'text-primary'}}>{l.label}</Link>)}</nav>
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher /><ThemeToggle />
          <Button asChild variant="hero" size="sm" className="hidden sm:inline-flex">
            <Link to="/download">
              <Download />
              {t("ctaDownload")}
            </Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={p.common.openMenu}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="sr-only">{p.common.menu}</SheetTitle>
              <div className="mt-8 flex flex-col gap-1">
                {links.map((l) => (
                  <Link key={l.to} to={l.to} className="rounded-lg px-3 py-2.5 text-base hover:bg-accent" activeProps={{ className: "text-primary" }}>
                    {l.label}
                  </Link>
                ))}
                <div className="my-2 border-t border-border" />
                {([["/faq", t("navFaq")], ["/status", t("navStatus")], ["/changelog", t("navChangelog")]] as const).map(([to, label]) => (
                  <Link key={to} to={to} className="rounded-lg px-3 py-2.5 text-base text-muted-foreground hover:bg-accent" activeProps={{ className: "text-primary" }}>
                    {label}
                  </Link>
                ))}
                <Link to="/admin" className="rounded-lg px-3 py-2.5 text-base text-muted-foreground hover:bg-accent">
                  {t("navAdmin")}
                </Link>
                <Button asChild variant="hero" className="mt-4">
                  <Link to="/download">
                    <Download />
                    {t("ctaDownload")}
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
