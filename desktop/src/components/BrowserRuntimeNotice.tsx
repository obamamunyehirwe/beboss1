import { AppWindow, Database, Download, ShieldCheck, Terminal, Wifi } from "lucide-react";

export function BrowserRuntimeNotice() {
  return (
    <main className="browser-runtime-page">
      <section className="browser-runtime-card" aria-labelledby="browser-runtime-title">
        <header className="browser-runtime-head">
          <span className="browser-runtime-logo"><AppWindow size={25} /></span>
          <div>
            <strong>BeBoss Desktop</strong>
            <small>NATIVE RETAIL OPERATIONS WORKSPACE</small>
          </div>
        </header>

        <div className="browser-runtime-body">
          <span className="browser-runtime-eyebrow"><Wifi size={13} /> Browser preview detected</span>
          <h1 id="browser-runtime-title">Open BeBoss in its desktop app.</h1>
          <p>
            You are viewing the desktop interface inside a normal web browser. The first-run
            setup wizard, encrypted SQLCipher database, Windows Credential Manager, persistent
            device identity, native printing and offline transaction queue require the installed
            BeBoss Desktop application. This browser preview cannot install or validate those
            Windows services.
          </p>

          <div className="browser-runtime-grid">
            <article><ShieldCheck size={19} /><strong>Native security checks</strong><span>Verify the operating-system credential vault and encrypted local database.</span></article>
            <article><Database size={19} /><strong>Private local workspace</strong><span>Use the protected local database and durable offline sync queue.</span></article>
            <article><AppWindow size={19} /><strong>Real desktop window</strong><span>Run the native app with its installed shortcut, device identity and hardware integrations.</span></article>
          </div>

          <section className="browser-runtime-steps" aria-label="How to open the native desktop app">
            <h2>How to continue</h2>
            <ol>
              <li><strong>Already installed?</strong> Close this browser tab, open the Windows Start Menu, search for <strong>BeBoss Desktop</strong>, and launch it. The four-step first-run setup appears inside that app window.</li>
              <li><strong>Installing now?</strong> Run the BeBoss Windows installer (.exe). Use its native installation pages to choose the install folder and shortcuts, then keep <strong>Launch BeBoss Desktop</strong> selected on the Finish page.</li>
              <li><strong>Developing from source?</strong> Open a terminal in the repository's desktop folder and run:</li>
            </ol>
            <code className="browser-runtime-code">bun install<br />bun run dev</code>
            <p style={{ margin: "12px 0 0", color: "#8297b3", fontSize: 10, lineHeight: 1.6 }}>
              To package a Windows installer from source, run <code>bun run dist:win</code> in the same folder.
              Do not use the Vite-only browser preview command to test native installation.
            </p>
          </section>
        </div>

        <footer className="browser-runtime-footer">
          <span><Terminal size={14} /> Browser mode is read-only for native desktop setup.</span>
          <span><Download size={14} /> Your shop data is not created or changed on this page.</span>
        </footer>
      </section>
    </main>
  );
}
