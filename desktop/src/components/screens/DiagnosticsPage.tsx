import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock3, Cpu, Database, HardDrive, MemoryStick, RefreshCw, Server, ShieldCheck, Wifi } from "lucide-react";
import { dateTime, errorText, n, s } from "../../lib/format";
import type { CloudState, Snapshot } from "../../lib/types";
import { PageHeading, StatCard, StatusPill } from "../ui";

type Diagnostics = {
  osPlatform: string; osArch: string; appVersion: string; dbPath: string;
  dbSizeBytes: number; pendingOutboxCount: number; uptimeSeconds: number; hostname: string;
};

type PingState = { host: string; latencyMs: number; reachable: boolean; details: string } | null;

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return value.toFixed(i === 0 ? 0 : 1) + " " + units[i];
}
function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), sec = seconds % 60;
  return (h ? h + "h " : "") + (m ? m + "m " : "") + sec + "s";
}

export function DiagnosticsPage({ cloud, snapshot, onRefresh }: {
  cloud: CloudState; snapshot: Snapshot | null; onRefresh: () => void
}) {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [outbox, setOutbox] = useState<number>(0);
  const [ping, setPing] = useState<PingState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [system, pending] = await Promise.all([
        window.beBossDesktop.systemDiagnostics(),
        window.beBossDesktop.local.outboxCount()
      ]);
      setDiag(system as Diagnostics);
      setOutbox(pending ?? (system as Diagnostics).pendingOutboxCount ?? 0);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runPing() {
    setBusy(true); setError("");
    try { setPing(await window.beBossDesktop.networkPing()); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  const online = navigator.onLine;

  return <div className="page-stack">
    <PageHeading eyebrow="SYSTEM HEALTH" title="Diagnostics & system health" description="Live technical health of this desktop installation: operating system, encrypted local database, sync outbox and cloud connectivity." action={<div className="heading-actions"><button className="btn-outline" onClick={runPing} disabled={busy}><Wifi size={15} /> Ping cloud</button><button className="btn-primary" onClick={() => { void load(); onRefresh(); }} disabled={busy}><RefreshCw size={15} className={busy ? "spin" : ""} /> Refresh</button></div>} />
    {error && <div className="global-alert error"><AlertTriangle size={16} /><span>{error}</span></div>}

    <div className="stat-grid four">
      <StatCard label="Cloud connection" value={online ? "Online" : "Offline"} sub={online ? "Reachable" : "Using encrypted cache"} icon={Wifi} tone={online ? "green" : "orange"} />
      <StatCard label="Pending outbox" value={String(outbox)} sub="Queued local transactions" icon={Database} tone={outbox > 0 ? "orange" : "green"} />
      <StatCard label="Snapshot integrity" value={snapshot ? "Verified" : "Not synced"} sub={cloud.verifiedChunks + " verified chunks"} icon={ShieldCheck} tone={snapshot ? "green" : "red"} />
      <StatCard label="App uptime" value={diag ? formatUptime(diag.uptimeSeconds) : "—"} sub="This session" icon={Clock3} tone="purple" />
    </div>

    <div className="diag-grid">
      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">PLATFORM</span><h3>Operating system</h3></div><Server size={18} className="muted-icon" /></div>
        <div className="diag-row"><span>OS platform</span><strong>{diag ? diag.osPlatform : "—"}</strong></div>
        <div className="diag-row"><span>Architecture</span><strong>{diag ? diag.osArch : "—"}</strong></div>
        <div className="diag-row"><span>Hostname</span><strong>{diag ? diag.hostname : "—"}</strong></div>
        <div className="diag-row"><span>Desktop version</span><strong>{diag ? diag.appVersion : window.beBossDesktop.version}</strong></div>
      </section>

      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">LOCAL DATABASE</span><h3>Encrypted SQLite</h3></div><HardDrive size={18} className="muted-icon" /></div>
        <div className="diag-row"><span>Database path</span><strong className="mono diag-path">{diag ? diag.dbPath : "—"}</strong></div>
        <div className="diag-row"><span>Database size</span><strong>{diag ? formatBytes(diag.dbSizeBytes) : "—"}</strong></div>
        <div className="diag-row"><span>Encryption</span><strong>AES-256-GCM</strong></div>
        <div className="diag-row"><span>Key protection</span><strong>OS keyring</strong></div>
      </section>

      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">SYNC OUTBOX</span><h3>Pending transactions</h3></div><RefreshCw size={18} className="muted-icon" /></div>
        <div className="diag-row"><span>Queued operations</span><strong>{outbox}</strong></div>
        <div className="diag-row"><span>Last snapshot</span><strong>{dateTime(cloud.snapshotUpdatedAt)}</strong></div>
        <div className="diag-row"><span>Verified chunks</span><strong>{cloud.verifiedChunks}</strong></div>
        <div className="diag-row"><span>Sync state</span><StatusPill value={online ? (outbox > 0 ? "PENDING" : "ACTIVE") : "OFFLINE"} /></div>
      </section>

      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">CLOUD LATENCY</span><h3>Network reachability</h3></div><Activity size={18} className="muted-icon" /></div>
        {ping ? <div className="diag-ping">
          <div className={"ping-orb " + (ping.reachable ? "ok" : "bad")}><Wifi size={22} /></div>
          <div><strong>{ping.reachable ? "Cloud reachable" : "Cloud unreachable"}</strong><small>{ping.reachable ? ping.latencyMs + " ms round-trip" : "Connection failed"}</small></div>
          <code>{ping.host}</code>
        </div> : <div className="diag-empty"><Activity size={18} /><span>Run a latency probe to measure the connection to BeBoss Cloud.</span></div>}
      </section>
    </div>

    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow muted">HARDWARE & RUNTIME</span><h3>Device capabilities</h3></div><Cpu size={18} className="muted-icon" /></div>
      <div className="cap-grid">
        <div className="cap-item"><MemoryStick size={16} /><div><strong>Local persistence</strong><small>Encrypted SQLite + OS keyring</small></div><StatusPill value="ACTIVE" /></div>
        <div className="cap-item"><Cpu size={16} /><div><strong>Barcode input</strong><small>USB keyboard-wedge scanners</small></div><StatusPill value="ACTIVE" /></div>
        <div className="cap-item"><Server size={16} /><div><strong>Receipt printing</strong><small>ESC/POS thermal + system print / PDF</small></div><StatusPill value="ACTIVE" /></div>
        <div className="cap-item"><ShieldCheck size={16} /><div><strong>Owner verification</strong><small>SMS OTP + active membership</small></div><StatusPill value={s(cloud.owner?.user_id) ? "ACTIVE" : "PENDING"} /></div>
      </div>
    </section>
  </div>;
}