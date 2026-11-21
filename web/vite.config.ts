// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Vercel has the Supabase URL and publishable key as server environment variables.
// The browser client needs the same PUBLIC values at build time. Explicitly expose only
// these two values; never expose SUPABASE_SERVICE_ROLE_KEY or any other server secret.
const publicSupabaseUrl = process.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
const publicSupabaseKey =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];

const publicSupabaseDefine: Record<string, string> = {};
if (publicSupabaseUrl) {
  publicSupabaseDefine["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(publicSupabaseUrl);
}
if (publicSupabaseKey) {
  publicSupabaseDefine["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] = JSON.stringify(publicSupabaseKey);
}

export default defineConfig({
  vite: {
    ...(Object.keys(publicSupabaseDefine).length ? { define: publicSupabaseDefine } : {}),
    server: { allowedHosts: ['workspace-zkvm7tks-8b08c7aa60177527.v0.build'] },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
