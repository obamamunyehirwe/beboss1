import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { QRCodeSVG } from "qrcode.react";
import {
  Apple,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  FileDown,
  Laptop,
  Monitor,
  Printer,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wifi,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ServiceUnavailable } from "@/components/site/ServiceUnavailable";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import { DOWNLOAD_PATH } from "@/lib/download-path";
import { buildDownloadHref, detectDesktopOS, type DesktopOS, type DownloadPlatform } from "@/lib/download-routing";
import { desktopReleaseQuery, publicSiteQuery } from "@/lib/queries";
import { createPublicDesktopDownload, type PublicDesktopRelease } from "@/lib/public.functions";
import { formatBytes, formatDate } from "@/lib/format";
import "./download-page.css";

const downloadSearchSchema = z.object({
  platform: z.enum(["mobile", "desktop"]).catch("mobile"),
  os: z.enum(["windows", "macos", "linux"]).optional(),
});

export const Route = createFileRoute("/download")({
  validateSearch: downloadSearchSchema,
  head: () => ({
    meta: [
      { title: "Download BeBoss POS — Android, Windows, macOS and Linux" },
      {
        name: "description",
        content:
          "Download the official BeBoss POS applications for Android, Windows, macOS and Linux. Review release details and verify installer integrity.",
      },
      { property: "og:title", content: "Download BeBoss POS for every device" },
      {
        property: "og:description",
        content:
          "Official BeBoss mobile and desktop installers with release details and integrity verification.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/beboss-app-icon.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => <ServiceUnavailable title="downloadTitle" />,
  loaderDeps: ({ search }) => ({ platform: search.platform }),
  loader: ({ context, deps }) => Promise.all([
    context.queryClient.ensureQueryData(publicSiteQuery),
    deps.platform === "desktop"
      ? context.queryClient.ensureQueryData(desktopReleaseQuery)
      : Promise.resolve(null),
  ]),
  component: DownloadPage,
});

function DownloadPage() {
  const { t, p } = useI18n();
  const { data } = useSuspenseQuery(publicSiteQuery);
  const router = useRouter();
  const { platform, os } = Route.useSearch();
  const { data: desktopReleaseData } = useQuery({
    ...desktopReleaseQuery,
    enabled: platform === "desktop",
  });
  const desktopRelease: PublicDesktopRelease = desktopReleaseData ?? {
    published: false,
    unavailable: false,
    tagName: null,
    publishedAt: null,
    releaseUrl: "/download?platform=desktop",
    assets: { windows: null, macos: null, linux: null },
    history: [],
  };
  const [detectedOs, setDetectedOs] = useState<DesktopOS>("windows");
  const desktopOs: DesktopOS = os ?? detectedOs;
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
  const changePlatform = (next: DownloadPlatform) => {
    if (next === "mobile") {
      router.history.push(buildDownloadHref("mobile"));
      return;
    }
    router.history.push(buildDownloadHref("desktop", desktopOs));
  };
  const changeDesktopOs = (next: DesktopOS) => {
    // Keep the selected installer in the address bar. Browser back/forward now
    // restores both the application family and the chosen operating system.
    router.history.push(buildDownloadHref("desktop", next));
  };
  const qrUrl = origin && release ? `${origin}${DOWNLOAD_PATH}?ch=qr` : "";

  useEffect(() => {
    setOrigin(window.location.origin);
    // Respect an explicit URL selection; otherwise suggest the visitor's OS.
    if (os) return;
    setDetectedOs(detectDesktopOS(window.navigator.userAgent));
  }, [os]);

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
      <PageHero
        eyebrow={t("navDownload")}
        title={platform === "desktop" ? "Download BeBoss Desktop" : t("downloadTitle")}
        sub={platform === "desktop"
          ? "Choose the native installer for Windows, macOS or Linux. Every package comes from the official BeBoss desktop release."
          : t("downloadSub")}
      >
        <div className="flex flex-wrap items-center gap-3">
          {platform === "mobile" ? (
            <>
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
            </>
          ) : (
            <>
              <Button asChild variant="hero" size="lg">
                <a href="#desktop-download-options">
                  <Download /> Choose desktop installer <ArrowRight />
                </a>
              </Button>
            </>
          )}
        </div>
      </PageHero>

      <section className="download-platform-switcher mx-auto max-w-7xl px-4 pt-8 sm:px-6" aria-label="Choose your BeBoss app">
        <div className="download-platform-tabs" role="tablist" aria-label="Application type">
          <button
            type="button"
            role="tab"
            aria-selected={platform === "mobile"}
            className={platform === "mobile" ? "download-platform-tab download-platform-tab-active" : "download-platform-tab"}
            onClick={() => changePlatform("mobile")}
          >
            <Smartphone aria-hidden="true" /> Mobile app <span>Android</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={platform === "desktop"}
            className={platform === "desktop" ? "download-platform-tab download-platform-tab-active" : "download-platform-tab"}
            onClick={() => changePlatform("desktop")}
          >
            <Monitor aria-hidden="true" /> Desktop app <span>Windows · macOS · Linux</span>
          </button>
        </div>
      </section>

      {platform === "mobile" ? (
      <>
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
      </>
      ) : (
        <DesktopDownloads
          release={desktopRelease}
          selectedOs={desktopOs}
          onSelectOs={changeDesktopOs}
        />
      )}
    </SiteLayout>
  );
}


function DesktopDownloads({
  release,
  selectedOs,
  onSelectOs,
}: {
  release: PublicDesktopRelease;
  selectedOs: DesktopOS;
  onSelectOs: (os: DesktopOS) => void;
}) {
  const asset = release.assets[selectedOs];
  const previousReleases = release.history.filter((item) => item.platform === selectedOs);
  const labels: Record<DesktopOS, string> = {
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
  };
  const version = asset?.versionName ?? release.tagName ?? "Latest";
  const expectedChecksum = asset?.sha256?.toLowerCase() ?? "";
  const [checksumInput, setChecksumInput] = useState("");
  const [checksumCopied, setChecksumCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [archiveDownloadId, setArchiveDownloadId] = useState<string | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const normalizedChecksumInput = checksumInput.trim().toLowerCase();
  const checksumMatches = Boolean(
    expectedChecksum && /^[a-f0-9]{64}$/.test(normalizedChecksumInput) &&
      normalizedChecksumInput === expectedChecksum,
  );
  const checksumMismatch = Boolean(
    expectedChecksum && /^[a-f0-9]{64}$/.test(normalizedChecksumInput) &&
      normalizedChecksumInput !== expectedChecksum,
  );

  useEffect(() => {
    setChecksumInput("");
    setChecksumCopied(false);
  }, [selectedOs, expectedChecksum]);

  const downloadSelectedInstaller = async () => {
    if (!asset || isDownloading) return;
    setIsDownloading(true);
    try {
      const result = await createPublicDesktopDownload({ data: { id: asset.id } });
      window.location.assign(result.url);
      toast.success(`${labels[selectedOs]} installer download is ready.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the desktop installer download.");
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadArchivedInstaller = async (item: PublicDesktopRelease["history"][number]) => {
    if (archiveDownloadId) return;
    setArchiveDownloadId(item.id);
    try {
      const result = await createPublicDesktopDownload({ data: { id: item.id } });
      window.location.assign(result.url);
      toast.success(`${labels[selectedOs]} v${item.versionName} download is ready.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the archived installer download.");
    } finally {
      setArchiveDownloadId(null);
    }
  };

  const copyChecksum = async () => {
    if (!expectedChecksum) return;
    try {
      await navigator.clipboard.writeText(expectedChecksum);
      setChecksumCopied(true);
      toast.success("Desktop installer SHA-256 copied");
    } catch {
      toast.error("Clipboard access was blocked. Select the checksum and copy it manually.");
    }
  };

  const options: { os: DesktopOS; title: string; subtitle: string }[] = [
    { os: "windows", title: "Windows", subtitle: "64-bit · .exe installer" },
    { os: "macos", title: "macOS", subtitle: "Disk image · .dmg" },
    { os: "linux", title: "Linux", subtitle: "64-bit · AppImage" },
  ];

  return (
    <section className="download-desktop-layout mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="download-desktop-card overflow-hidden rounded-[2rem] border border-border bg-card shadow-soft">
        <div className="download-desktop-intro p-6 sm:p-9 lg:p-11">
          <div className="flex flex-wrap items-center gap-4">
            <span className="download-app-art">
              <img src="/beboss-app-logo.png" alt="BeBoss app logo" width={64} height={64} loading="eager" decoding="async" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold sm:text-3xl">BeBoss Desktop</h2>
                <span className={release.published
                  ? "inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success"
                  : "inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning"}>
                  <CheckCircle2 className="size-3.5" />
                  {release.published ? "Official release available" : release.unavailable ? "Release status unavailable" : "Awaiting first desktop release"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Native retail workspace for Windows, macOS and Linux
              </p>
            </div>
          </div>

          <div className="mt-7 max-w-3xl">
            <p className="text-base leading-7 text-muted-foreground">
              Bring your complete BeBoss shop workspace to a larger screen. Manage checkout, products, inventory, customers, staff, branches and reports in the native desktop application, with the same authenticated shop account and cloud data.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {options.map((option) => {
              const selected = selectedOs === option.os;
              const available = Boolean(release.assets[option.os]);
              return (
                <button
                  key={option.os}
                  type="button"
                  aria-pressed={selected}
                  className={selected
                    ? "download-os-option download-os-option-active"
                    : "download-os-option"}
                  onClick={() => onSelectOs(option.os)}
                >
                  <span className="download-os-option-icon" aria-hidden="true">
                    {option.os === "windows" ? <Monitor /> : option.os === "macos" ? <Apple /> : <Laptop />}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block font-semibold">{option.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{option.subtitle}</span>
                    <span className={available ? "download-os-availability download-os-availability-ready" : "download-os-availability"}>
                      {available ? "Installer ready" : "Not published"}
                    </span>
                  </span>
                  <span className="download-os-radio" aria-hidden="true">{selected ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        </div>

        <section className="download-desktop-summary" aria-label="Selected desktop installer">
          <div className="download-desktop-summary-copy">
            <span className="download-desktop-summary-eyebrow">OFFICIAL DESKTOP SETUP</span>
            <h3>{labels[selectedOs]} installer{asset ? ` · v${version}` : ""}</h3>
            <p>{asset
              ? `${asset.name} · ${asset.sizeBytes > 0 ? formatBytes(asset.sizeBytes) : "Size confirmed in release details"}`
              : release.unavailable
                ? "The secure release service is temporarily unavailable."
                : `No public ${labels[selectedOs]} installer has been published yet.`}</p>
          </div>
          <div className="download-desktop-summary-actions">
            {asset ? (
              <Button type="button" variant="hero" size="xl" onClick={() => void downloadSelectedInstaller()} disabled={isDownloading}>
                {isDownloading ? <><FileDown className="animate-pulse" /> Preparing secure download…</> : <><Download /> Download setup <ArrowRight /></>}
              </Button>
            ) : (
              <Button type="button" variant="hero" size="xl" disabled><Download /> Setup not available</Button>
            )}
            <Button type="button" variant="outline" size="lg" className="download-desktop-details-toggle"
              aria-expanded={detailsExpanded} aria-controls="download-desktop-expanded-details"
              onClick={() => setDetailsExpanded((value) => !value)}>
              <ShieldCheck /> {detailsExpanded ? "Hide details" : "View details"}
            </Button>
          </div>
        </section>
        {detailsExpanded ? (
          <div id="download-desktop-expanded-details" className="download-desktop-expanded-details">
  <div id="desktop-download-options" className="download-desktop-download border-t border-border bg-surface/60 p-6 sm:p-9">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Selected installer</p>
                  <h3 className="mt-2 text-2xl font-bold">{labels[selectedOs]}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{options.find((item) => item.os === selectedOs)?.subtitle}</p>
                </div>
                {asset ? (
                  <Button type="button" variant="hero" size="xl" className="w-full sm:w-auto" onClick={() => void downloadSelectedInstaller()} disabled={isDownloading}>
                    {isDownloading ? <><FileDown className="animate-pulse" /> Preparing secure download…</> : <><Download /> Download for {labels[selectedOs]} <ArrowRight /></>}
                  </Button>
                ) : (
                  <Button type="button" variant="hero" size="xl" className="w-full sm:w-auto" disabled>
                    <Download /> Installer not available yet
                  </Button>
                )}
              </div>
    
              {asset ? (
                <>
                  <dl className="mt-6 grid gap-3 sm:grid-cols-3">
                    <Meta label="Desktop version" value={version} />
                    <Meta label="Package size" value={asset.sizeBytes > 0 ? formatBytes(asset.sizeBytes) : "Provided by release"} />
                    <Meta label="Downloads" value={asset.downloadCount.toLocaleString()} />
                  </dl>
    
                  <section className="mt-6 rounded-2xl border border-border bg-background/70 p-4 sm:p-5" aria-labelledby="desktop-checksum-title">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p id="desktop-checksum-title" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        <ShieldCheck className="size-4 text-success" />
                        Installer SHA-256 integrity
                      </p>
                      {expectedChecksum ? (
                        <Button size="sm" variant="ghost" onClick={copyChecksum}>
                          {checksumCopied ? <Check className="text-success" /> : <Copy />}
                          {checksumCopied ? "Copied" : "Copy checksum"}
                        </Button>
                      ) : null}
                    </div>
                    {expectedChecksum ? (
                      <>
                        <p className="mt-3 break-all rounded-xl bg-surface px-3 py-3 font-mono text-xs leading-6 text-foreground">
                          {expectedChecksum}
                        </p>
                        <div className="mt-4 border-t border-border pt-4">
                          <label htmlFor="desktop-checksum-input" className="mb-2 block text-xs font-semibold text-foreground">
                            Verify the installer you downloaded
                          </label>
                          <input
                            id="desktop-checksum-input"
                            value={checksumInput}
                            onChange={(event) => setChecksumInput(event.target.value)}
                            placeholder="Paste the calculated 64-character SHA-256 hash"
                            autoComplete="off"
                            spellCheck={false}
                            className="h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          {normalizedChecksumInput.length > 0 ? (
                            <p className="mt-2 flex items-center gap-2 text-xs font-medium" role="status">
                              {checksumMatches ? (
                                <><CheckCircle2 className="size-4 text-success" /> The downloaded installer matches the official release checksum.</>
                              ) : checksumMismatch ? (
                                <><ShieldCheck className="size-4 text-destructive" /> Hash mismatch. Do not install this file until its origin is confirmed.</>
                              ) : (
                                <><FileCheck2 className="size-4 text-muted-foreground" /> Enter all 64 hexadecimal characters to complete the comparison.</>
                              )}
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        The selected release does not contain a valid checksum entry in its SHA256SUMS.txt manifest. Download only from the official BeBoss release page.
                      </p>
                    )}
                  </section>
                </>
              ) : (
                <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm leading-6 text-muted-foreground" role="status">
                  {release.unavailable
                    ? "The release service could not be reached. The download page is still available; retry later or open the official release history."
                    : release.published
                      ? `The latest published set does not contain a ${labels[selectedOs]} installer yet.`
                      : "No desktop installer has been uploaded yet. BeBoss releases are built locally by the release administrator and uploaded individually; each platform becomes available when its installer is published."}
                </div>
              )}
    
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <p className="text-xs text-muted-foreground">
                  {release.publishedAt ? `Published ${formatDate(release.publishedAt)}` : "Official BeBoss desktop distribution"}
                </p>
                <a
                  href="#desktop-release-history"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Previous versions <ArrowRight className="size-4" />
                </a>
              </div>
            </div>
          </div>
        ) : null}
      </section>
      {detailsExpanded ? (
        <>
        <section id="desktop-release-history" className="mt-7 rounded-3xl border border-border bg-card p-5 sm:p-7" aria-labelledby="desktop-history-heading">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Release archive</p>
                      <h3 id="desktop-history-heading" className="mt-1 text-xl font-bold">Previous {labels[selectedOs]} versions</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Older builds are available only when the release administrator has enabled public visibility.</p>
                    </div>
                    <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">{previousReleases.length} public version(s)</span>
                  </div>
                  {previousReleases.length ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {previousReleases.map((item) => (
                        <article key={item.id} className="min-w-0 rounded-2xl border border-border bg-background/70 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-sm">BeBoss Desktop v{item.versionName}</strong>
                            <span className="text-xs text-muted-foreground">{formatDate(item.publishedAt)}</span>
                          </div>
                          <p className="mt-2 break-all text-xs text-muted-foreground">{item.name} · {formatBytes(item.sizeBytes)} · {item.downloadCount.toLocaleString()} downloads</p>
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-semibold text-primary">Show checksum and release notes</summary>
                            <p className="mt-2 break-all rounded-lg bg-muted/50 p-2 font-mono text-[10px] leading-5">SHA-256 {item.sha256}</p>
                            {item.releaseNotes ? <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">{item.releaseNotes}</p> : null}
                          </details>
                          <Button type="button" size="sm" variant="outline" className="mt-3 w-full" disabled={archiveDownloadId === item.id || archiveDownloadId !== null}
                            onClick={() => void downloadArchivedInstaller(item)}>
                            {archiveDownloadId === item.id ? <FileDown className="animate-pulse" /> : <Download />}
                            {archiveDownloadId === item.id ? "Preparing secure download…" : "Download this version"}
                          </Button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">There are no previous public {labels[selectedOs]} versions. Older releases hidden by the administrator remain in the private archive.</p>
                  )}
                </section>
          
                <section className="mt-7 grid gap-4 md:grid-cols-3">
                  <article className="download-os-guide">
                    <Monitor className="size-5 text-primary" />
                    <h3 className="mt-3 font-semibold">Windows setup</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Run the NSIS setup file, follow the installer and launch BeBoss from the Start Menu. Use the production-signed Windows setup file supplied by BeBoss. Check its SHA-256 value before installation.</p>
                  </article>
                  <article className="download-os-guide">
                    <Apple className="size-5 text-primary" />
                    <h3 className="mt-3 font-semibold">macOS installation</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Open the DMG and move BeBoss to Applications. Whether Gatekeeper accepts the app without an additional confirmation depends on the Apple signing and notarization credentials used for that release.</p>
                  </article>
                  <article className="download-os-guide">
                    <Laptop className="size-5 text-primary" />
                    <h3 className="mt-3 font-semibold">Linux installation</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Download the AppImage, make it executable with <code>chmod +x BeBoss-Linux-x64.AppImage</code>, then run it. Your distribution must provide the Tauri WebKit runtime dependencies.</p>
                  </article>
                </section>
          
                <section className="mt-7 rounded-3xl border border-border bg-card p-6 sm:p-8">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
                    <div>
                      <h3 className="font-semibold">Official packages and integrity</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Desktop installers are built and verified locally by BeBoss maintainers, then uploaded to private BeBoss release storage. Downloads are issued through short-lived secure links, and each published installer includes a SHA-256 checksum so you can verify the file before installation. Never install a package from an unofficial mirror.
                      </p>
                      <a href={release.releaseUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                        Review published desktop installers and SHA-256 checksums <ExternalLink className="size-4" />
                      </a>
                    </div>
                  </div>
                </section>
        </>
      ) : null}
    </section>
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
