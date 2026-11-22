import { createFileRoute } from "@tanstack/react-router";

const noStore = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

// Stable APK link used by the website, QR codes and the Android app's update check.
// Release objects stay private; only this server handler can mint a short-lived signed URL.
export const Route = createFileRoute("/api/public/download/latest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const url = new URL(request.url);
          const requested = url.searchParams.get("release");
          const channel = (url.searchParams.get("ch") ?? "web").replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "web";

          const query = supabaseAdmin.from("app_releases").select("id, file_path, file_name");
          const { data: rel, error: releaseError } = requested && /^[0-9a-f-]{36}$/i.test(requested)
            ? await query.eq("id", requested).maybeSingle()
            : await query.eq("is_current", true).maybeSingle();

          if (releaseError) {
            console.error("[BeBoss APK] Could not load release metadata", releaseError);
            return new Response("The BeBoss download service could not verify the published release. Please try again later.", {
              status: 503,
              headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          if (!rel) {
            return new Response("No BeBoss APK release is currently published.", {
              status: 404,
              headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          const { data: signed, error: storageError } = await supabaseAdmin.storage
            .from("releases")
            .createSignedUrl(rel.file_path, 900, { download: rel.file_name });

          if (storageError || !signed?.signedUrl) {
            console.error("[BeBoss APK] Published release has no downloadable storage object", {
              releaseId: rel.id,
              filePath: rel.file_path,
              error: storageError,
            });
            return new Response(
              "The release is listed, but its signed APK file has not been uploaded to BeBoss private release storage. A master admin must publish the real APK from Admin → App releases.",
              {
                status: 503,
                headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
              },
            );
          }

          const { error: countError } = await supabaseAdmin.rpc("record_apk_download", {
            p_release_id: rel.id,
            p_channel: channel,
          });
          if (countError) console.warn("[BeBoss APK] Download succeeded but its counter could not be recorded", countError);

          return new Response(null, {
            status: 302,
            headers: { ...noStore, Location: signed.signedUrl },
          });
        } catch (error) {
          console.error("[BeBoss APK] Download handler failed", error);
          const message = error instanceof Error ? error.message : "";
          const missingServerConfig = message.includes("Missing Supabase environment variable");
          return new Response(
            missingServerConfig
              ? "BeBoss download is missing its private Supabase server key. Add SUPABASE_SERVICE_ROLE_KEY as a Secret environment variable in the Vercel project, enable it for Production, and redeploy."
              : "The BeBoss download service is temporarily unavailable. Please contact the administrator.",
            {
              status: 503,
              headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
            },
          );
        }
      },
    },
  },
});
