# BeBoss native desktop installation and release

BeBoss Desktop is a native Tauri application, not a browser-installed PWA. The Windows product is delivered as a signed NSIS setup executable; macOS and Linux package builds are maintained separately through the Tauri bundle targets.

## Windows installation experience

The supported Windows installer is the Tauri-generated NSIS setup executable.

- Installs for the current Windows user by default, so the installed POS application runs without administrator privileges.
- Uses a branded install wizard with a selectable destination folder, progress, Start Menu shortcut and a desktop shortcut.
- Uses the BeBoss native executable name `BeBoss.exe`; the Start Menu, desktop and uninstall links all target the same installation.
- Ensures the Microsoft Edge WebView2 runtime is available through Tauri's download-bootstrapper flow. If a machine has no WebView2 runtime, the installer needs an internet connection to download it.
- Registers the Tauri-managed per-user uninstaller. The custom NSIS hooks do not create a second machine-wide uninstall registry entry.
- Removes only obsolete BeBoss-owned firewall rules and the old `.bbbackup` file association. It does not create inbound firewall exceptions.

The installer is the current-user variant. A managed enterprise needing machine-wide deployment should use a separately reviewed per-machine rollout path with its administrator/UAC policy; the current-user package must not write machine-wide registry keys.

## First launch

After the operating-system installer completes and the native application opens, the first-run wizard performs actual native checks:

1. Reads the operating system, architecture, desktop version and local database location.
2. Creates or reads the persistent native desktop installation identity.
3. Opens the encrypted on-device recovery store, confirms SQLCipher is active, runs `PRAGMA quick_check(1)`, confirms WAL journal mode, and inspects the durable retry queue. This local store is not the primary business database.
4. Writes, reads and removes a temporary value through encrypted local storage backed by the OS credential vault.
5. Makes a real HTTPS request to the configured Supabase PostgreSQL Data API using the publishable project key. A TCP handshake alone is not considered database connectivity. Owner SMS authentication, device enrollment and tenant authorization are then checked during the real sign-in flow.

The wizard blocks completion if the encrypted recovery-store integrity check, WAL-mode check or Supabase PostgreSQL Data API check fails. First-time setup cannot finish while the cloud database is unreachable. The subsequent sign-in still performs the real owner and tenant authorization checks.

## Desktop thermal printer transport

The native desktop ESC/POS command now submits a RAW print job to the operating system's configured default printer queue. Windows uses the native Windows Print Spooler RAW job API; macOS and Linux use the CUPS `lp` RAW queue. The Diagnostics screen shows the detected default printer and includes a clearly marked **test receipt** that does not create a sale, deduct stock or collect payment.

For a thermal printer, install the manufacturer's driver/queue and set the ESC/POS-compatible printer as the operating-system default before printing. The spool artifact is also preserved under the BeBoss application-data directory for diagnostics. A queue accepting the job does not prove the paper output, paper width, cutter, cash drawer, firmware and character encoding are correct; those still require a print on each supported physical model.

## Cloud data, local recovery and uninstall

Supabase PostgreSQL is the source of truth for shop business records. The current desktop/mobile sync path stores signed, compressed shop snapshot generations in `public.branch_sync_snapshots`, while account, branch, device, staff, payment and management records use protected cloud tables and server-side functions. Authenticated owner/device checks and tenant-scoped authorization run before business writes are accepted.

The native per-user SQLCipher database is only a protected recovery store for the last-known cache, pending retry queue, minimal preferences and secure values. Its key seed is stored through the operating-system credential vault. A locally queued or cached change is not represented as a confirmed cloud commit until Supabase accepts the relevant snapshot generation. Reconnect to the cloud and confirm the pending queue is empty before migrating or uninstalling.

The supported uninstall removes the installed binaries and BeBoss shortcuts but deliberately preserves the BeBoss application-data directory. This avoids silently deleting pending recovery data, encrypted credentials and exported local backups. Owners should first export a portable encrypted backup and confirm that all business changes have synchronized to Supabase.

## Build and verify locally

From the `desktop` directory:

```powershell
npm ci
npm run check:versions
npm run check:types
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run dist:win
```

The repository's Windows CI additionally builds the NSIS installer, performs a silent install, checks the executable and Start Menu shortcut, silently uninstalls it, and asserts that a per-user app-data sentinel survives uninstall.

## Production signing and distribution

A production Windows installer is not considered release-ready until Authenticode signing and signature verification succeed. The release workflow requires the protected GitHub Actions secrets:

- `WINDOWS_CODESIGN_PFX_BASE64`
- `WINDOWS_CODESIGN_PFX_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

When the certificate or password is missing, production release fails closed rather than publishing an unsigned executable as a trusted production installer. CI artifacts produced by ordinary pull requests are explicitly unsigned inspection builds and must not be distributed to merchants.

## Enterprise controls not enabled without protected signing material

Tauri's in-app updater requires a separately generated updater signing keypair: the public key is embedded into the app, and every updater package must be signed with the private key. This repository's current desktop installer uses Authenticode signing for Windows setup distribution; a Tauri signed auto-update channel must not be advertised or enabled until its dedicated updater keypair and protected CI secrets have been provisioned and tested. Windows Authenticode and Tauri updater signatures are separate trust systems.
