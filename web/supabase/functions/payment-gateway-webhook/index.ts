import {
  constantTimeTextEqual,
  hmacSha256Hex,
  jsonResponse,
  restInsert,
  restPatch,
  restRequest,
  restRows,
} from "../_shared/payment-gateway.ts";

type GatewayRow = {
  payment_request_id: string;
  provider: "FLUTTERWAVE" | "STRIPE";
  provider_reference: string;
  provider_checkout_id: string | null;
  amount_rwf: number;
  currency: string;
  status: string;
};

async function findGatewayRow(filters: URLSearchParams): Promise<GatewayRow | null> {
  const rows = await restRows<GatewayRow>(`payment_gateway_transactions?select=payment_request_id,provider,provider_reference,provider_checkout_id,amount_rwf,currency,status&${filters.toString()}`);
  return rows[0] ?? null;
}

async function recordVerifiedPayment(
  row: GatewayRow,
  transactionId: string,
  eventId: string,
  eventType: string,
  payloadDigest: string,
) {
  const now = Date.now();
  const ledgerFilter = new URLSearchParams({
    payment_request_id: `eq.${row.payment_request_id}`,
    provider_reference: `eq.${row.provider_reference}`,
  });
  await restPatch(`payment_gateway_transactions?${ledgerFilter.toString()}`, {
    provider_transaction_id: transactionId,
    status: "VERIFIED",
    provider_event_id: eventId,
    verified_at: now,
    updated_at: now,
  });

  const requestFilter = new URLSearchParams({ id: `eq.${row.payment_request_id}` });
  await restPatch(`payment_requests?${requestFilter.toString()}`, {
    gateway_provider: row.provider,
    gateway_reference: row.provider_reference,
    gateway_transaction_id: transactionId,
    gateway_amount_rwf: row.amount_rwf,
    gateway_currency: row.currency,
    gateway_verified_at: now,
    updated_at: now,
  });

  try {
    await restInsert("payment_gateway_events", {
      provider: row.provider,
      event_id: eventId,
      payment_request_id: row.payment_request_id,
      event_type: eventType.slice(0, 120),
      payload_sha256: payloadDigest,
      received_at: now,
    });
  } catch (error) {
    // A duplicate provider delivery is expected. The ledger and request updates above are idempotent.
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("23505") && !message.includes("duplicate key")) throw error;
  }
}

async function verifyFlutterwave(rawBody: string, request: Request) {
  const secretHash = Deno.env.get("FLW_WEBHOOK_SECRET_HASH") ?? "";
  const signature = request.headers.get("verif-hash") ?? "";
  // Flutterwave's current webhook contract sends the configured secret hash
  // verbatim in the verif-hash header; it is not a body HMAC.
  if (!secretHash || !signature || !constantTimeTextEqual(signature, secretHash)) {
    return jsonResponse(401, { message: "Invalid Flutterwave webhook signature." });
  }

  const event = JSON.parse(rawBody);
  const transactionId = String(event?.data?.id ?? event?.data?.transaction_id ?? "");
  const txRef = String(event?.data?.tx_ref ?? event?.data?.reference ?? "");
  const eventId = String(event?.id ?? event?.data?.id ?? event?.data?.flw_ref ?? txRef);
  const eventType = String(event?.type ?? event?.event ?? "charge.completed");
  if (!eventId || !transactionId || !txRef) return jsonResponse(400, { message: "Invalid Flutterwave event payload." });

  const filters = new URLSearchParams({
    provider: "eq.FLUTTERWAVE",
    provider_reference: `eq.${txRef}`,
    limit: "1",
  });
  const row = await findGatewayRow(filters);
  if (!row) return jsonResponse(200, { received: true });
  if (row.currency !== "RWF" || Number(row.amount_rwf) < 1) return jsonResponse(409, { message: "The payment ledger has invalid currency or amount data." });

  const key = Deno.env.get("FLW_SECRET_KEY") ?? "";
  if (!key) return jsonResponse(503, { message: "Flutterwave transaction verification is not configured." });
  const providerResponse = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  const verified = await providerResponse.json();
  const transaction = verified?.data;
  if (!providerResponse.ok || verified?.status !== "success") {
    throw new Error("Flutterwave could not verify the webhook transaction.");
  }

  if (String(transaction?.tx_ref ?? "") !== row.provider_reference ||
      String(transaction?.status ?? "").toLowerCase() !== "successful" ||
      String(transaction?.currency ?? "").toUpperCase() !== "RWF" ||
      Number(transaction?.amount) !== Number(row.amount_rwf)) {
    return jsonResponse(409, { message: "Flutterwave transaction does not match this BeBoss payment request." });
  }

  const digest = await hmacSha256Hex(secretHash, rawBody);
  await recordVerifiedPayment(row, transactionId, eventId, eventType, digest);
  return jsonResponse(200, { received: true, verified: true });
}

function parseStripeSignature(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (!Number.isSafeInteger(timestamp) || !signatures.length) return null;
  return { timestamp, signatures };
}

async function verifyStripe(rawBody: string, request: Request) {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const parsed = parseStripeSignature(request.headers.get("stripe-signature") ?? "");
  if (!secret || !key || !parsed) return jsonResponse(401, { message: "Invalid Stripe webhook signature." });
  if (Math.abs(Date.now() / 1000 - parsed.timestamp) > 300) {
    return jsonResponse(401, { message: "The Stripe webhook timestamp is outside the accepted tolerance." });
  }
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`);
  if (!parsed.signatures.some((signature) => constantTimeTextEqual(signature, expected))) {
    return jsonResponse(401, { message: "Invalid Stripe webhook signature." });
  }

  const event = JSON.parse(rawBody);
  const eventType = String(event?.type ?? "");
  const eventId = String(event?.id ?? "");
  if (!eventId) return jsonResponse(400, { message: "Invalid Stripe event payload." });
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(eventType)) {
    return jsonResponse(200, { received: true });
  }
  const session = event?.data?.object;
  const sessionId = String(session?.id ?? "");
  const requestId = String(session?.metadata?.payment_request_id ?? session?.client_reference_id ?? "");
  const txRef = String(session?.metadata?.gateway_reference ?? "");
  if (!sessionId || !requestId || !txRef) return jsonResponse(400, { message: "Stripe Checkout Session metadata is incomplete." });

  const filters = new URLSearchParams({
    provider: "eq.STRIPE",
    provider_reference: `eq.${txRef}`,
    payment_request_id: `eq.${requestId}`,
    provider_checkout_id: `eq.${sessionId}`,
    limit: "1",
  });
  const row = await findGatewayRow(filters);
  if (!row) return jsonResponse(200, { received: true });
  if (row.currency !== "RWF") return jsonResponse(409, { message: "The payment ledger currency is invalid." });

  // Never fulfill from the webhook payload alone. Fetch the current Checkout Session
  // from Stripe and compare its paid state, amount, currency and server-generated metadata.
  const providerResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const verified = await providerResponse.json();
  if (!providerResponse.ok) throw new Error("Stripe could not verify the Checkout Session.");
  if (String(verified?.id ?? "") !== sessionId ||
      String(verified?.status ?? "") !== "complete" ||
      String(verified?.payment_status ?? "") !== "paid" ||
      String(verified?.currency ?? "").toLowerCase() !== "rwf" ||
      Number(verified?.amount_total) !== Number(row.amount_rwf) ||
      String(verified?.metadata?.payment_request_id ?? "") !== row.payment_request_id ||
      String(verified?.metadata?.gateway_reference ?? "") !== row.provider_reference ||
      String(verified?.client_reference_id ?? "") !== row.payment_request_id) {
    return jsonResponse(409, { message: "Stripe payment does not match this BeBoss payment request." });
  }

  const transactionId = String(verified?.payment_intent ?? sessionId);
  const digest = await hmacSha256Hex(secret, rawBody);
  await recordVerifiedPayment(row, transactionId, eventId, eventType, digest);
  return jsonResponse(200, { received: true, verified: true });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return jsonResponse(405, { message: "Method not allowed." });
  try {
    const rawBody = await request.text();
    if (request.headers.has("verif-hash")) return await verifyFlutterwave(rawBody, request);
    if (request.headers.has("stripe-signature")) return await verifyStripe(rawBody, request);
    return jsonResponse(401, { message: "Unsupported payment webhook signature." });
  } catch (error) {
    console.error("[payment-gateway-webhook]", error);
    return jsonResponse(500, { message: "Payment event processing failed. The provider may retry this event." });
  }
});
