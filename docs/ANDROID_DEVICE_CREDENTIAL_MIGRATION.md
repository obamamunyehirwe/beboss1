# Android authenticated device credential migration

This document describes the staged replacement for the predictable X-Shop-Sync-Key tenant header. The migration is deliberately additive: old Android installations keep working until the shop owner explicitly retires the legacy header after every active registered device has enrolled.

## What changes

- Each enrolled Android installation receives its own cryptographically random 256-bit access credential and refresh credential.
- The server stores SHA-256 digests only. The plaintext tokens are returned only during enrollment or rotation.
- Android wraps both tokens with a dedicated AES-GCM key in Android Keystore and stores only encrypted envelopes in private app preferences.
- Access credentials expire after 24 hours. Refresh credentials rotate on use and expire after 90 days.
- Supabase resolves the shop, role, assigned user and device from the server-owned device registry. Client-supplied shop IDs and roles do not establish tenant identity.
- Disabling or deleting a registered device invalidates the bound credential. A changed role or assigned user also invalidates its credential.
- Existing X-Shop-Sync-Key clients are supported during the migration window. This path is disabled only by an owner-approved, one-way cutover.

## Deployment sequence

1. Apply migration 20261124210000_authenticated_android_device_credentials.sql.
2. Deploy the updated beboss-desktop Edge Function and the new android-device-auth Edge Function.
3. Configure the Supabase Auth SMS provider and verify that owner OTP delivery works.
4. Build and distribute an Android release containing the device credential changes.
5. Update every active shop terminal before retiring legacy sync. An installation must be online to enroll.
6. On each terminal, open Settings → Authenticated device sync → Secure this Android terminal. The terminal must already be paired to an active device row. The registered shop owner must enter the one-time code sent to the registered shop phone.
7. Repeat on each active terminal. A paired staff terminal can be enrolled only when the registered owner approves it by entering the owner SMS code on that terminal.
8. Test normal cloud reads/writes, logout/login, app restart, expired access-token refresh, and recovery from a temporary network outage on every device.
9. Only when every active terminal is enrolled, the shop owner may choose Retire legacy shop sync and complete a second SMS verification.

The database cutover procedure refuses to retire the legacy header if an active device lacks a valid, unexpired refresh credential. No automatic background job retires it.

## Important cutover warning

Legacy retirement is intentionally one-way. Once legacy_sync_disabled is set for a shop, old app versions that only send X-Shop-Sync-Key stop syncing that shop. Do not retire legacy sync until all terminals have received the upgraded app, paired correctly, enrolled successfully, and completed an online sync.

If a terminal is lost, use the shop device-management workflow to disable or remove its device row. That immediately invalidates its device credential. Pair a replacement terminal and enroll it separately. If Android Keystore data is lost (for example after a device reset or lock-screen security change), the app keeps the local enrollment marker and refuses to fall back to the predictable legacy header; the owner must re-enroll that terminal.

## Offline behavior and recovery

Normal offline reads and local writes remain in the app's local database. A device access token is not needed to perform local-only work. Cloud synchronization requires a valid access token. When its 24-hour lifetime ends, the app rotates its refresh token through the authenticated device-auth Edge Function once connectivity returns. If the refresh credential has expired or has been revoked, cloud sync remains blocked until the owner re-enrolls the terminal.

Do not clear app data as a routine credential recovery step. That can remove the local offline database and queued changes. Preserve the app data, reconnect, and use owner-approved re-enrollment first.

## Keys and release configuration

The Android secure APK must never contain the project-wide DataShare HMAC or the credential migration pepper.

### Local developer machine

Put signing material in the ignored repository-root .env file. Do not commit it or paste values into chat.

- KEYSTORE_PATH
- STORE_PASSWORD
- KEY_PASSWORD
- KEY_ALIAS
- ANDROID_UPLOAD_CERT_SHA256
- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY
- SUPABASE_CERT_PINS (optional)
- SENTRY_DSN (required for Android customer release builds)

The one-time Transition 2.4.1 build additionally requires the exact historical BEBOSS_SECURITY_PEPPER value used to produce installed PBKDF2-v1 credentials. That field is compiled only into Transition; it is migrated into Android Keystore on each terminal. The final Secure 2.5.0 build does not contain it. Secure release is gated by SECURE_CREDENTIAL_MIGRATION_APPROVED=true after every active Android terminal has reported a successful migration.

Use the scripts/rotate-android-upload-key.ps1 helper to generate a new upload key outside the repository and scripts/verify-android-release-signing.ps1 to verify the final artifact certificate. Follow the Play App Signing process in docs/ANDROID_DESKTOP_SECURITY_MIGRATION.md; a repository-only key replacement does not rotate the Play upload certificate.

### GitHub Actions

Configure protected signing values for signed Android release workflows, including:

- ANDROID_UPLOAD_KEYSTORE_B64 (if the release workflow uses a base64-uploaded key)
- ANDROID_UPLOAD_STORE_PASSWORD
- ANDROID_UPLOAD_KEY_PASSWORD
- ANDROID_UPLOAD_KEY_ALIAS
- ANDROID_UPLOAD_CERT_SHA256
- SENTRY_DSN or ANDROID_SENTRY_DSN
- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY
- SUPABASE_CERT_PINS (optional)

For the one-time Transition release only, provide BEBOSS_SECURITY_PEPPER as a protected secret. Do not provide it to Secure builds. Do not provide BEBOSS_DATASHARE_HMAC_SECRET to Android builds.

The legacy DataShare HMAC is a server-side compatibility key. Configure it only in protected Supabase Edge Function/server secret storage for verification of customer-held BBSHARE1/old globally signed BBSHARE2 exports and retained legacy cloud snapshots. New BBSHARE2 uses each shop's random protected pairing key, so new tokens can still be created and verified offline on registered devices.

The CI workflow inspects generated BuildConfig files and rejects either legacy secret in the secure Android variant. The release workflow validates the configured upload certificate fingerprint; Play Console registration and installed-device upgrade acceptance remain separate owner-controlled steps.

For signed Windows NSIS installers configure:

- WINDOWS_CODESIGN_PFX_BASE64
- WINDOWS_CODESIGN_PFX_PASSWORD
- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY

The normal Windows CI job builds an unsigned native installer for inspection. The tag release job signs it with Authenticode and verifies the signature before publishing the signed artifact.

### Supabase Edge Function secrets

A local .env file does not configure the deployed Supabase Edge Function environment. Configure payment secrets separately through the Supabase project secret manager:

- FLW_SECRET_KEY
- FLW_WEBHOOK_SECRET_HASH
- STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET only if Stripe is enabled
- BEBOSS_PUBLIC_URL

Never expose the Supabase service-role key or provider secret keys to Android, desktop-renderer JavaScript, Vite client variables, or public source control.

## DataShare compatibility and offline behavior

The final Secure Android APK has no global DataShare HMAC field and no client-side legacy HMAC fallback.

- New BBSHARE2 tokens are signed with a key derived from the registered shop's random 256-bit pairing credential, which is protected with Android Keystore. Current tokens remain verifiable offline on registered devices.
- Legacy BBSHARE1 and earlier globally signed BBSHARE2 tokens are verified by the Supabase Edge Function, not by a key embedded in Android. Automatic cloud restore uses a revocable per-device credential. Manual import uses the registered shop owner's SMS OTP. The server returns sanitized shop-bound data; the old signing key is never returned to the app.
- Raw .beboss backup files remain available for offline export, import and recovery.

The project-wide BEBOSS_DATASHARE_HMAC_SECRET remains a server-only read-compatibility key while legacy signed exports and retained snapshots still exist. It must never be added back to Android BuildConfig. Rotate or retire the server-side value only after retained legacy snapshots and customer-held BBSHARE1 exports have an accepted migration path.

## Required acceptance evidence

This change adds server and client code plus automated regression tests. It does not itself prove the following:

- production SMS delivery and owner OTP success on real Android devices;
- successful online refresh after the access-token expiry boundary;
- local offline recovery with queued writes and conflict reconciliation;
- cross-shop and revoked-device rejection against a deployed staging project;
- signed Android APK/AAB installation and upgrade on supported hardware;
- independent penetration testing by a qualified third party.

Record each test against a staging shop with two separate tenants and multiple devices before enabling legacy retirement for production shops.
