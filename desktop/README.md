# BeBoss Desktop

BeBoss Desktop is the native Windows/macOS/Linux retail client built with **Tauri 2**. It installs as a real desktop application with an operating-system window, native printing, secure credential storage and file export. The installed computer runs the frontend and device integrations; **Supabase PostgreSQL is the authoritative business database** shared by the shop's mobile and desktop devices.

## Local desktop builds and manual release uploads

Desktop installers are built locally on the operating system they target. The Admin → App Releases → Desktop releases workspace does not dispatch GitHub Actions, fetch source files from GitHub, or download installer binaries from GitHub Releases. The administrator selects the locally built installer and the matching local `desktop/package.json`; the version is read from that manifest before the upload can proceed.

Run the checks from this directory before packaging:

```powershell
npm ci
npm run check:versions
npm run check:types
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

| Platform | Build command | Output directory |
| --- | --- | --- |
| Windows | `npm run release:win:local` | `src-tauri/target/release/bundle/nsis` |
| macOS | `npm run dist:mac` | `src-tauri/target/release/bundle/dmg` |
| Linux | `npm run dist:linux` | `src-tauri/target/release/bundle/appimage` |

Build on the target operating system. Complete the required Windows Authenticode signing, macOS signing/notarization and Linux runtime checks before distribution. Then upload the finished artifact manually in the Admin release workspace. SHA-256 is calculated in the browser and retained with the private release metadata.
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
