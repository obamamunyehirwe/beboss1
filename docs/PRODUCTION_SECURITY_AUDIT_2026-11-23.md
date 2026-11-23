# BeBoss production security and reliability audit

**Audit date:** 23 November 2026  
**Repository:** `obamamunyehirwe/beboss1`  
**Production Supabase project:** `ahlpvlhmpfiyeoercxol` (EU Central)  
**Scope:** Android application, web marketing and My Shop portal, authenticated Admin Center, Supabase database/RLS/functions, release and deployment configuration.

## Executive summary

The latest fixes improve incomplete-backup handling, database function permissions, Admin query error visibility, and device deletion authorization. These changes reduce specific verified risks; they do **not** certify that every line of the application is free from vulnerabilities.

The most important remaining production risk is the legacy tenant credential model: the shop sync key is deterministically derived from a shop username and the final nine digits of its phone number. The same value is used as the `X-Shop-Sync-Key` tenant header and is predictable enough that it must not be treated as a strong secret or enterprise identity credential. The public My Shop portal accepts those same two values without OTP or an authenticated owner session and returns shop data, payment information, devices, staff, and decoded cloud snapshots. This needs a versioned authentication migration before BeBoss is positioned for high-assurance enterprise deployments.

## Confirmed fixes applied

### Database execution grants and RLS

- Revoked direct client execution of trigger-only `SECURITY DEFINER` functions: payment-fee enforcement, LAN secret protection, and manual provider-verification enforcement.
- Restricted `is_beboss_admin()` and `is_beboss_staff()` so anonymous callers cannot invoke them. Authenticated policy checks and server-side admin checks retain their required execute rights.
- Restricted function search paths to `pg_catalog` for the audited privileged functions.
- Rewrote four admin/profile RLS policies to evaluate `auth.uid()` and role predicates as statement-level subqueries.
- Removed direct tenant deletion of `shop_devices`. The web owner portal now removes a device through `delete_shop_device`, whose private implementation validates the active actor and device ownership. Direct row deletion is reserved for BeBoss administrators.
- Restricted `record_apk_download` to the service role because the private-release download Edge Function is its only application caller. Public aggregate platform statistics remain readable by anonymous clients.

### Reliability and diagnostics

- Android cloud recovery only accepts complete snapshot generations and does not silently merge partial/malformed backup chunks. A previous complete generation may be selected when a newer upload is incomplete.
- The public My Shop lookup now checks each database result rather than silently converting query errors into empty collections.
- Snapshot decode/metadata failures are returned as an explicit diagnostic state; the portal does not label an undecoded snapshot as loaded records.
- Branch refresh failures are surfaced to the user instead of being swallowed silently.
- Admin query failures stop automatic retry/poll loops and are shown in a central Admin status panel with a deliberate retry action. Query errors are not represented as successful empty tables.
- Query retry policy is explicit (`retry: false`) to avoid repeated network retry storms. Scheduled Admin refresh is disabled for a query while it is in an error state.

## High-severity remaining issue: legacy tenant authentication

### Current behaviour

The tenant key is derived as:

```text
lowercase(trim(username)) + "_" + last9(normalized_phone)
```

The same predictable key is used in the `X-Shop-Sync-Key` request header and checked by tenant RLS policies. It is shared across devices in that shop. The web My Shop lookup accepts username and phone only, then reads tenant data and can decode the shop's cloud snapshot.

### Why this matters

- A username and phone number are identifiers, not strong credentials.
- The final nine digits of a phone number have a limited search space and can be known or guessed.
- Anyone able to recover that pair may be able to impersonate the tenant at the Data API boundary.
- A shared shop key does not distinguish an owner, manager, cashier or individual terminal. Device deactivation and role revocation are therefore not equivalent to immediate per-actor credential revocation.
- The unauthenticated owner portal returns sensitive records (including payment proof details, devices, staff and snapshot-derived shop data) based on those same identifiers.

### Safe remediation path

Do **not** abruptly disable the legacy key in production. Existing released Android clients depend on it, and an immediate RLS change would interrupt legitimate shops and cloud sync.

Use a staged migration:
1. Release a production-signed Android version with a server-generated random per-shop credential (at least 256 bits), stored using Android Keystore and rotated server-side.
2. Introduce authenticated device sessions or actor-signed requests so the backend can enforce owner/manager/cashier permissions independently of the shared tenant identifier.
3. Add OTP or an owner-approved session for the My Shop portal. Do not return full shop snapshots or payer details to an unauthenticated username/phone lookup.
4. Migrate shops and registered terminals, measure adoption, and retain the legacy path only for a time-bounded transition.
5. Raise the minimum supported app version and remove legacy RLS access only after supported production clients have migrated and validated backups exist.

**Release blocker:** Treat this as a blocker before claiming enterprise-grade tenant isolation or high-assurance identity controls.

## Additional findings and recommended work

| Area | Verified observation | Risk / recommended action |
|---|---|---|
| Mobile Money | Payment proof submission is not automatic settlement verification. Admin approval requires manual review of the official MTN/Airtel merchant record. | Keep this distinction visible; add provider API verification only through an approved merchant integration and signed provider callbacks. |
| Legacy BB2 rate limiting | Verification counts attempts and inserts an attempt record in separate requests. Concurrent requests can race the threshold. | Replace check-then-insert with an atomic database RPC/lock or Edge rate limiter, and test concurrent attempts. |
| Contact form | Public insert RLS validates fields and lengths, but no durable per-IP/email abuse limit or CAPTCHA was found in the audited flow. | Add server-side rate limiting, abuse monitoring and optional challenge before broad public promotion. |
| Admin auditing | Audit writes must be surfaced distinctly from action success without encouraging duplicate destructive retries. | Use an idempotent operation ID and explicit audit status; expose failed audit writes to the security dashboard. |
| Password security | Supabase Auth advisor reports leaked-password protection disabled. | Enable Supabase Auth password security / leaked-password checks in project Authentication settings. This dashboard-level setting was not changed by the code migration. |
| Unused indexes | The Supabase performance advisor reports 17 unused indexes. The production row counts are still small. | Do not drop indexes based on early usage counters alone. Re-evaluate after representative workload and query-plan measurements. |
| Device/browser compatibility | Automated CI builds and unit tests run, but physical Android/BlueStacks devices and representative ESC/POS printers were not tested in this audit. | Run a staged hardware matrix before calling the release validated for every phone, OS, printer and large-store environment. |
| Enterprise readiness | Multi-branch data models and an Admin Center exist, but enterprise SSO, ERP/accounting integration, formal SLA and independent security certification are not delivered by this release. | Scope these as separately tested delivery items; do not market them as existing functionality. |

## Operations and test evidence

- Production Supabase project reports `ACTIVE_HEALTHY` in EU Central.
- Supabase security/performance advisors were run before and after the grant/RLS hardening. The four RLS initialization-plan warnings disappeared.
- The three RLS-enabled tables without client policies (`admin_bootstrap_emails`, `app_secrets`, `unlock_code_verification_attempts`) are server-only by design. Client access is blocked.
- Vercel runtime error scan over the previous 24 hours found no clustered runtime errors; no production error-level logs were returned for the last 45 minutes. Absence of retained logs is not proof that the app never fails.
- PR #23 and PR #24 passed their web checks and Android JVM unit-test/debug-build workflows. The latest recovery change passed after an earlier transient Robolectric dependency-download failure.
- Live Home, Features and Download routes previously returned HTTP 200; the official download endpoint redirected to the currently published production APK.
- A production-signed newer Android APK and on-device BlueStacks/physical-device acceptance test were not produced as part of this audit.

## Release acceptance checklist

- [ ] Complete the random tenant credential + actor/session migration and staged client rollout.
- [ ] Add atomic rate limiting for BB2 and public contact submission.
- [ ] Enable leaked-password protection in Supabase Auth settings.
- [ ] Add integration tests for cross-tenant access, role revocation, invite redemption races, payment-approval races and concurrent rate limits.
- [ ] Run a physical device matrix (Android versions, offline/online transitions, restore, Bluetooth/USB printers, backup/upgrade path).
- [ ] Build and publish a production-signed Android release using the production upload keystore.
- [ ] Complete penetration testing and independent review before enterprise assurance claims.
