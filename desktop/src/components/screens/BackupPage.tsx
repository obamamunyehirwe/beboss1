import type React from "react";
import { useState } from "react";
import { AlertTriangle, Archive, Check, Download, KeyRound, Save, ShieldCheck, Upload } from "lucide-react";
import { dateTime, errorText, n, rows, s } from "../../lib/format";
import { mergeSnapshots } from "../../lib/snapshot-merge";
import type { CloudState, CommitSnapshot, Snapshot } from "../../lib/types";
import { PageHeading, StatusPill } from "../ui";

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function BackupPage({ snapshot, cloud, onCommit, offline }: {
  snapshot: Snapshot | null; cloud: CloudState; onCommit: CommitSnapshot; offline: boolean
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [filePath, setFilePath] = useState("");
  const [code, setCode] = useState("");
  const [codeResult, setCodeResult] = useState<{ valid: boolean; daysGranted: number; tier: string; message: string; newExpiryTimestamp: number } | null>(null);

  async function exportSnapshot() {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!snapshot) throw new Error("Sync the shop snapshot before exporting a backup.");
      const payload = {
        format: "BBSHARE1-BACKUP", app: "BeBoss Desktop", version: window.beBossDesktop.version,
        exportedAt: Date.now(), shop: s(cloud.shop?.shop_name), owner: s(cloud.shop?.owner_username),
        tableCounts: {
          products: rows(snapshot.products).length, sales: rows(snapshot.sales).length,
          customers: rows(snapshot.customers).length, branches: rows(snapshot.branches).length
        },
        snapshot
      };
      const json = JSON.stringify(payload);
      const sha = await sha256Hex(json);
      const result = await window.beBossDesktop.exportBackupFile(json);
      setNotice("Encrypted backup written to " + result.filePath + " · SHA-256 " + sha.slice(0, 16) + "…");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function restoreFromText() {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!paste.trim()) throw new Error("Paste a BeBoss backup JSON first.");
      if (!snapshot) throw new Error("Initialize the shop snapshot before restoring.");
      const parsed = JSON.parse(paste);
      const imported = (parsed.snapshot ?? parsed) as Snapshot;
      if (!imported || typeof imported !== "object" || (!Array.isArray(imported.products) && !imported.shopProfile)) {
        throw new Error("This JSON is not a valid BeBoss snapshot backup.");
      }
      const merged = mergeSnapshots(snapshot, imported).snapshot as Snapshot;
      await onCommit((next) => { Object.assign(next, merged); }, "RESTORE");
      setNotice("Backup merged into the shop snapshot and queued for secure cloud synchronization.");
      setPaste("");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function restoreFromPath() {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!filePath.trim()) throw new Error("Enter the backup file path first.");
      if (!snapshot) throw new Error("Initialize the shop snapshot before restoring.");
      const parsed = await window.beBossDesktop.importBackupFile(filePath.trim());
      const imported = (parsed.snapshot ?? parsed) as Snapshot;
      const merged = mergeSnapshots(snapshot, imported).snapshot as Snapshot;
      await onCommit((next) => { Object.assign(next, merged); }, "RESTORE");
      setNotice("Backup file merged into the shop snapshot and queued for cloud synchronization.");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function checkCode() {
    setBusy(true); setError(""); setCodeResult(null);
    try { setCodeResult(await window.beBossDesktop.verifyEmergencyCode(code)); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function applyGrace() {
    if (!codeResult?.valid) return;
    setBusy(true); setError("");
    try {
      const expiry = codeResult.newExpiryTimestamp;
      await onCommit((next) => {
        const now = Date.now();
        next.shopProfile = { ...next.shopProfile, subscriptionExpiresAt: Math.max(n(next.shopProfile.subscriptionExpiresAt), expiry), subscriptionStatus: "ACTIVE", updatedAt: now, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP" };
      }, "GRACE");
      setNotice("Offline grace period applied: access extended to " + dateTime(expiry) + ". It will reconcile with the cloud on reconnect.");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <PageHeading eyebrow="DATA PORTABILITY" title="Backup & recovery" description="Export an encrypted snapshot, restore a BeBoss backup, and recover access with an offline grace-period code." />

    {error && <div className="global-alert error"><AlertTriangle size={16} /><span>{error}</span></div>}
    {notice && <div className="global-alert success"><Check size={16} /><span>{notice}</span></div>}

    <div className="backup-grid">
      <section className="panel backup-card">
        <div className="panel-heading"><div><span className="eyebrow muted">EXPORT</span><h3>Encrypted snapshot backup</h3></div><Archive size={18} className="muted-icon" /></div>
        <p className="backup-desc">Writes a signed, checksummed BBSHARE1 snapshot of the current shop data to the app's secure backups folder. The file captures products, sales, customers, branches and the profile.</p>
        <div className="backup-counts">
          <div><span>Products</span><strong>{rows(snapshot?.products).length}</strong></div>
          <div><span>Sales</span><strong>{rows(snapshot?.sales).length}</strong></div>
          <div><span>Customers</span><strong>{rows(snapshot?.customers).length}</strong></div>
        </div>
        <button className="btn-primary" onClick={exportSnapshot} disabled={busy || !snapshot}><Download size={16} /> Export backup now</button>
      </section>

      <section className="panel backup-card">
        <div className="panel-heading"><div><span className="eyebrow muted">RESTORE</span><h3>Merge a BeBoss backup</h3></div><Upload size={18} className="muted-icon" /></div>
        <p className="backup-desc">Restore merges a backup into the current snapshot using BeBoss version and tombstone rules, then queues it for secure cloud sync. It never silently drops newer records.</p>
        <label className="backup-field">Backup file path<textarea value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/path/to/beboss-backup.json" rows={2} /></label>
        <label className="backup-field">Or paste backup JSON<textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the contents of a BeBoss backup file…" rows={4} /></label>
        <div className="backup-actions"><button className="btn-outline" onClick={restoreFromPath} disabled={busy || !filePath.trim() || !snapshot}><Save size={15} /> Restore from file</button><button className="btn-primary" onClick={restoreFromText} disabled={busy || !paste.trim() || !snapshot}><Upload size={15} /> Merge pasted backup</button></div>
      </section>

      <section className="panel backup-card span-2">
        <div className="panel-heading"><div><span className="eyebrow muted">RECOVERY</span><h3>Offline grace-period recovery code</h3></div><KeyRound size={18} className="muted-icon" /></div>
        <p className="backup-desc">If the subscription expired and the cloud is unreachable, an administrator-issued emergency code grants a bounded offline grace period. Applying it extends local access; the cloud remains the source of truth and reconciles on reconnect.</p>
        <div className="recovery-row">
          <label className="backup-field grow">Emergency code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BB-…" /></label>
          <button className="btn-outline" onClick={checkCode} disabled={busy || !code.trim()}><ShieldCheck size={15} /> Verify code</button>
        </div>
        {codeResult && <div className={"recovery-result " + (codeResult.valid ? "ok" : "bad")}>
          <div><span>Result</span><StatusPill value={codeResult.valid ? "VALID" : "INVALID"} /></div>
          {codeResult.valid && <><div><span>Grace granted</span><strong>{codeResult.daysGranted} days</strong></div><div><span>Tier</span><strong>{s(codeResult.tier) || "Provisional"}</strong></div><div><span>New expiry</span><strong>{dateTime(codeResult.newExpiryTimestamp)}</strong></div>
            <button className="btn-primary" onClick={applyGrace} disabled={busy || !offline}><KeyRound size={15} /> Apply offline grace period</button>
            {offline ? <small className="muted">Available because this desktop is currently offline.</small> : <small className="muted">Grace application is available while offline; online access uses the verified cloud subscription.</small>}
          </>}
          <p className="muted small-text">{codeResult.message}</p>
        </div>}
      </section>
    </div>
    <p className="panel-hint">Backups and the local outbox are stored inside this desktop user's encrypted application-data directory. Cloud authorization is always enforced server-side.</p>
  </div>;
}