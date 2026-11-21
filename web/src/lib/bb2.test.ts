import { describe, expect, it } from "vitest";
import { computeAccountBindingHash, parseBB2 } from "./bb2";

describe("legacy BB2 compatibility parser", () => {
  it("computes the original account binding hash for migration diagnostics", async () => {
    expect(await computeAccountBindingHash("Mama_Shop", "+250788123456")).toBe("C52CCA");
    expect(await computeAccountBindingHash("mama_shop", "0788123456")).toBe("C52CCA");
  });

  it("parses the historical code fields without verifying its old shared HMAC", () => {
    const parsed = parseBB2("BB2-SINGLE-30-5070-C52CCA-C2DE605D");
    expect(parsed).toEqual({
      tier: "SINGLE",
      days: 30,
      expiryEpochDay: 0x5070,
      accountHash: "C52CCA",
      signature: "C2DE605D",
    });
  });

  it("rejects malformed or out-of-range legacy codes", () => {
    expect(parseBB2("BB2-SINGLE-30")).toBeNull();
    expect(parseBB2("BB2-SINGLE-0-5070-C52CCA-C2DE605D")).toBeNull();
    expect(parseBB2("BB2-SINGLE-30-ZZZZ-C52CCA-C2DE605D")).toBeNull();
    expect(parseBB2("BB3-SINGLE-30-5070-C52CCA-0123456789ABCDEF01234567-ABC")).toBeNull();
  });
});
