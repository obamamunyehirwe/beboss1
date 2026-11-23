# BeBoss security rollout and release acceptance

**Date:** 23 November 2026  
**Repository:** obamamunyehirwe/beboss1  
**Production Supabase project:** ahlpvlhmpfiyeoercxol

## Implemented in this workstream

- Added a private rate-limit event table and a SECURITY DEFINER RPC. The RPC increments the counter atomically using a per-key transaction advisory locks and accepted request events. Only service_role can execute it; only SHA-256 hashes are persisted.
- Applied the atomic limiter migration to the production Supabase project.
- Deployed verify-legacy-bb2 Edge Function version 4. BB2 attempts now use an 8-attempt / 15-minute atomic IP-hash bucket. A database/RPC failure rejects verification closed with HTTP 503.
- Deployed submit-public-contact Edge Function version 1. It validates and bounds the request, limits each IP hash to 5 submissions per 15 minutes, inserts with the service role, and returns 429 with Retry-After when limited.
- Updated the contact page in the security branch to call the Edge Function instead of inserting directly from the browser.
- Added a second migration to revoke direct anon/authenticated inserts from contact_messages. This migration is intentionally staged and must only be applied after the updated contact page is deployed; applying it before the web rollout would break the currently deployed contact form.
- Added an opt-in PostgreSQL integration suite covering tenant RLS visibility, admin role revocation, concurrent invitation redemption, payment approval compare-and-set, and concurrent rate-limit calls. The suite refuses to run against the production project ref.

## Deployment sequence for the contact form

1. Deploy the web build containing the submit-public-contact invocation.
2. Verify a real successful submission appears in the Admin contact inbox and invalid/oversized submissions are rejected.
3. Apply 20261123183600_lock_public_contact_insert.sql.
4. Verify anon and authenticated roles can no longer insert into contact_messages directly, while the Edge Function can still insert.

The direct-insert policy is still present in production at the time this document was written. Do not mark public contact rate limiting complete until steps 1–4 have been verified.

## Integration test execution

The new suite is in web/src/lib/security-concurrency.integration.test.ts. It is opt-in because it inserts and removes fixture records and requires a dedicated isolated Supabase staging database.

Set these environment variables only in a protected staging runner:
- BEBOSS_RUN_SECURITY_INTEGRATION_TESTS=1
- BEBOSS_TEST_DATABASE_URL=<staging database connection string>
- BEBOSS_TEST_PROJECT_REF=<20-character staging project ref>

Then run from the web directory:
- npx vitest run src/lib/security-concurrency.integration.test.ts

The suite explicitly rejects the production project ref ahlpvlhmpfiyeoercxol. Do not point it at production. The default unit-test command skips this suite unless the opt-in flag is set.

The production rate-limit RPC received a live concurrency smoke test using eight simultaneous database calls with an allowance of five. Exactly five returned allowed=true and three returned allowed=false; the bucket count reached eight. The test key was removed afterwards. This verifies atomic counter behaviour, not the end-to-end contact browser flow or the BB2 redemption workflow.

The integration suite is added but has not yet been run against a separate staging database. The tenant visibility test covers the existing RLS header boundary; it does not prove that the legacy deterministic tenant key is secret. It is not evidence that the new random-credential actor/session model is complete.

## Random tenant credential and actor/session migration: release blocker

The current Android and web implementations still derive the tenant key from lowercase owner username plus the last nine digits of the phone number. Android sends that value in X-Shop-Sync-Key. The My Shop portal accepts username and phone without OTP or a signed-in owner session. Local POS PIN/password checks are device-local and are not server-verifiable actor sessions.

Do not switch production RLS to require new credentials until there is a safe enrollment/recovery path and all supported clients can use it. Doing so now would strand existing shops. Do not bootstrap a new credential using only the existing username/phone pair; that would let someone who knows the public identifiers claim the tenant.

Required migration sequence:

1. Establish verified owner proof for existing shops (OTP to the registered number or an already authenticated, owner-approved session). Choose and configure the delivery provider before coding the bootstrap endpoint.
2. Add a server-side tenant credential registry. Generate at least 256 bits of randomness on the server, store only a cryptographic hash, support rotation/revocation, and never return the raw credential after the one-time enrollment response.
3. Add per-actor, per-device sessions with server-side expiry and revocation. Every protected request must bind tenant, actor, device, role and branch; check the current active role/device on each request or use short-lived sessions with immediate revocation semantics.
4. Store mobile refresh credentials using Android Keystore-backed encrypted storage. Do not store tokens in logs, backups, ordinary preferences, URLs or analytics. The owner portal must use OTP or a Supabase-authenticated session and must stop returning full snapshots and payer details to identifier-only lookups.
5. Release a dual-stack Android/web version. New tenants use v2 immediately; existing tenants migrate through the verified owner flow. Instrument version and migration status without logging credentials.
6. Validate cloud sync, offline outbox, conflict resolution, backup/restore, device removal, actor role changes and app rollback on staging. Only then enable strict v2 RLS per tenant.
7. Raise the minimum app version after adoption is measured, provide a supported recovery path, then remove legacy deterministic-key policies and lookup endpoints.

No tenant credential/session schema cutover or new-client token issuance is included in this tranche. Treat this as an explicit blocker before claiming enterprise-grade tenant isolation.

## Physical device acceptance matrix

No physical devices or printers were available to this cloud session. All rows below remain NOT RUN and require recorded evidence on real hardware.

| Android API / OS | Device class | Online/offline and sync | Restore / upgrade | Printer |
|---|---|---|---|---|
| API 24 / Android 7 | Minimum-supported device | Offline sales, reconnect, queue replay, duplicate prevention | Upgrade from oldest supported Room schema; backup restore | USB OTG if supported |
| API 26 / Android 8 | Low-memory phone | Wi-Fi/mobile data loss and recovery | Backup restore and interrupted upgrade | Bluetooth ESC/POS |
| API 28 / Android 9 | Entry-level phone | Long offline period and clock changes | Backup validation | Bluetooth and USB |
| API 30 / Android 11 | Mid-range phone | Network switching, force-stop and WorkManager recovery | Upgrade with existing data | Bluetooth ESC/POS |
| API 33 / Android 13 | Mid-range phone | Notification/background restrictions and reconnect | Encrypted backup/restore | Bluetooth permission flow |
| API 34 / Android 14 | Recent phone | Reboot, offline edits, reconnect and conflicts | Upgrade/rollback recovery | Bluetooth + USB OTG |
| API 35 / Android 15 | Recent phone | Doze/background sync and airplane-mode transitions | Upgrade and restored database integrity | Bluetooth + USB OTG |
| API 36 / Android 16 | Current target API | Full sync, reconnect and permission regression | Install, update and backup/restore | Bluetooth + USB OTG |

For each device, record model, OS/API, app version, database version, network type, test operator, timestamps, screenshots/logs, printer model, paper width, connection type and result. Verify receipts are not duplicated after retries, restored data belongs to the correct tenant, incomplete backup generations are rejected, and no local data is lost when connectivity returns.

## Production Android signing and publication

The Gradle release configuration uses the upload alias and environment-provided KEYSTORE_PATH, STORE_PASSWORD and KEY_PASSWORD. No production upload keystore or signing passwords were available to this workstream, and no secret should be pasted into chat or committed to Git.

Before signing:
- Place the production upload keystore in a protected CI secret/environment and expose it only to the release job.
- Confirm the alias and certificate fingerprint against the Play Console upload certificate.
- Run Android JVM and instrumentation tests, build the release APK/AAB, verify the APK signature with apksigner, and verify the artifact certificate fingerprint.
- Install the signed artifact over the currently published release and verify retained data, Room migration, permissions, backup/restore and printer support.
- Publish first to a controlled internal/closed testing track; promote only after the physical matrix and independent review pass.

The existing verification workflow builds a debug APK, not a production-signed release. No production-signed APK/AAB was built or published in this workstream.

## Supabase Auth leaked-password protection

The live Supabase security advisor reports leaked-password protection disabled. The connected project-management tools available to this workstream do not expose an Auth password-security configuration setter, so this setting was not changed programmatically.

Enable it in the Supabase Dashboard under Authentication → Security and Protection / Password Security by turning on prevention of leaked passwords (Have I Been Pwned checks). Confirm the project plan supports the feature, save, and verify with an Auth password-policy test. See https://supabase.com/docs/guides/auth/password-security.

## Independent security review and assurance

No independent penetration test or external security review has been performed. Before any enterprise assurance statement, commission an independent reviewer to test at least:
- cross-tenant IDOR/RLS and forged legacy headers;
- owner portal enumeration and snapshot/payment-data exposure;
- actor/device role revocation and session replay;
- invite issue/redeem/revoke races;
- payment approval, unlock issuance and redemption races;
- public contact abuse, BB2 brute-force and rate-limit bypass;
- Android local storage, backup extraction, rooted-device behaviour and APK tampering;
- offline outbox replay, restore boundary and multi-device conflict handling.

Publish only a scoped test report with findings, severity, remediation evidence and retest status. Do not claim that this code review or automated checks constitute certification or penetration testing.
