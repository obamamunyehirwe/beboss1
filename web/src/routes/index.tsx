import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowDownToLine,
  ScanBarcode,
  Boxes,
  Wallet,
  Network,
  Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ModernHero, ToolkitHeader } from "@/components/site/ModernHero";
import { useI18n } from "@/lib/i18n";
import { platformStatsQuery } from "@/lib/queries";
import { liveConfigured } from "@/lib/live-config";
import { retailCopy } from "@/lib/i18n-dict";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BeBoss POS — Your shop. In control." },
      {
        name: "description",
        content:
          "Manage sales, inventory and customer credit on Android. BeBoss is an offline-first point of sale for independent retailers in Rwanda.",
      },
      { property: "og:image", content: "/Friendly%20Modern%20Store%20Checkout.png" },
    ],
  }),
  component: Home,
});
const tools = [
  { icon: ScanBarcode, title: "f1T", desc: "f1D" },
  { icon: Boxes, title: "f2T", desc: "f2D" },
  { icon: Wallet, title: "f3T", desc: "f3D" },
] as const;
function Home() {
  const { t, lang } = useI18n();
  const c = retailCopy[lang];
  const { data } = useQuery({ ...platformStatsQuery, enabled: liveConfigured });
  return (
    <SiteLayout>
      <ModernHero />
      <section className="retail-section">
        <ToolkitHeader />
        <div className="tool-grid">
          {tools.map(({ icon: Icon, title, desc }, i) => (
            <article key={title} className="tool-card">
              <div className="tool-top">
                <span>
                  <Icon />
                </span>
                <small>0{i + 1}</small>
              </div>
              <h3>{t(title)}</h3>
              <p>{t(desc)}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="retail-section workflow-section">
        <div className="workflow-visual" role="img" aria-label={c.workflowAlt}>
          <img
            className="workflow-visual-image"
            src="/Friendly%20Modern%20Store%20Checkout.png"
            alt=""
            loading="lazy"
            decoding="async"
            width={1200}
            height={800}
          />
          <div className="workflow-visual-badge">
            <span><Activity size={17} /></span>
            <div><strong>{c.visualBadgeTitle}</strong><small>{c.visualBadgeSub}</small></div>
          </div>
          <div className="workflow-visual-glow" aria-hidden="true" />
        </div>
        <div>
          <div className="section-kicker">
            <Network size={16} />
            {t("navHow")}
          </div>
          <h2>{t("hwTitle")}</h2>
          <p>{t("hwSub")}</p>
          <Link to="/how-it-works">
            {t("hwLearn")} <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
      <section className="live-platform-section" aria-labelledby="live-platform-title">
        <div className="live-platform-inner">
          <div className="live-platform-heading">
            <div className="section-kicker"><Activity size={16} /> {c.platformKicker}</div>
            <h2 id="live-platform-title">{c.platformTitle}</h2>
            <p>{c.platformIntro}</p>
          </div>
          {data?.ok && data.stats ? (
            <>
              <div className="live-platform-grid">
                <article><span>{c.activeShops}</span><strong>{data.stats.shops_active.toLocaleString()}</strong><small>{c.activeShopsHelp}</small></article>
                <article><span>{c.registeredShops}</span><strong>{data.stats.shops_total.toLocaleString()}</strong><small>{c.registeredShopsHelp}</small></article>
                <article><span>{c.branchesConfigured}</span><strong>{data.stats.branches_total.toLocaleString()}</strong><small>{c.branchesConfiguredHelp}</small></article>
                <article><span>{c.devicesSynced}</span><strong>{data.stats.devices_synced_24h.toLocaleString()}</strong><small>{c.devicesSyncedHelp}</small></article>
              </div>
              <div className="live-platform-foot">
                <span><i /> {c.liveConnection}</span>
                <span>{c.lastPlatformEvent}: {data.stats.last_sync_at ? new Date(data.stats.last_sync_at).toLocaleString() : c.noSyncEvents}</span>
                <Link to="/status">{c.viewStatus} <ArrowUpRight size={15} /></Link>
              </div>
            </>
          ) : (
            <div className="live-platform-unavailable" role="status">
              <span>{c.unavailableTitle}</span>
              <span>{c.unavailableHelp}</span>
              <Link to="/status">{c.checkStatus} <ArrowUpRight size={15} /></Link>
            </div>
          )}
        </div>
      </section>
      <section className="retail-section">
        <div className="install-panel">
          <div>
            <div className="section-kicker">{c.androidPos}</div>
            <h2>{t("howTitle")}</h2>
          </div>
          <Link className="action-primary" to="/download">
            <ArrowDownToLine />
            {t("ctaDownload")}
          </Link>
        </div>
        <ol className="step-list">
          {(
            [
              ["how1T", "how1D"],
              ["how2T", "how2D"],
              ["how3T", "how3D"],
              ["how4T", "how4D"],
            ] as const
          ).map(([title, desc], i) => (
            <li key={title}>
              <small>0{i + 1}</small>
              <h3>{t(title)}</h3>
              <p>{t(desc)}</p>
            </li>
          ))}
        </ol>
        <Link className="text-primary font-semibold" to="/pricing">
          {t("ctaPricing")} →
        </Link>
      </section>
    </SiteLayout>
  );
}
