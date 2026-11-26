import { ArrowRight, CheckCircle2, Clock3, CloudDownload, Database, Laptop, Smartphone } from "lucide-react";
import type { DesktopPreferences, RestorePreview } from "../lib/types";

const RECORD_LABELS: Array<[keyof RestorePreview["counts"], string]> = [
  ["products", "Products"], ["customers", "Customers"], ["sales", "Sales"],
  ["saleItems", "Sale items"], ["customerPayments", "Customer payments"],
  ["purchases", "Purchases"], ["stockTransfers", "Stock transfers"],
  ["branches", "Branches"], ["users", "Staff accounts"]
];
const formatCount = (value: number) => Math.max(0, Number(value) || 0).toLocaleString();
function formatSyncTime(value: number) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Last sync time unavailable";
}

export function DeviceRestorePrompt({ preview, theme, busy, error, onRestore, onNotNow }: {
  preview: RestorePreview; theme: DesktopPreferences["theme"]; busy: boolean; error: string;
  onRestore: () => void; onNotNow: () => void;
}) {
  return <main className="device-restore-shell" data-theme={theme}>
    <section className="device-restore-card" aria-labelledby="device-restore-title">
      <div className="device-restore-brand"><img src="/beboss-app-icon.png" alt="BeBoss" /><span>SECURE DEVICE SETUP</span></div>
      <div className="device-restore-icon"><CloudDownload size={26} /></div>
      <p className="device-restore-eyebrow">YOUR SHOP IS ALREADY IN BEBOSS</p>
      <h1 id="device-restore-title">Retrieve your shop data?</h1>
      <p className="device-restore-lead">BeBoss found a verified cloud snapshot from your existing shop devices. Retrieve the shared business records to this desktop before opening the workspace.</p>
      <div className="device-restore-summary">
        <div><strong>{formatCount(preview.totalRecords)}</strong><span>records available</span></div>
        <div><strong>{formatCount(preview.verifiedChunks)}</strong><span>verified data chunks</span></div>
        <div><strong>{formatCount(preview.sourceDevices.length)}</strong><span>source devices</span></div>
      </div>
      <div className="device-restore-section">
        <div className="device-restore-section-title"><Database size={16} /><strong>Records found in your shop</strong></div>
        <div className="device-restore-counts">{RECORD_LABELS.map(([key,label]) => <div key={key}><span>{label}</span><strong>{formatCount(preview.counts[key])}</strong></div>)}</div>
      </div>
      <div className="device-restore-section">
        <div className="device-restore-section-title"><Smartphone size={16} /><strong>Devices that supplied the snapshot</strong></div>
        <div className="device-restore-sources">{preview.sourceDevices.map(device => <div key={device.deviceId} className="device-restore-source">
          <span className="device-restore-source-icon">{device.platform === "DESKTOP" ? <Laptop size={17} /> : <Smartphone size={17} />}</span>
          <span className="device-restore-source-copy"><strong>{device.name}</strong><small>{device.platform === "ANDROID" ? "Android terminal" : device.platform === "DESKTOP" ? "Desktop installation" : "BeBoss terminal"}</small></span>
          <span className="device-restore-source-time"><Clock3 size={13} />{formatSyncTime(device.lastSyncedAt)}</span>
        </div>)}</div>
      </div>
      <div className="device-restore-integrity"><CheckCircle2 size={17} /><span>BeBoss verifies the cloud snapshot and merges records using record versions and deletion history. Existing phone data is not deleted by this retrieval.</span></div>
      {error && <div className="device-restore-error" role="alert">{error}</div>}
      <div className="device-restore-actions">
        <button className="device-restore-primary" type="button" disabled={busy} onClick={onRestore}>{busy ? "Connecting and retrieving data…" : "Retrieve shop data"} <ArrowRight size={17} /></button>
        <button className="device-restore-secondary" type="button" disabled={busy} onClick={onNotNow}>Not now — return to sign in</button>
      </div>
      <p className="device-restore-billing">Registering an additional active desktop may add FRw 2,000 per month to the shop subscription. A separate owner confirmation is shown before registration; this restore screen does not charge a payment.</p>
      <p className="device-restore-foot">Last verified cloud snapshot · {formatSyncTime(preview.snapshotUpdatedAt)}</p>
    </section>
  </main>;
}
