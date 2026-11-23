import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  FileDown,
  Printer,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ServiceUnavailable } from "@/components/site/ServiceUnavailable";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import { DOWNLOAD_PATH, publicSiteQuery } from "@/lib/queries";
import { formatBytes, formatDate } from "@/lib/format";
import "./download-page.css";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download BeBoss POS for Android — official app release" },
      {
        name: "description",
        content:
          "Get the official BeBoss Android POS installer, inspect release information, verify its SHA-256 checksum and scan a branded QR code for the direct download.",
      },
      { property: "og:title", content: "Download BeBoss POS for Android" },
      {
        property: "og:description",
        content:
          "Official Android installer with release details, SHA-256 integrity information and a branded direct-download QR code.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/beboss-app-icon.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => <ServiceUnavailable title="downloadTitle" />,
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQuery),
  component: DownloadPage,
});

function DownloadPage() {
  const { t, p } = useI18n();
  const { data } = useSuspenseQuery(publicSiteQuery);
  const release = data.current;
  const [origin, setOrigin] = useState("");
  const [copiedHash, setCopiedHash] = useState(false);
  const [testHash, setTestHash] = useState("");
  const normalizedHash = testHash.trim().toLowerCase();
  const isHashMatch = Boolean(
    release && normalizedHash.length === 64 && normalizedHash === release.sha256.toLowerCase(),
  );
  const hasHashMismatch = Boolean(
    release && normalizedHash.length === 64 && normalizedHash !== release.sha256.toLowerCase(),
  );
  const downloadUrl = `${DOWNLOAD_PATH}?ch=web`;
  const qrUrl = origin && release ? `${origin}${DOWNLOAD_PATH}?ch=qr` : "";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const copyHash = async () => {
    if (!release) return;
    try {
      await navigator.clipboard.writeText(release.sha256);
      setCopiedHash(true);
      toast.success("SHA-256 checksum copied");
      window.setTimeout(() => setCopiedHash(false), 1600);
    } catch {
      toast.error("Clipboard access was blocked. Select the SHA-256 value and copy it manually.");
    }
  };

  const copyDownloadLink = async () => {
    if (!qrUrl) return;
    try {
      await navigator.clipboard.writeText(qrUrl);
      toast.success("Direct download link copied");
    } catch {
      toast.error("Clipboard access was blocked. Open the direct download link below to copy it.");
    }
  };

  const olderReleases = data.releases.filter((item) => item.id !== release?.id);

  return (
    <SiteLayout>
      <PageHero eyebrow={t("navDownload")} title={t("downloadTitle")} sub={t("downloadSub")}>
        <div className="flex flex-wrap items-center gap-3">
          {release ? (
            <Button asChild variant="hero" size="lg">
              <a href={downloadUrl}>
                <Download /> Download official APK <ArrowRight />
              </a>
            </Button>
          ) : (
            <span className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning">
              No signed Android release is currently published.
            </span>
          )}
          <Button asChild variant="glass" size="lg">
            <a href="#release-details">Review release integrity</a>
          </Button>
        </div>
      </PageHero>

      <section id="release-details" className="download-page-layout mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.35fr)_minmax(310px,.8fr)]">
        <div className="download-release-card rounded-[2rem] border border-border bg-card bg-card-sheen p-6 sm:p-8 lg:p-9">
          {release ? (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <span className="download-app-art">
                  <img src="/beboss-app-logo.png" alt="BeBoss app logo" width={64} height={64} loading="eager" decoding="async" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-bold">BeBoss POS</h2>
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                      <CheckCircle2 className="size-3.5" /> Published release
                    </span>
                  </div>
                  <p className="mt-1 break-all text-sm text-muted-foreground">{release.file_name}</p>
                </div>
              </div>

              <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Meta label={t("version")} value={`v${release.version_name}`} />
                <Meta label={t("size")} value={formatBytes(Number(release.size_bytes))} />
                <Meta label={t("released")} value={formatDate(release.published_at)} />
                <Meta label="Minimum Android" value={release.min_android} />
              </dl>

              <div className="mt-6 rounded-2xl border border-border bg-background/70 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <ShieldCheck className="size-4 text-success" />
                    SHA-256 release checksum
                  </p>
                  <Button size="sm" variant="ghost" onClick={copyHash}>
                    {copiedHash ? <Check className="text-success" /> : <Copy />}
                    {copiedHash ? "Copied" : t("copy")}
                  </Button>
                </div>
                <p className="mt-3 break-all rounded-xl bg-surface px-3 py-3 font-mono text-xs leading-6 text-foreground" aria-label="Official SHA-256 checksum">
                  {release.sha256}
                </p>
                <div className="mt-4 border-t border-border pt-4">
                  <label htmlFor="test-hash" className="mb-2 block text-xs font-semibold text-foreground">
                    Verify a downloaded APK
                  </label>
                  <input
                    id="test-hash"
                    value={testHash}
                    onChange={(event) => setTestHash(event.target.value)}
                    placeholder="Paste the complete 64-character SHA-256 hash"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {normalizedHash.length > 0 ? (
                    <p className="mt-2 flex items-center gap-2 text-xs font-medium" role="status">
                      {isHashMatch ? (
                        <><CheckCircle2 className="size-4 text-success" /> The entered hash matches the published release checksum.</>
                      ) : hasHashMismatch ? (
                        <><ShieldCheck className="size-4 text-destructive" /> Hash mismatch. Do not install this file until its origin is confirmed.</>
                      ) : (
                        <><FileCheck2 className="size-4 text-muted-foreground" /> Enter all 64 hexadecimal characters to complete the comparison.</>
                      )}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button asChild variant="hero" size="xl" className="w-full sm:w-auto">
                  <a href={downloadUrl}>
                    <Download /> {t("downloadBtn")}
                  </a>
                </Button>
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Wifi className="size-4" /> Internet is required to fetch the APK file.
                </span>
              </div>

              {release.release_notes ? (
                <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
                  <h3 className="font-semibold">{t("whatsNew")}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{release.release_notes}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center py-10 text-center">
              <span className="grid size-16 place-items-center rounded-2xl bg-warning/10 text-warning">
                <FileDown className="size-8" />
              </span>
              <h2 className="mt-5 text-xl font-bold">{t("noRelease")}</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                The release registry does not currently contain a published Android installer. This page will not present a test build as an official download.
              </p>
            </div>
          )}
        </div>

        <aside className="download-side-column space-y-6">
          <section className="download-qr-card rounded-[2rem] border border-border bg-card p-6 text-center sm:p-8" aria-labelledby="download-qr-title">
            <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <QrCode className="size-4" /> Direct APK QR
            </div>
            <div className="download-qr-surface mx-auto grid aspect-square w-full max-w-[270px] place-items-center rounded-3xl border border-slate-200 bg-white p-4 shadow-lg">
              {qrUrl ? (
                <QRCodeSVG
                  value={qrUrl}
                  size={232}
                  level="H"
                  includeMargin
                  bgColor="#ffffff"
                  fgColor="#15231b"
                  imageSettings={{
                    src: "/beboss-app-logo.png",
                    height: 48,
                    width: 48,
                    excavate: true,
                  }}
                  title="Scan to download the official BeBoss Android APK"
                  className="download-qr-code"
                />
              ) : (
                <div className="px-5 text-center text-sm text-slate-600" role="status">
                  {release ? "Preparing the secure download QR code…" : "QR download is unavailable until an official release is published."}
                </div>
              )}
            </div>
            <h2 id="download-qr-title" className="mt-5 text-lg font-bold">{t("scanToInstall")}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Scan with the Android camera. The code opens the same official latest-release download endpoint used by the download button, with the BeBoss logo embedded in the centre.
            </p>
            {qrUrl ? (
              <>
                <div className="mt-4 rounded-xl border border-border bg-surface px-3 py-2 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Encoded download destination</p>
                  <a href={qrUrl} className="mt-1 block break-all text-xs leading-5 text-primary underline-offset-4 hover:underline">{qrUrl}</a>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button variant="glass" size="sm" onClick={copyDownloadLink}>
                    <Copy /> Copy link
                  </Button>
                  <Button variant="glass" size="sm" onClick={() => window.print()}>
                    <Printer /> {p.download.printPoster}
                  </Button>
                </div>
              </>
            ) : null}
          </section>

          <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Smartphone className="size-5" /></span>
              <div>
                <h2 className="font-semibold">{t("installSteps")}</h2>
                <p className="text-xs text-muted-foreground">A secure, device-led installation process</p>
              </div>
            </div>
            <ol className="mt-5 space-y-4">
              {(["install1", "install2", "install3", "install4"] as const).map((key, index) => (
                <li key={key} className="flex gap-3 text-sm">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 font-mono text-xs font-bold text-primary">{index + 1}</span>
                  <span className="min-w-0 pt-1 leading-6 text-muted-foreground">{t(key)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="rounded-[2.5rem] border border-border bg-card p-6 shadow-soft sm:p-10">
          <div className="mb-7 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Smartphone className="size-3.5" /> Android device and peripheral compatibility
            </span>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Designed for real retail counters</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              BeBoss is built for compatible Android phones, rugged handheld terminals and counter tablets. Actual compatibility depends on the device firmware, camera, Android permissions and printer transport; validate the models used by your teams before a broad rollout.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Spec title="Minimum Android" value={release?.min_android ?? "See published release"} detail="Use the version requirement shown for the currently published APK." />
            <Spec title="Local database" value="Room + SQLCipher" detail="Encrypted local business data with keys protected by Android Keystore." />
            <Spec title="Receipt printing" value="58mm / 80mm ESC/POS" detail="Validate Bluetooth SPP or USB OTG support against the exact printer model." />
            <Spec title="Barcode capture" value="CameraX + ML Kit" detail="Camera permission and lighting affect the scanning experience." />
          </div>
        </div>
      </section>

      {olderReleases.length ? (
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <h2 className="mb-4 text-xl font-bold">{t("previousVersions")}</h2>
          <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
            {olderReleases.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm sm:px-6">
                <span className="font-mono">v{item.version_name}</span>
                <span className="text-muted-foreground">
                  {formatDate(item.published_at)} · {formatBytes(Number(item.size_bytes))}
                </span>
                <a className="text-primary hover:underline" href={`${DOWNLOAD_PATH}?release=${item.id}&ch=archive`}>
                  {t("downloadBtn")}
                </a>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </SiteLayout>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface/50 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold sm:text-base">{value}</dd>
    </div>
  );
}

function Spec({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
      <p className="mt-2 break-words text-sm font-bold text-foreground">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}
