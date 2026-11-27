import { createFileRoute } from "@tanstack/react-router";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const Route = createFileRoute("/api/public/desktop-release/download")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers }),
      GET: async ({ request }) => {
        try {
          const id = new URL(request.url).searchParams.get("id") ?? "";
          if (!/^[0-9a-f-]{36}$/i.test(id)) {
            return new Response("Invalid desktop release identifier.", {
              status: 400,
              headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: release, error } = await supabaseAdmin
            .from("desktop_app_releases")
            .select("id,platform,version_name,file_path,file_name,is_current,is_public")
            .eq("id", id)
            .eq("is_current", true)
            .eq("is_public", true)
            .maybeSingle();

          if (error || !release) {
            return new Response("This desktop release is no longer current or publicly available.", {
              status: 404,
              headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          const expectedPrefix = `desktop/${release.platform}/v${release.version_name}/`;
          if (
            !["windows", "macos", "linux"].includes(release.platform) ||
            !release.file_path.startsWith(expectedPrefix) ||
            release.file_path.startsWith("/") ||
            release.file_path.split("/").some((part: string) => !part || part === "." || part === "..")
          ) {
            return new Response("The desktop release storage path is invalid.", {
              status: 503,
              headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          const { data: signed, error: signingError } = await supabaseAdmin.storage
            .from("releases")
            .createSignedUrl(release.file_path, 600, { download: release.file_name });
          if (signingError || !signed?.signedUrl) {
            console.error("[BeBoss desktop updater] Could not create signed installer URL.", signingError);
            return new Response("The desktop installer is temporarily unavailable.", {
              status: 503,
              headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          const { error: countError } = await supabaseAdmin.rpc("record_desktop_release_download", {
            p_release_id: release.id,
          });
          if (countError) {
            console.warn("[BeBoss desktop updater] Installer download counter could not be updated.", countError);
          }

          return new Response(null, { status: 302, headers: { ...headers, Location: signed.signedUrl } });
        } catch (error) {
          console.error("[BeBoss desktop updater] Download request failed.", error);
          return new Response("The desktop installer is temporarily unavailable.", {
            status: 503,
            headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
