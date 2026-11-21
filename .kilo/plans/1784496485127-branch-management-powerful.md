# BeBoss — Powerful, Real Branch Management (App + Cloud + Web)

## Goal
Make branch management genuinely powerful, real, and fully functional end-to-end:
- Fix the broken `branches` schema so the app no longer crashes on upgrade and every branch field persists.
- Stop all data loss in branch export/import and cloud round-trips.
- Promote branches + stock transfers to **real, queryable cloud tables** (Supabase/Postgres) with tenant isolation, written directly by the phone and editable from the web.
- Give the shop owner (via `/my-shop`, no login) **full CRUD** over branches and stock transfers, with changes flowing back down to devices.
- Guarantee everything **auto-syncs to the internet in the background** whenever connectivity appears (no demo/placeholder).

## Current State (verified)
- `Branch` entity (`app/src/main/.../data/model/Branch.kt`) and exported schema `13.json` declare **23 columns**.
- Migration chain only ever creates **12**: `MIGRATION_4_5` (9 cols) + `MIGRATION_9_10` (+3 causal cols).
- **9 columns never created by any migration**: `managerUserId, dailySalesTargetRwf, monthlyTargetRwf, openingCashFloat, stockValueRwf, productCount, operationalStatus, email, notes`.
- No `fallbackToDestructiveMigration` anywhere → Room `IdentityHashMismatch` crash on every upgrade.
- `ShopDataTransferManager.createExportJson` (lines 183–203) and `parseShopPackageString` (lines 681–707) **omit** all operational branch fields → silent data loss on every backup/merge.
- `BranchTransferManager.recordStockTransfer` / `confirmTransferReceived` do not enqueue the destination-branch product upsert, and `branchDao.updateBranchStockSnapshot` is not enqueued → receiving-branch stock not reliably uploaded when internet returns.
- Cloud stores branch/transfer data **only inside opaque BBSHARE1 snapshot blobs**; no `branches`/`stock_transfers` tables → web can only read, not query or write.
- Owner portal `/my-shop` shows a staff table with a branch column but no branch management.

## Decisions (confirmed with user)
1. **Schema fix**: add a Room migration to v14 (add the 9 missing columns with correct defaults); export `14.json`.
2. **Cloud storage**: add normalized cloud tables `shop_branches` + `shop_stock_transfers` (mirror the existing tenant-scoped `shop_users`/`shop_devices` pattern).
3. **Owner portal**: full CRUD from web (create/edit/delete branches, record/confirm transfers), changes sync down to devices via HLC merge.

---

## Task Plan

### 1. Fix the Room schema (foundation — do first)
- `app/src/main/java/com/example/data/db/DatabaseMigrations.kt`: add `MIGRATION_13_14` that runs, in order:
  - `ALTER TABLE branches ADD COLUMN managerUserId TEXT NOT NULL DEFAULT ''`
  - `ALTER TABLE branches ADD COLUMN dailySalesTargetRwf INTEGER NOT NULL DEFAULT 0`
  - `ALTER TABLE branches ADD COLUMN monthlyTargetRwf INTEGER NOT NULL DEFAULT 0`
  - `ALTER TABLE branches ADD COLUMN openingCashFloat INTEGER NOT NULL DEFAULT 0`
  - `ALTER TABLE branches ADD COLUMN stockValueRwf INTEGER NOT NULL DEFAULT 0`
  - `ALTER TABLE branches ADD COLUMN productCount INTEGER NOT NULL DEFAULT 0`
  - `ALTER TABLE branches ADD COLUMN operationalStatus TEXT NOT NULL DEFAULT 'OPEN'`
  - `ALTER TABLE branches ADD COLUMN email TEXT NOT NULL DEFAULT ''`
  - `ALTER TABLE branches ADD COLUMN notes TEXT NOT NULL DEFAULT ''`
  - Append `MIGRATION_13_14` to `ALL_MIGRATIONS`.
- `app/src/main/java/com/example/data/db/AppDatabase.kt`: bump `version = 13` → `version = 14`.
- Export schema: build the app (or run the Room schema export task) to generate `app/schemas/com/example.data.db.AppDatabase/14.json` with the 23-column `branches` table. **Do not hand-write** the JSON — let Room export it.
- Verify column order/types match the `@ColumnInfo` names Room expects (Room validates by name set, so order is irrelevant, but the exported JSON must match).
- Add a migration test in `app/src/test/java/com/example/DatabaseMigrationTest.kt` mirroring the existing `migration 9 to 12 …` test: build a v13 DB, open with `AppDatabase` v14 + `ALL_MIGRATIONS`, assert `PRAGMA integrity_check = ok` and that all 23 branch columns exist and a round-trip insert/select of a fully-populated `Branch` works.

### 2. Stop branch data loss in export/import
- `app/src/main/java/com/example/util/ShopDataTransferManager.kt`:
  - `createExportJson` branch block (lines 183–203): add `dailySalesTargetRwf, monthlyTargetRwf, openingCashFloat, stockValueRwf, productCount, operationalStatus, email, notes`.
  - `parseShopPackageString` branch block (lines 681–707): parse the same 8 fields via `optLong`/`optString`/`optInt` with the entity defaults.
  - Stock transfer parse block (lines ~933–959): add `costValueRwf`, `receivedBy`, `receivedAt` so transfers round-trip fully.

### 3. Reliable branch/transfer sync outbox (phone side)
- `app/src/main/java/com/example/domain/BranchTransferManager.kt`:
  - `recordStockTransfer`: also enqueue a `products` UPDATE for the **destination** product (after `confirmTransferReceived` creates/credits it) — i.e. call a shared `enqueueProductStockSync(productId, newQty, now)` helper for both source and destination.
  - `confirmTransferReceived`: after crediting destination, enqueue the destination `products` UPDATE to `syncQueueDao`.
  - `refreshBranchStockSnapshot` / `saveBranch` / `updateBranchOperationalStatus`: ensure the updated `branches` row (with `stockValueRwf`, `productCount`) is enqueued via `enqueueBranchSync` (add `stockValueRwf`, `productCount`, `operationalStatus`, `email`, `notes`, targets, float to `enqueueBranchSync`'s JSON payload at lines 358–381).

### 4. New cloud tables (web/drizzle — via Lovable workflow)
Create `web/drizzle/migrations/0005_branch_management_tables.sql` (new file, following `0004` naming) and have Lovable/Drizzle generate the corresponding `schema.ts` entries. Tables mirror the tenant-scoped pattern (`shop_sync_key`, `anon` grants for tenant ops, admin-gated deletes, RLS `shop_sync_key = public.current_shop_sync_key()`):

- `public.shop_branches` columns: `id text pk`, `shop_sync_key text not null`, `shop_name text`, `name text`, `code text`, `address text`, `phone text`, `manager_user_id text`, `manager_name text`, `is_main_branch bool`, `is_active bool`, `color_hex text`, `daily_sales_target_rwf bigint`, `monthly_target_rwf bigint`, `opening_cash_float bigint`, `stock_value_rwf bigint`, `product_count int`, `operational_status text`, `email text`, `notes text`, `created_at bigint`, `updated_at bigint`, `sync_version bigint`, `hlc_timestamp bigint`, `last_modified_device_id text`.
- `public.shop_stock_transfers` columns: `id text pk`, `shop_sync_key text not null`, `shop_name text`, `transfer_number text`, `product_id text`, `product_name text`, `from_branch_id text`, `from_branch_name text`, `to_branch_id text`, `to_branch_name text`, `quantity real`, `unit text`, `cost_value_rwf bigint`, `transfer_date bigint`, `status text`, `notes text`, `transferred_by text`, `received_by text`, `received_at bigint`, `synced bool`, `created_at bigint`, `updated_at bigint`, `hlc_timestamp bigint`, `last_modified_device_id text`.
- Grants: `select, insert, update` to `anon`; `select, insert, update, delete` to `authenticated`; `all` to `service_role`. RLS: tenant read/insert/update via `current_shop_sync_key()`; delete admin-only (match `shop_devices` lines 271–284). Indexes on `shop_sync_key`, `is_active`, `updated_at desc`, and transfers `(from_branch_id, to_branch_id)`.
- These are additive, non-breaking tables; existing snapshots stay as-is for backward compatibility.

### 5. Phone writes + reads the new cloud tables
- `app/src/main/java/com/example/util/SupabaseAdminClient.kt`: add (mirroring `upsertShopDevice`/`upsertShopUsers` style, using `buildRestRequest(..., tenantSyncKey = shopSyncKey)` + `Prefer: resolution=merge-duplicates`):
  - `suspend fun upsertShopBranches(shopSyncKey, shopName, branches: List<Branch>): Boolean`
  - `suspend fun fetchShopBranches(shopSyncKey): List<BranchDto>` (new DTO mirroring `SupabaseBranchSnapshotDto`)
  - `suspend fun upsertShopStockTransfers(shopSyncKey, shopName, transfers: List<StockTransfer>): Boolean`
  - `suspend fun fetchShopStockTransfers(shopSyncKey): List<StockTransferDto>`
  - Each upsert maps every `Branch`/`StockTransfer` field (snake_case cloud columns).
- `app/src/main/java/com/example/util/CloudSyncManager.kt` (inside `syncAllDataToCloud`, Supabase block after the snapshot chunk upload ~line 392):
  - Push: `SupabaseAdminClient.upsertShopBranches(shopSyncKey, profile.shopName, branches)` and `upsertShopStockTransfers(...)`; set `allChunksUploaded &= ok` so failures retry with backoff.
  - Pull + merge: `fetchShopBranches` + `fetchShopStockTransfers` → build a lightweight `ShopImportSummary(branches = …, stockTransfers = …)` (reuse existing data class) → `ConflictResolutionEngine.mergePackage(database, summary, "CLOUD_BRANCHES")`. HLC `compareVersions` already makes newer web edits (which set `hlc_timestamp = ClockGuard.effectiveNowMs()`, `lastModifiedDeviceId = "WEB"`) win over phone snapshots → converges, no loops.
- Branch deletes: web sets `is_active=false` + bumps `hlc_timestamp`; phone merge already soft-deletes branches whose tombstone/HLC loses (`ConflictResolutionEngine` lines 145–152). Ensure `fetchShopBranches` returns inactive rows so the phone sees the delete.

### 6. Web owner portal — full CRUD (`/my-shop`)
- `web/src/lib/public.functions.ts`: add server functions (all tenant-scoped via existing `X-Shop-Sync-Key` header + `public-client.ts`):
  - `upsertMyShopBranch({ branch })`, `deleteMyShopBranch({ id })`, `upsertMyShopStockTransfer({ transfer })`, `confirmMyShopStockTransfer({ id, receivedBy })` — each writes to `shop_branches`/`shop_stock_transfers` with `hlc_timestamp = now_ms()` and `last_modified_device_id='WEB'`, `updated_at=now_ms()`. Reuse `public.functions.ts`'s `requireShopContext`/header pattern.
- `web/src/routes/my-shop.tsx`: add a **Branches** tab (and transfers within it) to the lookup result panel:
  - Branch list with inline create/edit form (name, code, phone, address, manager, status, targets, opening float, email, notes) + delete.
  - Stock transfer section: record transfer (product, from, to, qty, notes) + confirm received.
  - Reuse existing UI primitives (`Badge`, `Button`, `Input`, `Select`, `Tabs`).
- `web/src/lib/i18n-dict.ts`: add EN/RW/FR/SW strings for the new tab and form labels (per web AGENTS.md).

### 7. Admin visibility (web, staff-only)
- `web/src/components/admin/ShopRecords.tsx`: switch the **Branches** and **Stock transfers** tabs to read from the new `shop_branches`/`shop_stock_transfers` tables (fallback to snapshot decode if empty), so admin sees live branch ops, not just snapshot blobs.
- `web/src/routes/_authenticated/admin/sync.tsx`: add branch/transfer row counts to the sync monitor.

### 8. Background auto-upload guarantee (verify + harden)
- Confirm `CloudSyncScheduler.schedulePeriodicSync` (15-min periodic, `NetworkType.CONNECTED`) + `enqueueImmediateSync` are invoked from `SyncCoordinator.setupAutoCloudSyncOnInternet()` and on `ConnectivityStatus.AVAILABLE`, and that `BeBossCloudSyncWorker` runs headless (it does). After step 3/5, branch/transfer mutations now produce outbox items + are pushed on the next cycle automatically. No UI changes needed; add an audit-log line per branch sync for observability.

### 9. Validation
- `./gradlew :app:testDebugUnitTest` (or `gradlew.bat`) — new migration test + existing `BranchDataShareTest` must pass; add a round-trip test asserting all 23 branch fields survive export→import.
- `cd web; npm run build` (or the repo's typecheck/lint) — new server fns + portal tab compile.
- Manual: upgrade a v13 DB → v14 (no crash, data intact); edit a branch on web → phone picks it up on next sync; record transfer on phone → appears on web.

## Risks / Notes
- **Lovable DB rule**: `web/drizzle/` is Lovable-managed; create the new migration via the Drizzle/Lovable workflow (do not hand-edit `supabase/migrations/`). The migration is purely additive (new tables) → no risk to existing `branch_sync_snapshots`.
- **HLC convergence**: web writes use `ClockGuard.effectiveNowMs()` semantics (wall-clock ms) and `lastModifiedDeviceId='WEB'`; the phone's existing `HlcClock.compareVersions` already resolves these deterministically. No schema change to the merge engine.
- **Backward compatibility**: shipped APKs keep writing snapshots; the new tables are additive, so old and new clients coexist during rollout.
- **No destructive migration** is introduced; the v14 migration only adds columns with safe defaults.