# BeBoss physical-device, printer and offline acceptance checklist

This is a repeatable acceptance runbook, not a claim that physical hardware was available in CI. Record device models, Android versions, printer models, firmware, dates, test account identifiers and evidence for every run. Use staging shops and non-production data.

## 1. Tenant credential rollout

- [ ] Create two unrelated staging shops (Tenant A and Tenant B) with different owner phones and at least two active registered terminals per shop.
- [ ] Upgrade every terminal to the release candidate. Do not retire legacy sync during install or enrollment.
- [ ] Enroll each terminal individually using the registered owner's SMS code. Confirm the enrollment screen shows a secured terminal.
- [ ] Force-stop and restart the app. Confirm the device remains enrolled and cloud sync works.
- [ ] Let the access token expire in staging or expire it through the controlled test fixture. Reconnect and verify single-use refresh rotation.
- [ ] Disable one registered device from the device-management workflow. Confirm its old access and refresh credentials are rejected while other active devices continue to work.
- [ ] Send a request with Tenant A's device token and a forged Tenant B legacy header. Confirm the database still resolves Tenant A only.
- [ ] Confirm a revoked, expired, altered-role, unknown-device and invalid-token request sees no tenant records.
- [ ] Only after every active device for a shop passes, have the registered owner complete the explicit one-way legacy retirement action. Verify all older app versions are rejected for that shop.
- [ ] Repeat after a device replacement and after a terminal is lost. Preserve local data and queued writes during re-enrollment; do not clear app data to repair credentials.

## 2. Offline data durability and recovery

For each device, capture local queue counts and cloud record counts before and after every step.

- [ ] Start online, sync, then enable airplane mode.
- [ ] Create sales, products, stock movements, customers, customer payments, purchases and debts; edit and soft-delete representative records.
- [ ] Close the app normally, force-stop it, and reboot the device while still offline. Reopen and confirm all local data and pending queue entries remain.
- [ ] Restore connectivity. Confirm queued operations drain, retries are bounded, and the server/client merge does not create duplicate sales, payments or stock movements.
- [ ] Interrupt connectivity during an upload and repeat. Confirm idempotency keys and tombstones prevent duplicate effects.
- [ ] Create concurrent edits on two terminals for the same item while offline, then reconnect in both orders. Verify conflict resolution and audit history.
- [ ] Exercise dead-letter retry and export/backup recovery using an explicitly selected backup file.
- [ ] Verify an expired device credential blocks only cloud sync; local reads and writes remain available and queued.
- [ ] Verify a revoked credential cannot refresh. Owner re-enrollment must restore cloud sync without deleting the offline database.

## 3. Camera, biometric and Android system behavior

- [ ] Camera permission allow/deny/revoke, barcode scan under good/poor light, focus, rotation and repeated scans.
- [ ] Biometric enrollment and authentication success/failure/cancel, fallback policy, screen lock reset, biometric enrollment change and Android Keystore invalidation.
- [ ] Background WorkManager sync under Doze, battery saver, app update, process death and reboot.
- [ ] Date/time change and clock rollback protection; confirm server time is authoritative for credential expiry.
- [ ] Test minimum supported Android API, current Android release, at least one low-memory device and at least one rugged/POS terminal used by the business.

## 4. Bluetooth and USB receipt printers

For each exact printer model and firmware, test both its supported connection modes.

- [ ] Pairing/discovery, first permission request, permission denied then granted, reconnect after printer power cycle and reconnect after Android reboot.
- [ ] 58 mm and 80 mm paper widths, logo, tax lines, currency, long names, non-ASCII/Rwandan text, barcode/QR, footer and cut command.
- [ ] Print after a sale, automatic print setting on/off, reprint, duplicate warning and no-sale/no-cash-drawer safety.
- [ ] Paper-out, lid-open, disconnected, Bluetooth disabled, USB unplugged mid-print, low battery and printer busy/error response.
- [ ] Confirm the app reports real transport success/failure rather than treating generated ESC/POS bytes or a saved spool file as proof of printing.
- [ ] Repeat after offline sale and reconnect. Confirm exactly one receipt can be reprinted from the original sale without creating a second sale.

## 5. Windows desktop release acceptance

- [ ] Install the signed NSIS installer on a clean supported Windows 10/11 machine using the expected UAC scope.
- [ ] Verify Authenticode publisher, certificate chain, timestamp and signature status in file properties and with signtool verify /pa /v.
- [ ] Upgrade an existing install while preserving shop database, credentials, backups and logs; uninstall and reinstall without deleting user data unless explicitly requested.
- [ ] Test offline checkout, queue recovery, backup/restore, OS printing, USB barcode keyboard wedge and Windows account isolation.
- [ ] Run antivirus/SmartScreen and enterprise endpoint-policy validation on the signed artifact.

## 6. Settlement and evidence

- [ ] In Flutterwave test mode, initiate one real provider-simulated Rwanda Mobile Money checkout with an MTN test wallet and one with an Airtel test wallet.
- [ ] Record each provider transaction ID/reference and run the read-only verification harness documented in ONLINE_PAYMENTS_AND_ENTERPRISE_GATEWAY_ROLLOUT.md. Both must return successful, RWF, exact amount/reference and payment_type=mobilemoneyrw.
- [ ] Confirm Flutterwave delivers the webhook to the configured HTTPS endpoint with the configured verif-hash; verify the webhook record and the subsequent provider API re-query.
- [ ] Test duplicate webhook delivery, wrong hash, wrong transaction ID, mismatched reference/amount/currency and pending/failed payments. No failed/mismatched event may activate a subscription.
- [ ] Repeat only after merchant approval in live mode using a controlled low-value MTN payment and Airtel payment. Reconcile provider settlement reports to BeBoss payment ledger and bank/merchant settlement.
- [ ] Attach redacted provider dashboard evidence, request/event IDs, ledger rows and operator sign-off. Never attach secret keys, OTPs, full phone numbers or card details.

## 7. Final approval

Legacy retirement, live payment activation and broad production rollout require owner approval after all applicable checks above pass. Independent security testing is a separate gate: obtain a qualified external assessment, record findings and remediation, and commission a retest. CI source/database tests do not replace that assessment.
