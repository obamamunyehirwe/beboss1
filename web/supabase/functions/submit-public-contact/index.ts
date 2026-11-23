const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedTopics = new Set(["GENERAL", "SALES", "SUPPORT", "PAYMENT", "PARTNERSHIP"]);

function json(status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extraHeaders } });
}

async function rest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").normalize("NFKC").trim().slice(0, maxLength);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { message: "Method not allowed." });
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[submit-public-contact] Required server configuration is missing.");
    return json(503, { message: "Contact submission is temporarily unavailable." });
  }

  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 12_000) return json(413, { message: "The submitted message is too large." });
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 12_000) {
      return json(413, { message: "The submitted message is too large." });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(400, { message: "The contact form data is invalid." });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(400, { message: "The contact form data is invalid." });
    }

    const fullName = cleanText(body.full_name, 120);
    const phone = cleanText(body.phone, 30);
    const email = cleanText(body.email, 200).toLowerCase();
    const shopName = cleanText(body.shop_name, 160);
    const topic = cleanText(body.topic, 24).toUpperCase();
    const message = cleanText(body.message, 4000);

    if (
      fullName.length < 2 ||
      message.length < 5 ||
      (!phone && !email) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      !allowedTopics.has(topic)
    ) {
      return json(400, { message: "Please check your name, contact details, topic and message." });
    }

    // The edge gateway supplies the client address. Only the one-way hash is stored.
    const sourceIp = request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip");
    if (!sourceIp) {
      console.warn("[submit-public-contact] Client IP was unavailable; request rejected closed.");
      return json(503, { message: "Contact submission is temporarily unavailable. Please retry." });
    }

    const ipHash = await sha256Hex(`${sourceIp}:${serviceRoleKey.slice(0, 24)}`);
    const limitResponse = await rest("rpc/consume_rate_limit", {
      method: "POST",
      body: JSON.stringify({
        p_scope: "public_contact",
        p_key_hash: ipHash,
        p_max_hits: 5,
        p_window_seconds: 900,
      }),
    });
    if (!limitResponse.ok) {
      console.error("[submit-public-contact] Atomic rate-limit RPC failed:", limitResponse.status);
      return json(503, { message: "Contact submission is temporarily unavailable." });
    }

    const limitRows = await limitResponse.json();
    const limit = Array.isArray(limitRows) ? limitRows[0] : limitRows;
    if (typeof limit?.allowed !== "boolean") {
      console.error("[submit-public-contact] Atomic rate-limit RPC returned an invalid response.");
      return json(503, { message: "Contact submission is temporarily unavailable." });
    }
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Number(limit.retry_after_seconds) || 900);
      return json(429, { message: "Too many messages were sent from this network. Please try again later." }, {
        "Retry-After": String(retryAfter),
      });
    }

    const insert = await rest("contact_messages", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        full_name: fullName,
        phone,
        email,
        shop_name: shopName,
        topic,
        message,
        status: "NEW",
        admin_reply_note: "",
      }),
    });
    if (!insert.ok) {
      console.error("[submit-public-contact] Contact row insert failed:", insert.status);
      return json(503, { message: "Your message could not be saved. Please retry." });
    }

    return json(200, { ok: true, message: "Your message was received." });
  } catch (error) {
    console.error("[submit-public-contact] Request failed:", error);
    return json(500, { message: "Contact submission failed. Please retry." });
  }
});
