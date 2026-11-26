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

## Build locally and publish through the Admin page

Desktop installers are produced on your own computer. The Admin → App Releases → Desktop releases workspace does not start GitHub Actions, read GitHub Release assets or build from a remote branch. It accepts only the completed installer that you select from the local build output.

From the `desktop` directory, first validate the source and dependencies:

```powershell
npm ci
npm run check:versions
npm run check:types
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Build the artifact on the corresponding operating system:

| Platform | Local build command | Output directory |
| --- | --- | --- |
| Windows | `npm run release:win:local` | `src-tauri/target/release/bundle/nsis` |
| macOS | `npm run dist:mac` | `src-tauri/target/release/bundle/dmg` |
| Linux | `npm run dist:linux` | `src-tauri/target/release/bundle/appimage` |

The Windows local release script builds the NSIS installer, validates the replacement Authenticode PFX (private key, validity and Code Signing EKU), signs with an RFC 3161 timestamp, verifies the signature chain, and writes SHA-256 checksum output. Store the replacement PFX outside the repository. Set `WINDOWS_CODESIGN_PFX_PATH` and enter `WINDOWS_CODESIGN_PFX_PASSWORD` only in the current PowerShell session. Clear the password when finished with `Remove-Item Env:WINDOWS_CODESIGN_PFX_PASSWORD`. It rejects the old PFX that was previously committed to the public repository.

For a local PowerShell build, set the path to a **new CA-issued code-signing certificate** outside the repository and enter its password through a secure prompt:

```powershell
$env:WINDOWS_CODESIGN_PFX_PATH = "C:\BeBossSigning\replacement-code-signing.pfx"
$securePassword = Read-Host "PFX password" -AsSecureString
$env:WINDOWS_CODESIGN_PFX_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
npm run release:win:local
Remove-Item Env:WINDOWS_CODESIGN_PFX_PASSWORD
Remove-Item Env:WINDOWS_CODESIGN_PFX_PATH
```

**Certificate rotation notice:** deleting the old PFX from the current source tree does not erase earlier public Git history. The old certificate must be revoked or invalidated by its issuer; do not reuse it for production distribution. Never commit a PFX, private key or signing password.

For macOS, run the DMG build on macOS; complete signing and notarization with your Apple Developer credentials before customer distribution. For Linux, build and test the AppImage on a supported Linux environment and verify its runtime dependencies on the distributions used by customers. A package being assembled is not proof that it has passed physical-device or clean-machine acceptance.

### Apply the desktop release database migration

Before using the Admin desktop release workspace, apply the private release table and Storage configuration to the **intended Supabase project**. From the repository's `web` directory, link the correct project, inspect pending migrations and then apply them:

```powershell
cd web
supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
supabase migration list
supabase db push
```

The relevant migration is `web/supabase/migrations/20261126103000_admin_local_desktop_releases.sql`. It creates the private `desktop_app_releases` metadata table, configures the private installer bucket and adds permission-checked publication/download functions. Confirm the project reference and review all pending migrations before applying anything to production.

### Upload a local artifact

1. Sign in to the BeBoss Admin Center with the `releases.manage` permission.
2. Open **App releases → Desktop releases** and choose Windows, macOS or Linux.
3. Follow the build instructions for that platform and complete its signing and verification steps. Select the `package.json` file from the same local `desktop` source checkout used for the build; the Admin page reads its version locally and does not contact GitHub.
4. Select the actual output `.exe`, `.dmg` or `.AppImage` file from your local filesystem and enter release notes. The version must match the selected local manifest. The browser checks the expected package format/header and calculates SHA-256 before uploading the binary to the private Supabase `releases` bucket. These format checks are not operating-system code-signature verification: Windows must pass the local Authenticode signing/verification script, and macOS must be signed and notarized on macOS before publication.
5. Choose whether the build should immediately become the current public installer. Publishing a new current version archives the previous release for that platform only; switching platforms never changes another platform's current installer.
6. Verify the resulting public download page, release notes and checksum. The Mobile and Desktop release histories are separate; a desktop upload never changes the Android APK or its update configuration.

The bucket is private. Public downloads are issued from a server-controlled, short-lived signed URL only after the server confirms that the release is marked public. That covers the current build and any archived version the release administrator has explicitly made public. The browser never receives a storage service key, a permanent public object URL or the underlying private object path. Download counts are incremented by the server-side release-download function.

A failed or interrupted upload is not made public. The Admin page attempts to remove incomplete uploads; check the release archive before retrying in case the network connection was interrupted after a successful publication.

## In-app updater boundary

Publishing a desktop installer through the Admin page is a manual installer distribution process; it does not enable silent in-app updates. Tauri's updater requires a separate keypair: the public key is embedded in the app and each update package must be signed with the matching private key. Do not advertise or enable an automatic update channel until that keypair and its verification path have been provisioned and tested. Windows Authenticode signatures and Tauri updater signatures are separate trust systems.
