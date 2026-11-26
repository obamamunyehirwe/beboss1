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
3. Opens SQLCipher, confirms the cipher is active, runs `PRAGMA quick_check(1)`, confirms WAL journal mode, and inspects the durable synchronization outbox.
4. Writes, reads and removes a temporary value through encrypted local storage backed by the OS credential vault.
5. Checks HTTPS TCP reachability of the configured Supabase host. Owner SMS authentication and tenant authorization are tested during the real sign-in flow, not inferred from a TCP connection.

The wizard blocks completion if the encrypted database integrity check or WAL-mode check fails. Cloud unavailability is shown as an offline warning; it is not misreported as successful cloud authentication.

## Local data and uninstall

The application database is held in the native per-user application-data directory and encrypted with SQLCipher. Its key seed is stored through the operating-system credential vault. The user database, secure credential values and local backup files are outside the installer directory.

The supported uninstall removes the installed binaries and BeBoss shortcuts but deliberately preserves the BeBoss application-data directory. This avoids silently deleting a shop's local database, encrypted credentials and backups. Owners should first export a portable encrypted backup and confirm that the cloud snapshot has synchronized before removing the application.

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
