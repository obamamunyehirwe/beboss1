import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.local");
const localEnv = new Map();

try {
  for (const rawLine of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    localEnv.set(key, value);
  }
} catch {
  // Environment variables and CI secrets are valid sources too.
}

const read = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]?.trim() || localEnv.get(key)?.trim();
    if (value) return value;
  }
  return "";
};
const isValidDsn = (value) => /^https:\/\/.+@[^/]+\/[^/]+$/.test(value);

const common = read("DESKTOP_SENTRY_DSN", "SENTRY_DSN", "VITE_SENTRY_DSN");
const rendererDsn = read("VITE_SENTRY_DSN", "DESKTOP_SENTRY_DSN", "SENTRY_DSN") || common;
const nativeDsn = read("SENTRY_DSN", "DESKTOP_SENTRY_DSN", "VITE_SENTRY_DSN") || common;

if (!isValidDsn(rendererDsn) || !isValidDsn(nativeDsn)) {
  console.error(
    "Production desktop release blocked: configure a valid Sentry DSN in desktop/.env.local " +
    "(VITE_SENTRY_DSN for the renderer and SENTRY_DSN for the native Rust host), or set " +
    "DESKTOP_SENTRY_DSN/SENTRY_DSN in the protected build environment."
  );
  process.exit(1);
}

// The Sentry DSN is a public ingest endpoint, not a private API key. Inject it into
// both build stages so Vite and Cargo compile the same configured release telemetry.
process.env.VITE_SENTRY_DSN = rendererDsn;
process.env.SENTRY_DSN = nativeDsn;
console.log("Production desktop crash and panic telemetry is configured for both renderer and native host.");
