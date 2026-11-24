const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function adminUser(request: Request): Promise<{ id: string; email: string }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error("Refund service is not configured.");
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("A signed-in master administrator is required.");
  const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: ANON_KEY, Authorization: auth },
  });
  if (!userResponse.ok) throw new Error("Your administrator session is invalid or expired.");
  const user = await userResponse.json();
  if (!user?.id) throw new Error("Your administrator session is invalid.");
  const roleResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/is_beboss_admin", {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: auth,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const allowed = roleResponse.ok ? await roleResponse.json() : false;
  if (allowed !== true) throw new Error("Master administrator permission is required to refund payments.");
  return { id: String(user.id), email: String(user.email ?? "admin") };
}

async function db(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", SERVICE_ROLE_KEY);
  headers.set("Authorization", "Bearer " + SERVICE_ROLE_KEY);
  headers.set("content-type", "application/json");
  const result = await fetch(SUPABASE_URL + "/rest/v1/" + path, { ...init, headers });
  const body = await result.text();
  if (!result.ok) throw new Error("Refund database request failed (" + result.status + "): " + body.slice(0, 300));
  return body ? JSON.parse(body) : null;
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

function refundState(provider: string, status: unknown): "PENDING" | "SUCCEEDED" | "FAILED" {
  const value = String(status ?? "").toLowerCase();
  if (provider === "FLUTTERWAVE") {
    if (["completed-bank-transfer", "completed-momo", "completed-mpgs", "completed-offline", "completed-preauth", "succeeded", "successful"].includes(value)) return "SUCCEEDED";
    if (["failed", "rejected", "cancelled", "canceled"].includes(value)) return "FAILED";
    return "PENDING";
  }
  if (value === "succeeded") return "SUCCEEDED";
  if (["failed", "canceled", "cancelled"].includes(value)) return "FAILED";
  return "PENDING";
}

async function finalize(refundId: string, state: string, providerRefundId: string, providerStatus: string) {
  const result = await db("rpc/finalize_payment_gateway_refund", {
    method: "POST",
    body: JSON.stringify({
      p_refund_id: refundId,
      p_status: state,
      p_provider_refund_id: providerRefundId,
      p_provider_status: providerStatus,
    }),
  });
  return Array.isArray(result) ? result[0] : result;
}

async function refreshProviderRefund(provider: string, providerRefundId: string) {
  if (provider === "FLUTTERWAVE") {
    const key = Deno.env.get("FLW_SECRET_KEY") ?? "";
    if (!key) throw new Error("Flutterwave refund reconciliation is not configured.");
    const result = await fetch("https://api.flutterwave.com/v3/refunds/" + encodeURIComponent(providerRefundId), {
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
    });
    const body = await result.json();
    if (!result.ok) throw new Error(String(body?.message ?? "Flutterwave refund status could not be retrieved."));
    return { id: String(body?.id ?? providerRefundId), status: String(body?.status ?? "") };
  }
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("Stripe refund reconciliation is not configured.");
  const result = await fetch("https://api.stripe.com/v1/refunds/" + encodeURIComponent(providerRefundId), {
    headers: { Authorization: "Bearer " + key },
  });
  const body = await result.json();
  if (!result.ok) throw new Error(String(body?.error?.message ?? "Stripe refund status could not be retrieved."));
  return { id: String(body?.id ?? providerRefundId), status: String(body?.status ?? "") };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response(405, { message: "Method not allowed." });
  try {
    const admin = await adminUser(request);
    const input = await request.json();
    const action = String(input?.action ?? "REQUEST").toUpperCase();

    if (action === "RECONCILE") {
      const refundId = String(input?.refundId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(refundId)) return response(400, { message: "A valid refund ID is required." });
      const query = new URLSearchParams({
        select: "id,payment_request_id,provider,provider_refund_id,status",
        id: "eq." + refundId,
        limit: "1",
      });
      const rows = await db("payment_gateway_refunds?" + query.toString());
      const row = rows?.[0];
      if (!row) return response(404, { message: "Refund record not found." });
      if (row.status === "SUCCEEDED" || row.status === "FAILED") {
        return response(200, { ok: true, refund: row, alreadyFinal: true });
      }
      if (!row.provider_refund_id) {
        return response(409, { message: "The provider has not returned a refund ID. This request remains reserved for manual reconciliation; do not submit a duplicate refund." });
      }
      const remote = await refreshProviderRefund(row.provider, row.provider_refund_id);
      const state = refundState(row.provider, remote.status);
      const finalized = await finalize(refundId, state, remote.id, remote.status);
      return response(200, { ok: true, refund: finalized });
    }

    if (action !== "REQUEST") return response(400, { message: "Unsupported refund action." });
    const requestId = String(input?.requestId ?? "").trim();
    const amount = Number(input?.amountRwf);
    const reason = String(input?.reason ?? "").trim();
    const idempotencyKey = String(input?.idempotencyKey ?? "").trim();
    if (requestId.length < 3 || requestId.length > 200 ||
        !Number.isSafeInteger(amount) || amount <= 0 ||
        reason.length < 5 || reason.length > 500 ||
        idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      return response(400, { message: "Enter a valid payment, whole-RWF refund amount, reason and idempotency key." });
    }

    const idempotencyHash = await sha256("BEBOSS-REFUND-V1\n" + requestId + "\n" + amount + "\n" + reason + "\n" + idempotencyKey);
    const reservationRaw = await db("rpc/reserve_payment_gateway_refund", {
      method: "POST",
      body: JSON.stringify({
        p_payment_request_id: requestId,
        p_amount_rwf: amount,
        p_reason: reason,
        p_idempotency_hash: idempotencyHash,
        p_requested_by: admin.id,
      }),
    });
    const reservation = Array.isArray(reservationRaw) ? reservationRaw[0] : reservationRaw;
    if (!reservation?.refund_id) throw new Error("The refund reservation was not created.");
    if (reservation.existing) {
      return response(200, {
        ok: true,
        refund: reservation,
        message: "This refund request was already recorded. The provider will not be charged twice by a retry.",
      });
    }

    let providerRefundId = "";
    let providerStatus = "";
    let state: "PENDING" | "SUCCEEDED" | "FAILED" = "PENDING";
    try {
      if (reservation.provider === "FLUTTERWAVE") {
        const key = Deno.env.get("FLW_SECRET_KEY") ?? "";
        if (!key) {
          await finalize(reservation.refund_id, "FAILED", "", "not_configured");
          return response(503, { message: "Flutterwave refunds are not configured. Add the merchant secret key in Supabase Edge Function secrets." });
        }
        const initiated = await fetch("https://api.flutterwave.com/v3/transactions/" + encodeURIComponent(reservation.provider_transaction_id) + "/refund", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ amount, comments: reason }),
        });
        const body = await initiated.json();
        if (!initiated.ok || body?.status !== "success" || !body?.data?.id) {
          state = "FAILED";
          providerStatus = String(body?.status ?? body?.message ?? "initiation_failed");
          const finalized = await finalize(reservation.refund_id, state, "", providerStatus);
          return response(502, { message: String(body?.message ?? "Flutterwave could not initiate the refund."), refund: finalized });
        }
        providerRefundId = String(body.data.id);
        providerStatus = String(body.data.status ?? "pending");
        state = refundState("FLUTTERWAVE", providerStatus);
        try {
          const remote = await refreshProviderRefund("FLUTTERWAVE", providerRefundId);
          providerStatus = remote.status;
          state = refundState("FLUTTERWAVE", remote.status);
        } catch (refreshError) {
          console.warn("[payment refund] Flutterwave status check deferred", refreshError);
        }
      } else if (reservation.provider === "STRIPE") {
        const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
        if (!key) {
          await finalize(reservation.refund_id, "FAILED", "", "not_configured");
          return response(503, { message: "Stripe refunds are not configured. Add the merchant secret key in Supabase Edge Function secrets." });
        }
        const form = new URLSearchParams({
          payment_intent: reservation.provider_transaction_id,
          amount: String(amount),
          reason: "requested_by_customer",
          "metadata[payment_request_id]": requestId,
          "metadata[beboss_refund_id]": reservation.refund_id,
        });
        const initiated = await fetch("https://api.stripe.com/v1/refunds", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": "beboss-refund-" + idempotencyHash,
          },
          body: form,
        });
        const body = await initiated.json();
        if (!initiated.ok || !body?.id) {
          state = "FAILED";
          providerStatus = String(body?.error?.message ?? "initiation_failed");
          const finalized = await finalize(reservation.refund_id, state, "", providerStatus);
          return response(502, { message: String(body?.error?.message ?? "Stripe could not initiate the refund."), refund: finalized });
        }
        providerRefundId = String(body.id);
        providerStatus = String(body.status ?? "pending");
        state = refundState("STRIPE", providerStatus);
      } else {
        await finalize(reservation.refund_id, "FAILED", "", "unsupported_provider");
        return response(400, { message: "The payment provider is not supported for refunds." });
      }
    } catch (error) {
      // Network failures may happen after the provider accepted the refund.
      // Keep the reservation pending to prevent accidental duplicate submissions.
      console.error("[payment refund] provider result is uncertain", error);
      return response(202, {
        ok: true,
        pending: true,
        refundId: reservation.refund_id,
        message: "The provider response is uncertain. This refund is reserved and must be reconciled; do not submit it again.",
      });
    }

    const finalized = await finalize(reservation.refund_id, state, providerRefundId, providerStatus);
    await db("admin_audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        admin_email: admin.email,
        action: "GATEWAY_REFUND_" + state,
        target_id: requestId,
        details: "Refund " + reservation.refund_id + ": " + amount + " RWF; provider " + reservation.provider + "; status " + providerStatus + ".",
        created_at: Date.now(),
      }),
    });
    return response(state === "PENDING" ? 202 : 200, { ok: true, refund: finalized });
  } catch (error) {
    console.error("[manage-payment-refund]", error);
    const message = error instanceof Error ? error.message : "Refund processing failed.";
    return response(message.toLowerCase().includes("administrator") ? 403 : 400, { message });
  }
});
