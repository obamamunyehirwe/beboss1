import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./lib/telemetry";
import "./lib/desktop";
import "./styles.css";
import "./setup.css";
import "./command.css";
import "./app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <main role="alert" className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
          <section className="max-w-xl rounded-2xl border border-border bg-card p-8 shadow-xl">
            <h1 className="text-xl font-bold">BeBoss Desktop recovered from an unexpected screen error</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Your saved local transactions remain in the encrypted desktop database. Reload this screen to continue.
              A diagnostic was sent securely when production telemetry is configured.
            </p>
            <button
              type="button"
              onClick={resetError}
              className="mt-6 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
            >
              Reload screen
            </button>
          </section>
        </main>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
