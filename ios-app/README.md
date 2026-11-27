# BeBoss iPhone application

This is a separate React Native application for iPhone. It does not replace, rewrite, or build the Android app. Its native iOS host and product code live here; the original Android app remains under the root app/ directory.

## Technology

- React Native 0.88.1, React 19.3, New Architecture enabled
- TypeScript business services and React Native user interface
- SQLCipher-backed local SQLite through OP-SQLite
- Apple Keychain storage for the database encryption key and Supabase session
- PBKDF2-HMAC-SHA256 credentials compatible with the Android pbkdf2v2 record format
- AES-256-GCM encrypted portable backup files
- Face ID / Touch ID via Keychain access control
- VisionCamera 5 barcode scanning
- Bluetooth Low Energy ESC/POS printer transport
- Supabase JS client using only the public publishable API key

## Build an unsigned iPhone-device app

Requires macOS, Xcode 26.4 with the iOS device SDK, Node.js 22.13 or later, Ruby and CocoaPods.

From this directory:

    cp .env.example .env
    # Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the BeBoss public project values.
    npm install
    npm run typecheck
    npm test -- --runInBand
    bundle install
    bundle exec pod install --project-directory=ios
    xcodebuild -project ios/BeBoss.xcodeproj -scheme BeBoss -sdk iphoneos -configuration Release -destination 'generic/platform=iOS' -derivedDataPath build/ios-device CODE_SIGNING_ALLOWED=NO build

The CI workflow uses the physical-device iphoneos SDK only. It does not build or run an iOS simulator. The unsigned app output is under build/ios-device/Build/Products/Release-iphoneos/BeBoss.app.

To install on a real iPhone, configure your Apple Developer Team and signing capabilities in Xcode. App Store/TestFlight distribution additionally needs the account's distribution certificate, provisioning profile, App Store Connect record and Apple's signing process. Those credentials must not be committed to this repository.

## Implemented iPhone workflows

- First-run shop/owner registration with the four-day trial fields, local staff sign-in, PBKDF2v2 PIN/password hashes and lockout tracking
- Role permissions for owner, manager and cashier, checked again in repository mutations
- Dashboard and low-stock view
- Point of sale: catalogue search, barcode capture, cart quantity controls, customer selection, discounts, partial payments, credit validation, atomic checkout, receipt history and sale reversal
- Inventory: product CRUD, archive, stock adjustments and reorder threshold
- Customers: profile CRUD and outstanding debt collection/payment ledger
- Purchases: supplier invoice records, stock inflow and cost/selling price update
- Branch records and controlled in-transit stock transfers with receiving confirmation
- Staff records and Android-compatible role permission presets
- Local reports and basic operational diagnostics
- Encrypted AES-256-GCM backup export, Face ID/Touch ID Keychain gate and BLE printer test/receipt output

## Cross-platform and security notes

The iOS app writes to its own encrypted iPhone database. It does not read Android private app storage, Room files, SQLCipher files or Android Keystore material. It does not embed the old Android credential pepper. Existing Android pbkdf2 legacy hashes are rejected on iPhone until the enrolled Android device has upgraded those records or the owner completes a backend-supported migration. New pbkdf2v2 hashes use the same algorithm, iteration count, salt length, output length and wire format.

Every local mutation adds a durable sync-outbox item. The iOS build does not claim that these rows have synchronized. The current BeBoss cloud sync protocol requires a server-issued, platform-bound device credential in X-BeBoss-Device-ID and X-BeBoss-Device-Token, plus the per-shop snapshot signing secret and generation-complete chunk protocol. Android's Keystore credential cannot be copied to iOS; a dedicated iOS enrollment/credential issuance path is needed on the Supabase backend before snapshot sync can safely be enabled. Owner SMS verification alone is not shop-device authorization.

This initial iOS migration does not yet provide the Android's full admin verification console, complete branch DataShare import/export protocol, multi-device cloud snapshot merge and conflict reconciliation, payment-provider orchestration, full subscription BB3 unlock verification, background cloud scheduler, complete device-fleet telemetry, or all diagnostic/maintenance tools. The current local workflow is useful for offline shop operations but is not feature-identical to the Android release. Do not deploy it as an Android-parity replacement until the remaining backend and platform-specific functions have been migrated and tested.
