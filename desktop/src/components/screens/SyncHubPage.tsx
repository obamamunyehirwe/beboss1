import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, CloudUpload, Database, HardDriveDownload, Laptop, LoaderCircle, RefreshCw, Search, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { dateTime, n, s } from "../../lib/format";
import type { CloudState, Snapshot } from "../../lib/types";
import { PageHeading, StatCard } from "../ui";

type Pending = { id: string; payload: any; hlc: number; expectedUpdatedAt: number; queued?: boolean };
type LanImportCandidate = {
  snapshot: Snapshot;
  peerIp: string;
  peerName: string;
  pulledRecords: number;
  latencyMs: number;
};

export function SyncHubPage({ cloud, deviceId, offline, snapshot, shopSyncKey, onRefresh, onPrepareLanPairing, onMergeLanSnapshot }: {
  cloud: CloudState; deviceId: string; offline: boolean; snapshot: Snapshot | null; shopSyncKey: string;
  onRefresh: () => Promise<void> | void;
  onPrepareLanPairing: () => Promise<string>;
  onMergeLanSnapshot: (snapshot: Snapshot) => Promise<void>;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [hubs, setHubs] = useState<Array<{ id: string; shopName: string; branchName: string; ipAddress: string; port: number; productsCount: number; salesCount: number; branchesCount: number; lastSeenAt: number }>>([]);
  const [discovering, setDiscovering] = useState(false);
  const [lanSyncing, setLanSyncing] = useState(false);
  const [lanImporting, setLanImporting] = useState(false);
  const [lanCandidate, setLanCandidate] = useState<LanImportCandidate | null>(null);
  const [manualIp, setManualIp] = useState("");
  const [lanNotice, setLanNotice] = useState("");
  const [outbox, setOutbox] = useState(0);
  const [unassignedOutbox, setUnassignedOutbox] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (!shopSyncKey) throw new Error("The active shop identity is unavailable; local queue records were not read.");
      const [count, list, unassigned] = await Promise.all([
        window.beBossDesktop.local.outboxCount(shopSyncKey).catch(() => 0),
        window.beBossDesktop.local.pending(shopSyncKey).catch(() => [] as Pending[]),
        window.beBossDesktop.local.unassignedOutboxCount().catch(() => 0)
      ]);
      setOutbox(n(count));
      setPending(Array.isArray(list) ? list : []);
      setUnassignedOutbox(n(unassigned));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the local sync queue.");
    } finally { setLoading(false); }
  }, [shopSyncKey]);

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

  async function discoverLanPeers() {
    setDiscovering(true); setError(""); setLanNotice("");
    try {
      const pairedShopKey = await onPrepareLanPairing();
      const peers = await window.beBossDesktop.lan.discoverHubs(pairedShopKey, 8_000);
      setHubs(peers);
      setLanNotice(peers.length
        ? `Found ${peers.length} authenticated BeBoss phone/terminal hub(s) on this network.`
        : "No authenticated hub beacon was found. Check that both devices are on the same Wi-Fi/hotspot, that the phone LAN Hub is running, or enter its local IP below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "LAN discovery failed. Your encrypted cloud snapshot remains unchanged.");
    } finally { setDiscovering(false); }
  }

  async function previewPhoneData(ipAddress: string, port = 8989, peerName = "Android phone") {
    setLanSyncing(true); setError(""); setLanNotice(""); setLanCandidate(null);
    try {
      const pairedShopKey = await onPrepareLanPairing();
      const result = await window.beBossDesktop.lan.pullFromHub(pairedShopKey, ipAddress, port);
      const remote = result.pulledSnapshot as Snapshot;
      if (!result.success || !remote || !remote.metadata || !Array.isArray(remote.products) || !Array.isArray(remote.sales)) {
        throw new Error("The phone did not return a valid, authenticated shop snapshot. Nothing was imported.");
      }
      setLanCandidate({
        snapshot: remote,
        peerIp: result.peerIp || ipAddress,
        peerName,
        pulledRecords: n(result.pulledRecords),
        latencyMs: n(result.latencyMs)
      });
      setLanNotice("Read-only phone preview is ready. No desktop records were sent and the phone was not changed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not safely preview phone data. The phone and desktop records remain unchanged.");
    } finally { setLanSyncing(false); }
  }

  async function applyPhoneDataPreview() {
    if (!lanCandidate || lanImporting) return;
    setLanImporting(true); setError("");
    try {
      await onMergeLanSnapshot(lanCandidate.snapshot);
      setLanCandidate(null);
      setLanNotice("The verified phone snapshot was merged into this desktop. The original phone data was not changed.");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The phone snapshot could not be merged. The preview is retained so you can retry.");
    } finally { setLanImporting(false); }
  }

  async function syncWithLanPeer(ipAddress: string, port = 8989) {
    setLanSyncing(true); setError(""); setLanNotice(""); setLanCandidate(null);
    try {
      if (!snapshot) throw new Error("This desktop has no local snapshot. Use the read-only phone preview and import flow first.");
      const pairedShopKey = await onPrepareLanPairing();
      const result = await window.beBossDesktop.lan.syncWithHub(pairedShopKey, ipAddress, port, snapshot as unknown as Record<string, unknown>);
      await onMergeLanSnapshot(result.pulledSnapshot as Snapshot);
      setLanNotice(result.message + " The merged records were saved to the encrypted desktop outbox/cloud sync path.");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "LAN synchronization failed. Existing local and phone data have not been deleted.");
    } finally { setLanSyncing(false); }
  }

  const phoneRecordCounts = (value: Snapshot) => [
    ["Products", value.products?.length ?? 0],
    ["Customers", value.customers?.length ?? 0],
    ["Sales", value.sales?.length ?? 0],
    ["Sale items", value.saleItems?.length ?? 0],
    ["Customer payments", value.customerPayments?.length ?? 0],
    ["Purchases", value.purchases?.length ?? 0],
    ["Stock transfers", value.stockTransfers?.length ?? 0],
    ["Branches", value.branches?.length ?? 0],
    ["Staff", value.users?.length ?? 0]
  ] as Array<[string, number]>;

  const lastSync = cloud.snapshotUpdatedAt ? dateTime(cloud.snapshotUpdatedAt) : "Not synced yet";
  const opLabel = (op: string) => {
    const clean = s(op).toUpperCase();
    if (clean === "SALE") return "New sale";
    if (clean === "LAN_IMPORT") return "Phone / LAN import";
    if (clean === "STAFF_ACCESS_UPDATE") return "Staff access update";
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

    {unassignedOutbox > 0 && <div className="global-alert error" role="alert">
      <AlertTriangle size={16} />
      <span>{unassignedOutbox.toLocaleString()} older offline transaction(s) were created before BeBoss added shop-scoped local storage. They have been quarantined and will not be uploaded to this account automatically. Contact BeBoss support or export a trusted recovery backup to identify their original shop before migration.</span>
    </div>}

    {error && <div className="global-alert error"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => void loadStatus()}>Retry</button></div>}

    <section className="panel span-2 lan-mesh-panel">
      <div className="panel-heading">
        <div><span className="eyebrow muted">LOCAL NETWORK · WI-FI · HOTSPOT</span><h3>Android phone and desktop LAN sync</h3></div>
        <div className="row-actions">
          <button className="btn-outline small" disabled={discovering || lanSyncing || !shopSyncKey} onClick={() => void discoverLanPeers()}>
            {discovering ? <LoaderCircle className="spin" size={14} /> : <Search size={14} />}
            {discovering ? "Discovering…" : "Discover phones"}
          </button>
        </div>
      </div>
      <p className="backup-desc">Desktop pairs with the shop's server-issued 256-bit LAN credential, discovers Android hubs using signed UDP beacons, then exchanges encrypted snapshots over the local network. Internet access is not required after the key has been provisioned once.</p>
      {(lanNotice || error) && <div className={"global-alert " + (error ? "error" : "success")}><span>{error || lanNotice}</span></div>}
      {hubs.length > 0 && <div className="table-wrap"><table><thead><tr><th>Phone / hub</th><th>Local IP</th><th>Products</th><th>Sales</th><th>Branches</th><th className="right">Action</th></tr></thead><tbody>
        {hubs.map((hub) => <tr key={hub.ipAddress}><td><span className="strong">{hub.shopName}</span><br/><small>{hub.branchName}</small></td><td className="mono">{hub.ipAddress}:{hub.port}</td><td>{hub.productsCount}</td><td>{hub.salesCount}</td><td>{hub.branchesCount}</td><td className="right"><div className="row-actions"><button className="btn-outline small" disabled={lanSyncing || lanImporting} onClick={() => void previewPhoneData(hub.ipAddress, hub.port, hub.shopName)}><CloudDownload size={13}/>Preview phone</button>{snapshot && <button className="btn-primary small" disabled={lanSyncing || lanImporting} onClick={() => void syncWithLanPeer(hub.ipAddress, hub.port)}><Laptop size={13}/>2-way sync</button>}</div></td></tr>)}
      </tbody></table></div>}
      {lanCandidate && <section className="lan-import-preview" aria-live="polite" aria-label="Phone data import preview">
        <div className="lan-import-preview-head">
          <span className="lan-import-preview-icon"><ShieldCheck size={18}/></span>
          <div><strong>Verified phone snapshot preview</strong><small>{lanCandidate.peerName} · {lanCandidate.peerIp} · {lanCandidate.latencyMs.toLocaleString()} ms</small></div>
          <span className="lan-import-preview-count">{lanCandidate.pulledRecords.toLocaleString()} records</span>
        </div>
        <div className="lan-import-preview-grid">
          {phoneRecordCounts(lanCandidate.snapshot).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count.toLocaleString()}</strong></div>)}
        </div>
        <p>The preview was read-only. Import merges these records with any existing desktop data using BeBoss version clocks and deletion tombstones. Nothing will be deleted from the phone.</p>
        <div className="row-actions"><button className="btn-primary small" disabled={lanImporting} onClick={() => void applyPhoneDataPreview()}>{lanImporting ? <LoaderCircle className="spin" size={14}/> : <CheckCircle2 size={14}/>}Import and merge into desktop</button><button className="btn-outline small" disabled={lanImporting} onClick={() => setLanCandidate(null)}>Cancel preview</button></div>
      </section>}
      <div className="row-actions lan-manual-row">
        <label className="lan-ip-field"><span>Enter phone local IP when discovery is blocked</span><input value={manualIp} onChange={(event) => setManualIp(event.target.value)} placeholder="192.168.43.1" inputMode="decimal" /></label>
        <button className="btn-outline small" disabled={lanSyncing || lanImporting || !manualIp.trim()} onClick={() => void previewPhoneData(manualIp.trim())}>{lanSyncing ? <LoaderCircle className="spin" size={14}/> : <CloudDownload size={14}/>}Preview phone by IP</button>
        {snapshot && <button className="btn-outline small" disabled={lanSyncing || lanImporting || !manualIp.trim()} onClick={() => void syncWithLanPeer(manualIp.trim())}><Wifi size={14}/>2-way sync</button>}
      </div>
      <div className="health-foot"><span>Security</span><strong>HMAC-authenticated · AES-256-GCM encrypted · replay protected · private IP only</strong></div>
    </section>

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