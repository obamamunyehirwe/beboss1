export const DEVICE_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
export const DEVICE_REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const HEX = /^[0-9a-f]{64}$/;

/** 256 bits from WebCrypto; the plaintext is returned once and never logged/stored server-side. */
export function createDeviceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function isDeviceToken(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
