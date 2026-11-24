import { matchesVerifiedRwfSettlement } from "../supabase/functions/_shared/payment-settlement.ts";

type Network = "MTN" | "AIRTEL";

function required(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

async function verifyNetwork(network: Network, secret: string): Promise<void> {
  const prefix = "FLW_TEST_" + network + "_";
  const transactionId = required(prefix + "TRANSACTION_ID");
  const reference = required(prefix + "REFERENCE");
  const amountRwf = Number(required(prefix + "AMOUNT_RWF"));
  if (!Number.isSafeInteger(amountRwf) || amountRwf <= 0) {
    throw new Error(network + ": AMOUNT_RWF must be a positive whole RWF amount.");
  }

  const response = await fetch(
    "https://api.flutterwave.com/v3/transactions/" + encodeURIComponent(transactionId) + "/verify",
    { headers: { Authorization: "Bearer " + secret, Accept: "application/json" } },
  );
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || body.status !== "success") {
    throw new Error(network + ": Flutterwave transaction lookup failed (HTTP " + response.status + "). Check the transaction ID and matching test/live secret.");
  }

  const transaction = body.data;
  if (!matchesVerifiedRwfSettlement(transaction, { providerReference: reference, amountRwf, transactionId })) {
    throw new Error(network + ": provider transaction did not match the exact reference, transaction ID, successful status, RWF currency and expected amount.");
  }
  const paymentType = transaction && typeof transaction === "object"
    ? String((transaction as Record<string, unknown>).payment_type ?? "")
    : "";
  if (paymentType !== "mobilemoneyrw") {
    throw new Error(network + ": expected Rwanda Mobile Money (mobilemoneyrw), received " + (paymentType || "no payment_type") + ".");
  }

  console.log(network + ": verified Flutterwave Rwanda Mobile Money settlement, reference=" + reference + ", amount=" + amountRwf + " RWF, transaction=" + transactionId + ".");
}

const secret = required("FLW_SECRET_KEY");
await verifyNetwork("MTN", secret);
await verifyNetwork("AIRTEL", secret);
console.log("Both MTN-labelled and Airtel-labelled Rwanda Mobile Money transactions passed independent provider verification.");
