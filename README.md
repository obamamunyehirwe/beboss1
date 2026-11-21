# BeBoss POS

**Offline-first Android Point of Sale, Multi-Branch Inventory & Credit Ledger, Encrypted Sync Engine, and Companion Web & Master Admin Platform.**

BeBoss (`com.beboss.shopmgmt`) is a full-stack retail operating system built for independent shops and multi-branch merchants operating in bandwidth-constrained environments across Rwanda and East Africa. It pairs an **offline-first encrypted Android POS terminal** (`/app`) with a **TanStack Start web marketing site, merchant self-service portal, and Master Admin command center** (`/web`) backed by **Supabase PostgreSQL**.

---

## Table of Contents

1. [Product Positioning & Marketing Strategy](#1-product-positioning--marketing-strategy)
2. [Transparent Pricing & Licensing Model](#2-transparent-pricing--licensing-model)
3. [System Architecture (Android + Web + Cloud)](#3-system-architecture-android--web--cloud)
4. [Android Engineering Deep Dive (`/app`)](#4-android-engineering-deep-dive-app)
5. [Web Platform & Admin Engineering (`/web`)](#5-web-platform--admin-engineering-web)
6. [Security, Cryptography & `BB2` Unlock Protocol](#6-security-cryptography--bb2-unlock-protocol)
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

### Target Commercial Verticals
BeBoss adapts during its 3-step onboarding flow for 8 retail & service verticals:
- **Mini-Supermarkets & General Retail** — CameraX barcode lookup, Hold/Resume queues, 58mm/80mm thermal receipts.
- **Pharmacies & Clinics** — Cost-margin tracking, audited stock adjustments (restock/damaged/expired), TIN/VAT receipt headers.
- **Hardware & Construction Depots** — Fractional units (`kg`, `m`, `pcs`), credit limits, installment repayment history.
- **Wholesale & Distribution** — Inter-branch stock transfers, bulk CSV export/import, supplier purchase ledgers.
- **Electronics, Fashion, Cafés & Salons** — High-ticket margin protection, custom quick sales, daily financial summaries.

### Go-To-Market & Conversion Funnel (How Marketing Works in `/web`)
The web app is engineered as an end-to-end acquisition and self-service conversion funnel rather than a static brochure:
1. **Interactive Product Simulator (`/`, `PhoneMockup.tsx`)** — Visitors test POS checkout, receipt generation, customer credit reminders, 14-day stock estimates, and sync previews directly in the browser hero. Every screen clearly labels sample figures as non-production demo data.
2. **Real Cryptographic Receipt Verifier (`/features`, `ReceiptVerifier.tsx`)** — Merchants and customers can inspect and verify receipt formats directly on the marketing site.
3. **Self-Serve Price & USSD Dialer Calculator (`/pricing`, `PricingCalculator.tsx`)** — Interactive steppers for branches, staff seats, extra POS terminals, and billing cycles compute the exact FRw total and output copy-ready **MTN MoMo** and **Airtel Money** USSD strings immediately.
4. **Honest Outcome Measurement Guide (`/pricing`)** — Instead of inflated marketing promises, the pricing page includes a **Pilot Measurement Matrix** instructing merchants to record baseline cash/MoMo mismatch, receivables collection speed, stock variance, and till reconciliation time over 4–8 weeks.
5. **Instant Trial + Merchant Self-Service (`/my-shop`)** — New shops start with a **4-day full-access trial** on Android, submit Mobile Money proofs online or via WhatsApp, track approval status in `/my-shop`, manage branches/stock transfers online, and unlock instantly via cloud auto-sync or `BB2` codes.

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
│  Room v14 (17 tables) + SQLCipher AES-256 + Android Keystore         │
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
- **Local Database**: **Room `2.7.0`** (Schema Version **14**, 17 entities) + **SQLCipher Android `4.20.0`** encrypted at rest
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
   - **LAN P2P & Cloud Sync (`LocalNetworkSyncServer`, `SupabaseAdminClient`, `BeBossCloudSyncWorker`)**: Sync either over local Wi-Fi/hotspot or via chunked Supabase snapshots.
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
  - Protected workspace with `analytics`, `shops` (`shops.index`, `shops.$shopId`), `payments`, `codes` (`BB2` generator/registry), `devices`, `sync`, `users`, `team`, `inbox`, `announcements`, `releases`, `copilot`, `audit`, and `settings`.

---

## 6. Security, Cryptography & `BB2` Unlock Protocol

| Layer | Implementation |
| :--- | :--- |
| **Database Encryption** | Room v14 + **SQLCipher AES-256**; passphrase protected via **Android Keystore** (`CryptoKeyManager`) |
| **Secret Injection** | Zero hardcoded credentials; Gradle Secrets Plugin + `BuildConfig` reading `.env` / AI Studio Secrets |
| **Credential Storage & Auth** | PBKDF2-HMAC-SHA256 salted PIN/password hashing, persistent brute-force exponential lockout (`AuthRateLimiter`), hardware `BiometricPrompt` |
| **Constant-Time Crypto** | `MessageDigest.isEqual` (`slowEquals`) across `BB2` unlock codes, receipt seals, and LAN sync tokens |
| **Anti-Tamper Clock** | `ClockGuard` monitors `SystemClock.elapsedRealtime()` vs. wall clock to detect and preserve monotonic high-water timestamps against clock rollbacks |
| **Network Hardening** | OkHttp TLS certificate pinning (`SUPABASE_CERT_PINS`) + `SyncPayloadValidator` (schema bounds, FK & non-negative validation) |
| **Window & Log Privacy** | Release-mode `FLAG_SECURE`, `filterTouchesWhenObscured`, and `BeBossLogger.scrub()` redacting PINs, passwords, Bearer JWTs, `BB2` codes, and `BBSHARE1` packets |

### Account-Bound `BB2` Offline/Online Unlock Format
```text
BB2-[TIER]-[DAYS]-[EXPIRY_HEX]-[ACCT_HASH6]-[HMAC_SIG8]
Example: BB2-SINGLE-30-505B-A7F3C2-9E41D80B
```
1. **`ACCT_HASH6`**: Uppercase 6-character SHA-256 prefix of `lowercase(ownerUsername) + ":" + last9Digits(phone)`, normalizing formats like `+250788123456` and `0788123456` while rejecting mismatched accounts.
2. **`HMAC_SIG8`**: 8-character uppercase HMAC-SHA256 over `"BB2:$tier:$days:$expiryHex:$acctHash"` verified in constant time against `BEBOSS_UNLOCK_SIGNING_SECRET`.
3. **Anti-Replay**: `RedeemedVoucher` records each redeemed voucher's SHA-256 fingerprint locally to prevent code reuse.
4. **Dual Activation**: Works **100% offline** when pasted into the Paywall/Settings unlock field, or **automatically online** when approved in the Web/Android Admin Console and synced to `shop_accounts`.

---

## 7. Repository Layout

```text
.
├── .env.example                 # Required build-time secret keys (no real secrets committed)
├── app/                         # Native Android POS application (Kotlin + Compose M3)
│   ├── schemas/                 # Exported Room JSON schemas (versions 12, 13, 14)
│   └── src/
│       ├── main/java/com/beboss/shopmgmt/
│       │   ├── data/            # Room DAOs, 17 entities, AppDatabase v14, DatabaseMigrations, Repository
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
Copy `.env.example` or configure these variables in your environment / Secrets panel (never commit real secrets or use `local.properties`):

```properties
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
BEBOSS_UNLOCK_SIGNING_SECRET=your_unlock_signing_secret_32plus_chars
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
