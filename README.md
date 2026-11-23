# BeBoss POS

**Offline-first Android Point of Sale, Multi-Branch Inventory & Credit Ledger, Encrypted Sync Engine, and Companion Web & Master Admin Platform.**

BeBoss (`com.beboss.shopmgmt`) is a full-stack retail operating system built for independent shops and multi-branch merchants operating in bandwidth-constrained environments across Rwanda and East Africa. It pairs an **offline-first encrypted Android POS terminal** (`/app`) with a **TanStack Start web marketing site, merchant self-service portal, and Master Admin command center** (`/web`) backed by **Supabase PostgreSQL**.


## Investor overview — a retail operating platform built to grow

BeBoss brings together an offline-first Android point of sale, inventory and customer-account workflows, branch-aware operations, and a central web administration platform. The product is designed to support the path from an owner-operated shop to multi-location retailers, pharmacies, wholesalers and service operators.

### The product in one view

| Layer | What is implemented |
|---|---|
| Store execution | Android checkout, barcode-assisted product lookup, split tenders, customer credit, receipts, purchases, stock adjustments and day-to-day reporting |
| Continuity | Local encrypted business data, offline transaction capture, queued synchronization, and shop-scoped LAN/hotspot transfer after device pairing |
| Multi-location operations | Branch and staff records, branch-aware permissions, device pairing, stock-transfer workflows and consolidated operating visibility |
| Central management | Web-based shop, user, device, payment-claim, release, announcement, inbox, audit and operational-analytics screens |
| Commercial controls | Subscription plans, device-linked licensing, admin-reviewed payment claims and payment-linked signed BB3 activation codes |

### Why this can serve larger operators

A multi-site deployment needs more than a checkout screen. BeBoss combines local execution at each counter with an administrative layer for branch structure, people, device registration, payment review and operational oversight. That architecture gives a growing operator a common workflow across locations while allowing individual Android terminals to continue recording sales when internet connectivity is interrupted.

The product can be piloted vertically and expanded by location: validate a representative branch, import and reconcile the catalogue, assign named roles, test the exact phones and printers, verify offline and synchronization behaviour, and then repeat the accepted deployment pattern across more sites. This is a rollout model—not a claim that every enterprise integration or deployment scale has already been certified.

### Commercial model and trust

The published subscription model includes a primary owner terminal and a fixed **2,000 FRw per month for each additional active paired device**. Payment claims are reviewed against the official MTN MoMo or Airtel Money merchant record before an administrator approves activation. BeBoss does not claim automatic provider settlement verification unless a separately documented provider integration is delivered.

Receipt checksums can detect changes to the receipt fields they cover; they are not a substitute for a digital signature or a guarantee of issuer identity. Security controls such as SQLCipher encryption, Android Keystore protection, role-based access and signed BB3 activation codes are described in the engineering sections below, with device- and configuration-dependent limits stated explicitly.

### Enterprise expansion path

The current architecture provides a base for larger deployments. Dedicated enterprise SSO, ERP/accounting connectors, formal contractual SLAs, independent security certifications, and multi-region disaster-recovery guarantees should be treated as separate delivery and validation work—not assumed from the existence of a multi-branch data model. Investor and customer pilots should measure reconciliation accuracy, checkout continuity, stock variance, staff accountability, device health and support cost against a recorded baseline.

---

## Table of Contents

1. [Product Positioning & Marketing Strategy](#1-product-positioning--marketing-strategy)
2. [Transparent Pricing & Licensing Model](#2-transparent-pricing--licensing-model)
3. [System Architecture (Android + Web + Cloud)](#3-system-architecture-android--web--cloud)
4. [Android Engineering Deep Dive (`/app`)](#4-android-engineering-deep-dive-app)
5. [Web Platform & Admin Engineering (`/web`)](#5-web-platform--admin-engineering-web)
6. [Security, Cryptography & `BB3` Unlock Protocol](#6-security-cryptography--bb2-unlock-protocol)
7. [Repository Layout](#7-repository-layout)
8. [Configuration, Build & Verification](#8-configuration-build--verification)

---

## 1. Product Positioning & Marketing Strategy

### Market Problem & Value Proposition
Independent retailers, pharmacies, hardware depots, wholesalers, and service businesses lose margin every week to five structural gaps:
1. **Checkout & Split-Tender Reconciliation Drift** — Paper ledgers cannot cleanly reconcile mixed tenders (Cash + MTN MoMo + Airtel Money + partial customer credit) or compute exact change without arithmetic errors.
2. **Unstructured Customer Credit (*Amadeni*)** — Informal credit notebooks lead to forgotten balances, overdue accounts, and customer disputes.
3. **Reactive Purchasing & Stockouts** — Shelves run out of fast-moving SKUs before owners realize it, while capital remains locked in slow-moving stock.
4. **Cloud Outage Lockouts** — Online-only POS apps stall checkout lines whenever cellular data drops.
5. **Multi-Branch & Staff Blindness** — Without per-cashier PIN accountability, audited voids, tamper-evident receipts, and branch-level sync, owners cannot scale beyond a single counter.

BeBoss addresses these directly with an **always-available Android terminal** that completes sales locally in milliseconds, synchronizes over local Wi-Fi/hotspot or cloud when online, and ships with a **4-language offline interface** (`English`, `Ikinyarwanda`, `Français`, `Kiswahili`).

### Next Android Build — 2.3.1 (versionCode 15; signed release pending)


The currently published, signed APK endpoint remains on **2.3.0 (versionCode 14)** until the 2.3.1 release is built with the production upload keystore and uploaded through Admin → App Releases. CI builds a debug APK for installation/testing; a debug-signed APK cannot replace an already installed production-signed app.

- **Supabase cloud sync:** Android uses the project's public `SUPABASE_PUBLISHABLE_KEY` as the `apikey` header and sends a Bearer token only when a real signed-in admin JWT exists. Legacy anon JWT configuration remains supported. A service-role/secret key is never shipped in the APK.
- **LAN terminal discovery:** opted-in nearby-Wi-Fi access enables discovery of BeBoss terminals on the same Wi-Fi or hotspot. The shop first completes one online cloud sync to provision its random per-shop LAN key; each device then stores that key encrypted by Android Keystore for later offline hotspot sync. Pairing and admin-approved device membership are required before encrypted branch transfer. This is not Bluetooth discovery of arbitrary phones.
- **Startup recovery:** encrypted Room/SQLCipher startup failures show a recoverable error and retry action rather than silently continuing into a blank screen. Existing shop data is not reset by this recovery UI.
- **License controls:** administrators can choose a signed BB3 code or direct cloud activation after manually verifying the payment in the official MTN MoMo/Airtel Money merchant account. Screenshots or customer SMS alone do not prove settlement.
- **Multi-device price:** the primary owner terminal is included; each additional active paired terminal is fixed at **2,000 FRw per month**, consistently computed by Android, web, Edge Function and Supabase database pricing logic.
- **Admin security:** the web Admin Sync monitor displays clock-integrity and device posture signals, permission state, optional recent foreground GPS, and privacy-safe outbound message aggregates. It does not expose recipients or message content.


### Target Commercial Verticals
BeBoss adapts during its 3-step onboarding flow for 8 retail & service verticals:
- **Mini-Supermarkets & General Retail** — CameraX barcode lookup, Hold/Resume queues, 58mm/80mm thermal receipts.
- **Pharmacies & Clinics** — Cost-margin tracking, audited stock adjustments (restock/damaged/expired), TIN/VAT receipt headers.
- **Hardware & Construction Depots** — Fractional units (`kg`, `m`, `pcs`), credit limits, installment repayment history.
- **Wholesale & Distribution** — Inter-branch stock transfers, bulk CSV export/import, supplier purchase ledgers.
- **Electronics, Fashion, Cafés & Salons** — High-ticket margin protection, custom quick sales, daily financial summaries.

### Go-To-Market & Conversion Funnel (How Marketing Works in `/web`)
The web app is engineered as an end-to-end acquisition and self-service conversion funnel rather than a static brochure:
1. **Interactive Capability Showcase (`/`, `ModernHero.tsx`)** — The phone-free homepage hero uses the supplied BeBoss retail artwork and lets visitors explore offline sales, multi-branch operations, four-language support, and Android compatibility through interactive capability tabs.
2. **Real Cryptographic Receipt Verifier (`/features`, `ReceiptVerifier.tsx`)** — Merchants and customers can inspect and verify receipt formats directly on the marketing site.
3. **Self-Serve Price & USSD Dialer Calculator (`/pricing`, `PricingCalculator.tsx`)** — Interactive steppers for branches, staff seats, extra POS terminals, and billing cycles compute the exact FRw total and output copy-ready **MTN MoMo** and **Airtel Money** USSD strings immediately.
4. **Honest Outcome Measurement Guide (`/pricing`)** — Instead of inflated marketing promises, the pricing page includes a **Pilot Measurement Matrix** instructing merchants to record baseline cash/MoMo mismatch, receivables collection speed, stock variance, and till reconciliation time over 4–8 weeks.
5. **Instant Trial + Merchant Self-Service (`/my-shop`)** — New shops start with a **4-day full-access trial** on Android, submit Mobile Money proofs online or via WhatsApp, track approval status in `/my-shop`, manage branches/stock transfers online, and unlock instantly via cloud auto-sync or signed `BB3` codes.

---

## 2. Transparent Pricing & Licensing Model

Pricing logic is synchronized **1:1** across Android (`OfflineSubscriptionManager.kt`), Web (`web/src/lib/pricing.ts`), and Supabase (`compute_expected_subscription_fee`) to eliminate billing discrepancies:

| Component | Pricing Rule |
| :--- | :--- |
| **Free Trial** | **4 days** full-access trial (`TRIAL_DAYS = 4`) on shop creation |
| **1 Branch (`SINGLE`)** | **5,000 FRw / month** |
| **2 Branches (`DUAL`)** | **10,000 FRw / month** |
| **3+ Branches (`MULTI`)** | **20,000 FRw / month** |
| **Staff Accounts** | 1st account free · `2–3` staff: `+2,000 FRw/mo` · `4–5` staff: `+4,000 FRw/mo` · `6+`: `4,000 + (workers - 5) × 1,000 FRw/mo` |
| **Extra POS Devices** | Primary owner device free · **+2,000 FRw / month** per extra paired terminal |
| **Billing Cycle Discounts** | Quarterly (`3 months`): **10% off** · Annual (`12 months`, `ANNUAL` tier): **20% off** |
| **USSD Payment Rails** | **MTN MoMo** (`*182*8*1*<code>*<amount>#` / `*182*1*1*<phone>*<amount>#`) & **Airtel Money** (`*500*1*1*<phone>*<amount>#`) |

---

## 3. System Architecture (Android + Web + Cloud)

```text
┌──────────────────────────────────────────────────────────────────────┐
│                     ANDROID POS TERMINALS (/app)                     │
│  Jetpack Compose M3  ·  ViewModel + 5 Domain/UI Coordinators         │
│  Room v16 (17 tables) + SQLCipher AES-256 + Android Keystore         │
│  Offline Outbox + HLC Clocks + Tombstones + Dead-Letter Queue        │
│                                                                      │
│    ├── Local LAN P2P Sync (LocalNetworkSyncServer / BBSHARE1)        │
│    └── Background & On-Demand Sync (WorkManager + OkHttp Pinning)    │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTPS (X-Shop-Sync-Key + TLS Pinning)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   SUPABASE POSTGRESQL & AUTH CLOUD                   │
│  shop_accounts · shop_users · shop_devices · payment_requests        │
│  unlock_codes · branch_snapshots · sync_events · admin_audit_logs    │
│  Row-Level Security (RLS) + RPC Fee Validation                       │
└───────────────────────────────▲──────────────────────────────────────┘
                                │ Server Functions & Live Queries
┌───────────────────────────────┴──────────────────────────────────────┐
│               WEB PLATFORM & ADMIN CONSOLE (/web)                    │
│  TanStack Start · React 19 · TanStack Router & Query · Tailwind v4   │
│  Public Site & Simulator · /my-shop Portal · /_authenticated/admin   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Android Engineering Deep Dive (`/app`)

### Tech Stack
- **Language & SDK**: Kotlin `2.2.10`, Android Gradle Plugin `9.1.1`, `compileSdk 36`, `targetSdk 36`, `minSdk 24`
- **UI**: Jetpack Compose BOM (`Material 3`), `WindowSizeClass` adaptive support, custom `@font/outfit`, `@font/plus_jakarta_sans`, `@font/syne`
- **Local Database**: **Room `2.7.0`** (Schema Version **16**, 17 entities) + **SQLCipher Android `4.20.0`** encrypted at rest
- **Networking & Serialization**: **OkHttp `4.10.0`**, **Retrofit `2.12.0`**, **Moshi `1.15.2`** (KSP codegen)
- **Background & Hardware**: **WorkManager `2.10.0`**, **CameraX `1.5.0`**, **AndroidX Biometric**

### Architecture & Modularity
The app follows **MVVM with Domain Managers and UI State Coordinators**:
- **Domain Engines (`/domain`)**: `SalesManager`, `InventoryManager`, `CustomerDebtManager`, `BranchTransferManager`, `AnalyticsEngine`, `StaffAuthManager`, `SubscriptionManager`.
- **Coordinator Layer (`/ui/viewmodel/coordinators`)**: `BeBossViewModel` delegates specialized state machines to `PosCartCoordinator`, `AuthSessionCoordinator`, `SyncCoordinator`, `AdminConsoleCoordinator`, and `DatabaseMaintenanceCoordinator`.
- **Startup & Smooth Rendering**: Heavy SQLCipher DB opening, session hydration, and network initialization run off the main thread; `MainActivity` uses edge-to-edge rendering and debug-gates `FLAG_SECURE` cleanly to avoid `SurfaceSyncGroup` stalls.

### Core Capabilities Implemented
1. **Checkout & Financial Precision**:
   - Integer-cents (`Long`) arithmetic (`MoneyUtils`) prevents IEEE-754 floating-point rounding drift.
   - Multi-cart **Hold / Resume**, 5 tender modes (`Cash`, `MTN MoMo`, `Airtel Money`, `Card`, `Split`, `Credit/Debt`), and atomic Room `@Transaction` commits (sale + items + stock deduction + debt balance + sync outbox item).
   - **CameraX Scanner (`CameraBarcodeScanner`)**: Camera preview with runtime permission handling, manual barcode lookup, and catalog quick-chips.
   - **Receipts & Exports**: Configurable `58mm` / `80mm` thermal layout preview, Android `PrintManager` print adapter, WhatsApp digital receipts, offline SHA-256 `BB-` receipt seals, PDF financial reports (`PdfReportGenerator`), and CSV/Excel exports (`ExcelCsvExporter`).
2. **Inventory, Branches & Multi-Terminal Fleet**:
   - Real-time cost vs. retail valuation, supplier purchase ledger, stock transfers between branches, and **14-day moving-average demand forecasting** (`AnalyticsEngine`).
   - **Shop Devices (`ShopDevicesDialog`)**: Pair extra POS tablets with generated `BB-XXXXXX` join codes, assign staff/branches, calculate `+2,000 FRw/mo` add-ons, toggle active status, or revoke access.
   - **Data Portability (`DataTransferDialog`)**: Compressed `BBSHARE1` snapshot export/import with HMAC verification and packet-nonce replay protection.
3. **Offline-First Sync Engine**:
   - **Hybrid Logical Clocks (`HlcClock`)** + `ConflictResolutionEngine` for deterministic Last-Write-Wins (LWW) conflict resolution across multi-device edits.
   - **Soft-Delete Tombstones (`SyncTombstone`)** propagate deletions accurately across terminals without ghost resurrection.
   - **Durable Outbox + Dead-Letter Queue (`SyncQueueDao`, `DeadLetterDao`)**: Failed mutations retry with exponential backoff; permanently failing payloads quarantine cleanly into `dead_letter_queue` instead of blocking the outbox.
   - **LAN P2P & Cloud Sync (`LocalNetworkSyncServer`, `SupabaseAdminClient`, `BeBossCloudSyncWorker`)**: Sync either over local Wi-Fi/hotspot or via chunked Supabase snapshots. Each shop receives a random 256-bit LAN pairing key from Supabase; each paired terminal wraps it with its own Android Keystore before HMAC-authenticated discovery and AES-GCM peer sync. Android 13+ asks for Nearby Wi-Fi access before discovery. This is BeBoss-terminal discovery over the same Wi-Fi/hotspot, not Bluetooth scanning of arbitrary nearby phones.
4. **Diagnostics & Maintenance (`DiagnosticsDialog` & `DatabaseMigrations`)**:
   - 3-tab diagnostics console inspecting security posture, Room/SQLCipher `PRAGMA integrity_check`, WAL checkpoints, pending/dead-letter queue counts, and unified local + cloud audit trails.
   - Full non-destructive Room migration chain (`MIGRATION_1_2` through `MIGRATION_13_14`) with idempotent table/column/index guards.
5. **Offline 4-Language Localization (`Localization.kt`)**:
   - Zero-network dictionary supporting `EN` (English), `RW` (Ikinyarwanda), `FR` (Français), and `SW` (Kiswahili) across onboarding, auth lock, POS, inventory, analytics, and settings.

---

## 5. Web Platform & Admin Engineering (`/web`)

### Tech Stack
- **Framework**: **TanStack Start `1.168`** + **TanStack Router `1.170`** + **React `19.2`** + **TypeScript `5.8`** + **Vite `8.1`** + **Nitro**
- **Data & Backend**: **TanStack Query v5**, **@supabase/supabase-js `2.119`**, **Drizzle ORM** + `postgres`, **Zod `3.25`** server-function validation
- **UI & Charts**: **Tailwind CSS v4**, **Radix UI**, **Lucide Icons**, **Recharts**, `qrcode.react`
- **Testing**: **Vitest `4.1`**, Testing Library, JSDOM, ESLint, Prettier

### Route Architecture
- **Public Acquisition & Support Routes (`/web/src/routes`)**:
  - `/` (`index.tsx`): Editorial hero with interactive `PhoneMockup` hardware demo, toolkit cards, live platform activity indicator, and APK install panel.
  - `/features`, `/pricing`, `/how-it-works`, `/guide`, `/download`, `/changelog`, `/faq`, `/contact`, `/status`.
  - `/my-shop`: Self-service merchant portal for checking license/expiry status, viewing issued unlock codes and paired device health, managing branches and inter-branch stock transfers, and submitting Mobile Money proofs.
  - `/api/public/download.latest.ts`: Public endpoint serving latest release download metadata.
- **Master Admin Console (`/web/src/routes/_authenticated/admin`)**:
  - Protected workspace with `analytics`, `shops` (`shops.index`, `shops.$shopId`), `payments`, `codes` (`BB3` generator/registry), `devices`, `sync`, `users`, `team`, `inbox`, `announcements`, `releases`, `copilot`, `audit`, and `settings`.

---

## 6. Security, Cryptography & `BB3` Unlock Protocol

| Layer | Implementation |
| :--- | :--- |
| **Database Encryption** | Room v16 + **SQLCipher AES-256**; passphrase protected via **Android Keystore** (`CryptoKeyManager`) |
| **Credential Storage & Auth** | PBKDF2-HMAC-SHA256 salted PIN/password hashing, persistent brute-force exponential lockout (`AuthRateLimiter`), hardware `BiometricPrompt` |
| **Unlock-Code Signing** | ECDSA P-256 / SHA-256. The private key stays in server-only Supabase `app_secrets`; Android contains only the matching public verification key |
| **Offline Verification** | New `BB3` codes are verified offline by Android using the pinned public key and account binding; no shared signing secret is shipped to devices |
| **Legacy Compatibility** | Old `BB2` codes are checked online against the exact BeBoss-issued, still-`ISSUED` database record and marked redeemed atomically |
| **Anti-Replay** | Local `RedeemedVoucher` fingerprints for offline BB3 use; server-side status transition for legacy BB2 online redemption |
| **Anti-Tamper Clock** | `ClockGuard` monitors `SystemClock.elapsedRealtime()` vs. wall clock to detect and preserve monotonic high-water timestamps against clock rollbacks |
| **Network Hardening** | OkHttp TLS certificate pinning (`SUPABASE_CERT_PINS`) + `SyncPayloadValidator` (schema bounds, FK & non-negative validation) |
| **Window & Log Privacy** | Release-mode `FLAG_SECURE`, `filterTouchesWhenObscured`, and `BeBossLogger.scrub()` redacting PINs, passwords, Bearer JWTs, unlock codes, and `BBSHARE1` packets |

### Account-Bound `BB3` Unlock Format

```text
BB3-[TIER]-[DAYS]-[EXPIRY_HEX]-[ACCT_HASH6]-[NONCE_96BIT]-[ECDSA_SIGNATURE_BASE64]
```

The signed payload is `BB3:TIER:DAYS:EXPIRY_HEX:ACCT_HASH6:NONCE`.

1. `ACCT_HASH6` is the uppercase six-character SHA-256 prefix of `lowercase(ownerUsername) + ":" + last9Digits(phone)`; Rwanda local and international phone formats normalize identically.
2. The final field is an ECDSA P-256 / SHA-256 signature encoded as Base64 DER. Verification is offline and uses only the public key embedded in the Android app.
3. The 96-bit nonce makes each issued code distinct. Codes carry a bounded expiry window and are bound to the intended shop username and phone.
4. The private key is not part of Android `BuildConfig`, app assets, browser storage, or any `VITE_*` variable. Authenticated server functions create new codes.
5. Legacy `BB2` HMAC codes can only be redeemed online if a matching original BeBoss database record exists and remains in `ISSUED` status. The server marks the record `REDEEMED`; the old client-shipped shared HMAC key is not used to issue codes.


## 7. Repository Layout

```text
.
├── .env.example                 # Required build-time secret keys (no real secrets committed)
├── app/                         # Native Android POS application (Kotlin + Compose M3)
│   ├── schemas/                 # Exported Room JSON schemas (versions 12–16)
│   └── src/
│       ├── main/java/com/beboss/shopmgmt/
│       │   ├── data/            # Room DAOs, 17 entities, AppDatabase v16, DatabaseMigrations, Repository
│       │   ├── domain/          # Business logic (Sales, Inventory, Debt, Transfers, Analytics, Auth, License)
│       │   ├── ui/              # Compose screens, dialogs, components, M3 theme, ViewModel + coordinators
│       │   └── util/            # SQLCipher/Keystore, HLC sync, LAN server, BB2 security, PDF/CSV, Localization
│       └── test/                # Robolectric & JVM unit tests (migrations, sync, security, UI dialogs)
├── web/                         # TanStack Start marketing site, /my-shop portal & /admin console
│   ├── public/                  # Brand marks, hero photography, retail assets
│   └── src/
│       ├── components/          # UI primitives, PhoneMockup, PricingCalculator, ReceiptVerifier, SiteLayout
│       ├── lib/                 # Pricing parity logic, Supabase queries, i18n dictionaries, server functions
│       └── routes/              # Public pages, /my-shop, /api/public, and /_authenticated/admin/*
├── gradle/libs.versions.toml    # Unified Android dependency catalog
└── metadata.json                # AI Studio project metadata
```

---

## 8. Configuration, Build & Verification

### 1. Environment Variables (`.env` / AI Studio Secrets)
Copy `.env.example` or configure these variables in your environment / Secrets panel (never commit secrets or use `local.properties`). Set `SUPABASE_URL` to the linked project URL and `SUPABASE_PUBLISHABLE_KEY` to its public `sb_publishable_…` key. A legacy `SUPABASE_ANON_KEY` JWT is accepted as a fallback. Never place `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in Android, `BuildConfig`, or the APK.

```properties
SUPABASE_URL=https://ahlpvlhmpfiyeoercxol.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_project_public_key
# Optional legacy fallback only: SUPABASE_ANON_KEY=your_legacy_anon_jwt
# BB3 private signing key is stored in Supabase app_secrets; never put it in Android or VITE_ variables.
BEBOSS_SECURITY_PEPPER=your_security_pepper
BEBOSS_LAN_SYNC_SECRET=your_lan_sync_secret
BEBOSS_DATASHARE_HMAC_SECRET=your_datashare_hmac_secret
BEBOSS_ADMIN_WHATSAPP=your_whatsapp_number_here
SUPABASE_ADMIN_EMAIL=your_admin_email_here
SUPABASE_CERT_PINS=none
```

### 2. Android Build & Test Suite
```bash
# Build debug APK
gradle :app:assembleDebug

# Run full JVM + Robolectric test suite (migrations, security, sync, Compose UI dialogs)
gradle :app:testDebugUnitTest
```

### 3. Web Development, Build & Tests
```bash
# Install & run local TanStack Start dev server (inside /web)
npm install
npm run dev

# Type-check, lint, test, and build production web bundle
npm run lint
npm run test
npm run build
```
