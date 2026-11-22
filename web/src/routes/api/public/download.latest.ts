import { createFileRoute } from "@tanstack/react-router";

const noStore = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

// Stable public APK link. Supabase signs the private Storage object inside its
// Edge Function; the Vercel server never needs a service-role credential.
export const Route = createFileRoute("/api/public/download/latest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const supabaseUrl = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
          const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
          if (!supabaseUrl || !publishableKey) {
            return new Response("The BeBoss download service is missing its public Supabase configuration.", {
              status: 503,
              headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          const incoming = new URL(request.url);
          const params = new URLSearchParams();
          const requested = incoming.searchParams.get("release");
          const channel = (incoming.searchParams.get("ch") ?? "web").replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "web";
          if (requested && /^[0-9a-f-]{36}$/i.test(requested)) params.set("release", requested);
          params.set("ch", channel);

          const upstream = await fetch(
            supabaseUrl.replace(/\/+$/, "") + "/functions/v1/public-apk-download?" + params.toString(),
            { method: "GET", headers: { apikey: publishableKey }, redirect: "manual" },
          );
          const location = upstream.headers.get("location");
          if (upstream.status === 302 && location) {
            return new Response(null, { status: 302, headers: { ...noStore, Location: location } });
          }
          const message = await upstream.text().catch(() => "The download service returned an unreadable response.");
          return new Response(message, {
            status: upstream.status,
            headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
          });
        } catch (error) {
          console.error("[BeBoss APK] Download Edge Function could not be reached", error);
          return new Response("The BeBoss download service is temporarily unavailable. Please contact the administrator.", {
            status: 503,
            headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
