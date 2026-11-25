import { ownerOtpPhoneBucketKey } from "./owner-otp-rate-limit.ts";

Deno.test("owner OTP throttle is stable, hashed and shared across shop usernames", async () => {
  const phone = "+250788123456";
  const firstShop = await ownerOtpPhoneBucketKey(phone);
  const samePhoneDifferentShop = await ownerOtpPhoneBucketKey(phone);
  if (firstShop !== samePhoneDifferentShop) throw new Error("The same verified phone must share one OTP throttle bucket.");
  if (!/^owner-phone:[0-9a-f]{64}$/.test(firstShop) || firstShop.includes(phone)) {
    throw new Error("The OTP throttle bucket must be a SHA-256 digest without the raw phone.");
  }
});

Deno.test("different phone destinations use different OTP throttle buckets", async () => {
  const first = await ownerOtpPhoneBucketKey("+250788123456");
  const second = await ownerOtpPhoneBucketKey("+250788654321");
  if (first === second) throw new Error("Different verified phones must not share OTP limits.");
});

Deno.test("owner OTP throttling rejects non-E.164 phone values", async () => {
  let rejected = false;
  try {
    await ownerOtpPhoneBucketKey("0788123456");
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("E.164");
  }
  if (!rejected) throw new Error("Invalid phone input should be rejected before throttling.");
});
