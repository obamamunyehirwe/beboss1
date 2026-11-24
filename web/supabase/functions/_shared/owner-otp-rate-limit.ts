// Hash the OTP rate-limit scope so raw phone numbers and IP addresses are
// never persisted in the throttle tables. Phone limits intentionally do not
// include shop username, because username is caller-controlled during sign-up.
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ownerOtpPhoneBucketKey(phoneE164: string): Promise<string> {
  return "owner-phone:" + await sha256Hex("owner-phone:" + phoneE164);
}

export async function ownerOtpIpBucketHash(ipAddress: string): Promise<string | null> {
  const cleanIp = ipAddress.trim();
  return cleanIp ? sha256Hex("owner-otp-ip:" + cleanIp) : null;
}
