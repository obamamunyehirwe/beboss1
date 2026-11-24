import { useState } from "react";
import {
  ArrowRight, Building2, Check, LoaderCircle, Monitor, ShieldCheck,
  ShoppingCart, Sparkles, X
} from "lucide-react";

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState("English");
  const [checking, setChecking] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  async function runChecks() {
    setChecking(true);
    setError("");
    try {
      const probeKey = "desktop-first-run-probe";
      await window.beBossDesktop.secureStore.set(probeKey, "ready");
      const result = await window.beBossDesktop.secureStore.get(probeKey);
      await window.beBossDesktop.secureStore.remove(probeKey);
      await window.beBossDesktop.getDeviceId();
      if (result !== "ready") throw new Error("Secure local storage is not available.");
      setReady(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The BeBoss setup check failed.");
    } finally {
      setChecking(false);
    }
  }

  async function finish() {
    const code = language === "English" ? "EN" : language === "Français" ? "FR" : language === "Kinyarwanda" ? "RW" : "SW";
    await window.beBossDesktop.secureStore.set("ui-language", code);
    await window.beBossDesktop.secureStore.set("desktop-setup-complete", "true");
    onComplete();
  }

  const steps = [
    { title: "Welcome to BeBoss", copy: "Set up a secure desktop workspace that stays connected to your shop.", icon: Sparkles },
    { title: "Choose your language", copy: "Use the language you prefer. It can be changed later.", icon: Monitor },
    { title: "Prepare this computer", copy: "Check secure storage and create this desktop terminal identity.", icon: ShieldCheck },
  ];
  const current = steps[step];
  const Icon = current.icon;

  return <div className="setup-wizard">
    <aside className="setup-rail">
      <div className="setup-brand"><img src="/beboss-app-icon.png" alt="BeBoss" /><div><strong>BeBoss</strong><small>DESKTOP SETUP</small></div></div>
      <div className="setup-progress">
        {steps.map((item, index) => {
          const StepIcon = item.icon;
          return <div className={"setup-step " + (index === step ? "active" : index < step ? "complete" : "")} key={item.title}>
            <span>{index < step ? <Check size={16} /> : <StepIcon size={16} />}</span>
            <div><small>Step {index + 1}</small><strong>{item.title}</strong></div>
          </div>;
        })}
      </div>
      <div className="setup-security"><ShieldCheck size={16} /><span><strong>Private by design</strong><small>Owner sessions use secure system storage</small></span></div>
    </aside>

    <main className="setup-main">
      <button className="setup-close" type="button" onClick={finish} title="Continue to sign in"><X size={17} /></button>
      <div className="setup-content">
        <span className="setup-icon"><Icon size={26} /></span>
        <span className="eyebrow muted">BEFORE YOU BEGIN</span>
        <h1>{current.title}</h1>
        <p>{current.copy}</p>

        {step === 0 && <div className="setup-feature-grid">
          <article><ShoppingCart size={19} /><div><strong>Complete POS</strong><span>Sales, credit, discounts and receipts</span></div></article>
          <article><Building2 size={19} /><div><strong>Whole-shop control</strong><span>Branches, staff and terminals</span></div></article>
          <article><ShieldCheck size={19} /><div><strong>Verified access</strong><span>Owner-only SMS authentication</span></div></article>
          <article><Monitor size={19} /><div><strong>Desktop terminal</strong><span>Secure sync and local-first recovery</span></div></article>
        </div>}

        {step === 1 && <div className="setup-language-grid">
          {["English", "Kinyarwanda", "Français", "Kiswahili"].map((item) => <button type="button" key={item} className={language === item ? "selected" : ""} onClick={() => setLanguage(item)}>
            <span>{item === "English" ? "EN" : item === "Kinyarwanda" ? "RW" : item === "Français" ? "FR" : "SW"}</span>
            <strong>{item}</strong>
            {language === item && <Check size={16} />}
          </button>)}
        </div>}

        {step === 2 && <div className="setup-checks">
          <div className="setup-check"><ShieldCheck size={18} /><span><strong>Operating-system security</strong><small>Owner session and cache storage</small></span><b className={ready ? "ready" : ""}>{ready ? "Ready" : "Check"}</b></div>
          <div className="setup-check"><Monitor size={18} /><span><strong>Desktop terminal identity</strong><small>Unique sync identity for this computer</small></span><b className={ready ? "ready" : ""}>{ready ? "Ready" : "Check"}</b></div>
          <div className="setup-check"><ArrowRight size={18} /><span><strong>Cloud synchronization</strong><small>Available after owner sign-in</small></span><b>Next</b></div>
          {error && <div className="inline-alert error"><ShieldCheck size={16} />{error}</div>}
        </div>}

        <div className="setup-actions">
          {step > 0 && <button type="button" className="btn-outline" onClick={() => setStep((value) => value - 1)}>Back</button>}
          {step < 2 ? <button type="button" className="btn-primary" onClick={() => setStep((value) => value + 1)}>Continue <ArrowRight size={16} /></button> :
            !ready ? <button type="button" className="btn-primary" disabled={checking} onClick={runChecks}>{checking ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{checking ? "Checking…" : "Run setup check"}</button> :
              <button type="button" className="btn-primary" onClick={finish}>Open BeBoss <ArrowRight size={16} /></button>}
        </div>
      </div>
    </main>
  </div>;
}
