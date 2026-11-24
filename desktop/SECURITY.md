# BeBoss Desktop security model

The desktop client renders the canonical BeBoss HTTPS web origin. It is a client of the shared application, not a privileged local database client.

## Renderer boundary
- Node integration is disabled.
- Context isolation and Chromium sandboxing are enabled.
- Web security remains enabled; insecure mixed content is disabled.
- The application rejects cross-origin navigation and embedded webviews.
- External destinations must use credential-free HTTPS and open in the system browser.
- The preload bridge exposes a narrow desktop API only; raw IPC, Node.js globals, filesystem paths and shell commands are never exposed.
- Every IPC handler validates that its sender frame belongs to the trusted BeBoss origin.
- Persistent cookies and storage are scoped to the BeBoss desktop session partition.

## Encrypted desktop data
- Offline workspace snapshots are encrypted in the main process with Electron safeStorage and the host operating-system credential store.
- Supabase refresh/access session data uses a restricted encrypted storage adapter and is stored separately from business cache data.
- Storage refuses to silently downgrade to plaintext when OS encryption is unavailable.
- Renderer code cannot select arbitrary file paths for the encrypted cache or secure Auth storage.
- The cloud sync signing key is read server-side from Supabase and is never included in the desktop bundle.

## Backend and tenant security
- The desktop owner portal requires the registered owner's phone to be verified by Supabase SMS OTP and an active shop_owner_memberships row.
- The shopId parameter is only a tenant selector; the Edge Function checks the actual Auth user and owner membership before reading/writing snapshots.
- Snapshot payloads use the existing BBSHARE1 gzip + HMAC-SHA256 wire format, with the HMAC key held in app_secrets.
- The service-role key and payment secrets are never packaged in Electron or exposed to the renderer.
- RLS and server authorization remain authoritative for admin and normalized business tables.

## Update and release safeguards
- Updates are sourced only from the public BeBoss GitHub Releases feed over HTTPS.
- electron-updater verifies downloads against the SHA-512 metadata.
- Release publication is tag-driven and blocked unless Windows Authenticode and macOS Developer ID/notarization secrets are present.
- Linux packages are accompanied by detached GPG signatures and a public key plus per-platform SHA-256 checksum manifests.
- Clean-install, in-place upgrade, rollback and recovery must be validated before public release.