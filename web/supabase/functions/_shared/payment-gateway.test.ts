import {
  hmacSha256Base64,
  constantTimeTextEqual,
  expectedSubscriptionAmount,
  hmacSha256Hex,
  normalizePhone,
  phoneE164,
  verifyFlutterwaveWebhookSignature,
} from "./payment-gateway.ts";

Deno.test("Rwanda phone normalization accepts national and E.164 values", () => {
  if (normalizePhone("0788 123 456") !== "788123456") throw new Error("National phone normalization failed.");
  if (normalizePhone("+250 788 123 456") !== "788123456") throw new Error("E.164 phone normalization failed.");
  if (phoneE164("0788 123 456") !== "+250788123456") throw new Error("National phone E.164 conversion failed.");
  if (phoneE164("+250788123456") !== "+250788123456") throw new Error("International phone E.164 conversion failed.");
});

Deno.test("Rwanda phone validation rejects unsupported and malformed numbers", () => {
  for (const value of ["123", "0788", "+1 202 555 0100", "250123456789"]) {
    let rejected = false;
    try {
      phoneE164(value);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Invalid phone was accepted: ${value}`);
  }
});

Deno.test("server subscription pricing uses exact RWF amount and term discount", () => {
  if (expectedSubscriptionAmount(1, 1, 1, 1) !== 5_000) throw new Error("Single-branch base price mismatch.");
  if (expectedSubscriptionAmount(2, 2, 3, 1) !== 32_400) throw new Error("Quarterly discount calculation mismatch.");
  if (expectedSubscriptionAmount(1, 1, 12, 2) !== 67_200) throw new Error("Annual device add-on calculation mismatch.");
});

Deno.test("HMAC-SHA256 matches the standard test vector", async () => {
  const result = await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog");
  const expected = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";
  if (result !== expected) throw new Error("HMAC-SHA256 test vector mismatch.");
});

Deno.test("constant-time text comparison rejects mismatched signatures", () => {
  if (!constantTimeTextEqual("provider-signature", "provider-signature")) throw new Error("Equal signatures were rejected.");
  if (constantTimeTextEqual("provider-signature", "provider-signaturf")) throw new Error("Mismatched signatures were accepted.");
  if (constantTimeTextEqual("short", "a much longer signature")) throw new Error("Different-length signatures were accepted.");
});

Deno.test("Flutterwave webhook signature verifies HMAC-SHA256 over the exact raw body", async () => {
  const configured = "merchant-webhook-secret-hash";
  const rawBody = JSON.stringify({ id: "wbk_test_1", type: "charge.completed", data: { id: "chg_test_1" } });
  const validSignature = await hmacSha256Base64(configured, rawBody);
  if (!(await verifyFlutterwaveWebhookSignature(configured, rawBody, validSignature))) {
    throw new Error("Valid Flutterwave HMAC signature was rejected.");
  }
  if (await verifyFlutterwaveWebhookSignature(configured, rawBody, "wrong-signature")) {
    throw new Error("Forged Flutterwave signature was accepted.");
  }
  if (await verifyFlutterwaveWebhookSignature(configured, rawBody + " ", validSignature)) {
    throw new Error("Signature for a different raw body was accepted.");
  }
  if (await verifyFlutterwaveWebhookSignature("", rawBody, validSignature)) {
    throw new Error("Missing configured Flutterwave secret was accepted.");
  }
  if (await verifyFlutterwaveWebhookSignature(configured, rawBody, "")) {
    throw new Error("Missing Flutterwave signature was accepted.");
  }
});
