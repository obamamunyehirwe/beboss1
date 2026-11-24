# Independent security assessment scope and evidence plan

## Current automated assurance

The repository includes automated source lint/tests, Supabase migration replay and tenant-isolation SQL tests. The database suite checks device bearer resolution, role/device binding, forged cross-tenant context, expiry, revocation, safe legacy cutover and anonymous permission boundaries. These are regression checks, not independent penetration testing.

## Required external assessment

Commission a qualified security tester with written authorization and an isolated staging environment. Provide synthetic tenants and test credentials only. The assessment should cover:

1. Tenant isolation: horizontal and vertical access across every REST table, RPC, Edge Function, desktop API and owner portal; forged/missing/expired/revoked credentials; legacy cutover and replay.
2. Authentication and account recovery: OTP enumeration, SMS abuse/rate limits, owner membership claim/revocation, device enrollment takeover, refresh rotation/replay, lost-device and Keystore-reset recovery.
3. Authorization: shop roles, assigned users, branch scoping, admin/staff separation, support access, service-role boundaries and privileged SECURITY DEFINER functions.
4. Data protection: SQLCipher key handling, Android Keystore, desktop OS credential vault, backup encryption, DataShare token integrity, logs/crash telemetry, secrets exposure and local filesystem permissions.
5. Application attack surface: IDOR/BOLA, injection, CSRF, SSRF, XSS, unsafe file import, path traversal, deserialization, dependency/supply-chain risks, rate limits and denial of service.
6. Payments: provider webhook authenticity, duplicate/replay handling, provider API re-query, amount/currency/reference binding, pending/failed events, idempotency, refund/reversal and manual approval bypass.
7. Offline behavior: queued-write tampering, stale credentials, multi-device conflict handling, deleted-device behavior and restoration from encrypted backups.

## Required deliverables

- Signed scope/authorization and test window.
- Tester identity, methodology, tools and build/commit hashes.
- Reproducible findings with severity, affected assets, impact and safe evidence.
- Remediation owner, due date and linked code change for each finding.
- Independent retest evidence showing each finding closed or formally accepted.
- Final report and residual-risk approval by the system owner.

Do not market the application as independently penetration-tested, certified or enterprise-secure until the external report and retest are complete. Never run destructive tests against production shops or live payment accounts.
