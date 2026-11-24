import type React from "react";
import { useState } from "react";
import { AlertTriangle, Archive, Check, Clipboard, Download, FileCheck2, Save, Share2, Upload } from "lucide-react";
import { errorText, rows, s } from "../../lib/format";
import { mergeSnapshots } from "../../lib/snapshot-merge";
import type { CloudState, CommitSnapshot, Snapshot } from "../../lib/types";
import { PageHeading } from "../ui";

const PORTABLE_PREFIX = "BBPORTABLE1:";
const PORTABLE_KDF_ITERATIONS = 310_000;
function base64Encode(bytes: Uint8Array): string { let binary = ""; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }
function base64Decode(value: string): Uint8Array { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function derivePortableKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> { const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase) as BufferSource, "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: PORTABLE_KDF_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
async function encryptPortableBackup(cleartext: string, passphrase: string): Promise<string> { if (passphrase.length < 12) throw new Error("Choose a backup passphrase with at least 12 characters."); const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12)); const key = await derivePortableKey(passphrase, salt); const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(cleartext) as BufferSource); return PORTABLE_PREFIX + JSON.stringify({ version: 1, kdf: "PBKDF2-SHA256", iterations: PORTABLE_KDF_ITERATIONS, salt: base64Encode(salt), iv: base64Encode(iv), ciphertext: base64Encode(new Uint8Array(ciphertext)) }); }
async function decryptPortableBackup(stored: string, passphrase: string): Promise<string> { if (!stored.startsWith(PORTABLE_PREFIX)) return stored; if (passphrase.length < 12) throw new Error("Enter the passphrase used when this backup was created."); let envelope: { version: number; kdf: string; iterations: number; salt: string; iv: string; ciphertext: string }; try { envelope = JSON.parse(stored.slice(PORTABLE_PREFIX.length)); } catch { throw new Error("The encrypted backup envelope is damaged."); } if (envelope.version !== 1 || envelope.kdf !== "PBKDF2-SHA256" || envelope.iterations !== PORTABLE_KDF_ITERATIONS) throw new Error("Unsupported backup encryption version."); const salt = base64Decode(envelope.salt), iv = base64Decode(envelope.iv), ciphertext = base64Decode(envelope.ciphertext); if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) throw new Error("The encrypted backup is incomplete."); const key = await derivePortableKey(passphrase, salt); try { const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource); return new TextDecoder().decode(clear); } catch { throw new Error("The backup passphrase is incorrect or the file has been modified."); } }
export function BackupPage({ snapshot, cloud, onCommit, onCreateBranchShare, onVerifyBranchShare }: {
  snapshot: Snapshot | null;
  cloud: CloudState;
  onCommit: CommitSnapshot;
  onCreateBranchShare: (branchIdFilter: string) => Promise<string>;
  onVerifyBranchShare: (token: string) => Promise<Snapshot>;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [shareBranchId, setShareBranchId] = useState("ALL");
  const [shareToken, setShareToken] = useState("");
  const [importToken, setImportToken] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");

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
      if (passphrase !== confirmPassphrase) throw new Error("The backup passphrases do not match.");
      const encrypted = await encryptPortableBackup(JSON.stringify(payload), passphrase);
      const result = await window.beBossDesktop.exportBackupFile(encrypted);
      setNotice("Portable AES-256-GCM backup saved to " + result.filePath + " · SHA-256 " + result.sha256.slice(0, 16) + "…");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function restoreFromText() {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!paste.trim()) throw new Error("Paste a BeBoss backup JSON first.");
      if (!snapshot) throw new Error("Initialize the shop snapshot before restoring.");
      const parsed = JSON.parse(await decryptPortableBackup(paste.trim(), passphrase));
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

  async function restoreFromFile() {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!backupFile) throw new Error("Choose a BeBoss backup file first.");
      if (backupFile.size > 70_000_000) throw new Error("Backup exceeds the 70 MB safety limit.");
      if (!/\.(bbbackup|json)$/i.test(backupFile.name)) throw new Error("Choose a .bbbackup or .json backup file.");
      if (!snapshot) throw new Error("Initialize the shop snapshot before restoring.");
      // File.text() only reads the file explicitly selected by the local user.
      // No native command accepts arbitrary filesystem paths from the renderer.
      const stored = await backupFile.text();
      const parsed = JSON.parse(await decryptPortableBackup(stored, passphrase));
      const imported = (parsed.snapshot ?? parsed) as Snapshot;
      const merged = mergeSnapshots(snapshot, imported).snapshot as Snapshot;
      await onCommit((next) => { Object.assign(next, merged); }, "RESTORE");
      setNotice("Backup file merged into the shop snapshot and queued for cloud synchronization.");
      setBackupFile(null);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function createBranchShare() {
    setShareBusy(true); setShareError(""); setShareMessage("");
    try {
      if (!snapshot) throw new Error("Sync the shop snapshot before creating a branch share package.");
      const token = await onCreateBranchShare(shareBranchId);
      if (!token.startsWith("BBSHARE1:")) throw new Error("The server returned an invalid branch share token.");
      setShareToken(token);
      setShareMessage("A signed BBSHARE1 package was created. It expires automatically and can be imported by BeBoss mobile or desktop.");
    } catch (e) { setShareError(errorText(e)); }
    finally { setShareBusy(false); }
  }

  async function copyBranchShare() {
    if (!shareToken) return;
    try {
      await navigator.clipboard.writeText(shareToken);
      setShareMessage("Branch share token copied. Send it only to the intended BeBoss shop terminal.");
    } catch { setShareError("Clipboard access is unavailable. Select the token and copy it manually."); }
  }

  function downloadBranchShare() {
    if (!shareToken) return;
    const url = URL.createObjectURL(new Blob([shareToken], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "BeBoss-Branch-Share.beboss";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBranchShare() {
    setShareBusy(true); setShareError(""); setShareMessage("");
    try {
      if (!snapshot) throw new Error("Initialize the shop snapshot before importing a branch package.");
      const token = importToken.trim();
      if (!token.startsWith("BBSHARE1:")) throw new Error("Paste a valid BBSHARE1 branch share token.");
      if (token.length > 7_000_000) throw new Error("The branch share package exceeds the 7 MB safety limit.");
      const verified = await onVerifyBranchShare(token);
      const merged = mergeSnapshots(snapshot, verified).snapshot as Snapshot;
      await onCommit((next) => { Object.assign(next, merged); }, "DATASHARE_IMPORT");
      setShareMessage("Signed branch package verified and merged. Changes are queued for cloud synchronization.");
      setImportToken("");
      setShareToken("");
    } catch (e) { setShareError(errorText(e)); }
    finally { setShareBusy(false); }
  }

  return <div className="page-stack">
    <PageHeading eyebrow="DATA PORTABILITY" title="Backup & recovery" description="Create portable encrypted backups, restore them on another computer, and safely merge records with the live BeBoss snapshot." />

    {error && <div className="global-alert error"><AlertTriangle size={16} /><span>{error}</span></div>}
    {notice && <div className="global-alert success"><Check size={16} /><span>{notice}</span></div>}

    <div className="backup-grid">
      <section className="panel backup-card">
        <div className="panel-heading"><div><span className="eyebrow muted">EXPORT</span><h3>Encrypted snapshot backup</h3></div><Archive size={18} className="muted-icon" /></div>
        <p className="backup-desc">Writes a signed, checksummed BBSHARE1 snapshot of the current shop data to the app's secure backups folder. The file captures products, sales, customers, branches and the profile.</p>
        <label className="backup-field">Backup passphrase (minimum 12 characters)<input type="password" autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Create a strong backup passphrase" /></label>
        <label className="backup-field">Confirm backup passphrase<input type="password" autoComplete="new-password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} placeholder="Confirm the passphrase" /></label>
        <p className="backup-desc">The passphrase is used locally and is never uploaded to Supabase. You must remember it to restore this file on another device.</p>
        <div className="backup-counts">
          <div><span>Products</span><strong>{rows(snapshot?.products).length}</strong></div>
          <div><span>Sales</span><strong>{rows(snapshot?.sales).length}</strong></div>
          <div><span>Customers</span><strong>{rows(snapshot?.customers).length}</strong></div>
        </div>
        <button className="btn-primary" onClick={exportSnapshot} disabled={busy || !snapshot || passphrase.length < 12 || passphrase !== confirmPassphrase}><Download size={16} /> Export encrypted backup</button>
      </section>

      <section className="panel backup-card">
        <div className="panel-heading"><div><span className="eyebrow muted">RESTORE</span><h3>Merge a BeBoss backup</h3></div><Upload size={18} className="muted-icon" /></div>
        <p className="backup-desc">Restore decrypts a portable backup and merges it using BeBoss version and tombstone rules, then queues accepted changes for Supabase synchronization.</p>
        <label className="backup-field">Choose a backup file<input type="file" accept=".bbbackup,.json,application/json" onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)} /><small>{backupFile ? `Selected: ${backupFile.name}` : "Select a .bbbackup or legacy .json file from this computer."}</small></label>
        <label className="backup-field">Or paste backup JSON<textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste an encrypted backup or legacy JSON…" rows={4} /></label>
        <div className="backup-actions"><button className="btn-outline" onClick={restoreFromFile} disabled={busy || !backupFile || !snapshot}><Save size={15} /> Restore selected file</button><button className="btn-primary" onClick={restoreFromText} disabled={busy || !paste.trim() || !snapshot}><Upload size={15} /> Merge pasted backup</button></div>
      </section>


    </div>
    <section className="panel backup-card">
      <div className="panel-heading"><div><span className="eyebrow muted">BRANCH DATASHARE</span><h3>Signed branch exchange</h3></div><Share2 size={18} className="muted-icon" /></div>
      <p className="backup-desc">Create an Android-compatible BBSHARE1 package signed by the BeBoss server key, then import it on another terminal. Package integrity, shop identity and expiry are checked before any records are merged.</p>
      <label className="backup-field">Export scope<select value={shareBranchId} onChange={(event) => setShareBranchId(event.target.value)}><option value="ALL">All branches</option>{rows(snapshot?.branches).map((branch) => <option key={s(branch.id)} value={s(branch.id)}>{s(branch.name) || s(branch.id)}</option>)}</select></label>
      <div className="backup-actions"><button className="btn-primary" onClick={() => void createBranchShare()} disabled={shareBusy || !snapshot}><Share2 size={15} /> {shareBusy ? "Preparing package…" : "Create signed branch package"}</button>{shareToken && <><button className="btn-outline" onClick={() => void copyBranchShare()}><Clipboard size={15} /> Copy token</button><button className="btn-outline" onClick={downloadBranchShare}><Download size={15} /> Download .beboss</button></>}</div>
      {shareToken && <label className="backup-field">Generated BBSHARE1 token<textarea readOnly value={shareToken} rows={4} /></label>}
      <label className="backup-field">Import BBSHARE1 token<textarea value={importToken} onChange={(event) => setImportToken(event.target.value)} placeholder="Paste a branch share token received from another BeBoss terminal…" rows={4} /></label>
      <div className="backup-actions"><button className="btn-primary" onClick={() => void importBranchShare()} disabled={shareBusy || !snapshot || !importToken.trim()}><FileCheck2 size={15} /> Verify and merge package</button></div>
      {shareError && <div className="inline-alert error"><AlertTriangle size={15} />{shareError}</div>}
      {shareMessage && <div className="inline-alert info"><Check size={15} />{shareMessage}</div>}
    </section>
    <p className="panel-hint">Portable backups use AES-256-GCM with a PBKDF2-SHA-256 passphrase-derived key, unique random salt and nonce. The passphrase never leaves this device.</p>
  </div>;
}