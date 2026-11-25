const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function text(status: number, message: string) {
  return new Response(message, { status, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}

async function adminRest(path: string, init: RequestInit = {}) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("The Supabase download service is not configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", "Bearer " + serviceRoleKey);
  headers.set("Content-Type", "application/json");
  return fetch(supabaseUrl + "/rest/v1/" + path, { ...init, headers });
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function enforceDownloadRateLimit(request: Request): Promise<Response | null> {
  // Supabase's edge gateway supplies the client address. Persist only a keyed digest.
  const sourceIp = request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip");
  if (!sourceIp) return text(503, "The download service could not verify the request source.");

  const keyHash = await hmacSha256Hex(serviceRoleKey, sourceIp);
  const response = await adminRest("rpc/consume_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      p_scope: "public_apk_download",
      p_key_hash: keyHash,
      p_max_hits: 30,
      p_window_seconds: 900,
    }),
  });
  if (!response.ok) {
    console.error("[public-apk-download] Rate-limit service unavailable", response.status);
    return text(503, "The download service is temporarily unavailable.");
  }

  const rows = await response.json();
  const limit = Array.isArray(rows) ? rows[0] : rows;
  if (!limit || typeof limit.allowed !== "boolean") {
    console.error("[public-apk-download] Rate-limit response was invalid");
    return text(503, "The download service is temporarily unavailable.");
  }
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Number(limit.retry_after_seconds) || 60);
    return new Response("Too many download requests. Please try again later.", {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": String(retryAfter),
      },
    });
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return text(405, "Method not allowed.");

  try {
    const rateLimitResponse = await enforceDownloadRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const url = new URL(request.url);
    const requested = url.searchParams.get("release") ?? "";
    const channel = (url.searchParams.get("ch") ?? "web").replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "web";
    if (requested && !/^[0-9a-f-]{36}$/i.test(requested)) return text(400, "Invalid release identifier.");

    const query = new URLSearchParams({ select: "id,file_path,file_name", is_public: "eq.true", limit: "1" });
    if (requested) query.set("id", "eq." + requested);
    else query.set("is_current", "eq.true");

    const releaseResponse = await adminRest("app_releases?" + query.toString());
    if (!releaseResponse.ok) return text(503, "The BeBoss download service could not verify the published release.");
    const releases = await releaseResponse.json();
    const release = releases?.[0];
    if (!release) return text(404, "This release is hidden or is not currently published.");

    const filePath = String(release.file_path ?? "").trim();
    const fileName = String(release.file_name ?? "BeBoss.apk").trim();
    if (!filePath || filePath.startsWith("/") || filePath.includes("..")) return text(503, "The published release has an invalid private storage path.");

    const encodedPath = filePath.split("/").map((part: string) => encodeURIComponent(part)).join("/");
    const signResponse = await fetch(
      supabaseUrl + "/storage/v1/object/sign/releases/" + encodedPath,
      {
        method: "POST",
        headers: { apikey: serviceRoleKey, Authorization: "Bearer " + serviceRoleKey, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 900, download: fileName }),
      },
    );
    if (!signResponse.ok) {
      console.error("[public-apk-download] Signed storage URL could not be created", signResponse.status);
      return text(503, "The release is listed, but its APK file is unavailable in private release storage.");
    }
    const signed = await signResponse.json();
    const signedPath = String(signed?.signedURL ?? "");
    if (!signedPath) return text(503, "The published APK could not be signed for download.");
    const signedUrl = signedPath.startsWith("http")
      ? signedPath
      : supabaseUrl + (signedPath.startsWith("/storage/v1/") ? signedPath : "/storage/v1" + (signedPath.startsWith("/") ? signedPath : "/" + signedPath));

    const record = await adminRest("rpc/record_apk_download", {
      method: "POST",
      body: JSON.stringify({ p_release_id: release.id, p_channel: channel }),
    });
    if (!record.ok) console.warn("[public-apk-download] Download succeeded, but the counter could not be recorded.");

    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: signedUrl } });
  } catch (error) {
    console.error("[public-apk-download] Handler failed", error instanceof Error ? error.message : "unknown error");
    return text(503, "The BeBoss download service is temporarily unavailable. Please contact the administrator.");
  }
});
