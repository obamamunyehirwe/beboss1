export const AFRICASTALKING_SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging";
export const AFRICASTALKING_LIVE_URL = "https://api.africastalking.com/version1/messaging";
export function normalizeAfricaTalkingHookSecret(value: string): string[] {
  return value.split("|").map((item) => item.trim()).filter(Boolean).map((item) => item.replace(/^v1,whsec_/, ""));
}
export function isValidInternationalPhone(value: unknown): value is string {
  return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value);
}
export function isAfricaTalkingSmsAccepted(result: unknown): boolean {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const sms = (result as Record<string, unknown>).SMSMessageData;
  if (!sms || typeof sms !== "object" || Array.isArray(sms)) return false;
  const recipients = (sms as Record<string, unknown>).Recipients;
  if (!Array.isArray(recipients) || recipients.length !== 1) return false;
  const recipient = recipients[0];
  return !!recipient && typeof recipient === "object" && !Array.isArray(recipient) &&
    [100, 101, 102].includes(Number((recipient as Record<string, unknown>).statusCode));
}
export function isValidAfricaTalkingEnvironment(value: string): value is "sandbox" | "production" {
  return value === "sandbox" || value === "production";
}
