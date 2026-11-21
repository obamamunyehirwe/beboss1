import { Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ScanLine,
  WifiOff,
  Store,
  Languages,
  Smartphone,
  Check,
} from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { retailCopy } from "@/lib/i18n-dict";
import { PhoneMockup } from "./PhoneMockup";

export function ModernHero() {
  const { lang, t } = useI18n();
  const c = retailCopy[lang];
  const [scene, setScene] = useState(0);
  const change = () => setScene((s) => 1 - s);

  return (
    <>
      <section className="market-hero" aria-labelledby="market-title">
        <img
          className="market-photo"
          src={scene === 0 ? "/hero-shop.jpg" : "/retail-receipt.png"}
          alt=""
          fetchPriority="high"
        />
        <div className="market-shade" />
        <div className="market-frame">
          <div className="market-copy">
            <div className="market-label">
              <span />
              {c.kicker}
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
              {t("heroTrial")}
            </div>
            <div className="market-proof" aria-label="BeBoss product capabilities">
              <span><WifiOff /> Offline-first</span>
              <span><Store /> Multi-branch</span>
              <span><Languages /> EN · RW · FR · SW</span>
            </div>
          </div>

          <div className="market-device">
            <div className="market-device-glow" aria-hidden="true" />
            <div className="market-phone-shell">
              <PhoneMockup />
            </div>
            <div className="market-caption">
              <div aria-live="polite">
                <small>0{scene + 1} / 02</small>
                <span>{c.scenes[scene]}</span>
              </div>
              <div className="scene-controls">
                <button type="button" onClick={change} aria-label={c.previous}>
                  <ChevronLeft />
                </button>
                <button type="button" onClick={change} aria-label={c.next}>
                  <ChevronRight />
                </button>
              </div>
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
