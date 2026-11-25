package com.beboss.shopmgmt.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerAgingSummary
import com.beboss.shopmgmt.data.model.InventoryValuation
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.ShopProfile
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ExcelCsvExporter {

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd_HH-mm", Locale.getDefault())
    private val dateDisplayFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())

    /**
     * Exports products inventory into an Excel-ready CSV spreadsheet.
     */
    fun exportProductsCsv(context: Context, products: List<Product>, shopProfile: ShopProfile): File {
        val fileName = "BeBoss_Inventory_${dateFormat.format(Date())}.csv"
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, fileName)

        FileWriter(file).use { writer ->
            // Excel UTF-8 BOM so accents & symbols render cleanly in Microsoft Excel
            writer.write("\uFEFF")
            // Header Row
            writer.append("ID,Product Name,Barcode / SKU,Category,Quantity in Stock,Unit,Cost Price (${shopProfile.currencySymbol}),Selling Price (${shopProfile.currencySymbol}),Gross Profit Margin %,Total Cost Value,Total Retail Value,Low Stock Status\n")

            products.forEach { p ->
                val margin = if (p.sellingPrice > 0) ((p.sellingPrice - p.costPrice) / p.sellingPrice * 100.0) else 0.0
                val costVal = p.quantityInStock * p.costPrice
                val retailVal = p.quantityInStock * p.sellingPrice
                val status = if (p.quantityInStock <= 0) "OUT OF STOCK" else if (p.isLowStock) "LOW STOCK" else "HEALTHY"

                writer.append("\"${escapeCsv(p.id)}\",")
                writer.append("\"${escapeCsv(p.name)}\",")
                writer.append("\"${escapeCsv(p.barcode)}\",")
                writer.append("\"${escapeCsv(p.category)}\",")
                writer.append("${p.quantityInStock},")
                writer.append("\"${escapeCsv(p.unit)}\",")
                writer.append("${p.costPrice},")
                writer.append("${p.sellingPrice},")
                writer.append(String.format(Locale.US, "%.1f%%", margin) + ",")
                writer.append("${costVal.toLong()},")
                writer.append("${retailVal.toLong()},")
                writer.append("\"$status\"\n")
            }
        }
        return file
    }

    /**
     * Exports customer Accounts Receivable (AR) aging buckets to CSV.
     */
    fun exportCustomerAgingCsv(
        context: Context,
        agingSummary: CustomerAgingSummary,
        shopProfile: ShopProfile
    ): File {
        val fileName = "BeBoss_AR_Aging_${dateFormat.format(Date())}.csv"
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, fileName)

        FileWriter(file).use { writer ->
            writer.write("\uFEFF")
            writer.append("Customer Name,Phone,Category,Outstanding Debt (${shopProfile.currencySymbol}),Credit Limit (${shopProfile.currencySymbol}),Days Overdue,Aging Bucket,Over Limit\n")
            agingSummary.entries.forEach { entry ->
                writer.append("\"${escapeCsv(entry.customerName)}\",")
                writer.append("\"${escapeCsv(entry.phone)}\",")
                writer.append("\"${escapeCsv(entry.category)}\",")
                writer.append("${entry.debtBalance.toLong()},")
                writer.append("${entry.creditLimit.toLong()},")
                writer.append("${entry.oldestUnpaidDays},")
                writer.append("\"${escapeCsv(entry.agingBucket)}\",")
                writer.append("\"${if (entry.isOverLimit) "YES" else "NO"}\"\n")
            }
        }
        return file
    }

    /**
     * Exports Master Admin registered organizations & payment claims ledger to CSV.
     */
    fun exportAdminLedgerCsv(
        context: Context,
        shops: List<SupabaseShopAccountDto>,
        payments: List<SupabasePaymentRequestDto>
    ): File {
        val fileName = "BeBoss_Admin_Registry_${dateFormat.format(Date())}.csv"
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, fileName)

        FileWriter(file).use { writer ->
            writer.write("\uFEFF")
            writer.append("Record Type,Organization / Shop,Owner Username,Phone,Branches,Staff,Devices,Amount / Monthly Fee (FRw),Status,Reference / Updated\n")
            shops.forEach { s ->
                writer.append("SHOP_ACCOUNT,")
                writer.append("\"${escapeCsv(s.shopName)}\",")
                writer.append("\"${escapeCsv(s.ownerUsername)}\",")
                writer.append("\"${escapeCsv(s.ownerPhone)}\",")
                writer.append("${s.branchCount},${s.workerCount},${s.deviceCount}/${s.deviceLimit},")
                writer.append("${s.monthlyFeeRwf},")
                writer.append("\"${escapeCsv(s.subscriptionStatus)}\",")
                writer.append("\"${dateDisplayFormat.format(Date(s.updatedAt))}\"\n")
            }
            payments.forEach { p ->
                writer.append("PAYMENT_CLAIM,")
                writer.append("\"${escapeCsv(p.shopName)}\",")
                writer.append("\"${escapeCsv(p.ownerUsername)}\",")
                writer.append("\"${escapeCsv(p.payerPhone)}\",")
                writer.append("${p.branchCount},${p.workerCount},${p.deviceCount},")
                writer.append("${p.amountRwf},")
                writer.append("\"${escapeCsv(p.status)}\",")
                writer.append("\"${escapeCsv(p.provider)} ${escapeCsv(p.generatedUnlockCode)}\"\n")
            }
        }
        return file
    }

    /**
     * Exports customers and their debt balances to CSV spreadsheet.
     */
    fun exportCustomersCsv(context: Context, customers: List<Customer>, shopProfile: ShopProfile): File {
        val fileName = "BeBoss_Customers_Debts_${dateFormat.format(Date())}.csv"
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, fileName)

        FileWriter(file).use { writer ->
            writer.write("\uFEFF")
            writer.append("Customer ID,Full Name,Phone Number,Category,City / Address,Outstanding Debt (${shopProfile.currencySymbol}),Credit Limit (${shopProfile.currencySymbol}),Credit Status,Notes\n")

            customers.forEach { c ->
                val status = when {
                    c.debtBalance > c.creditLimit && c.creditLimit > 0 -> "LIMIT EXCEEDED"
                    c.debtBalance > 0 -> "OWING DEBT"
                    else -> "CLEARED"
                }

                writer.append("\"${escapeCsv(c.id)}\",")
                writer.append("\"${escapeCsv(c.name)}\",")
                writer.append("\"${escapeCsv(c.phone)}\",")
                writer.append("\"${escapeCsv(c.category)}\",")
                writer.append("\"${escapeCsv(c.city.ifBlank { c.address })}\",")
                writer.append("${c.debtBalance.toLong()},")
                writer.append("${c.creditLimit.toLong()},")
                writer.append("\"$status\",")
                writer.append("\"${escapeCsv(c.notes)}\"\n")
            }
        }
        return file
    }

    /**
     * Exports purchases and supplier goods inflow history into an Excel-ready CSV spreadsheet.
     */
    fun exportPurchasesCsv(context: Context, purchases: List<com.beboss.shopmgmt.data.model.PurchaseRecord>, shopProfile: ShopProfile): File {
        val fileName = "BeBoss_Purchases_Inflow_${dateFormat.format(Date())}.csv"
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, fileName)

        FileWriter(file).use { writer ->
            writer.write("\uFEFF")
            writer.append("PO Reference,Date & Time,Product Name,Category,Supplier Name,Supplier Phone,Quantity Bought,Unit Cost (${shopProfile.currencySymbol}),Total Purchase Cost (${shopProfile.currencySymbol}),Selling Price (${shopProfile.currencySymbol}),Estimated Profit (${shopProfile.currencySymbol}),Payment Status,Branch,Purchased By,Notes\n")

            purchases.forEach { p ->
                val profit = (p.sellingPriceAtPurchase - p.unitCostPrice) * p.quantityPurchased
                writer.append("\"${escapeCsv(p.invoiceNumber)}\",")
                writer.append("\"${dateDisplayFormat.format(Date(p.purchaseDate))}\",")
                writer.append("\"${escapeCsv(p.productName)}\",")
                writer.append("\"${escapeCsv(p.category)}\",")
                writer.append("\"${escapeCsv(p.supplierName)}\",")
                writer.append("\"${escapeCsv(p.supplierPhone)}\",")
                writer.append("${p.quantityPurchased},")
                writer.append("${p.unitCostPrice.toLong()},")
                writer.append("${p.totalPurchaseCost.toLong()},")
                writer.append("${p.sellingPriceAtPurchase.toLong()},")
                writer.append("${profit.toLong()},")
                writer.append("\"${escapeCsv(p.paymentStatus)}\",")
                writer.append("\"${escapeCsv(p.branchName)}\",")
                writer.append("\"${escapeCsv(p.purchasedByName)}\",")
                writer.append("\"${escapeCsv(p.notes)}\"\n")
            }
        }
        return file
    }

    /**
     * Exports sales ledger to CSV spreadsheet.
     */
    fun exportSalesCsv(context: Context, sales: List<Sale>, shopProfile: ShopProfile): File {
        val fileName = "BeBoss_Sales_Ledger_${dateFormat.format(Date())}.csv"
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, fileName)

        FileWriter(file).use { writer ->
            writer.write("\uFEFF")
            writer.append("Invoice Ref,Date & Time,Customer Name,Discount,Net Total (${shopProfile.currencySymbol}),Amount Paid (${shopProfile.currencySymbol}),Debt Incurred (${shopProfile.currencySymbol}),Payment Method,Payment Status\n")

            sales.forEach { s ->
                val debtIncurred = (s.totalAmount - s.amountPaid).coerceAtLeast(0.0)
                writer.append("\"${escapeCsv(s.receiptNumber)}\",")
                writer.append("\"${dateDisplayFormat.format(Date(s.saleDate))}\",")
                writer.append("\"${escapeCsv(s.customerName)}\",")
                writer.append("${s.discountAmount.toLong()},")
                writer.append("${s.totalAmount.toLong()},")
                writer.append("${s.amountPaid.toLong()},")
                writer.append("${debtIncurred.toLong()},")
                writer.append("\"${escapeCsv(s.paymentMethod)}\",")
                writer.append("\"${escapeCsv(s.paymentStatus)}\"\n")
            }
        }
        return file
    }

    /**
     * Parses CSV lines to import products in bulk.
     */
    fun parseProductsCsv(csvContent: String): List<Product> {
        val lines = csvContent
            .removePrefix("\uFEFF")
            .lineSequence()
            .map { it.trimEnd('\r') }
            .filter { it.isNotBlank() }
            .toList()
        if (lines.isEmpty()) return emptyList()

        val header = splitCsvLine(lines.first()).map(::normalizeCsvHeader)
        fun headerIndex(vararg aliases: String): Int =
            header.indexOfFirst { candidate -> aliases.any { it == candidate } }

        val nameIndex = headerIndex("productname", "name", "itemname", "item")
        val categoryIndex = headerIndex("category", "productcategory")
        val barcodeIndex = headerIndex("barcodesku", "barcode", "sku", "productcode")
        val quantityIndex = headerIndex("quantityinstock", "quantity", "qty", "stockquantity", "stockqty")
        val unitIndex = headerIndex("unit", "measurementunit")
        val costIndex = headerIndex("costprice", "unitcost", "purchaseprice", "cost")
            .takeIf { it >= 0 }
            ?: header.indexOfFirst {
                it.startsWith("costprice") || it.startsWith("unitcost") || it.startsWith("purchaseprice")
            }
        val sellingIndex = headerIndex("sellingprice", "unitprice", "retailprice", "price")
            .takeIf { it >= 0 }
            ?: header.indexOfFirst {
                it.startsWith("sellingprice") || it.startsWith("unitprice") || it.startsWith("retailprice")
            }

        val hasHeader = nameIndex >= 0 &&
            listOf(categoryIndex, quantityIndex, costIndex, sellingIndex).any { it >= 0 }
        val dataLines = if (hasHeader) lines.drop(1) else lines
        val parsedProducts = mutableListOf<Product>()

        for (line in dataLines) {
            val tokens = splitCsvLine(line)
            if (tokens.isEmpty()) continue

            val name: String
            val barcode: String
            val category: String
            val quantityText: String
            val unit: String
            val costText: String
            val sellingText: String

            if (hasHeader) {
                fun field(index: Int): String = tokens.getOrNull(index)?.trim().orEmpty()
                name = field(nameIndex)
                barcode = field(barcodeIndex)
                category = field(categoryIndex).ifBlank { "General" }
                quantityText = field(quantityIndex)
                unit = field(unitIndex).ifBlank { "pcs" }
                costText = field(costIndex)
                sellingText = field(sellingIndex)
            } else {
                // Headerless supported formats:
                // 8+ columns: exported BeBoss order (id, name, barcode, category, qty, unit, cost, sell).
                // 7 columns: legacy order (name, category, cost, sell, qty, unit, barcode).
                when {
                    tokens.size >= 8 -> {
                        name = tokens.getOrNull(1).orEmpty()
                        barcode = tokens.getOrNull(2).orEmpty()
                        category = tokens.getOrNull(3).orEmpty().ifBlank { "General" }
                        quantityText = tokens.getOrNull(4).orEmpty()
                        unit = tokens.getOrNull(5).orEmpty().ifBlank { "pcs" }
                        costText = tokens.getOrNull(6).orEmpty()
                        sellingText = tokens.getOrNull(7).orEmpty()
                    }
                    tokens.size == 7 -> {
                        name = tokens[0]
                        category = tokens[1].ifBlank { "General" }
                        costText = tokens[2]
                        sellingText = tokens[3]
                        quantityText = tokens[4]
                        unit = tokens[5].ifBlank { "pcs" }
                        barcode = tokens[6]
                    }
                    else -> continue
                }
            }

            val cleanName = name.trim()
            if (cleanName.isBlank() || cleanName.equals("Product Name", ignoreCase = true)) continue

            // Never invent stock quantities or prices. A row without valid explicit
            // financial/stock values is rejected instead of being imported with defaults.
            val quantity = parseCsvNumber(quantityText) ?: continue
            val costPrice = parseCsvNumber(costText) ?: continue
            val sellingPrice = parseCsvNumber(sellingText) ?: continue

            parsedProducts.add(
                Product(
                    name = cleanName,
                    barcode = barcode.trim(),
                    category = category.trim().ifBlank { "General" },
                    quantityInStock = quantity,
                    unit = unit.trim().ifBlank { "pcs" },
                    costPrice = costPrice,
                    sellingPrice = sellingPrice,
                    lowStockThreshold = 5.0
                )
            )
        }
        return parsedProducts
    }

    private fun normalizeCsvHeader(value: String): String =
        value.removePrefix("\uFEFF").trim().lowercase(Locale.ROOT).filter(Char::isLetterOrDigit)

    private fun parseCsvNumber(value: String): Double? =
        value.trim().replace(",", "").toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0.0 }

    fun shareCsvFile(context: Context, file: File, title: String = "Share Spreadsheet CSV") {
        val uri: Uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(shareIntent, title).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    private fun escapeCsv(value: String): String {
        return value.replace("\"", "\"\"")
    }

    private fun splitCsvLine(line: String): List<String> {
        val result = mutableListOf<String>()
        val value = StringBuilder()
        var inQuotes = false
        var index = 0

        while (index < line.length) {
            val character = line[index]
            when {
                character == '"' && inQuotes && index + 1 < line.length && line[index + 1] == '"' -> {
                    value.append('"')
                    index++
                }
                character == '"' -> inQuotes = !inQuotes
                character == ',' && !inQuotes -> {
                    result.add(value.toString().trim())
                    value.setLength(0)
                }
                else -> value.append(character)
            }
            index++
        }

        result.add(value.toString().trim())
        return result
    }
}
