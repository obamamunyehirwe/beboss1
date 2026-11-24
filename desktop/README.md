# BeBoss Desktop

BeBoss Desktop is the native Windows, macOS and Linux workspace for the existing BeBoss web application.

## Shared application architecture

The desktop client is a secure Electron shell around the canonical BeBoss web client at https://beboss1.vercel.app.

It deliberately does not fork POS workflows, payment calculations, staff permissions, tenant filtering, Supabase access or business rules. The browser, desktop client and Android app continue to use the same Supabase project and server-side authorization model. The desktop renderer is the same web application and therefore receives web application updates as soon as the production web deployment is updated.

The desktop client never contains a Supabase service-role key, payment provider secret, database password or privileged API token. Supabase authentication, row-level security and server functions remain authoritative.

## Desktop capabilities

- Native application window, operating-system menu and keyboard shortcuts.
- Multi-window business workspace: open separate authenticated windows for overview, payments/refunds, shops, analytics, devices, cloud sync, audit and settings without signing in again.
- System-tray quick launcher with restore, commonly used workspace pages and safe quit controls.
- Shared authenticated session between desktop workspace windows, isolated from the normal browser profile.
- Persistent, isolated application session so a user can sign in once and reopen BeBoss without sharing cookies with their normal browser.
- Secure navigation policy: only the canonical BeBoss origin may load inside the app; external HTTPS destinations open in the system browser.
- Context isolation, sandboxed renderer, disabled Node integration, blocked webviews and restricted notification permissions.
- Native save dialog for reports and other files downloaded by the web application.
- Native print dialog for invoices, receipts, reports and other printable web views.
- Responsive desktop workspace with the exact web application's existing BeBoss logos, colors, typography, routes and feature set.
- First-launch online application-shell caching for the /desktop route and static JS/CSS/image/font resources; sensitive auth, Supabase REST, Edge Function and business data responses are excluded from the service-worker cache.
- Encrypted local business workspace snapshot and held POS carts through Electron safeStorage; pending edits are retained until authenticated cloud sync can be retried.
- Offline workspace reopening after the first successful online launch, provided the service worker and cached assets remain available in the persistent Electron session.

Barcode scanners that operate as keyboard input and printers exposed through the operating system work through the shared web client and native print dialog. Vendor-specific USB/serial hardware integrations still require a supported web driver or a separately reviewed native integration.

## Supported operating systems

The release workflow builds Windows 10/11 x64 installer (NSIS), macOS universal DMG/ZIP (Intel and Apple Silicon), and Linux x64 AppImage and Debian package.

Linux distributions must provide a compatible Chromium/Electron runtime environment. ARM Linux packaging is not part of the initial release matrix.

## Local development

1. Install Node.js 22 or newer.
2. Start the BeBoss web development server from the web directory.
3. From this directory install the exact pinned desktop dependencies using npm install --no-package-lock --no-audit --no-fund.
4. Run the desktop shell against the local Vite server. Set BEBOSS_DESKTOP_DEV_URL to http://localhost:5173 and run npm start. In PowerShell, set the environment variable before running npm start.
5. Run the security-policy tests with npm test.
6. Build the current operating-system package with npm run dist.

The development URL override is accepted only for loopback HTTP and only while the Electron application is not packaged. Packaged clients always use the production BeBoss HTTPS origin.

## CI packaging

The GitHub Actions workflow at .github/workflows/desktop.yml runs policy tests, packages all three operating-system targets, and publishes SHA-256 checksums with the CI artifacts. CI artifacts are unsigned and intended for internal acceptance testing only.

## Production distribution and signing

### Automatic updates

Packaged Windows, macOS and Linux clients check the official public GitHub Releases feed at startup and every six hours. Updates download in the background; the app offers a native notification and a tray/menu action to restart and install. The renderer can query `window.beBossDesktop.getUpdateStatus()` or call `window.beBossDesktop.checkForUpdates()` through the narrow preload bridge. Update packages are verified against the SHA-512 values in the generated electron-updater metadata. The release feed is `https://github.com/obamamunyehirwe/beboss1/releases`.

macOS automatic updates require a valid Developer ID signature. Unsigned builds must not be presented as update-capable public releases.

## Production distribution and signing

The tagged release workflow at `.github/workflows/desktop-release.yml` intentionally stops before publishing unless all required signing secrets are configured:
- `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for Windows Authenticode signing.
- `MAC_CSC_LINK` and `MAC_CSC_KEY_PASSWORD` for a macOS Developer ID Application certificate.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for Apple notarization.
- `LINUX_GPG_PRIVATE_KEY` and `LINUX_GPG_PASSPHRASE` for detached signatures of Linux AppImage/DEB installers. The workflow publishes the matching public key.

The workflow uses the repository-scoped `GITHUB_TOKEN` to publish the versioned GitHub Release and update metadata. Keep signing secrets protected by GitHub environment/repository permissions. Linux AppImage/DEB artifacts receive detached GPG signatures and the release includes the public verification key plus per-platform SHA-256 checksum manifests.

The CI build does not invent or embed signing credentials. macOS Gatekeeper and Windows SmartScreen may warn for unsigned builds. The Linux packages are built without platform code signing.

## Online and offline operation

The first application launch must be online so the desktop can fetch the BeBoss web application, sign in the registered owner and install the desktop-scoped service worker. Once that installation succeeds, the /desktop document and its static JavaScript, CSS, image and font assets are cached by the service worker. The service worker does not cache Supabase Auth, REST, Edge Function, payment or business data responses.

The encrypted local business snapshot is stored separately by Electron safeStorage and the operating-system credential store. While the workspace is running, POS sales, held carts, inventory, customer credit, purchases, branches and receipts can continue against that encrypted local snapshot when the network drops. When connectivity returns, the desktop publishes a version-aware snapshot through the owner-authenticated desktop-workspace Edge Function and reloads the merged cloud state.

An offline reopen is supported only after the first successful online launch has installed the service worker and cached the current application assets. Clearing Electron site data, removing the service-worker cache, deleting the encrypted vault or changing the application origin requires an online launch again. Auth OTP, payment checkout, owner-portal lookups, device invitations, live updates and cloud synchronization require internet access.

## Mobile parity boundaries

The desktop now covers the main shop-owner POS and management flows, including camera and USB barcode scanning, held baskets, split cash/MoMo tender, sales ledger, inventory, customer credit, purchasing, branch commands, staff roles and branch assignments, subscription portal, device invitations, analytics and forecasting, QR-sealed receipts, CSV exports and backups.

The following Android-specific capabilities are not yet fully ported to desktop and must not be represented as completed: Android Keystore-backed staff PIN/biometric login, the LAN mDNS/UDP master-hub server and encrypted direct peer-sync protocol, Android-specific background workers and sync dead-letter queue semantics, OEM USB/serial printer/scanner drivers, and Android lifecycle/device-integrity attestation checks. Desktop cloud sync uses the shared Supabase snapshot protocol rather than impersonating an Android device's hardware-bound local secrets.

## Versioning

Keep the desktop package version aligned with the BeBoss release version. The current package version is 2.3.2.
