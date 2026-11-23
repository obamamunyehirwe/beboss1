# BeBoss online payments and enterprise rollout

## Scope of this change

This change adds a server-side hosted-checkout path for Flutterwave and Stripe, a provider verification webhook, and a server-only payment-attempt ledger. It extends the existing `payment_requests` and BB3 unlock workflow. It does not change the production database or publish a production Android build.

## Provider behavior

### Flutterwave (RWF)

- Hosted checkout is initiated server-side using RWF.
- The checkout allows `card` and `mobilemoneyrwanda`; Flutterwave must have the relevant methods enabled for the merchant account.
- The hosted return URL is informational only. A browser redirect never marks a payment paid.
- The webhook signature is checked against the exact raw body using HMAC-SHA256 and the configured webhook secret hash.
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

The existing My Shop lookup and owner mutations still need a staged owner OTP enrollment and authenticated owner/device session migration. Do not deploy this gateway branch as a complete enterprise release until the My Shop routes are protected by verified owner sessions, existing Android sync clients have an upgrade/migration path, and the old deterministic tenant secret can be retired without breaking synchronization.

## Required acceptance before production

- Create a separate Supabase staging project and apply all migrations there.
- Configure separate staging Flutterwave and Stripe credentials and signed webhooks.
- Add automated tests for signature rejection, exact amount/currency checks, wrong reference, duplicate events, stale Stripe signatures, provider timeouts, and idempotent approval.
- Test Flutterwave RWF card, MTN and Airtel customer journeys with merchant test credentials and confirm settlement from provider records.
- Run Android release and subscription tests against staging; validate real Android hardware and ESC/POS printers.
- Verify live merchant onboarding and settlement accounts before switching production keys.
- Perform an independent penetration test and complete backup/restore and disaster-recovery drills.
- Build and sign the Android APK/AAB using protected release credentials; record hashes and release evidence.
