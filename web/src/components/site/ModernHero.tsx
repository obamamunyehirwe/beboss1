import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownToLine,
  ChevronDown,
  ArrowUpRight,
  Check,
  Languages,
  PackageCheck,
  RefreshCw,
  Store,
  WifiOff,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { retailCopy } from "@/lib/i18n-dict";
import { platformStatsQuery } from "@/lib/queries";
import { liveConfigured } from "@/lib/live-config";

const capabilityIcons = [WifiOff, Store, Languages, PackageCheck];

export function ModernHero() {
  const { lang, t } = useI18n();
  const c = retailCopy[lang];
  const [activeFeature, setActiveFeature] = useState(0);
  const statsQuery = useQuery({ ...platformStatsQuery, enabled: liveConfigured });
  const stats = statsQuery.data?.ok ? statsQuery.data.stats : null;
  const activity = stats?.activity_14d ?? [];
  const maxEvents = Math.max(1, ...activity.map((item) => Number(item.events) || 0));
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

  const refreshAnalytics = () => {
    void statsQuery.refetch();
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
                  <span><strong>BeBoss Cloud</strong><small>LIVE PLATFORM ANALYTICS</small></span>
                </div>
                <span className={stats ? "market-ops-preview market-ops-preview-live" : "market-ops-preview market-ops-preview-warn"}>
                  <i />{stats ? "LIVE SUPABASE DATA" : statsQuery.isLoading ? "CONNECTING" : "DATA UNAVAILABLE"}
                </span>
              </div>

              <div className="market-ops-workspace">
                <div className="market-ops-workspace-copy">
                  <span className="market-ops-eyebrow">{c.toolkit} <b>0{activeFeature + 1} / 04</b></span>
                  <h2>{c.caps[activeFeature]}</h2>
                  <p>{c.details[activeFeature]}</p>
                </div>
                <span className="market-ops-active-icon" aria-hidden="true"><ActiveIcon size={27} /></span>
              </div>

              <section className="market-live-analytics" aria-label="Live BeBoss platform analytics">
                <div className="market-live-analytics-heading">
                  <span><Activity size={14} /> REAL PLATFORM TOTALS</span>
                  <span>{stats?.server_time ? new Date(stats.server_time).toLocaleTimeString() : "—"}</span>
                </div>

                {stats ? (
                  <>
                    <div className="market-analytics-kpis">
                      <article>
                        <span>REGISTERED SHOPS</span>
                        <strong>{stats.shops_total.toLocaleString()}</strong>
                        <small>{stats.shops_active.toLocaleString()} active</small>
                      </article>
                      <article>
                        <span>BRANCHES</span>
                        <strong>{stats.branches_total.toLocaleString()}</strong>
                        <small>Cloud registered</small>
                      </article>
                      <article>
                        <span>DEVICES SYNCED</span>
                        <strong>{stats.devices_synced_24h.toLocaleString()}</strong>
                        <small>Last 24 hours</small>
                      </article>
                      <article>
                        <span>SYNC EVENTS</span>
                        <strong>{stats.sync_events_24h.toLocaleString()}</strong>
                        <small>Last 24 hours</small>
                      </article>
                    </div>

                    <div className="market-ops-visual">
                      <div className="market-ops-visual-heading">
                        <span>14-DAY CLOUD ACTIVITY</span>
                        <span className="market-ops-visual-key"><i /> Synced events</span>
                      </div>
                      {activity.length > 0 ? (
                        <div className="market-ops-bars" role="img" aria-label="Real Supabase sync events over the last 14 days">
                          {activity.map((item) => {
                            const count = Number(item.events) || 0;
                            const height = count > 0 ? Math.max(5, (count / maxEvents) * 100) : 2;
                            return (
                              <span
                                key={item.day}
                                style={{ height: `${height}%` }}
                                title={`${item.day}: ${count.toLocaleString()} events`}
                                aria-hidden="true"
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <p className="market-analytics-empty">No cloud activity has been recorded yet.</p>
                      )}
                      <div className="market-analytics-axis">
                        <span>{activity[0]?.day ?? "14 days ago"}</span>
                        <span>{activity.at(-1)?.day ?? "Today"}</span>
                      </div>
                    </div>
                    <div className="market-live-analytics-foot">
                      <span>Last cloud event</span>
                      <strong>{stats.last_sync_at ? new Date(stats.last_sync_at).toLocaleString() : "No cloud sync event yet"}</strong>
                    </div>
                  </>
                ) : (
                  <div className="market-analytics-unavailable" role="status">
                    <span>{statsQuery.isLoading ? "Connecting to the live BeBoss database…" : liveConfigured ? "Live analytics could not be loaded from Supabase." : "Public Supabase configuration is missing from this web build."}</span>
                    <button type="button" onClick={refreshAnalytics} disabled={statsQuery.isFetching}>
                      <RefreshCw size={13} className={statsQuery.isFetching ? "animate-spin" : ""} />
                      {statsQuery.isFetching ? "Refreshing" : "Retry live data"}
                    </button>
                  </div>
                )}
              </section>

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
                <Link to="/status">Cloud status <ArrowUpRight size={15} /></Link>
              </div>
            </div>
            <div className="market-ops-orbit market-ops-orbit-one" aria-hidden="true" />
            <div className="market-ops-orbit market-ops-orbit-two" aria-hidden="true" />
          </div>
          <a className="market-scroll-cue" href="#home-content">
            <span>{t("navHow")}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </a>
        </div>
      </section>
      <div className="cap-strip" id="home-content">
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
