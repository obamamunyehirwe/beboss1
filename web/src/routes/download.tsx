import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Download, FileDown, Printer, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHero, SiteLayout } from "@/components/site/SiteLayout";
import { useI18n } from "@/lib/i18n";
import { DOWNLOAD_PATH, publicSiteQuery } from "@/lib/queries";
import { formatBytes, formatDate } from "@/lib/format";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download BeBoss POS for Android — official APK" },
      { name: "description", content: "Download the official BeBoss POS Android app. Verified SHA-256 checksum, QR code install, Android 7.0+, 4-day free trial." },
      { property: "og:title", content: "Download BeBoss POS for Android" },
      { property: "og:description", content: "Official verified APK with QR install and step-by-step guide." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQuery),
  component: DownloadPage,
});

function DownloadPage() {
  const { t, p } = useI18n();
  const { data } = useSuspenseQuery(publicSiteQuery);
  const rel = data.current;
  const [origin, setOrigin] = useState("");
  const [testHash, setTestHash] = useState("");
  const isHashMatch = rel && testHash.trim() && testHash.trim().toLowerCase() === rel.sha256.toLowerCase();
  useEffect(() => setOrigin(window.location.origin), []);
  const qrUrl = origin ? `${origin}${DOWNLOAD_PATH}?ch=qr` : "";
  const older = data.releases.filter((r) => r.id !== rel?.id);

  const copyHash = async () => {
    if (!rel) return;
    await navigator.clipboard.writeText(rel.sha256);
    setCopied(true);
    toast.success(t("copied"));
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <SiteLayout>
      <PageHero eyebrow={t("navDownload")} title={t("downloadTitle")} sub={t("downloadSub")} />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[2rem] border border-border bg-card bg-card-sheen p-8">
          {rel ? (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <span className="grid size-16 place-items-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-brand">
                  <Smartphone className="size-8" />
                </span>
                <div>
                  <h2 className="text-2xl font-bold">BeBoss POS</h2>
                  <p className="text-sm text-muted-foreground">{rel.file_name}</p>
                </div>
              </div>
              <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Meta label={t("version")} value={`v${rel.version_name}`} />
                <Meta label={t("size")} value={formatBytes(Number(rel.size_bytes))} />
                <Meta label={t("released")} value={formatDate(rel.published_at)} />
                <Meta label="Android" value={rel.min_android} />
              </dl>
              <div className="mt-6 rounded-2xl border border-border bg-background/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                    <ShieldCheck className="size-4 text-success" />
                    {t("checksum")}
                  </p>
                  <Button size="sm" variant="ghost" onClick={copyHash}>
                    {copied ? <Check className="text-success" /> : <Copy />}
                    {t("copy")}
                  </Button>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{rel.sha256}</p>

                {/* Interactive Hash Check */}
                <div className="mt-3 pt-3 border-t border-border">
                  <label htmlFor="test-hash" className="text-[11px] text-muted-foreground block mb-1">
                    Paste downloaded file hash to verify authenticity:
                  </label>
                  <input
                    id="test-hash"
                    value={testHash}
                    onChange={(e) => setTestHash(e.target.value)}
                    placeholder="Paste SHA-256 hash here..."
                    className="w-full h-8 text-xs font-mono bg-surface border border-border rounded-lg px-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                  />
                  {testHash.trim() && (
                    <p className={`mt-1.5 text-xs font-medium flex items-center gap-1 ${isHashMatch ? "text-success" : "text-destructive"}`}>
                      {isHashMatch ? (
                        <>✓ Checksum matches official release! Authentic binary.</>
                      ) : (
                        <>⚠ Hash mismatch! File may be corrupted or unverified.</>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <Button asChild variant="hero" size="xl" className="mt-8 w-full sm:w-auto">
                <a href={`${DOWNLOAD_PATH}?ch=web`}>
                  <Download />
                  {t("downloadBtn")}
                </a>
              </Button>
              {rel.release_notes ? (
                <div className="mt-8">
                  <h3 className="font-semibold">{t("whatsNew")}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{rel.release_notes}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="py-10 text-center">
              <FileDown className="mx-auto size-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">{t("noRelease")}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="print-area rounded-[2rem] border border-border bg-card p-8 text-center">
            <div className="mx-auto w-fit rounded-3xl bg-foreground p-4">
              {qrUrl && rel ? <QRCodeSVG value={qrUrl} size={200} bgColor="transparent" fgColor="currentColor" className="text-background" /> : <div className="size-[200px]" />}
            </div>
            <p className="mt-4 font-semibold">{t("scanToInstall")}</p>
            {rel ? (
              <Button variant="glass" size="sm" className="mt-4" onClick={() => window.print()}>
                <Printer />
                {p.download.printPoster}
              </Button>
            ) : null}
          </div>
          <div className="rounded-[2rem] border border-border bg-card p-8">
            <h3 className="font-semibold">{t("installSteps")}</h3>
            <ol className="mt-4 space-y-4">
              {(["install1", "install2", "install3", "install4"] as const).map((k, i) => (
                <li key={k} className="flex gap-3 text-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 font-mono text-xs text-primary">{i + 1}</span>
                  <span className="text-muted-foreground">{t(k)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* HARDWARE & SYSTEM SPECIFICATIONS */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="rounded-[2.5rem] border border-border bg-card p-8 sm:p-10 shadow-soft">
          <div className="max-w-2xl mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Smartphone className="size-3.5" />
              Android Terminal Hardware & Architecture Matrix
            </span>
            <h3 className="mt-2 text-2xl font-bold">Tested & Certified Environment</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              BeBoss is engineered to run reliably on affordable Android smartphones, rugged handheld terminals, and counter tablets.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <span className="text-xs uppercase font-mono text-muted-foreground">OS Architecture</span>
              <p className="font-bold text-sm text-foreground mt-1">Android 7.0 (API 24) to Android 15</p>
              <p className="text-[11px] text-muted-foreground mt-1">ARMv7, ARM64, and x86_64 architectures</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <span className="text-xs uppercase font-mono text-muted-foreground">Storage & DB</span>
              <p className="font-bold text-sm text-foreground mt-1">Room + SQLCipher AES-256</p>
              <p className="text-[11px] text-muted-foreground mt-1">Keys wrapped in Android Keystore / StrongBox</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <span className="text-xs uppercase font-mono text-muted-foreground">Printer Hardware</span>
              <p className="font-bold text-sm text-foreground mt-1">58mm & 80mm ESC/POS</p>
              <p className="text-[11px] text-muted-foreground mt-1">Bluetooth SPP & USB OTG thermal roll printers</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <span className="text-xs uppercase font-mono text-muted-foreground">Barcode Engine</span>
              <p className="font-bold text-sm text-foreground mt-1">CameraX + Google ML Kit</p>
              <p className="text-[11px] text-muted-foreground mt-1">EAN-13, UPC, Code 128, QR Code in &lt;100ms</p>
            </div>
          </div>
        </div>
      </section>

      {older.length ? (
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <h2 className="mb-4 text-xl font-bold">{t("previousVersions")}</h2>
          <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
            {older.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
                <span className="font-mono">v{r.version_name}</span>
                <span className="text-muted-foreground">
                  {formatDate(r.published_at)} • {formatBytes(Number(r.size_bytes))}
                </span>
                <a className="text-primary hover:underline" href={`${DOWNLOAD_PATH}?release=${r.id}&ch=archive`}>
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
    <div className="rounded-2xl border border-border px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
