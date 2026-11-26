export type DesktopOwnerCredentials = {
  username: string;
  phone: string;
};

/**
 * Build an Edge Function request while keeping routing and owner identity
 * authoritative in the authenticated call site. Feature payloads may never
 * overwrite these reserved fields.
 */
export function buildDesktopActionBody(
  action: string,
  credentials: DesktopOwnerCredentials,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...payload,
    action,
    username: credentials.username,
    phone: credentials.phone,
  };
}
