import { matchesVerifiedRwfSettlement } from "./payment-settlement.ts";

const expected = {
  providerReference: "BB-TEST-ORDER-001",
  amountRwf: 12500,
  transactionId: "flw_tx_1001",
};

const successful = {
  id: "flw_tx_1001",
  tx_ref: "BB-TEST-ORDER-001",
  status: "successful",
  currency: "RWF",
  amount: 12500,
  payment_type: "mobilemoneyrw",
};

Deno.test("RWF settlement accepts an exact provider-confirmed mobile-money payment", () => {
  if (!matchesVerifiedRwfSettlement(successful, expected)) {
    throw new Error("Exact verified RWF mobile-money transaction was rejected.");
  }
});

Deno.test("RWF settlement rejects wrong reference, transaction ID, currency and amount", () => {
  const mismatches = [
    { ...successful, tx_ref: "BB-OTHER-ORDER" },
    { ...successful, id: "flw_tx_other" },
    { ...successful, currency: "USD" },
    { ...successful, amount: 12499 },
    { ...successful, amount: "12500.01" },
    { ...successful, status: "pending" },
    { ...successful, status: "failed" },
  ];
  for (const value of mismatches) {
    if (matchesVerifiedRwfSettlement(value, expected)) {
      throw new Error("A mismatched or uncompleted provider transaction was accepted.");
    }
  }
});

Deno.test("RWF settlement rejects untrusted or malformed values", () => {
  for (const value of [null, undefined, [], "successful", 12500, {}]) {
    if (matchesVerifiedRwfSettlement(value, expected)) {
      throw new Error("Malformed provider transaction was accepted.");
    }
  }
  if (matchesVerifiedRwfSettlement(successful, { ...expected, amountRwf: 0 })) {
    throw new Error("Zero-value payment expectation was accepted.");
  }
  if (matchesVerifiedRwfSettlement(successful, { ...expected, amountRwf: 12_500.5 })) {
    throw new Error("Fractional RWF expectation was accepted.");
  }
});
