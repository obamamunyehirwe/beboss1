# BeBoss cross-platform source audit — 26 November 2026

**Repository:** `obamamunyehirwe/beboss1`  
**Audited baseline:** `86ab2a41e40a7f97a0b56a4e2ffa3232bbf4ffd6` (`main`)  
**Scope:** repository inventory and targeted source review of the TanStack web application, merchant and Master Admin routes, Supabase Edge Functions and SQL migrations, Tauri/Rust desktop client, Android/Kotlin application, build configuration, tests and CI.

## Executive result

BeBoss is a real multi-platform codebase with native Android and Tauri desktop applications, a web merchant/admin platform, Supabase database policies and Edge Functions, and CI checks. The source is substantial, but repository inspection alone cannot establish that every feature works against a live tenant or that every production release is safe.

This review found and fixed two source/build defects on the accompanying audit branch:

1. Two Supabase SQL migrations shared the version `20261126103000`. The snapshot-prune security-invoker migration is now version `20261126103100`; the already documented desktop-release migration keeps its existing version. A new `npm run check:migrations` CI step rejects malformed migration filenames and duplicate versions.
2. The README documented `./gradlew` for Linux/macOS but the repository contained only `gradlew.bat`. An executable POSIX `gradlew` entry point was added and delegates to the checked-in Gradle wrapper JAR.
3. The two shared web admin audit-insert helpers ignored Supabase insert errors. They now emit structured server logs with the action and database error, without logging audit details or secrets. This is observability, not transactional coupling: an audit insert failure is still not rolled back with the business mutation.

The prior payment rejection issue was also traced to the generated `gateway_provider` projection being included in a BEFORE UPDATE guard even though PostgreSQL does not expose the recomputed generated value to that trigger. The existing migration `20261125040606_fix_generated_gateway_provider_guard.sql` corrects the guard to protect actual settlement evidence only. The correction is present in source; the corresponding migration still needs to be confirmed applied in the target Supabase project.

## Findings and release gates

### Critical — Android client secrets and signing history

The Android build still defines `BEBOSS_DATASHARE_HMAC_SECRET` and `BEBOSS_SECURITY_PEPPER` in client BuildConfig. A value embedded in an APK is extractable and must not be treated as a confidential server secret. Existing releases and stored credentials/tokens require a compatibility migration; removing the fields or rotating a shared key without a staged rollout can break existing shops and branch imports.

The earlier security remediation record also documents that a release keystore was committed to public Git history. Removing a file from the current tree is not key rotation. Generate and register the proper replacement key, verify installed-app upgrade compatibility, update protected signing secrets, and coordinate any history cleanup. Do not publish a production Android upgrade until the signing and DataShare/credential migrations are tested.

### High — Production and tenant acceptance not evidenced

- The prior remediation report says a dedicated staging Supabase project had not been provisioned. This review did not have project-provisioning access or isolated staging credentials to independently verify or run live Auth/RLS tests.
- The prior remediation report records Supabase leaked-password protection as disabled at that time. This is a Dashboard Auth setting, not a repository change; its current state must be checked in the Supabase Dashboard.
- Production-signed Android and Authenticode-signed Windows release evidence, physical-device and printer acceptance, and recovery tests cannot be inferred from a source build. Real signing certificates and hardware were not available to this audit.
- Payment code verifies provider transaction identity and value through the configured gateway. That does not prove live MoMo settlement or merchant payout reconciliation. Complete provider-backed test transactions and reconcile the settlement statement before making a production-settlement claim.
- Independent penetration testing, a staging tenant-isolation run, backup/restore drills and a multi-device offline-conflict acceptance test remain separate release gates.

### High — Desktop platform signing and CSP

The desktop Tauri configuration has a null macOS signing identity and the current CSP allows `'unsafe-inline'` styles. Configure Apple signing/notarization before distributing macOS installers. Tighten the desktop style policy only after replacing or validating the UI's inline style requirements; blindly removing the directive may break rendering.

Desktop feature parity must remain platform-accurate: Windows/macOS/Linux do not provide Android CameraX, Android Keystore, WorkManager or Android-specific Bluetooth printer services. Desktop uses native desktop equivalents; those equivalents require their own device and printer verification.

### Medium — Admin audit delivery semantics

The shared audit helpers now report failed inserts to server logs. A stronger audit guarantee would use a database transaction or server-side RPC that writes the privileged mutation and audit event atomically. Do not claim audit events are guaranteed until that is implemented and tested for the sensitive administrative mutations.

## Existing controls confirmed in source

The repository contains server-side admin authentication and delegated permission checks, RLS and tenant-isolation SQL regression tests, provider verification and payment state-transition logic, private release storage, an Android per-device credential migration path, desktop OS credential-vault and SQLCipher logic, and tests for Android persistence/sync, desktop restore and snapshot merging. These are valuable controls but do not replace running the complete pipelines against staging and real target devices.

## Verification limits

This was a GitHub source review and repository edit, not a local checkout or device lab run. The code changes are submitted on a separate branch so GitHub Actions can validate the web lint/tests/build, PostgreSQL migration and tenant-isolation suite, Windows desktop type/native/test/installer checks, and Android JVM/build checks. Until those checks complete successfully, the changes must be treated as pending CI verification. Production signing, provider settlement, live Supabase settings, physical hardware, staged migration rollout and independent security testing remain outside this source-only verification.

**Release decision:** do not mark this revision fully production-accepted or enterprise-certified until the critical signing/client-secret migration and the high-severity staging, platform, provider and independent-security gates are closed with recorded evidence.

## 2026-11-26 enterprise-readiness follow-up

The following additional source changes are prepared on the current release-readiness branch (pending its new CI run and review):

- The owner portal now uses a per-request server-only Supabase service client with a tenant header and owner/phone membership re-checks; branch/transfer operations remain constrained to that tenant. The implementation entered main through merged PR #160.
- The desktop share page now validates the current server-emitted shop-scoped BBSHARE2 token; Android Data Transfer manual signed-token imports are routed through the same authenticated shop-owner import flow. Legacy BBSHARE1 remains read-only migration compatibility.
- The new SQL migration revokes anon and authenticated grants on public.app_secrets and public.admin_bootstrap_emails, with regression coverage. The live schema inspection found those two residual table grants despite RLS being enabled without policies.
- Direct MTN MoMo Collections Request-to-Pay is implemented server-side with separate sandbox and migrated Rwanda production configuration. The server stores the provider reference before the request, treats HTTP 202 as pending only, polls the provider transaction-status endpoint, matches the exact RWF amount, external reference, payer MSISDN and financial transaction ID, and routes verified payments to the existing admin review/BB3 issuance flow. New tests cover sandbox configuration, production User ID/Credential Token, mtnrwanda, and settlement mismatch rejection.
- The MTN ledger migration extends the existing provider constraints and checkout throttle to include MTN_MOMO; it does not grant new client table access. CI now runs the provider adapter tests and SQL grant/constraint assertions.
- Direct Airtel Money API collection is intentionally not enabled. The supported Flutterwave hosted flow remains available for activated Rwanda MTN/Airtel methods. Airtel's developer portal requires app/product registration and production approval before its direct contract can be wired safely.

### Release gates still open

- The Android APK still carries the legacy DataShare HMAC and credential-hash compatibility fields required to read old BBSHARE and PBKDF2 records. New branch exchanges use the shop-scoped key and new credential hashes are portable PBKDF2v2, but removing the old fields before migration coverage/old-client retirement would break existing businesses.
- A release keystore was previously committed to public history. Key rotation and upgrade compatibility must be performed with your actual Play App Signing/upload-key process; a repository-only delete does not rotate a signing key.
- Configure the new MTN production secrets in Supabase Edge Function secrets, not only in a local .env: MTN_MOMO_USER_ID, MTN_MOMO_CREDENTIAL_TOKEN, the production Collections key, MTN_MOMO_ENV=production, MTN_MOMO_BASE_URL=https://momoapi.momo.africa, and MTN_MOMO_TARGET_ENVIRONMENT=mtnrwanda. Complete a real RWF collection and reconciliation before live customer use.
- Supabase leaked-password protection still needs to be enabled in Auth settings. The source changes cannot modify that dashboard setting.
- Build/sign the release artifacts using your local certificates; test Android on your hardware and exercise the printer, scanner, cash drawer, Bluetooth/LAN sync, offline outbox recovery and real-world multi-device conflicts.
- Complete isolated staging and independent security review before calling the system production-certified.

CI is the gate for source-level build and regression evidence; a green CI run does not itself certify merchant onboarding, live settlement, production signatures, or physical-device operation.
