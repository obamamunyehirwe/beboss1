# BeBoss iPhone application

This is the native iPhone client for BeBoss. It shares the BeBoss business model and cloud snapshot protocol with Android and desktop, while keeping its own iOS-native database, credentials and device identity. The Android app remains under `app/`; this project does not copy Android private storage or Android Keystore secrets to iOS.

## Technology

- React Native 0.88.1, React 19.3 and TypeScript
- SQLCipher-backed SQLite through OP-SQLite
- Apple Keychain for the database key, Supabase session and revocable iPhone device credentials
- PBKDF2-HMAC-SHA256 local PIN/password hashes using the Android-compatible `pbkdf2v2` wire format
- AES-256-GCM password-encrypted portable backups
- Face ID / Touch ID through Keychain access control
- VisionCamera barcode scanning
- Bluetooth Low Energy ESC/POS receipt printing
- Supabase Edge Functions for owner verification, device enrollment and signed snapshot synchronization

## Configure the cloud client

Copy `.env.example` to `.env` and set only the BeBoss public Supabase project URL and publishable key:

    SUPABASE_URL=https://YOUR_PROJECT.supabase.co
    SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

Do not put a service-role key, the shop DataShare signing key, an Android Keystore secret or a device token in `.env`, source control, reports or backup exports. The iPhone's opaque device credentials are held in Apple Keychain.

## Build an unsigned iPhone device app

The device build requires macOS, Xcode with an iOS device SDK, Node.js 22.13 or later, Ruby and CocoaPods.

From this directory:

    npm install
    npm run typecheck
    npm test -- --runInBand
    ./scripts/prepare-ios-assets.sh
    bundle install
    bundle exec pod install --project-directory=ios
    xcodebuild -project ios/BeBoss.xcodeproj -scheme BeBoss -sdk iphoneos -configuration Release -destination 'generic/platform=iOS' -derivedDataPath build/ios-device CODE_SIGNING_ALLOWED=NO build

The CI workflow builds for the physical-device `iphoneos` SDK. An unsigned `BeBoss.app` is not installable on an ordinary iPhone until it is signed. Device installation and TestFlight/App Store distribution require an Apple Developer Team, valid signing certificates and provisioning profiles; those credentials must not be committed to the repository.

## Local business workflows

- First-run shop workspace and owner setup, local staff sign-in and login throttling
- Role-enforced owner, manager and cashier access, checked in repository mutations
- Dashboard, sales overview and low-stock monitoring
- POS with catalogue search, barcode scanner, held carts, discounts, customer selection, split/partial payments, credit validation, quick custom sale, atomic checkout, receipt history and controlled sale reversal
- Product inventory, archive, stock adjustments and reorder levels
- Customer records and debt collection/payment ledger
- Supplier purchases, purchase records and controlled purchase deletion
- Branch and warehouse records, operating states and controlled stock transfers with receive/cancel actions
- Staff records, owner/manager/cashier permission presets and one-account-per-enrolled-iPhone access
- Sales and inventory CSV exports, local operational diagnostics and audit-event writing
- Password-encrypted backup export and same-shop restore, plus authenticated Android DataShare package import and record merging
- Face ID / Touch ID, BLE receipt printing, subscription price estimates, hosted provider checkout/status checks and account-bound BB3 voucher redemption with replay protection

## Secure iPhone cloud synchronization

An iPhone must be paired with an active device slot using the owner-issued invitation. The enrollment endpoint verifies the fresh SMS-confirmed shop-owner session, redeems the invitation, confirms the assigned active staff account and role, and obtains a revocable device credential. The credential is stored in Keychain and is refreshed through the device-auth Edge Function.

The sync endpoint authenticates the iPhone using its device ID and opaque access token. It checks the server-side device registry, assigned user, role and active branch before handling data. Business snapshots are signed on the server using the shop-scoped DataShare signing key; that key is never returned to the app. Each generation is written in immutable BBSHARE2 chunks and only becomes current after the server verifies the complete chunk set and checks the expected cloud generation version. Interrupted or conflicting generations do not replace the last accepted generation.

The iPhone downloads and HMAC-verifies the latest complete snapshot set, merges records using update/HLC versions and tombstones, and preserves locally stored PIN/password hashes. Downloaded staff records without local credentials remain locked until an authorised device pairing provisions them. Upload acknowledgement is tied to the exact local outbox rows included in the successful upload; network failures and version conflicts leave changes queued for retry. Local POS and inventory continue to work offline.

## Backend deployment requirements

The iOS source depends on the new SQL migration and Edge Function in this repository:

- Apply `web/supabase/migrations/20261127213000_secure_ios_snapshot_sync.sql`
- Deploy `web/supabase/functions/ios-device-auth`
- Deploy the updated `web/supabase/config.toml` function configuration
- Confirm the existing iOS invitation migration `20261127200000_secure_ios_device_enrollment.sql` and authenticated device-credential migration `20261124210000_authenticated_android_device_credentials.sql` are applied

The Edge Function requires the existing Supabase URL, service-role secret and publishable key in its server environment, plus the shop-scoped DataShare key provisioned by the primary owner terminal. Keep all server secrets in Supabase Edge Function secrets, never in the React Native bundle. Test enrollment, upload, download, revocation, branch assignment and concurrent-device conflicts against a non-production shop before rollout.

## Platform differences still requiring migration or validation

The iPhone app is a substantial offline-first client, but it is not yet a verified 100% feature-identical replacement for Android. In particular, the following Android capabilities still require dedicated iOS modules and parity tests:

- Full admin/support verification console and privileged licensing workflows
- Full payment-provider reconciliation, admin-side subscription review and server-issued entitlement activation (the iPhone can request checkout and check provider status but cannot self-activate a plan)
- Complete branch DataShare file export, signed approval workflow and all Android DataShare transport modes (the current iOS client can import/merge verified Android packages)
- Background/periodic cloud sync scheduling and recovery across iOS suspension/relaunch
- Full device-fleet telemetry, device posture reporting and remote maintenance controls
- Advanced diagnostics, repair tooling and Android-specific hardware integrations
- Full regression coverage with real iPhones, Bluetooth printer models and production cloud accounts

These gaps must be completed and validated before describing the iPhone app as 100% Android-parity or using it as the only production client.
