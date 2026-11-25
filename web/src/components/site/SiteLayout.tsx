import { Cloud, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-public-shell flex min-h-screen flex-col">
      <SiteHeader />
      <main className="site-public-main flex-1 pt-[108px]">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <section className="site-page-hero relative isolate overflow-hidden border-b border-border">
      <div className="site-page-hero-glow" aria-hidden="true" />
      <div className="site-page-hero-grid" aria-hidden="true" />
      <div className="site-page-hero-inner mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)] lg:gap-12 lg:py-20">
        <div className="site-page-hero-copy relative z-10">
          {eyebrow ? (
            <p className="site-page-eyebrow mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em]">
              <span className="site-page-eyebrow-dot" aria-hidden="true" />
              {eyebrow}
            </p>
          ) : null}
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.04] tracking-tight sm:text-5xl lg:text-[3.6rem]">
            {title}
          </h1>
          {sub ? <p className="site-page-hero-sub mt-5 max-w-2xl text-base leading-7 sm:text-lg">{sub}</p> : null}
          {children ? <div className="site-page-hero-actions relative z-10 mt-7">{children}</div> : null}
        </div>

        <PageHeroVisual />
      </div>
      <div className="site-page-hero-bottom" aria-hidden="true" />
    </section>
  );
}

function PageHeroVisual() {
  return (
    <div className="page-hero-visual" aria-hidden="true">
      <div className="page-hero-visual-photo-shell">
        <img
          className="page-hero-visual-photo"
          src="/Friendly%20Modern%20Store%20Checkout.png"
          alt=""
          loading="lazy"
          decoding="async"
          width={1200}
          height={800}
        />
        <div className="page-hero-visual-brand">
          <img src="/beboss-app-logo.png" alt="" width={38} height={38} loading="lazy" />
          <span>
            <strong>BeBoss POS</strong>
            <small>BUSINESS · SALES · INVENTORY</small>
          </span>
        </div>
      </div>
      <div className="page-hero-float page-hero-float-cloud"><Cloud size={19} /><span /></div>
      <div className="page-hero-float page-hero-float-shield"><ShieldCheck size={20} /></div>
    </div>
  );
}
