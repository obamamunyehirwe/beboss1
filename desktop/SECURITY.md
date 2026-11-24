# Desktop security model

The desktop application renders the canonical HTTPS BeBoss web origin. It is not a privileged local database client.

## Renderer boundary

- Node integration is disabled.
- Context isolation and Chromium sandboxing are enabled.
- Web security remains enabled; insecure mixed content is disabled.
- The application rejects cross-origin navigation and embedded webviews.
- External destinations must use credential-free HTTPS and open in the system browser.
- The preload bridge exposes only the desktop indicator, application version, update status/check and native print capability.
- IPC handlers verify that the sender frame belongs to the trusted BeBoss origin.
- Persistent cookies and storage are scoped to the BeBoss desktop session partition.

## Data and credentials

- No service-role key, payment secret, direct database credential or server API token is bundled.
- Auth tokens remain within the trusted BeBoss web application origin and its persistent Electron session.
- RLS and server-side authorization continue to enforce tenant, branch, role and device boundaries.
- Downloads are saved only after the user chooses a path through the native save dialog.
- Only user-approved BeBoss notifications are permitted; other browser permissions are denied by default.

## Update and release safeguards

- Updates are sourced only from the public BeBoss GitHub Releases feed over HTTPS; no arbitrary update URL or renderer-controlled channel is accepted.
- `electron-updater` validates each downloaded artifact against the SHA-512 metadata before installation.
- Release publication is tag-driven and blocked unless Windows Authenticode and macOS Developer ID/notarization secrets are present.
- Do not distribute unsigned installers as final consumer releases. Protect signing secrets and validate clean-install, in-place upgrade, rollback and recovery paths before a public release.
- Linux packages do not receive OS-vendor code signing; publish SHA-256 checksums alongside them.
