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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BeBoss POS — Your shop. In control." },
      {
        name: "description",
        content:
          "Manage sales, inventory and customer credit on Android. BeBoss is an offline-first point of sale for independent retailers in Rwanda.",
      },
      { property: "og:image", content: "/hero-shop.jpg" },
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
  const { t } = useI18n();
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
        <img src="/retail-receipt.png" loading="lazy" alt="" />
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
      {data?.ok && data.stats && (
        <div className="retail-section flex flex-wrap items-center gap-5 border-y border-border py-6">
          <Activity size={18} />
          <span>
            {t("heroActiveShops")}: <b>{data.stats.shops_active}</b>
          </span>
          <span>
            {t("heroSyncedDevices")}: <b>{data.stats.devices_synced_24h}</b>
          </span>
          <Link to="/status">{t("navStatus")} →</Link>
        </div>
      )}
      <section className="retail-section">
        <div className="install-panel">
          <div>
            <div className="section-kicker">ANDROID POS</div>
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
