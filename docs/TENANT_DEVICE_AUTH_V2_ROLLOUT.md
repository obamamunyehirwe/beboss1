# BeBoss tenant authentication v2 — staging rollout and acceptance

## Purpose

This change retires the predictable shop sync key as a credential. A value in
`X-Shop-Sync-Key` is now only a tenant selector; it does not authenticate a
caller. Every tenant Data API request must carry a valid Supabase Auth JWT that
resolves to either an active, SMS-verified shop-owner membership or an active
per-terminal device session.

The Android application provisions a separate Auth identity for each enrolled
terminal. Refresh tokens are encrypted with an installation-specific Android
Keystore AES-GCM key. Access tokens are short lived and are refreshed through
Supabase Auth. Device session rows expire after 90 days and are checked against
the live device record, assigned staff member, role, branch, active state and
shop kill switch.

## What changed

- Direct `anon` SQL grants are revoked from public tables containing
  `shop_sync_key`; existing RLS policies remain the tenant authorization layer.
- `current_shop_sync_key()` derives the tenant from `auth.uid()` and a live
  owner membership or device-session record. A forged or missing header resolves
  to no tenant.
- Private SECURITY DEFINER device and transfer implementations are no longer
  directly callable by `anon` or `authenticated`. Public wrappers compare the
  caller's authenticated user and terminal IDs to the IDs being acted upon.
- Old device invite and redemption RPCs are retired from client access.
- New invites are random, one-time, SHA-256 hashed, expire within 60 minutes,
  and can be issued only by an OTP-verified owner or an authorized owner/manager
  terminal. Re-enrollment codes bind to the already paired physical terminal.
- The enrollment Edge Function rate-limits attempts, provisions a dedicated
  Auth account, redeems the invitation in one locked database transaction,
  and removes replaced/rejected Auth identities.
- The existing Android lock screen can re-enroll a terminal without clearing
  local Room data. The Android add-terminal flow uses the new invite protocol.
- New-shop registration now verifies the owner phone by SMS before an atomic
  shop + owner-membership bootstrap. The owner refresh token is stored encrypted
  with Android Keystore.
- Website My Shop tenant requests send the verified owner JWT. The shop key
  passed by the browser is not accepted as proof of identity.

## Required staging sequence

1. Create a separate Supabase staging project and configure its Auth phone/SMS
   provider. Configure the Edge Function secrets for the project; do not copy
   production provider secrets into staging.
2. Apply the migration set in timestamp order, including
   `20261124150000_device_auth_rls_v2.sql`. Do not skip earlier migrations:
   this migration depends on owner memberships, existing shop tables,
   device-invite tables and the transfer-claim functions.
3. Deploy these Edge Functions to staging:
   - `bootstrap-shop-owner`
   - `redeem-shop-device-invite`
   Also deploy the preceding owner-OTP / payment functions required by the
   current branch.
4. Verify the Edge environment has `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` (or
   `SUPABASE_PUBLISHABLE_KEY`). These are server environment values; never
   package the service-role key in Android or browser bundles.
5. Build and install the Android debug APK from the PR CI artifact. Use
   disposable staging shops and test phone numbers controlled by the team.
6. Test a brand-new shop: request the owner SMS code, verify it, finish
   registration, confirm a shop row and active owner membership exist, then
   sync a branch, staff member, product and sale.
7. Test an existing shop: owner signs in to My Shop by SMS OTP, opens Devices,
   requests **Re-enroll device** for one already paired terminal, enters the code
   on that exact terminal's lock screen, and verifies cloud sync resumes without
   deleting local sales, inventory or staff.
8. Test a new terminal: add a new device slot from a signed-in owner/manager
   terminal, pair the target Android install with the single-use code, and
   verify that the new terminal sees only its assigned shop.
9. Test rotation/revocation: reissue a code for the same device and verify the
   prior JWT no longer resolves a tenant; pause/remove a device and verify its
   JWT no longer reads or writes any tenant table.
10. Verify provider webhooks and payments separately. This migration does not
    configure payment merchant accounts or imply that real settlement is active.

## Required security acceptance tests

Run these in staging with at least two disposable shops, two users and two
physical/emulated Android installations:

| Scenario | Expected result |
| --- | --- |
| Anonymous PostgREST request with a forged `X-Shop-Sync-Key` | No tenant rows returned; writes denied |
| Authenticated user with no owner membership/device session | No tenant rows returned; writes denied |
| Device A JWT + Shop B selector | No Shop B rows returned; writes denied |
| Device A JWT + forged actor user/device IDs | RPC rejected or returns false |
| Expired device auth-session row | No tenant access |
| Revoked/replaced device session | Old JWT has no tenant access |
| Paused/deleted device | Device JWT has no tenant access |
| Inactive/reassigned staff record | Device JWT has no tenant access |
| Wrong physical terminal redeems a bound re-enrollment code | Redemption rejected |
| Reuse of a redeemed one-time code | Redemption rejected |
| Expired/revoked invitation | Redemption rejected |
| More than 10 attempts from one IP window | HTTP 429 |
| Owner's verified JWT, matching active membership | Only that owner's selected shop is available |
| Owner shop remote kill switch enabled | Tenant context resolves to no shop |
| New owner with wrong SMS code | No shop account or membership is created |
| New owner with verified SMS code | Shop and owner membership are created atomically |

Capture evidence from PostgREST responses, database rows and Android logs. Logs
must not include invitation codes, passwords, refresh tokens, access tokens or
the previous derived shop key.

## Existing-shop rollout behavior

This is a credential migration, not a silent credential conversion. A shop's
username/phone pair alone cannot claim a new terminal identity. Existing shops
must first prove owner phone control through Supabase SMS OTP in My Shop. Then
each existing paired terminal receives an exact-device re-enrollment invitation.
The owner should schedule this for every terminal before relying on the new
client version. Do not manually delete old device rows or clear local databases.

The old tenant header is rejected as an authentication credential immediately
after the migration is applied. Old APK versions that do not support device
Auth cannot continue cloud sync after this migration; upgrade and re-enrollment
must therefore happen as a coordinated staging-tested rollout.

## Device binding limitation to understand before production

The current invitation is bound to the terminal's stable BeBoss installation ID and
the one-time 128-bit invitation code. Android Keystore protects the refresh token
at rest, but the current protocol does not yet perform Android hardware key
attestation or a signed proof-of-possession challenge during re-enrollment. The
installation ID is not a hardware serial number and must not be treated as
unforgeable by itself. Keep invitation codes confidential and deliver them only
through the intended owner-controlled pairing flow.

For high-assurance device identity, a follow-on release should register an
Android Keystore public key per device and require a signature over the invite
hash and device ID on every enrollment or re-enrollment. Add server-side key
rotation/recovery and hardware-backed attestation where the device supports it.
Do not describe the present installation-ID binding as hardware attestation.

## Explicit deployment boundary

This branch contains code and migrations only. It does not apply any SQL to the
production Supabase project, deploy Edge Functions, enable production SMS, or
configure payment credentials. Production rollout remains blocked until all
staging tests above pass, a backup/restore test is completed, and the production
migration window and all existing terminal re-enrollments are scheduled.

## Remaining enterprise work outside this tenant-auth tranche

The migration materially closes the predictable tenant-key trust model; it does
not certify the entire POS/ERP product as enterprise-ready. Independent
penetration testing, full per-table role capability policy review, refund and
settlement reconciliation, RRA-approved EBM/VSDC certification, complete
accounting/ERP scope, hardware/printer matrix, production signing, DR exercises,
SSO and SLA work remain separate acceptance gates.
