import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock3, Cpu, Database, FileDown, HardDrive, MemoryStick, Printer, RefreshCw, Server, ShieldCheck, Wifi } from "lucide-react";
import { dateTime, errorText, n, s } from "../../lib/format";
import { checkCloudDatabase } from "../../lib/cloud";
import type { CloudState, Snapshot } from "../../lib/types";
import { PageHeading, StatCard, StatusPill } from "../ui";

type Diagnostics = {
  osPlatform: string; osArch: string; appVersion: string; dbPath: string;
  dbSizeBytes: number; pendingOutboxCount: number; oldestPendingAt: number | null;
  uptimeSeconds: number; hostname: string;
  databaseEncrypted: boolean; databaseCipherVersion: string; databaseIntegrity: string; journalMode: string;
  defaultPrinterName: string | null;
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
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerMessage, setPrinterMessage] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const system = await window.beBossDesktop.systemDiagnostics();
      const pending = await window.beBossDesktop.local.outboxCount();
      setDiag(system as Diagnostics);
      setOutbox(pending ?? (system as Diagnostics).pendingOutboxCount ?? 0);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runPing() {
    setBusy(true); setError("");
    try { setPing(await checkCloudDatabase()); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function printTestReceipt() {
    if (!diag?.defaultPrinterName) {
      setError("No default operating-system printer is configured. Add or select an ESC/POS printer in Windows Printers & scanners or your system printer settings.");
      return;
    }
    setPrinterBusy(true);
    setError("");
    setPrinterMessage("");
    try {
      const now = new Date();
      const result = await window.beBossDesktop.printEscposThermal({
        shopName: "BeBoss Desktop - PRINTER TEST",
        receiptNumber: "TEST-" + now.getTime().toString().slice(-8),
        date: now.toLocaleString(),
        cashier: "SYSTEM TEST",
        customer: "NOT A SALE",
        items: [{ name: "Thermal printer test", quantity: 1, unitPrice: 0, subtotal: 0 }],
        subtotal: 0,
        discount: 0,
        total: 0,
        paid: 0,
        balance: 0,
        paymentMethod: "TEST ONLY",
        tin: s(snapshot?.shopProfile?.tinNumber),
        address: s(snapshot?.shopProfile?.address),
        phone: s(snapshot?.shopProfile?.phone),
        header: "TEST PRINT - NOT A SALE",
        footer: "No sale, stock or payment was recorded.",
        seal: "DIAGNOSTIC ONLY"
      });
      setPrinterMessage(result.message);
    } catch (printError) {
      setError(errorText(printError));
    } finally {
      setPrinterBusy(false);
    }
  }

  async function exportSupportBundle() {
    setSupportBusy(true);
    setError("");
    setSupportMessage("");
    try {
      const [fresh, pending] = await Promise.all([
        window.beBossDesktop.systemDiagnostics(),
        window.beBossDesktop.local.outboxCount()
      ]);
      setDiag(fresh as Diagnostics);
      setOutbox(pending);
      const result = await window.beBossDesktop.exportSupportBundle({
        osPlatform: fresh.osPlatform,
        osArch: fresh.osArch,
        uptimeSeconds: fresh.uptimeSeconds,
        dbSizeBytes: fresh.dbSizeBytes,
        pendingOutboxCount: Math.max(0, pending),
        oldestPendingAt: fresh.oldestPendingAt,
        databaseEncrypted: fresh.databaseEncrypted,
        databaseCipherVersion: fresh.databaseCipherVersion,
        databaseIntegrity: fresh.databaseIntegrity,
        journalMode: fresh.journalMode,
        defaultPrinterConfigured: Boolean(fresh.defaultPrinterName),
        networkOnline: navigator.onLine,
        cloudTestPerformed: ping !== null,
        cloudReachable: ping ? ping.reachable : null,
        cloudLatencyMs: ping ? ping.latencyMs : null,
        verifiedCloudChunks: Math.max(0, cloud.verifiedChunks),
        lastCloudSnapshotAt: cloud.snapshotUpdatedAt > 0 ? cloud.snapshotUpdatedAt : null
      });
      setSupportMessage("Privacy-filtered support bundle saved to " + result.filePath +
        " · " + result.fileSizeBytes.toLocaleString() + " bytes · SHA-256 " + result.sha256.slice(0, 16) + "…");
    } catch (supportError) {
      setError(errorText(supportError));
    } finally {
      setSupportBusy(false);
    }
  }

  const online = navigator.onLine;

  return <div className="page-stack">
    <PageHeading eyebrow="SYSTEM HEALTH" title="Diagnostics & system health" description="Native device diagnostics plus a live Supabase PostgreSQL API check. Shop records are authoritative in the cloud; the local encrypted store is only for cache, credentials and retry recovery." action={<div className="heading-actions"><button className="btn-outline" onClick={() => void exportSupportBundle()} disabled={supportBusy || busy}><FileDown size={15} /> {supportBusy ? "Preparing bundle…" : "Export support bundle"}</button><button className="btn-outline" onClick={() => void printTestReceipt()} disabled={printerBusy || busy || !diag?.defaultPrinterName}><Printer size={15} /> {printerBusy ? "Printing…" : "Print test receipt"}</button><button className="btn-outline" onClick={runPing} disabled={busy}><Wifi size={15} /> Test cloud DB</button><button className="btn-primary" onClick={() => { void load(); onRefresh(); }} disabled={busy}><RefreshCw size={15} className={busy ? "spin" : ""} /> Refresh</button></div>} />
    {error && <div className="global-alert error"><AlertTriangle size={16} /><span>{error}</span></div>}
    {printerMessage && <div className="global-alert success"><Printer size={16} /><span>{printerMessage}</span></div>}
    {supportMessage && <div className="global-alert success"><FileDown size={16} /><span>{supportMessage} This export excludes shop records, customer data, hostnames, local database paths and secrets.</span></div>}

    <div className="stat-grid four">
      <StatCard label="Cloud database" value={ping ? (ping.reachable ? "Connected" : "Unavailable") : online ? "Not checked" : "Offline"} sub={ping ? ping.details : "Test the live Supabase PostgreSQL Data API"} icon={Wifi} tone={ping?.reachable ? "green" : online ? "orange" : "red"} />
      <StatCard label="Pending cloud writes" value={String(outbox)} sub="Encrypted retry queue; not yet cloud-committed" icon={Database} tone={outbox > 0 ? "orange" : "green"} />
      <StatCard label="Cloud snapshot integrity" value={cloud.verifiedChunks > 0 ? "Verified" : snapshot ? "Not verified" : "Unavailable"} sub={cloud.verifiedChunks + " verified cloud chunks · Supabase is the source of truth"} icon={ShieldCheck} tone={cloud.verifiedChunks > 0 ? "green" : snapshot ? "orange" : "red"} />
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
        <div className="panel-heading"><div><span className="eyebrow muted">ON-DEVICE RECOVERY</span><h3>Encrypted cache and retry store</h3></div><HardDrive size={18} className="muted-icon" /></div>
        <div className="diag-row"><span>Protected recovery-store path</span><strong className="mono diag-path">{diag ? diag.dbPath : "—"}</strong></div>
        <div className="diag-row"><span>Local cache/queue size</span><strong>{diag ? formatBytes(diag.dbSizeBytes) : "—"}</strong></div>
        <div className="diag-row"><span>Encryption</span><strong>{diag ? diag.databaseEncrypted ? "SQLCipher " + diag.databaseCipherVersion : "Not verified" : "Checking…"}</strong></div>
        <div className="diag-row"><span>Integrity quick-check</span><strong>{diag ? diag.databaseIntegrity === "ok" ? "Passed" : "Attention required" : "Checking…"}</strong></div>
        <div className="diag-row"><span>Journal mode</span><strong>{diag ? diag.journalMode.toUpperCase() : "Checking…"}</strong></div>
        <div className="diag-row"><span>Oldest pending change</span><strong>{diag?.oldestPendingAt ? dateTime(diag.oldestPendingAt) : "None"}</strong></div>
        <div className="diag-row"><span>Default printer</span><strong>{diag?.defaultPrinterName || "Not configured"}</strong></div>
        <div className="diag-row"><span>Key protection</span><strong>OS keyring</strong></div>
      </section>

      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">SYNC OUTBOX</span><h3>Pending transactions</h3></div><RefreshCw size={18} className="muted-icon" /></div>
        <div className="diag-row"><span>Queued operations</span><strong>{outbox}</strong></div>
        <div className="diag-row"><span>Last snapshot</span><strong>{dateTime(cloud.snapshotUpdatedAt)}</strong></div>
        <div className="diag-row"><span>Verified chunks</span><strong>{cloud.verifiedChunks}</strong></div>
        <div className="diag-row"><span>Sync state</span><StatusPill value={!online ? "OFFLINE" : outbox > 0 ? "PENDING" : cloud.verifiedChunks > 0 ? "VERIFIED" : "NOT_VERIFIED"} /></div>
      </section>

      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">CLOUD DATABASE</span><h3>Supabase PostgreSQL · source of truth</h3></div><Activity size={18} className="muted-icon" /></div>
        <div className="diag-row"><span>Business-data authority</span><strong>Supabase PostgreSQL</strong></div>
        <div className="diag-row"><span>Last confirmed cloud snapshot</span><strong>{cloud.snapshotUpdatedAt ? dateTime(cloud.snapshotUpdatedAt) : "Not available"}</strong></div>
        <div className="diag-row"><span>Verified cloud chunks</span><strong>{cloud.verifiedChunks}</strong></div>
        {ping ? <div className="diag-ping">
          <div className={"ping-orb " + (ping.reachable ? "ok" : "bad")}><Wifi size={22} /></div>
          <div><strong>{ping.reachable ? "Cloud reachable" : "Cloud unreachable"}</strong><small>{ping.reachable ? ping.latencyMs + " ms round-trip" : "Connection failed"}</small></div>
          <code>{ping.host}</code>
        </div> : <div className="diag-empty"><Activity size={18} /><span>Test the actual Supabase PostgreSQL Data API, not only the device network or TCP port.</span></div>}
      </section>
    </div>

    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow muted">HARDWARE & RUNTIME</span><h3>Device capabilities</h3></div><Cpu size={18} className="muted-icon" /></div>
      <div className="cap-grid">
        <div className="cap-item"><MemoryStick size={16} /><div><strong>On-device recovery</strong><small>Encrypted cache, credentials and retry queue only</small></div><StatusPill value={diag?.databaseEncrypted ? "ACTIVE" : "PENDING"} /></div>
        <div className="cap-item"><Cpu size={16} /><div><strong>Barcode input</strong><small>USB keyboard-wedge scanners</small></div><StatusPill value="ACTIVE" /></div>
        <div className="cap-item"><Printer size={16} /><div><strong>Receipt printing</strong><small>RAW ESC/POS via the OS default printer queue; system print/PDF remains available</small></div><StatusPill value={diag?.defaultPrinterName ? "ACTIVE" : "PENDING"} /></div>
        <div className="cap-item"><ShieldCheck size={16} /><div><strong>Owner verification</strong><small>SMS OTP + active membership</small></div><StatusPill value={s(cloud.owner?.user_id) ? "ACTIVE" : "PENDING"} /></div>
      </div>
    </section>
  </div>;
}