# Desktop security model

The desktop application renders the canonical HTTPS BeBoss web origin. It is not a privileged local database client.

## Renderer boundary

- Node integration is disabled.
- Context isolation and Chromium sandboxing are enabled.
- Web security remains enabled; insecure mixed content is disabled.
- The application rejects cross-origin navigation and embedded webviews.
- External destinations must use credential-free HTTPS and open in the system browser.
- The preload bridge exposes only the desktop indicator, application version and native print capability.
- IPC handlers verify that the sender frame belongs to the trusted BeBoss origin.
- Persistent cookies and storage are scoped to the BeBoss desktop session partition.

## Data and credentials

- No service-role key, payment secret, direct database credential or server API token is bundled.
- Auth tokens remain within the trusted BeBoss web application origin and its persistent Electron session.
- RLS and server-side authorization continue to enforce tenant, branch, role and device boundaries.
- Downloads are saved only after the user chooses a path through the native save dialog.
- Only user-approved BeBoss notifications are permitted; other browser permissions are denied by default.

## Release safeguards

Do not distribute unsigned installers as a final consumer release. Configure platform signing and notarization credentials in GitHub Actions secrets, keep signing jobs protected, publish checksums, and test upgrade/rollback procedures before a public release.
