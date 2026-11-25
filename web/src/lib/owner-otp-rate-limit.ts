/**
 * Returns a stable, non-reversible throttle scope for one verified E.164 phone.
 * The database stores only this digest in its existing shop_id bucket column,
 * so phone numbers and username-derived shop keys are not persisted as throttle keys.
 */
export async function ownerOtpPhoneBucketKey(phoneE164: string): Promise<string> {
  const normalized = phoneE164.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("Owner OTP throttling requires a valid E.164 phone number.");
  }

  const input = new TextEncoder().encode(`owner-phone:${normalized}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `owner-phone:${hash}`;
}
