# BeBoss Desktop

BeBoss Desktop is the native Windows, macOS and Linux workspace for the existing BeBoss web application.

## Shared application architecture

The desktop client is a secure Electron shell around the canonical BeBoss web client at https://beboss1.vercel.app.

It deliberately does not fork POS workflows, payment calculations, staff permissions, tenant filtering, Supabase access or business rules. The browser, desktop client and Android app continue to use the same Supabase project and server-side authorization model. The desktop renderer is the same web application and therefore receives web application updates as soon as the production web deployment is updated.

The desktop client never contains a Supabase service-role key, payment provider secret, database password or privileged API token. Supabase authentication, row-level security and server functions remain authoritative.

## Desktop capabilities

- Native application window, operating-system menu and keyboard shortcuts.
- Persistent, isolated application session so a user can sign in once and reopen BeBoss without sharing cookies with their normal browser.
- Secure navigation policy: only the canonical BeBoss origin may load inside the app; external HTTPS destinations open in the system browser.
- Context isolation, sandboxed renderer, disabled Node integration, blocked webviews and restricted notification permissions.
- Native save dialog for reports and other files downloaded by the web application.
- Native print dialog for invoices, receipts, reports and other printable web views.
- Responsive desktop workspace with the exact web application's existing BeBoss logos, colors, typography, routes and feature set.
- Friendly connection-recovery screen when the cloud workspace is unavailable.

Barcode scanners that operate as keyboard input and printers exposed through the operating system work through the shared web client and native print dialog. Vendor-specific USB/serial hardware integrations still require a supported web driver or a separately reviewed native integration.

## Supported operating systems

The release workflow builds Windows 10/11 x64 installer (NSIS), macOS universal DMG/ZIP (Intel and Apple Silicon), and Linux x64 AppImage and Debian package.

Linux distributions must provide a compatible Chromium/Electron runtime environment. ARM Linux packaging is not part of the initial release matrix.

## Local development

1. Install Node.js 22 or newer.
2. Start the BeBoss web development server from the web directory.
3. From this directory install the pinned desktop dependencies using npm install with the no-package-lock flag.
4. Run the desktop shell against the local Vite server. Set BEBOSS_DESKTOP_DEV_URL to http://localhost:5173 and run npm start. In PowerShell, set the environment variable before running npm start.
5. Run the security-policy tests with npm test.
6. Build the current operating-system package with npm run dist.

The development URL override is accepted only for loopback HTTP and only while the Electron application is not packaged. Packaged clients always use the production BeBoss HTTPS origin.

## CI packaging

The GitHub Actions workflow at .github/workflows/desktop.yml runs policy tests and produces per-OS installers for pull requests and main-branch pushes. Downloadable CI artifacts are unsigned build outputs; they are intended for internal acceptance testing until the release-signing credentials are configured.

## Production distribution and signing

Before broad external distribution, configure:
- Authenticode signing certificate and protected signing password for Windows.
- Apple Developer ID Application certificate, notarization credentials and hardened-runtime signing for macOS.
- A controlled release/tag process and signed checksums for published installers.

The CI build does not invent or embed signing credentials. macOS Gatekeeper and Windows SmartScreen may warn for unsigned builds. The Linux packages are built without platform code signing.

## Online operation

The desktop renderer uses the live cloud application. A working internet connection is required for authentication, live data, synchronization, payments, updates and cloud administration. It does not claim to provide offline POS transaction capture. Use the Android client's existing offline-first functionality for the workflows it supports while disconnected.

## Versioning

Keep the desktop package version aligned with the BeBoss release version. The current package version is 2.3.1.
