# BeBoss release qualification checklist

This document defines release evidence required before declaring the desktop and Android builds production-ready. A successful compile is not a substitute for installation, upgrade, signing, notarization or device-level recovery testing.

## Android: offline transfer approval and recovery

Run this matrix on at least two physical Android devices with the same test shop, two active branches and a configured transfer-approval threshold. Record device model, Android version, app version, shop ID, policy version, operator role and test date. Use non-production inventory.

### Enrollment and policy cache

1. Sign in to the primary owner device with an active owner account. Confirm the device is marked active, primary and assigned to that owner.
2. Connect to the internet and refresh the shop approval policy. Record its version and threshold.
3. Confirm the owner terminal registers a P-256 public key with the cloud. Confirm the private key is in Android Keystore and is not present in app backups or exported files.
4. Sign out and sign back in. Confirm policy cache and key-registration state remain available for the same shop/device.
5. On a second non-primary manager device, confirm the policy can be cached but the owner signing key cannot be registered.

### Offline approval matrix

Disable Wi-Fi and mobile data on the primary owner terminal after policy and key registration.

| Test | Expected result |
|---|---|
| Transfer below threshold | Creates locally and queues for sync without owner approval |
| Transfer at threshold | Requires owner PIN and a reason before creation |
| Transfer above threshold | Requires owner PIN and a reason before creation |
| Empty/short reason | Disabled or rejected; no transfer row or stock deduction |
| Wrong owner PIN | Rejected; no transfer row or stock deduction |
| Inactive/non-owner PIN | Rejected; no transfer row or stock deduction |
| Owner PIN entered on a non-primary manager device | Rejected for high-value offline approval |
| Unknown/stale policy cache | Transfer creation is blocked until policy can be refreshed |
| Insufficient source stock or closed branch | Rejected atomically; source stock and transfer table remain unchanged |

Repeat with airplane mode enabled, force-stop/reopen the app, and reboot the device. Confirm the signed approval proof and queued transfer survive without network access.

### Reconnection, tampering and replay

1. Reconnect the owner terminal. Confirm the server accepts a valid below-threshold transfer and a valid above-threshold transfer signed under the cached policy.
2. Verify the owner approval and transfer-sync events are present in the cloud audit history and contain the same transfer ID, owner, device, policy version and reason.
3. Attempt to change the product, quantity, cost, source branch, destination branch, transfer ID, owner ID, device ID, policy version, timestamp, reason and signature separately. Every modified high-value transfer must be rejected.
4. Replay the exact same accepted transfer. Confirm it is idempotent and does not deduct inventory twice or create duplicate approval audit evidence.
5. Change the approval threshold while the device is offline. Reconnect and confirm a proof signed under an old policy version is rejected rather than silently upgraded.
6. Deactivate the approving owner account and primary device. Confirm new approvals are rejected.
7. Use a manager terminal to submit a transfer outside its assigned branch. Confirm the server rejects it.
8. Attempt direct tenant PostgREST INSERT and UPDATE against `shop_stock_transfers`. Both must fail after the Lovable-managed RLS migration is applied. Confirm the same valid operation succeeds through the device-authenticated Edge Function.

### Backup, restore and key loss

1. Export an encrypted shop backup while a signed transfer is pending. Verify approval fields are included in the encrypted transfer record.
2. Restore that backup on a replacement terminal. Confirm the signed evidence remains unchanged and can be verified by the cloud only when the registered public key and original owner device identity remain valid.
3. Verify that an Android Keystore private key is not copied to another device by backup/restore. A replacement device must complete an owner-reviewed key enrollment/recovery process before creating new offline high-value approvals.
4. Uninstall/reinstall the app on a test device and confirm the behavior is fail-closed when the Keystore key is lost. Do not silently create a replacement key that overrides the cloud-registered public key.
5. Confirm local encrypted business data, pending sync queue, and audit records survive the supported app-upgrade path.

**Known recovery requirement:** Android Keystore private keys are non-exportable. A device replacement, uninstall or Keystore reset may require a reviewed owner-key rotation/recovery flow. Until that flow has been implemented and tested, preserve the original registered owner device for pending approvals and do not represent cross-device private-key recovery as supported.

## Desktop: Linux and macOS

For each supported architecture:

- Build AppImage and Debian packages on Linux x64.
- Install the Debian package on a clean runner, launch the app in a virtual display, reinstall/upgrade the package and verify existing application data is not removed.
- Extract the AppImage and verify its launcher and bundle contents.
- Build a DMG on Apple Silicon and Intel runners.
- Mount each DMG, install/replace the app bundle, launch it, and verify application data remains present after replacement.
- When Apple signing credentials are configured, verify the app bundle signature. When notarization credentials are configured, submit the DMG, wait for acceptance, staple the ticket and validate the staple.
- When signing/notarization secrets are absent, label the output unsigned and keep the release blocked from public production distribution.
- Generate checksums only after any signing/notarization/stapling step that can modify the artifact.

## Full authorization parity

- Run the Android unit, instrumentation, compile and migration tests.
- Run web type-check, lint, unit/integration tests, Edge Function type-check and server-function RBAC static audit.
- Run desktop type-check, unit tests, Rust tests and installer checks.
- Verify every desktop, Android and web mutation is checked at the trusted repository/server boundary using the current active principal; missing, inactive or revoked principals must fail closed.
- Verify audit records cover create, update, delete, approval, rejection, receive, cancellation, synchronization and recovery operations where applicable.
- Review all remaining database RLS policies and grants. Client-side and Edge Function checks do not neutralize a permissive direct PostgREST write policy.

## Release sign-off

A release is not production-qualified until the release record contains:

- Successful CI run against the exact release commit.
- Linux and both macOS architecture package-install/upgrade smoke results.
- Package SHA-256 manifests.
- Linux package-signature evidence, where signing is part of the distribution channel.
- macOS Developer ID signature verification and accepted notarization/stapling evidence.
- Android physical-device offline, reconnection, tamper, replay and recovery results.
- Confirmation the Lovable-managed stock-transfer RLS migration is applied and direct REST tenant-write tests fail.
- A recorded owner-key recovery decision for device replacement and Keystore loss.

Do not infer any of these results from a successful source build alone.
