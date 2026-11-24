# BeBoss Desktop

A standalone Windows, macOS and Linux desktop client for the BeBoss retail operating system. It uses the same BeBoss shop account, mobile business snapshot, subscription records, branch tables, staff assignments, device invitations and stock-transfer command flow as the Android application.

## Included desktop workflows

- SMS owner verification and persistent Supabase Auth sessions stored through the Tauri operating-system keyring bridge and a local SQLite state database.
- Consolidated shop dashboard and operating KPIs sourced from the signed mobile snapshot.
- Point of sale with product search, keyboard-wedge barcode input, cart quantities, discounts, cash/mobile-money/card/credit tender selection, customer debt, receipt numbers, and a dedicated mobile-aligned receipt preview with print / Save as PDF and sales-ledger reprints.
- Product catalogue, stock levels, cost and selling price, stock adjustment, reorder views and soft-delete tombstones.
- Customer records, credit limits, debt balances and payment collection history.
- Supplier purchases and stock inflow, linked to the product catalogue.
- Sales ledger, cashier totals, profit/margin reporting, payment mix and product performance.
- Branch management, operational status and targets, normalized to the existing cloud branch table.
- Staff role, branch assignment and activation management for existing enrolled staff identities.
- Paired terminal registry and single-use device invitation codes.
- Cross-branch stock-transfer requests and receipt/cancellation commands that are processed by paired Android terminals.
- Subscription and payment-claim status, announcements, cloud sync status and an encrypted local snapshot/outbox.

Desktop writes to the mobile POS data model are sent as full BeBoss BBSHARE1 snapshots, signed by a Supabase Edge Function using the server-only BEBOSS_DATASHARE_HMAC_SECRET. The Android client already understands this snapshot format and merges records using its existing timestamps/tombstones. Snapshot writes include an optimistic version check and a database advisory-lock trigger so a desktop save cannot silently overwrite a newer cloud snapshot.

The desktop workspace uses the PNG and JPG brand assets synchronized from `web/public`, a GPU-composited 3D dashboard treatment, and reduced-motion fallbacks. SVG brand artwork is not used by the desktop renderer. Receipt seals use the same SHA-256 field order as the Android offline receipt seal; the desktop receipt preview exposes the saved sale values, TIN, configured tax display, payment balance, and shop footer.

## Supabase setup

The desktop application does not contain a service-role key, secret API key, payment gateway key or snapshot HMAC secret. Those values must remain in Supabase server-side secrets.

1. Configure desktop/.env.local from .env.example with the project's public Supabase URL and sb_publishable_... key.
2. Apply the migration from the repository's existing web Supabase project:

   cd web
   supabase db push

   The migration adds a guarded, atomic snapshot-write RPC. It does not alter Android Room tables or remove existing records.
3. Configure the Edge Function secret using the same snapshot HMAC value used by the Android build:

   supabase secrets set BEBOSS_DATASHARE_HMAC_SECRET="YOUR_EXISTING_BEBOSS_SNAPSHOT_HMAC_SECRET"

   Do not invent a new value for an already-running Android deployment. Desktop and Android must verify/sign with the same key. If the Android app uses the documented runtime fallback, configure that exact value before enabling desktop writes, then plan a coordinated key rotation for a future release.
4. Deploy both Edge Functions:

   supabase functions deploy request-desktop-owner-otp --no-verify-jwt
   supabase functions deploy beboss-desktop

5. Configure and test a Supabase Auth SMS provider. Owner OTP issuance is limited per shop by the existing atomic take_shop_owner_otp_slot database function. The desktop app will not enroll an unverified phone or expose data until the phone and active shop_owner_memberships record are both confirmed.

The request OTP function intentionally returns the same accepted response for an unknown shop and a throttled/valid shop to reduce account enumeration. The authenticated desktop API checks auth.getUser(), the verified phone number, the exact shop owner identity and an active, non-revoked owner membership on every request.

## Run locally in Cursor

   cd desktop
   npm install
   cp .env.example .env.local

Edit .env.local with the public project URL and publishable key, then run:

   npm run dev

## Build installers

   npm run build
   npm run dist:win
   npm run dist:mac
   npm run dist:linux

The desktop shell is Tauri 2. Its renderer has no Node.js access; privileged operations are exposed only through explicit Tauri commands. The local SQLite database stores snapshot and outbox state; credentials and owner state use platform-secure keyring storage.

Windows builds require the Microsoft C++ Build Tools, WebView2 and Rust. The CI workflow provisions the native build toolchain automatically.

## Data and platform boundaries

Desktop stores snapshot mutations and sync-outbox entries in a single encrypted SQLite transaction. When the cloud is reachable, it uses the existing guarded BBSHARE1 snapshot API and acknowledges local outbox entries only after the cloud accepts the write. When offline, it retains local changes and retries after reconnecting. Every queued transaction retains its original cloud version; if Android or another desktop advanced the snapshot, automatic upload stops and preserves the local queue instead of overwriting newer data. That conflict requires an explicit merge before retrying.

The Windows/macOS/Linux build supports keyboard-wedge USB barcode scanners and the operating-system print dialog. Android-only APIs such as CameraX, Android Keystore/SQLCipher database access, Android biometric prompts, thermal-printer Bluetooth SDKs, nearby-Wi-Fi LAN discovery and WorkManager are not falsely represented as desktop hardware features. Those remain functional in the Android application; desktop exposes their compatible business workflows and shared cloud state. New staff credential/PIN enrollment remains an owner-device security operation; desktop manages existing staff assignments and active status without receiving or exporting PINs/passwords.

## Security notes

- Never place SUPABASE_SERVICE_ROLE_KEY, Supabase secret keys, gateway secrets or the BBSHARE HMAC key in VITE_ variables.
- Do not use username/phone-derived shop IDs as authentication. The derived key is only a tenant reference; the SMS-verified Auth user and active owner membership are the authorization boundary.
- Snapshot tokens are verified server-side before decoding. The HMAC signing secret never reaches the renderer.
- The operating-system keyring protects the generated local database identity and secure session values. SQLite storage is local to the desktop user's application-data directory and must not be treated as a replacement for server-side authorization.
- Configure `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` repository secrets for tagged releases. The release workflow signs the NSIS installer and verifies the signature before uploading/publishing it.
- Configure the public `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` repository secrets so the packaged production desktop client connects to the actual project.


## Portable backup security

Portable backup exports use AES-256-GCM with PBKDF2-HMAC-SHA-256 (310,000 iterations), a fresh 16-byte salt and 12-byte nonce. The passphrase is entered locally, is not uploaded to Supabase, and is required to restore on another desktop. Legacy plaintext JSON backups remain importable for migration; create a new encrypted export after importing one. Subscription recovery is never granted by a locally guessed or format-only code. Desktop subscription status is read from Supabase and changed only by verified billing and owner workflows.
