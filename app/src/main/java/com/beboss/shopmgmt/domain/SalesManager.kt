package com.beboss.shopmgmt.domain

import android.os.StatFs
import androidx.room.withTransaction
import com.beboss.shopmgmt.data.dao.CustomerDao
import com.beboss.shopmgmt.data.dao.ProductDao
import com.beboss.shopmgmt.data.dao.SaleDao
import com.beboss.shopmgmt.data.dao.SyncQueueDao
import com.beboss.shopmgmt.data.dao.SyncTombstoneDao
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.CartItem
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.data.model.SaleWithItems
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.data.model.SyncTombstone
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.DbWriteMutex
import com.beboss.shopmgmt.util.HlcClock
import com.beboss.shopmgmt.util.MoneyUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Domain Manager handling Point-Of-Sale transactions, Cart logic, Atomic Checkout,
 * and Sales reporting.
 */
class SalesManager(
    private val saleDao: SaleDao,
    private val productDao: ProductDao,
    private val customerDao: CustomerDao,
    private val syncQueueDao: SyncQueueDao,
    private val database: AppDatabase? = null,
    private val syncTombstoneDao: SyncTombstoneDao? = null
) {
    val allSales: Flow<List<Sale>> = saleDao.getAllSales()

    suspend fun getSaleWithItems(saleId: String): SaleWithItems? = withContext(Dispatchers.IO) {
        val sale = saleDao.getSaleById(saleId) ?: return@withContext null
        val items = saleDao.getItemsForSale(saleId)
        SaleWithItems(sale, items)
    }

    /**
     * Executes atomic sale checkout inside a process mutex and single Room transaction:
     * 0. Validates free disk space (if file-backed) & exact integer-cents totals
     * 1. Inserts Sale
     * 2. Inserts SaleItems
     * 3. Decrements inventory for each product
     * 4. Updates customer debt balance if sale has unpaid/debt portion
     * 5. Enqueues sync records
     */
    suspend fun processSale(
        items: List<CartItem>,
        customerId: String?,
        customerName: String,
        discountAmount: Double,
        paymentMethod: String,
        amountPaid: Double,
        notes: String,
        branchId: String = "main_branch",
        branchName: String = "Main Store",
        cashierId: String = "",
        cashierName: String = "Shop Operator",
        enforceCreditLimit: Boolean = true
    ): Sale = withContext(Dispatchers.IO) {
        require(items.isNotEmpty()) { "Cannot checkout an empty cart." }
        require(discountAmount.isFinite() && discountAmount >= 0.0) {
            "The sale discount must be a valid non-negative amount."
        }
        require(amountPaid.isFinite() && amountPaid >= 0.0) {
            "The amount paid must be a valid non-negative amount."
        }
        items.forEach { item ->
            require(item.quantity.isFinite() && item.quantity > 0.0) {
                "Every sale item must have a positive, finite quantity."
            }
            require(item.effectiveUnitPrice.isFinite() && item.effectiveUnitPrice >= 0.0) {
                "Every sale item must have a valid non-negative selling price."
            }
            require(item.product.costPrice.isFinite() && item.product.costPrice >= 0.0) {
                "Every sale item must have a valid non-negative cost price."
            }
            require(item.product.branchId.isBlank() || item.product.branchId == branchId) {
                "A sale cannot include products assigned to another branch."
            }
        }
        ensureSufficientStorage()

        DbWriteMutex.withLock {
            val executeCheckout: suspend () -> Sale = {
                val now = ClockGuard.effectiveNowMs()
                val hlc = HlcClock.tick(now)
                val saleId = UUID.randomUUID().toString()

                val rawTotalCents = items.fold(0L) { total, item ->
                    Math.addExact(total, MoneyUtils.multiplyPriceQuantityCents(item.effectiveUnitPrice, item.quantity))
                }
                require(rawTotalCents > 0L) { "The sale total must be greater than zero." }
                val discountCents = MoneyUtils.toCents(discountAmount)
                require(discountCents <= rawTotalCents) {
                    "The discount cannot be greater than the sale subtotal."
                }
                val netTotalCents = Math.subtractExact(rawTotalCents, discountCents)
                require(netTotalCents > 0L) { "The sale total must be greater than zero after discount." }
                val totalCostCents = items.fold(0L) { total, item ->
                    Math.addExact(total, MoneyUtils.multiplyPriceQuantityCents(item.product.costPrice, item.quantity))
                }
                val profitCents = Math.subtractExact(netTotalCents, totalCostCents)
                val paidCents = MoneyUtils.toCents(amountPaid)
                require(paidCents <= netTotalCents) {
                    "The amount paid cannot exceed the sale total. Enter the amount applied to this sale."
                }

                val netTotal = MoneyUtils.centsToDouble(netTotalCents)
                val effectiveDiscount = MoneyUtils.centsToDouble(discountCents)
                val totalCost = MoneyUtils.centsToDouble(totalCostCents)
                val totalProfit = MoneyUtils.centsToDouble(profitCents)
                val normalizedPaid = MoneyUtils.centsToDouble(paidCents)

                val paymentStatus = when {
                    paidCents >= netTotalCents -> "PAID"
                    paidCents > 0L -> "PARTIAL"
                    else -> "UNPAID"
                }
                val unpaidDebtCents = (netTotalCents - paidCents).coerceAtLeast(0L)
                val unpaidDebt = MoneyUtils.centsToDouble(unpaidDebtCents)

                if (unpaidDebtCents > 0L) {
                    require(!customerId.isNullOrBlank()) {
                        "Select a customer before recording an unpaid or partially paid sale."
                    }
                }
                val customer = customerId?.let { id ->
                    customerDao.getCustomerById(id)
                        ?: throw IllegalStateException("The selected customer no longer exists. Refresh customers and retry.")
                }
                if (enforceCreditLimit && customer != null && unpaidDebtCents > 0L && customer.creditLimit > 0.0) {
                    val projectedDebt = customer.debtBalance + unpaidDebt
                    if (projectedDebt > customer.creditLimit + 0.01) {
                        throw IllegalStateException(
                            "Credit limit exceeded for ${customer.name}: current debt ${customer.debtBalance.toLong()} + new credit ${unpaidDebt.toLong()} exceeds limit ${customer.creditLimit.toLong()}."
                        )
                    }
                }

                val receiptNum = "REC-" + SimpleDateFormat("yyMMdd-HHmmss", Locale.getDefault()).format(Date(now))

                val sale = Sale(
                    id = saleId,
                    customerId = customerId,
                    customerName = customerName.ifBlank { "Walk-in Customer" },
                    saleDate = now,
                    totalAmount = netTotal,
                    totalCost = totalCost,
                    totalProfit = totalProfit,
                    discountAmount = effectiveDiscount,
                    paymentMethod = paymentMethod,
                    paymentStatus = paymentStatus,
                    amountPaid = normalizedPaid,
                    notes = notes,
                    receiptNumber = receiptNum,
                    branchId = branchId,
                    branchName = branchName,
                    cashierId = cashierId,
                    cashierName = cashierName,
                    synced = false,
                    updatedAt = now,
                    hlcTimestamp = hlc
                )

                val saleItems = items.map { cart ->
                    val subCents = MoneyUtils.multiplyPriceQuantityCents(cart.effectiveUnitPrice, cart.quantity)
                    val itemCostCents = MoneyUtils.multiplyPriceQuantityCents(cart.product.costPrice, cart.quantity)
                    SaleItem(
                        id = UUID.randomUUID().toString(),
                        saleId = saleId,
                        productId = cart.product.id,
                        productName = cart.product.name,
                        category = cart.product.category,
                        unit = cart.product.unit,
                        quantitySold = cart.quantity,
                        costPriceAtSale = MoneyUtils.roundMoney(cart.product.costPrice),
                        unitPriceAtSale = MoneyUtils.roundMoney(cart.effectiveUnitPrice),
                        subtotal = MoneyUtils.centsToDouble(subCents),
                        profit = MoneyUtils.centsToDouble(subCents - itemCostCents),
                        branchId = branchId
                    )
                }

                // Write sale and line items
                saleDao.insertSale(sale)
                saleDao.insertSaleItems(saleItems)

                // Decrement product inventory safely and atomically for catalog items
                for (item in items) {
                    if (item.product.id.startsWith("custom_")) continue
                    val updatedRows = productDao.decrementStock(item.product.id, item.quantity, now)
                    if (updatedRows <= 0) {
                        throw IllegalStateException("Insufficient stock or product deleted for '${item.product.name}' (Requested: ${item.quantity}).")
                    }
                }

                // Update customer debt if applicable
                if (customerId != null && unpaidDebt > 0.0) {
                    customerDao.addDebt(customerId, unpaidDebt, now)
                }

                // Enqueue cloud sync
                syncQueueDao.enqueue(
                    SyncQueueItem(
                        tableName = "sales",
                        recordId = saleId,
                        operation = "CREATE",
                        payloadJson = JSONObject().apply {
                            put("total", netTotal)
                            put("itemsCount", items.size)
                            put("receipt", receiptNum)
                        }.toString()
                    )
                )

                sale
            }

            if (database != null) {
                database.withTransaction { executeCheckout() }
            } else {
                executeCheckout()
            }
        }
    }

    suspend fun deleteSale(saleId: String, restockInventory: Boolean = true) = withContext(Dispatchers.IO) {
        DbWriteMutex.withLock {
            val executeDelete: suspend () -> Unit = {
                val sale = saleDao.getSaleById(saleId)
                if (sale != null) {
                    val items = saleDao.getItemsForSale(saleId)
                    val now = ClockGuard.effectiveNowMs()

                    if (restockInventory) {
                        for (item in items) {
                            productDao.incrementStock(item.productId, item.quantitySold, now)
                        }
                    }

                    val unpaidCents = (MoneyUtils.toCents(sale.totalAmount) - MoneyUtils.toCents(sale.amountPaid))
                        .coerceAtLeast(0L)
                    if (sale.customerId != null && unpaidCents > 0L) {
                        customerDao.recordDebtPayment(
                            sale.customerId,
                            MoneyUtils.centsToDouble(unpaidCents),
                            now
                        )
                    }

                    saleDao.deleteSaleItems(saleId)
                    saleDao.deleteSale(saleId)

                    syncTombstoneDao?.insertTombstone(
                        SyncTombstone(
                            id = SyncTombstone.keyFor("sales", saleId),
                            tableName = "sales",
                            recordId = saleId,
                            deletedAt = now,
                            hlcTimestamp = HlcClock.tick(now)
                        )
                    )

                    syncQueueDao.enqueue(
                        SyncQueueItem(
                            tableName = "sales",
                            recordId = saleId,
                            operation = "DELETE",
                            payloadJson = JSONObject().apply {
                                put("deleted", true)
                                put("saleId", saleId)
                            }.toString()
                        )
                    )
                }
            }

            if (database != null) {
                database.withTransaction { executeDelete() }
            } else {
                executeDelete()
            }
        }
    }

    suspend fun clearAllSales() = withContext(Dispatchers.IO) {
        DbWriteMutex.withLock {
            saleDao.clearAllSales()
            saleDao.clearAllSaleItems()
        }
    }

    private fun ensureSufficientStorage() {
        try {
            val path = database?.openHelper?.writableDatabase?.path ?: return
            if (path.isBlank() || path == ":memory:") return
            val parentDir = File(path).parentFile ?: return
            if (!parentDir.exists()) return
            val stat = StatFs(parentDir.absolutePath)
            if (stat.availableBytes in 1L until 2L * 1024L * 1024L) {
                throw IllegalStateException("Low device storage (< 2 MB free). Free space before completing transaction.")
            }
        } catch (ise: IllegalStateException) {
            throw ise
        } catch (_: Throwable) {
            // Best-effort pre-flight only
        }
    }
}
