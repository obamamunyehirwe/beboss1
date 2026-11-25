import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, Megaphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { websiteAnnouncementsQuery, type Announcement } from "@/lib/announcements";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const STYLE: Record<string, { Icon: typeof Info; label: string; tone: string; marker: string }> = {
  INFO: { Icon: Info, label: "Information", tone: "info", marker: "bg-sky-500" },
  SUCCESS: { Icon: CheckCircle2, label: "Service update", tone: "success", marker: "bg-emerald-500" },
  WARNING: { Icon: AlertTriangle, label: "Important notice", tone: "warning", marker: "bg-amber-500" },
  CRITICAL: { Icon: Megaphone, label: "Critical announcement", tone: "critical", marker: "bg-rose-500" },
};

export function AnnouncementCard({ a, onDismiss }: { a: Announcement; onDismiss?: () => void }) {
  const { p, lang } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const style = STYLE[a.severity] ?? STYLE.INFO!;
  const Icon = style.Icon;
  const tr = lang === "en" ? null : (a.translations as Record<string, { title?: string; body?: string; cta_label?: string }> | null)?.[lang];
  const title = tr?.title || a.title;
  const body = tr?.body || a.body;
  const ctaLabel = tr?.cta_label || a.cta_label;
  const canExpand = body.length > 190;
  const role = a.severity === "CRITICAL" ? "alert" : "status";

  return (
    <article className={cn("announcement-card group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-all duration-300 sm:p-5", "announcement-card-" + style.tone)} role={role}>
      <span className={cn("announcement-card-marker absolute inset-y-0 left-0 w-1", style.marker)} aria-hidden="true" />
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="announcement-card-icon mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="announcement-card-label">{style.label}</span>
            <span className="announcement-card-date">{new Date(a.starts_at).toLocaleDateString()}</span>
          </div>
          <h3 className="text-base font-bold tracking-tight text-foreground sm:text-lg">{title}</h3>
          {body ? <p className={cn("mt-1.5 whitespace-pre-line text-sm leading-6 text-muted-foreground", canExpand && !expanded && "announcement-card-clamped")}>{body}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {a.cta_label && a.cta_url ? (
              <a href={a.cta_url} className="announcement-card-cta inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all" {...(a.cta_url.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                {ctaLabel}<ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
            {canExpand && <button type="button" className="announcement-card-expand rounded-full px-3 py-2 text-xs font-semibold" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Show less" : "Read full update"}</button>}
          </div>
        </div>
        {onDismiss && <button type="button" onClick={onDismiss} className="announcement-card-dismiss rounded-full p-2 transition-colors" aria-label={p.common.dismiss}><X className="size-4" /></button>}
      </div>
    </article>
  );
}

const KEY = "beboss.dismissedAnnouncements";

/** Live, dismissible BeBoss announcements rendered in their own page section, below the homepage hero. */
export function AnnouncementBanner() {
  const qc = useQueryClient();
  const { data } = useQuery(websiteAnnouncementsQuery);
  const [dismissed, setDismissed] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
      setDismissed(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []);
    } catch {
      setDismissed([]);
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("beboss-public-announcements")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => {
        void qc.invalidateQueries({ queryKey: ["announcements"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);

  if (!dismissed) return null;
  const items = (data ?? []).filter((announcement) => !dismissed.includes(announcement.id)).slice(0, 2);
  if (!items.length) return null;

  return (
    <section className="announcement-section mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" aria-label="Latest BeBoss announcements">
      <div className="announcement-section-heading">
        <div><span className="section-kicker"><Megaphone className="size-4" /> BeBoss updates</span><h2>Important updates for your business</h2></div>
        <span className="announcement-section-live"><i /> Live announcements</span>
      </div>
      <div className="announcement-card-grid">
        {items.map((announcement) => (
          <AnnouncementCard key={announcement.id} a={announcement} onDismiss={() => {
            const next = [...dismissed, announcement.id].slice(-50);
            setDismissed(next);
            window.localStorage.setItem(KEY, JSON.stringify(next));
          }} />
        ))}
      </div>
    </section>
  );
}