# BeBoss Desktop

BeBoss Desktop is the native Windows/macOS/Linux retail client built with **Tauri 2**. It installs as a real desktop application with an operating-system window, native printing, secure credential storage and file export. The installed computer runs the frontend and device integrations; **Supabase PostgreSQL is the authoritative business database** shared by the shop's mobile and desktop devices.

## Cloud-first data architecture

- Products, customers, sales, sale items, customer payments, purchases, stock, branches and staff business snapshots are committed to the shop's Supabase PostgreSQL project. The current sync service stores signed, compressed snapshot generations in `public.branch_sync_snapshots`; management, subscriptions, device enrollment, payment and branch-control records use their respective cloud tables and protected server functions.
- The desktop application authenticates the registered shop owner using Supabase Auth SMS verification. Business reads and writes go through the authenticated `beboss-desktop` Edge Function. Server-side tenant checks, device enrollment and snapshot-generation checks run before accepting a write.
- Supabase Row Level Security and the server's owner/device authorization constrain tenant access. The desktop bundle contains only the Supabase URL and publishable key. **Never ship a service-role key, HMAC secret, SMS-provider key or payment-provider credential in the frontend or installer.**
- The cloud database is the source of truth. A successful local queue operation is not a successful business commit: the desktop marks a change synchronized only after Supabase accepts the new snapshot generation.
- SQLCipher on the device protects a temporary last-known cache, durable retry queue, non-business preferences and secure values. The cache supports continuity during a network interruption; it is not the canonical database and cannot override a newer cloud generation. When connectivity returns, queued changes are reconciled against the latest cloud version and conflicts are handled before the queue is acknowledged.
- The operating-system credential vault protects local key material and persisted authentication sessions. Device identity, native printer integration and exported backup files remain device-scoped.

A first-time installation must be able to reach the actual Supabase PostgreSQL Data API before setup completes. A TCP connection to port 443 alone is not treated as proof that the cloud database is reachable. After sign-in, the backend performs the real owner-membership, device-enrollment and tenant authorization checks.

## Installation

1. **Windows installer:** run the generated NSIS `.exe`. The installer provides the standard Windows installation pages, a selectable application folder, Start Menu and desktop shortcuts, and a Launch BeBoss Desktop option. The current-user installer does not require administrator elevation.
2. **First launch:** the in-app wizard checks the native runtime, persistent device identity, encrypted on-device recovery store, operating-system credential vault and live Supabase PostgreSQL Data API. Owner access is still granted only after the registered shop owner completes SMS verification.

The setup wizard must run inside the installed BeBoss Desktop application window. Opening the Vite preview or a browser URL intentionally shows a browser-runtime notice instead; browsers do not have access to BeBoss's native printing, secure credential vault or device services.

## Development

Use Node.js 22, npm, the Rust stable toolchain and the platform build prerequisites for Tauri. From this directory:

```powershell
npm ci
```

Create `.env.local` using the values from `.env.example` and set only the public desktop client configuration:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Run the **native app** (including the in-app setup wizard):

```powershell
npm run dev
```

Build the frontend only for UI preview/testing (native operating-system checks will intentionally be unavailable):

```powershell
npm run dev:ui
```

Build and verify the release locally on the matching operating system:

```powershell
npm run check:versions
npm run check:types
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Use the platform-specific build command:

- **Windows:** `npm run release:win:local` — produces the signed NSIS installer in `src-tauri/target/release/bundle/nsis` and writes SHA-256 checksum output. Configure the replacement Authenticode PFX outside the repository using `WINDOWS_CODESIGN_PFX_PATH` and `WINDOWS_CODESIGN_PFX_PASSWORD`. The script rejects the old exposed certificate.
- **macOS:** `npm run dist:mac` — produces a DMG in `src-tauri/target/release/bundle/dmg`. Sign and notarize with your Apple Developer ID before customer distribution.
- **Linux:** `npm run dist:linux` — produces an AppImage in `src-tauri/target/release/bundle/appimage`. Test it on the supported Linux distributions before distribution.

After building, sign in to the BeBoss Admin Center and open **App releases → Desktop releases**. Select the matching platform, choose the installer from the local output folder, enter the release version and notes, and upload it. The Admin page computes SHA-256, sends the selected file to private Supabase release storage, and can publish that platform independently from the other desktop platforms and Android.

**Customer release binaries are never built or published by GitHub Actions.** The GitHub workflows are CI/inspection checks only; they do not create an official desktop release for the website. Do not push a `desktop-v*` tag to publish an installer. Official desktop downloads are distributed by the Admin manual-upload flow through short-lived signed URLs.

## Local recovery, credentials and uninstall

The local SQLCipher database is a protected recovery/cache store, not the primary shop database. It keeps the encrypted last-known view, pending cloud-write queue, minimal desktop preferences and secure values needed for continuity and retry. It does not replace Supabase PostgreSQL as the authoritative source of business records.

The SQLCipher key seed is held in the operating-system credential vault. Uninstalling BeBoss removes the installed binaries and shortcuts but deliberately preserves the per-user application-data directory so that pending recovery data, protected credentials and local backups are not silently discarded. Before moving to another Windows profile or reinstalling Windows, reconnect to the cloud, confirm all pending writes are accepted, and export a portable encrypted backup.

## Verification

From the `desktop` directory:

```powershell
npm run check:versions
npm run check:types
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run dist:win
```

GitHub Actions validates the desktop TypeScript build, native Rust checks/tests and Windows NSIS installer. A produced CI installer is an unsigned test artifact; production distribution should use the protected Authenticode signing workflow and verified release credentials.
