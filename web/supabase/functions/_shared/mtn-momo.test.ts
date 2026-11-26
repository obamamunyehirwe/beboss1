import {
  getMtnMomoAccessToken,
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
  credentialKind: "sandbox_api_user_key",
};

Deno.test("MTN sandbox and production use their matching hosts, targets and credential schemes", () => {
  const names = [
    "MTN_MOMO_ENV", "MTN_MOMO_BASE_URL", "MTN_MOMO_TARGET_ENVIRONMENT",
    "MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY", "MTN_MOMO_API_USER", "MTN_MOMO_API_KEY",
    "MTN_MOMO_USER_ID", "MTN_MOMO_CREDENTIAL_TOKEN",
  ];
  const old = Object.fromEntries(names.map((name) => [name, Deno.env.get(name)]));
  try {
    Deno.env.set("MTN_MOMO_ENV", "sandbox");
    Deno.env.set("MTN_MOMO_BASE_URL", "https://sandbox.momodeveloper.mtn.com");
    Deno.env.set("MTN_MOMO_TARGET_ENVIRONMENT", "sandbox");
    Deno.env.set("MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY", "sandbox-subscription");
    Deno.env.set("MTN_MOMO_API_USER", "sandbox-user");
    Deno.env.set("MTN_MOMO_API_KEY", "sandbox-key");
    const sandbox = readMtnMomoConfiguration();
    if (sandbox.targetEnvironment !== "sandbox" || sandbox.credentialKind !== "sandbox_api_user_key") throw new Error("Sandbox credential mode rejected.");
    if (sandbox.baseUrl !== "https://sandbox.momodeveloper.mtn.com") throw new Error("Unexpected sandbox host.");

    Deno.env.set("MTN_MOMO_ENV", "production");
    Deno.env.set("MTN_MOMO_BASE_URL", "https://momoapi.momo.africa");
    Deno.env.set("MTN_MOMO_TARGET_ENVIRONMENT", "mtnrwanda");
    Deno.env.set("MTN_MOMO_USER_ID", "production-user-id");
    Deno.env.set("MTN_MOMO_CREDENTIAL_TOKEN", "production-credential-token");
    const production = readMtnMomoConfiguration();
    if (production.targetEnvironment !== "mtnrwanda" || production.credentialKind !== "production_user_id_token") throw new Error("Rwanda production credential mode rejected.");
    if (production.apiUser !== "production-user-id" || production.apiKey !== "production-credential-token") throw new Error("Production credential pair mismatch.");
    if (production.baseUrl !== "https://momoapi.momo.africa") throw new Error("Unexpected production host.");

    Deno.env.set("MTN_MOMO_BASE_URL", "https://attacker.invalid");
    let rejectedHost = false;
    try { readMtnMomoConfiguration(); } catch { rejectedHost = true; }
    if (!rejectedHost) throw new Error("An arbitrary provider base URL was accepted.");
    Deno.env.set("MTN_MOMO_BASE_URL", "https://momoapi.momo.africa");
    Deno.env.set("MTN_MOMO_TARGET_ENVIRONMENT", "production");
    let rejectedTarget = false;
    try { readMtnMomoConfiguration(); } catch { rejectedTarget = true; }
    if (!rejectedTarget) throw new Error("A generic production target was accepted for Rwanda.");
  } finally {
    for (const [name, value] of Object.entries(old)) {
      if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value);
    }
  }
});

Deno.test("Rwanda production token exchange uses User ID, Credential Token and mtnrwanda", async () => {
  const production: MtnMomoConfiguration = {
    environment: "production",
    baseUrl: "https://momoapi.momo.africa",
    targetEnvironment: "mtnrwanda",
    collectionsSubscriptionKey: "production-subscription",
    apiUser: "production-user-id",
    apiKey: "production-credential-token",
    credentialKind: "production_user_id_token",
  };
  let tokenRequest: Request | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    tokenRequest = new Request(input, init);
    return Response.json({ access_token: "production-access-token" }, { status: 200 });
  };
  const token = await getMtnMomoAccessToken(production, fetcher);
  if (token !== "production-access-token") throw new Error("Production access token was not returned.");
  if (!tokenRequest?.url.startsWith("https://momoapi.momo.africa/collection/token/")) throw new Error("Production token host mismatch.");
  if (tokenRequest.headers.get("Authorization") !== "Basic " + btoa("production-user-id:production-credential-token")) throw new Error("The migrated production credential pair was not used.");
  if (tokenRequest.headers.get("X-Target-Environment") !== "mtnrwanda") throw new Error("The Rwanda target environment header is missing.");
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
    const request = new Request("https://sandbox.momodeveloper.mtn.com/collection/token/", init);
    return request.url.endsWith("/collection/token/")
      ? Response.json({ access_token: "token" }, { status: 200 })
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
