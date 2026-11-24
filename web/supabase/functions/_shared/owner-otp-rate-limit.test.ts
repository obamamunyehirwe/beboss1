import { ownerOtpIpBucketHash, ownerOtpPhoneBucketKey } from "./owner-otp-rate-limit.ts";

Deno.test("owner OTP limit key is independent of caller-controlled shop username", async () => {
  const phone = "+250788123456";
  const keyForFirstUsername = await ownerOtpPhoneBucketKey(phone);
  const keyForSecondUsername = await ownerOtpPhoneBucketKey(phone);
  if (keyForFirstUsername !== keyForSecondUsername) {
    throw new Error("A username change must not create a new OTP rate-limit bucket.");
  }
  if (!keyForFirstUsername.startsWith("owner-phone:")) {
    throw new Error("Phone throttle bucket must use the owner-phone namespace.");
  }
  if (keyForFirstUsername.includes(phone)) {
    throw new Error("The OTP throttle key must not expose the phone number.");
  }
});

Deno.test("owner OTP source-IP buckets are private, stable and empty when unavailable", async () => {
  const first = await ownerOtpIpBucketHash("203.0.113.10");
  const repeated = await ownerOtpIpBucketHash("203.0.113.10");
  const other = await ownerOtpIpBucketHash("203.0.113.11");
  if (!first || first !== repeated || first === other || !/^[0-9a-f]{64}$/.test(first)) {
    throw new Error("Source-IP rate-limit hashes must be stable, distinct SHA-256 values.");
  }
  if (await ownerOtpIpBucketHash(" ")) {
    throw new Error("Missing client IP must not create an invalid shared rate-limit bucket.");
  }
});
