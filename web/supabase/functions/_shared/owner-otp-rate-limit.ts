/**
 * Scope owner OTP limits to the verified phone destination, not a caller-
 * controlled username/shop key. Only this SHA-256 bucket is stored.
 */
export async function ownerOtpPhoneBucketKey(phoneE164: string): Promise<string> {
  const normalized = phoneE164.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("Owner OTP throttling requires a valid E.164 phone number.");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`owner-phone:${normalized}`),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `owner-phone:${hash}`;
}
