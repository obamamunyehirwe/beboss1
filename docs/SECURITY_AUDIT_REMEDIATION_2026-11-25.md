# BeBoss security audit remediation — 25 November 2026

This document tracks the remediation work based on the 22 findings in the supplied audit. The production Supabase changes in this document have already been applied to project `beboss`; repository code changes are on the remediation branch and must pass CI/review before merge.

## Applied to production

- Applied migration `20261125211854_enterprise_admin_roles_public_release_visibility`. It adds delegated admin role grants and permission checks, updates staff access policies, and introduces the public/private release visibility control.
- Applied migration `20261125212015_public_apk_download_rate_limit`. It extends the existing atomic, service-role-only sliding-window limiter with the `public_apk_download` scope.
- Deployed `public-apk-download` Edge Function version **4**. It only returns signed links for releases where `is_public = true`, limits each keyed client-IP digest to 30 attempts per 15 minutes, returns HTTP 429 with `Retry-After` when limited, and fails closed if the gateway cannot provide a client IP or the limiter is unavailable. IP addresses are HMAC-SHA-256 hashed before being stored in the rate-limit table; raw IPs are not persisted.
- Verified the live schema contains `admin_role_grants`, `app_releases.is_public`, and `admin_set_current_app_release`; verified anonymous clients cannot execute the limiter RPC while `service_role` can.

## Implemented on this branch

- Removed the tracked root `release.keystore` from the branch tip and added it to `.gitignore`. The key remains in earlier public Git history until the repository history is separately rewritten; removal is not key rotation.
- Persisted non-secret Android admin filters, the selected admin tab, customer search/filter/sort state, non-secret sign-in/registration fields, and dashboard branch-menu state with `rememberSaveable`. PINs, passwords, the shop-join code, and generated unlock codes deliberately remain transient.
- Added a 60-second clipboard clear for copied admin unlock codes, with a state-driven feedback message. The clipboard clear only occurs when the copied value is still the unlock code, to avoid deleting a different item the user copied afterwards.
- Added confirmation dialogs before deleting a paired device or revoking an unlock code.
- Replaced the two hardcoded Admin Console labels with localization keys and added localized messages for the new confirmations and clipboard feedback.
- Added accessible descriptions to the dashboard announcement and branch-selector icons and to the Admin Console refresh/web-portal/copy actions.
- Replaced the nested customer filter `LazyRow` inside the parent `LazyColumn` with a horizontally scrollable `Row`.
- Replaced the Admin Console payment-configuration Toast and main customer-screen action Toasts with persistent, dismissible UI feedback.
- Expanded ESLint coverage from a hand-picked file list to all of `web/src` and `web/supabase/functions`, with core unsafe-evaluation rules.
- Standardized web dependency installation on the committed npm lockfile used by CI: removed `web/bun.lock`; CI continues to use `npm ci`.
- Aligned the checked-in migration file prefixes with the exact migration versions recorded in the live Supabase project.

## Remaining release blockers and follow-up work

These items are intentionally not marked fixed. A few require new cryptographic protocols, app-store key operations, hardware/emulator testing, or settings access that is not available from this repository deployment.

1. **Rotate the Android release signing key.** The old `release.keystore` is public in Git history. Generate/register a new upload or signing key using the correct Play App Signing process, update protected CI secrets, verify upgrade compatibility, and only then remove the old key from Git history in a coordinated rewrite. Do not treat deleting the current file as key rotation.
2. **Remove client-embedded shared secrets.** `BEBOSS_DATASHARE_HMAC_SECRET`, `BEBOSS_LAN_SYNC_SECRET`, and `BEBOSS_SECURITY_PEPPER` are still consumed by existing Android code and are still embedded in client builds. Simply deleting the fields would break DataShare verification, legacy LAN-device compatibility, or offline credential verification. Replace DataShare HMAC with a device-key/server-issued-token design, complete migration to per-shop LAN credentials before removing the legacy fallback, and redesign offline PIN/password verification before moving the pepper server-side. Until then, assume those values are extractable and rotate any server credential that may have been exposed.
3. **Create a dedicated staging Supabase project.** CI deliberately uses non-production placeholders today; no staging project was provisioned as project creation may incur charges. Provision isolated staging credentials and test Auth/RLS against that project when available. The existing local PostgreSQL migration/tenant-isolation CI job passed on the prior code commit; the latest branch commit is being rechecked.
4. **Enable leaked-password protection.** The Supabase security advisor still reports this Auth setting as disabled. Enable password breach protection in the Supabase Dashboard under Authentication security/password protection, then verify sign-in and signup policy behavior.
5. **Complete public-form abuse controls.** The APK endpoint now has rate limits; existing public-contact and desktop payment-claim flows already use the shared limiter. Perform a route-by-route review of every public/mobile-money proof submission endpoint and add CAPTCHA or equivalent bot mitigation where user friction and supported verification permit.
6. **Add a static RBAC coverage test.** Granular admin permission guards and database policies exist, but the new whole-tree lint step does not yet prove every new admin mutation is permission-guarded. Add a route/action-aware test that checks every server mutation path rather than only requiring a particular import in every UI route.
7. **Add Android instrumentation and multi-device synchronization tests.** CI already runs Android JVM unit/Robolectric tests and assembles a debug APK; it does not yet boot an emulator for instrumentation or simulate concurrent offline edits across multiple devices. Add emulator-based smoke tests and two-or-more-device conflict/outbox tests before release.
8. **Finish the remaining Android feedback/accessibility audit.** The primary admin actions and customer screen now have state-driven feedback, but some contact-picker helper paths still use Toasts and other decorative/meaningful icons across the app still require a complete screen-reader review. Unlock-code copy events are not yet written to a dedicated server audit event.
9. **Sign macOS desktop releases.** `tauri.conf.json` still has a null macOS signing identity. Configure a valid Apple Developer ID certificate and notarization credentials before distributing a macOS production bundle.
10. **Tighten the desktop CSP.** The current desktop policy still permits `'unsafe-inline'` styles. Replace inline style requirements with nonces/hashes or generated styles after validating the current UI bundle; removing it blindly can break rendering.
11. **Design and test SQLCipher recovery.** An owner-controlled encrypted recovery/export flow is still needed for the wrapped SQLCipher passphrase. This must be designed with device loss, account recovery, encryption-key rotation, and backup access in mind.
12. **Add offline Android receipt verification.** The Android app can create self-contained printable receipts/QRs, but an independent offline verifier that recomputes and validates the receipt payload is still not implemented. The web checksum is not a PKI signature and must not be represented as proof of issuer identity.
13. **Review security-advisor warnings for permission RPCs.** The current advisor flags three `SECURITY DEFINER` admin functions as callable by authenticated users. They are intentionally used by the delegated-admin UI and perform permission checks; keep their grants narrow and add targeted negative tests for non-admin and insufficient-permission users. Private RLS-enabled tables with no client policies are intentionally server-only and should remain inaccessible to anon/authenticated clients.

## Release readiness

This branch is a partial security remediation, not a clean security certification. Do not publish a new production-signed Android release until the release key has been rotated and the client-embedded secrets have a migration plan. The live public APK download endpoint and release visibility migrations are already active.
