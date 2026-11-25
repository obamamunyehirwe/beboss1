import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, CloudUpload, Database, HardDriveDownload, LoaderCircle, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { dateTime, n, s } from "../../lib/format";
import type { CloudState } from "../../lib/types";
import { PageHeading, StatCard } from "../ui";

type Pending = { id: string; payload: any; hlc: number; expectedUpdatedAt: number; queued?: boolean };

export function SyncHubPage({ cloud, deviceId, offline, onRefresh }: {
  cloud: CloudState; deviceId: string; offline: boolean; onRefresh: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [outbox, setOutbox] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [count, list] = await Promise.all([
        window.beBossDesktop.local.outboxCount().catch(() => 0),
        window.beBossDesktop.local.pending().catch(() => [] as Pending[])
      ]);
      setOutbox(n(count));
      setPending(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the local sync queue.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function syncNow() {
    setSyncing(true); setError("");
    try {
      await onRefresh();
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed. Your queued changes remain saved on this device.");
    } finally { setSyncing(false); }
  }

  const lastSync = cloud.snapshotUpdatedAt ? dateTime(cloud.snapshotUpdatedAt) : "Not synced yet";
  const opLabel = (op: string) => {
    const clean = s(op).toUpperCase();
    if (clean === "SALE") return "New sale";
    if (clean.includes("CUSTOMER")) return "Customer update";
    if (clean.includes("PRODUCT")) return "Product update";
    if (clean.includes("PURCHASE")) return "Purchase";
    if (clean.includes("TRANSFER")) return "Stock transfer";
    return s(op) || "Snapshot update";
  };

  return <div className="page-stack">
    <PageHeading eyebrow="CLOUD CONNECTIVITY" title="Sync hub"
      description="Inspect this terminal's encrypted offline queue, signed cloud snapshot and upload status."
      action={<button className="btn-primary" disabled={syncing} onClick={syncNow}>{syncing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Sync now</button>} />

    <div className="stat-grid four">
      <StatCard label="Connection" value={offline ? "Offline cache" : outbox > 0 ? "Upload pending" : cloud.verifiedChunks > 0 ? "Verified" : "Online"} sub={offline ? "Changes remain in the local queue" : outbox > 0 ? "Local transactions are waiting to upload" : cloud.verifiedChunks > 0 ? "A signed snapshot is verified" : "Online; no verified snapshot is available yet"} icon={offline ? WifiOff : Wifi} tone={offline || outbox > 0 ? "orange" : cloud.verifiedChunks > 0 ? "green" : "blue"} />
      <StatCard label="Outbox pending" value={String(outbox)} sub={outbox ? "Transactions awaiting upload" : "No queued local transactions"} icon={CloudUpload} tone={outbox ? "orange" : "blue"} />
      <StatCard label="Verified chunks" value={String(cloud.verifiedChunks || 0)} sub="Signed snapshot integrity" icon={ShieldCheck} tone="purple" />
      <StatCard label="Last cloud sync" value={cloud.snapshotUpdatedAt ? "Synced" : "Never"} sub={lastSync} icon={CloudDownload} tone="blue" />
    </div>

    {error && <div className="global-alert error"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => void loadStatus()}>Retry</button></div>}

    <section className="panel span-2">
      <div className="panel-heading"><div><span className="eyebrow muted">OFFLINE QUEUE</span><h3>Pending transactions</h3></div><button className="btn-outline small" disabled={loading} onClick={() => void loadStatus()}><RefreshCw size={14} className={loading ? "spin" : ""} />Refresh status</button></div>
      {pending.length === 0 ? <div className="empty-state compact"><span><CheckCircle2 size={22} /></span><strong>No pending transactions</strong><p>This terminal currently has no queued local changes. Check the last verified cloud snapshot above to confirm the remote state.</p></div>
        : <div className="table-wrap"><table><thead><tr><th>Operation</th><th>Queued</th><th>Version (HLC)</th><th className="right">Action</th></tr></thead><tbody>
          {pending.map((item) => <tr key={s(item.id) || s(item.hlc)}><td className="strong">{opLabel(s(item.payload?.__op || item.payload?.operation || ""))}</td><td><span className="status-pill warn">QUEUED</span></td><td className="mono">{s(item.hlc)}</td><td className="right"><button className="btn-outline small" disabled={syncing} onClick={syncNow}><CloudUpload size={13} />Upload</button></td></tr>)}
        </tbody></table></div>}
    </section>

    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">THIS TERMINAL</span><h3>Device identity</h3></div><Database size={18} className="muted-icon" /></div>
        <div className="health-row"><span className="health-dot good" /><div><strong>Device ID</strong><small className="mono">{deviceId || "Not provisioned"}</small></div></div>
        <div className="health-row"><span className="health-dot good" /><div><strong>Platform</strong><small>{window.beBossDesktop.platform}</small></div></div>
        <div className="health-foot"><span>App version</span><strong>{window.beBossDesktop.version}</strong></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">HOW SYNC WORKS</span><h3>Offline-first safety</h3></div><HardDriveDownload size={18} className="muted-icon" /></div>
        <div className="health-row"><span className="health-dot good" /><div><strong>Encrypted local queue</strong><small>Sales and stock changes are written to an encrypted SQLite transaction queue first.</small></div></div>
        <div className="health-row"><span className="health-dot good" /><div><strong>Automatic retry</strong><small>Queued changes upload automatically when the connection returns.</small></div></div>
        <div className="health-row"><span className="health-dot good" /><div><strong>Conflict-safe merge</strong><small>Concurrent edits from phone and desktop merge with version and tombstone rules.</small></div></div>
      </section>
    </div>
  </div>;
}