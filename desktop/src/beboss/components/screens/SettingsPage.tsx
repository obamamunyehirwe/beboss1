import type React from "react";
import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, Check, ChevronRight, Cloud, Database, RefreshCw, Settings2,
  ShieldCheck, Store, Sun, Moon, Monitor, Zap, Users, Building2, Smartphone,
  CreditCard, HardDrive, LockKeyhole, Package, BarChart3
} from "lucide-react";
import { errorText, n, s } from "../../lib/format";
import type { CloudState, CommitSnapshot, DesktopPreferences, NavKey, Snapshot } from "../../lib/types";
import { DESKTOP_LANGUAGES } from "../../lib/i18n";
import { PageHeading, StatusPill } from "../ui";

type RuntimeDiagnostics = {
  osPlatform?: string; osArch?: string; appVersion?: string; dbPath?: string;
  dbSizeBytes?: number; pendingOutboxCount?: number; uptimeSeconds?: number;
  hostname?: string; databaseEncrypted?: boolean; databaseCipherVersion?: string;
};

const DEFAULT_PREFERENCES: DesktopPreferences = {
  theme: "system", density: "comfortable", accent: "orange", defaultView: "welcome",
  language: "en", autoSync: true, refreshMinutes: 5, reducedMotion: false
};

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (value: boolean) => void
}) {
  return <label className="settings-toggle-row">
    <span><strong>{label}</strong><small>{description}</small></span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

export function SettingsPage({ snapshot, cloud, onCommit, offline, preferences, onSavePreferences, onNavigate, onRefresh, version }: {
  snapshot: Snapshot | null; cloud: CloudState; onCommit: CommitSnapshot; offline: boolean;
  preferences: DesktopPreferences; onSavePreferences: (value: DesktopPreferences) => Promise<void>;
  onNavigate: (view: NavKey) => void; onRefresh: () => Promise<void>; version: string
}) {
  const profile = snapshot?.shopProfile ?? {};
  const build = () => ({
    shopName: s(profile.shopName), ownerName: s(profile.name), phone: s(profile.phone), email: s(profile.email),
    address: s(profile.address), tin: s(profile.tinNumber), taxRate: String(profile.taxRate ?? 0),
    receiptHeader: s(profile.receiptHeader), receiptFooter: s(profile.receiptFooter),
    currency: s(profile.currencySymbol) || "FRw", dailyTarget: String(profile.dailySalesTarget ?? 0),
    monthlyTarget: String(profile.monthlyRevenueTarget ?? 0)
  });
  const [draft, setDraft] = useState(build);
  const [preferenceDraft, setPreferenceDraft] = useState<DesktopPreferences>(preferences);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savedNotice, setSavedNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [runtime, setRuntime] = useState<RuntimeDiagnostics | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);

  useEffect(() => { setDraft(build()); }, [snapshot?.shopProfile?.updatedAt]);
  useEffect(() => { setPreferenceDraft(preferences); }, [preferences]);

  async function loadRuntime() {
    setLoadingRuntime(true); setRuntimeError("");
    try {
      const [diagnostics, pending] = await Promise.all([
        window.beBossDesktop.systemDiagnostics(), window.beBossDesktop.local.outboxCount()
      ]);
      setRuntime({ ...diagnostics, pendingOutboxCount: pending });
      setLastRefresh(Date.now());
    } catch (error) { setRuntimeError(errorText(error)); }
    finally { setLoadingRuntime(false); }
  }
  useEffect(() => { void loadRuntime(); }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); setSavingProfile(true); setSaveError(""); setSavedNotice("");
    try {
      await onCommit((next) => {
        const now = Date.now();
        next.shopProfile = {
          ...next.shopProfile, shopName: draft.shopName.trim(), name: draft.ownerName.trim(),
          phone: draft.phone.trim(), email: draft.email.trim(), address: draft.address.trim(),
          tinNumber: draft.tin.trim(), taxRate: Math.max(0, Math.min(100, n(draft.taxRate))),
          receiptHeader: draft.receiptHeader.trim(), receiptFooter: draft.receiptFooter.trim(),
          currencySymbol: draft.currency.trim() || "FRw",
          dailySalesTarget: Math.max(0, n(draft.dailyTarget)),
          monthlyRevenueTarget: Math.max(0, n(draft.monthlyTarget)),
          updatedAt: now, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP"
        };
      }, "SHOP_PROFILE_UPDATE");
      setSavedNotice("Business profile saved through the protected BeBoss snapshot workflow.");
    } catch (error) { setSaveError(errorText(error)); }
    finally { setSavingProfile(false); }
  }

  async function savePreferences(event: React.FormEvent) {
    event.preventDefault(); setSavingPreferences(true); setSaveError(""); setSavedNotice("");
    try {
      await onSavePreferences(preferenceDraft);
      setSavedNotice("Desktop preferences encrypted and saved on this device.");
    } catch (error) { setSaveError(errorText(error)); }
    finally { setSavingPreferences(false); }
  }

  async function resetPreferences() {
    setPreferenceDraft(DEFAULT_PREFERENCES);
    setSavingPreferences(true); setSaveError(""); setSavedNotice("");
    try {
      await onSavePreferences(DEFAULT_PREFERENCES);
      setSavedNotice("Desktop preferences restored to their default configuration.");
    } catch (error) { setSaveError(errorText(error)); }
    finally { setSavingPreferences(false); }
  }

  const currency = s(profile.currencySymbol) || "FRw";
  const businessLinks: { label: string; view: NavKey; icon: typeof Cloud; detail: string }[] = [
    { label: "Sync hub", view: "sync", icon: Cloud, detail: offline ? "Offline queue active" : cloud.verifiedChunks + " verified chunks" },
    { label: "Backup & recovery", view: "backup", icon: Database, detail: "Encrypted exports and signed branch exchange" },
    { label: "System diagnostics", view: "diagnostics", icon: Activity, detail: "Native runtime and connection checks" },
    { label: "Subscription & payments", view: "billing", icon: CreditCard, detail: s(cloud.shop.subscription_status) || "Plan status" },
    { label: "Staff & permissions", view: "staff", icon: Users, detail: cloud.staff.length + " staff records" },
    { label: "Branches & locations", view: "branches", icon: Building2, detail: cloud.branches.length + " branch records" },
    { label: "POS devices", view: "devices", icon: Smartphone, detail: cloud.devices.length + " registered devices" },
    { label: "Inventory controls", view: "products", icon: Package, detail: "Catalogue and reorder levels" },
    { label: "Business reporting", view: "reports", icon: BarChart3, detail: "Snapshot-derived financial reports" }
  ];

  return <div className="page-stack">
    <PageHeading eyebrow="WORKSPACE CONFIGURATION" title="Settings & controls"
      description="Configure the shared shop profile, desktop behavior, data synchronization and security diagnostics."
      action={<button className="btn-outline" onClick={() => void onRefresh()} disabled={offline}><RefreshCw size={15} /> Refresh cloud data</button>} />
    {(savedNotice || saveError) && <div className={"global-alert " + (saveError ? "error" : "success")}><span>{saveError || savedNotice}</span></div>}
    <div className="settings-layout settings-layout-enterprise">
      <div className="settings-main-column">
        <form className="panel settings-form" onSubmit={(event) => void saveProfile(event)}>
          <div className="panel-heading"><div><span className="eyebrow muted">SHOP PROFILE · CLOUD-SHARED</span><h3>Business identity & finance</h3></div><Store size={18} className="muted-icon" /></div>
          <p className="settings-section-description">These fields update the shared shop profile consumed by compatible BeBoss terminals and receipt workflows.</p>
          <div className="form-grid">
            <label className="field-wide">Shop name<input required maxLength={120} value={draft.shopName} onChange={(event) => setDraft({ ...draft, shopName: event.target.value })} /></label>
            <label>Owner name<input maxLength={120} value={draft.ownerName} onChange={(event) => setDraft({ ...draft, ownerName: event.target.value })} /></label>
            <label>Business phone<input maxLength={40} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label>Email<input type="email" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
            <label>Tax identification number<input maxLength={80} value={draft.tin} onChange={(event) => setDraft({ ...draft, tin: event.target.value })} /></label>
            <label className="field-wide">Shop address<input maxLength={240} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
            <label>Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={draft.taxRate} onChange={(event) => setDraft({ ...draft, taxRate: event.target.value })} /></label>
            <label>Receipt currency symbol<input required maxLength={8} value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} /></label>
            <label>Daily sales target ({currency})<input type="number" min="0" max="1000000000000" value={draft.dailyTarget} onChange={(event) => setDraft({ ...draft, dailyTarget: event.target.value })} /></label>
            <label>Monthly revenue target ({currency})<input type="number" min="0" max="1000000000000" value={draft.monthlyTarget} onChange={(event) => setDraft({ ...draft, monthlyTarget: event.target.value })} /></label>
          </div>
          <div className="panel-subhead"><strong>Receipt presentation</strong><small>Shared receipt text is saved with the shop profile.</small></div>
          <div className="form-grid">
            <label className="field-wide">Receipt header<input maxLength={180} value={draft.receiptHeader} onChange={(event) => setDraft({ ...draft, receiptHeader: event.target.value })} /></label>
            <label className="field-wide">Receipt footer<input maxLength={300} value={draft.receiptFooter} onChange={(event) => setDraft({ ...draft, receiptFooter: event.target.value })} /></label>
          </div>
          <div className="form-footer"><span className="muted small-text">Owner-verified cloud write · {offline ? "queued offline" : "online"}</span><button className="btn-primary" disabled={savingProfile || !draft.shopName.trim()}>{savingProfile ? <RefreshCw size={15} className="spin" /> : <Check size={15} />} Save business profile</button></div>
        </form>

        <form className="panel settings-form" onSubmit={(event) => void savePreferences(event)}>
          <div className="panel-heading"><div><span className="eyebrow muted">DESKTOP EXPERIENCE · ENCRYPTED LOCAL</span><h3>Workspace preferences</h3></div><Settings2 size={18} className="muted-icon" /></div>
          <p className="settings-section-description">Preferences are encrypted in this desktop installation and do not overwrite shop-wide mobile settings.</p>
          <div className="settings-preference-grid">
            <section className="settings-preference-card"><div className="settings-preference-heading"><span><Sun size={17} /></span><div><strong>Appearance</strong><small>Choose the interface theme.</small></div></div>
              <div className="settings-choice-grid">
                {([{ value: "dark", label: "Dark", icon: Moon }, { value: "light", label: "Light", icon: Sun }, { value: "system", label: "System", icon: Monitor }] as const).map((choice) => { const Icon = choice.icon; return <button type="button" key={choice.value} className={"settings-choice " + (preferenceDraft.theme === choice.value ? "selected" : "")} onClick={() => setPreferenceDraft({ ...preferenceDraft, theme: choice.value })}><Icon size={15} />{choice.label}</button>; })}
              </div>
            </section>
            <section className="settings-preference-card"><div className="settings-preference-heading"><span><Zap size={17} /></span><div><strong>Accent color</strong><small>Personalize highlighted actions.</small></div></div>
              <div className="settings-choice-grid">{(["orange", "blue", "green"] as const).map((choice) => <button type="button" key={choice} className={"settings-choice " + (preferenceDraft.accent === choice ? "selected" : "")} onClick={() => setPreferenceDraft({ ...preferenceDraft, accent: choice })}><i className={"accent-dot " + choice} />{choice.slice(0, 1).toUpperCase() + choice.slice(1)}</button>)}</div>
            </section>
            <section className="settings-preference-card"><div className="settings-preference-heading"><span><Monitor size={17} /></span><div><strong>Layout density</strong><small>Comfortable or compact information density.</small></div></div>
              <div className="settings-choice-grid">{([{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }] as const).map((choice) => <button type="button" key={choice.value} className={"settings-choice " + (preferenceDraft.density === choice.value ? "selected" : "")} onClick={() => setPreferenceDraft({ ...preferenceDraft, density: choice.value })}>{choice.label}</button>)}</div>
            </section>
            <section className="settings-preference-card"><div className="settings-preference-heading"><span><Activity size={17} /></span><div><strong>Startup workspace</strong><small>First page after owner verification.</small></div></div>
              <select value={preferenceDraft.defaultView} onChange={(event) => setPreferenceDraft({ ...preferenceDraft, defaultView: event.target.value as DesktopPreferences["defaultView"] })}><option value="welcome">Welcome page</option><option value="overview">Business overview</option><option value="management">Management center</option></select>
            </section>
            <section className="settings-preference-card settings-language-card"><div className="settings-preference-heading"><span><Store size={17} /></span><div><strong>Interface language</strong><small>English, Kinyarwanda, French or Kiswahili.</small></div></div>
              <select aria-label="Desktop interface language" value={preferenceDraft.language} onChange={(event) => setPreferenceDraft({ ...preferenceDraft, language: event.target.value as DesktopPreferences["language"] })}>
                {DESKTOP_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
              </select>
              <p className="settings-language-note">Uses BeBoss's bundled mobile localization catalog, with desktop-specific terms included. Any unmatched copy stays in its source language.</p>
            </section>
          </div>
          <div className="panel-subhead"><strong>Synchronization behavior</strong><small>Business transactions still save immediately; this controls recovery retries and periodic refresh.</small></div>
          <div className="settings-toggles">
            <Toggle label="Automatic synchronization retries" description="Retry the durable outbox when internet connectivity returns." checked={preferenceDraft.autoSync} onChange={(value) => setPreferenceDraft({ ...preferenceDraft, autoSync: value })} />
            <Toggle label="Reduce motion" description="Disable non-essential transitions for accessibility and lower-power systems." checked={preferenceDraft.reducedMotion} onChange={(value) => setPreferenceDraft({ ...preferenceDraft, reducedMotion: value })} />
          </div>
          <label className="settings-select-row"><span><strong>Online data refresh</strong><small>Refresh cloud records while the workspace is open.</small></span>
            <select value={preferenceDraft.refreshMinutes} onChange={(event) => setPreferenceDraft({ ...preferenceDraft, refreshMinutes: Number(event.target.value) as DesktopPreferences["refreshMinutes"] })}><option value={0}>Manual only</option><option value={1}>Every minute</option><option value={5}>Every 5 minutes</option><option value={15}>Every 15 minutes</option></select>
          </label>
          <div className="form-footer"><span className="muted small-text">Saved with native encrypted local storage</span><div className="settings-form-actions"><button className="btn-outline" type="button" onClick={() => void resetPreferences()} disabled={savingPreferences}>Reset</button><button className="btn-primary" disabled={savingPreferences}>{savingPreferences ? <RefreshCw size={15} className="spin" /> : <Check size={15} />} Save preferences</button></div></div>
        </form>
      </div>
      <aside className="settings-side-stack">
        <section className="panel settings-side"><div className="panel-heading"><div><span className="eyebrow muted">ACCOUNT & TENANT SECURITY</span><h3>Connected account</h3></div><ShieldCheck size={18} className="green-icon" /></div>
          <div className="security-line"><span>Owner account</span><strong>@{s(cloud.owner?.owner_username) || s(cloud.owner?.username) || "verified owner"}</strong></div>
          <div className="security-line"><span>Cloud session</span><StatusPill value={offline ? "OFFLINE CACHE" : "ACTIVE"} /></div>
          <div className="security-line"><span>Snapshot integrity</span><StatusPill value={cloud.verifiedChunks > 0 ? "VERIFIED" : "NOT SYNCED"} /></div>
          <div className="security-line"><span>Local database</span><strong>{runtime?.databaseEncrypted ? "SQLCipher encrypted" : "Checking"}</strong></div>
          <div className="security-line"><span>Local outbox</span><strong>{runtime?.pendingOutboxCount ?? "—"} pending writes</strong></div>
          <div className="security-line"><span>Tenant authorization</span><strong>Verified owner session</strong></div>
          <div className="security-warning"><AlertTriangle size={16} /><span>Desktop does not expose owner secrets, staff PINs, payment-provider credentials or platform signing keys.</span></div>
        </section>
        <section className="panel settings-side"><div className="panel-heading"><div><span className="eyebrow muted">NATIVE RUNTIME</span><h3>System & database</h3></div><HardDrive size={18} className="muted-icon" /></div>
          {runtimeError && <div className="inline-alert error"><AlertTriangle size={14} />{runtimeError}</div>}
          <div className="security-line"><span>Application version</span><strong>{runtime?.appVersion || version}</strong></div>
          <div className="security-line"><span>Operating system</span><strong>{runtime?.osPlatform || "Loading"} {runtime?.osArch || ""}</strong></div>
          <div className="security-line"><span>Device hostname</span><strong>{runtime?.hostname || "Loading"}</strong></div>
          <div className="security-line"><span>Database cipher</span><strong>{runtime?.databaseCipherVersion || "Checking"}</strong></div>
          <div className="security-line"><span>Database file</span><strong>{runtime?.dbSizeBytes != null ? (runtime.dbSizeBytes / 1048576).toFixed(2) + " MB" : "Loading"}</strong></div>
          <div className="security-line"><span>Process uptime</span><strong>{runtime?.uptimeSeconds != null ? Math.floor(runtime.uptimeSeconds / 60) + " min" : "Loading"}</strong></div>
          <div className="settings-runtime-actions"><button className="btn-outline" type="button" onClick={() => void loadRuntime()} disabled={loadingRuntime}>{loadingRuntime ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />} Refresh diagnostics</button><small>{lastRefresh ? "Checked " + new Date(lastRefresh).toLocaleTimeString() : "Native checks not yet run"}</small></div>
        </section>
        <section className="panel settings-side"><div className="panel-heading"><div><span className="eyebrow muted">OPERATIONAL WORKSPACES</span><h3>Advanced controls</h3></div><LockKeyhole size={18} className="muted-icon" /></div>
          <div className="settings-tools-list">{businessLinks.map((item) => { const Icon = item.icon; return <button key={item.view} className="settings-tool-link" onClick={() => onNavigate(item.view)}><span><Icon size={15} /><b>{item.label}</b></span><small>{item.detail}</small><ChevronRight size={14} /></button>; })}</div>
        </section>
      </aside>
    </div>
  </div>;
}
