# BeBoss production-readiness audit — 24 November 2026

**Repository:** `obamamunyehirwe/beboss1`  
**Baseline reviewed:** `09e8c3b3f91048891532c58ce158ca79067fa5f1`  
**Scope:** Android POS, Tauri desktop client, TanStack web platform and admin console, Supabase functions/migrations, and release automation.

## Executive result

BeBoss is a substantial multi-platform retail application, not a blank scaffold. The repository contains a native Android POS, a native Tauri desktop client, a TanStack Start web application, Supabase migrations and Edge Functions, and CI workflows. There are real POS, inventory, customer-credit, purchase, reporting, branch, staff, device, transfer, subscription, backup, and administration workflows.

This source review does **not** support an unqualified “enterprise production-ready” claim. A critical tenant-identity migration remains open, production Android signing and physical-device acceptance are not evidenced, and some desktop capabilities are platform equivalents rather than replicas of Android-only hardware features. Source inspection and CI are not a penetration test or production acceptance test.

## Changes included in this revision

1. **Desktop offline cache access:** the native secure-store key validator rejected the app's own `shop-cache:<owner>` namespace because it blocked every `shop-` key. The validator now permits only a syntactically constrained owner-cache key while keeping tenant-secret and device namespaces reserved. Native tests cover both allowed and rejected keys.
2. **Backup-import boundary:** the renderer previously passed an arbitrary filesystem path to a native command that read it. The native arbitrary-path read command has been removed. Restore now reads only a file explicitly selected by the user through the WebView file picker, with extension and 70 MB size checks, before decryption and snapshot merge.
3. **Setup upgrade detection:** startup now checks the recorded setup version as well as the completion marker. A changed desktop setup version therefore re-runs the real first-run diagnostics instead of ignoring the stored version.
4. **Windows installation:** the NSIS bundle now uses a per-machine install mode, invoking Windows UAC for installation. The installed app itself remains a standard-user process. The installer no longer opens broad inbound firewall exceptions, and uninstall no longer deletes an unrelated data directory.
5. **Desktop version coherence:** the desktop package, package lock, Rust crate, Tauri bundle, renderer bridge and installer registry version are aligned at **1.2.1**.
6. **Android release signing safety:** Android is advanced to version **2.3.2** (versionCode 16). Release variants no longer fall back to the public debug keystore; release signing tasks now fail with an actionable error unless the protected production upload keystore and its passwords are configured. CI continues to build the debug variant without requiring production signing secrets.

## Findings that remain release blockers

### P0 — Legacy Android tenant credential is predictable

The Android sync path still has a legacy tenant identifier derived from public owner details (normalized username plus the final nine phone digits) and sends it as `X-Shop-Sync-Key`. The database's legacy tenant RLS boundary still accepts that header. It is not a cryptographically strong credential and does not identify a specific actor, role or device.

The Nov 23 security audit and Nov 24 enterprise gateway rollout notes already describe this as an open blocker. The website/desktop owner OTP membership work does not remove the direct PostgREST legacy-header path used by existing Android clients.

**Required before high-assurance deployment:** server-generated random per-device credentials, hashed storage, verified owner enrollment/recovery, actor/device/role-scoped sessions, Android Keystore persistence, revocation/rotation, a dual-stack rollout, staging tests against forged headers and cross-tenant IDs, and measured retirement of the legacy RLS policy. Do not disable the legacy path before supported mobile clients and recovery are migrated; that can strand existing shops.

### P1 — Production Android release evidence is incomplete

The repository's Android verification workflow builds a debug APK and runs JVM/Robolectric tests. The release build now refuses to use a debug keystore and requires `KEYSTORE_PATH`, `STORE_PASSWORD` and `KEY_PASSWORD`, but no protected production upload keystore or Play Console certificate was available in this session to produce and verify a production-signed APK/AAB. Physical Android device, OS upgrade, offline recovery, backup/restore, and Bluetooth/USB printer acceptance also require hardware.

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

- Repository source and project configuration were reviewed through GitHub.
- The baseline `main` verification workflow had Android JVM tests and the web lint/test/build job complete successfully; its desktop native job was still running at the time of this audit.
- The desktop release workflow did not produce a verified signed installer in the inspected runs. Signing requires the configured Windows certificate secrets.
- Changes in this revision must pass the pull-request workflow before merge. No physical-device, real payment-provider, production-auth, or penetration test is claimed.

## Release decision

**Do not label this revision enterprise-certified or fully production-accepted.** It is suitable for continued controlled engineering and staging validation once CI passes. The P0 tenant credential migration and the P1 signing, hardware, staging, and independent-security acceptance gates remain explicit release blockers.
