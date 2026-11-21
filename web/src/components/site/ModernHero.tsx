import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpRight, ScanLine, WifiOff, Store, Languages, PackageCheck, Check } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { retailCopy } from "@/lib/i18n-dict";

const capabilityIcons = [WifiOff, Store, Languages, PackageCheck];

export function ModernHero() {
  const { lang, t } = useI18n();
  const c = retailCopy[lang];
  const [activeFeature, setActiveFeature] = useState(0);
  const ActiveIcon = capabilityIcons[activeFeature] ?? WifiOff;

  return (
    <>
      <section className="market-hero" aria-labelledby="market-title">
        <div className="market-hero-grid" aria-hidden="true" />
        <div className="market-frame">
          <div className="market-copy">
            <div className="market-label"><span />{c.kicker}</div>
            <h1 id="market-title">{c.first}<br /><em>{c.second}</em></h1>
            <p>{c.intro}</p>
            <div className="market-actions">
              <Link className="action-primary" to="/download"><ArrowDownToLine />{t("ctaDownload")}</Link>
              <Link className="action-secondary" to="/features">{t("navFeatures")}<ArrowUpRight /></Link>
            </div>
            <div className="market-trial"><Check />{c.trial}</div>
            <div className="market-trust">
              <span><WifiOff /> {c.trustOffline}</span>
              <span><Store /> {c.trustBranches}</span>
              <span><Languages /> {c.trustLanguages}</span>
            </div>
          </div>

          <div className="market-showcase">
            <div className="market-showcase-photo-shell">
              <img
                className="market-showcase-photo"
                src="/Friendly%20Modern%20Store%20Checkout.png"
                alt="BeBoss point-of-sale retail checkout experience"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                width={1600}
                height={1100}
              />
              <div className="market-showcase-photo-shade" aria-hidden="true" />
              <div className="market-showcase-brand">
                <img src="/beboss-app-icon.png" alt="" width={42} height={42} />
                <span><strong>BeBoss POS</strong><small>BUSINESS · SALES · INVENTORY</small></span>
              </div>
              <div className="market-showcase-photo-tag"><span className="market-showcase-live-dot" />{c.previewLabel}</div>
            </div>

            <div className="market-capability-panel">
              <div className="market-capability-heading">
                <span className="market-capability-icon"><ActiveIcon size={19} /></span>
                <div><small>{c.toolkit}</small><strong>{c.caps[activeFeature]}</strong></div>
                <span className="market-capability-count">0{activeFeature + 1}/04</span>
              </div>
              <div className="market-capability-detail" id="market-feature-panel" role="tabpanel" aria-label={c.caps[activeFeature]}>
                <p>{c.details[activeFeature]}</p>
                <Link to="/features">{t("navFeatures")} <ArrowUpRight size={15} /></Link>
              </div>
              <div className="market-capability-tabs" role="tablist" aria-label={c.toolkit}>
                {capabilityIcons.map((Icon, index) => (
                  <button
                    key={c.caps[index]}
                    type="button"
                    role="tab"
                    aria-selected={activeFeature === index}
                    aria-controls="market-feature-panel"
                    className={activeFeature === index ? "market-capability-tab market-capability-tab-active" : "market-capability-tab"}
                    onClick={() => setActiveFeature(index)}
                  >
                    <Icon size={16} /><span>{c.caps[index]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="cap-strip">
        <div className="cap-inner">
          {capabilityIcons.map((Icon, i) => (
            <div className="cap-item" key={c.caps[i]}>
              <Icon /><div><strong>{c.caps[i]}</strong><span>{c.details[i]}</span></div>
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
      <div><div className="section-kicker"><ScanLine size={15} />{c.toolkit}</div><h2>{c.heading}</h2></div>
      <Link to="/features">{t("navFeatures")} <ArrowUpRight size={16} /></Link>
    </div>
  );
}
