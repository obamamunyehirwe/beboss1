package com.beboss.shopmgmt.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerPayment
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.PurchaseRecord
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.StockTransfer
import com.beboss.shopmgmt.data.model.SyncTombstone
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Base64
import java.util.Collections
import java.util.Date
import java.util.Locale
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class ShopImportSummary(
    val shopName: String,
    val exportedAt: Long,
    val exportedBy: String,
    val userCount: Int,
    val productCount: Int,
    val customerCount: Int,
    val saleCount: Int,
    val paymentCount: Int,
    val users: List<User>,
    val products: List<Product>,
    val customers: List<Customer>,
    val sales: List<Sale>,
    val saleItems: List<SaleItem>,
    val payments: List<CustomerPayment>,
    val shopProfile: ShopProfile?,
    val branches: List<Branch> = emptyList(),
    val stockTransfers: List<StockTransfer> = emptyList(),
    val purchases: List<PurchaseRecord> = emptyList(),
    val branchScopeName: String? = null,
    val schemaVersion: Int = 3,
    val packetNonce: String = "",
    val tombstones: List<SyncTombstone> = emptyList()
)

object ShopDataTransferManager {

    private const val SHARE_TOKEN_PREFIX = "BBSHARE1:"
    private const val SHOP_SHARE_TOKEN_PREFIX = "BBSHARE2:"
    private const val CURRENT_SCHEMA_VERSION = 3
    private const val DEFAULT_TOKEN_TTL_MS = 30L * 24L * 60L * 60L * 1000L

    private val seenShareNonces = Collections.synchronizedMap(
        object : LinkedHashMap<String, Long>(256, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>): Boolean {
                return size > 500
            }
        }
    )

    /**
     * Creates full or delta JSON Object for shop & multi-branch data.
     * Strips sensitive authentication secrets (pinHash, password) from exported staff records.
     */
    fun createExportJson(
        profile: ShopProfile,
        users: List<User>,
        products: List<Product>,
        customers: List<Customer>,
        sales: List<Sale>,
        saleItems: List<SaleItem>,
        payments: List<CustomerPayment>,
        exportedByUser: User?,
        branches: List<Branch> = emptyList(),
        stockTransfers: List<StockTransfer> = emptyList(),
        purchases: List<PurchaseRecord> = emptyList(),
        branchIdFilter: String? = null,
        sinceUpdatedAt: Long = 0L,
        tombstones: List<SyncTombstone> = emptyList()
    ): JSONObject {
        val activeFilter = branchIdFilter?.takeIf { it.isNotBlank() && it != "ALL" }
        val scopedBranch = if (activeFilter != null) branches.firstOrNull { it.id == activeFilter } else null

        val filteredProducts = products
            .filter { activeFilter == null || it.branchId == activeFilter || it.branchId.isBlank() }
            .filter { sinceUpdatedAt <= 0L || it.updatedAt >= sinceUpdatedAt }
        val filteredSales = sales
            .filter { activeFilter == null || it.branchId == activeFilter }
            .filter { sinceUpdatedAt <= 0L || it.updatedAt >= sinceUpdatedAt }
        val filteredSaleIds = filteredSales.map { it.id }.toSet()
        val filteredSaleItems = if (activeFilter == null && sinceUpdatedAt <= 0L) {
            saleItems
        } else {
            saleItems.filter { filteredSaleIds.contains(it.saleId) }
        }
        val filteredPayments = payments
            .filter { activeFilter == null || it.branchId == activeFilter }
            .filter { sinceUpdatedAt <= 0L || it.paymentDate >= sinceUpdatedAt }
        val filteredPurchases = purchases
            .filter { activeFilter == null || it.branchId == activeFilter }
            .filter { sinceUpdatedAt <= 0L || it.createdAt >= sinceUpdatedAt }
        val filteredTransfers = stockTransfers
            .filter { activeFilter == null || it.fromBranchId == activeFilter || it.toBranchId == activeFilter }
            .filter { sinceUpdatedAt <= 0L || it.createdAt >= sinceUpdatedAt }
        val filteredBranches = branches
            .filter { activeFilter == null || it.id == activeFilter }
            .filter { sinceUpdatedAt <= 0L || it.updatedAt >= sinceUpdatedAt }
        val filteredCustomers = customers.filter { sinceUpdatedAt <= 0L || it.updatedAt >= sinceUpdatedAt }
        val filteredUsers = users.filter { sinceUpdatedAt <= 0L || it.updatedAt >= sinceUpdatedAt }
        val filteredTombstones = tombstones.filter { sinceUpdatedAt <= 0L || it.deletedAt >= sinceUpdatedAt }

        val root = JSONObject()
        val nowMs = ClockGuard.effectiveNowMs()
        val packetNonce = SubscriptionSecurityManager.generateSecureTokenNonce(12)

        // 1. Metadata
        val meta = JSONObject().apply {
            put("app", "BeBoss")
            put("version", "3.0")
            put("schemaVersion", CURRENT_SCHEMA_VERSION)
            put("format", "beboss_branch_datashare_v3")
            put("timestamp", nowMs)
            put("issuedAt", nowMs)
            put("expiresAt", nowMs + DEFAULT_TOKEN_TTL_MS)
            put("nonce", packetNonce)
            put("sinceUpdatedAt", sinceUpdatedAt)
            put("exportedBy", exportedByUser?.name ?: "Owner")
            put("exportedByRole", exportedByUser?.role?.name ?: "OWNER")
            if (scopedBranch != null) {
                put("branchScopeId", scopedBranch.id)
                put("branchScopeName", scopedBranch.name)
            }
        }
        root.put("metadata", meta)

        // 2. Shop Profile
        val shopObj = JSONObject().apply {
            put("id", profile.id)
            put("shopName", profile.shopName)
            put("name", profile.name)
            put("phone", profile.phone)
            put("email", profile.email)
            put("address", profile.address)
            put("currencyCode", profile.currencyCode)
            put("currencySymbol", profile.currencySymbol)
            put("taxRate", profile.taxRate)
            put("tinNumber", profile.tinNumber)
            put("receiptFooter", profile.receiptFooter)
            put("receiptHeader", profile.receiptHeader)
            put("dailySalesTarget", profile.dailySalesTarget)
            put("monthlyRevenueTarget", profile.monthlyRevenueTarget)
            put("targetMarginPercent", profile.targetMarginPercent)
            put("cashRegisterFloat", profile.cashRegisterFloat)
            put("showTaxOnReceipt", profile.showTaxOnReceipt)
            put("businessType", profile.businessType)
            put("isOnlineSyncEnabled", profile.isOnlineSyncEnabled)
            put("backendServerUrl", profile.backendServerUrl)
            put("lastSyncedAt", profile.lastSyncedAt)
            put("createdAt", profile.createdAt)
            put("updatedAt", profile.updatedAt)
            put("syncVersion", profile.syncVersion)
            put("hlcTimestamp", profile.hlcTimestamp)
            put("lastModifiedDeviceId", profile.lastModifiedDeviceId)
        }
        root.put("shopProfile", shopObj)

        // 2.5 Branches
        val branchesArr = JSONArray()
        filteredBranches.forEach { b ->
            branchesArr.put(JSONObject().apply {
                put("id", b.id)
                put("name", b.name)
                put("code", b.code)
                put("locationType", b.locationType)
                put("address", b.address)
                put("phone", b.phone)
                put("managerUserId", b.managerUserId)
                put("managerName", b.managerName)
                put("isMainBranch", b.isMainBranch)
                put("isActive", b.isActive)
                put("colorHex", b.colorHex)
                put("dailySalesTargetRwf", b.dailySalesTargetRwf)
                put("monthlyTargetRwf", b.monthlyTargetRwf)
                put("openingCashFloat", b.openingCashFloat)
                put("stockValueRwf", b.stockValueRwf)
                put("productCount", b.productCount)
                put("operationalStatus", b.operationalStatus)
                put("email", b.email)
                put("notes", b.notes)
                put("createdAt", b.createdAt)
                put("updatedAt", b.updatedAt)
                put("syncVersion", b.syncVersion)
                put("hlcTimestamp", b.hlcTimestamp)
                put("lastModifiedDeviceId", b.lastModifiedDeviceId)
            })
        }
        root.put("branches", branchesArr)

        // 3. Collaborators / Users (credentials redacted on wire/exports)
        val usersArr = JSONArray()
        filteredUsers.forEach { u ->
            usersArr.put(JSONObject().apply {
                put("id", u.id)
                put("name", u.name)
                put("username", u.username)
                put("email", u.email)
                put("phone", u.phone)
                put("pinHash", "")
                put("password", "")
                put("role", u.role.name)
                put("assignedBranchId", u.assignedBranchId)
                put("assignedBranchName", u.assignedBranchName)
                put("profileColorHex", u.profileColorHex)
                put("isActive", u.isActive)
                put("canSellPOS", u.canSellPOS)
                put("canApplyDiscounts", u.canApplyDiscounts)
                put("canManageInventory", u.canManageInventory)
                put("canViewCostAndProfit", u.canViewCostAndProfit)
                put("canViewAnalytics", u.canViewAnalytics)
                put("canManageCustomers", u.canManageCustomers)
                put("canCollectDebt", u.canCollectDebt)
                put("canDeleteRecords", u.canDeleteRecords)
                put("canExportReports", u.canExportReports)
                put("canManageCollaborators", u.canManageCollaborators)
                put("canManageShopSettings", u.canManageShopSettings)
                put("canExportImportData", u.canExportImportData)
                put("lastLoginAt", u.lastLoginAt)
                put("createdAt", u.createdAt)
                put("updatedAt", u.updatedAt)
                put("syncVersion", u.syncVersion)
                put("hlcTimestamp", u.hlcTimestamp)
                put("lastModifiedDeviceId", u.lastModifiedDeviceId)
            })
        }
        root.put("users", usersArr)

        // 4. Products
        val productsArr = JSONArray()
        filteredProducts.forEach { p ->
            productsArr.put(JSONObject().apply {
                put("id", p.id)
                put("name", p.name)
                put("category", p.category)
                put("barcode", p.barcode)
                put("costPrice", p.costPrice)
                put("sellingPrice", p.sellingPrice)
                put("quantityInStock", p.quantityInStock)
                put("lowStockThreshold", p.lowStockThreshold)
                put("unit", p.unit)
                put("branchId", p.branchId)
                put("isDeleted", p.isDeleted)
                put("createdAt", p.createdAt)
                put("updatedAt", p.updatedAt)
                put("syncVersion", p.syncVersion)
                put("hlcTimestamp", p.hlcTimestamp)
                put("lastModifiedDeviceId", p.lastModifiedDeviceId)
            })
        }
        root.put("products", productsArr)

        // 5. Customers
        val customersArr = JSONArray()
        filteredCustomers.forEach { c ->
            customersArr.put(JSONObject().apply {
                put("id", c.id)
                put("name", c.name)
                put("phone", c.phone)
                put("email", c.email)
                put("address", c.address)
                put("city", c.city)
                put("taxIdOrNin", c.taxIdOrNin)
                put("category", c.category)
                put("creditLimit", c.creditLimit)
                put("debtBalance", c.debtBalance)
                put("notes", c.notes)
                put("isDeleted", c.isDeleted)
                put("createdAt", c.createdAt)
                put("updatedAt", c.updatedAt)
                put("syncVersion", c.syncVersion)
                put("hlcTimestamp", c.hlcTimestamp)
                put("lastModifiedDeviceId", c.lastModifiedDeviceId)
            })
        }
        root.put("customers", customersArr)

        // 6. Sales
        val salesArr = JSONArray()
        filteredSales.forEach { s ->
            salesArr.put(JSONObject().apply {
                put("id", s.id)
                put("receiptNumber", s.receiptNumber)
                put("customerId", s.customerId)
                put("customerName", s.customerName)
                put("totalAmount", s.totalAmount)
                put("totalCost", s.totalCost)
                put("totalProfit", s.totalProfit)
                put("discountAmount", s.discountAmount)
                put("paymentMethod", s.paymentMethod)
                put("amountPaid", s.amountPaid)
                put("paymentStatus", s.paymentStatus)
                put("notes", s.notes)
                put("branchId", s.branchId)
                put("branchName", s.branchName)
                put("cashierId", s.cashierId)
                put("cashierName", s.cashierName)
                put("saleDate", s.saleDate)
                put("synced", s.synced)
                put("updatedAt", s.updatedAt)
                put("syncVersion", s.syncVersion)
                put("hlcTimestamp", s.hlcTimestamp)
                put("lastModifiedDeviceId", s.lastModifiedDeviceId)
            })
        }
        root.put("sales", salesArr)

        // 7. Sale Items
        val itemsArr = JSONArray()
        filteredSaleItems.forEach { i ->
            itemsArr.put(JSONObject().apply {
                put("id", i.id)
                put("saleId", i.saleId)
                put("productId", i.productId)
                put("productName", i.productName)
                put("category", i.category)
                put("unit", i.unit)
                put("quantitySold", i.quantitySold)
                put("costPriceAtSale", i.costPriceAtSale)
                put("unitPriceAtSale", i.unitPriceAtSale)
                put("subtotal", i.subtotal)
                put("profit", i.profit)
                put("branchId", i.branchId)
            })
        }
        root.put("saleItems", itemsArr)

        // 8. Customer Payments
        val paymentsArr = JSONArray()
        filteredPayments.forEach { py ->
            paymentsArr.put(JSONObject().apply {
                put("id", py.id)
                put("customerId", py.customerId)
                put("customerName", py.customerName)
                put("amount", py.amount)
                put("previousDebt", py.previousDebt)
                put("remainingDebt", py.remainingDebt)
                put("paymentMethod", py.paymentMethod)
                put("notes", py.notes)
                put("receiptNumber", py.receiptNumber)
                put("paymentDate", py.paymentDate)
                put("recordedBy", py.recordedBy)
                put("branchId", py.branchId)
                put("branchName", py.branchName)
            })
        }
        root.put("customerPayments", paymentsArr)

        // 9. Purchases
        val purchasesArr = JSONArray()
        filteredPurchases.forEach { pu ->
            purchasesArr.put(JSONObject().apply {
                put("id", pu.id)
                put("productId", pu.productId)
                put("productName", pu.productName)
                put("category", pu.category)
                put("supplierName", pu.supplierName)
                put("supplierPhone", pu.supplierPhone)
                put("quantityPurchased", pu.quantityPurchased)
                put("unitCostPrice", pu.unitCostPrice)
                put("totalPurchaseCost", pu.totalPurchaseCost)
                put("sellingPriceAtPurchase", pu.sellingPriceAtPurchase)
                put("paymentStatus", pu.paymentStatus)
                put("invoiceNumber", pu.invoiceNumber)
                put("branchId", pu.branchId)
                put("branchName", pu.branchName)
                put("purchasedByUserId", pu.purchasedByUserId)
                put("purchasedByName", pu.purchasedByName)
                put("notes", pu.notes)
                put("purchaseDate", pu.purchaseDate)
                put("isSynced", pu.isSynced)
                put("createdAt", pu.createdAt)
            })
        }
        root.put("purchases", purchasesArr)

        // 10. Stock Transfers
        val transfersArr = JSONArray()
        filteredTransfers.forEach { tr ->
            transfersArr.put(JSONObject().apply {
                put("id", tr.id)
                put("transferNumber", tr.transferNumber)
                put("productId", tr.productId)
                put("productName", tr.productName)
                put("fromBranchId", tr.fromBranchId)
                put("fromBranchName", tr.fromBranchName)
                put("toBranchId", tr.toBranchId)
                put("toBranchName", tr.toBranchName)
                put("quantity", tr.quantity)
                put("unit", tr.unit)
                put("costValueRwf", tr.costValueRwf)
                put("transferDate", tr.transferDate)
                put("status", tr.status)
                put("notes", tr.notes)
                put("transferredBy", tr.transferredBy)
                put("receivedBy", tr.receivedBy)
                put("receivedAt", tr.receivedAt)
                put("synced", tr.synced)
                put("createdAt", tr.createdAt)
                put("updatedAt", tr.updatedAt)
                put("hlcTimestamp", tr.hlcTimestamp)
                put("lastModifiedDeviceId", tr.lastModifiedDeviceId)
                put("approvalReason", tr.approvalReason)
                put("approvalActorUserId", tr.approvalActorUserId)
                put("approvalSignedAt", tr.approvalSignedAt)
                put("approvalPolicyVersion", tr.approvalPolicyVersion)
                put("approvalDeviceId", tr.approvalDeviceId)
                put("approvalSignature", tr.approvalSignature)
            })
        }
        root.put("stockTransfers", transfersArr)

        // 11. Durable Deletion Tombstones
        val tombstonesArr = JSONArray()
        filteredTombstones.forEach { t ->
            tombstonesArr.put(JSONObject().apply {
                put("id", t.id.ifBlank { SyncTombstone.keyFor(t.tableName, t.recordId) })
                put("tableName", t.tableName)
                put("recordId", t.recordId)
                put("deletedAt", t.deletedAt)
                put("hlcTimestamp", t.hlcTimestamp)
                put("deletedByDeviceId", t.deletedByDeviceId)
            })
        }
        root.put("tombstones", tombstonesArr)

        return root
    }

    /**
     * Generates chunked BBSHARE1 tokens capped at `maxRecordsPerChunk` per packet
     * to avoid HTTP/Supabase payload size bottlenecks for large catalogs or sales logs.
     */
    fun exportChunkedTokens(
        profile: ShopProfile,
        users: List<User>,
        products: List<Product>,
        customers: List<Customer>,
        sales: List<Sale>,
        saleItems: List<SaleItem>,
        payments: List<CustomerPayment>,
        exportedByUser: User?,
        branches: List<Branch> = emptyList(),
        stockTransfers: List<StockTransfer> = emptyList(),
        purchases: List<PurchaseRecord> = emptyList(),
        sinceUpdatedAt: Long = 0L,
        maxRecordsPerChunk: Int = 250,
        tombstones: List<SyncTombstone> = emptyList(),
        shopSecret: String
    ): List<String> {
        require(maxRecordsPerChunk in 1..1_000) {
            "Snapshot chunk size must be between 1 and 1,000 records."
        }
        val total = branches.size + users.size + products.size + customers.size +
            sales.size + saleItems.size + payments.size + stockTransfers.size + purchases.size + tombstones.size
        if (total <= maxRecordsPerChunk) {
            return listOf(
                createShopScopedShareToken(
                    createExportJson(
                        profile = profile,
                        users = users,
                        products = products,
                        customers = customers,
                        sales = sales,
                        saleItems = saleItems,
                        payments = payments,
                        exportedByUser = exportedByUser,
                        branches = branches,
                        stockTransfers = stockTransfers,
                        purchases = purchases,
                        sinceUpdatedAt = sinceUpdatedAt,
                        tombstones = tombstones
                    ),
                    shopSecret
                )
            )
        }

        val tokens = mutableListOf<String>()
        // Every record family is chunked independently. A previous implementation
        // split products/customers/sales but placed all purchases, transfers, payments,
        // users and tombstones in chunk zero, silently truncating or oversizing large shops.
        val productChunks = products.chunked(maxRecordsPerChunk).ifEmpty { listOf(emptyList()) }
        val customerChunks = customers.chunked(maxRecordsPerChunk).ifEmpty { listOf(emptyList()) }
        val saleChunks = sales.chunked(maxRecordsPerChunk).ifEmpty { listOf(emptyList()) }
        val userChunks = users.chunked(maxRecordsPerChunk).ifEmpty { listOf(emptyList()) }
        val paymentChunks = payments.chunked(maxRecordsPerChunk).ifEmpty { listOf(emptyList()) }
        val purchaseChunks = purchases.chunked(maxRecordsPerChunk).ifEmpty { listOf(emptyList()) }
        val transferChunks = stockTransfers.chunked(maxRecordsPerChunk).ifEmpty { listOf(emptyList()) }
        val branchChunks = branches.chunked(maxRecordsPerChunk).ifEmpty { listOf(emptyList()) }
        val tombstoneChunks = tombstones.chunked(maxRecordsPerChunk).ifEmpty { listOf(emptyList()) }
        val maxChunks = maxOf(
            productChunks.size,
            customerChunks.size,
            saleChunks.size,
            userChunks.size,
            paymentChunks.size,
            purchaseChunks.size,
            transferChunks.size,
            branchChunks.size,
            tombstoneChunks.size
        )

        // Index each sale's destination chunk once, then walk the sale-line table
        // once. The previous implementation scanned every sale line for every
        // sales chunk (O(salesChunks * saleItems)), which became extremely costly
        // for long-running shops with large histories. This keeps the source order
        // of sale lines while reducing the grouping work to O(sales + saleItems).
        val saleChunkIndexById = HashMap<String, Int>(sales.size)
        saleChunks.forEachIndexed { chunkIndex, chunk ->
            chunk.forEach { sale -> saleChunkIndexById[sale.id] = chunkIndex }
        }
        val saleItemsByChunk = MutableList(maxChunks) { mutableListOf<SaleItem>() }
        saleItems.forEach { item ->
            val chunkIndex = saleChunkIndexById[item.saleId]
            if (chunkIndex != null) saleItemsByChunk[chunkIndex].add(item)
        }

        for (idx in 0 until maxChunks) {
            val salesForChunk = saleChunks.getOrElse(idx) { emptyList() }
            val saleIds = salesForChunk.map { it.id }.toSet()
            // A single high-volume sale can contain hundreds or thousands of sale
            // lines. Keep each sale's parent row in the first packet, then split its
            // related saleItems into bounded follow-up packets. This preserves the
            // parent-before-child order while preventing an oversized first chunk.
            val saleItemPackets = saleItemsByChunk[idx]
                .chunked(maxRecordsPerChunk)
                .ifEmpty { listOf(emptyList()) }

            saleItemPackets.forEachIndexed { itemPacketIndex, itemPacket ->
                val isPrimaryPacket = itemPacketIndex == 0
                val json = createExportJson(
                    profile = profile,
                    users = if (isPrimaryPacket) userChunks.getOrElse(idx) { emptyList() } else emptyList(),
                    products = if (isPrimaryPacket) productChunks.getOrElse(idx) { emptyList() } else emptyList(),
                    customers = if (isPrimaryPacket) customerChunks.getOrElse(idx) { emptyList() } else emptyList(),
                    sales = if (isPrimaryPacket) salesForChunk else emptyList(),
                    saleItems = itemPacket,
                    payments = if (isPrimaryPacket) paymentChunks.getOrElse(idx) { emptyList() } else emptyList(),
                    exportedByUser = exportedByUser,
                    branches = if (isPrimaryPacket) branchChunks.getOrElse(idx) { emptyList() } else emptyList(),
                    stockTransfers = if (isPrimaryPacket) transferChunks.getOrElse(idx) { emptyList() } else emptyList(),
                    purchases = if (isPrimaryPacket) purchaseChunks.getOrElse(idx) { emptyList() } else emptyList(),
                    sinceUpdatedAt = sinceUpdatedAt,
                    tombstones = if (isPrimaryPacket) tombstoneChunks.getOrElse(idx) { emptyList() } else emptyList()
                )
                if (!isPrimaryPacket && saleIds.isNotEmpty()) {
                    // The signed continuation packet deliberately omits duplicate sale rows.
                    // Carry the parent ids in its authenticated metadata so the strict parser
                    // can validate each foreign key while the preceding primary packet supplies
                    // the corresponding sale rows to the ordered merge.
                    json.optJSONObject("metadata")?.put(
                        "continuationSaleIds",
                        JSONArray(saleIds.toList())
                    )
                }
                tokens.add(createShopScopedShareToken(json, shopSecret))
            }
        }
        return tokens
    }

    /**
     * Creates a per-shop authenticated share token. The shop key is already provisioned
     * by the owner through Supabase and stored in the platform keystore; the derived
     * BBSHARE2 key is domain separated from LAN encryption and authentication keys.
     */
    fun createShopScopedShareToken(json: JSONObject, shopSecret: String): String {
        val key = shopShareHmacKey(shopSecret)
        val rawBytes = json.toString().toByteArray(StandardCharsets.UTF_8)
        val baos = ByteArrayOutputStream()
        GZIPOutputStream(baos).use { gzip -> gzip.write(rawBytes) }
        val payload = Base64.getEncoder().encodeToString(baos.toByteArray())
        // Full SHA-256 HMAC (256 bits) matches the desktop/server BBSHARE2 protocol.
        val signature = computeHmacHex(key, payload).uppercase(Locale.ROOT)
        return "$SHOP_SHARE_TOKEN_PREFIX$signature:$payload"
    }

    private fun shopShareHmacKey(shopSecret: String): ByteArray {
        val clean = shopSecret.trim().lowercase(Locale.ROOT)
        require(clean.matches(Regex("[a-f0-9]{64}"))) {
            "This shop has not provisioned its secure DataShare credential. Connect the owner phone to BeBoss Cloud and retry."
        }
        return CryptoKeyManager.deriveSubkey(
            clean.toByteArray(StandardCharsets.UTF_8),
            "BeBoss_BBSHARE2_HMAC_v1"
        )
    }

    private fun computeHmacHex(key: ByteArray, data: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return SecurityUtils.bytesToHex(mac.doFinal(data.toByteArray(StandardCharsets.UTF_8)))
    }

    fun decodeShopScopedShareToken(token: String, shopSecret: String): String {
        val trimmed = token.trim()
        require(trimmed.length <= SyncPayloadValidator.MAX_TOKEN_LENGTH) {
            "BeBoss Share Token exceeds safe size limit."
        }
        require(trimmed.startsWith(SHOP_SHARE_TOKEN_PREFIX)) {
            "Invalid shop-scoped BeBoss Share Token prefix."
        }
        val remainder = trimmed.removePrefix(SHOP_SHARE_TOKEN_PREFIX)
        val separator = remainder.indexOf(':')
        require(separator > 0) { "Malformed BBSHARE2 token structure." }
        val providedSignature = remainder.substring(0, separator).uppercase(Locale.ROOT)
        val payload = remainder.substring(separator + 1)
        require(providedSignature.matches(Regex("[A-F0-9]{64}"))) {
            "Malformed BBSHARE2 signature."
        }
        val shopScopedSignature = computeHmacHex(shopShareHmacKey(shopSecret), payload).uppercase(Locale.ROOT)
        require(constantTimeEquals(providedSignature, shopScopedSignature)) {
            "This BBSHARE2 token was not signed by the registered shop key. Older project-wide tokens must be verified by BeBoss Cloud."
        }
        return decompressSharePayload(payload)
    }

    private fun decompressSharePayload(payload: String): String {
        val compressed = Base64.getDecoder().decode(payload)
        GZIPInputStream(ByteArrayInputStream(compressed)).bufferedReader(StandardCharsets.UTF_8).use { reader ->
            val result = StringBuilder()
            val buffer = CharArray(8192)
            var total = 0
            while (true) {
                val read = reader.read(buffer)
                if (read < 0) break
                total += read
                require(total <= SyncPayloadValidator.MAX_RAW_PAYLOAD_BYTES) {
                    "Decompressed share payload exceeds safe 5 MB limit."
                }
                result.append(buffer, 0, read)
            }
            return result.toString()
        }
    }

    /**
     * Exports full or branch-scoped shop data to a `.beboss` JSON file in phone storage.
     */
    fun exportShopPackage(
        context: Context,
        profile: ShopProfile,
        users: List<User>,
        products: List<Product>,
        customers: List<Customer>,
        sales: List<Sale>,
        saleItems: List<SaleItem>,
        payments: List<CustomerPayment>,
        exportedByUser: User?,
        branches: List<Branch> = emptyList(),
        stockTransfers: List<StockTransfer> = emptyList(),
        purchases: List<PurchaseRecord> = emptyList(),
        branchIdFilter: String? = null,
        tombstones: List<SyncTombstone> = emptyList()
    ): File {
        val root = createExportJson(
            profile = profile,
            users = users,
            products = products,
            customers = customers,
            sales = sales,
            saleItems = saleItems,
            payments = payments,
            exportedByUser = exportedByUser,
            branches = branches,
            stockTransfers = stockTransfers,
            purchases = purchases,
            branchIdFilter = branchIdFilter,
            tombstones = tombstones
        )

        val backupDir = File(context.getExternalFilesDir(null), "beboss_backups")
        if (!backupDir.exists()) backupDir.mkdirs()

        val timeStampStr = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val cleanShopName = profile.shopName.replace("\\s+".toRegex(), "_").replace("[^a-zA-Z0-9_]".toRegex(), "")
        val branchSuffix = branchIdFilter?.takeIf { it.isNotBlank() && it != "ALL" }?.let { "_${it.take(8)}" }.orEmpty()
        val fileName = "${cleanShopName}${branchSuffix}_Backup_${timeStampStr}.beboss"
        val targetFile = File(backupDir, fileName)

        FileOutputStream(targetFile).use { fos ->
            fos.write(root.toString(2).toByteArray(Charsets.UTF_8))
        }

        return targetFile
    }

    fun parseShopPackageFile(file: File): ShopImportSummary {
        val raw = FileInputStream(file).bufferedReader(Charsets.UTF_8).use { it.readText() }
        return parseShopPackageString(raw)
    }

    /**
     * Parses either raw JSON or a compressed `BBSHARE1:` token into a validated ShopImportSummary.
     * Validates schema version bounds, expiry timestamps, and optional replay nonce cache.
     */
    fun parseShopPackageString(
        input: String,
        enforceReplayProtection: Boolean = false,
        shopSecret: String? = null
    ): ShopImportSummary {
        val trimmed = input.trim()
        val isLegacyToken = trimmed.startsWith(SHARE_TOKEN_PREFIX)
        val isShopScopedToken = trimmed.startsWith(SHOP_SHARE_TOKEN_PREFIX)
        val isToken = isLegacyToken || isShopScopedToken
        if (isLegacyToken) {
            throw SecurityException(
                "This is a legacy BBSHARE1 token. For security, Android no longer contains the old global signing key. Verify it online with the registered shop owner SMS code, or use a current BBSHARE2 token."
            )
        }
        val jsonString = if (isShopScopedToken) {
            decodeShopScopedShareToken(
                trimmed,
                shopSecret ?: throw SecurityException(
                    "BBSHARE2 tokens require the matching signed-in shop's protected pairing credential."
                )
            )
        } else trimmed

        val root = SyncPayloadValidator.validateAndParseRoot(jsonString)

        val meta = root.optJSONObject("metadata")
        val schemaVersion = meta?.optInt("schemaVersion", 1) ?: 1
        require(schemaVersion in 1..CURRENT_SCHEMA_VERSION) {
            "Unsupported BeBoss sync schema version: $schemaVersion"
        }
        val packetNonce = meta?.optCleanString("nonce", "").orEmpty()
        val expiresAt = meta?.optLong("expiresAt", 0L) ?: 0L
        if (isToken && expiresAt > 0L && ClockGuard.effectiveNowMs() > expiresAt) {
            throw IllegalArgumentException("Branch Share Token has expired. Request a fresh token.")
        }
        if (enforceReplayProtection && isToken && packetNonce.isNotBlank()) {
            synchronized(seenShareNonces) {
                if (seenShareNonces.containsKey(packetNonce)) {
                    throw IllegalArgumentException("Duplicate or replayed Branch Share Token rejected.")
                }
                seenShareNonces[packetNonce] = ClockGuard.effectiveNowMs()
            }
        }
        val exportedAt = meta?.optLong("timestamp") ?: ClockGuard.effectiveNowMs()
        val exportedBy = meta?.optCleanString("exportedBy", "Owner")?.ifBlank { "Owner" } ?: "Owner"
        val branchScopeName = meta?.optCleanString("branchScopeName")?.takeIf { it.isNotBlank() }

        // Shop Profile
        var shopProfile: ShopProfile? = null
        if (root.has("shopProfile")) {
            val sObj = root.getJSONObject("shopProfile")
            shopProfile = ShopProfile(
                id = sObj.optLong("id", 1L),
                shopName = sObj.optCleanString("shopName", "My Shop"),
                name = sObj.optCleanString("name", ""),
                phone = sObj.optCleanString("phone", ""),
                email = sObj.optCleanString("email", ""),
                address = sObj.optCleanString("address", ""),
                currencyCode = sObj.optCleanString("currencyCode", "RWF"),
                currencySymbol = sObj.optCleanString("currencySymbol", "FRw"),
                taxRate = sObj.optDouble("taxRate", 0.0),
                tinNumber = sObj.optCleanString("tinNumber", ""),
                receiptFooter = sObj.optCleanString("receiptFooter", "Thank you for your business!"),
                receiptHeader = sObj.optCleanString("receiptHeader", ""),
                dailySalesTarget = sObj.optDouble("dailySalesTarget", 0.0),
                monthlyRevenueTarget = sObj.optDouble("monthlyRevenueTarget", 0.0),
                targetMarginPercent = sObj.optDouble("targetMarginPercent", 25.0),
                cashRegisterFloat = sObj.optDouble("cashRegisterFloat", 0.0),
                showTaxOnReceipt = sObj.optBoolean("showTaxOnReceipt", true),
                businessType = sObj.optCleanString("businessType", "sector_retail"),
                isOnlineSyncEnabled = sObj.optBoolean("isOnlineSyncEnabled", true),
                backendServerUrl = sObj.optCleanString("backendServerUrl", "https://api.beboss.app/v1"),
                lastSyncedAt = sObj.optLong("lastSyncedAt", 0L),
                createdAt = sObj.optLong("createdAt", System.currentTimeMillis()),
                updatedAt = sObj.optLong("updatedAt", System.currentTimeMillis()),
                syncVersion = sObj.optLong("syncVersion", 1L),
                hlcTimestamp = sObj.optLong("hlcTimestamp", 0L),
                lastModifiedDeviceId = sObj.optCleanString("lastModifiedDeviceId", "")
            )
        }

        // Branches
        val branches = mutableListOf<Branch>()
        if (root.has("branches")) {
            val bArr = root.getJSONArray("branches")
            for (i in 0 until bArr.length()) {
                val b = bArr.getJSONObject(i)
                branches.add(
                    Branch(
                        id = b.optCleanString("id"),
                        name = b.optCleanString("name", "Branch"),
                        code = b.optCleanString("code", "BR-01"),
                        locationType = b.optCleanString("locationType", "STORE").uppercase().takeIf { it == "WAREHOUSE" } ?: "STORE",
                        address = b.optCleanString("address", "Kigali, Rwanda"),
                        phone = b.optCleanString("phone", ""),
                        managerUserId = b.optCleanString("managerUserId", ""),
                        managerName = b.optCleanString("managerName", ""),
                        isMainBranch = b.optBoolean("isMainBranch", false),
                        isActive = b.optBoolean("isActive", true),
                        colorHex = b.optCleanString("colorHex", "#FF6B1A"),
                        dailySalesTargetRwf = b.optLong("dailySalesTargetRwf", 0L),
                        monthlyTargetRwf = b.optLong("monthlyTargetRwf", 0L),
                        openingCashFloat = b.optLong("openingCashFloat", 0L),
                        stockValueRwf = b.optLong("stockValueRwf", 0L),
                        productCount = b.optInt("productCount", 0),
                        operationalStatus = b.optCleanString("operationalStatus", "OPEN"),
                        email = b.optCleanString("email", ""),
                        notes = b.optCleanString("notes", ""),
                        createdAt = b.optLong("createdAt", System.currentTimeMillis()),
                        updatedAt = b.optLong("updatedAt", System.currentTimeMillis()),
                        syncVersion = b.optLong("syncVersion", 1L),
                        hlcTimestamp = b.optLong("hlcTimestamp", 0L),
                        lastModifiedDeviceId = b.optCleanString("lastModifiedDeviceId", "")
                    )
                )
            }
        }

        // Users
        val users = mutableListOf<User>()
        if (root.has("users")) {
            val uArr = root.getJSONArray("users")
            for (i in 0 until uArr.length()) {
                val u = uArr.getJSONObject(i)
                val roleName = u.optCleanString("role", "CASHIER")
                val role = try { UserRole.valueOf(roleName) } catch (_: Exception) { UserRole.CASHIER }
                users.add(
                    User(
                        id = u.optCleanString("id"),
                        name = u.optCleanString("name"),
                        username = u.optCleanString("username"),
                        email = u.optCleanString("email", ""),
                        phone = u.optCleanString("phone", ""),
                        pinHash = "",
                        password = "",
                        role = role,
                        assignedBranchId = u.optCleanString("assignedBranchId", ""),
                        assignedBranchName = u.optCleanString("assignedBranchName", "All Branches"),
                        profileColorHex = u.optCleanString("profileColorHex", "#FF6B1A"),
                        isActive = u.optBoolean("isActive", true),
                        canSellPOS = u.optBoolean("canSellPOS", true),
                        canApplyDiscounts = u.optBoolean("canApplyDiscounts", role != UserRole.CASHIER),
                        canManageInventory = u.optBoolean("canManageInventory", role != UserRole.CASHIER),
                        canViewCostAndProfit = u.optBoolean("canViewCostAndProfit", role != UserRole.CASHIER),
                        canViewAnalytics = u.optBoolean("canViewAnalytics", role != UserRole.CASHIER),
                        canManageCustomers = u.optBoolean("canManageCustomers", true),
                        canCollectDebt = u.optBoolean("canCollectDebt", role != UserRole.CASHIER),
                        canDeleteRecords = u.optBoolean("canDeleteRecords", role == UserRole.OWNER),
                        canExportReports = u.optBoolean("canExportReports", role != UserRole.CASHIER),
                        canManageCollaborators = u.optBoolean("canManageCollaborators", role == UserRole.OWNER),
                        canManageShopSettings = u.optBoolean("canManageShopSettings", role == UserRole.OWNER),
                        canExportImportData = u.optBoolean("canExportImportData", role == UserRole.OWNER),
                        lastLoginAt = u.optLong("lastLoginAt", System.currentTimeMillis()),
                        createdAt = u.optLong("createdAt", System.currentTimeMillis()),
                        updatedAt = u.optLong("updatedAt", System.currentTimeMillis()),
                        syncVersion = u.optLong("syncVersion", 1L),
                        hlcTimestamp = u.optLong("hlcTimestamp", 0L),
                        lastModifiedDeviceId = u.optCleanString("lastModifiedDeviceId", "")
                    )
                )
            }
        }

        // Products
        val products = mutableListOf<Product>()
        if (root.has("products")) {
            val pArr = root.getJSONArray("products")
            for (i in 0 until pArr.length()) {
                val p = pArr.getJSONObject(i)
                products.add(
                    Product(
                        id = p.optCleanString("id"),
                        name = p.optCleanString("name"),
                        category = p.optCleanString("category", "General"),
                        barcode = p.optCleanString("barcode", ""),
                        costPrice = p.optDouble("costPrice", 0.0),
                        sellingPrice = p.optDouble("sellingPrice", 0.0),
                        quantityInStock = p.optDouble("quantityInStock", 0.0),
                        lowStockThreshold = p.optDouble("lowStockThreshold", 5.0),
                        unit = p.optCleanString("unit", "pcs"),
                        branchId = p.optCleanString("branchId", "main_branch"),
                        isDeleted = p.optBoolean("isDeleted", false),
                        createdAt = p.optLong("createdAt", System.currentTimeMillis()),
                        updatedAt = p.optLong("updatedAt", System.currentTimeMillis()),
                        syncVersion = p.optLong("syncVersion", 1L),
                        hlcTimestamp = p.optLong("hlcTimestamp", 0L),
                        lastModifiedDeviceId = p.optCleanString("lastModifiedDeviceId", "")
                    )
                )
            }
        }

        // Customers
        val customers = mutableListOf<Customer>()
        if (root.has("customers")) {
            val cArr = root.getJSONArray("customers")
            for (i in 0 until cArr.length()) {
                val c = cArr.getJSONObject(i)
                customers.add(
                    Customer(
                        id = c.optCleanString("id"),
                        name = c.optCleanString("name"),
                        phone = c.optCleanString("phone", ""),
                        email = c.optCleanString("email", ""),
                        address = c.optCleanString("address", ""),
                        city = c.optCleanString("city", "Kigali"),
                        taxIdOrNin = c.optCleanString("taxIdOrNin", ""),
                        category = c.optCleanString("category", "Regular Customer"),
                        creditLimit = c.optDouble("creditLimit", 500000.0),
                        notes = c.optCleanString("notes", ""),
                        debtBalance = c.optDouble("debtBalance", 0.0),
                        isDeleted = c.optBoolean("isDeleted", false),
                        createdAt = c.optLong("createdAt", System.currentTimeMillis()),
                        updatedAt = c.optLong("updatedAt", System.currentTimeMillis()),
                        syncVersion = c.optLong("syncVersion", 1L),
                        hlcTimestamp = c.optLong("hlcTimestamp", 0L),
                        lastModifiedDeviceId = c.optCleanString("lastModifiedDeviceId", "")
                    )
                )
            }
        }

        // Sales
        val sales = mutableListOf<Sale>()
        if (root.has("sales")) {
            val sArr = root.getJSONArray("sales")
            for (i in 0 until sArr.length()) {
                val s = sArr.getJSONObject(i)
                sales.add(
                    Sale(
                        id = s.optCleanString("id"),
                        receiptNumber = s.optCleanString("receiptNumber"),
                        customerId = s.optCleanString("customerId").ifBlank { null },
                        customerName = s.optCleanString("customerName", "Walk-in Customer"),
                        saleDate = s.optLong("saleDate", s.optLong("timestamp", System.currentTimeMillis())),
                        totalAmount = s.optDouble("totalAmount", 0.0),
                        totalCost = s.optDouble("totalCost", 0.0),
                        totalProfit = s.optDouble("totalProfit", 0.0),
                        discountAmount = s.optDouble("discountAmount", 0.0),
                        paymentMethod = s.optCleanString("paymentMethod", "CASH"),
                        paymentStatus = s.optCleanString("paymentStatus", "PAID"),
                        amountPaid = s.optDouble("amountPaid", 0.0),
                        notes = s.optCleanString("notes", ""),
                        branchId = s.optCleanString("branchId", "main_branch"),
                        branchName = s.optCleanString("branchName", "Main Branch"),
                        cashierId = s.optCleanString("cashierId", ""),
                        cashierName = s.optCleanString("cashierName", "Shop Operator"),
                        synced = s.optBoolean("synced", false),
                        updatedAt = s.optLong("updatedAt", System.currentTimeMillis()),
                        syncVersion = s.optLong("syncVersion", 1L),
                        hlcTimestamp = s.optLong("hlcTimestamp", 0L),
                        lastModifiedDeviceId = s.optCleanString("lastModifiedDeviceId", "")
                    )
                )
            }
        }

        // Sale Items
        val saleItems = mutableListOf<SaleItem>()
        if (root.has("saleItems")) {
            val iArr = root.getJSONArray("saleItems")
            for (i in 0 until iArr.length()) {
                val item = iArr.getJSONObject(i)
                saleItems.add(
                    SaleItem(
                        id = item.optCleanString("id"),
                        saleId = item.optCleanString("saleId"),
                        productId = item.optCleanString("productId"),
                        productName = item.optCleanString("productName"),
                        category = item.optCleanString("category", "General"),
                        unit = item.optCleanString("unit", "pcs"),
                        quantitySold = item.optDouble("quantitySold", item.optDouble("quantity", 1.0)),
                        costPriceAtSale = item.optDouble("costPriceAtSale", item.optDouble("unitCostPrice", 0.0)),
                        unitPriceAtSale = item.optDouble("unitPriceAtSale", item.optDouble("unitSellingPrice", 0.0)),
                        subtotal = item.optDouble("subtotal", item.optDouble("totalPrice", 0.0)),
                        profit = item.optDouble("profit", 0.0),
                        branchId = item.optCleanString("branchId", "main_branch")
                    )
                )
            }
        }

        // Payments
        val payments = mutableListOf<CustomerPayment>()
        if (root.has("customerPayments")) {
            val pyArr = root.getJSONArray("customerPayments")
            for (i in 0 until pyArr.length()) {
                val py = pyArr.getJSONObject(i)
                payments.add(
                    CustomerPayment(
                        id = py.optCleanString("id"),
                        customerId = py.optCleanString("customerId"),
                        customerName = py.optCleanString("customerName", "Customer"),
                        amount = py.optDouble("amount", py.optDouble("amountPaid", 0.0)),
                        previousDebt = py.optDouble("previousDebt", 0.0),
                        remainingDebt = py.optDouble("remainingDebt", 0.0),
                        paymentMethod = py.optCleanString("paymentMethod", "Cash"),
                        notes = py.optCleanString("notes", ""),
                        receiptNumber = py.optCleanString("receiptNumber", "PAY-${System.currentTimeMillis().toString().takeLast(6)}"),
                        paymentDate = py.optLong("paymentDate", py.optLong("timestamp", System.currentTimeMillis())),
                        recordedBy = py.optCleanString("recordedBy", "Shop Owner"),
                        branchId = py.optCleanString("branchId", "main_branch"),
                        branchName = py.optCleanString("branchName", "Main Branch")
                    )
                )
            }
        }

        // Purchases
        val purchases = mutableListOf<PurchaseRecord>()
        if (root.has("purchases")) {
            val puArr = root.getJSONArray("purchases")
            for (i in 0 until puArr.length()) {
                val pu = puArr.getJSONObject(i)
                purchases.add(
                    PurchaseRecord(
                        id = pu.optCleanString("id"),
                        productId = pu.optCleanString("productId"),
                        productName = pu.optCleanString("productName"),
                        category = pu.optCleanString("category", "General"),
                        supplierName = pu.optCleanString("supplierName", "Local Wholesale Supplier"),
                        supplierPhone = pu.optCleanString("supplierPhone", ""),
                        quantityPurchased = pu.optDouble("quantityPurchased", 1.0),
                        unitCostPrice = pu.optDouble("unitCostPrice", 0.0),
                        totalPurchaseCost = pu.optDouble("totalPurchaseCost", 0.0),
                        sellingPriceAtPurchase = pu.optDouble("sellingPriceAtPurchase", 0.0),
                        paymentStatus = pu.optCleanString("paymentStatus", "PAID_CASH"),
                        invoiceNumber = pu.optCleanString("invoiceNumber", ""),
                        branchId = pu.optCleanString("branchId", "main_branch"),
                        branchName = pu.optCleanString("branchName", "Main Store"),
                        purchasedByUserId = pu.optCleanString("purchasedByUserId", ""),
                        purchasedByName = pu.optCleanString("purchasedByName", "Shop Manager"),
                        notes = pu.optCleanString("notes", ""),
                        purchaseDate = pu.optLong("purchaseDate", System.currentTimeMillis()),
                        isSynced = pu.optBoolean("isSynced", false),
                        createdAt = pu.optLong("createdAt", System.currentTimeMillis())
                    )
                )
            }
        }

        // Stock Transfers
        val transfers = mutableListOf<StockTransfer>()
        if (root.has("stockTransfers")) {
            val trArr = root.getJSONArray("stockTransfers")
            for (i in 0 until trArr.length()) {
                val tr = trArr.getJSONObject(i)
                transfers.add(
                    StockTransfer(
                        id = tr.optCleanString("id"),
                        transferNumber = tr.optCleanString("transferNumber"),
                        productId = tr.optCleanString("productId"),
                        productName = tr.optCleanString("productName"),
                        fromBranchId = tr.optCleanString("fromBranchId"),
                        fromBranchName = tr.optCleanString("fromBranchName"),
                        toBranchId = tr.optCleanString("toBranchId"),
                        toBranchName = tr.optCleanString("toBranchName"),
                        quantity = tr.optDouble("quantity", 0.0),
                        unit = tr.optCleanString("unit", "pcs"),
                        costValueRwf = tr.optLong("costValueRwf", 0L),
                        transferDate = tr.optLong("transferDate", System.currentTimeMillis()),
                        status = tr.optCleanString("status", "COMPLETED"),
                        notes = tr.optCleanString("notes", ""),
                        transferredBy = tr.optCleanString("transferredBy", "Store Operator"),
                        receivedBy = tr.optCleanString("receivedBy", ""),
                        receivedAt = tr.optLong("receivedAt", 0L),
                        synced = tr.optBoolean("synced", false),
                        createdAt = tr.optLong("createdAt", System.currentTimeMillis()),
                        updatedAt = tr.optLong("updatedAt", tr.optLong("createdAt", System.currentTimeMillis())),
                        hlcTimestamp = tr.optLong("hlcTimestamp", 0L),
                        lastModifiedDeviceId = tr.optCleanString("lastModifiedDeviceId", ""),
                        approvalReason = tr.optCleanString("approvalReason", ""),
                        approvalActorUserId = tr.optCleanString("approvalActorUserId", ""),
                        approvalSignedAt = tr.optLong("approvalSignedAt", 0L),
                        approvalPolicyVersion = tr.optLong("approvalPolicyVersion", 0L),
                        approvalDeviceId = tr.optCleanString("approvalDeviceId", ""),
                        approvalSignature = tr.optCleanString("approvalSignature", "")
                    )
                )
            }
        }

        // Tombstones
        val tombstones = mutableListOf<SyncTombstone>()
        if (root.has("tombstones")) {
            val tombArr = root.getJSONArray("tombstones")
            for (i in 0 until tombArr.length()) {
                val t = tombArr.getJSONObject(i)
                val tableName = t.optCleanString("tableName")
                val recordId = t.optCleanString("recordId")
                if (tableName.isNotBlank() && recordId.isNotBlank()) {
                    tombstones.add(
                        SyncTombstone(
                            id = t.optCleanString("id").ifBlank { SyncTombstone.keyFor(tableName, recordId) },
                            tableName = tableName,
                            recordId = recordId,
                            deletedAt = t.optLong("deletedAt", ClockGuard.effectiveNowMs()),
                            hlcTimestamp = t.optLong("hlcTimestamp", 0L),
                            deletedByDeviceId = t.optCleanString("deletedByDeviceId", "")
                        )
                    )
                }
            }
        }

        return ShopImportSummary(
            shopName = shopProfile?.shopName ?: "Shop",
            exportedAt = exportedAt,
            exportedBy = exportedBy,
            userCount = users.size,
            productCount = products.size,
            customerCount = customers.size,
            saleCount = sales.size,
            paymentCount = payments.size,
            users = users,
            products = products,
            customers = customers,
            sales = sales,
            saleItems = saleItems,
            payments = payments,
            shopProfile = shopProfile,
            branches = branches,
            stockTransfers = transfers,
            purchases = purchases,
            branchScopeName = branchScopeName,
            schemaVersion = schemaVersion,
            packetNonce = packetNonce,
            tombstones = tombstones
        )
    }

    fun listLocalBackups(context: Context): List<File> {
        val backupDir = File(context.getExternalFilesDir(null), "beboss_backups")
        if (!backupDir.exists()) return emptyList()
        return backupDir.listFiles { file -> file.extension == "beboss" || file.extension == "json" }
            ?.sortedByDescending { it.lastModified() } ?: emptyList()
    }

    fun shareBackupFile(context: Context, file: File, shopName: String) {
        val uri: Uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/octet-stream"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "BeBoss Shop Data Package - $shopName")
            putExtra(Intent.EXTRA_TEXT, "Offline Shop Data Package for $shopName (${file.name}). Open in BeBoss app to restore or sync.")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        context.startActivity(Intent.createChooser(intent, "Share Shop Data Package via..."))
    }

    fun shareShopPackage(context: Context, file: File) {
        shareBackupFile(context, file, "Shop")
    }

    fun exportAndShareAdminWebPortal(context: Context) {
        val outDir = File(context.cacheDir, "admin_web")
        if (!outDir.exists()) outDir.mkdirs()
        val outFile = File(outDir, "BeBoss_Admin_Web_Portal.html")
        context.assets.open("admin_portal.html").use { input ->
            FileOutputStream(outFile).use { output ->
                input.copyTo(output)
            }
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", outFile)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/html"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "BeBoss Admin Verification Web Platform")
            putExtra(Intent.EXTRA_TEXT, "Open BeBoss_Admin_Web_Portal.html in Chrome/Edge to verify MoMo payment claims in Supabase and issue payment-linked BB3 unlock codes.")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Open / Share BeBoss Admin Web Platform"))
    }

    fun buildCollaboratorInviteText(
        shopProfile: ShopProfile,
        worker: User,
        temporaryPlainPin: String? = null
    ): String {
        val perms = mutableListOf<String>()
        if (worker.canSellPOS) perms.add("POS Checkout")
        if (worker.canManageInventory) perms.add("Inventory & Stock")
        if (worker.canManageCustomers) perms.add("Customer Debt & Ledger")
        if (worker.canViewAnalytics) perms.add("Financial Reports")
        if (worker.canApplyDiscounts) perms.add("Custom Discounts")

        val pinLine = if (!temporaryPlainPin.isNullOrBlank()) {
            "• Initial PIN: *$temporaryPlainPin* (change after first sign-in)"
        } else {
            "• Terminal PIN: Request your personal PIN directly from your Store Owner"
        }

        return """
            Hello ${worker.name},
            You have been granted access to *${shopProfile.shopName}* on BeBoss POS!

            *Your Access Profile:*
            • Role: ${worker.role.displayName}
            • Username: ${worker.username}
            $pinLine
            • Assigned Branch: ${worker.assignedBranchName}
            • Assigned Permissions: ${perms.joinToString(", ")}

            Please keep your credentials private. You can now log in directly on the store terminal.
            — ${shopProfile.name.ifBlank { "Store Management" }}
        """.trimIndent()
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        return SecurityUtils.constantTimeEquals(a, b)
    }
}
