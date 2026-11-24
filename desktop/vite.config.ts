import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const desktopEnvDir = import.meta.dirname;
  const repositoryEnvDir = path.resolve(desktopEnvDir, "..");
  const desktopEnv = loadEnv(mode, desktopEnvDir, "");
  const repositoryEnv = loadEnv(mode, repositoryEnvDir, "");

  // The root .env is shared with Android and contains unprefixed public
  // Supabase values. Only these two explicitly selected public values are
  // mapped to import.meta.env; no other root environment variable is exposed.
  const firstConfigured = (...values: Array<string | undefined>) =>
    values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
  const supabaseUrl = firstConfigured(
    process.env.VITE_SUPABASE_URL,
    desktopEnv.VITE_SUPABASE_URL,
    repositoryEnv.VITE_SUPABASE_URL,
    repositoryEnv.SUPABASE_URL,
    desktopEnv.SUPABASE_URL,
  );
  const supabasePublishableKey = firstConfigured(
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    desktopEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
    repositoryEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
    repositoryEnv.SUPABASE_PUBLISHABLE_KEY,
    desktopEnv.SUPABASE_PUBLISHABLE_KEY,
  );

  return {
    envDir: desktopEnvDir,
    plugins: [react()],
    publicDir: "public",
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
    },
    resolve: {
      alias: {
        "@": path.resolve(desktopEnvDir, "./src"),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    build: {
      target: "es2022",
      sourcemap: false,
      emptyOutDir: true,
      rollupOptions: {
        output: {
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
