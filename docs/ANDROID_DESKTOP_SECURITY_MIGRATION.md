# Android, desktop telemetry and signing migration

**Target:** Android 2.5.0 secure release; Desktop 1.4.2 production telemetry  
**Repository:** obamamunyehirwe/beboss1  
**Safety rule:** do not publish the final secure Android build until every active terminal has completed the transition release and the owner-controlled signing identity has passed the appropriate direct-APK lineage or store-distribution upgrade checks.

## 1. APK secrets and DataShare architecture

The final Android secure flavor does not declare either BEBOSS_DATASHARE_HMAC_SECRET or BEBOSS_SECURITY_PEPPER in BuildConfig.

The old project-wide DataShare HMAC is server-only. New share tokens use each registered shop's random 256-bit DataShare key, derived for BBSHARE2 and protected locally by Android Keystore. Current BBSHARE2 creation and verification, encrypted LAN synchronization, and raw .beboss JSON backup export/import remain available offline.

Old project-signed BBSHARE1 and early global-key BBSHARE2 packets are no longer verified using a key embedded in Android. Supabase verifies those packets server-side:
- Enrolled devices use revocable per-device credentials; the server resolves the shop tenant and verifies the token with the protected server key.
- Manual imports use the registered shop owner's SMS OTP; the server verifies the owner, package signature, shop identity, schema and expiry, then returns sanitized JSON.
- The legacy HMAC key is never returned to Android.

Tampered, expired, unsupported and cross-shop packets remain rejected.

## 2. Staff credential compatibility: transition before secure

Old PBKDF2-v1 staff credential hashes were created using the original project pepper. The safe way to preserve offline verification without carrying that pepper in the final APK is to move the exact original value into each existing device's Android Keystore first.

The Android build now has two flavors:

| Variant | Version | Purpose | Legacy pepper in APK |
|---|---:|---|---|
| transition | 2.4.1 / versionCode 18 | One-time transfer of the original legacy pepper into that device's Keystore | Temporarily yes |
| secure | 2.5.0 / versionCode 19 | Final APK; v2 credentials need no pepper, v1 reads only the Keystore envelope | No |

On first launch of Transition 2.4.1, BeBoss seals the old value using Android Keystore AES-GCM and stores only the encrypted envelope in private device storage. It is not synced or exported. Existing v1 hashes remain usable offline on that device. When a staff member successfully signs in, existing app flows upgrade that hash to PBKDF2v2 using a random per-credential salt and no pepper.

Secure 2.5.0 has no compile-time pepper field. It can verify an old v1 credential only through the device-local Keystore envelope. All v2 authentication remains offline.

### Mandatory release order

1. Recover the exact original BEBOSS_SECURITY_PEPPER value used to create installed v1 hashes. Put it only in the ignored root .env file and the protected GitHub Actions secret. Never paste it into chat or commit it.
2. Build and distribute the signed Transition 2.4.1 release.
3. Install and open Transition 2.4.1 on every active Android terminal. Check Admin → Device Security telemetry and confirm the permissions/migration summary reports SECURED_IN_ANDROID_KEYSTORE.
4. Keep the transition release running until previously offline terminals reconnect and report their migration state. Missing or stale device telemetry is not proof of migration.
5. Review all active terminals. Only after every active device has reported a recent successful migration should the release owner set SECURE_CREDENTIAL_MIGRATION_APPROVED=true in the ignored .env / protected release environment.
6. Build Secure 2.5.0. CI checks that the secure BuildConfig does not contain either legacy field.
7. After transition is complete, remove the transition-only pepper from build environments and rotate the server-only DataShare HMAC separately. Keep device Keystore envelopes; do not clear app data or reset Keystore.

**Do not skip versionCode 18.** Play can update a device directly to the newest eligible version and is not required to install an intermediate release. Publishing version 19 too early can leave an offline device with old v1 hashes but no Keystore envelope. If any device has not migrated, do not clear data or uninstall BeBoss. Keep that device on its existing release, restore Transition 2.4.1 with the exact original pepper when possible, or complete an owner-authorized staff PIN/password reset after verifying a full backup.

If the original pepper is unavailable or has changed since those hashes were created, do not guess a replacement. The transition cannot verify those v1 hashes. Keep existing devices intact and use the owner-authorized staff credential reset/re-enrollment process after securing backups.

### Build commands (Windows)

~~~powershell
# One-time compatibility release
.\gradlew.bat :app:assembleTransitionRelease

# Final release; requires SECURE_CREDENTIAL_MIGRATION_APPROVED=true
.\gradlew.bat :app:bundleSecureRelease
~~~

CI builds both debug flavors, runs their unit tests, runs the secure emulator smoke test, and checks that the secure APK is secret-free.

## 3. Production crash and native panic reporting

Sentry is wired into:
- Android: real Sentry Android SDK crash and ANR reporting.
- Desktop React/WebView: Sentry React, unhandled error capture and a recoverable ErrorBoundary.
- Desktop native Tauri/Rust: Sentry native panic capture.
- Events are tagged by app/platform/release. Default PII, tracing, screenshots, view hierarchies and session replay are disabled.
- Desktop telemetry drops request bodies, headers, cookies, query strings, user objects, extras and breadcrumb data; diagnostic text is scrubbed for common credential formats and Rwanda phone numbers.

### Configure Sentry projects

Create Sentry projects controlled by BeBoss. Separate Android and Desktop projects are recommended.

Add these GitHub repository secrets under Settings → Secrets and variables → Actions:
- ANDROID_SENTRY_DSN: Android project DSN.
- DESKTOP_SENTRY_DSN: Desktop project DSN.

For one shared Sentry project, SENTRY_DSN is supported as a fallback.

Local files:
- Root ignored .env: SENTRY_DSN=<Android DSN>.
- desktop/.env.local: VITE_SENTRY_DSN=<Desktop DSN> and SENTRY_DSN=<Desktop DSN>.

A Sentry DSN is a public ingest identifier, not a service-role credential. Never put Supabase service-role keys, Sentry auth tokens or merchant secrets into a client build.

Android release packaging fails closed without a valid SENTRY_DSN. Desktop npm run dist, dist:win, dist:mac and dist:linux validate that both the renderer and native host have a DSN before creating release bundles. Development and CI smoke builds remain possible without a configured external Sentry project.

After setting DSNs, send a test event from Android and Desktop, then verify each event appears in the correct Sentry project with the expected release/platform tags. Code integration alone does not establish that event delivery works.

## 4. Rotate Android signing identity without breaking customer upgrades

A signing key previously committed to public Git history must be treated as exposed. Removing a file from the current branch does not rotate the key. The repository cannot reset the Play Console upload certificate without the app owner's authorized Google Play account.

Generate the new key locally with:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rotate-android-upload-key.ps1
~~~

This creates a new PKCS#12 key under the current Windows user profile, prompts for passwords interactively, exports only a public PEM certificate, and prints its SHA-256 fingerprint. It will not overwrite an existing key or certificate.

### When Play App Signing is enabled

1. Open Play Console → BeBoss app → Setup → App integrity → App signing.
2. Check the current App signing key certificate and Upload key certificate.
3. Submit the new public PEM using Google's Upload key reset process.
4. Wait for Google to accept and register the replacement upload certificate.
5. Put the new private .p12 outside Git. Configure KEYSTORE_PATH, STORE_PASSWORD, KEY_PASSWORD, KEY_ALIAS and ANDROID_UPLOAD_CERT_SHA256 in the ignored root .env and protected release environment.
6. Verify an artifact before publication:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-android-release-signing.ps1 -ArtifactPath .\app\build\outputs\bundle\secureRelease\app-secure-release.aab
~~~

With Play App Signing, a reset of the upload key does not change the Google-managed app-signing key used for customer-delivered updates. This is the preferred route to rotate upload credentials while preserving normal Play upgrade identity.

### Direct APK distribution without Google Play

BeBoss can distribute and update APKs directly from its private Supabase release bucket. The Android app's update check, signed download URL and Package Installer handoff do not use Google Play Services, Google Play APIs or a Google Play upload key. Direct distribution still requires a BeBoss-owned Android application-signing key because Android verifies signatures on every install and update.

For a new direct-distribution app, generate a self-managed key locally with `scripts/rotate-android-upload-key.ps1`, keep its PKCS#12 keystore outside Git, and configure `KEYSTORE_PATH`, `STORE_PASSWORD`, `KEY_PASSWORD`, `KEY_ALIAS` and `ANDROID_RELEASE_CERT_SHA256`. The legacy `ANDROID_UPLOAD_CERT_SHA256` environment name remains supported for existing environments.

For an already-installed BeBoss package, changing to a new certificate without signing lineage will be rejected by Android. The repository includes two local helpers:
- `scripts/create-android-signing-lineage.ps1` creates a proof-of-rotation lineage using the old and new private keystores.
- `scripts/sign-android-apk-with-lineage.ps1` signs a release APK using both signers and that lineage, then verifies supported Android signature ranges.

Both helpers prompt through Android SDK `apksigner`; passwords are not accepted as command-line parameters and no key material is committed. A standalone release owner can use this route without Play Console. The same key/lineage used for the APK must be the one selected in BeBoss Admin's Mobile release record.

**Important old-device boundary:** BeBoss currently supports Android API 24+. APK signing rotation is supported by Android from API 28. With a rotation boundary of API 28, Android 7/8 devices (API 24–27) still need the old signing certificate to verify updates. Because the historical BeBoss key was exposed in public Git history, those older devices cannot be made fully safe by a repository-only change. Either keep a controlled legacy-signing migration for that limited install base, move those devices to a separately named app after a verified encrypted backup/restore, or raise the minimum supported Android version only after the owner has approved that compatibility change. Do not clear application data or silently change the package name.

A proof-of-rotation lineage preserves Android's upgrade trust relationship; it does not retroactively make an exposed old key secret or prove that old releases were never tampered with. Verify the rotated APK on physical devices/emulators across API 24–27, 28–32 and 33+ before making it current.

### When Play App Signing is enabled

For deployments that also publish through Google Play, use Play Console's upload-key reset process to register a replacement upload certificate. This is a separate store-upload workflow; direct sideloaded BeBoss updates do not need Play Services or Play upload credentials. Do not confuse the Play upload certificate with the app-signing certificate installed on customer devices.

### Publish only after these checks

- The replacement upload certificate is accepted by Google Play, where Play App Signing is active.
- The release artifact SHA-256 signer fingerprint matches ANDROID_UPLOAD_CERT_SHA256.
- Existing-version Android devices upgrade successfully and retain the encrypted local database, Keystore keys, offline outbox, staff and subscription data.
- Backup and recovery has been tested.
- The old exposed private key is no longer used for new uploads.

The scripts automate local key generation and certificate checking. Play Console reset, certificate registration and installed-customer upgrade testing still require the app owner's authorized account and real devices; they are not claimed complete by a source commit.

## 5. Release gates and remaining owner actions

The build now blocks:
- Secure Android release unless SECURE_CREDENTIAL_MIGRATION_APPROVED=true.
- Android release without a valid Sentry DSN.
- Android release if the configured keystore/certificate fingerprint does not match.
- Desktop installer creation without both renderer and native crash telemetry configured.

The remaining external actions are: supply the exact historical credential pepper, migrate every active terminal, create/configure Sentry project DSNs and verify event delivery, reset/register the Android upload key in Play Console, and test upgrades on existing customer devices.
