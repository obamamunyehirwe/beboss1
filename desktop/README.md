# BeBoss Desktop

BeBoss Desktop is the native Windows/macOS/Linux retail workspace built with **Tauri 2**. It is not a web page with a desktop-looking wizard. The native desktop shell provides the operating-system credential vault, encrypted local SQLCipher database, persistent installation identity, offline outbox, native printing and file export.

## Two separate setup stages

1. **Windows installer (native NSIS window):** run the generated `.exe`. The installer presents the normal Windows installation pages, chooses an installation folder, installs the application, registers it for the current Windows user, creates Start Menu and desktop shortcuts, and offers **Launch BeBoss Desktop** on the Finish page. The current-user installer does not require administrator elevation.
2. **First launch (inside BeBoss Desktop):** the in-app four-step wizard collects preferences and privacy consent, verifies the native runtime, creates/loads the persistent device identity, checks SQLCipher and the durable sync outbox, tests the Windows credential vault, and checks Supabase reachability. A cloud outage is shown as a warning so a secure offline workspace can still be prepared.

The first-launch wizard must run inside the installed BeBoss Desktop application window. Opening the Vite preview or a browser URL intentionally shows a browser-runtime notice instead; browsers do not have access to BeBoss's native database, operating-system credential vault or device services.

## Development

Use Bun, the Rust stable toolchain and the platform build prerequisites for Tauri. From this directory:

```powershell
bun install
```

Create `.env.local` using the values from `.env.example` and set only the public desktop client configuration:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Run the **native app** (including the in-app setup wizard):

```powershell
bun run dev
```

Build the frontend only for UI preview/testing (native operating-system checks will intentionally be unavailable):

```powershell
bun run dev:ui
```

Build a native installer for the current operating system:

```powershell
bun run dist:win
```

Use `bun run dist:mac` on macOS and `bun run dist:linux` on Linux. The corresponding outputs are created under `src-tauri/target/release/bundle/nsis`, `dmg`, and `appimage`. GitHub Actions also builds unsigned packages for all three platforms and publishes SHA-256 manifests for integrity verification.

## Data and credentials

- Business data lives in Tauri's operating-system application-data directory in a SQLCipher-encrypted SQLite database.
- The SQLCipher encryption key is stored in the operating-system credential vault; losing the user's operating-system profile/credential vault can make the local database unrecoverable without a valid export backup.
- Uninstalling the application preserves the business data directory. Use BeBoss Backup & Recovery before moving to another Windows profile or reinstalling Windows.
- The desktop bundle contains the Supabase URL and publishable key only. Never place service-role keys, HMAC secrets, SMS-provider keys, MTN MoMo/Airtel Money merchant credentials, or payment secrets in `VITE_*` variables or in the installed app. Configure those values in protected Supabase Edge Function secrets.

## Verification

The repository's GitHub Actions workflow validates the desktop TypeScript build, native Rust checks/tests and Windows NSIS installer. A produced CI installer is an unsigned test artifact; production distribution should use the protected Authenticode signing workflow and verified release credentials.
