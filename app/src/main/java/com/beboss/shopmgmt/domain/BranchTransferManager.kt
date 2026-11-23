package com.beboss.shopmgmt.domain

import androidx.room.withTransaction
import com.beboss.shopmgmt.data.dao.BranchDao
import com.beboss.shopmgmt.data.dao.ProductDao
import com.beboss.shopmgmt.data.dao.ShopProfileDao
import com.beboss.shopmgmt.data.dao.StockTransferDao
import com.beboss.shopmgmt.data.dao.SyncQueueDao
import com.beboss.shopmgmt.data.dao.SyncTombstoneDao
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.StockTransfer
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.data.model.SyncTombstone
import com.beboss.shopmgmt.util.BeBossLogger
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.DbWriteMutex
import com.beboss.shopmgmt.util.HlcClock
import com.beboss.shopmgmt.util.safeMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Domain Manager: Multi-Branch Stores & Inter-Branch Stock Transfers.
 *
 * Key guarantees:
 * - Stock transfers atomically deduct from source branch and credit destination branch
 *   inside a single Room transaction (no partial state even on crash).
 * - Branch stock-value snapshots are refreshed after every transfer so the Dashboard
 *   always shows live per-branch inventory value.
 * - Every mutation is enqueued to SyncQueueDao so it uploads to Supabase automatically
 *   when internet returns (WorkManager background worker).
 * - HLC timestamps ensure causal ordering across multi-device merges.
 */
class BranchTransferManager(
    private val branchDao: BranchDao,
    private val stockTransferDao: StockTransferDao,
    private val productDao: ProductDao,
    private val shopProfileDao: ShopProfileDao,
    private val syncQueueDao: SyncQueueDao,
    private val syncTombstoneDao: SyncTombstoneDao? = null,
    private val database: AppDatabase? = null,
    private val nodeId: String = "ANDROID-${UUID.randomUUID()}"
) {
    private val TAG = "BranchTransferManager"

    val allBranches: Flow<List<Branch>> = branchDao.getAllActiveBranches()
    val allStockTransfers: Flow<List<StockTransfer>> = stockTransferDao.getAllTransfers()

    suspend fun getAllBranchesList(): List<Branch> = withContext(Dispatchers.IO) {
        branchDao.getAllActiveBranchesList()
    }

    suspend fun saveBranch(branch: Branch) = withContext(Dispatchers.IO) {
        val now = ClockGuard.effectiveNowMs()
        val toSave = branch.copy(
            updatedAt = now,
            hlcTimestamp = HlcClock.tick(now)
        )
        if (toSave.isMainBranch) {
            branchDao.getAllActiveBranchesList()
                .filter { it.id != toSave.id && it.isMainBranch }
                .forEach { b ->
                    branchDao.insertBranch(b.copy(isMainBranch = false, updatedAt = now, hlcTimestamp = HlcClock.tick(now)))
                }
        }
        branchDao.insertBranch(toSave)
        syncTombstoneDao?.deleteTombstone(SyncTombstone.keyFor("branches", toSave.id))
        enqueueBranchSync(toSave, "UPDATE")
    }

    suspend fun updateBranchOperationalStatus(branchId: String, status: String) = withContext(Dispatchers.IO) {
        val now = ClockGuard.effectiveNowMs()
        branchDao.updateOperationalStatus(branchId, status, now)
        val branch = branchDao.getBranchById(branchId) ?: return@withContext
        enqueueBranchSync(branch, "UPDATE")
    }

    suspend fun deleteBranch(branchId: String) = withContext(Dispatchers.IO) {
        val now = ClockGuard.effectiveNowMs()
        branchDao.softDeleteBranch(branchId, now)
        syncTombstoneDao?.insertTombstone(
            SyncTombstone(
                id = SyncTombstone.keyFor("branches", branchId),
                tableName = "branches",
                recordId = branchId,
                deletedAt = now,
                hlcTimestamp = HlcClock.tick(now)
            )
        )
        syncQueueDao.enqueue(
            SyncQueueItem(
                tableName = "branches",
                recordId = branchId,
                operation = "DELETE",
                payloadJson = JSONObject().put("id", branchId).toString()
            )
        )
    }

    suspend fun ensureDefaultBranches(): List<Branch> = withContext(Dispatchers.IO) {
        // Remove stale mock branches from old demo data
        val mockIds = setOf("branch_kimironko", "branch_nyabugogo")
        branchDao.getAllActiveBranchesList()
            .filter { it.id in mockIds }
            .forEach { branchDao.softDeleteBranch(it.id) }

        if (branchDao.getBranchCount() == 0) {
            val profile = shopProfileDao.getShopProfileDirect()
            val shopName = profile?.shopName?.ifBlank { "Main Store" } ?: "Main Store"
            val mainBranch = Branch(
                id = "main_branch",
                name = "$shopName (HQ)",
                code = "HQ-01",
                address = profile?.address?.ifBlank { "Kigali, Rwanda" } ?: "Kigali, Rwanda",
                phone = profile?.phone ?: "",
                managerName = profile?.name ?: "Shop Owner",
                isMainBranch = true,
                colorHex = "#FF6B1A"
            )
            branchDao.insertAllBranches(listOf(mainBranch))
            listOf(mainBranch)
        } else {
            branchDao.getAllActiveBranchesList()
        }
    }

    /**
     * Records an inter-branch stock transfer with ATOMIC inventory deduction.
     *
     * Atomicity guarantee: the source product's quantityInStock is decremented and the
     * transfer record is inserted inside a single Room transaction. If the database
     * crashes mid-write, both operations roll back together — no phantom stock loss.
     *
     * The destination branch's stock is credited by inserting a matching product record
     * (or updating the existing one) scoped to the destination branchId.
     */
    suspend fun recordStockTransfer(
        productId: String,
        fromBranchId: String,
        fromBranchName: String,
        toBranchId: String,
        toBranchName: String,
        quantity: Double,
        notes: String,
        transferredBy: String = "Store Manager"
    ): StockTransfer = withContext(Dispatchers.IO) {
        val now = ClockGuard.effectiveNowMs()
        if (fromBranchId == toBranchId) {
            throw IllegalArgumentException("Source and destination branches must be different")
        }
        if (!quantity.isFinite() || quantity <= 0.0) {
            throw IllegalArgumentException("Transfer quantity must be a finite number greater than zero")
        }
        val safeQty = quantity
        val transferNumber = "TRF-" +
            SimpleDateFormat("yyMMdd-HHmmss", Locale.getDefault()).format(Date(now)) +
            "-" + UUID.randomUUID().toString().take(4).uppercase(Locale.ROOT)

        lateinit var transfer: StockTransfer
        var newSourceQty = 0.0
        var productName = ""
        var productUnit = ""

        // Read the source product only after entering the serialized transaction.
        // Two concurrent transfers can no longer both validate and deduct the same stock.
        val createTransfer: suspend () -> Unit = {
            val product = productDao.getProductById(productId)
                ?: throw IllegalArgumentException("Product not found: $productId")
            if (product.isDeleted) {
                throw IllegalArgumentException("Deleted products cannot be transferred")
            }
            if (product.branchId.isNotBlank() && product.branchId != fromBranchId) {
                throw IllegalArgumentException("This product does not belong to the source branch")
            }
            if (product.quantityInStock < safeQty) {
                throw IllegalArgumentException(
                    "Insufficient stock. Available: ${product.quantityInStock}, requested: $safeQty"
                )
            }

            val costValue = (product.costPrice * safeQty).toLong().coerceAtLeast(0L)
            transfer = StockTransfer(
                id = UUID.randomUUID().toString(),
                transferNumber = transferNumber,
                productId = productId,
                productName = product.name,
                fromBranchId = fromBranchId,
                fromBranchName = fromBranchName,
                toBranchId = toBranchId,
                toBranchName = toBranchName,
                quantity = safeQty,
                unit = product.unit,
                costValueRwf = costValue,
                transferDate = now,
                status = "IN_TRANSIT",
                notes = notes.trim(),
                transferredBy = transferredBy,
                createdAt = now,
                updatedAt = now,
                hlcTimestamp = HlcClock.tick(now),
                lastModifiedDeviceId = nodeId
            )

            newSourceQty = product.quantityInStock - safeQty
            productDao.insertProduct(
                product.copy(
                    quantityInStock = newSourceQty,
                    updatedAt = now,
                    hlcTimestamp = HlcClock.tick(now)
                )
            )
            stockTransferDao.insertTransfer(transfer)
            productName = product.name
            productUnit = product.unit
        }

        if (database != null) {
            DbWriteMutex.withLock {
                database.withTransaction { createTransfer() }
            }
        } else {
            // The application repository supplies a database; this fallback remains
            // serialized for isolated manager instances used by integrations/tests.
            DbWriteMutex.withLock { createTransfer() }
        }

        refreshBranchStockSnapshot(fromBranchId)
        refreshBranchStockSnapshot(toBranchId)

        syncQueueDao.enqueue(
            SyncQueueItem(
                tableName = "stock_transfers",
                recordId = transfer.id,
                operation = "CREATE",
                payloadJson = buildTransferPayload(transfer)
            )
        )
        enqueueProductStockSync(productId, newSourceQty, now)

        BeBossLogger.i(
            TAG,
            "Transfer $transferNumber: ${safeQty.toInt()} $productUnit of '$productName' from $fromBranchName -> $toBranchName (${transfer.costValueRwf} FRw)"
        )
        transfer
    }

    /**
     * Confirms receipt of an IN_TRANSIT transfer at the destination branch.
     * Credits the destination branch's product stock atomically.
     */
    suspend fun confirmTransferReceived(
        transferId: String,
        receivedBy: String
    ): StockTransfer = withContext(Dispatchers.IO) {
        stockTransferDao.getTransferById(transferId)
            ?: throw IllegalArgumentException("Transfer not found: $transferId")

        val now = ClockGuard.effectiveNowMs()
        var completedTransfer: StockTransfer? = null
        var newlyCompleted = false
        var creditedDestinationProductId: String? = null
        var creditedDestinationQty = 0.0

        val completeTransfer: suspend () -> Unit = {
            val current = stockTransferDao.getTransferById(transferId)
                ?: throw IllegalArgumentException("Transfer not found: $transferId")
            when (current.status) {
                "COMPLETED" -> completedTransfer = current
                "CANCELLED" -> throw IllegalStateException("Cancelled transfers cannot be confirmed as received.")
                else -> {
                    // Conditional status transition is the idempotency boundary. The
                    // transition and inventory credit commit or roll back together.
                    val completionHlc = HlcClock.tick(now)
                    val claimed = stockTransferDao.confirmReceived(
                        id = transferId,
                        receivedBy = receivedBy,
                        receivedAt = now,
                        updatedAt = now,
                        hlcTimestamp = completionHlc,
                        lastModifiedDeviceId = nodeId,
                        status = "COMPLETED"
                    )
                    if (claimed != 1) {
                        val latest = stockTransferDao.getTransferById(transferId)
                            ?: throw IllegalArgumentException("Transfer not found: $transferId")
                        if (latest.status == "COMPLETED") {
                            completedTransfer = latest
                        } else if (latest.status == "CANCELLED") {
                            throw IllegalStateException("Cancelled transfers cannot be confirmed as received.")
                        } else {
                            throw IllegalStateException("This transfer has already changed. Refresh and try again.")
                        }
                    } else {
                        val sourceProduct = productDao.getProductById(current.productId)
                            ?: throw IllegalStateException("The source product is missing. Restore it before receiving this transfer.")
                        if (sourceProduct.isDeleted) {
                            throw IllegalStateException("The source product is deleted. Restore it before receiving this transfer.")
                        }

                        val byBarcode = if (sourceProduct.barcode.isNotBlank()) {
                            productDao.getProductByBarcodeAndBranch(sourceProduct.barcode, current.toBranchId)
                        } else null
                        val destination = byBarcode ?: productDao.getAllProductsList().firstOrNull { candidate ->
                            !candidate.isDeleted &&
                                (candidate.branchId == current.toBranchId ||
                                    (current.toBranchId == "main_branch" && candidate.branchId.isBlank())) &&
                                candidate.name.trim().equals(sourceProduct.name.trim(), ignoreCase = true)
                        }

                        if (destination != null) {
                            val newQty = destination.quantityInStock + current.quantity
                            productDao.insertProduct(
                                destination.copy(
                                    quantityInStock = newQty,
                                    updatedAt = now,
                                    hlcTimestamp = HlcClock.tick(now)
                                )
                            )
                            creditedDestinationProductId = destination.id
                            creditedDestinationQty = newQty
                        } else {
                            val newId = UUID.randomUUID().toString()
                            productDao.insertProduct(
                                sourceProduct.copy(
                                    id = newId,
                                    quantityInStock = current.quantity,
                                    branchId = current.toBranchId,
                                    createdAt = now,
                                    updatedAt = now,
                                    hlcTimestamp = HlcClock.tick(now)
                                )
                            )
                            creditedDestinationProductId = newId
                            creditedDestinationQty = current.quantity
                        }
                        completedTransfer = current.copy(
                            status = "COMPLETED",
                            receivedBy = receivedBy,
                            receivedAt = now,
                            updatedAt = now,
                            hlcTimestamp = completionHlc,
                            lastModifiedDeviceId = nodeId
                        )
                        newlyCompleted = true
                    }
                }
            }
        }

        if (database != null) {
            DbWriteMutex.withLock {
                database.withTransaction { completeTransfer() }
            }
        } else {
            DbWriteMutex.withLock { completeTransfer() }
        }

        val updated = completedTransfer
            ?: stockTransferDao.getTransferById(transferId)
            ?: throw IllegalStateException("Completed transfer could not be reloaded")
        if (!newlyCompleted) return@withContext updated

        refreshBranchStockSnapshot(updated.toBranchId)
        syncQueueDao.enqueue(
            SyncQueueItem(
                tableName = "stock_transfers",
                recordId = transferId,
                operation = "UPDATE",
                payloadJson = buildTransferPayload(updated)
            )
        )
        creditedDestinationProductId?.let { pid ->
            enqueueProductStockSync(pid, creditedDestinationQty, now)
        }
        updated
    }

    /**
     * Rejects or cancels an IN_TRANSIT / PENDING transfer, atomically returning the
     * deducted quantity to the source branch inventory.
     */
    suspend fun rejectOrCancelTransfer(
        transferId: String,
        actorName: String,
        reason: String = "Returned to source branch"
    ): StockTransfer = withContext(Dispatchers.IO) {
        stockTransferDao.getTransferById(transferId)
            ?: throw IllegalArgumentException("Transfer not found: $transferId")

        val now = ClockGuard.effectiveNowMs()
        var cancelledTransfer: StockTransfer? = null
        var newlyCancelled = false

        val cancelTransfer: suspend () -> Unit = {
            val current = stockTransferDao.getTransferById(transferId)
                ?: throw IllegalArgumentException("Transfer not found: $transferId")
            when (current.status) {
                "CANCELLED" -> cancelledTransfer = current
                "COMPLETED" -> throw IllegalStateException(
                    "Completed transfers cannot be cancelled. Issue a return transfer instead."
                )
                else -> {
                    val restoredProduct = productDao.getProductById(current.productId)
                        ?: throw IllegalStateException("The source product is missing. Restore it before cancelling this transfer.")
                    val cleanReason = reason.trim().ifBlank { "Returned to source branch" }
                    val updatedNotes = if (current.notes.isBlank()) {
                        "[CANCELLED: $cleanReason]"
                    } else {
                        "${current.notes} | [CANCELLED: $cleanReason]"
                    }
                    val actor = actorName.trim().ifBlank { "Manager" }
                    val cancellationHlc = HlcClock.tick(now)
                    val claimed = stockTransferDao.cancelPendingTransfer(
                        id = transferId,
                        actorName = actor,
                        receivedAt = now,
                        notes = updatedNotes,
                        updatedAt = now,
                        hlcTimestamp = cancellationHlc,
                        lastModifiedDeviceId = nodeId
                    )
                    if (claimed != 1) {
                        val latest = stockTransferDao.getTransferById(transferId)
                            ?: throw IllegalArgumentException("Transfer not found: $transferId")
                        if (latest.status == "CANCELLED") {
                            cancelledTransfer = latest
                        } else if (latest.status == "COMPLETED") {
                            throw IllegalStateException(
                                "Completed transfers cannot be cancelled. Issue a return transfer instead."
                            )
                        } else {
                            throw IllegalStateException("This transfer has already changed. Refresh and try again.")
                        }
                    } else {
                        productDao.incrementStock(current.productId, current.quantity, now)
                        cancelledTransfer = current.copy(
                            status = "CANCELLED",
                            receivedBy = actor,
                            receivedAt = now,
                            notes = updatedNotes,
                            updatedAt = now,
                            hlcTimestamp = cancellationHlc,
                            lastModifiedDeviceId = nodeId
                        )
                        newlyCancelled = true
                    }
                }
            }
        }

        if (database != null) {
            DbWriteMutex.withLock {
                database.withTransaction { cancelTransfer() }
            }
        } else {
            DbWriteMutex.withLock { cancelTransfer() }
        }

        val updated = cancelledTransfer
            ?: stockTransferDao.getTransferById(transferId)
            ?: throw IllegalStateException("Cancelled transfer could not be reloaded")
        if (!newlyCancelled) return@withContext updated

        refreshBranchStockSnapshot(updated.fromBranchId)
        val restoredProduct = productDao.getProductById(updated.productId)
        syncQueueDao.enqueue(
            SyncQueueItem(
                tableName = "stock_transfers",
                recordId = transferId,
                operation = "UPDATE",
                payloadJson = buildTransferPayload(updated)
            )
        )
        if (restoredProduct != null) {
            enqueueProductStockSync(restoredProduct.id, restoredProduct.quantityInStock, now)
        }
        updated
    }

    suspend fun deleteStockTransfer(transferId: String) = withContext(Dispatchers.IO) {
        val now = ClockGuard.effectiveNowMs()
        stockTransferDao.deleteTransfer(transferId)
        syncTombstoneDao?.insertTombstone(
            SyncTombstone(
                id = SyncTombstone.keyFor("stock_transfers", transferId),
                tableName = "stock_transfers",
                recordId = transferId,
                deletedAt = now,
                hlcTimestamp = HlcClock.tick(now)
            )
        )
        syncQueueDao.enqueue(
            SyncQueueItem(
                tableName = "stock_transfers",
                recordId = transferId,
                operation = "DELETE",
                payloadJson = JSONObject().put("id", transferId).toString()
            )
        )
    }

    /**
     * Refreshes the per-branch stock value snapshot stored on the Branch record.
     * Called after every transfer so the Dashboard always shows live inventory value.
     */
    suspend fun refreshBranchStockSnapshot(branchId: String) = withContext(Dispatchers.IO) {
        try {
            val products = productDao.getAllProductsList()
                .filter { !it.isDeleted && (it.branchId == branchId || (branchId == "main_branch" && it.branchId.isBlank())) }
            val stockValue = products.sumOf { (it.costPrice * it.quantityInStock).toLong() }
            branchDao.updateBranchStockSnapshot(branchId, stockValue, products.size)
            val updated = branchDao.getBranchById(branchId)
            if (updated != null) enqueueBranchSync(updated, "UPDATE")
        } catch (e: Exception) {
            BeBossLogger.w(TAG, "refreshBranchStockSnapshot failed for $branchId: ${e.safeMessage()}")
        }
    }

    /**
     * Refreshes stock snapshots for ALL active branches. Called on app startup and after bulk imports.
     */
    suspend fun refreshAllBranchStockSnapshots() = withContext(Dispatchers.IO) {
        branchDao.getAllActiveBranchesList().forEach { branch ->
            refreshBranchStockSnapshot(branch.id)
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private suspend fun enqueueBranchSync(branch: Branch, operation: String) {
        val payload = JSONObject().apply {
            put("id", branch.id)
            put("name", branch.name)
            put("code", branch.code)
            put("address", branch.address)
            put("phone", branch.phone)
            put("managerUserId", branch.managerUserId)
            put("managerName", branch.managerName)
            put("isMain", branch.isMainBranch)
            put("isActive", branch.isActive)
            put("colorHex", branch.colorHex)
            put("operationalStatus", branch.operationalStatus)
            put("dailySalesTargetRwf", branch.dailySalesTargetRwf)
            put("monthlyTargetRwf", branch.monthlyTargetRwf)
            put("openingCashFloat", branch.openingCashFloat)
            put("stockValueRwf", branch.stockValueRwf)
            put("productCount", branch.productCount)
            put("email", branch.email)
            put("notes", branch.notes)
            put("createdAt", branch.createdAt)
            put("updatedAt", branch.updatedAt)
            put("syncVersion", branch.syncVersion)
            put("hlcTimestamp", branch.hlcTimestamp)
            put("lastModifiedDeviceId", branch.lastModifiedDeviceId)
        }.toString()
        syncQueueDao.enqueue(
            SyncQueueItem(
                tableName = "branches",
                recordId = branch.id,
                operation = operation,
                payloadJson = payload
            )
        )
    }

    private suspend fun enqueueProductStockSync(productId: String, newQty: Double, now: Long) {
        syncQueueDao.enqueue(
            SyncQueueItem(
                tableName = "products",
                recordId = productId,
                operation = "UPDATE",
                payloadJson = JSONObject().apply {
                    put("id", productId)
                    put("quantityInStock", newQty)
                    put("updatedAt", now)
                }.toString()
            )
        )
    }

    private fun buildTransferPayload(t: StockTransfer): String = JSONObject().apply {
        put("id", t.id)
        put("transferNumber", t.transferNumber)
        put("productId", t.productId)
        put("productName", t.productName)
        put("fromBranchId", t.fromBranchId)
        put("fromBranchName", t.fromBranchName)
        put("toBranchId", t.toBranchId)
        put("toBranchName", t.toBranchName)
        put("quantity", t.quantity)
        put("unit", t.unit)
        put("costValueRwf", t.costValueRwf)
        put("status", t.status)
        put("transferredBy", t.transferredBy)
        put("receivedBy", t.receivedBy)
        put("receivedAt", t.receivedAt)
        put("transferDate", t.transferDate)
        put("updatedAt", t.updatedAt)
        put("hlcTimestamp", t.hlcTimestamp)
        put("lastModifiedDeviceId", t.lastModifiedDeviceId)
        put("notes", t.notes)
    }.toString()
}
