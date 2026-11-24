import { useState } from "react";
import {
  Activity, Check, ChevronRight, Cloud, Database, LockKeyhole, RefreshCw,
  ShieldCheck, Smartphone, Wifi, X, Zap
} from "lucide-react";

type CheckStatus = "pending" | "running" | "complete" | "warning" | "failed";
type StepId = "system" | "device" | "database" | "security" | "cloud";
interface SetupStep {
  id: StepId;
  title: string;
  description: string;
  status: CheckStatus;
  details: string;
}

const INITIAL_STEPS: SetupStep[] = [
  { id: "system", title: "System compatibility", description: "Operating system and desktop runtime", status: "pending", details: "Not checked yet" },
  { id: "device", title: "Device identity", description: "Local terminal identity", status: "pending", details: "Not initialized" },
  { id: "database", title: "Encrypted database", description: "SQLCipher database and local queue", status: "pending", details: "Not verified" },
  { id: "security", title: "Secure credential vault", description: "Operating-system keyring read/write test", status: "pending", details: "Not verified" },
  { id: "cloud", title: "Cloud reachability", description: "Configured Supabase endpoint", status: "pending", details: "Not tested" }
];

interface SetupWizardProps { onComplete: () => void; }
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<SetupStep[]>(INITIAL_STEPS);
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [failure, setFailure] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);

  const log = (message: string) => {
    setLogs((previous) => [...previous.slice(-11), `${new Date().toLocaleTimeString()}  ${message}`]);
  };
  const updateStep = (id: StepId, status: CheckStatus, details: string) => {
    setSteps((previous) => previous.map((step) => step.id === id ? { ...step, status, details } : step));
  };

  const runSetup = async () => {
    if (running) return;
    setStarted(true);
    setRunning(true);
    setFailure("");
    setCompleted(false);
    setSteps(INITIAL_STEPS);
    setLogs([]);
    let active: StepId = "system";
    try {
      setActiveStep(active);
      updateStep(active, "running", "Reading native desktop runtime diagnostics…");
      log("Collecting native system diagnostics.");
      const diagnostics = await window.beBossDesktop.systemDiagnostics();
      if (!diagnostics.osPlatform || !diagnostics.osArch || !diagnostics.dbPath) {
        throw new Error("The native runtime did not return complete operating-system diagnostics.");
      }
      updateStep(active, "complete", `${diagnostics.osPlatform} · ${diagnostics.osArch} · BeBoss ${diagnostics.appVersion}`);
      log(`Runtime identified: ${diagnostics.osPlatform} / ${diagnostics.osArch}.`);

      active = "device";
      setActiveStep(active);
      updateStep(active, "running", "Provisioning a persistent local device identity…");
      const deviceId = await window.beBossDesktop.getDeviceId();
      if (!deviceId || deviceId.length < 16) throw new Error("The desktop host returned an invalid device identity.");
      updateStep(active, "complete", `Local identity ready · ${deviceId.slice(0, 8)}…${deviceId.slice(-6)}`);
      log("Persistent local device identity verified. Cloud pairing happens after owner sign-in.");

      active = "database";
      setActiveStep(active);
      updateStep(active, "running", "Opening SQLCipher and inspecting local data…");
      const database = await window.beBossDesktop.systemDiagnostics();
      const pending = await window.beBossDesktop.local.outboxCount();
      if (!database.databaseEncrypted || !database.databaseCipherVersion) {
        throw new Error("SQLCipher could not confirm that the local database is encrypted.");
      }
      const localSnapshot = await window.beBossDesktop.local.load();
      updateStep(
        active,
        "complete",
        `SQLCipher ${database.databaseCipherVersion} · ${localSnapshot ? "existing shop data found" : "new workspace"} · ${pending} pending sync item(s)`
      );
      log(`Encrypted database verified. Pending outbox records: ${pending}.`);

      active = "security";
      setActiveStep(active);
      updateStep(active, "running", "Testing native credential storage with a temporary secret…");
      const probeKey = `setup-probe-${crypto.randomUUID()}`;
      const probeValue = crypto.randomUUID();
      try {
        await window.beBossDesktop.secureStore.set(probeKey, probeValue);
        const storedValue = await window.beBossDesktop.secureStore.get(probeKey);
        if (storedValue !== probeValue) throw new Error("The credential vault did not return the value it stored.");
        log("Credential vault write/read integrity test passed.");
      } finally {
        await window.beBossDesktop.secureStore.remove(probeKey).catch(() => false);
      }
      updateStep(active, "complete", "Credential vault write/read test passed; temporary secret removed.");

      active = "cloud";
      setActiveStep(active);
      updateStep(active, "running", "Testing the configured Supabase network endpoint…");
      const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
      if (!supabaseUrl) {
        updateStep(active, "warning", "Supabase URL is not configured in this installation.");
        log("Cloud endpoint is not configured. Online sign-in and sync require desktop environment configuration.");
      } else {
        try {
          const endpoint = new URL(supabaseUrl);
          const ping = await window.beBossDesktop.networkPing(`${endpoint.hostname}:443`);
          if (ping.reachable) {
            updateStep(active, "complete", `Supabase host reachable · ${ping.latencyMs} ms TCP response (authentication not yet tested)`);
            log(`Supabase endpoint host is reachable: ${endpoint.hostname}.`);
          } else {
            updateStep(active, "warning", `Cloud is unreachable right now. Offline setup is ready. ${ping.details}`);
            log("Cloud endpoint is unreachable. Cloud sign-in and synchronization need an internet connection.");
          }
        } catch (error) {
          updateStep(active, "warning", `Supabase endpoint could not be checked: ${errorMessage(error)}`);
          log("Cloud configuration could not be validated; owner sign-in will report the actual connection state.");
        }
      }

      // Save the version first; the completion timestamp is the final commit marker
      // App.tsx checks before allowing the owner sign-in screen to open.
      await window.beBossDesktop.secureStore.set("installation-setup-version", window.beBossDesktop.version);
      await window.beBossDesktop.secureStore.set("installation-setup-completed-at", new Date().toISOString());
      setCompleted(true);
      setActiveStep(null);
      log("Required local setup checks passed. BeBoss is ready for owner sign-in.");
    } catch (error) {
      const message = errorMessage(error);
      setFailure(message);
      updateStep(active, "failed", message);
      log(`Setup stopped: ${message}`);
    } finally {
      setRunning(false);
    }
  };

  const statusIcon = (status: CheckStatus) => {
    if (status === "running") return <RefreshCw size={15} className="spin" />;
    if (status === "complete") return <Check size={15} />;
    if (status === "warning") return <Wifi size={15} />;
    if (status === "failed") return <X size={15} />;
    return <span className="setup-status-pending" />;
  };

  return (
    <div className="setup-wizard">
      <aside className="setup-rail">
        <div className="setup-brand">
          <img src="/beboss-app-icon.png" alt="BeBoss" />
          <div><strong>BeBoss Desktop</strong><small>RETAIL OPERATIONS PLATFORM</small></div>
        </div>
        <div className="setup-progress" aria-label="Installation checks">
          {steps.map((step, index) => (
            <div key={step.id} className={`setup-step ${step.status === "complete" ? "complete" : activeStep === step.id ? "active" : ""}`}>
              <span>{statusIcon(step.status)}</span>
              <div><small>CHECK 0{index + 1}</small><strong>{step.title}</strong></div>
            </div>
          ))}
        </div>
        <div className="setup-security">
          <LockKeyhole size={17} />
          <div><strong>Local-first security</strong><small>Business data is held in an encrypted SQLCipher database. Credentials remain in the operating-system vault.</small></div>
        </div>
      </aside>

      <main className="setup-main">
        <section className="setup-content">
          <div className="setup-icon">{completed ? <Check size={25} /> : started ? <Activity size={25} /> : <Zap size={25} />}</div>
          {!started ? (
            <>
              <small className="eyebrow muted">FIRST-RUN INSTALLATION</small>
              <h1>Set up your workspace.</h1>
              <p>BeBoss verifies the real desktop runtime, creates a persistent terminal identity, opens the encrypted local database, and tests credential storage before showing the sign-in screen.</p>
              <div className="setup-feature-grid">
                <article><Database size={21} /><div><strong>Encrypted local data</strong><span>SQLCipher database and durable sync queue</span></div></article>
                <article><Smartphone size={21} /><div><strong>Device identity</strong><span>Persistent identity for owner-authorized pairing</span></div></article>
                <article><ShieldCheck size={21} /><div><strong>Credential protection</strong><span>Operating-system keyring read/write validation</span></div></article>
                <article><Cloud size={21} /><div><strong>Cloud readiness</strong><span>Checks the configured Supabase endpoint</span></div></article>
              </div>
              <div className="setup-actions">
                <button className="primary-btn" onClick={() => void runSetup()} disabled={running}>
                  <Zap size={16} /> Start installation checks <ChevronRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <>
              <small className="eyebrow muted">INSTALLATION VALIDATION</small>
              <h1>{completed ? "Workspace ready." : failure ? "Setup needs attention." : "Verifying your desktop."}</h1>
              <p>{completed
                ? "All required local checks passed. Cloud access will be authenticated after the shop owner signs in."
                : "These checks call the native desktop bridge and configured cloud endpoint. No simulated success states are used."}</p>
              <div className="setup-checks" aria-live="polite">
                {steps.map((step) => (
                  <div className="setup-check" key={step.id}>
                    <span className={step.status === "failed" ? "setup-check-failed" : step.status === "warning" ? "setup-check-warning" : step.status === "complete" ? "setup-check-ready" : ""}>
                      {statusIcon(step.status)}
                    </span>
                    <div><strong>{step.title}</strong><small>{step.details}</small></div>
                    <b className={step.status === "complete" ? "ready" : step.status === "warning" ? "warning" : step.status === "failed" ? "failed" : ""}>
                      {step.status === "complete" ? "Verified" : step.status === "running" ? "Checking" : step.status === "warning" ? "Attention" : step.status === "failed" ? "Failed" : "Pending"}
                    </b>
                  </div>
                ))}
              </div>
              {logs.length > 0 && (
                <div className="setup-log-panel">
                  <div><strong>Installation log</strong><span>{logs.length} events</span></div>
                  {logs.map((entry, index) => <p key={index}>{entry}</p>)}
                </div>
              )}
              {failure && <p className="setup-error" role="alert">{failure}</p>}
              <div className="setup-actions">
                {!completed ? (
                  <button className="primary-btn" onClick={() => void runSetup()} disabled={running}>
                    {running ? <RefreshCw size={16} className="spin" /> : <RefreshCw size={16} />}
                    {running ? "Checking…" : failure ? "Retry failed checks" : "Run checks again"}
                  </button>
                ) : (
                  <button className="primary-btn" onClick={onComplete}>
                    <Check size={16} /> Continue to owner sign-in
                  </button>
                )}
              </div>
              {completed && steps.some((step) => step.id === "cloud" && step.status === "warning") && (
                <p className="setup-offline-note">Local setup is complete. Owner sign-in, online checkout and cloud sync need an internet connection and a configured Supabase URL.</p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
