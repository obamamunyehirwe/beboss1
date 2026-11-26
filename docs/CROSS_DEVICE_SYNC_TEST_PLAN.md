# BeBoss cross-device synchronization test plan

This checklist verifies the live Android ↔ Supabase ↔ desktop data path. It is intended for local testing with real registered devices, not mocked API responses.

## Required setup

- Point the Android build and desktop `.env.local` at the same Supabase project using the same project URL and publishable key.
- Deploy the current `beboss-desktop` and `android-device-auth` Edge Functions and apply the repository migrations to that project.
- Use one registered shop with an active owner, at least one active branch, and a working internet connection.
- Pair each Android installation to a distinct active shop-device record and assigned user. Complete authenticated device enrollment on terminals when the shop is using the new device-credential flow. Do not retire legacy sync until every active terminal has enrolled.
- Sign in to desktop with the registered owner phone. A new desktop is a separately licensed device: review and explicitly approve the displayed FRw 2,000 monthly device add-on before registration.
- Keep the desktop app open and signed in. Automatic cross-device checks run while the process is open; minimizing the window does not intentionally disable polling. Closing the app stops desktop polling.

## Expected sync behavior

- Android saves to its local Room database first. Data remains available offline.
- Android schedules an immediate sync after business changes and also has a network-constrained WorkManager cycle scheduled every 15 minutes. Android's operating system may defer periodic work because of power, network, and background-execution policies.
- Android uploads a complete, chunked, signed shop snapshot and pulls the latest complete generations from peer devices. Merges use the shared conflict-resolution engine and deletion tombstones.
- Desktop stores offline changes in its encrypted SQLCipher outbox. When online, it sends version-checked snapshots to the authenticated desktop Edge Function. It polls the server for changes about every 30 seconds and performs a full refresh at the configured interval (default five minutes).
- A successful upload alone is not a completed Android sync. Peer snapshot download and merge must also succeed before Android clears its durable sync queue.

## Test cases

### 1. Android to Android and desktop

1. On Android device A, create a uniquely named product with a known barcode, cost, selling price, stock count, and branch.
2. Trigger Sync Now on A and wait for its sync report to show success.
3. On Android device B, run Sync Now. Confirm the same product appears once with matching fields and branch assignment.
4. On desktop, wait for the automatic change probe or use Refresh. Confirm the same product appears once with matching fields.
5. On B, record a sale using that product. Confirm the sale, sale items, receipt number, customer/payment information, and reduced stock reach A and desktop after their next successful sync.

### 2. Desktop to Android

1. On desktop, add a customer with a unique phone number and a product with a unique barcode.
2. Wait for the desktop save confirmation and for its local outbox count to return to zero.
3. On Android A, trigger Sync Now. Confirm both records appear and retain their identifiers and field values.
4. Repeat from Android B to ensure the cloud snapshot is not visible only to the first paired device.

### 3. Concurrent edits and conflict convergence

1. Put Android A and desktop offline after both have synchronized the same starting snapshot.
2. Change the same mutable record on each device using clearly different values, then create one independent record on each device.
3. Reconnect both devices and trigger sync. Allow retries to complete.
4. Confirm both independent records exist on all devices and the shared record converges to the same HLC/version winner on A, B, and desktop.
5. Restart the apps and repeat the comparison. Results must remain identical after restart.

### 4. Offline queue and recovery

1. Disconnect a device from the network and create a sale, customer payment, stock change, and customer update.
2. Confirm the data remains visible locally and the outbox remains pending.
3. Reconnect. Confirm the device retries automatically, then verify the same business records from another device.
4. Interrupt connectivity during a large snapshot upload. After reconnecting, confirm the incomplete generation is not treated as a completed sync and the queued work remains retryable.
5. Verify that a bad/incomplete peer snapshot does not cause a successful-sync message or clear the Android outbox.

### 5. Deletion and device security

1. Delete a test record on one device and synchronize. Verify its tombstone prevents that record from reappearing from another device's older snapshot.
2. Disable a test device from the owner device-management screen. Confirm the disabled device can no longer perform authenticated cloud sync.
3. Confirm locally saved, unsynchronized records on a disabled/offline device are not silently deleted. Re-enrollment or recovery must be owner-authorized.
4. Sign out and sign back in on desktop. Verify the owner session and desktop device registration are validated before cloud data is opened or changed.

## Acceptance criteria

- Every test-created record is present once, with matching IDs and expected business fields on all active devices.
- Sales, sale items, stock deductions, customer balances, payments, purchases, branches, staff assignments, transfers, and deletion tombstones converge after synchronization.
- A local change remains in the durable outbox until the server accepts the version-checked snapshot and the device finishes the peer pull/merge.
- Network interruption, partial chunk upload, and concurrent changes never produce a false successful-sync state or silently discard pending data.
- Device revocation blocks further cloud access without wiping the device's local database.
- Results remain consistent after restarting Android and desktop applications.

## What a local run must still prove

Repository tests can verify merge selection, retry gates, and build correctness, but they cannot prove SMS delivery, a real Supabase deployment's RLS configuration, Android background scheduling on each phone model, two-device behavior on a live shop, or hardware-specific behavior. Record those results against a non-production test shop before production rollout.
