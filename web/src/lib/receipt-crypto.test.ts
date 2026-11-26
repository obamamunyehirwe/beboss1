import { webcrypto, generateKeyPairSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  canonicalize,
  computeItemsHash,
  encodeReceiptQr,
  formatMinor,
  platformPublicKey,
  receiptToText,
  signReceipt,
  verifyReceipt,
  verifyReceiptQr,
  type Receipt,
} from "./receipt-crypto";

// jsdom does not expose Web Crypto's Ed25519; use Node's implementation.
beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  }
});

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });
const other = generateKeyPairSync("ed25519");
const otherPublicJwk = other.publicKey.export({ format: "jwk" });

async function makeReceipt(overrides: Partial<Receipt> = {}): Promise<Receipt> {
  const itemsHash = await computeItemsHash([
    { sku: "APL-1", name: "Apple", qty: 2, priceMinor: 150000 },
    { sku: "BRD-1", name: "Bread", qty: 1, priceMinor: 50000 },
  ]);
  return {
    v: 1,
    issuer: "test-key-1",
    tin: "109876543",
    shop: "Rwanda Corner Shop",
    branch: "Main",
    receiptNo: "RC-000123",
    issuedAt: "2026-11-26T16:00:00.000Z",
    currency: "RWF",
    totalMinor: 350000,
    taxMinor: 58475,
    cashier: "Alice",
    buyer: "0788000000",
    itemsHash,
    ...overrides,
  };
}

describe("receipt canonicalization", () => {
  it("is independent of object key order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalize({ a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4}}');
  });
});

describe("offline Ed25519 receipt verification", () => {
  it("verifies a genuine signature with no network access", async () => {
    const receipt = await makeReceipt();
    const sig = await signReceipt(receipt, privateJwk);
    expect(await verifyReceipt(receipt, sig, publicJwk)).toBe(true);
  });

  it("rejects a tampered total", async () => {
    const receipt = await makeReceipt();
    const sig = await signReceipt(receipt, privateJwk);
    const tampered = { ...receipt, totalMinor: receipt.totalMinor + 1 };
    expect(await verifyReceipt(tampered, sig, publicJwk)).toBe(false);
  });

  it("rejects a tampered line-items hash", async () => {
    const receipt = await makeReceipt();
    const sig = await signReceipt(receipt, privateJwk);
    const tampered = { ...receipt, itemsHash: "deadbeef" };
    expect(await verifyReceipt(tampered, sig, publicJwk)).toBe(false);
  });

  it("rejects a signature from the wrong key", async () => {
    const receipt = await makeReceipt();
    const sig = await signReceipt(receipt, privateJwk);
    expect(await verifyReceipt(receipt, sig, otherPublicJwk)).toBe(false);
  });

  it("rejects a malformed signature", async () => {
    const receipt = await makeReceipt();
    expect(await verifyReceipt(receipt, "not-a-signature", publicJwk)).toBe(false);
  });

  it("rejects a receipt signed by a key that does not match the committed platform key", async () => {
    const receipt = await makeReceipt();
    const sig = await signReceipt(receipt, privateJwk);
    // The committed platform public key must NOT validate an unrelated key.
    expect(await verifyReceipt(receipt, sig, platformPublicKey().jwk)).toBe(false);
  });
});

describe("QR round-trip", () => {
  it("encodes and verifies a receipt fully offline", async () => {
    const receipt = await makeReceipt();
    const sig = await signReceipt(receipt, privateJwk);
    const qr = await encodeReceiptQr(receipt, sig);
    expect(qr.startsWith("BEBOSS|RCPT1|")).toBe(true);
    const result = await verifyReceiptQr(qr, publicJwk);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.receipt.receiptNo).toBe("RC-000123");
  });

  it("returns bad-signature when the QR payload is altered", async () => {
    const receipt = await makeReceipt();
    const sig = await signReceipt(receipt, privateJwk);
    const qr = await encodeReceiptQr(receipt, sig);
    const parts = qr.split("|");
    // Flip the signature.
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    const result = await verifyReceiptQr(parts.join("|"), publicJwk);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-signature");
  });

  it("returns bad-format for non-BeBoss input", async () => {
    const result = await verifyReceiptQr("https://example.com/not-a-receipt", publicJwk);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-format");
  });
});

describe("presentation helpers", () => {
  it("formats minor units and renders text", async () => {
    const receipt = await makeReceipt();
    expect(formatMinor(350000, "RWF")).toContain("3,500.00");
    const text = receiptToText(receipt);
    expect(text).toContain("Receipt RC-000123");
    expect(text).toContain("TIN: 109876543");
  });
});
