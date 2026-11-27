import { createFileRoute } from "@tanstack/react-router";
import { compareReleaseVersions } from "@/lib/desktop-release-version";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

type DesktopPlatform = "windows" | "macos" | "linux";

function json(status: number, value: unknown) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function validPlatform(value: string | null): value is DesktopPlatform {
  return value === "windows" || value === "macos" || value === "linux";
}

/** Public desktop update metadata. Private bucket paths and credentials never leave the server. */
export const Route = createFileRoute("/api/public/desktop-release/latest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers }),
      GET: async ({ request }) => {
        try {
          const incoming = new URL(request.url);
          const platform = incoming.searchParams.get("platform");
          const currentVersion = incoming.searchParams.get("current") ?? "";
          if (!validPlatform(platform) || !currentVersion || compareReleaseVersions(currentVersion, currentVersion) !== 0) {
            return json(400, { error: "A supported platform and valid installed version are required." });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: release, error } = await supabaseAdmin
            .from("desktop_app_releases")
            .select("id,platform,version_name,file_name,size_bytes,sha256,release_notes,published_at")
            .eq("platform", platform)
            .eq("is_current", true)
            .eq("is_public", true)
            .maybeSingle();

          if (error) {
            console.error("[BeBoss desktop updater] Could not read current public release.", error);
            return json(503, { error: "The desktop release service is temporarily unavailable." });
          }
          if (!release) return new Response(null, { status: 204, headers });

          const comparison = compareReleaseVersions(release.version_name, currentVersion);
          if (comparison === null) return json(503, { error: "The published desktop release has an invalid version." });
          if (comparison <= 0) return new Response(null, { status: 204, headers });

          const expectedExtension = platform === "windows" ? ".exe" : platform === "macos" ? ".dmg" : ".appimage";
          const sizeBytes = Number(release.size_bytes);
          const sha256 = String(release.sha256 ?? "").toLowerCase();
          if (
            !/^[0-9a-f-]{36}$/i.test(String(release.id)) ||
            !String(release.file_name ?? "").toLowerCase().endsWith(expectedExtension) ||
            !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 536870912 ||
            !/^[a-f0-9]{64}$/.test(sha256)
          ) {
            return json(503, { error: "The published desktop release metadata is incomplete or invalid." });
          }

          const downloadUrl = new URL("/api/public/desktop-release/download", "https://beboss.rw");
          downloadUrl.searchParams.set("id", release.id);
          return json(200, {
            id: release.id,
            platform,
            version: release.version_name,
            fileName: release.file_name,
            sizeBytes,
            sha256,
            releaseNotes: String(release.release_notes ?? ""),
            publishedAt: release.published_at,
            downloadUrl: downloadUrl.toString(),
          });
        } catch (error) {
          console.error("[BeBoss desktop updater] Update check failed.", error);
          return json(503, { error: "The desktop release service is temporarily unavailable." });
        }
      },
    },
  },
});
