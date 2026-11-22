import { Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Languages,
  PackageCheck,
  Store,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { retailCopy } from "@/lib/i18n-dict";

const capabilityIcons = [WifiOff, Store, Languages, PackageCheck];
const activityBars = [28, 39, 34, 48, 43, 63, 55, 72, 61, 82, 69, 94];

export function ModernHero() {
  const { lang, t } = useI18n();
  const c = retailCopy[lang];
  const [activeFeature, setActiveFeature] = useState(0);
  const ActiveIcon = capabilityIcons[activeFeature] ?? WifiOff;

  const selectWithKeyboard = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % capabilityIcons.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + capabilityIcons.length) % capabilityIcons.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = capabilityIcons.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    setActiveFeature(nextIndex);
    document.getElementById(`market-feature-${nextIndex}`)?.focus();
  };

  return (
    <>
      <section className="market-hero" aria-labelledby="market-title">
        <img className="market-photo" src="/Friendly%20Modern%20Store%20Checkout.png" alt="" aria-hidden="true" decoding="async" />
        <div className="market-shade" aria-hidden="true" />
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
            <div className="market-ops-board">
              <div className="market-ops-topbar">
                <div className="market-ops-brand">
                  <img src="/beboss-app-icon.png" alt="" width={42} height={42} />
                  <span><strong>BeBoss POS</strong><small>{c.toolkit}</small></span>
                </div>
                <span className="market-ops-preview"><i />{c.previewLabel}</span>
              </div>

              <div className="market-ops-workspace">
                <div className="market-ops-workspace-copy">
                  <span className="market-ops-eyebrow">{c.toolkit} <b>0{activeFeature + 1} / 04</b></span>
                  <h2>{c.caps[activeFeature]}</h2>
                  <p>{c.details[activeFeature]}</p>
                </div>
                <span className="market-ops-active-icon" aria-hidden="true"><ActiveIcon size={27} /></span>
              </div>

              <div className="market-ops-visual" aria-hidden="true">
                <div className="market-ops-visual-heading">
                  <span>{c.heading}</span>
                  <span className="market-ops-visual-key"><i /> BeBoss</span>
                </div>
                <div className="market-ops-bars">
                  {activityBars.map((height, index) => (
                    <span key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
                <div className="market-ops-visual-foot">
                  <span /><span /><span />
                </div>
              </div>

              <div className="market-capability-tabs" role="group" aria-label={c.toolkit}>
                {capabilityIcons.map((Icon, index) => (
                  <button
                    key={c.caps[index]}
                    id={`market-feature-${index}`}
                    type="button"
                    aria-pressed={activeFeature === index}
                    className={activeFeature === index ? "market-capability-tab market-capability-tab-active" : "market-capability-tab"}
                    onClick={() => setActiveFeature(index)}
                    onKeyDown={(event) => selectWithKeyboard(event, index)}
                  >
                    <Icon size={17} />
                    <span>{c.caps[index]}</span>
                  </button>
                ))}
              </div>

              <div className="market-ops-footer">
                <span><Check size={14} />{c.trial}</span>
                <Link to="/features">{t("navFeatures")} <ArrowUpRight size={15} /></Link>
              </div>
            </div>
            <div className="market-ops-orbit market-ops-orbit-one" aria-hidden="true" />
            <div className="market-ops-orbit market-ops-orbit-two" aria-hidden="true" />
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
      <div><div className="section-kicker"><Store size={15} />{c.toolkit}</div><h2>{c.heading}</h2></div>
      <Link to="/features">{t("navFeatures")} <ArrowUpRight size={16} /></Link>
    </div>
  );
}
