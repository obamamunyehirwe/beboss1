# BeBoss online payments and enterprise rollout

## Scope of this change

This change adds a server-side hosted-checkout path for Flutterwave and Stripe, a provider verification webhook, and a server-only payment-attempt ledger. It extends the existing `payment_requests` and BB3 unlock workflow. It does not change the production database or publish a production Android build.

## Provider behavior

### Flutterwave (RWF)

- Hosted checkout is initiated server-side using RWF.
- The checkout allows `card` and `mobilemoneyrwanda`; Flutterwave must have the relevant methods enabled for the merchant account.
- The hosted return URL is informational only. A browser redirect never marks a payment paid.
- The webhook verifies Flutterwave's current `verif-hash` header against the configured webhook secret hash using constant-time comparison. Flutterwave sends this configured value verbatim; it is not an HMAC of the raw body.
- The handler then calls Flutterwave's transaction-verification API and checks the BeBoss reference, successful status, RWF currency and exact expected amount before marking the payment verified.

### Stripe

- Checkout is created server-side in RWF using a live Stripe account.
- Before checkout, the function checks the connected Stripe account's country, account details and `charges_enabled` flag. A test key, unverified account or account that cannot accept charges is rejected.
- The webhook verifies the timestamped Stripe signature against the exact raw body, retrieves the Checkout Session from Stripe and checks paid status, payment request ID, generated gateway reference, currency and exact amount.
- Stripe availability depends on the legal merchant entity. A Rwanda-only legal entity must not be represented as Stripe eligible. Use only a Stripe account legitimately registered in a supported jurisdiction and approved for the merchant.

## Required Edge Function secrets

Set these as Supabase Edge Function secrets. Never put them in Vite variables, Android BuildConfig, source control or the browser:

| Secret | Purpose |
| --- | --- |
| `FLW_SECRET_KEY` | Flutterwave server API key |
| `FLW_WEBHOOK_SECRET_HASH` | Flutterwave webhook HMAC secret hash |
| `STRIPE_SECRET_KEY` | Stripe live secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `BEBOSS_PUBLIC_URL` | Canonical HTTPS URL for the BeBoss website |

Configure provider webhook endpoints after deployment:

- Flutterwave: `https://<project-ref>.supabase.co/functions/v1/payment-gateway-webhook`
- Stripe: `https://<project-ref>.supabase.co/functions/v1/payment-gateway-webhook`

Enable payment and asynchronous success/failure events in the provider dashboards. Use separate live and staging provider keys and webhook endpoints. Do not use test-mode payments as production acceptance evidence.

## Operational rules

1. A payment is not trusted because a customer returns to the site or submits an SMS.
2. The provider webhook is signature-verified and then independently verified against the provider API.
3. Provider amount and currency must exactly match the server-calculated RWF price. Mismatches are not credited automatically.
4. Duplicate webhook deliveries must not create another payment request or another BB3 unlock.
5. A provider-verified payment enters the existing admin payment queue with a server-managed verification timestamp. The existing authorized admin approval flow issues the BB3 unlock code or direct activation.
6. Refunds must be initiated through provider APIs and reconciled against provider refund events before entitlement reversal. This change records provider payment evidence; it does not yet implement refund execution or entitlement-reversal automation.

## Owner portal security gate

This branch now adds a phone-OTP enrollment path for the website owner portal:

- The OTP is sent only to the phone already recorded on the matching shop account. Responses do not reveal whether a username/shop exists.
- OTP requests are limited to three per shop per ten minutes.
- A successful Supabase Auth SMS verification creates a server-side `shop_owner_memberships` row.
- Every My Shop data lookup, device/branch/transfer mutation and hosted-checkout initiation requires a verified Supabase session plus an active owner membership.
- Revoked memberships cannot be silently reactivated by signing in again; restoration requires an operator-reviewed process.

The owner-membership migration must be applied in staging, and Supabase Phone Auth plus a production SMS provider must be configured and tested before enabling this path. This closes unauthenticated browser lookups, but it does **not** complete the Android tenant credential migration: Android still has legacy deterministic `X-Shop-Sync-Key` compatibility. Server-generated random tenant secrets, hashed storage, per-device/role sessions, Android Keystore refresh credentials, dual-stack rollout, revocation and retirement of the legacy key remain a separate release gate.

## Android payment-path scope

This branch adds an Android subscription-screen entry that opens the BeBoss web hosted-checkout page and pre-fills the selected branch, staff, device and subscription-term values. The shop owner must still verify the registered phone with SMS OTP in the browser, and the provider-hosted Flutterwave or Stripe checkout plus signed server webhook performs the payment confirmation.

The legacy Android `PaymentGatewayManager` no longer accepts a generic shop-configured backend's JSON as proof of settlement. `MoMoPaymentGateway` refuses to treat an SMS reference or untrusted endpoint response as success, and `OfflineSubscriptionManager` no longer creates a local fake-pending transaction after a USSD prompt. Legacy USSD dialer controls remain a manual assisted path only; they do not verify a payment or activate a licence automatically.

Native in-app Flutterwave/Stripe SDK or direct provider API checkout, native authenticated owner/device sessions, Android-side status polling against the verified gateway ledger and a native deep-link return/entitlement handoff remain unimplemented. The hosted browser flow is the supported online payment route in this branch.

## Required acceptance before production

- Create a separate Supabase staging project and apply all migrations there.
- Configure separate staging Flutterwave and Stripe credentials and signed webhooks.
- Add automated tests for signature rejection, exact amount/currency checks, wrong reference, duplicate events, stale Stripe signatures, provider timeouts, and idempotent approval.
- Test Flutterwave RWF card, MTN and Airtel customer journeys with merchant test credentials and confirm settlement from provider records.
- Run Android release and subscription tests against staging; validate real Android hardware and ESC/POS printers.
- Verify live merchant onboarding and settlement accounts before switching production keys.
- Perform an independent penetration test and complete backup/restore and disaster-recovery drills.
- Build and sign the Android APK/AAB using protected release credentials; record hashes and release evidence.


## Unresolved P0: legacy tenant header still bypasses the OTP portal

The owner OTP and membership checks in this PR protect the website's My Shop server functions. They do **not** replace the database tenant credential.

The current database implementation in `web/drizzle/migrations/0000_beboss_core_schema.sql` still defines `public.current_shop_sync_key()` by reading `request.headers ->> 'x-shop-sync-key'` directly. Tenant RLS policies compare that header value with the stored `shop_sync_key`. The legacy key itself is still calculated as lowercase username plus the last nine digits of the phone number.

Consequently, a caller who can derive that legacy value can still call Supabase PostgREST directly with the anon key and forged `X-Shop-Sync-Key` header, bypassing the new website OTP server-function middleware. This branch does not alter that helper, the legacy RLS comparison or anon tenant grants. Treat the direct database tenant-isolation issue as **OPEN / P0** and do not claim enterprise tenant isolation is fixed.

The complete remediation needs a coordinated versioned migration:
1. Verify shop ownership using an independently verified owner session, not the legacy key.
2. Generate a cryptographically random 256-bit device credential server-side and persist only a cryptographic hash bound to the shop, device, role, issue time, expiry and revocation state.
3. Exchange the device credential for short-lived scoped access, validate it inside the database/API authorization boundary and apply shop + role + device scope to every table and RPC.
4. Provision/store the credential in Android Keystore; support rotation, revocation, device replacement and recovery.
5. Ship a compatible Android upgrade and controlled dual-key period, monitor old-client adoption, then explicitly sunset the predictable `X-Shop-Sync-Key` path and remove public anon tenant authorization.
6. Test direct PostgREST attempts with forged tenant headers, cross-shop IDs, revoked credentials and expired sessions in an isolated staging project before rollout.

Do not simply change `current_shop_sync_key()` to reject the old header before supported Android clients have securely migrated; that would break existing shop synchronization without resolving enrollment and recovery safely.
