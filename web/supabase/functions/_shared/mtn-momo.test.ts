import {
  getMtnMomoPaymentStatus,
  matchesMtnMomoSettlement,
  readMtnMomoConfiguration,
  requestMtnMomoPayment,
  type MtnMomoConfiguration,
} from "./mtn-momo.ts";

const config: MtnMomoConfiguration = {
  environment: "sandbox",
  baseUrl: "https://sandbox.momodeveloper.mtn.com",
  targetEnvironment: "sandbox",
  collectionsSubscriptionKey: "test-subscription-key",
  apiUser: "test-api-user",
  apiKey: "test-api-key",
};

Deno.test("MTN configuration requires official HTTPS API host and matching environment", () => {
  const old = {
    env: Deno.env.get("MTN_MOMO_ENV"),
    url: Deno.env.get("MTN_MOMO_BASE_URL"),
    target: Deno.env.get("MTN_MOMO_TARGET_ENVIRONMENT"),
    subscription: Deno.env.get("MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY"),
    user: Deno.env.get("MTN_MOMO_API_USER"),
    key: Deno.env.get("MTN_MOMO_API_KEY"),
  };
  try {
    Deno.env.set("MTN_MOMO_ENV", "sandbox");
    Deno.env.set("MTN_MOMO_BASE_URL", "https://sandbox.momodeveloper.mtn.com");
    Deno.env.set("MTN_MOMO_TARGET_ENVIRONMENT", "sandbox");
    Deno.env.set("MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY", "test");
    Deno.env.set("MTN_MOMO_API_USER", "user");
    Deno.env.set("MTN_MOMO_API_KEY", "key");
    if (readMtnMomoConfiguration().targetEnvironment !== "sandbox") throw new Error("Sandbox config rejected.");
    Deno.env.set("MTN_MOMO_BASE_URL", "https://attacker.invalid");
    let rejected = false;
    try { readMtnMomoConfiguration(); } catch { rejected = true; }
    if (!rejected) throw new Error("An arbitrary provider base URL was accepted.");
  } finally {
    for (const [name, value] of Object.entries({
      MTN_MOMO_ENV: old.env,
      MTN_MOMO_BASE_URL: old.url,
      MTN_MOMO_TARGET_ENVIRONMENT: old.target,
      MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY: old.subscription,
      MTN_MOMO_API_USER: old.user,
      MTN_MOMO_API_KEY: old.key,
    })) {
      if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value);
    }
  }
});

Deno.test("Request-to-Pay uses server credentials, RWF and the owner-approved MSISDN", async () => {
  const calls: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push(request);
    if (calls.length === 1) return Response.json({ access_token: "server-access-token" }, { status: 200 });
    return new Response(null, { status: 202 });
  };
  const result = await requestMtnMomoPayment(config, {
    referenceId: "123e4567-e89b-42d3-a456-426614174000",
    externalId: "BEBOSS-GW-123",
    amountRwf: 5000,
    payerMsisdn: "250788123456",
    payerMessage: "BeBoss subscription",
  }, fetcher);
  if (!result.accepted || calls.length !== 2) throw new Error("Request-to-Pay was not accepted.");
  const tokenRequest = calls[0];
  if (!tokenRequest.headers.get("Authorization")?.startsWith("Basic ")) throw new Error("API user credentials were not sent as Basic auth.");
  const paymentRequest = calls[1];
  if (paymentRequest.headers.get("Authorization") !== "Bearer server-access-token") throw new Error("Bearer token missing.");
  if (paymentRequest.headers.get("X-Reference-Id") !== result.referenceId) throw new Error("Request reference mismatch.");
  const body = await paymentRequest.json();
  if (body.amount !== "5000" || body.currency !== "RWF" || body.payer.partyId !== "250788123456") throw new Error("Payment request payload mismatch.");
});

Deno.test("A 202 Request-to-Pay is accepted but never treated as a paid settlement", async () => {
  const accepted: typeof fetch = async (_input, init) => {
    const request = new Request("https://example.invalid", init);
    return request.method === "POST"
      ? new Response(JSON.stringify({ access_token: "token" }), { status: 200 })
      : new Response(null, { status: 202 });
  };
  const result = await requestMtnMomoPayment(config, {
    referenceId: "123e4567-e89b-42d3-a456-426614174000",
    externalId: "BEBOSS-GW-123",
    amountRwf: 5000,
    payerMsisdn: "250788123456",
    payerMessage: "Approve on your wallet",
  }, accepted);
  if (!result.accepted) throw new Error("202 request was rejected.");
  if (matchesMtnMomoSettlement({
    status: "PENDING", amount: "5000", currency: "RWF", externalId: "BEBOSS-GW-123",
  }, { externalId: "BEBOSS-GW-123", amountRwf: 5000, payerMsisdn: "250788123456" })) {
    throw new Error("Pending payment was treated as successful.");
  }
});

Deno.test("Only exact successful RWF, matching reference and amount can settle", () => {
  const expected = { externalId: "BEBOSS-GW-123", amountRwf: 5000, payerMsisdn: "250788123456" };
  const valid = { status: "SUCCESSFUL" as const, amount: "5000", currency: "RWF", externalId: "BEBOSS-GW-123", financialTransactionId: "FT-123", payer: { partyIdType: "MSISDN", partyId: "250788123456" } };
  if (!matchesMtnMomoSettlement(valid, expected)) throw new Error("Valid settlement rejected.");
  for (const invalid of [
    { ...valid, status: "FAILED" as const },
    { ...valid, amount: "5001" },
    { ...valid, currency: "USD" },
    { ...valid, externalId: "OTHER" },
    { ...valid, payer: { partyId: "250788999999" } },
  ]) {
    if (matchesMtnMomoSettlement(invalid, expected)) throw new Error("Mismatched MTN settlement was accepted.");
  }
});

Deno.test("MTN status query uses the provider reference and parses final states", async () => {
  let path = "";
  const fetcher: typeof fetch = async (input) => {
    const request = new Request(input);
    path = request.url;
    if (path.endsWith("/collection/token/")) return Response.json({ access_token: "token" });
    return Response.json({ status: "SUCCESSFUL", amount: "5000", currency: "RWF", externalId: "BEBOSS-GW-123", financialTransactionId: "FT-123" });
  };
  const status = await getMtnMomoPaymentStatus(config, "123e4567-e89b-42d3-a456-426614174000", fetcher);
  if (!path.endsWith("/123e4567-e89b-42d3-a456-426614174000")) throw new Error("Status endpoint path is incorrect.");
  if (status.status !== "SUCCESSFUL" || status.financialTransactionId !== "FT-123") throw new Error("Status response was not parsed.");
});
