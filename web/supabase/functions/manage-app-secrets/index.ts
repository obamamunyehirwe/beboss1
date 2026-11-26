const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const encoder = new TextEncoder();
const BB3_ANDROID_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEnH8Qg10M7lur8WocoKgklEJ98F6
UF9J9ektcbwahKU79+sHZdQAejA76NlwNldXfWaZGFNYu+ziDItMapV7dA==
-----END PUBLIC KEY-----`;
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function adminRest(path: string, init: RequestInit = {}) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Edge Function server credentials are not configured.");
  }
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", "Bearer " + serviceRoleKey);
  headers.set("Content-Type", "application/json");
  return fetch(supabaseUrl + "/rest/v1/" + path, { ...init, headers });
}

async function authorize(request: Request, adminOnly: boolean) {
  const authorization = request.headers.get("Authorization") ?? "";
  const apiKey = request.headers.get("apikey") ?? "";
  if (!authorization.startsWith("Bearer ") || !apiKey) {
    throw new Response("A signed-in BeBoss administrator is required.", { status: 401 });
  }
  const userResponse = await fetch(supabaseUrl + "/auth/v1/user", {
    headers: { apikey: apiKey, Authorization: authorization },
  });
  if (!userResponse.ok) throw new Response("Your Supabase session is invalid or expired. Sign in again.", { status: 401 });
  const user = await userResponse.json();
  if (!user?.id || !user?.email) throw new Response("A verified Supabase user session is required.", { status: 401 });

  const roleName = adminOnly ? "is_beboss_admin" : "is_beboss_staff";
  const roleResponse = await fetch(supabaseUrl + "/rest/v1/rpc/" + roleName, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!roleResponse.ok) throw new Response("Could not verify your BeBoss role.", { status: 503 });
  const allowed = await roleResponse.json();
  if (allowed !== true) throw new Response(adminOnly ? "Master administrator access is required." : "BeBoss staff access is required.", { status: 403 });
  return { email: String(user.email) };
}

function decodePem(pem: string): Uint8Array {
  const b64 = pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, "");
  const binary = atob(b64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

async function verifyBb3PrivateKey(pem: string): Promise<void> {
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----") || !pem.includes("-----END PRIVATE KEY-----")) {
    throw new Error("Paste a complete PKCS#8 ECDSA P-256 private key PEM.");
  }
  let privateKey: CryptoKey;
  try {
    privateKey = await crypto.subtle.importKey(
      "pkcs8",
      asArrayBuffer(decodePem(pem)),
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"],
    );
  } catch {
    throw new Error("The PEM is not a valid PKCS#8 ECDSA P-256 private key.");
  }
  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const expectedKey = await crypto.subtle.importKey(
    "spki",
    asArrayBuffer(decodePem(BB3_ANDROID_PUBLIC_KEY_PEM)),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const expectedJwk = await crypto.subtle.exportKey("jwk", expectedKey);
  if (!privateJwk.x || !privateJwk.y || privateJwk.x !== expectedJwk.x || privateJwk.y !== expectedJwk.y) {
    throw new Error("This private key does not match the public key pinned in the current BeBoss Android APK. The existing matching key must be retained.");
  }
}

async function readSecret(name: string): Promise<string> {
  const query = new URLSearchParams({ select: "value", name: "eq." + name, limit: "1" });
  const response = await adminRest("app_secrets?" + query.toString());
  if (!response.ok) throw new Error("Could not read BeBoss server configuration from Supabase.");
  const rows = await response.json();
  return String(rows?.[0]?.value ?? "").trim();
}

async function saveSecret(name: string, value: string, email: string) {
  const response = await adminRest("app_secrets?on_conflict=name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      name,
      value,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[manage-app-secrets] Supabase upsert failed", response.status, detail.slice(0, 200));
    throw new Error("Supabase could not save this server configuration.");
  }
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { message: "Method not allowed." });

  try {
    const body = await request.json();
    const action = String(body?.action ?? "");
    const adminOnly = action !== "verify_snapshot";
    const user = await authorize(request, adminOnly);

    if (action === "bb3_status") {
      const pem = await readSecret("BEBOSS_UNLOCK_ECDSA_PRIVATE_KEY_PEM");
      if (!pem) {
        return json(200, { configured: false, message: "The BB3 private key is not stored in Supabase yet. Add the original Android-matching PKCS#8 key below." });
      }
      try {
        await verifyBb3PrivateKey(pem);
        return json(200, { configured: true, message: "Ready: the Supabase-stored P-256 private key matches the Android public key. New BB3 codes can be signed." });
      } catch (error) {
        return json(200, { configured: false, message: error instanceof Error ? error.message : "The stored BB3 key could not be validated." });
      }
    }

    if (action === "bb3_save") {
      const pem = String(body?.value ?? "").trim();
      if (pem.length < 120 || pem.length > 2000) return json(400, { message: "Paste a complete PKCS#8 P-256 private key PEM." });
      await verifyBb3PrivateKey(pem);
      await saveSecret("BEBOSS_UNLOCK_ECDSA_PRIVATE_KEY_PEM", pem, user.email);
      return json(200, { ok: true, configured: true, message: "The matching BB3 key was verified and stored securely in Supabase." });
    }

    if (action === "snapshot_status") {
      const secret = await readSecret("BEBOSS_DATASHARE_HMAC_SECRET");
      return json(200, { configured: secret.length >= 8 });
    }

    if (action === "snapshot_save") {
      const secret = String(body?.value ?? "").trim();
      if (secret.length < 8 || secret.length > 500) return json(400, { message: "Use a snapshot HMAC key between 8 and 500 characters." });
      await saveSecret("BEBOSS_DATASHARE_HMAC_SECRET", secret, user.email);
      return json(200, { ok: true, configured: true });
    }

    if (action === "verify_snapshot") {
      const checks = Array.isArray(body?.checks) ? body.checks : [];
      const shopId = String(body?.shopId ?? "").trim();
      if (checks.length < 1 || checks.length > 250) {
        return json(400, { message: "Snapshot verification requires 1–250 chunks." });
      }
      const legacySecret = await readSecret("BEBOSS_DATASHARE_HMAC_SECRET");
      let shopSecret = "";
      if (shopId && shopId.length <= 200) {
        const query = new URLSearchParams({ select: "lan_sync_secret", id: "eq." + shopId, limit: "1" });
        const shopResponse = await adminRest("shop_accounts?" + query.toString());
        if (!shopResponse.ok) throw new Error("Could not read the shop-scoped snapshot verification key.");
        const shopRows = await shopResponse.json();
        shopSecret = String(shopRows?.[0]?.lan_sync_secret ?? "").trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(shopSecret)) shopSecret = "";
      }

      let legacyKey: CryptoKey | null = null;
      if (legacySecret.length >= 8) {
        legacyKey = await crypto.subtle.importKey(
          "raw",
          encoder.encode(legacySecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
      }
      let shopKey: CryptoKey | null = null;
      if (shopSecret) {
        const masterKey = await crypto.subtle.importKey(
          "raw",
          encoder.encode(shopSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const domain = encoder.encode("BeBoss_BBSHARE2_HMAC_v1");
        const info = new Uint8Array(domain.length + 1);
        info.set(domain);
        info[domain.length] = 0x01;
        const derived = new Uint8Array(await crypto.subtle.sign("HMAC", masterKey, info));
        shopKey = await crypto.subtle.importKey(
          "raw",
          derived,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
      }

      let verified = true;
      let checked = 0;
      for (const item of checks) {
        const payload = String(item?.payload ?? "");
        const signature = String(item?.signature ?? "").toUpperCase();
        const validLegacy = /^[A-F0-9]{8,16}$/.test(signature);
        const validShop = /^[A-F0-9]{64}$/.test(signature);
        if (!payload || (!validLegacy && !validShop)) {
          verified = false;
          continue;
        }
        let match = false;
        if (validShop && shopKey) {
          const shopExpected = hex(new Uint8Array(
            await crypto.subtle.sign("HMAC", shopKey, encoder.encode(payload)),
          ));
          match = constantTimeHexEqual(shopExpected, signature);
        }
        // BBSHARE1 and older desktop BBSHARE2 snapshots remain readable with
        // the old server-only key while migration completes. New BBSHARE2
        // snapshots are accepted only when the shop-derived signature matches.
        if (!match && legacyKey) {
          const legacyExpected = hex(new Uint8Array(
            await crypto.subtle.sign("HMAC", legacyKey, encoder.encode(payload)),
          ));
          const expected = validLegacy ? legacyExpected.slice(0, signature.length) : legacyExpected;
          match = constantTimeHexEqual(expected, signature);
        }
        checked += 1;
        if (!match) verified = false;
      }
      return json(200, {
        configured: Boolean(legacyKey || shopKey),
        verified: verified && checked === checks.length,
        checked,
        scheme: shopKey ? "shop-scoped-v2-with-legacy-read-compatibility" : "legacy-read-only",
      });
    }

    return json(400, { message: "Unknown BeBoss server configuration action." });
  } catch (error) {
    if (error instanceof Response) {
      const message = await error.text();
      return json(error.status, { message });
    }
    console.error("[manage-app-secrets] Request failed", error instanceof Error ? error.message : "unknown error");
    return json(500, { message: error instanceof Error ? error.message : "Could not process BeBoss server configuration." });
  }
});
