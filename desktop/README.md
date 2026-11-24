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
- Subscription and payment-claim status, announcements, cloud sync status and a SQLCipher-encrypted local snapshot/outbox database.

Desktop writes to the mobile POS data model are sent as full BeBoss BBSHARE1 snapshots, signed by a Supabase Edge Function using the server-only BEBOSS_DATASHARE_HMAC_SECRET. The Android client already understands this snapshot format and merges records using its existing timestamps/tombstones. Snapshot writes include an optimistic version check and a database advisory-lock trigger so a desktop save cannot silently overwrite a newer cloud snapshot.

The desktop workspace uses the PNG and JPG brand assets synchronized from `web/public`, a GPU-composited 3D dashboard treatment, and reduced-motion fallbacks. SVG brand artwork is not used by the desktop renderer. Receipt seals use the same SHA-256 field order as the Android offline receipt seal; the desktop receipt preview exposes the saved sale values, TIN, configured tax display, payment balance, and shop footer.

## Supabase setup

The desktop application does not contain a service-role key, secret API key, payment gateway key or snapshot HMAC secret. Those values must remain in Supabase server-side secrets.

1. Configure desktop/.env.local from desktop/.env.example with the project's public Supabase URL and sb_publishable_... key. Alternatively, the desktop build also reads SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from the repository-root .env used by Android. Only these two public values are exposed to the renderer; server-only secrets in the root .env are not mapped into Vite.
2. Apply the migration from the repository's existing web Supabase project:

   cd web
   supabase db push

   The migration adds a guarded, atomic snapshot-write RPC. It does not alter Android Room tables or remove existing records.
3. Confirm the existing HMAC key is shared by the server and the Android build. The desktop Edge Function reads the protected value from the service-role-only `app_secrets` table; it never returns the key to a client.

   The Android production build must receive that same value through the protected build environment as `BEBOSS_DATASHARE_HMAC_SECRET`. Do not use the Android source fallback `BeBossDefaultDataShareHmacKeyV2` for new production releases. The current live server-side key is not that fallback. An older APK compiled without the shared key may be unable to verify BBSHARE1 packages created by desktop. Rebuild and distribute Android with the same protected key before relying on cross-platform branch exchange. The Android Gradle release gate now rejects a missing/default key.

   Do not retrieve or paste the production secret into source control, public build logs, VITE_ variables or the desktop renderer.
4. Deploy both Edge Functions:

   supabase functions deploy request-desktop-owner-otp --no-verify-jwt
   supabase functions deploy beboss-desktop

5. Configure and test a Supabase Auth SMS provider. Owner OTP issuance is limited per shop by the existing atomic take_shop_owner_otp_slot database function. The desktop app will not enroll an unverified phone or expose data until the phone and active shop_owner_memberships record are both confirmed.

The request OTP function intentionally returns the same accepted response for an unknown shop and a throttled/valid shop to reduce account enumeration. The authenticated desktop API checks auth.getUser(), the verified phone number, the exact shop owner identity and an active, non-revoked owner membership on every request.

## Desktop branch DataShare

The Backup & Recovery page also includes a signed branch-exchange workflow. The server creates Android-format `BBSHARE1` tokens with the established shared secret; import is verified by the authenticated Edge Function before the desktop merges any records. Branch scope, shop identity, owner phone, issue time, expiry, HMAC integrity, collection size and per-installation replay history are checked. The desktop renderer never receives the signing secret.

Create a token for all branches or one branch, then copy/download it and import it on the intended terminal. An Android production build must have been compiled with the same protected `BEBOSS_DATASHARE_HMAC_SECRET`; an older build using the public fallback cannot verify a token signed with the live server key.

## Run locally in Cursor

   cd desktop
   npm install
   cp .env.example .env.local

Edit .env.local with the public project URL and publishable key, or provide the unprefixed SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY values in the repository-root .env. Then run:

   npm run dev

## Build installers

   npm run build
   npm run dist:win
   npm run dist:mac
   npm run dist:linux

The desktop shell is Tauri 2. Its renderer has no Node.js access; privileged operations are exposed only through explicit Tauri commands. The local SQLCipher database encrypts the complete SQLite file, including snapshot and outbox contents. Its random database key is stored in the operating-system credential vault; credentials and owner session values are additionally encrypted before storage.

Windows builds require the Microsoft C++ Build Tools, WebView2 and Rust. The CI workflow provisions the native build toolchain automatically.

## Data and platform boundaries

Desktop stores snapshot mutations and sync-outbox entries in a single SQLCipher-encrypted SQLite transaction. On first launch after the SQLCipher upgrade, BeBoss exports any existing plaintext SQLite database into a new keyed database, verifies it can be reopened, and only then replaces the old file; a failed export leaves the original file untouched. When the cloud is reachable, it uses the existing guarded BBSHARE1 snapshot API and acknowledges local outbox entries only after the cloud accepts the write. When offline, it retains local changes and retries after reconnecting. Every queued transaction retains its original cloud version; if Android or another desktop advanced the snapshot, automatic upload stops and preserves the local queue instead of overwriting newer data. That conflict requires an explicit merge before retrying.

The Windows/macOS/Linux build supports keyboard-wedge USB barcode scanners and the operating-system print dialog. Android-only APIs such as CameraX, Android Keystore/SQLCipher database access, Android biometric prompts, thermal-printer Bluetooth SDKs, nearby-Wi-Fi LAN discovery and WorkManager are not falsely represented as desktop hardware features. Those remain functional in the Android application; desktop exposes their compatible business workflows and shared cloud state. New staff credential/PIN enrollment remains an owner-device security operation; desktop manages existing staff assignments and active status without receiving or exporting PINs/passwords.

## Security notes

- Never place SUPABASE_SERVICE_ROLE_KEY, Supabase secret keys, gateway secrets or the BBSHARE HMAC key in VITE_ variables.
- Do not use username/phone-derived shop IDs as authentication. The derived key is only a tenant reference; the SMS-verified Auth user and active owner membership are the authorization boundary.
- Snapshot tokens are verified server-side before decoding. The HMAC signing secret never reaches the renderer.
- The operating-system keyring protects the random SQLCipher database key. Secure session values are additionally encrypted with AES-256-GCM. The first-run installer verifies the keyed database, native device identity, secure-vault read/write, and configured Supabase host; a reachable TCP endpoint is not treated as an authenticated cloud session.
- Configure `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` repository secrets for tagged releases. The release workflow signs the NSIS installer and verifies the signature before uploading/publishing it.
- Configure the public `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` repository secrets so the packaged production desktop client connects to the actual project.


## Windows installation and privilege model

The Windows NSIS installer is configured for a per-machine installation and requests administrator approval through the standard Windows UAC prompt. The installed BeBoss application itself runs as the signed-in user, not permanently elevated; normal checkout, synchronization and backup operations do not need operating-system administrator rights. No broad inbound Windows Firewall rule is installed because the desktop client synchronizes outbound over HTTPS and does not expose a LAN listener. Uninstalling BeBoss preserves user business data and backups.

## Portable backup security

Portable backup exports use AES-256-GCM with PBKDF2-HMAC-SHA-256 (310,000 iterations), a fresh 16-byte salt and 12-byte nonce. The passphrase is entered locally, is not uploaded to Supabase, and is required to restore on another desktop. Legacy plaintext JSON backups remain importable for migration; create a new encrypted export after importing one. Subscription recovery is never granted by a locally guessed or format-only code. Desktop subscription status is read from Supabase and changed only by verified billing and owner workflows.
