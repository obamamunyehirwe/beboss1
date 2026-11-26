import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceUnavailable } from '@/components/site/ServiceUnavailable';
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import { DOWNLOAD_PATH } from "@/lib/download-path";
import { publicSiteQuery } from "@/lib/queries";
import { formatBytes, formatDate } from "@/lib/format";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "What's new in BeBoss POS — release notes" },
      { name: "description", content: "Release notes for every BeBoss POS Android version: new features, fixes and a direct APK download." },
      { property: "og:title", content: "BeBoss POS release notes" },
      { property: "og:description", content: "Every Android release of BeBoss, what changed and where to download it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: () => <ServiceUnavailable title="navChangelog" />,
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQuery),
  component: ChangelogPage,
});

function ChangelogPage() {
  const { t } = useI18n();
  const { data } = useSuspenseQuery(publicSiteQuery);
  return (
    <SiteLayout>
      <PageHero eyebrow={t("changelogEyebrow")} title={t("changelogTitle")} sub={t("changelogSub")}>
        {data.current ? (
          <Button asChild variant="hero" className="mt-8">
            <a href={`${DOWNLOAD_PATH}?ch=changelog`}>
              <Download /> {t("changelogDownload")} · v{data.current.version_name}
            </a>
          </Button>
        ) : null}
      </PageHero>
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        {data.releases.length ? (
          <ol className="relative space-y-6 border-l border-border pl-6">
            {data.releases.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -left-[31px] top-1.5 grid size-4 place-items-center rounded-full border-2 border-primary bg-background" aria-hidden="true" />
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-bold">v{r.version_name}</h2>
                    {data.current?.id === r.id ? <Badge variant="success">{t("changelogCurrent")}</Badge> : null}
                    <span className="text-sm text-muted-foreground">{formatDate(r.published_at)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.min_android} · {formatBytes(r.size_bytes)} · {r.download_count.toLocaleString()} {t("changelogDownloads")}
                  </p>
                  {r.release_notes ? <p className="mt-3 whitespace-pre-line text-sm">{r.release_notes}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="grid place-items-center rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <Package className="size-10" />
            <p className="mt-3">{t("changelogEmpty")}</p>
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
