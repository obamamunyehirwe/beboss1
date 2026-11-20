import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, Megaphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { websiteAnnouncementsQuery, type Announcement } from "@/lib/announcements";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const STYLE: Record<string, { cls: string; Icon: typeof Info }> = {
  INFO: { cls: "border-info/40 bg-info/10 text-foreground", Icon: Info },
  SUCCESS: { cls: "border-success/40 bg-success/10 text-foreground", Icon: CheckCircle2 },
  WARNING: { cls: "border-warning/40 bg-warning/10 text-foreground", Icon: AlertTriangle },
  CRITICAL: { cls: "border-destructive/50 bg-destructive/15 text-foreground", Icon: Megaphone },
};
const ICON_TONE: Record<string, string> = { INFO: "text-info", SUCCESS: "text-success", WARNING: "text-warning", CRITICAL: "text-destructive" };

export function AnnouncementCard({ a, onDismiss, compact }: { a: Announcement; onDismiss?: () => void; compact?: boolean }) {
  const s = STYLE[a.severity] ?? STYLE["INFO"]!;
  const { p, lang } = useI18n();
  const tr = lang === "en" ? null : (a.translations as Record<string, { title?: string; body?: string; cta_label?: string }> | null)?.[lang];
  const title = tr?.title || a.title;
  const body = tr?.body || a.body;
  const ctaLabel = tr?.cta_label || a.cta_label;
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3", s.cls, compact && "rounded-xl py-2")}>
      <s.Icon className={cn("mt-0.5 size-4 shrink-0", ICON_TONE[a.severity])} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{title}</p>
        {body ? <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{body}</p> : null}
      </div>
      {a.cta_label && a.cta_url ? (
        <a href={a.cta_url} className="shrink-0 self-center rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-foreground/20" {...(a.cta_url.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
          {ctaLabel}
        </a>
      ) : null}
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label={p.common.dismiss}>
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

const KEY = "beboss.dismissedAnnouncements";

/** Live website banner: refreshes instantly when an admin publishes or edits an announcement. */
export function AnnouncementBanner() {
  const qc = useQueryClient();
  const { data } = useQuery(websiteAnnouncementsQuery);
  const [dismissed, setDismissed] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[]);
    } catch {
      setDismissed([]);
    }
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel(`announcements-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => qc.invalidateQueries({ queryKey: ["announcements"] }))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  if (!dismissed) return null;
  const items = (data ?? []).filter((a) => !dismissed.includes(a.id)).slice(0, 2);
  if (!items.length) return null;
  return (
    <div className="mx-auto max-w-7xl space-y-2 px-4 pt-4 sm:px-6">
      {items.map((a) => (
        <AnnouncementCard
          key={a.id}
          a={a}
          compact
          onDismiss={() => {
            const next = [...dismissed, a.id].slice(-50);
            setDismissed(next);
            window.localStorage.setItem(KEY, JSON.stringify(next));
          }}
        />
      ))}
    </div>
  );
}
