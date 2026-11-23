# BeBoss Hosted Gateway Checkout — Deployment and Acceptance

This document covers the hosted **BeBoss subscription checkout** added by the gateway-payment foundation. It does not represent merchant-sale settlement or an EBM/VSDC certification.

## Payment boundaries

| Existing payment path | What it does now |
|---|---|
| MTN MoMo / Airtel Money manual subscription proof | The customer submits a payment claim; a BeBoss administrator must check the provider merchant statement and record the evidence. A customer SMS or screenshot is not provider verification. |
| Android POS tenders (cash, MoMo, Airtel, card, credit) | They record sale tender details in the offline POS. This code does not yet initiate a merchant charge or independently settle/reconcile that sale with a mobile-money provider. |
| Flutterwave Rwanda Mobile Money | Starts a hosted/authorized RWF charge for a BeBoss subscription. The subscription is not activated until the signed provider notification and independent Flutterwave transaction verification succeed, then an administrator approves the registered shop. |
| Stripe Checkout | Card Checkout for an already-active Stripe merchant account in a Stripe-supported business country. A Rwanda-based Stripe merchant account is rejected. RWF presentment support does not make Stripe merchant onboarding available in every country. |

## Environment and secret configuration

Configure **separate test and live secrets** in the Supabase Edge Function environment. Never put secret keys in the web application, Android app, Git repository, build variables prefixed with `VITE_`, support screenshots or chat messages.

Required server-side settings:

| Secret / environment | Purpose |
|---|---|
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave v3 server-to-server charge, transaction verification and refund API |
| `FLUTTERWAVE_WEBHOOK_SECRET_HASH` | Exact secret hash configured in Flutterwave, compared to the `verif-hash` webhook header |
| `STRIPE_SECRET_KEY` | Stripe Checkout, Checkout Session lookup and refund APIs |
| `STRIPE_WEBHOOK_SECRET` | Stripe endpoint signing secret for the `Stripe-Signature` header |
| `PUBLIC_SITE_URL` | Public HTTPS BeBoss web origin for Checkout success/cancel URLs |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase-provided Edge Function server environment; service-role key must never leave the Edge Function |

The refund function also uses the Supabase-provided anonymous/publishable API key to authenticate the requesting administrator's JWT and check the `is_beboss_admin()` permission. The refund mutation itself uses service-role RPCs only after that check.

## Flutterwave Rwanda Mobile Money

1. Complete Flutterwave merchant onboarding and enable Rwanda Mobile Money on the approved account.
2. Configure `FLUTTERWAVE_SECRET_KEY` in the test environment first.
3. Configure Flutterwave's Secret Hash and store the **same random value** as `FLUTTERWAVE_WEBHOOK_SECRET_HASH`.
4. Register this HTTPS webhook URL in the correct Flutterwave environment:

   `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/flutterwave-payment-webhook`

5. Enable charge completion and refund events. Flutterwave v3 sends the configured Secret Hash verbatim in the `verif-hash` header; BeBoss validates that header, then independently calls the transaction verify API and checks transaction status, reference, exact RWF amount and currency.
6. Verify partial and full refunds. A v3 refund status of `completed` means the refund process has been initiated and can still be awaiting disbursement. BeBoss only increases the final refunded total for terminal success statuses such as `completed-momo` or `completed-mpgs`; otherwise it remains pending and must be reconciled.

Official references:
- [Rwanda Mobile Money charge API](https://developer.flutterwave.com/api/charge/rwanda-mobile-money)
- [Flutterwave webhook signature guide](https://developer.flutterwave.com/docs/webhooks)
- [Flutterwave v3 refunds](https://developer.flutterwave.com/docs/payment-operations/refunds)
- [Retrieve a refund](https://developer.flutterwave.com/api/transactions/get-transaction-refunds)

## Stripe Checkout

1. Use a Stripe account that has completed onboarding, has `charges_enabled=true`, and belongs to a Stripe-supported merchant country. Stripe does not onboard Rwanda-based merchant accounts.
2. RWF is a zero-decimal currency in Stripe's API; the Checkout session amount must be sent in whole RWF units. Stripe may still restrict presentment currencies by merchant country and account configuration.
3. Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on the matching Supabase environment.
4. Register the HTTPS endpoint:

   `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/stripe-payment-webhook`

5. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated` and `refund.failed`.
6. The handler validates the Stripe signature/timestamp, retrieves the Checkout Session independently, checks the payment intent/reference/currency/amount, and uses idempotent webhook processing. Refund webhooks are checked against the reserved BeBoss refund ID, PaymentIntent and exact RWF amount.

Official references:
- [Stripe supported countries](https://stripe.com/global)
- [Stripe supported currencies](https://docs.stripe.com/currencies)
- [Checkout post-payment events](https://docs.stripe.com/payments/existing-customers)
- [Refund API](https://docs.stripe.com/api/refunds)

## Deployment order

Do not deploy this migration to the existing production project before a separate staging project and credentials exist.

1. Create an isolated Supabase staging project. Copy only synthetic test data.
2. Apply migrations in order:
   - `20261123220000_verified_gateway_checkout_ledger.sql`
   - `20261123221000_gateway_refund_lifecycle.sql`
3. Configure test-mode credentials and the webhook URLs in the provider test dashboards.
4. Deploy the four Edge Functions:
   - `create-subscription-checkout` (publicly callable, IP rate-limited; no JWT)
   - `flutterwave-payment-webhook` (public webhook, secret-hash verification; no JWT)
   - `stripe-payment-webhook` (public webhook, signature verification; no JWT)
   - `manage-gateway-refund` (JWT required and master-admin permission required)
5. Validate end-to-end in provider test mode, including repeated webhook deliveries and provider timeout/retry cases.
6. Only after staging acceptance, configure live merchant secrets and live webhook URLs. Run a small real transaction and refund with a designated test merchant, reconcile provider statements, and retain redacted evidence.

## Acceptance cases

- A browser success/cancel redirect never marks a payment verified.
- A missing/incorrect Flutterwave `verif-hash` is rejected.
- A forged Flutterwave event with correct header but wrong transaction reference, amount, currency or failed transaction status is not verified.
- A Stripe webhook with an invalid/stale signature is rejected.
- Stripe and Flutterwave transaction/session verification rejects reference or amount mismatches.
- Duplicate events do not issue a second licence or a second refund.
- The same idempotency key with different amount/reason/payment is rejected.
- Concurrent partial refund requests cannot exceed the original provider-verified amount.
- A provider refund response of pending/processing is shown as pending. Final refunded totals change only after provider-reported terminal success.
- A refund that times out is reconciled before another refund attempt is sent.
- A non-admin JWT cannot request or reconcile refunds.
- Tenant client sessions cannot set gateway verification, refund totals or latest-refund metadata directly.

## Remaining rollout blockers

- Live Flutterwave merchant approval, API credentials and registered live webhook.
- An eligible, fully enabled Stripe merchant account in a supported country.
- A separate staging Supabase project and isolated provider test accounts.
- Android POS direct collection integration with merchant-owned provider APIs. The existing Android tender choices are still locally recorded methods.
- Merchant-sale settlement reconciliation and POS refunds/returns are separate from BeBoss subscription refunds.
- Production RRA EBM/VSDC integration requires RRA's current CIS/VSDC specifications, required application documents, technical review and certification. This repository change does not constitute that approval.
- Production signing, device/printer acceptance, security testing and independent penetration testing remain separate release gates.

No live payment keys, real transaction references or customer phone numbers belong in a GitHub issue or pull request.
