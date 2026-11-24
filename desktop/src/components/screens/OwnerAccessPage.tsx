import type React from "react";
import { useState } from "react";
import { AlertTriangle, BadgeCheck, CalendarClock, KeyRound, LoaderCircle, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { dateTime, n, rows, s } from "../../lib/format";
import type { CloudState } from "../../lib/types";
import { PageHeading, StatusPill } from "../ui";

type UnlockResult = { valid: boolean; daysGranted: number; newExpiryTimestamp: number; tier: string; message: string };

export function OwnerAccessPage({ cloud }: { cloud: CloudState }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UnlockResult | null>(null);
  const [error, setError] = useState("");
  const devices = rows(cloud.devices);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) { setError("Enter an owner access code to verify."); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await window.beBossDesktop.verifyEmergencyCode(code.trim()) as UnlockResult;
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The code could not be verified on this device.");
    } finally { setBusy(false); }
  }

  return <div className="page-stack">
    <PageHeading eyebrow="SECURITY & ACCESS" title="Owner access console"
      description="Verify emergency owner-access codes and review the POS terminals registered to this shop. Verification runs locally on this device." />

    <div className="dashboard-grid">
      <section className="panel span-2">
        <div className="panel-heading"><div><span className="eyebrow muted">EMERGENCY ACCESS</span><h3>Verify owner access code</h3></div><KeyRound size={18} className="muted-icon" /></div>
        <form className="form-grid" onSubmit={verify}>
          <label className="field-wide">Owner access code
            <input autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter the emergency owner code" className="mono" />
          </label>
          <div className="modal-actions field-wide"><button type="submit" className="btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{busy ? "Verifying…" : "Verify code"}</button></div>
        </form>
        {error && <div className="inline-alert error"><AlertTriangle size={15} />{error}</div>}
        {result && <div className={"access-result " + (result.valid ? "valid" : "invalid")}>
          {result.valid ? <BadgeCheck size={18} /> : <ShieldAlert size={18} />}
          <div><strong>{result.valid ? "Code accepted" : "Code not accepted"}</strong>
            {result.message && <small>{result.message}</small>}
            {result.valid && <div className="access-meta"><span><CalendarClock size={13} /> {result.daysGranted} day(s) granted</span><span><ShieldCheck size={13} /> Tier: {result.tier || "Owner"}</span>{result.newExpiryTimestamp > 0 && <span>Active until {dateTime(result.newExpiryTimestamp)}</span>}</div>}
          </div>
        </div>}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">REGISTERED TERMINALS</span><h3>Shop devices</h3></div><Smartphone size={18} className="muted-icon" /></div>
        {devices.length === 0 ? <div className="empty-state compact"><span><Smartphone size={22} /></span><strong>No registered devices</strong><p>Paired BeBoss terminals will appear here after the first cloud sync.</p></div>
          : <div className="device-list">{devices.map((device) => <div className="device-row" key={s(device.id)}>
            <span className="device-row-icon"><Smartphone size={16} /></span>
            <div><strong>{s(device.deviceName) || s(device.name) || "POS terminal"}</strong><small>{s(device.platform) || "Desktop"} · {s(device.id).slice(0, 12)}</small></div>
            <StatusPill value={device.is_active === false ? "INACTIVE" : "ACTIVE"} />
          </div>)}</div>}
      </section>
    </div>

    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow muted">SECURITY MODEL</span><h3>How owner access is protected</h3></div><ShieldCheck size={18} className="muted-icon" /></div>
      <div className="health-row"><span className="health-dot good" /><div><strong>On-device verification</strong><small>Emergency codes are validated against signed BeBoss unlock records on this terminal, not a remote server.</small></div></div>
      <div className="health-row"><span className="health-dot good" /><div><strong>Time-bound grants</strong><small>A valid code grants access for a fixed number of days and records the new expiry on this device.</small></div></div>
      <div className="health-row"><span className="health-dot good" /><div><strong>Read-only device registry</strong><small>Terminal activation is managed from the Devices screen; this console only displays the registered terminals.</small></div></div>
    </section>
  </div>;
}