import { describe, expect, it } from "vitest";
import { computeAccountBindingHash, generateBB2UnlockCode, parseBB2, verifyBB2 } from "./bb2";

// Reference values computed independently with Python hashlib/hmac using the Kotlin algorithm.
const NOW = 20578 * 86_400_000 + 1000;
const SECRET = "test-signing-secret-123";

describe("BB2 unlock codes", () => {
  it("binding hash is the first 6 hex of sha256(lower(user):last9(phone))", async () => {
    expect(await computeAccountBindingHash("Mama_Shop", "+250788123456")).toBe("C52CCA");
  });
  it("generates the exact code the Android app accepts", async () => {
    const code = await generateBB2UnlockCode({ username: "mama_shop", phone: "0788123456", tier: "single", days: 30, secret: SECRET, now: NOW });
    expect(code).toBe("BB2-SINGLE-30-5070-C52CCA-C2DE605D");
  });
  it("verifies and rejects tampering or other accounts", async () => {
    const code = "BB2-SINGLE-30-5070-C52CCA-C2DE605D";
    expect((await verifyBB2(code, "mama_shop", "0788123456", SECRET, NOW)).ok).toBe(true);
    expect((await verifyBB2(code.replace("-30-", "-90-"), "mama_shop", "0788123456", SECRET, NOW)).ok).toBe(false);
    expect((await verifyBB2(code, "other", "0788123456", SECRET, NOW)).ok).toBe(false);
    expect(parseBB2(code)?.days).toBe(30);
  });
  it("refuses to sign without a key", async () => {
    await expect(generateBB2UnlockCode({ username: "a", phone: "0788123456", tier: "SINGLE", days: 30, secret: "" })).rejects.toThrow();
  });
});
