import { describe, expect, it } from "vitest";
import { ownerOtpPhoneBucketKey } from "./owner-otp-rate-limit";

describe("owner OTP phone throttle keys", () => {
  it("creates a stable SHA-256 bucket for a verified phone", async () => {
    const phone = "+250788123456";
    const first = await ownerOtpPhoneBucketKey(phone);
    const second = await ownerOtpPhoneBucketKey(phone);

    expect(first).toBe(second);
    expect(first).toMatch(/^owner-phone:[0-9a-f]{64}$/);
    expect(first).not.toContain(phone);
  });

  it("separates different phone destinations", async () => {
    const first = await ownerOtpPhoneBucketKey("+250788123456");
    const second = await ownerOtpPhoneBucketKey("+250788654321");

    expect(first).not.toBe(second);
  });

  it("rejects values that are not normalized E.164 phones", async () => {
    await expect(ownerOtpPhoneBucketKey("0788123456")).rejects.toThrow(
      "valid E.164",
    );
  });
});
