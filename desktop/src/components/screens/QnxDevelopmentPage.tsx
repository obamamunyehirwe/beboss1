import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, AlertTriangle, CheckCircle2, Cpu, FileCode2, HardDrive, LoaderCircle, Play, RefreshCw, Square, Terminal, Wrench } from "lucide-react";
import { PageHeading, StatCard } from "../ui";

type QnxStatus = {
  hostOs: string;
  hostArch: string;
  hostSupported: boolean;
  qnxBase: string | null;
  qnxHost: string | null;
  qnxTarget: string | null;
  qccPath: string | null;
  qppPath: string | null;
  mkifsPath: string | null;
  mkqnximagePath: string | null;
  qnxTargetTreePresent: boolean;
  qccFound: boolean;
  sdp8Ready: boolean;
  qccVariants: string[];
  qemuImageDir: string | null;
  qemuPackageDirectoryPresent: boolean;
  notes: string[];
};

type QnxResult = {
  success: boolean;
  message: string;
  command: string;
  outputPath: string | null;
  sha256: string | null;
  processId: number | null;
  stdout: string;
  stderr: string;
};

function DetailRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return <div className="diag-row">
    <span>{label}</span>
    <strong className={ok === undefined ? "mono diag-path" : ok ? "qnx-ok" : "qnx-warn"}>{value}</strong>
  </div>;
}

export function QnxDevelopmentPage() {
  const [installRoot, setInstallRoot] = useState("");
  const [targetArch, setTargetArch] = useState("x86_64");
  const [ifsBuildFile, setIfsBuildFile] = useState("");
  const [ifsOutputFile, setIfsOutputFile] = useState("");
  const [status, setStatus] = useState<QnxStatus | null>(null);
  const [result, setResult] = useState<QnxResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setBusy("probe");
    setError("");
    try {
      const next = await invoke<QnxStatus>("qnx_probe", {
        installRoot: installRoot.trim() || null
      });
      setStatus(next);
      setLastChecked(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }, [installRoot]);

  useEffect(() => {
    let active = true;
    invoke<QnxStatus>("qnx_probe", { installRoot: null })
      .then((next) => {
        if (active) {
          setStatus(next);
          setLastChecked(Date.now());
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { active = false; };
  }, []);

  async function runOperation(name: string, operation: () => Promise<QnxResult>) {
    setBusy(name);
    setError("");
    setResult(null);
    try {
      const next = await operation();
      setResult(next);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  const sdkReady = Boolean(status?.sdp8Ready);
  const selectedVariant = targetArch === "x86_64" ? "gcc_ntox86_64" : "gcc_ntoaarch64le";
  const selectedTargetVerified = Boolean(status?.qccVariants.includes(selectedVariant));
  const canBuildImage = sdkReady && selectedTargetVerified
    && Boolean(status?.mkqnximagePath) && Boolean(status?.qemuPackageDirectoryPresent);

  return <div className="page-stack">
    <PageHeading eyebrow="DEVELOPER TOOLING · QNX SDP 8.0" title="QNX Development Center"
      description="A host-side QNX workbench for SDK detection, Neutrino cross-compilation, IFS image creation and QEMU target management. This does not claim the BeBoss retail desktop itself runs on QNX."
      action={<button className="btn-primary" onClick={() => void refresh()} disabled={Boolean(busy)}><RefreshCw size={15} className={busy === "probe" ? "spin" : ""} /> Refresh status</button>} />

    <section className="panel settings-form">
      <div className="panel-heading"><div><span className="eyebrow muted">SDK CONFIGURATION</span><h3>QNX SDP installation</h3></div><Wrench size={18} className="muted-icon" /></div>
      <p className="settings-section-description">Select the QNX SDP 8.0 base directory or leave it empty to use QNX_BASE, QNX_HOST and QNX_TARGET from the desktop process environment.</p>
      <div className="form-grid">
        <label className="field-wide">QNX installation root
          <input value={installRoot} maxLength={1000} onChange={(event) => setInstallRoot(event.target.value)} placeholder="Example: C:\qnx800 or /home/user/qnx800" />
        </label>
      </div>
      <div className="form-footer">
        <span className="muted small-text">{lastChecked ? "Last checked " + new Date(lastChecked).toLocaleString() : "SDK not yet checked"}</span>
        <button className="btn-outline" onClick={() => void refresh()} disabled={Boolean(busy)}><Activity size={15} /> Detect toolchain</button>
      </div>
    </section>

    <div className="stat-grid four">
      <StatCard label="QNX SDP 8.0" value={sdkReady ? "Ready" : status ? "Not ready" : "Checking"} sub={status?.hostSupported ? status.hostOs + " · " + status.hostArch : "Supported x86-64 Windows/Linux host required"} icon={Cpu} tone={sdkReady ? "green" : "orange"} />
      <StatCard label="qcc compiler" value={status?.qccVariants.length ? "Compile-tested" : status?.qccFound ? "Detected only" : "Missing"} sub={status?.qccVariants.length ? "Verified: " + status.qccVariants.join(", ") : status?.qccPath || "Install QNX SDP 8.0"} icon={Terminal} tone={status?.qccVariants.length ? "green" : status?.qccFound ? "orange" : "red"} />
      <StatCard label="mkifs" value={status?.mkifsPath ? "Detected" : "Missing"} sub="QNX OS image filesystem builder" icon={FileCode2} tone={status?.mkifsPath ? "green" : "orange"} />
      <StatCard label="QEMU package directory" value={status?.qemuPackageDirectoryPresent ? "Files detected" : "Missing or empty"} sub={status?.qemuImageDir || "Install the QNX QEMU reference package"} icon={HardDrive} tone={status?.qemuPackageDirectoryPresent ? "orange" : "orange"} />
    </div>

    {error && <div className="global-alert error"><AlertTriangle size={16} /><span>{error}</span></div>}
    {result && <div className="global-alert success"><CheckCircle2 size={16} /><span>{result.message}{result.processId ? " Process ID: " + result.processId : ""}</span></div>}

    <div className="diag-grid">
      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">TOOLCHAIN PROBE</span><h3>Detected QNX tools</h3></div><Cpu size={18} className="muted-icon" /></div>
        <DetailRow label="QNX_BASE" value={status?.qnxBase || "Not detected"} />
        <DetailRow label="QNX_HOST" value={status?.qnxHost || "Not detected"} />
        <DetailRow label="QNX_TARGET" value={status?.qnxTarget || "Not detected"} />
        <DetailRow label="qcc" value={status?.qccPath || "Not found"} ok={Boolean(status?.qccFound)} />
        <DetailRow label="q++" value={status?.qppPath || "Not found"} ok={Boolean(status?.qppPath)} />
        <DetailRow label="mkifs" value={status?.mkifsPath || "Not found"} ok={Boolean(status?.mkifsPath)} />
        <DetailRow label="mkqnximage" value={status?.mkqnximagePath || "Not found"} ok={Boolean(status?.mkqnximagePath)} />
        <DetailRow label="target/qnx8 headers" value={status?.qnxTargetTreePresent ? "Found" : "Missing"} ok={Boolean(status?.qnxTargetTreePresent)} />
        <DetailRow label="Compiler variants" value={status?.qccVariants.join(", ") || "Not verified"} />
      </section>

      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">NEUTRINO SAMPLE</span><h3>Build BeBoss edge agent</h3></div><Terminal size={18} className="muted-icon" /></div>
        <p className="settings-section-description">Compile a native QNX service that registers beboss-edge-gateway and processes health/echo messages with name_attach, MsgReceive and MsgReply.</p>
        <label className="field-wide">Target architecture
          <select value={targetArch} onChange={(event) => setTargetArch(event.target.value)}>
            <option value="x86_64" disabled={!status?.qccVariants.includes("gcc_ntox86_64")}>QNX x86-64{status?.qccVariants.includes("gcc_ntox86_64") ? "" : " · compiler not verified"}</option>
            <option value="aarch64le" disabled={!status?.qccVariants.includes("gcc_ntoaarch64le")}>QNX AArch64 little-endian{status?.qccVariants.includes("gcc_ntoaarch64le") ? "" : " · compiler not verified"}</option>
          </select>
        </label>
        <div className="form-footer">
          <span className="muted small-text">qcc · compiler output · SHA-256</span>
          <button className="btn-primary" disabled={!sdkReady || !selectedTargetVerified || Boolean(busy)} onClick={() => void runOperation("agent", () => invoke<QnxResult>("qnx_build_agent", { installRoot: installRoot.trim() || null, targetArch }))}>
            {busy === "agent" ? <LoaderCircle size={15} className="spin" /> : <Wrench size={15} />} Build edge agent
          </button>
          <button className="btn-outline" disabled={!sdkReady || !selectedTargetVerified || Boolean(busy)} onClick={() => void runOperation("client", () => invoke<QnxResult>("qnx_build_ipc_client", { installRoot: installRoot.trim() || null, targetArch }))}>
            {busy === "client" ? <LoaderCircle size={15} className="spin" /> : <Terminal size={15} />} Build IPC client
          </button>
        </div>
      </section>

      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">IMAGE BUILD</span><h3>Create custom IFS</h3></div><FileCode2 size={18} className="muted-icon" /></div>
        <p className="settings-section-description">Use a board- or QEMU-specific QNX buildfile. The workbench never overwrites an existing output file.</p>
        <label>QNX mkifs buildfile<input value={ifsBuildFile} onChange={(event) => setIfsBuildFile(event.target.value)} placeholder="Path to a .build file" /></label>
        <label>New output image path<input value={ifsOutputFile} onChange={(event) => setIfsOutputFile(event.target.value)} placeholder="Path for a new IFS image" /></label>
        <div className="form-footer">
          <span className="muted small-text">mkifs -v · output verified · SHA-256</span>
          <button className="btn-primary" disabled={!sdkReady || !status?.mkifsPath || !ifsBuildFile.trim() || !ifsOutputFile.trim() || Boolean(busy)} onClick={() => void runOperation("ifs", () => invoke<QnxResult>("qnx_build_ifs", { installRoot: installRoot.trim() || null, buildFile: ifsBuildFile.trim(), outputFile: ifsOutputFile.trim() }))}>
            {busy === "ifs" ? <LoaderCircle size={15} className="spin" /> : <FileCode2 size={15} />} Build IFS
          </button>
        </div>
      </section>

      <section className="panel diag-card">
        <div className="panel-heading"><div><span className="eyebrow muted">VIRTUAL TARGET</span><h3>QEMU lifecycle</h3></div><Activity size={18} className="muted-icon" /></div>
        <p className="settings-section-description">mkqnximage prepares and launches the QNX QEMU reference target. A non-empty package directory is only a preliminary check; the build command must still validate its contents, and the guest boot must be confirmed in QEMU or its serial console.</p>
        <div className="form-footer">
          <span className="muted small-text">{status?.qemuPackageDirectoryPresent ? "Files found in QEMU package directory" : "QEMU reference package missing or directory empty"}</span>
          <button className="btn-outline" disabled={!sdkReady || !status?.mkqnximagePath || Boolean(busy)} onClick={() => void runOperation("qemu-build", () => invoke<QnxResult>("qnx_build_qemu_image", { installRoot: installRoot.trim() || null, architecture: targetArch }))}>
            {busy === "qemu-build" ? <LoaderCircle size={15} className="spin" /> : <Wrench size={15} />} Prepare image
          </button>
        </div>
        <div className="form-footer">
          <span className="muted small-text">QNX VM target</span>
          <div className="heading-actions">
            <button className="btn-primary" disabled={!canBuildImage || Boolean(busy)} onClick={() => void runOperation("qemu-run", () => invoke<QnxResult>("qnx_run_qemu", { installRoot: installRoot.trim() || null }))}><Play size={15} /> Launch QEMU</button>
            <button className="btn-outline" disabled={!canBuildImage || Boolean(busy)} onClick={() => void runOperation("qemu-stop", () => invoke<QnxResult>("qnx_stop_qemu", { installRoot: installRoot.trim() || null }))}><Square size={15} /> Stop QEMU</button>
          </div>
        </div>
      </section>
    </div>

    {status?.notes?.length ? <section className="panel settings-form">
      <div className="panel-heading"><div><span className="eyebrow muted">REQUIREMENTS & BLOCKERS</span><h3>Toolchain readiness checks</h3></div><AlertTriangle size={18} className="muted-icon" /></div>
      <ul className="qnx-notes">{status.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </section> : null}

    {result ? <section className="panel settings-form">
      <div className="panel-heading"><div><span className="eyebrow muted">BUILD EVIDENCE</span><h3>Latest operation output</h3></div><Terminal size={18} className="muted-icon" /></div>
      <DetailRow label="Command" value={result.command} />
      {result.outputPath && <DetailRow label="Output" value={result.outputPath} />}
      {result.sha256 && <DetailRow label="SHA-256" value={result.sha256} />}
      {result.stdout && <pre className="qnx-output">{result.stdout}</pre>}
      {result.stderr && <pre className="qnx-output">{result.stderr}</pre>}
    </section> : null}
  </div>;
}
