import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Command,
  Download,
  FileText,
  Home,
  LifeBuoy,
  Menu,
  Package2,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { retailCopy } from "@/lib/i18n-dict";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

type SitePath =
  | "/"
  | "/features"
  | "/how-it-works"
  | "/pricing"
  | "/download"
  | "/guide"
  | "/faq"
  | "/changelog"
  | "/status"
  | "/my-shop"
  | "/contact"
  | "/admin";

type HeaderLink = { to: SitePath; label: string; description: string; icon: LucideIcon };

export function SiteHeader() {
  const { t, p, lang } = useI18n();
  const c = retailCopy[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);

  const productLinks = [
    { to: "/features" as const, label: t("navFeatures"), description: c.headerFeaturesDesc, icon: Boxes },
    { to: "/how-it-works" as const, label: t("navHow"), description: c.headerHowDesc, icon: Zap },
    { to: "/pricing" as const, label: t("navPricing"), description: c.headerPricingDesc, icon: ShoppingBag },
  ];

  const resourceLinks = [
    { to: "/guide" as const, label: t("navGuide"), description: c.headerGuideDesc, icon: BookOpen },
    { to: "/faq" as const, label: t("navFaq"), description: c.headerFaqDesc, icon: CircleHelp },
    { to: "/changelog" as const, label: t("navChangelog"), description: c.headerUpdatesDesc, icon: FileText },
    { to: "/status" as const, label: t("navStatus"), description: c.headerStatusDesc, icon: Activity },
    { to: "/contact" as const, label: t("navContact"), description: c.headerContactDesc, icon: LifeBuoy },
  ];

  const productActive = productLinks.some((item) => location.pathname === item.to);
  const resourcesActive = resourceLinks.some((item) => location.pathname === item.to);

  const allLinks = [
    { to: "/" as const, label: p.common.goHome, description: c.headerHomeDesc, icon: Home },
    ...productLinks,
    { to: "/download" as const, label: t("navDownload"), description: c.headerDownloadDesc, icon: Download },
    ...resourceLinks,
    { to: "/my-shop" as const, label: t("navMyShop"), description: c.headerShopDesc, icon: Store },
    { to: "/admin" as const, label: t("navAdmin"), description: c.headerAdminDesc, icon: ShieldCheck },
  ];

  const query = searchQuery.trim().toLocaleLowerCase();
  const filteredLinks = query
    ? allLinks
        .filter((item) => `${item.label} ${item.description} ${item.to}`.toLocaleLowerCase().includes(query))
        .slice(0, 8)
    : allLinks.slice(0, 6);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => searchInput.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  const goTo = (to: SitePath) => {
    setSearchOpen(false);
    setSearchQuery("");
    setMobileOpen(false);
    void navigate({ to });
  };

  const menuLink = (item: HeaderLink) => (
    <DropdownMenuItem key={item.to} asChild>
      <Link to={item.to} className="site-mega-link" activeProps={{ className: "site-mega-link site-mega-link-active" }}>
        <span className="site-mega-icon"><item.icon size={18} /></span>
        <span className="site-mega-copy">
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </span>
        <ArrowUpRight className="site-mega-arrow" size={15} />
      </Link>
    </DropdownMenuItem>
  );

  return (
    <header
      className={cn(
        "site-nav site-header-shell fixed inset-x-0 top-0 z-50",
        scrolled && "site-nav-scrolled",
      )}
    >
      <div className="site-utility-bar">
        <div className="site-utility-inner">
          <span className="site-utility-promise">
            <span className="site-utility-spark"><Zap size={12} fill="currentColor" /></span>
            {c.headerUtility}
          </span>
          <div className="site-utility-points">
            <span><CheckCircle2 size={13} /> {c.headerOffline}</span>
            <span><Command size={13} /> {c.headerLanguages}</span>
            <Link to="/status"><Activity size={13} /> {t("navStatus")} <ArrowUpRight size={11} /></Link>
          </div>
        </div>
      </div>

      <div className="site-header-main">
        <div className="site-nav-inner">
          <div className="site-brand-wrap">
            <Logo />
            <span className="site-brand-caption">{c.headerBrandCaption}</span>
          </div>

          <nav className="site-desktop-nav" aria-label={p.common.menu}>
            <Link to="/" activeOptions={{ exact: true }} className="site-nav-home" activeProps={{ className: "site-nav-home site-nav-home-active" }}>
              {p.common.goHome}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={cn("site-nav-trigger", productActive && "site-nav-trigger-active")}>
                  <Package2 size={16} />
                  <span>{c.headerProduct}</span>
                  <ChevronDown size={14} className="site-nav-chevron" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={13} className="site-mega-menu site-product-menu">
                <div className="site-mega-heading">
                  <span>{c.headerProductEyebrow}</span>
                  <strong>{c.headerProductIntro}</strong>
                </div>
                <div className="site-mega-grid">{productLinks.map(menuLink)}</div>
                <Link to="/download" className="site-mega-feature">
                  <span><Download size={17} /></span>
                  <span><strong>{t("ctaDownload")}</strong><small>{c.headerDownloadDesc}</small></span>
                  <ArrowRight size={16} />
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>

            <Link to="/pricing" className="site-nav-direct" activeProps={{ className: "site-nav-direct site-nav-direct-active" }}>
              {t("navPricing")}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={cn("site-nav-trigger", resourcesActive && "site-nav-trigger-active")}>
                  <BookOpen size={16} />
                  <span>{c.headerResources}</span>
                  <ChevronDown size={14} className="site-nav-chevron" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" sideOffset={13} className="site-mega-menu site-resource-menu">
                <div className="site-mega-heading">
                  <span>{c.headerResourceEyebrow}</span>
                  <strong>{c.headerResourceIntro}</strong>
                </div>
                <div className="site-mega-grid site-resource-grid">{resourceLinks.map(menuLink)}</div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Link to="/my-shop" className="site-nav-direct site-nav-shop" activeProps={{ className: "site-nav-direct site-nav-shop site-nav-direct-active" }}>
              <Store size={15} />
              {t("navMyShop")}
            </Link>
          </nav>

          <div className="site-nav-actions">
            <Button
              type="button"
              variant="outline"
              className="site-search-trigger"
              onClick={() => { setMobileOpen(false); setSearchOpen(true); }}
              aria-label={c.headerSearch}
            >
              <Search size={17} />
              <span>{c.headerSearch}</span>
              <kbd>⌘ K</kbd>
            </Button>
            <div className="site-desktop-utilities">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <Button asChild variant="hero" className="site-download-cta">
              <Link to="/download">
                <Download size={16} />
                <span>{t("ctaDownload")}</span>
                <ArrowRight className="site-cta-arrow" size={15} />
              </Link>
            </Button>

            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="site-menu-trigger" aria-label={p.common.menu}>
                  <Menu size={19} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="site-mobile-sheet site-mobile-panel w-[min(92vw,430px)] p-0">
                <SheetTitle className="sr-only">{p.common.menu}</SheetTitle>
                <div className="site-mobile-panel-head">
                  <div><Logo suffix="Menu" /><p>{c.headerMobileIntro}</p></div>
                </div>
                <div className="site-mobile-panel-body">
                  <Link to="/" onClick={() => setMobileOpen(false)} className="site-mobile-link site-mobile-home">
                    <span className="site-mobile-link-icon"><Home size={17} /></span>
                    <span>{p.common.goHome}</span>
                    <ArrowUpRight size={15} />
                  </Link>
                  <div className="site-mobile-section">
                    <p>{c.headerProduct}</p>
                    {productLinks.map((item) => (
                      <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className="site-mobile-link">
                        <span className="site-mobile-link-icon"><item.icon size={17} /></span>
                        <span>{item.label}<small>{item.description}</small></span>
                        <ArrowUpRight size={15} />
                      </Link>
                    ))}
                  </div>
                  <div className="site-mobile-section">
                    <p>{c.headerResources}</p>
                    {resourceLinks.map((item) => (
                      <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className="site-mobile-link">
                        <span className="site-mobile-link-icon"><item.icon size={17} /></span>
                        <span>{item.label}<small>{item.description}</small></span>
                        <ArrowUpRight size={15} />
                      </Link>
                    ))}
                    <Link to="/my-shop" onClick={() => setMobileOpen(false)} className="site-mobile-link">
                      <span className="site-mobile-link-icon"><Store size={17} /></span>
                      <span>{t("navMyShop")}<small>{c.headerShopDesc}</small></span>
                      <ArrowUpRight size={15} />
                    </Link>
                  </div>
                  <Link to="/admin" onClick={() => setMobileOpen(false)} className="site-mobile-admin">
                    <ShieldCheck size={16} /> {t("navAdmin")} <ArrowUpRight size={14} />
                  </Link>
                </div>
                <div className="site-mobile-panel-foot">
                  <Button asChild variant="hero" className="w-full site-mobile-download">
                    <Link to="/download" onClick={() => setMobileOpen(false)}>
                      <Download size={17} /> {t("ctaDownload")} <ArrowRight size={16} />
                    </Link>
                  </Button>
                  <div className="site-mobile-controls">
                    <LanguageSwitcher />
                    <ThemeToggle />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {searchOpen ? (
        <div className="site-search-overlay" onMouseDown={() => setSearchOpen(false)}>
          <section
            className="site-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={c.headerSearch}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="site-search-topline">
              <span><Search size={16} /> {c.headerSearchHint}</span>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label={c.headerClose}><X size={18} /></button>
            </div>
            <div className="site-search-input-wrap">
              <Search size={20} />
              <input
                ref={searchInput}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={c.headerSearchPlaceholder}
                aria-label={c.headerSearchPlaceholder}
              />
              <kbd>ESC</kbd>
            </div>
            <div className="site-search-results">
              <p>{searchQuery.trim() ? c.headerSearchResults : c.headerQuickAccess}</p>
              {filteredLinks.length ? filteredLinks.map((item) => (
                <button type="button" key={item.to} className="site-search-result" onClick={() => goTo(item.to)}>
                  <span className="site-search-result-icon"><item.icon size={17} /></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <ArrowUpRight size={15} />
                </button>
              )) : (
                <div className="site-search-empty">{c.headerNoResults}</div>
              )}
            </div>
            <div className="site-search-footer">
              <span><kbd>CTRL</kbd> + <kbd>K</kbd> {c.headerToSearch}</span>
              <span>{c.headerPageCount}</span>
            </div>
          </section>
        </div>
      ) : null}
    </header>
  );
}
