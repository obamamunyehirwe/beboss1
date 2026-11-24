# BeBoss production-readiness audit — 24 November 2026

**Repository:** `obamamunyehirwe/beboss1`  
**Baseline reviewed:** `09e8c3b3f91048891532c58ce158ca79067fa5f1`  
**Scope:** Android POS, Tauri desktop client, TanStack web platform and admin console, Supabase functions/migrations, and release automation.

## Executive result

BeBoss is a substantial multi-platform retail application, not a blank scaffold. The repository contains a native Android POS, a native Tauri desktop client, a TanStack Start web application, Supabase migrations and Edge Functions, and CI workflows. There are real POS, inventory, customer-credit, purchase, reporting, branch, staff, device, transfer, subscription, backup, and administration workflows.

This source review does **not** support an unqualified “enterprise production-ready” claim. A critical tenant-identity migration remains open, production Android signing and physical-device acceptance are not evidenced, and some desktop capabilities are platform equivalents rather than replicas of Android-only hardware features. Source inspection and CI are not a penetration test or production acceptance test.

## Follow-on changes after the PR merge

The following additional changes were made directly on `main` after the initial audit/PR merge:

1. **Owner OTP/cloud API deployment:** deployed the existing SMS owner-verification function and the JWT-protected `beboss-desktop` Edge Function. The latter resolves the established BBSHARE signing key from the service-role-only `app_secrets` table when no Edge Function environment copy is set.
2. **Desktop Mobile Money proof claims:** added owner-authenticated MTN MoMo/Airtel Money claim creation using server-side registered-shop pricing, per-shop atomic rate limiting and an idempotency key. Claims remain `PENDING_VERIFICATION`; client notes and SMS text do not activate subscriptions.
3. **Desktop signed branch DataShare:** added server-signed BBSHARE1 branch export, server verification of HMAC/shop/owner/expiry and desktop merge through the existing version/tombstone rules. Desktop supports copy, download, paste and explicit `.beboss` file import.
4. **Branch-package recovery protection:** desktop rejects a branch package nonce already imported on the same installation, caps its local replay history, and enforces Android's 4 MB token/25,000 records per collection limits.
5. **Android DataShare release gate:** Android release builds now require the shared non-default DataShare HMAC key as well as the protected upload keystore. CI injects the repository secret when configured and tests that missing-key releases fail closed.
6. **Live database rate limiter:** deployed the `desktop_payment_claim` scope to the existing atomic sliding-window function and tested the allow-then-throttle behavior in the live database.

## Changes included in the original PR revision

1. **Desktop offline cache access:** the native secure-store key validator rejected the app's own `shop-cache:<owner>` namespace because it blocked every `shop-` key. The validator now permits only a syntactically constrained owner-cache key while keeping tenant-secret and device namespaces reserved. Native tests cover both allowed and rejected keys.
2. **Backup-import boundary:** the renderer previously passed an arbitrary filesystem path to a native command that read it. The native arbitrary-path read command has been removed. Restore now reads only a file explicitly selected by the user through the WebView file picker, with extension and 70 MB size checks, before decryption and snapshot merge.
3. **Setup upgrade detection:** startup now checks the recorded setup version as well as the completion marker. A changed desktop setup version therefore re-runs the real first-run diagnostics instead of ignoring the stored version.
4. **Windows installation:** the NSIS bundle now uses a per-machine install mode, invoking Windows UAC for installation. The installed app itself remains a standard-user process. The installer no longer opens broad inbound firewall exceptions, and uninstall no longer deletes an unrelated data directory.
5. **Desktop version coherence:** the desktop package, package lock, Rust crate, Tauri bundle, renderer bridge and installer registry version are aligned at **1.2.1**.
6. **Android release signing safety:** Android is advanced to version **2.3.2** (versionCode 16). Release variants no longer fall back to the public debug keystore; release signing tasks now fail with an actionable error unless the protected production upload keystore and its passwords are configured. CI continues to build the debug variant without requiring production signing secrets.
7. **Installer migration cleanup:** the supported installer removes only BeBoss-owned legacy inbound firewall rules and the obsolete `.bbbackup` association left by prior versions, while preserving all user shop data. Unused standalone NSIS templates that contained divergent and unsafe installer logic have been removed; the Tauri-generated NSIS installer is the single supported Windows path.
8. **Release-signing regression check:** Android CI now proves that the release-signing validation task rejects missing production credentials, independently of the debug APK build.

## Findings that remain release blockers

### P0 — Legacy Android tenant credential is predictable

The Android sync path still has a legacy tenant identifier derived from public owner details (normalized username plus the final nine phone digits) and sends it as `X-Shop-Sync-Key`. The database's legacy tenant RLS boundary still accepts that header. It is not a cryptographically strong credential and does not identify a specific actor, role or device.

The Nov 23 security audit and Nov 24 enterprise gateway rollout notes already describe this as an open blocker. The website/desktop owner OTP membership work does not remove the direct PostgREST legacy-header path used by existing Android clients.

**Required before high-assurance deployment:** server-generated random per-device credentials, hashed storage, verified owner enrollment/recovery, actor/device/role-scoped sessions, Android Keystore persistence, revocation/rotation, a dual-stack rollout, staging tests against forged headers and cross-tenant IDs, and measured retirement of the legacy RLS policy. Do not disable the legacy path before supported mobile clients and recovery are migrated; that can strand existing shops.

### P1 — Production Android release evidence and DataShare key provisioning are incomplete

The repository's Android verification workflow builds a debug APK and runs JVM/Robolectric tests. The release build now refuses to use a debug keystore and requires `KEYSTORE_PATH`, `STORE_PASSWORD`, `KEY_PASSWORD`, and a non-default `BEBOSS_DATASHARE_HMAC_SECRET` matching the protected server-side snapshot key. No protected production upload keystore or Play Console certificate was available in this session to produce and verify a production-signed APK/AAB.

The current live server-side `BEBOSS_DATASHARE_HMAC_SECRET` is not equal to the Android source's legacy fallback string. Existing APKs built without the shared secret may therefore reject desktop-generated BBSHARE1 tokens. The next production Android build must be compiled with the same protected secret; do not replace the live server key with the fallback or publish an APK without the key. Physical Android device, OS upgrade, offline recovery, backup/restore, and Bluetooth/USB printer acceptance also require hardware.

**Required:** configure protected CI signing credentials, validate the certificate fingerprint, sign and verify an APK/AAB, complete a staged rollout, and record a device/printer matrix.

### P1 — External security and identity assurance are incomplete

The source audit does not constitute independent penetration testing. The prior security review reports leaked-password protection disabled in Supabase Auth settings; this is a dashboard-level setting and cannot be proven changed from repository code. The optional security-concurrency integration suite needs an isolated staging database and has not been evidenced as run here.

**Required:** enable and verify leaked-password protection, run staging integration tests, commission independent penetration testing, remediate and retest findings, and document backup/restore and recovery drills.

### P1 — Payment rails must not be overstated

Hosted Flutterwave/Stripe checkout and signed provider-webhook verification are implemented in the web/Supabase flow. Manual Mobile Money proof review is not automatic MTN MoMo/Airtel settlement verification. Browser redirects, customer SMS references and uploaded screenshots are not proof of provider settlement.

**Required:** use only approved provider integrations and server-verified callbacks for automatic settlement; otherwise retain explicit manual-review status and clear operator evidence.

## Desktop/mobile feature-parity boundary

The desktop client implements the shared retail data workflows and desktop-appropriate equivalents, including keyboard-wedge USB barcode input, OS printing, operating-system credential storage, SQLCipher local data, offline outbox, branch/staff/device management, transfers, and backup/restore.

It cannot literally expose Android CameraX, Android Keystore, Android BiometricPrompt, WorkManager, nearby-Wi-Fi discovery, or Android-specific Bluetooth thermal-printer SDKs on Windows/macOS/Linux. Those Android-native workflows remain mobile capabilities; desktop equivalents must be described honestly and separately validated. The desktop ESC/POS command currently generates a printer byte sequence/spool artifact; it is not proof of a tested Bluetooth/USB printer transport.

## Verification status

- The latest reviewed source commit at audit update time is `df0e9095cbc5122a90b371bdc42c2590946e4ba8`.
- On the latest GitHub Actions run for that commit (`45486130947`), the Android JVM/unit-test, web production-build and Windows Tauri native checks were still running at the time of this audit update. Earlier workflow runs were cancelled when subsequent commits were pushed; a cancelled native job is not a pass.
- The last completed run before the Android HMAC release-gate change had Android unit tests and APK assembly successful and the web production build successful. Its Windows native check was cancelled while `cargo check` was running.
- The live Supabase project has the desktop OTP and desktop API functions deployed, and the desktop API is JWT protected. The live database has the desktop payment-claim rate-limit scope installed. The updated desktop API function is deployed at v2.
- The desktop release workflow has not produced a verified signed Windows installer in this session. Signing requires the configured Windows certificate and Supabase publishable-key repository secrets.
- No production-signed Android APK/AAB, physical-device/printer matrix, real provider settlement, independent penetration test, or staging migration from legacy Android tenant authentication is claimed.

## Release decision

**Do not label this revision enterprise-certified or fully production-accepted.** It is suitable for continued controlled engineering and staging validation once CI passes. The P0 tenant credential migration and the P1 signing, hardware, staging, and independent-security acceptance gates remain explicit release blockers.


## 2026-11-24 follow-up implementation — authenticated Android devices and release gates

The follow-up branch adds an additive per-device Android credential path:

- service-only SHA-256 credential digests bound to shop, device record, assigned user, role, expiry and revocation;
- owner-SMS-OTP enrollment and a single-use 90-day refresh token that rotates through a dedicated Edge Function;
- Android Keystore AES-GCM wrapping for tokens and a fail-closed no-downgrade rule when local Keystore decryption fails;
- an owner-approved shop-wide cutover that refuses to retire the legacy header until every active registered device has a current credential;
- transactional tenant-isolation regression SQL under web/supabase/tests/android_device_credentials.sql.

The same branch adds tag-triggered signed Android APK/AAB and Authenticode-signed Windows NSIS release jobs, plus a Windows native NSIS build artifact in CI. Production artifacts are gated on keys supplied by the repository owner; no production keystore or signing certificate is embedded in source.

The Flutterwave webhook was corrected to the documented flutterwave-signature Base64 HMAC-SHA256 exact-raw-body contract and the provider transaction is rechecked for exact transaction ID, reference, final successful status, RWF currency and amount. The Rwanda checkout uses Flutterwave's mobilemoneyrwanda option, which supports MTN and Airtel wallets when enabled on the merchant account. This is an aggregator route, not a completed direct MTN/Airtel API integration.

### Still not independently certified

This work is source implementation and CI preparation, not proof of full production acceptance. The migration is not safe to cut over for an individual shop until every active physical terminal has the new build and a successful enrollment. The owner must still supply signing and provider secrets, complete SMS/provider onboarding, run the signed release and hardware acceptance tests, and arrange an independent penetration test. The current shared DataShare HMAC material is compiled into Android for protocol compatibility and therefore is extractable from the client; it must not be described as a confidential signing key. Replace it with asymmetric signatures before treating a client-originated DataShare signature as high-assurance proof.
