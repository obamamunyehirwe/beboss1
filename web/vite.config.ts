import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const webRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(webRoot, "..");
const mode = process.env.NODE_ENV === "production" ? "production" : "development";
// Keep local workerd startup within the newest date supported by the runtime
// currently bundled by the installed Cloudflare Vite plugin.
const localWorkerCompatibilityDate = "2026-11-24";

// Keep repository-root .env support for public build-time configuration.
// Worker secrets are loaded at runtime from Cloudflare bindings / .dev.vars.
const loadedEnv = {
  ...loadEnv(mode, repositoryRoot, ""),
  ...loadEnv(mode, webRoot, ""),
};

// This file contains public Supabase client configuration only. Never place
// SUPABASE_SECRET_KEY, service-role keys or any other private credential here.
const wranglerConfig = JSON.parse(
  readFileSync(resolve(webRoot, "wrangler.jsonc"), "utf8"),
) as { vars?: Record<string, string> };
const workerVars = wranglerConfig.vars ?? {};

function firstConfiguredValue(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

const publicSupabaseUrl = firstConfiguredValue(
  process.env["VITE_SUPABASE_URL"],
  loadedEnv["VITE_SUPABASE_URL"],
  workerVars["VITE_SUPABASE_URL"],
  process.env["SUPABASE_URL"],
  loadedEnv["SUPABASE_URL"],
  workerVars["SUPABASE_URL"],
);
const publicSupabaseKey = firstConfiguredValue(
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
  loadedEnv["VITE_SUPABASE_PUBLISHABLE_KEY"],
  workerVars["VITE_SUPABASE_PUBLISHABLE_KEY"],
  process.env["SUPABASE_PUBLISHABLE_KEY"],
  loadedEnv["SUPABASE_PUBLISHABLE_KEY"],
  workerVars["SUPABASE_PUBLISHABLE_KEY"],
  process.env["SUPABASE_ANON_KEY"],
  loadedEnv["SUPABASE_ANON_KEY"],
  workerVars["SUPABASE_ANON_KEY"],
);

const publicSupabaseDefine: Record<string, string> = {};
if (publicSupabaseUrl) {
  publicSupabaseDefine["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(publicSupabaseUrl);
}
if (publicSupabaseKey) {
  publicSupabaseDefine["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] = JSON.stringify(publicSupabaseKey);
}

export default defineConfig(({ command }) => ({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // `vite dev`/`vite preview` run the locally bundled workerd binary. Its
      // supported date can lag the production Workers runtime by a day or two.
      // Keep the Wrangler date (used for production builds/deploys) unchanged.
      ...(command === "serve"
        ? { config: { compatibility_date: localWorkerCompatibilityDate } }
        : {}),
    }),
    tanstackStart({ server: { entry: "server" } }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  define: Object.keys(publicSupabaseDefine).length ? publicSupabaseDefine : undefined,
  resolve: {
    alias: { "@": resolve(webRoot, "src") },
    dedupe: ["react", "react-dom"],
  },
  server: {
    allowedHosts: ["workspace-zkvm7tks-8b08c7aa60177527.v0.build"],
  },
}));
