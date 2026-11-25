# BeBoss — The Retail Operating System for Growing Businesses

**One connected workspace for sales, inventory, customer accounts, branches, staff, devices and business performance.**

BeBoss is an offline-first point-of-sale and retail management platform built for independent stores and multi-location operators. It combines a native Android POS, a native Windows/macOS/Linux desktop workspace, a merchant web portal and a central administration platform on one shop-scoped data model.

Built for the realities of retail in Rwanda and East Africa, BeBoss is designed to keep checkout and day-to-day shop operations available when internet access is unreliable, while giving owners the tools to manage people, stock, money, locations and devices from a single operational view.

<p align="center">
  <strong>Sell confidently. Control every branch. Know what is happening in your business.</strong>
</p>

---

## What BeBoss helps a business run

| Business area | Capabilities |
| --- | --- |
| **Point of sale** | Product lookup, barcode-assisted checkout, discounts, held carts, split tenders, customer credit, receipts and sales history |
| **Inventory** | Product catalogue, stock levels, cost and selling prices, stock adjustments, purchases, low-stock alerts and reorder analysis |
| **Customers and credit** | Customer directory, account balances, debt collection, payment history and customer purchase insights |
| **Branches** | Branch records, branch-scoped access, stock transfers, paired terminals and consolidated reporting |
| **People and access** | Staff accounts, role-based permissions, branch assignments, device assignments and access status |
| **Business intelligence** | Sales trends, product performance, gross profit and margin, customer value, debt ageing, payment mix and branch comparisons |
| **Devices and continuity** | Device pairing, secure device credentials, offline transaction capture, encrypted local storage, sync queues and operational telemetry |
| **Administration** | Shop oversight, subscriptions, payment review, release publishing, announcements, delegated admin roles and audit history |

BeBoss supports retail, pharmacies, hardware and construction shops, wholesalers, electronics stores, fashion businesses, cafés, salons and other inventory-led operators. The business vertical selected during onboarding can tailor product categories and units to the operation.

## Product experiences

### Android POS

The Android application is the mobile checkout and store-operations terminal.

- Fast checkout with barcode and QR-assisted workflows.
- Multi-cart hold and resume, discounts and split payment methods.
- Cash, MTN MoMo, Airtel Money, card and customer-credit workflows.
- Sales receipts, receipt sharing, supported thermal printing and exports.
- Products, purchases, stock adjustments, customers, balances and debt payments.
- Branch-aware workflows, staff permissions, device pairing and stock transfers.
- Offline-first local records with an encrypted Room/SQLCipher database.
- A durable synchronization outbox, retry handling, conflict resolution and recovery diagnostics.
- English, Ikinyarwanda, French and Kiswahili interface resources.

Camera, biometric, Bluetooth printer, nearby Wi-Fi and other hardware capabilities depend on the Android version, hardware, operating-system permission and the relevant device provider. They are not represented as universal features on every phone.

### Native desktop workspace

The Tauri desktop application provides a larger-screen workspace for shop owners and managers on Windows, macOS and Linux.

- POS checkout, catalogue and inventory management.
- Customers, purchases, sales, staff and branch operations.
- Reports and management views designed for desktop workflows.
- Persistent held orders and active checkout state in the encrypted local workspace.
- Keyboard-wedge barcode scanners and the operating system's print dialog.
- Local encrypted SQLCipher data and operating-system credential storage.
- Cloud synchronization, diagnostics, backup and recovery tools.
- A first-launch installation wizard that checks the native runtime, database encryption, device identity, credential vault and cloud reachability.
- A separate Master Admin entry point and protected administrative sign-in.

The first-launch desktop wizard configures and validates the local installation. Shop registration and owner authorization still use the real merchant sign-in flow. Windows/macOS/Linux do not inherit Android-only APIs such as CameraX, Android Keystore or Android Bluetooth services; the desktop application uses the appropriate native desktop facilities instead.

### Web platform and merchant portal

The web application combines the public BeBoss product site with merchant self-service and platform administration.

- Public product information, features, pricing, downloads and support contact.
- Interactive subscription and device-fee calculations.
- Merchant shop portal for account information, branches, transfers, staff and device operations available to the authenticated owner.
- Secure owner sign-in and shop membership checks.
- Release downloads routed through the private release store.
- Announcement cards for website visitors and signed-in app users, outside the homepage hero.
- A responsive administrative workspace for platform operations.

### Master Admin command centre

The central administration workspace is for authorized BeBoss platform operators—not shop cashiers.

- Shop, device, staff, branch and synchronization oversight.
- Payment claim review and subscription controls.
- Device security posture and cloud health monitoring.
- Administrative audit history.
- App release management and download analytics.
- Scheduled, translated, audience-targeted announcements.
- Delegated admin invitations with server-enforced permissions.

---

## Enterprise administration

### Delegated admin roles

A Super Admin can assign a role to an existing account or invite a teammate by email. New teammates receive a Supabase Auth invitation and must complete the secure account flow before signing in. Passwords and service credentials are never stored in the browser, the Android app or a desktop bundle.

| Role | Intended access |
| --- | --- |
| **Super Admin** | Full platform administration, team assignment and security-sensitive controls |
| **Release Manager** | Upload and publish app releases, select the current build and control public visibility |
| **Announcement Manager** | Create, translate, schedule and target platform announcements |
| **Device Auditor** | Review device security posture and synchronization health |
| **Support** | Work the support inbox and view permitted shop information |
| **Finance Reviewer** | Access finance and payment-review workflows assigned by the platform |
| **Analyst** | Access business and platform analytics |
| **Operations Manager** | Review operational shops, devices, staff and synchronization workflows |

The permission catalogue is defined on the server and stored in a protected grant table. The browser cannot submit an arbitrary permission list, modify its own grant, or elevate an account by editing user metadata. Super Admin access remains a separate role, and the last Super Admin cannot be removed or downgraded accidentally.

A role name is not a security boundary by itself: server functions call the database permission check before performing privileged work, and sensitive tables remain protected by Row Level Security and server-side credentials.

### Release management

The Admin → App Releases workspace controls what customers can discover and download.

- Upload signed Android APKs with version, version code, minimum Android version, release notes and SHA-256 metadata.
- Select the current public build.
- Hide or show archived builds without deleting them.
- Keep old packages and metadata in the admin archive for traceability.
- Review download totals and channel activity.
- Delete an archived package only as a separate destructive Super Admin action.

The release visibility flag controls public release listings and the public APK download endpoint. The current release cannot be hidden while it remains the current build. Existing release records are initially retained as public when the migration is applied; an administrator can then hide the versions that should no longer be advertised.

Production Android distribution still requires the real upload keystore, signing passwords, package validation and a tested update path. A debug APK is for internal testing and must not replace an already installed production-signed build.

### In-app announcements

Administrators can publish notices with:

- A headline, message, severity and optional call-to-action.
- Website, Android/app or all-audience targeting.
- Optional targeting to a single shop.
- Start and end times, including scheduled notices.
- Translations into Ikinyarwanda, French and Kiswahili when the configured translation service is available.

Active notices are delivered through the same announcement service. The Android and desktop workspace dashboards display in-app notices as operational cards; they are not embedded in the homepage hero. Audience and shop targeting are enforced by the database policies as well as the client UI.

### Device oversight and location privacy

The device console combines last-sync heartbeats, pairing and assignment state with security telemetry such as device posture, root/emulator/hooking signals, clock-integrity signals and permission summaries.

**Location is optional and off by default.** A device user must enable the location-sharing setting and grant Android foreground location permission. When enabled, BeBoss can attach a fresh location fix while the application is in use. Disabling sharing clears the locally cached fix and subsequent telemetry updates clear the cloud location value.

BeBoss does not add hidden location collection or background GPS tracking. Device location availability depends on the phone, location services, foreground permission, user consent and network connectivity. A stale or unavailable GPS reading is not presented as a live location.

---

## Offline-first architecture

BeBoss is designed around reliable store operations and controlled synchronization—not a cloud-only checkout screen.

```text
 Android POS ────────┐
                     │
 Native Desktop ─────┼── Encrypted local operations
                     │
 Merchant Web ───────┘
                          │
                          ▼
                 Supabase Auth + API
                          │
                          ▼
                  PostgreSQL + RLS
                          │
                 Server-side functions
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
          Admin       Private files   Integrations
          console     and releases    (when configured)
```

Core engineering mechanisms include:

- Room database persistence with SQLCipher encryption at rest on Android.
- OS credential-vault storage for native desktop secrets.
- Device-scoped authentication credentials for enrolled Android terminals.
- Durable sync queues, retry schedules and dead-letter handling.
- Hybrid Logical Clocks, tombstones and conflict-resolution rules for supported sync entities.
- Shop-scoped access policies and authenticated owner membership.
- Server-only privileged operations for platform administration, release files and sensitive secrets.

Offline work can continue while disconnected, but cloud-only actions—such as account verification, invitation acceptance, payment verification, release downloads and cross-device synchronization—require a working connection. The application reports unavailable cloud operations instead of claiming they succeeded.

## Commercial and payment controls

BeBoss supports subscription plans and device-linked licensing. The configured plan calculator accounts for branches, staff, additional POS terminals and billing cycles. The additional-terminal price currently configured by the platform is **2,000 FRw per month per additional active paired device**; the primary owner terminal is included in that device calculation.

MTN MoMo, Airtel Money and other payment-provider integrations require valid merchant credentials, provider configuration, callback URLs and provider-side testing. A submitted SMS, screenshot or payment note is not proof of settlement. Payment approval must rely on an independently verified provider transaction or a documented manual check against the merchant account.

BeBoss does not promise that every provider integration is automatically active merely because a payment option is visible in the interface.

---

## Technology stack

| Layer | Main technologies |
| --- | --- |
| Android | Kotlin, Jetpack Compose, Room, SQLCipher, WorkManager, CameraX, Android Keystore |
| Desktop | Tauri 2, Rust, React, TypeScript, Vite, SQLite/SQLCipher |
| Web | TanStack Start, TanStack Router, React, TypeScript, Tailwind CSS |
| Cloud | Supabase Auth, PostgreSQL, Row Level Security, Storage, Edge Functions |
| Testing | Vitest, ESLint, TypeScript checks, Android unit tests, Rust tests and CI build jobs |

## Repository layout

```text
/
├── app/                         # Android POS application
├── desktop/                     # Tauri native desktop application
├── web/                         # Public site, merchant portal and admin platform
│   ├── src/routes/               # Public, merchant and admin routes
│   ├── src/lib/                  # Server functions, domain logic and queries
│   └── supabase/
│       ├── functions/            # Server-side Edge Functions
│       └── migrations/           # Database schema, indexes and RLS policies
├── .github/workflows/            # CI, Android and native desktop builds
└── README.md
```

## Run the projects locally

### 1. Prerequisites

- Node.js 22 and npm.
- Java and the Android SDK required by the Gradle wrapper.
- Rust stable and the platform prerequisites for Tauri 2 when building desktop.
- A Supabase project for authenticated cloud features.
- Provider credentials only for the external services you intend to test.

### 2. Configure secrets

Start from the root `.env.example` and keep real values in the ignored root `.env` or in your deployment secret manager.

For web server operations, configure the project URL, publishable key, service-role key (server only), production admin invite redirect, and the optional integration secrets required by your deployment.

For desktop, copy `desktop/.env.example` to `desktop/.env.local` and set only:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Never place `SUPABASE_SERVICE_ROLE_KEY`, Supabase secret keys, signing keys, payment-provider secrets, SMS keys or DataShare HMAC keys in a `VITE_*` variable, Android resource, mobile asset or desktop client bundle.

For Android production builds, configure the release keystore and protected security secrets using the variables documented in the root `.env.example`. Do not commit those values.

### 3. Web application

```powershell
cd web
npm ci
npm run dev
```

Validation:

```powershell
npm run lint
npm test
npm run build
```

### 4. Desktop application

```powershell
cd desktop
npm ci
npm run dev
```

`npm run dev` starts the native Tauri application and its first-launch wizard. `npm run dev:ui` is a browser-only preview and intentionally cannot access the native SQLCipher database or operating-system credential vault.

Build the current platform's installer with `npm run dist`, or use `npm run dist:win`, `npm run dist:mac` and `npm run dist:linux` on the respective operating systems.

### 5. Android application

From the repository root:

```powershell
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
```

On Windows Command Prompt, use `gradlew.bat` instead of `./gradlew`.

A debug build is intended for local validation. Use the protected production signing configuration for store or customer distribution.

### 6. Database and Edge Functions

Apply migrations in order using the Supabase CLI or your project's migration workflow. Review the SQL and Row Level Security policy changes before applying them to production. Deploy Edge Functions from `web/supabase/functions/` using the configured Supabase project and keep all privileged environment variables in Supabase Function Secrets.

The delegated admin roles and release-visibility controls require the migration:

`20261125190000_enterprise_admin_roles_public_release_visibility.sql`

The public APK Edge Function must also be deployed from `web/supabase/functions/public-apk-download/` for the public download endpoint to enforce the visibility flag.

---

## Security and operational boundaries

- The service-role key is a server-side credential and bypasses Row Level Security. It must never ship to a client.
- Browser and mobile clients use publishable project configuration and authenticated/tenant-scoped access.
- Admin account invitations and grant mutations run on trusted server code.
- Admin permission grants are not client-editable; server functions verify the relevant permission for privileged actions.
- Device telemetry is limited to the operational and security signals described above. Location sharing is separately consented and foreground-only.
- Local encryption does not remove the need for tested backups, secure device access and controlled recovery.
- CI build success is not a substitute for merchant-device testing, provider certification, production signing, database migration review or an independent security assessment.

## Project status

BeBoss is an actively developed multi-platform retail system. The repository contains implemented Android, desktop, web, cloud and administration workflows; the depth of integration available in a deployment depends on its configured secrets, published migrations, deployed Edge Functions, signed releases, hardware and provider accounts.

The intended rollout is to validate one real shop and its devices first, reconcile the product catalogue and opening balances, test cashier permissions and offline recovery, verify printers and payment flows, and then expand by branch.

**BeBoss — one business, one operating view.**
