# BeBoss Cross-Platform Audit — 26 November 2026

## Executive assessment

The repository contains substantial web, administrator, Android and Tauri desktop functionality. A source-level review found several concrete authorization and tenant-context defects. Some fixes are already merged to `main`; the owner-portal tenant-client refactor and its regression checks are pending review in PR #160.

**This audit does not certify the product as production-ready.** A safe release still depends on a controlled Android device-authentication cutover, credential rotation, staging database acceptance, provider configuration, and real device/hardware testing.

## Confirmed code remediations

### Web and administrator

- Tightened server-side authorization for Copilot, inbox drafting, shop analytics and shop-record retrieval. Delegated staff now need the corresponding `analytics.view`, `shops.view` or `inbox.manage` permission; the browser UI is not the authorization boundary.
- Extended the RBAC regression checker so the AI and insights server actions are checked for authentication middleware and explicit least-privilege permission guards.
- The public contact Edge Function validates payload size and content, applies an atomic IP-based rate limit, fails closed when the client address or rate-limit service is unavailable, and only then inserts through the service role.

### Owner portal / Supabase tenant access

- The owner portal verified SMS-authenticated membership but then used a user client without the Android tenant/device headers required by database RLS. This left owner reads empty and caused owner mutations to fail.
- The submitted fix verifies the signed-in owner membership first, re-checks the registered username and phone against the exact shop row, and then creates a fresh server-only client for that shop. It does not reuse a mutable global client.
- Payments are scoped to the registered owner username and phone; unlock codes to the matching shop username and phone; announcements to global or exact-shop audiences; and devices, snapshots, branches, transfers and staff to the exact shop key.
- The LAN snapshot secret and owner phone are not returned to the browser.
- Branch creation rejects IDs already owned by another shop. Branch deletion protects the main branch and blocks deletion while active devices or staff remain assigned. Transfer requests now verify both active branches belong to the same shop and use server-side branch/owner labels.
- A narrowly scoped service-role resolver exception keeps server-only invite/revoke RPCs functional after the shop has completed legacy-key retirement. The public anonymous/authenticated legacy-header path remains disabled after cutover. Existing RPC checks still validate the owner, assigned user, device slot, branch and invite expiry.

### Desktop

- Corrected the desktop owner-management identity mismatch. Supabase Auth UUIDs and local `shop_users.user_id` values are different identity domains; owner device-management requests now resolve the active tenant OWNER row by the verified owner username and compare device assignment to that row's local user ID.
- Added a static CI regression check covering the tenant-scoped owner lookup and all desktop-management call sites.

### Android

- Marked camera hardware optional in the Android manifest so devices without a camera are not excluded from installing the POS app; camera-based barcode scanning can remain unavailable on those devices.
- Reviewed staff-data export and restore paths: PIN hashes and password fields are blanked before cross-device transfer and are also sanitized during restore.

## Open release blockers

### P0 — predictable legacy tenant key

The legacy `X-Shop-Sync-Key` is derived from owner username and phone suffix. While a shop has not completed the owner-approved device credential migration, a caller who can derive that value can still attempt direct Supabase REST requests with a forged header. This is a documented tenant-isolation risk, not solved by website OTP checks.

**Required before general release:** enroll every active Android/desktop terminal with random per-device credentials, verify rotation/revocation/expiry and offline outbox preservation, retire the legacy key per shop, and run direct PostgREST cross-tenant attempts in staging. Do not globally disable the legacy path while active offline devices still depend on it.

### P0 — exposed Android signing material in repository history

The existing security-remediation report records that an Android release signing key was historically committed. Removing a key file from the current tree does not invalidate copies in Git history or old build artifacts.

**Required:** treat the exposed key as compromised; rotate/reissue signing credentials according to the applicable Android signing/Play App Signing process, audit access and historical artifacts, and decide on a coordinated history rewrite. Never put the replacement key in the repository.

### P0/P1 — legacy client-side cryptographic constants

The Android build still contains legacy DataShare HMAC and credential-pepper compatibility values. Client-embedded constants are extractable and must not be treated as secrets. Removing them without a versioned migration would also break old snapshot verification and legacy credential checks.

**Required:** migrate existing records and snapshot formats to server/device-held random credentials, verify the installed-client fleet, then remove compatibility material in a staged release.

### P1 — deployment and infrastructure acceptance

- A separate staging Supabase project and full migration/rollback acceptance are still required.
- Supabase leaked-password protection is documented as disabled and must be enabled in project Auth settings.
- Production provider secrets and signed webhook delivery for MTN/Airtel collections must be verified against the actual merchant account; source code alone cannot prove real settlement or refund completion.
- Supabase SECURITY DEFINER functions and public/tenant grants need an independent review against the deployed schema and actual grants, not just static source inspection.
- Public contact and legacy-code endpoints have application-level rate limits, but anti-abuse coverage must be checked route-by-route and at the edge/WAF layer.

### P1 — desktop/mobile release and hardware acceptance

- macOS signing/notarization is not configured in the checked Tauri configuration. Windows production Authenticode signing and trusted download reputation also require a valid publisher certificate and release pipeline; source changes cannot remove SmartScreen warnings by themselves.
- The desktop CSP still permits inline styles; tighten it after confirming the UI/build does not depend on them.
- SQLCipher recovery/export, lost-device recovery, and restored-device trust need owner-controlled end-to-end acceptance.
- Offline receipt validation is not yet equivalent to a public-key-signed receipt authenticity scheme.
- Printer, scanner, cash drawer, camera, multi-device concurrency, offline reconnect, and upgrade/rollback behavior require testing on the actual supported hardware fleet.
- Accessibility requires real keyboard, screen-reader, contrast and touch-target acceptance.

## Validation and limits

- Repository changes were reviewed through GitHub source and diff inspection. The RBAC and owner-portal static regression assertions were checked against the branch source.
- PR #160 adds the dedicated `owner-tenant.server.ts` module, CI assertions and a transactional Supabase test for anonymous legacy-key rejection versus trusted server-only post-cutover context.
- GitHub Actions run [45801888069](https://github.com/obamamunyehirwe/beboss1/actions/runs/45801888069) was queued for the final PR head at the time of this report. A queued or cancelled run is not a passing run.
- No local Windows installer, signed APK/AAB, macOS package, deployed Supabase migration, payment settlement, physical printer/scanner, or independent penetration test was executed as part of this source audit.

## Change references

- Admin permission and Android install-compatibility fixes: PR #154 and subsequent desktop identity PR #155.
- Owner-portal RLS/client and tenant-safety work: PR #160.
- Prior release/security findings: `docs/SECURITY_AUDIT_REMEDIATION_2026-11-25.md` and `docs/PRODUCTION_READINESS_AUDIT_2026-11-24.md`.
