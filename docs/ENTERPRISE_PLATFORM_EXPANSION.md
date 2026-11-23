# BeBoss Enterprise Platform Expansion
## Implementation contract, architecture and production release gates

**Status:** Approved scope for phased implementation; not a claim that these modules are already delivered.  
**Baseline:** `main` at `c91f97ae9d8b76a25c875018827227b4c20bbc27`  
**Target:** Existing Android + web + Supabase product. Preserve current POS, Room data, offline outbox, branch transfer workflow, and existing customer records.

This document is the implementation contract for expanding BeBoss into a connected POS, ERP, inventory, AI, payments, enterprise and cloud platform. The work must extend the current product—not create unrelated demo pages, duplicated data stores, mock buttons, static dashboards, or placeholder API handlers.

## 1. Existing product baseline

The repository already contains working foundations that must be reused:

| Area | Existing foundation | Required extension |
|---|---|---|
| POS | Android checkout, multi-tender sale records, barcode scanning, receipt generation/printing, discounts and customer credit | Returns/credit notes, cashier shift and till reconciliation, configurable tax/discount controls, auditable voids, web/desktop POS parity |
| ERP / finance | Purchases, customer payments/debt, sales-based P&L and local user roles | Double-entry ledger, chart of accounts, AR/AP, supplier bills, expenses, cash/bank books, tax reports, payroll journals and period close |
| Inventory | Products, per-branch quantities, purchase history, stock transfers and low-stock suggestions | Warehouses/locations, immutable stock movements, batch/lot, expiry, serial/IMEI, reservations, valuation methods, lead-time forecasting and purchase suggestions |
| AI | Master-admin Copilot and platform-level analytics | Tenant-scoped merchant copilot, cited business insights, forecast explanations, anomaly review and permission-aware actions |
| Payments | POS tender capture and manual verification of BeBoss subscription payment claims | Merchant collections, verified callbacks, settlement reconciliation, idempotent refunds/payout approvals and provider statement matching |
| Enterprise | Branches, local collaborator roles, cloud users/devices and central platform administration | Multiple companies/legal entities, memberships, server-enforced permissions, consolidated reporting and immutable audit |
| Cloud | Android Room/SQLCipher, encrypted backup paths, outbox sync, HLC conflict handling and web portal | Verified actor/device sessions, staged credential migration, browser/desktop POS, recovery testing, DR objectives and operational observability |

**Critical distinction:** the existing MTN/Airtel subscription-proof workflow is not merchant-sale payment settlement. A POS tender marked “MoMo” or “Airtel” is currently a locally recorded payment method unless an approved provider transaction has been initiated and independently verified.

## 2. Non-negotiable engineering rules

1. **No destructive replacement of the current app.** Existing Room tables, snapshots, receipt history, subscription state and tenant data must survive upgrades. Use forward-only, tested migrations; do not use destructive Room fallbacks.
2. **One source of truth per business event.** Sales, returns, receipts, stock movements, payment attempts, refunds and journal postings need stable IDs and explicit lifecycle states. A retry must not create a second business event.
3. **Offline-first is a consistency contract.** Persist locally first where the operation is safe offline, append an outbox event in the same Room transaction, and use idempotency keys plus causal metadata on replay. Operations that need a provider or current server authorization must remain pending/blocked while offline; never report success before confirmation.
4. **Append-only financial audit.** Posted journal entries and completed payment events are immutable. Correct them with linked reversals/adjustments, never silent edits or deletes. Every privileged action records actor, company, branch, device, reason, timestamp and source event.
5. **Authorization at the server boundary.** Hiding a button or checking Android-local role flags is not authorization. Tenant, company, branch, actor, device and permission must be enforced on every cloud mutation and sensitive read.
6. **No secrets in the clients.** Provider credentials, webhook signing keys, service-role keys and signing keystores belong in protected server/CI secret stores. Do not place them in Android resources, Vite variables, source code, snapshots or logs.
7. **Fail closed.** Missing credentials, invalid signatures, unknown provider statuses, incomplete backup generations, unbalanced journals or stale permissions must not be converted into “success”, a zero-value record or an empty result.
8. **No fake production integrations.** Sandbox-only, pending setup, simulated and manually reconciled states must be labelled honestly. No hard-coded provider numbers, fake success callbacks, test OTPs or “AI predictions” based on invented data.

## 3. P0 — release blockers

### P0.1 Tenant identity, authentication and authorization v2

The current production tenant key is deterministically derived from the lowercased shop username and the final nine digits of the phone number. It is shared across devices and is not an enterprise credential. The My Shop portal currently accepts those identifiers without an owner-authenticated session and can return sensitive shop and snapshot information. Android PIN/password verification is local and is not a server-verifiable actor session.

**Do not simply change RLS to reject the legacy key.** Released clients depend on it; an immediate cutover would strand shops and break synchronization. Do not issue a new credential solely because a requester knows the username and phone number.

Required staged architecture:

- Introduce explicit `organizations` / `companies` / `shops` relationships. A company can own multiple shops and branches; all business rows must carry the correct tenant/company scope.
- Introduce verified owner and staff identities, memberships, device registrations and server-side sessions. Every session binds `tenant_id`, `company_id`, `actor_id`, `device_id`, role, branch scope, issue time, expiry and revocation state.
- Verify existing owners through a controlled recovery process (verified phone OTP or an already authenticated owner-approved session). A phone OTP requires a configured SMS provider, provider delivery testing, rate limits and abuse controls; it cannot be assumed active merely because client code exists.
- Generate at least 256 bits of random device/session credentials server-side. Store only a strong hash server-side; reveal the raw secret once; support rotation and immediate revocation. On Android, keep refresh credentials in Android Keystore-backed encrypted storage. Never include them in data exports or backups.
- Make the My Shop portal require an authenticated, verified owner session; do not return full cloud snapshots, payment proof details or device secrets to identifier-only lookups.
- Ship dual-stack clients. Measure migration adoption; validate sync, pairing, offline queues, conflict resolution, backup/restore and device revocation on staging. Only then enable strict v2 policies, raise the minimum supported app version and remove legacy access.
- Add cross-tenant, role-change, revoked-device, expired-session, replay and credential-rotation tests. Use negative tests as well as successful tests.

### P0.2 Merchant payment verification and reconciliation

Implement a server-owned payment state machine. Suggested states: `CREATED`, `SUBMITTED`, `PENDING_PROVIDER`, `SUCCEEDED`, `FAILED`, `EXPIRED`, `REVERSED`, `REFUND_PENDING`, `REFUNDED`, `RECONCILIATION_REQUIRED`.

Required data and controls:

- `payment_intents`: tenant/company, sale/order, provider, amount/currency, payer MSISDN (minimized/masked in logs), unique merchant reference/idempotency key, status, created/expiry times.
- `provider_events`: provider event ID, signature verification result, received payload hash, event time, processing result and deduplication key. Keep raw payload only where lawful/necessary and access-controlled.
- `settlement_lines` / `settlement_batches`: provider reference, amount, fees, net settlement, settlement date, matched intent and exception status.
- `refund_intents`: original payment, amount not exceeding refundable balance, reason, maker/checker approvals where required, provider reference and final outcome.
- Verify provider callbacks on the server using the provider's actual documented authentication/signature mechanism. Enforce amount, currency, merchant account, reference, environment and status checks. A client-submitted SMS, screenshot, USSD launch or user-entered transaction ID is evidence to review—not a trusted callback.
- Use idempotent initiation, callback processing and refund operations. Add status polling/reconciliation because callback delivery alone is not a complete accounting control.
- Keep provider secrets in Supabase/Vercel protected server secrets. Apply rate limits and redact credentials/phone numbers from logs.

**Provider onboarding gates:**

- MTN MoMo Open API uses asynchronous RequestToPay/Transfer processing. A `202 Accepted` response is not a successful payment. Production callback hosts must be registered; the MTN documentation states the callback is sent once without automatic retry, so a durable callback inbox plus polling/reconciliation is required. See [MTN callback setup](https://momodeveloper.mtn.co.rw/content/html_widgets/macul.html) and [MTN Open API getting started](https://momoapi.mtn.co.rw/content/html_widgets/f8f4l.html).
- Airtel Money requires developer registration, product selection, compliance/onboarding and production approval. Do not claim production access until that approval and live credentials exist. See [Airtel Rwanda Developer Portal](https://developers.airtel.co.rw/home).
- Build and validate each provider adapter in its sandbox first. Live activation is a separate release gate requiring merchant-owned credentials, callback registration and end-to-end settlement evidence. Do not paste credentials into GitHub or chat.

### P0.3 Staging and device acceptance

Use an isolated Supabase staging project and non-production provider accounts. The integration suite must never point at production. Cover:

- Tenant isolation and forged/legacy header attempts.
- Verified owner enrollment, actor/device pairing, role/branch restrictions, expiry and immediate revocation.
- Checkout, partial/full returns, discounts, taxes, cash drawer, duplicate receipt prevention and offline replay.
- Provider accepted/pending/success/failure/timeout/duplicate callback/invalid signature/wrong amount/reversal/refund and statement reconciliation.
- Concurrent purchases, stock reservations, lot/serial traceability, transfer and return races.
- Backup restore, interrupted migration, old-client compatibility, app rollback and missing/incomplete cloud snapshot recovery.
- Real Android devices across supported API levels; Bluetooth and USB/OTG ESC/POS printers; barcode scanners; poor network, airplane mode, force-stop, reboot and Doze conditions.

Record test operator, hardware model, OS/API, app/build/database version, timestamps, test data, logs and evidence. A green JVM test or successful APK build is not a substitute for hardware acceptance or independent security testing.

## 4. P1 — integrated business suite

### P1.1 Double-entry accounting and finance

Introduce an immutable, balanced ledger:

- Chart of accounts scoped by company, with account type, code, currency, normal balance, control-account status and active dates.
- Journal entry header and journal lines with debit/credit amounts in integer minor units, source event ID, posting period, branch/cost centre, actor, status and reversal link.
- Enforce exactly one currency per journal entry and `sum(debits) = sum(credits)`; reject zero-value, unbalanced and duplicate source postings.
- Map sales to cash/mobile-money/card clearing, revenue, discounts, tax payable and cost of goods sold/inventory. Map returns to linked sales reversals, returned inventory and refund liability. Map customer receipts to cash/bank and accounts receivable. Map supplier bills, payments, operating expenses, payroll and tax with explicit source references.
- Build accounts receivable/payable aging, trial balance, general ledger, profit/loss, balance sheet, cash flow, tax summaries, budget vs actual and period close/reopen controls.
- Support period locking, approval thresholds, attachments/evidence, audit trail and exportable accountant-grade reports. Never calculate a balance only by summing mutable UI state.

### P1.2 Procurement and warehouse inventory

Use a stock ledger rather than directly overwriting on-hand numbers:

- Suppliers, supplier contacts/terms, purchase requisitions, purchase orders, approvals, goods receipts, supplier bills, credit notes, payments and three-way match (PO vs receipt vs invoice).
- Warehouse and bin/location hierarchy, product units/conversions, stock movements, reservations, allocations and branch transfers.
- Lots/batches with manufacture/expiry dates, supplier lot, cost, received quantity and traceability. Serialised units require unique serials and status history. A lot or serial must never be received, sold, returned or transferred twice.
- FIFO/weighted-average valuation must be explicit and consistent with accounting; never silently recalculate posted historical costs.
- FEFO picking for expiry-controlled items, configurable warnings/quarantine, recall tracing, slow/obsolete/expired stock, reorder points, safety stock, supplier lead times and min/max replenishment.
- Every movement is idempotent, linked to its source event, and auditable by user/device/branch.

### P1.3 AI business intelligence

The merchant AI must be tenant-scoped and must use permitted, current business records only.

- Forecast demand with stated history windows, seasonality, lead time, stock-outs and confidence intervals. Show method, inputs, sample size, uncertainty and reasons; do not invent a forecast where history is insufficient.
- Deliver sales/margin/product/customer/branch/stock/cashflow insights and scheduled reports with drill-through to supporting records.
- Detect unusual discounts, refunds, voids, stock adjustments, login/device activity and payment mismatches as reviewable alerts. AI signals must not autonomously accuse, suspend users, change stock, move money or post accounting entries.
- Tool calls must be permission-checked server-side and auditable. Redact PII and never send PINs, passwords, payment secrets or provider credentials to the model.
- Separate predictive output from authoritative ledgers. Finance and inventory state changes require explicit human approval and deterministic validated business operations.

### P1.4 Enterprise multi-company and governance

- Support companies/legal entities, shared groups, shops, branches, warehouses, currencies, tax registrations and intercompany boundaries.
- Implement role + permission policies at the server boundary (for example company owner, finance controller, accountant, procurement officer, HR officer, warehouse manager, branch manager, cashier, auditor and read-only executive).
- Include maker/checker approvals for sensitive actions, delegated scope, effective dates, temporary access, separation of duties and permission-change audit.
- Provide consolidated dashboards while preserving legal-entity books and explicit intercompany due-to/due-from postings.
- Central administration must be separate from merchant tenancy. Platform support access should be time-bound, justified, audited and least-privilege.

## 5. P2 — advanced operations and ecosystem

### Manufacturing
Bill of materials with version/effective dates, routing/work centres, production orders, material reservations/issues, labour/overhead capture, work-in-progress, scrap/by-products, finished-goods receipt, quality checks, traceability and cost roll-up. Backflush only under an explicit configured rule.

### CRM and marketing
Lead/customer lifecycle, consent and communication preferences, segments, loyalty, campaigns, coupons, journeys, reminders and attribution. Require opt-in/opt-out records, suppression lists, frequency caps and audit. No bulk message can be sent merely because a phone number exists in the POS.

### Integrations and disaster recovery
Versioned API, signed webhooks, event delivery/replay, external ID mapping, connector scopes and per-tenant API keys. Prioritise accounting exports/imports (CSV and supported accounting systems), e-invoicing/tax integrations and documented ERP connectors. Define backup retention, encryption, restore drills, RPO/RTO, regional recovery, incident response, monitoring and operational runbooks. A backup is not proven until a restore test succeeds.

## 6. Shared data and service architecture

Use consistent boundaries across Android, browser and desktop-class web clients:

- **Offline domain:** Room/SQLCipher, repository/domain managers, append-only local outbox, stable operation IDs, retry/backoff/dead-letter handling, HLC conflict resolution and explicit sync receipts.
- **Cloud domain:** Supabase Postgres with RLS, private schemas for internal tables/functions, Edge Functions for privileged provider/identity operations, protected secrets, tenant-aware audit and server-enforced idempotency.
- **Web domain:** merchant ERP/analytics/owner portal and desktop POS consume the same server contracts as Android. Desktop browser support is not a second independent database.
- **AI domain:** server-side gateway + tenant-scoped query tools, permissions and audited output. The model does not receive unrestricted SQL or service-role credentials.
- **Financial domain:** immutable business source events mapped once to journal entries; retries reuse source IDs; reversals are linked.
- **Integration domain:** provider adapters and external connectors are isolated from POS/UI and share validated state machines.

Use RWF integer values for whole-franc business amounts unless a provider/product explicitly supports fractional currency. Persist the currency code with every financial amount. Use UTC timestamps for cloud events and display in the shop's configured timezone. Store quantities at adequate precision for the unit, with explicit conversion rules.

## 7. Acceptance standard for every module

A module is complete only when all of the following are true:

- End-to-end create/read/update/reverse flows are implemented in the real app UI and backed by domain services, persistence and permission checks.
- Existing Android/web records and data exports remain compatible; migration and rollback/restore paths are tested.
- Offline and online behaviour is defined; retries and duplicate deliveries are tested; conflicts are visible and recoverable.
- Database constraints, RLS, indexes and API grants are reviewed. Exposed Supabase tables require deliberate grants and RLS; do not rely on table creation alone to expose Data API access.
- Unit, integration, concurrency, migration, RLS and workflow tests pass. Test data is synthetic or isolated.
- Error, pending, failed, denied and incomplete states are usable—not silently presented as success.
- Audit, monitoring, alerting, operational runbooks and user-facing support information exist.
- The production environment, secrets, provider approvals, hardware and release signing are configured and verified.
- Release notes describe what is truly enabled, and a rollback path is documented.

## 8. Delivery sequence and exit gates

| Release tranche | Work | Exit gate |
|---|---|---|
| P0-A Identity | Owner verification, random per-device credentials, actor sessions, RLS v2, dual-stack migration | Staging security/concurrency suite passes; existing devices can migrate and recover; no unauthorized tenant reads/writes |
| P0-B Payments | MTN/Airtel sandbox adapters, signed callbacks, status polling, settlement ledger, refund workflow | Provider sandbox evidence; duplicate/late/forged callback tests pass; live merchant onboarding/credentials then verified in production |
| P0-C Release validation | Staging data, Android hardware/printer matrix, security review, backup/restore, monitoring | Recorded acceptance results; no open critical/high security issue; signed release candidate |
| P1-A Finance | Chart of accounts, balanced journal engine, sales/returns/purchase/expense postings and financial statements | Trial balance balances; source replay creates one posting; reversals and period locks verified |
| P1-B Supply chain | Suppliers, procurement approvals, goods receipt, warehouse/lot/serial ledger and replenishment | Physical stock reconciles to movement ledger and valuation; traceability/expiry and concurrency tests pass |
| P1-C Intelligence & enterprise | Merchant AI, forecasting, anomaly review, companies, roles and consolidated reporting | Tenant scoping, AI evidence, permission and audit tests pass |
| P2 | Manufacturing, CRM/marketing, connectors and DR | Domain acceptance, compliance review, integration certification and successful DR restore/drill |

## 9. External inputs and production blockers

The following are intentionally not replaced with fake defaults:

- A production SMS/WhatsApp OTP provider configured in Supabase Auth, with approved sender, rate limits, CAPTCHA/abuse protection and verified delivery to Rwanda numbers.
- MTN MoMo merchant API subscription, production API user/key and registered HTTPS callback host; MTN sandbox credentials for integration tests.
- Airtel Money developer account, chosen products, required business compliance/onboarding and production approval/credentials.
- Separate staging Supabase project and staging secrets. Never run destructive integration fixtures against the live tenant database.
- Production Android upload keystore and matching Play Console certificate, available only through protected CI secrets.
- Named testers and actual Android devices, scanners and representative ESC/POS printers.
- Finance owner/accountant to approve chart of accounts, tax rules, payroll policy, valuation method and statutory reports for the jurisdictions where BeBoss will operate.
- Legal/compliance review for provider contracts, payments, data protection, payroll, tax/e-invoicing and marketing consent.

## 10. Honest current status

This scope document does not make the features above implemented. At the time of writing:

- Android POS checkout, barcode scanning, receipts, customer debt, purchases, branch and transfer foundations already exist.
- The accounting engine is not yet a complete double-entry general ledger.
- The inventory model is not yet a full lot/serial/expiry warehouse ledger.
- Existing AI Copilot functionality is platform-admin oriented; a tenant-scoped merchant decision assistant is still required.
- MTN/Airtel subscription proof is manually reviewed; merchant sale collection callbacks and settlement reconciliation are not yet a proven live integration.
- The legacy deterministic tenant key and unauthenticated My Shop lookup remain the primary identity migration blocker identified by the security audit.
- Physical device/printer acceptance, production-signed Android publication and independent penetration testing remain separate release gates.

Do not close a roadmap item based on this document, a mock/demo screen, a test-only adapter, or a successful compilation alone. Link each completed item to its code, migration, tests, production configuration and evidence.
