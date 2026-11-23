const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const flutterwaveSecretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

type Provider = "FLUTTERWAVE_RW_MOBILE_MONEY" | "STRIPE_CHECKOUT";
type RefundAction = "request" | "refresh";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function required(value: string, code: string): string {
  if (!value.trim()) throw new Error(code);
  return value.trim();
}

async function adminRest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = required(supabaseUrl, "SUPABASE_URL_MISSING");
  const key = required(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY_MISSING");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers });
}

async function adminRpc(name: string, body: Record<string, unknown>): Promise<any> {
  const response = await adminRest(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = String(result?.message ?? result?.hint ?? "Database operation failed.");
    throw new Error(message);
  }
  return result;
}

async function authenticateAdmin(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
  const token = authorization.slice(7);
  if (token.split(".").length !== 3) throw new Error("AUTH_REQUIRED");

  const url = required(supabaseUrl, "SUPABASE_URL_MISSING");
  const key = required(publishableKey, "SUPABASE_PUBLISHABLE_KEY_MISSING");
  const authResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  const user = await authResponse.json().catch(() => null);
  if (!authResponse.ok || !user?.id) throw new Error("AUTH_REQUIRED");

  const roleResponse = await fetch(`${url}/rest/v1/rpc/is_beboss_admin`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!roleResponse.ok || await roleResponse.json().catch(() => false) !== true) {
    throw new Error("ADMIN_REQUIRED");
  }
  return String(user.id);
}

async function loadPaymentRequest(paymentRequestId: string) {
  const query = new URLSearchParams({
    select: "id,amount_rwf,gateway_provider,gateway_status,gateway_verified_at,gateway_verified_amount_rwf,gateway_verified_currency,gateway_transaction_id,gateway_payment_intent_id,gateway_refunded_amount_rwf,gateway_refund_status",
    id: `eq.${paymentRequestId}`,
    limit: "1",
  });
  const response = await adminRest(`payment_requests?${query.toString()}`);
  if (!response.ok) throw new Error("PAYMENT_LOOKUP_FAILED");
  const rows = await response.json();
  return rows?.[0] ?? null;
}

async function loadRefund(refundId: string) {
  const query = new URLSearchParams({
    select: "id,payment_request_id,provider,idempotency_hash,provider_refund_id,amount_rwf,reason,status,requested_by",
    id: `eq.${refundId}`,
    limit: "1",
  });
  const response = await adminRest(`payment_gateway_refunds?${query.toString()}`);
  if (!response.ok) throw new Error("REFUND_LOOKUP_FAILED");
  const rows = await response.json();
  return rows?.[0] ?? null;
}

async function saveRefundProviderResult(refundId: string, providerRefundId: string, state: string) {
  const response = await adminRest(`payment_gateway_refunds?id=eq.${encodeURIComponent(refundId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      provider_refund_id: providerRefundId,
      status: state,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error("REFUND_STATE_UPDATE_FAILED");
}

async function finalizeRefund(refundId: string, providerStatus: string, providerRefundId: string) {
  const result = await adminRpc("finalize_gateway_refund", {
    p_refund_id: refundId,
    p_provider_status: providerStatus,
    p_provider_refund_id: providerRefundId,
  });
  return Array.isArray(result) ? result[0] : result;
}

async function callFlutterwaveRefund(
  transactionId: string,
  amount: number,
  refundId: string,
  reason: string,
): Promise<{ id: string; status: string }> {
  const secret = required(flutterwaveSecretKey, "FLUTTERWAVE_SECRET_KEY_MISSING");
  const callbackUrl = `${required(supabaseUrl, "SUPABASE_URL_MISSING")}/functions/v1/flutterwave-refund-webhook`;
  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/refund`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        comments: `BeBoss refund ${refundId}: ${reason.slice(0, 250)}`,
        callbackurl: callbackUrl,
      }),
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== "success" || !result?.data?.id) {
    console.error("[manage-gateway-refund] Flutterwave refund request failed", response.status, result?.message);
    throw new Error("FLUTTERWAVE_REFUND_FAILED");
  }
  return { id: String(result.data.id), status: String(result.data.status ?? "processing") };
}

async function callStripeRefund(
  paymentIntentId: string,
  amount: number,
  refundId: string,
  idempotencyHash: string,
  reason: string,
): Promise<{ id: string; status: string }> {
  const secret = required(stripeSecretKey, "STRIPE_SECRET_KEY_MISSING");
  const body = new URLSearchParams();
  body.set("payment_intent", paymentIntentId);
  body.set("amount", String(amount));
  body.set("reason", "requested_by_customer");
  body.set("metadata[beboss_refund_id]", refundId);
  body.set("metadata[beboss_reason]", reason.slice(0, 400));

  const response = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyHash,
    },
    body,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.id || !result?.status) {
    console.error("[manage-gateway-refund] Stripe refund request failed", response.status, result?.error?.code);
    throw new Error("STRIPE_REFUND_FAILED");
  }
  return { id: String(result.id), status: String(result.status) };
}

async function getFlutterwaveRefund(refund: any, payment: any): Promise<{ id: string; status: string } | null> {
  const secret = required(flutterwaveSecretKey, "FLUTTERWAVE_SECRET_KEY_MISSING");
  let refundId = String(refund.provider_refund_id ?? "");
  if (refundId) {
    const response = await fetch(`https://api.flutterwave.com/v3/refunds/${encodeURIComponent(refundId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.id) throw new Error("FLUTTERWAVE_REFUND_STATUS_FAILED");
    return { id: String(result.id), status: String(result.status ?? "processing") };
  }

  // A request may time out after Flutterwave created the refund but before BeBoss
  // received the refund ID. Search the original transaction before ever retrying.
  const query = new URLSearchParams({
    currency: "RWF",
    id: String(payment.gateway_transaction_id),
    from: new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  const listResponse = await fetch(`https://api.flutterwave.com/v3/refunds?${query.toString()}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const list = await listResponse.json().catch(() => null);
  if (!listResponse.ok || !Array.isArray(list?.data)) throw new Error("FLUTTERWAVE_REFUND_STATUS_FAILED");
  const commentNeedle = `BeBoss refund ${refund.id}:`;
  const match = list.data.find((item: any) => String(item?.comment ?? "").includes(commentNeedle));
  if (!match?.id) return null;

  const detailResponse = await fetch(`https://api.flutterwave.com/v3/refunds/${encodeURIComponent(String(match.id))}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const detail = await detailResponse.json().catch(() => null);
  if (!detailResponse.ok || !detail?.id) throw new Error("FLUTTERWAVE_REFUND_STATUS_FAILED");
  return { id: String(detail.id), status: String(detail.status ?? match.status ?? "processing") };
}

async function getStripeRefund(refund: any, payment: any): Promise<{ id: string; status: string } | null> {
  const secret = required(stripeSecretKey, "STRIPE_SECRET_KEY_MISSING");
  const providerRefundId = String(refund.provider_refund_id ?? "");
  if (providerRefundId) {
    const response = await fetch(`https://api.stripe.com/v1/refunds/${encodeURIComponent(providerRefundId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.id) throw new Error("STRIPE_REFUND_STATUS_FAILED");
    return { id: String(result.id), status: String(result.status ?? "pending") };
  }

  const query = new URLSearchParams({ payment_intent: String(payment.gateway_payment_intent_id), limit: "100" });
  const response = await fetch(`https://api.stripe.com/v1/refunds?${query.toString()}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result?.data)) throw new Error("STRIPE_REFUND_STATUS_FAILED");
  const match = result.data.find((item: any) => item?.metadata?.beboss_refund_id === refund.id);
  return match?.id ? { id: String(match.id), status: String(match.status ?? "pending") } : null;
}

async function refreshRefund(refund: any, payment: any) {
  const providerResult = refund.provider === "FLUTTERWAVE_RW_MOBILE_MONEY"
    ? await getFlutterwaveRefund(refund, payment)
    : await getStripeRefund(refund, payment);
  if (!providerResult) {
    return {
      refundId: refund.id,
      status: refund.status,
      providerRefundId: refund.provider_refund_id || "",
      message: "The provider has not returned a refund record yet. BeBoss has not retried the financial operation.",
    };
  }
  await saveRefundProviderResult(refund.id, providerResult.id, "PENDING");
  const finalized = await finalizeRefund(refund.id, providerResult.status, providerResult.id);
  return {
    refundId: refund.id,
    status: String(finalized?.refund_status ?? "PENDING"),
    providerRefundId: providerResult.id,
    gatewayRefundStatus: String(finalized?.gateway_refund_status ?? "PENDING"),
    gatewayRefundedAmountRwf: Number(finalized?.gateway_refunded_amount_rwf ?? 0),
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { message: "Method not allowed." });
  try {
    const adminId = await authenticateAdmin(request);
    const body = await request.json().catch(() => null);
    const action = String(body?.action ?? "") as RefundAction;

    if (action === "refresh") {
      const refundId = String(body?.refundId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(refundId)) return json(400, { message: "Invalid refund ID." });
      const refund = await loadRefund(refundId);
      if (!refund) return json(404, { message: "Refund record not found." });
      const payment = await loadPaymentRequest(String(refund.payment_request_id));
      if (!payment) return json(404, { message: "Original payment record not found." });
      const refreshed = await refreshRefund(refund, payment);
      return json(200, { ok: true, ...refreshed });
    }

    if (action !== "request") return json(400, { message: "Choose a refund action." });
    const paymentRequestId = String(body?.paymentRequestId ?? "");
    const amountRwf = Number(body?.amountRwf);
    const reason = String(body?.reason ?? "").trim();
    const idempotencyKey = String(body?.idempotencyKey ?? "");
    if (
      !paymentRequestId ||
      !Number.isSafeInteger(amountRwf) || amountRwf <= 0 ||
      reason.length < 5 || reason.length > 500 ||
      !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
    ) {
      return json(400, { message: "Check the payment, refund amount, reason and idempotency key." });
    }

    const payment = await loadPaymentRequest(paymentRequestId);
    if (!payment) return json(404, { message: "Payment record not found." });
    if (
      payment.gateway_status !== "VERIFIED" ||
      Number(payment.gateway_verified_at) <= 0 ||
      String(payment.gateway_verified_currency).toUpperCase() !== "RWF" ||
      Number(payment.gateway_verified_amount_rwf) !== Number(payment.amount_rwf)
    ) {
      return json(409, { message: "Only an independently verified RWF gateway payment can be refunded." });
    }

    const idempotencyHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${paymentRequestId}\n${amountRwf}\n${reason}\n${adminId}\n${idempotencyKey}`),
    ).then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""));

    const reserved = await adminRpc("reserve_gateway_refund", {
      p_payment_request_id: paymentRequestId,
      p_amount_rwf: amountRwf,
      p_reason: reason,
      p_idempotency_hash: idempotencyHash,
      p_requested_by: adminId,
    });
    const row = Array.isArray(reserved) ? reserved[0] : reserved;
    if (!row?.refund_id) throw new Error("REFUND_RESERVATION_FAILED");
    if (row.existing === true || row.state !== "REQUESTED") {
      const prior = await loadRefund(String(row.refund_id));
      if (!prior) throw new Error("REFUND_RESERVATION_LOOKUP_FAILED");
      return json(200, {
        ok: true,
        refundId: prior.id,
        status: prior.status,
        providerRefundId: prior.provider_refund_id || "",
        reused: true,
      });
    }

    try {
      const created = row.provider === "FLUTTERWAVE_RW_MOBILE_MONEY"
        ? await callFlutterwaveRefund(String(row.provider_transaction_id), amountRwf, String(row.refund_id), reason)
        : await callStripeRefund(String(row.provider_payment_intent_id), amountRwf, String(row.refund_id), idempotencyHash, reason);
      await saveRefundProviderResult(String(row.refund_id), created.id, "PENDING");
      const finalized = await finalizeRefund(String(row.refund_id), created.status, created.id);
      return json(200, {
        ok: true,
        refundId: String(row.refund_id),
        providerRefundId: created.id,
        status: String(finalized?.refund_status ?? "PENDING"),
        gatewayRefundStatus: String(finalized?.gateway_refund_status ?? "PENDING"),
        gatewayRefundedAmountRwf: Number(finalized?.gateway_refunded_amount_rwf ?? 0),
        reused: false,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "PROVIDER_REFUND_UNCERTAIN";
      console.error("[manage-gateway-refund] Refund initiation/status check failed", code);
      // Never blindly retry an uncertain provider refund. Keep the reserved
      // operation pending; the admin must refresh provider status first.
      return json(202, {
        ok: true,
        refundId: String(row.refund_id),
        status: "REQUESTED",
        message: "Refund request is reserved. Its provider response is uncertain; refresh status before starting another refund.",
      });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    console.error("[manage-gateway-refund]", code);
    const messages: Record<string, string> = {
      AUTH_REQUIRED: "Sign in to the BeBoss administrator account.",
      ADMIN_REQUIRED: "Only a BeBoss master administrator can initiate or reconcile a gateway refund.",
      SUPABASE_URL_MISSING: "Supabase is not configured.",
      SUPABASE_PUBLISHABLE_KEY_MISSING: "Supabase authentication is not configured.",
      SUPABASE_SERVICE_ROLE_KEY_MISSING: "The secure payment service is not configured.",
      FLUTTERWAVE_SECRET_KEY_MISSING: "Flutterwave is not configured.",
      STRIPE_SECRET_KEY_MISSING: "Stripe is not configured.",
      PAYMENT_LOOKUP_FAILED: "Could not load the original payment.",
      REFUND_LOOKUP_FAILED: "Could not load the refund record.",
      REFUND_STATE_UPDATE_FAILED: "Could not update the provider refund record.",
      FLUTTERWAVE_REFUND_FAILED: "Flutterwave could not accept this refund request.",
      FLUTTERWAVE_REFUND_STATUS_FAILED: "Could not reconcile this refund with Flutterwave.",
      STRIPE_REFUND_FAILED: "Stripe could not accept this refund request.",
      STRIPE_REFUND_STATUS_FAILED: "Could not reconcile this refund with Stripe.",
    };
    const status = code === "AUTH_REQUIRED" ? 401 : code === "ADMIN_REQUIRED" ? 403 : 400;
    return json(status, { message: messages[code] ?? "Could not process the refund. Check the payment and retry safely." });
  }
});
