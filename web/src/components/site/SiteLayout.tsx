import { liveConfigured } from '@/lib/live-config';
import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { AnnouncementBanner } from "./AnnouncementBanner";

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pt-16">
        {liveConfigured && <AnnouncementBanner />}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function PageHero({ eyebrow, title, sub, children }: { eyebrow?: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <section className="interior-hero relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 bg-ember" aria-hidden="true" />
      <div className="absolute inset-0 bg-grid mask-fade-b" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        {eyebrow ? <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p> : null}
        <h1 className="max-w-3xl text-4xl font-bold sm:text-5xl">{title}</h1>
        {sub ? <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{sub}</p> : null}
        {children}
      </div>
    </section>
  );
}
