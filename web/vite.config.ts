// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression): hosting
// already compresses at the edge.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(webRoot, "..");

export default defineConfig(({ mode }) => {
  // Keep the documented repository-root .env/.env.local workflow working when
  // Vite is launched from web/. Also support web-local env files for deployments.
  // Only server variables are copied into Node's process.env; they are never
  // added to the Vite define object or exposed to a browser bundle.
  const loadedEnv = {
    ...loadEnv(mode, repositoryRoot, ""),
    ...loadEnv(mode, webRoot, ""),
  };
  const serverOnlyEnvNames = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  for (const name of serverOnlyEnvNames) {
    if (!process.env[name] && loadedEnv[name]) {
      process.env[name] = loadedEnv[name];
    }
  }

  // Only the URL and publishable/anon key may be injected into the browser.
  // Never expose SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.
  const publicSupabaseUrl =
    process.env["VITE_SUPABASE_URL"] ||
    loadedEnv["VITE_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    loadedEnv["SUPABASE_URL"];
  const publicSupabaseKey =
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    loadedEnv["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    loadedEnv["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    loadedEnv["SUPABASE_ANON_KEY"];

  const publicSupabaseDefine: Record<string, string> = {};
  if (publicSupabaseUrl) {
    publicSupabaseDefine["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(publicSupabaseUrl);
  }
  if (publicSupabaseKey) {
    publicSupabaseDefine["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] = JSON.stringify(publicSupabaseKey);
  }

  // Vercel sets VERCEL=1 during its build. The Lovable wrapper otherwise keeps
  // its preview-oriented Cloudflare Nitro target, which cannot serve this app's
  // TanStack server functions as Vercel Functions. Emit Vercel's server and static
  // output directories explicitly while leaving the Lovable preview target alone.
  const isVercelBuild = process.env["VERCEL"] === "1";

  return {
    ...(isVercelBuild
      ? {
          nitro: {
            preset: "vercel",
            output: {
              dir: ".vercel/output",
              serverDir: ".vercel/output/functions/__server.func",
              publicDir: ".vercel/output/static",
            },
          },
        }
      : {}),
    vite: {
      ...(Object.keys(publicSupabaseDefine).length ? { define: publicSupabaseDefine } : {}),
      server: { allowedHosts: ["workspace-zkvm7tks-8b08c7aa60177527.v0.build"] },
    },
    tanstackStart: {
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    },
  };
});
