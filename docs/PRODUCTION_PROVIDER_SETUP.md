# BeBoss production provider configuration

Keep all provider credentials in Supabase Edge Function secrets. Never commit populated secrets or expose them through VITE_ variables, Android BuildConfig, or desktop renderer code.

## Africa's Talking owner OTP delivery

Supabase Auth remains responsible for OTP generation and verification. The `send-auth-sms` Edge Function is the SMS delivery adapter and verifies Supabase's Standard Webhooks signature before forwarding the Auth message to Africa's Talking.

1. Create an Africa's Talking app and obtain its API key and application username. Sandbox uses username `sandbox` and its sandbox API key.
2. Deploy the function: `supabase functions deploy send-auth-sms --no-verify-jwt --project-ref ahlpvlhmpfiyeoercxol`.
3. Set Edge Function secrets (replace placeholders locally):
   ```bash
   supabase secrets set SEND_SMS_HOOK_SECRET='v1,whsec_<HOOK_SECRET>' AFRICASTALKING_ENV='sandbox' AFRICASTALKING_USERNAME='sandbox' AFRICASTALKING_API_KEY='<SANDBOX_API_KEY>' AFRICASTALKING_FROM='' --project-ref ahlpvlhmpfiyeoercxol
   ```
4. In Supabase Dashboard → Authentication → Hooks → Send SMS, create an HTTP hook targeting `https://ahlpvlhmpfiyeoercxol.supabase.co/functions/v1/send-auth-sms`. Copy its Standard Webhooks secret exactly into `SEND_SMS_HOOK_SECRET`.
5. Test on a verified Rwanda owner phone in sandbox. Switch the environment, username and key together for production after sender-ID approval.

Provider response codes 100, 101 and 102 indicate accepted/processed/queued, not final handset delivery. Use Africa's Talking delivery reports to verify delivery.

## MTN MoMo and Airtel Money

The environment names are prepared in `.env.example`, but neither MTN MoMo nor Airtel Money is enabled as a live settlement provider by this change. Do not activate subscriptions based on client redirects, a local receipt QR, or a provider request-accepted response. Implementations require the actual merchant onboarding specification, sandbox credentials, callback verification, transaction-status query and production certification. Flutterwave/Stripe remain the configured gateway settlement paths until those integrations are implemented and tested.

## Extra-device subscription pricing

Each additional active device beyond the included owner terminal adds FRw 2,000 per month. Paused or removed devices are not counted as active billable terminals. Confirm the shop's displayed subscription total after device changes; do not treat an invitation as a successful device activation until pairing is completed.
