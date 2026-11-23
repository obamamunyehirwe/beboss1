import {
  expectedSubscriptionAmount,
  jsonResponse,
  normalizePhone,
  phoneE164,
  restInsert,
  restPatch,
  restRows,
  restRequest,
} from "../_shared/payment-gateway.ts";

type ShopRow = {
  id: string;
  shop_name: string;
  owner_username: string;
  owner_phone: string;
  device_challenge: string | null;
  remote_kill_switch: boolean;
};

function requiredText(value: unknown, label: string, min: number, max: number): string {
  const text = String(value ?? "").trim();
  if (text.length < min || text.length > max) throw new Error(`${label} is invalid.`);
  return text;
}

function safeUrl(value: unknown, allowedHost: string): string {
  const raw = String(value ?? "");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== allowedHost) {
    throw new Error("The payment provider returned an invalid checkout URL.");
  }
  return url.toString();
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return jsonResponse(405, { message: "Method not allowed." });

  let paymentRequestId = "";
  let txRef = "";
  try {
    const input = await request.json();
    const gateway = String(input?.gateway ?? "").toLowerCase();
    if (gateway !== "flutterwave" && gateway !== "stripe") {
      return jsonResponse(400, { message: "Select a supported online payment gateway." });
    }

    const username = requiredText(input?.username, "Registered shop username", 2, 80).toLowerCase();
    const ownerPhone = requiredText(input?.phone, "Registered owner phone", 9, 30);
    const payerPhone = phoneE164(input?.payerPhone);
    const payerName = requiredText(input?.payerName, "Payer name", 2, 120);
    const payerEmail = requiredText(input?.payerEmail, "Payer email", 5, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) throw new Error("Enter a valid payer email address.");
    const shopName = requiredText(input?.shopName, "Shop name", 2, 120);
    const months = Number(input?.months);
    const branches = Number(input?.branches);
    const workers = Number(input?.workers);
    const devices = Number(input?.devices);
    if (![1, 3, 6, 12].includes(months) ||
        !Number.isInteger(branches) || branches < 1 || branches > 100 ||
        !Number.isInteger(workers) || workers < 1 || workers > 500 ||
        !Number.isInteger(devices) || devices < 1 || devices > 100) {
      throw new Error("The selected subscription plan is invalid.");
    }

    const publicUrl = String(Deno.env.get("BEBOSS_PUBLIC_URL") ?? "").replace(/\/+$/, "");
    if (!publicUrl.startsWith("https://")) throw new Error("The public HTTPS site URL is not configured.");
    const usernameKey = `${username}_${normalizePhone(ownerPhone)}`;
    if (!normalizePhone(ownerPhone)) throw new Error("Enter the full phone number registered to this shop.");

    const shopParams = new URLSearchParams({
      select: "id,shop_name,owner_username,owner_phone,device_challenge,remote_kill_switch",
      id: `eq.${usernameKey}`,
      limit: "1",
    });
    const shops = await restRows<ShopRow>(`shop_accounts?${shopParams.toString()}`);
    const shop = shops[0];
    if (!shop ||
        String(shop.owner_username).trim().toLowerCase() !== username ||
        normalizePhone(shop.owner_phone) !== normalizePhone(ownerPhone)) {
      return jsonResponse(404, { message: "The registered BeBoss shop could not be verified." });
    }
    if (shop.remote_kill_switch) return jsonResponse(403, { message: "This shop cannot purchase a subscription while its service is suspended." });
    if (String(shop.shop_name).trim().toLowerCase() !== shopName.trim().toLowerCase()) {
      return jsonResponse(409, { message: "The submitted shop name does not match the registered BeBoss shop." });
    }

    const amountRwf = expectedSubscriptionAmount(branches, workers, months, devices);
    if (!Number.isSafeInteger(amountRwf) || amountRwf < 1) throw new Error("The calculated subscription price is invalid.");

    const flwKey = Deno.env.get("FLW_SECRET_KEY") ?? "";
    const flwWebhookSecret = Deno.env.get("FLW_WEBHOOK_SECRET_HASH") ?? "";
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
    if (gateway === "flutterwave" && (!flwKey || !flwWebhookSecret)) {
      return jsonResponse(503, { message: "Flutterwave is not enabled. Configure its live secret key and webhook signing hash before accepting payments." });
    }
    if (gateway === "stripe" && (!stripeKey || !stripeWebhookSecret)) {
      return jsonResponse(503, { message: "Stripe is not enabled. Configure its live secret key and webhook signing secret before accepting payments." });
    }

    if (gateway === "stripe") {
      const accountResponse = await fetch("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      const account = await accountResponse.json();
      if (!accountResponse.ok || account?.charges_enabled !== true || account?.details_submitted !== true || !account?.country) {
        return jsonResponse(503, { message: "The connected Stripe account is not eligible to accept live payments. Complete Stripe account verification and enable charges first." });
      }
    }

    const now = Date.now();
    paymentRequestId = `GW-${crypto.randomUUID()}`;
    txRef = `BEBOSS-${crypto.randomUUID().replaceAll("-", "")}`;
    await restInsert("payment_requests", {
      id: paymentRequestId,
      shop_name: shop.shop_name,
      owner_username: username,
      owner_phone: ownerPhone,
      device_challenge: shop.device_challenge ?? "",
      provider: gateway === "flutterwave" ? "Flutterwave" : "Stripe",
      ussd_code: "ONLINE_CHECKOUT",
      payer_phone: payerPhone,
      payer_full_name: payerName,
      amount_rwf: amountRwf,
      duration_months: months,
      branch_count: branches,
      worker_count: workers,
      device_count: devices,
      fee_per_device_rwf: 2_000,
      payment_time_ms: now,
      payment_note: "",
      status: "PENDING_VERIFICATION",
      source: "WEB",
      created_at: now,
      updated_at: now,
    });

    await restInsert("payment_gateway_transactions", {
      payment_request_id: paymentRequestId,
      provider: gateway.toUpperCase(),
      provider_reference: txRef,
      amount_rwf: amountRwf,
      currency: "RWF",
      status: "INITIATED",
      created_at: now,
      updated_at: now,
    });

    let checkoutUrl = "";
    let checkoutId = "";

    if (gateway === "flutterwave") {
      const response = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${flwKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          tx_ref: txRef,
          amount: amountRwf,
          currency: "RWF",
          redirect_url: `${publicUrl}/my-shop?gateway=flutterwave&reference=${encodeURIComponent(txRef)}`,
          customer: {
            email: payerEmail,
            name: payerName,
            phone_number: payerPhone,
          },
          payment_options: "card, mobilemoneyrwanda",
          customizations: { title: "BeBoss subscription", description: `BeBoss ${months}-month subscription for ${shop.shop_name}` },
          meta: { payment_request_id: paymentRequestId, gateway_reference: txRef, shop_id: shop.id },
        }),
      });
      const body = await response.json();
      if (!response.ok || body?.status !== "success") {
        throw new Error(String(body?.message ?? "Flutterwave could not create the hosted checkout."));
      }
      checkoutUrl = safeUrl(body?.data?.link, "checkout.flutterwave.com");
    } else {
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("success_url", `${publicUrl}/my-shop?gateway=stripe&payment=processing&session_id={CHECKOUT_SESSION_ID}`);
      form.set("cancel_url", `${publicUrl}/my-shop?gateway=stripe&payment=cancelled&reference=${encodeURIComponent(txRef)}`);
      form.set("client_reference_id", paymentRequestId);
      form.set("customer_email", payerEmail);
      form.set("payment_method_types[0]", "card");
      form.set("line_items[0][quantity]", "1");
      form.set("line_items[0][price_data][currency]", "rwf");
      form.set("line_items[0][price_data][unit_amount]", String(amountRwf));
      form.set("line_items[0][price_data][product_data][name]", `BeBoss ${months}-month subscription`);
      form.set("line_items[0][price_data][product_data][description]", `${branches} branches, ${workers} staff and ${devices} POS devices`);
      form.set("metadata[payment_request_id]", paymentRequestId);
      form.set("metadata[gateway_reference]", txRef);
      form.set("payment_intent_data[metadata][payment_request_id]", paymentRequestId);
      form.set("payment_intent_data[metadata][gateway_reference]", txRef);

      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(String(body?.error?.message ?? "Stripe could not create the hosted checkout."));
      checkoutId = String(body?.id ?? "");
      checkoutUrl = safeUrl(body?.url, "checkout.stripe.com");
      if (!checkoutId) throw new Error("Stripe returned no Checkout Session identifier.");
    }

    const ledgerQuery = new URLSearchParams({
      payment_request_id: `eq.${paymentRequestId}`,
      provider_reference: `eq.${txRef}`,
    });
    await restPatch(`payment_gateway_transactions?${ledgerQuery.toString()}`, {
      provider_checkout_id: checkoutId,
      checkout_url: checkoutUrl,
      status: "PENDING",
      updated_at: Date.now(),
    });

    return jsonResponse(200, {
      ok: true,
      paymentRequestId,
      provider: gateway.toUpperCase(),
      reference: txRef,
      amountRwf,
      currency: "RWF",
      checkoutUrl,
    });
  } catch (error) {
    console.error("[create-payment-checkout]", error);
    if (paymentRequestId) {
      try {
        const params = new URLSearchParams({ payment_request_id: `eq.${paymentRequestId}` });
        await restPatch(`payment_gateway_transactions?${params.toString()}`, {
          status: "FAILED",
          failure_reason: error instanceof Error ? error.message.slice(0, 300) : "Checkout initiation failed",
          updated_at: Date.now(),
        });
        const requestParams = new URLSearchParams({ id: `eq.${paymentRequestId}` });
        await restPatch(`payment_requests?${requestParams.toString()}`, {
          status: "REJECTED",
          rejection_reason: "Online checkout could not be initiated. Start a new payment attempt.",
          updated_at: Date.now(),
        });
      } catch (cleanupError) {
        console.error("[create-payment-checkout] failed to mark interrupted attempt", cleanupError);
      }
    }
    return jsonResponse(400, { message: error instanceof Error ? error.message : "Payment checkout could not be created." });
  }
});
