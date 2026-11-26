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

## MTN MoMo Collection (direct Rwanda wallet prompt)

The repository includes a server-side MTN MoMo Collections Request-to-Pay adapter. It is asynchronous: HTTP 202 means MTN accepted the prompt, not that the payer completed the payment. The owner approves the wallet prompt, My Shop asks the server to query transaction status, and the server verifies the final RWF amount, external reference, payer MSISDN and financial transaction ID. Only then is the payment marked provider-verified and placed in the admin review queue. No subscription or unlock code is automatically activated.

### Supabase Edge Function secrets

Configure these only in Supabase Edge Function secrets. Do not put them in VITE_ variables, Android BuildConfig, desktop renderer settings or committed files.

Sandbox:
```text
MTN_MOMO_ENV=sandbox
MTN_MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com
MTN_MOMO_TARGET_ENVIRONMENT=sandbox
MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY=<sandbox Collections primary/secondary key>
MTN_MOMO_API_USER=<sandbox API User>
MTN_MOMO_API_KEY=<sandbox API Key>
```

Rwanda production (new MoMo platform):
```text
MTN_MOMO_ENV=production
MTN_MOMO_BASE_URL=https://momoapi.momo.africa
MTN_MOMO_TARGET_ENVIRONMENT=mtnrwanda
MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY=<production Collections primary/secondary key>
MTN_MOMO_USER_ID=<Partner Portal System User ID>
MTN_MOMO_CREDENTIAL_TOKEN=<Partner Portal System Credential Token>
```

Use the correct Collections subscription key, not the Disbursements or Remittance key. Production uses the new system credential pair; do not copy the legacy sandbox API User/API Key into the production variables. MTN documents that token creation requires the `X-Target-Environment` header, and its Rwanda portal identifies `mtnrwanda` as the production target. Review the [MTN MoMo platform migration notice](https://momodevelopercommunity.mtn.com/product-updates) and the [Rwanda API common error reference](https://momoapi.mtn.co.rw/content/html_widgets/30c89.html) during merchant onboarding.

### Important operating boundaries

- A payment request is stored before the provider POST. If the network response is uncertain, the ledger is held for reconciliation; do not create duplicate requests until status is checked.
- A provider failure marks the payment request rejected. A successful provider status still requires BeBoss admin approval before a BB3 code is issued.
- The current implementation uses authenticated server-side status polling rather than a provider callback. Do not configure an unused callback URL.
- Complete MTN contractual onboarding, sandbox validation, production credential setup and a real RWF test settlement before enabling production credentials. CI tests mock the provider and do not certify real-money payments.
- Flutterwave hosted checkout continues to support its own activated Rwanda mobile-money options (including eligible MTN/Airtel methods) and card rails.
- Direct Airtel Money API collection is not enabled. The Rwanda developer portal requires account registration, API product selection, application registration, testing and production approval. Complete provider-specific onboarding and confirm the signed API contract and callback/status semantics before adding a direct Airtel adapter. See the [Airtel Rwanda developer portal](https://developers.airtel.co.rw/home).


## Extra-device subscription pricing

Each additional active device beyond the included owner terminal adds FRw 2,000 per month. Paused or removed devices are not counted as active billable terminals. Confirm the shop's displayed subscription total after device changes; do not treat an invitation as a successful device activation until pairing is completed.
