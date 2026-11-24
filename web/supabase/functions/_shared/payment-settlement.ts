export type ExpectedRwfSettlement = {
  providerReference: string;
  amountRwf: number;
  transactionId?: string;
};

/**
 * A webhook is only a notification. This function validates the independently
 * fetched provider transaction against the server-owned BeBoss payment attempt.
 * It deliberately accepts no browser/customer-supplied values as expectations.
 */
export function matchesVerifiedRwfSettlement(
  transaction: unknown,
  expected: ExpectedRwfSettlement
): boolean {
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) return false;
  const row = transaction as Record<string, unknown>;
  const amount = Number(row.amount);
  const expectedAmount = Number(expected.amountRwf);
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) return false;
  if (!Number.isFinite(amount) || amount !== expectedAmount) return false;
  if (String(row.tx_ref ?? "") !== expected.providerReference) return false;
  if (String(row.status ?? "").toLowerCase() !== "successful") return false;
  if (String(row.currency ?? "").toUpperCase() !== "RWF") return false;
  if (expected.transactionId && String(row.id ?? "") !== expected.transactionId) return false;
  return true;
}
