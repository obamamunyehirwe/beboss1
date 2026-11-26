import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
const SECRET_PATTERNS = [
  /\b(pin|password|passcode|token|secret|authorization|api[_-]?key)\s*[:=]\s*["']?[^\s,"'}\]]+/gi,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /BB[23]-[A-Z0-9-]+/g,
  /BBSHARE[12]:[A-Za-z0-9+/=:-]+/g,
  /pbkdf2v?2?:[0-9]+:[a-fA-F0-9]+:[a-fA-F0-9]+/gi,
];
const RWANDA_PHONE = /(?:\+?250|0)7[0-9]{8}\b/g;

export function scrubDesktopDiagnostic(value: string): string {
  let safe = value;
  for (const pattern of SECRET_PATTERNS) safe = safe.replace(pattern, "[REDACTED]");
  return safe.replace(RWANDA_PHONE, "[PHONE]");
}

function sanitizeEvent(event: Sentry.Event): Sentry.Event {
  if (event.message) event.message = scrubDesktopDiagnostic(event.message);
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((item) => ({
      ...item,
      value: item.value ? scrubDesktopDiagnostic(item.value) : item.value,
    }));
  }
  if (event.logentry?.message) {
    event.logentry.message = scrubDesktopDiagnostic(event.logentry.message);
  }

  // POS payloads, HTTP headers, users, query strings and arbitrary extras can
  // contain customer/staff records or credentials. Keep stack + release context.
  event.user = undefined;
  event.extra = undefined;
  if (event.request) {
    event.request.data = undefined;
    event.request.cookies = undefined;
    event.request.headers = undefined;
    event.request.query_string = undefined;
    if (event.request.url) {
      try {
        const parsed = new URL(event.request.url);
        event.request.url = parsed.origin + parsed.pathname;
      } catch {
        event.request.url = "[URL]";
      }
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: crumb.message ? scrubDesktopDiagnostic(crumb.message) : crumb.message,
      data: undefined,
    }));
  }
  return event;
}

if (dsn && /^https:\/\/.+@[^/]+\/[^/]+$/.test(dsn)) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || "production",
    release: "beboss-desktop@1.4.2",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: sanitizeEvent,
    initialScope: { tags: { application: "beboss-desktop", platform: "tauri-renderer" } },
  });
  Sentry.setTag("telemetry", "configured");
} else {
  // No DSN means telemetry is explicitly disabled; it never blocks POS operation.
  Sentry.setTag("telemetry", "not-configured");
}

export function captureDesktopException(
  error: unknown,
  context: Record<string, string> = {},
): void {
  if (!dsn) return;
  const safeError = error instanceof Error
    ? new Error(scrubDesktopDiagnostic(error.message))
    : new Error(scrubDesktopDiagnostic(String(error)));
  if (error instanceof Error) safeError.stack = error.stack;
  Sentry.withScope((scope) => {
    scope.setTag("platform", "desktop");
    for (const [key, value] of Object.entries(context)) {
      if (/^[a-z0-9_.-]{1,40}$/i.test(key)) {
        scope.setTag(key, scrubDesktopDiagnostic(value).slice(0, 120));
      }
    }
    Sentry.captureException(safeError);
  });
}

export function sendDesktopTelemetryTest(): boolean {
  if (!dsn) return false;
  Sentry.captureMessage("BeBoss Desktop telemetry test event", "info");
  return true;
}
