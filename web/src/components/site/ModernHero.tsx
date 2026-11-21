import { Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ScanLine,
  WifiOff,
  Store,
  Languages,
  Smartphone,
  Check,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { retailCopy } from "@/lib/i18n-dict";
import { PhoneMockup } from "./PhoneMockup";

export function ModernHero() {
  const { lang, t } = useI18n();
  const c = retailCopy[lang];
  return (
    <>
      <section className="market-hero" aria-labelledby="market-title">
        <div className="market-orbit market-orbit-one" aria-hidden="true" />
        <div className="market-orbit market-orbit-two" aria-hidden="true" />
        <div className="market-shade" aria-hidden="true" />
        <div className="market-frame">
          <div className="market-copy">
            <div className="market-label">
              <span />
              BeBoss · Retail operations platform
            </div>
            <h1 id="market-title">
              {c.first}
              <br />
              <em>{c.second}</em>
            </h1>
            <p>{c.intro}</p>
            <div className="market-actions">
              <Link className="action-primary" to="/download">
                <ArrowDownToLine />
                {t("ctaDownload")}
              </Link>
              <Link className="action-secondary" to="/features">
                {t("navFeatures")}
                <ArrowUpRight />
              </Link>
            </div>
            <div className="market-trial">
              <Check />
              Built for real shops. Works offline. Syncs when connected.
            </div>
            <div className="market-trust">
              <span><WifiOff /> Offline-first Android POS</span>
              <span><Store /> Multi-branch operations</span>
              <span><Languages /> English · Kinyarwanda · Français · Kiswahili</span>
            </div>
          </div>

          <div className="market-device">
            <div className="market-device-glow" aria-hidden="true" />
            <div className="market-phone-shell">
              <PhoneMockup />
            </div>
            <div className="market-caption">
              <div>
                <small>PRODUCT PREVIEW</small>
                <span>Explore the BeBoss Android experience</span>
              </div>
              <span className="market-preview-pill">Interactive preview</span>
            </div>
          </div>
        </div>
      </section>
      <div className="cap-strip">
        <div className="cap-inner">
          {[WifiOff, Store, Languages, Smartphone].map((Icon, i) => (
            <div className="cap-item" key={i}>
              <Icon />
              <div>
                <strong>{c.caps[i]}</strong>
                <span>{c.details[i]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function ToolkitHeader() {
  const { lang, t } = useI18n();
  const c = retailCopy[lang];
  return (
    <div className="toolkit-head">
      <div>
        <div className="section-kicker">
          <ScanLine size={15} />
          {c.toolkit}
        </div>
        <h2>{c.heading}</h2>
      </div>
      <Link to="/features">
        {t("navFeatures")} <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}
