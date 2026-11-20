import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Activity, Boxes, CheckCircle2, Clock, GitBranch, KeyRound, RefreshCw, Smartphone, Store, WifiOff, Zap } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useNow } from "@/hooks/use-now";
import { useI18n } from "@/lib/i18n";
import { platformStatsQuery } from "@/lib/queries";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "BeBoss live status — cloud sync health" },
      { name: "description", content: "Real-time health of the BeBoss cloud: shops online, devices synced, sync activity over the last 14 days and cloud response time." },
      { property: "og:title", content: "BeBoss live status" },
      { property: "og:description", content: "See the BeBoss cloud working in real time — shops, devices and phone-to-cloud sync activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(platformStatsQuery),
  component: StatusPage,
});

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 12 };

function StatusPage() {
  const { t } = useI18n();
  const { data, isFetching } = useSuspenseQuery(platformStatsQuery);
  const now = useNow(15_000);
  const s = data.stats;
  const tiles = s
    ? [
        { icon: Store, label: t("statusShops"), value: s.shops_total },
        { icon: Zap, label: t("statusActiveShops"), value: s.shops_active },
        { icon: GitBranch, label: t("statusBranches"), value: s.branches_total },
        { icon: Smartphone, label: t("statusDevices"), value: s.devices_active },
        { icon: Activity, label: t("statusSynced24h"), value: s.devices_synced_24h },
        { icon: Boxes, label: t("statusEvents24h"), value: s.sync_events_24h },
        { icon: KeyRound, label: t("statusCodes"), value: s.codes_redeemed },
        { icon: Clock, label: t("statusLastSync"), value: s.last_sync_at ? relativeTime(s.last_sync_at, now) : "—" },
      ]
    : [];

  return (
    <SiteLayout>
      <PageHero eyebrow={t("statusEyebrow")} title={t("statusTitle")} sub={t("statusSub")}>
        <div className={cn("mt-8 inline-flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm", data.ok ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10")}>
          {data.ok ? (
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-success" />
            </span>
          ) : (
            <WifiOff className="size-4 text-warning" />
          )}
          <span className="font-medium">{data.ok ? t("statusOperational") : t("statusDegraded")}</span>
          <span className="text-muted-foreground">
            · {t("statusLatency")}: <span className="font-mono">{data.latencyMs} ms</span>
          </span>
          <RefreshCw className={cn("size-3.5 text-muted-foreground", isFetching && "animate-spin")} aria-hidden="true" />
        </div>
      </PageHero>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((x) => (
            <div key={x.label} className="rounded-2xl border border-border bg-card p-5">
              <x.icon className="size-5 text-primary" />
              <p className="mt-3 font-display text-3xl font-bold">{typeof x.value === "number" ? x.value.toLocaleString() : x.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{x.label}</p>
            </div>
          ))}
        </div>

        {s ? (
          <div className="mt-6 rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold">{t("statusActivity")}</h2>
              <p className="text-xs text-muted-foreground">{t("statusAuto")}</p>
            </div>
            <div className="mt-5 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.activity_14d}>
                  <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent)" }} />
                  <Bar dataKey="events" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-border bg-surface-2 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="size-5 text-success" /> {t("statusHowTitle")}
            </h2>
            <p className="mt-2 text-muted-foreground">{t("statusHowBody")}</p>
            <Link to="/how-it-works" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              {t("navHow")} →
            </Link>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">{t("faqStill")}</h2>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <Link to="/faq" className="text-primary hover:underline">{t("navFaq")} →</Link>
              <Link to="/changelog" className="text-primary hover:underline">{t("navChangelog")} →</Link>
              <Link to="/contact" className="text-primary hover:underline">{t("faqContact")} →</Link>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
