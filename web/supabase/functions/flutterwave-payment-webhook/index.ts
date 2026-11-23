const encoder = new TextEncoder();
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookSecret = Deno.env.get("FLUTTERWAVE_WEBHOOK_SECRET_HASH") ?? "";
const flutterwaveSecretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function adminRest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recordEvent(provider: string, eventId: string, payloadHash: string, requestId: string | null) {
  const query = new URLSearchParams({
    select: "processing_state",
    provider: `eq.${provider}`,
    event_id: `eq.${eventId}`,
    limit: "1",
  });
  const existingResponse = await adminRest(`payment_gateway_events?${query.toString()}`);
  if (!existingResponse.ok) throw new Error("EVENT_LOOKUP_FAILED");
  const existingRows = await existingResponse.json();
  const existing = existingRows?.[0];
  if (existing?.processing_state === "VERIFIED") return "VERIFIED";

  if (!existing) {
    const insertResponse = await adminRest("payment_gateway_events", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        provider,
        event_id: eventId,
        payment_request_id: requestId,
        payload_sha256: payloadHash,
        signature_verified: true,
        processing_state: "RECEIVED",
      }),
    });
    if (!insertResponse.ok) throw new Error("EVENT_RECORD_FAILED");
  }
  return "RECEIVED";
}

async function updateEvent(
  provider: string,
  eventId: string,
  requestId: string | null,
  state: "VERIFIED" | "IGNORED" | "FAILED",
  errorCode = "",
) {
  const query = new URLSearchParams({
    provider: `eq.${provider}`,
    event_id: `eq.${eventId}`,
  });
  const response = await adminRest(`payment_gateway_events?${query.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({
      payment_request_id: requestId,
      processing_state: state,
      error_code: errorCode.slice(0, 120),
      processed_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error("EVENT_UPDATE_FAILED");
}

async function loadPaymentRequest(reference: string) {
  const query = new URLSearchParams({
    select: "id,amount_rwf,gateway_reference,gateway_provider,gateway_status,gateway_verified_at",
    gateway_reference: `eq.${reference}`,
    gateway_provider: "eq.FLUTTERWAVE_RW_MOBILE_MONEY",
    limit: "1",
  });
  const response = await adminRest(`payment_requests?${query.toString()}`);
  if (!response.ok) throw new Error("PAYMENT_REQUEST_LOOKUP_FAILED");
  const rows = await response.json();
  return rows?.[0] ?? null;
}

async function verifyFlutterwaveTransaction(transactionId: string) {
  if (!flutterwaveSecretKey) throw new Error("FLUTTERWAVE_SECRET_KEY_MISSING");
  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
    { headers: { Authorization: `Bearer ${flutterwaveSecretKey}` } },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== "success" || !body?.data) {
    throw new Error("PROVIDER_VERIFY_FAILED");
  }
  return body.data;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { message: "Method not allowed." });
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret || !flutterwaveSecretKey) {
    console.error("[flutterwave-payment-webhook] Required server secrets are missing.");
    return json(503, { message: "Webhook is not configured." });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("verif-hash") ?? "";
  if (!signature) return json(401, { message: "Missing provider signature." });

  try {
    // Flutterwave sends the configured Secret Hash verbatim in "verif-hash".
    // It is not an HMAC of the request body.
    if (!constantTimeEqual(signature, webhookSecret)) {
      return json(401, { message: "Invalid provider signature." });
    }

    const payload = JSON.parse(rawBody);
    const eventType = String(payload?.type ?? payload?.event ?? "").trim();
    const transactionId = String(payload?.data?.id ?? "").trim();
    const reference = String(payload?.data?.tx_ref ?? "").trim();
    const eventId = String(payload?.id ?? transactionId).trim();
    if (!eventId || !transactionId || !reference || eventType !== "charge.completed") {
      return json(400, { message: "Invalid Flutterwave webhook payload." });
    }

    const requestRow = await loadPaymentRequest(reference);
    if (!requestRow) {
      console.warn("[flutterwave-payment-webhook] Event reference not found:", reference);
      return json(404, { message: "Payment reference not found." });
    }

    const payloadHash = await sha256(rawBody);
    const priorState = await recordEvent(
      "FLUTTERWAVE_RW_MOBILE_MONEY",
      eventId,
      payloadHash,
      String(requestRow.id),
    );
    if (priorState === "VERIFIED") return json(200, { received: true, duplicate: true });
    if (Number(requestRow.gateway_verified_at) > 0) {
      await updateEvent("FLUTTERWAVE_RW_MOBILE_MONEY", eventId, String(requestRow.id), "VERIFIED");
      return json(200, { received: true, alreadyVerified: true });
    }

    const transaction = await verifyFlutterwaveTransaction(transactionId);
    const transactionStatus = String(transaction.status ?? "").toLowerCase();
    const transactionReference = String(transaction.tx_ref ?? "");
    const currency = String(transaction.currency ?? "").toUpperCase();
    const amount = Number(transaction.amount);
    const expectedAmount = Number(requestRow.amount_rwf);

    if (
      transactionStatus !== "successful" ||
      transactionReference !== reference ||
      currency !== "RWF" ||
      !Number.isSafeInteger(amount) ||
      amount !== expectedAmount
    ) {
      const mismatch = transactionStatus !== "successful" ? "PROVIDER_NOT_SUCCESSFUL"
        : transactionReference !== reference ? "REFERENCE_MISMATCH"
          : currency !== "RWF" ? "CURRENCY_MISMATCH"
            : amount !== expectedAmount ? "AMOUNT_MISMATCH"
              : "INVALID_PROVIDER_RESPONSE";
      const patchQuery = new URLSearchParams({ id: `eq.${requestRow.id}`, gateway_verified_at: "eq.0" });
      await adminRest(`payment_requests?${patchQuery.toString()}`, {
        method: "PATCH",
        body: JSON.stringify({ gateway_status: "FAILED", updated_at: Date.now() }),
      });
      await updateEvent("FLUTTERWAVE_RW_MOBILE_MONEY", eventId, String(requestRow.id), "IGNORED", mismatch);
      return json(200, { received: true, verified: false });
    }

    const patchQuery = new URLSearchParams({ id: `eq.${requestRow.id}`, gateway_verified_at: "eq.0" });
    const updateResponse = await adminRest(`payment_requests?${patchQuery.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        gateway_status: "VERIFIED",
        gateway_transaction_id: transactionId,
        gateway_verified_at: Date.now(),
        gateway_verified_amount_rwf: amount,
        gateway_verified_currency: currency,
        updated_at: Date.now(),
      }),
    });
    if (!updateResponse.ok) throw new Error("PAYMENT_VERIFICATION_WRITE_FAILED");
    await updateEvent("FLUTTERWAVE_RW_MOBILE_MONEY", eventId, String(requestRow.id), "VERIFIED");
    return json(200, { received: true, verified: true });
  } catch (error) {
    console.error("[flutterwave-payment-webhook]", error instanceof Error ? error.message : "Unknown error");
    return json(500, { message: "Webhook processing failed. Provider may retry this event." });
  }
});
