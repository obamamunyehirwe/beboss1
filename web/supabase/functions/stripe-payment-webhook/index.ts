const encoder = new TextEncoder();
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SIGNATURE_TOLERANCE_SECONDS = 300;

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

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parseStripeSignature(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && /^[0-9a-f]{64}$/i.test(value ?? "")) signatures.push(value.toLowerCase());
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || signatures.length === 0) return null;
  return { timestamp, signatures };
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

async function updateEvent(provider: string, eventId: string, requestId: string | null, state: "VERIFIED" | "IGNORED" | "FAILED", errorCode = "") {
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

async function loadPaymentRequest(requestId: string) {
  const query = new URLSearchParams({
    select: "id,amount_rwf,gateway_reference,gateway_provider,gateway_status,gateway_verified_at,gateway_payment_intent_id",
    id: `eq.${requestId}`,
    gateway_provider: "eq.STRIPE_CHECKOUT",
    limit: "1",
  });
  const response = await adminRest(`payment_requests?${query.toString()}`);
  if (!response.ok) throw new Error("PAYMENT_REQUEST_LOOKUP_FAILED");
  const rows = await response.json();
  return rows?.[0] ?? null;
}

async function retrieveStripeSession(sessionId: string) {
  if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY_MISSING");
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand%5B%5D=payment_intent`,
    { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.id) {
    console.error("[stripe-payment-webhook] Could not retrieve Checkout Session", response.status, body?.error?.code);
    throw new Error("STRIPE_SESSION_VERIFY_FAILED");
  }
  return body;
}

async function markGatewayStatus(requestId: string, status: "FAILED" | "EXPIRED") {
  const query = new URLSearchParams({ id: `eq.${requestId}`, gateway_verified_at: "eq.0" });
  const response = await adminRest(`payment_requests?${query.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({ gateway_status: status, updated_at: Date.now() }),
  });
  if (!response.ok) throw new Error("PAYMENT_STATUS_WRITE_FAILED");
}



async function loadRefund(refundId: string) {
  const query = new URLSearchParams({
    select: "id,payment_request_id,provider,provider_refund_id,amount_rwf,status",
    id: "eq." + refundId,
    provider: "eq.STRIPE_CHECKOUT",
    limit: "1",
  });
  const response = await adminRest("payment_gateway_refunds?" + query.toString());
  if (!response.ok) throw new Error("REFUND_LOOKUP_FAILED");
  const rows = await response.json();
  return rows?.[0] ?? null;
}

async function saveRefundProviderResult(refundId: string, providerRefundId: string) {
  const response = await adminRest("payment_gateway_refunds?id=eq." + encodeURIComponent(refundId), {
    method: "PATCH",
    body: JSON.stringify({
      provider_refund_id: providerRefundId,
      status: "PENDING",
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error("REFUND_STATE_UPDATE_FAILED");
}

async function finalizeRefund(refundId: string, providerStatus: string, providerRefundId: string) {
  const response = await adminRest("rpc/finalize_gateway_refund", {
    method: "POST",
    body: JSON.stringify({
      p_refund_id: refundId,
      p_provider_status: providerStatus,
      p_provider_refund_id: providerRefundId,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error("REFUND_FINALIZATION_FAILED");
  return Array.isArray(result) ? result[0] : result;
}
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { message: "Method not allowed." });
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !webhookSecret) {
    console.error("[stripe-payment-webhook] Required server secrets are missing.");
    return json(503, { message: "Webhook is not configured." });
  }

  const rawBody = await request.text();
  const parsedSignature = parseStripeSignature(request.headers.get("stripe-signature") ?? "");
  if (!parsedSignature) return json(401, { message: "Missing or invalid provider signature." });
  if (Math.abs(Math.floor(Date.now() / 1000) - parsedSignature.timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return json(401, { message: "Provider signature timestamp is outside the allowed window." });
  }

  try {
    const expected = await hmacSha256Hex(webhookSecret, `${parsedSignature.timestamp}.${rawBody}`);
    if (!parsedSignature.signatures.some((signature) => constantTimeEqual(signature, expected))) {
      return json(401, { message: "Invalid provider signature." });
    }

    const payload = JSON.parse(rawBody);
    const eventId = String(payload?.id ?? "").trim();
    const eventType = String(payload?.type ?? "").trim();
    const eventObject = payload?.data?.object;
    const payloadHash = await sha256(rawBody);
    if (!eventId || !eventType || !eventObject?.id) {
      return json(400, { message: "Invalid Stripe webhook payload." });
    }

    if (eventType === "refund.updated" || eventType === "refund.failed" || eventType === "refund.created") {
      const providerRefundId = String(eventObject.id);
      const refundId = String(eventObject?.metadata?.beboss_refund_id ?? "");
      if (!refundId || !/^[0-9a-f-]{36}$/i.test(refundId)) {
        return json(400, { message: "Stripe refund metadata is missing." });
      }
      const refund = await loadRefund(refundId);
      if (!refund) return json(404, { message: "BeBoss refund record not found." });
      const paymentRequest = await loadPaymentRequest(String(refund.payment_request_id));
      if (!paymentRequest) return json(404, { message: "Original payment record not found." });
      const priorState = await recordEvent("STRIPE_CHECKOUT", eventId, payloadHash, String(refund.payment_request_id));
      if (priorState === "VERIFIED") return json(200, { received: true, duplicate: true });

      const amount = Number(eventObject.amount);
      const currency = String(eventObject.currency ?? "").toUpperCase();
      const paymentIntent = String(eventObject.payment_intent ?? "");
      if (
        amount !== Number(refund.amount_rwf) ||
        currency !== "RWF" ||
        paymentIntent !== String(paymentRequest.gateway_payment_intent_id)
      ) {
        await updateEvent("STRIPE_CHECKOUT", eventId, String(refund.payment_request_id), "IGNORED", "REFUND_DETAILS_MISMATCH");
        return json(200, { received: true, verified: false });
      }

      await saveRefundProviderResult(refundId, providerRefundId);
      const finalized = await finalizeRefund(refundId, String(eventObject.status ?? "pending"), providerRefundId);
      await updateEvent("STRIPE_CHECKOUT", eventId, String(refund.payment_request_id), "VERIFIED");
      return json(200, {
        received: true,
        refundProcessed: true,
        refundStatus: String(finalized?.refund_status ?? "PENDING"),
      });
    }

    const sessionFromEvent = eventObject;
    const sessionId = String(sessionFromEvent.id ?? "").trim();
    const requestId = String(sessionFromEvent.metadata?.payment_request_id ?? sessionFromEvent.client_reference_id ?? "").trim();
    if (!sessionId || !requestId || sessionFromEvent.object !== "checkout.session") {
      return json(400, { message: "Invalid Stripe Checkout webhook payload." });
    }

    const paymentRequest = await loadPaymentRequest(requestId);
    if (!paymentRequest) {
      console.warn("[stripe-payment-webhook] Payment request not found:", requestId);
      return json(404, { message: "Payment request not found." });
    }

    const priorState = await recordEvent("STRIPE_CHECKOUT", eventId, payloadHash, requestId);
    if (priorState === "VERIFIED") return json(200, { received: true, duplicate: true });
    if (Number(paymentRequest.gateway_verified_at) > 0) {
      await updateEvent("STRIPE_CHECKOUT", eventId, requestId, "VERIFIED");
      return json(200, { received: true, alreadyVerified: true });
    }

    if (eventType === "checkout.session.expired") {
      await markGatewayStatus(requestId, "EXPIRED");
      await updateEvent("STRIPE_CHECKOUT", eventId, requestId, "IGNORED", "CHECKOUT_EXPIRED");
      return json(200, { received: true, verified: false });
    }
    if (eventType === "checkout.session.async_payment_failed") {
      await markGatewayStatus(requestId, "FAILED");
      await updateEvent("STRIPE_CHECKOUT", eventId, requestId, "IGNORED", "ASYNC_PAYMENT_FAILED");
      return json(200, { received: true, verified: false });
    }
    if (eventType !== "checkout.session.completed" && eventType !== "checkout.session.async_payment_succeeded") {
      await updateEvent("STRIPE_CHECKOUT", eventId, requestId, "IGNORED", "UNHANDLED_EVENT_TYPE");
      return json(200, { received: true, ignored: true });
    }

    const session = await retrieveStripeSession(sessionId);
    const reference = String(session.metadata?.tx_ref ?? "");
    const metadataRequestId = String(session.metadata?.payment_request_id ?? "");
    const currency = String(session.currency ?? "").toUpperCase();
    const amount = Number(session.amount_total);
    const paid = String(session.payment_status ?? "").toLowerCase() === "paid";
    const complete = String(session.status ?? "").toLowerCase() === "complete";
    const paymentIntent = typeof session.payment_intent === "string"
      ? session.payment_intent
      : String(session.payment_intent?.id ?? "");

    if (
      !paid ||
      !complete ||
      reference !== String(paymentRequest.gateway_reference) ||
      metadataRequestId !== requestId ||
      String(session.client_reference_id ?? "") !== requestId ||
      currency !== "RWF" ||
      !Number.isSafeInteger(amount) ||
      amount !== Number(paymentRequest.amount_rwf)
    ) {
      await markGatewayStatus(requestId, "FAILED");
      await updateEvent("STRIPE_CHECKOUT", eventId, requestId, "IGNORED", "SESSION_DETAILS_MISMATCH");
      return json(200, { received: true, verified: false });
    }

    const updateQuery = new URLSearchParams({ id: `eq.${requestId}`, gateway_verified_at: "eq.0" });
    const updateResponse = await adminRest(`payment_requests?${updateQuery.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        gateway_status: "VERIFIED",
        gateway_transaction_id: sessionId,
        gateway_payment_intent_id: paymentIntent,
        gateway_verified_at: Date.now(),
        gateway_verified_amount_rwf: amount,
        gateway_verified_currency: currency,
        updated_at: Date.now(),
      }),
    });
    if (!updateResponse.ok) throw new Error("PAYMENT_VERIFICATION_WRITE_FAILED");
    await updateEvent("STRIPE_CHECKOUT", eventId, requestId, "VERIFIED");
    return json(200, { received: true, verified: true });
  } catch (error) {
    console.error("[stripe-payment-webhook]", error instanceof Error ? error.message : "Unknown error");
    return json(500, { message: "Webhook processing failed. Provider may retry this event." });
  }
});
