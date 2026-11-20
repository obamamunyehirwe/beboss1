import { createFileRoute } from "@tanstack/react-router";

// Stable APK link used by the website, QR codes and the Android app's update check.
// Looks up the current (or requested) release, counts the download, and redirects
// to a short-lived signed file URL from private storage.
export const Route = createFileRoute("/api/public/download/latest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const requested = url.searchParams.get("release");
        const channel = (url.searchParams.get("ch") ?? "web").replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "web";
        const query = supabaseAdmin.from("app_releases").select("id, file_path, file_name");
        const { data: rel } = requested && /^[0-9a-f-]{36}$/i.test(requested)
          ? await query.eq("id", requested).maybeSingle()
          : await query.eq("is_current", true).maybeSingle();
        if (!rel) {
          return new Response("No BeBoss release is published yet.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
        }
        const { data: signed, error } = await supabaseAdmin.storage.from("releases").createSignedUrl(rel.file_path, 900, { download: rel.file_name });
        if (error || !signed?.signedUrl) {
          // High-availability fallback to bundled public production APK
          return new Response(null, { status: 302, headers: { Location: "/BeBoss-POS-v2.0.0-Production.apk", "Cache-Control": "no-store" } });
        }
        await supabaseAdmin.rpc("record_apk_download", { p_release_id: rel.id, p_channel: channel });
        return new Response(null, { status: 302, headers: { Location: signed.signedUrl, "Cache-Control": "no-store" } });
      },
    },
  },
});
