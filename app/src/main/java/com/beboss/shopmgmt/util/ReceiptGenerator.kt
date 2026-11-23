package com.beboss.shopmgmt.util

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.util.Base64
import android.util.LruCache
import java.io.ByteArrayOutputStream
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.data.model.ShopProfile
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ReceiptGenerator {

    private val receiptCache = LruCache<String, String>(10)

    fun formatMoney(amount: Double, profile: ShopProfile): String {
        val formatter = NumberFormat.getNumberInstance(Locale.getDefault()).apply {
            maximumFractionDigits = if (amount % 1.0 == 0.0) 0 else 2
            minimumFractionDigits = 0
        }
        return "${formatter.format(amount)} ${profile.currencySymbol}"
    }

    fun formatDate(timestamp: Long): String {
        return SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(timestamp))
    }

    fun computeTaxIncludedAmount(totalAmount: Double, taxRatePercent: Double): Double {
        if (taxRatePercent <= 0.0 || totalAmount <= 0.0) return 0.0
        val tax = totalAmount * (taxRatePercent / (100.0 + taxRatePercent))
        return MoneyUtils.centsToDouble(MoneyUtils.toCents(tax))
    }

    /**
     * Generates a deterministic 10-character tamper-evident verification seal
     * bound to the sale's canonical ID, receipt number, total cents, date, branch, cashier, and shop TIN.
     */
    fun computeOfflineReceiptSeal(sale: Sale, profile: ShopProfile): String {
        val payload = listOf(
            sale.id,
            sale.receiptNumber,
            MoneyUtils.toCents(sale.totalAmount).toString(),
            MoneyUtils.toCents(sale.amountPaid).toString(),
            sale.saleDate.toString(),
            sale.branchId,
            sale.cashierId,
            profile.tinNumber.trim()
        ).joinToString("|")
        val digest = java.security.MessageDigest.getInstance("SHA-256")
            .digest(payload.toByteArray(java.nio.charset.StandardCharsets.UTF_8))
        val hex = digest.take(5).joinToString("") { "%02X".format(it) }
        return "BB-$hex"
    }

    fun verifyOfflineReceiptSeal(sale: Sale, profile: ShopProfile, seal: String): Boolean {
        val expected = computeOfflineReceiptSeal(sale, profile)
        return SecurityUtils.constantTimeEquals(expected, seal.trim().uppercase(Locale.US))
    }

    fun generateTextReceipt(
        sale: Sale,
        items: List<SaleItem>,
        profile: ShopProfile
    ): String {
        val cacheKey = sale.id
        receiptCache.get(cacheKey)?.let { return it }

        val sb = StringBuilder()
        val line = "--------------------------------"
        val doubleLine = "================================"

        sb.append(doubleLine).append("\n")
        sb.append("   ").append(profile.shopName.uppercase(Locale.getDefault())).append("\n")
        if (profile.address.isNotBlank()) {
            sb.append("   ").append(profile.address).append("\n")
        }
        if (profile.phone.isNotBlank()) {
            sb.append("   Tel: ").append(profile.phone).append("\n")
        }
        if (profile.tinNumber.isNotBlank()) {
            sb.append("   TIN: ").append(profile.tinNumber).append("\n")
        }
        sb.append(doubleLine).append("\n")

        sb.append("Receipt #: ").append(sale.receiptNumber).append("\n")
        sb.append("Date     : ").append(formatDate(sale.saleDate)).append("\n")
        sb.append("Customer : ").append(sale.customerName).append("\n")
        sb.append("Payment  : ").append(sale.paymentMethod).append(" (").append(sale.paymentStatus).append(")\n")
        sb.append(line).append("\n")

        sb.append(String.format("%-16s %4s %9s\n", "ITEM", "QTY", "TOTAL"))
        sb.append(line).append("\n")

        for (item in items) {
            val nameTrunc = if (item.productName.length > 15) item.productName.take(13) + ".." else item.productName
            val qtyStr = if (item.quantitySold % 1.0 == 0.0) "${item.quantitySold.toInt()}" else "${item.quantitySold}"
            val subStr = "${item.subtotal.toInt()}"
            sb.append(String.format("%-16s %4s %9s\n", nameTrunc, qtyStr, subStr))
        }

        sb.append(line).append("\n")
        sb.append(String.format("%-18s: %12s\n", "TOTAL", formatMoney(sale.totalAmount, profile)))
        if (profile.showTaxOnReceipt && profile.taxRate > 0.0) {
            val vat = computeTaxIncludedAmount(sale.totalAmount, profile.taxRate)
            sb.append(String.format("%-18s: %12s\n", "Incl. Tax (${profile.taxRate}%)", formatMoney(vat, profile)))
        }
        if (sale.discountAmount > 0) {
            sb.append(String.format("%-18s: %12s\n", "Discount", formatMoney(sale.discountAmount, profile)))
        }
        sb.append(String.format("%-18s: %12s\n", "Paid", formatMoney(sale.amountPaid, profile)))
        val balanceDue = sale.totalAmount - sale.amountPaid
        if (balanceDue > 0) {
            sb.append(String.format("%-18s: %12s\n", "BALANCE DUE", formatMoney(balanceDue, profile)))
        }

        val seal = computeOfflineReceiptSeal(sale, profile)
        sb.append(doubleLine).append("\n")
        sb.append("   ").append(profile.receiptFooter).append("\n")
        sb.append("   Verify Seal: ").append(seal).append("\n")
        sb.append("   Powered by BeBoss\n")
        sb.append(doubleLine)

        val result = sb.toString()
        receiptCache.put(cacheKey, result)
        return result
    }

private fun escapeHtml(value: String): String = value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")

    private fun encodePngDataUri(bitmap: Bitmap): String {
        val output = ByteArrayOutputStream()
        check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
            "Unable to encode receipt image"
        }
        return "data:image/png;base64," +
            Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
    }

    /**
     * Builds a self-contained printable receipt. The BeBoss logo and ZXing-generated
     * verification QR are embedded as data URIs, so the print view works offline.
     * All user/shop/product text is escaped before it enters the HTML document.
     */
    fun generateHtmlReceipt(
        context: Context,
        sale: Sale,
        items: List<SaleItem>,
        profile: ShopProfile
    ): String {
        val seal = computeOfflineReceiptSeal(sale, profile)
        val logoData = BrandedShareCardGenerator.loadBrandLogoBitmap(context, 144)
            ?.let { encodePngDataUri(it) }
        val logoMarkup = if (!logoData.isNullOrBlank()) {
            "<img class=\"brand-logo\" src=\"" + logoData + "\" alt=\"BeBoss logo\">"
        } else {
            "<div class=\"brand-logo-fallback\" role=\"img\" aria-label=\"BeBoss logo\">BB</div>"
        }

        val qrPayload = QrCodeGenerator.buildReceiptQrPayload(sale, profile, seal)
        val qrData = encodePngDataUri(QrCodeGenerator.generateQrBitmap(qrPayload, 320))
        val rows = StringBuilder()
        items.forEach { item ->
            val quantity = if (item.quantitySold % 1.0 == 0.0) {
                item.quantitySold.toInt().toString()
            } else {
                item.quantitySold.toString()
            }
            rows.append("<tr><td>")
                .append(escapeHtml(item.productName))
                .append("</td><td class=\"center\">")
                .append(escapeHtml(quantity + " " + item.unit))
                .append("</td><td class=\"amount\">")
                .append(escapeHtml(formatMoney(item.subtotal, profile)))
                .append("</td></tr>")
        }

        val taxMarkup = if (profile.showTaxOnReceipt && profile.taxRate > 0.0) {
            val tax = computeTaxIncludedAmount(sale.totalAmount, profile.taxRate)
            "<div class=\"total-row\"><span>Incl. Tax (" +
                escapeHtml(profile.taxRate.toString()) + "%)</span><strong>" +
                escapeHtml(formatMoney(tax, profile)) + "</strong></div>"
        } else ""
        val discountMarkup = if (sale.discountAmount > 0.0) {
            "<div class=\"total-row\"><span>Discount</span><strong>-" +
                escapeHtml(formatMoney(sale.discountAmount, profile)) + "</strong></div>"
        } else ""
        val balance = (sale.totalAmount - sale.amountPaid).coerceAtLeast(0.0)
        val balanceMarkup = if (balance > 0.0) {
            "<div class=\"total-row balance\"><span>Balance Due</span><strong>" +
                escapeHtml(formatMoney(balance, profile)) + "</strong></div>"
        } else {
            "<div class=\"total-row paid\"><span>Status</span><strong>PAID IN FULL</strong></div>"
        }

        val shopName = escapeHtml(profile.shopName.ifBlank { "BEBOSS STORE" })
        val address = escapeHtml(profile.address)
        val phone = escapeHtml(profile.phone)
        val email = escapeHtml(profile.email)
        val tin = escapeHtml(profile.tinNumber)
        val receiptNumber = escapeHtml(sale.receiptNumber)
        val customerName = escapeHtml(sale.customerName)
        val cashierName = escapeHtml(sale.cashierName.ifBlank { "Operator" })
        val paymentMethod = escapeHtml(sale.paymentMethod)
        val paymentStatus = escapeHtml(sale.paymentStatus)
        val date = escapeHtml(formatDate(sale.saleDate))
        val total = escapeHtml(formatMoney(sale.totalAmount, profile))
        val paid = escapeHtml(formatMoney(sale.amountPaid, profile))
        val footer = escapeHtml(profile.receiptFooter)

        val html = StringBuilder()
        html.append(
            """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>BeBoss Official Receipt</title>
                <style>
                    @page { size: A4; margin: 12mm; }
                    * { box-sizing: border-box; }
                    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 18px; color: #0f172a; background: #fff; font-size: 13px; }
                    .receipt { max-width: 760px; margin: 0 auto; }
                    .brand-header { display: flex; align-items: center; gap: 16px; padding: 20px; color: #fff; background: #0f172a; border-bottom: 6px solid #f97316; border-radius: 14px 14px 0 0; }
                    .brand-logo, .brand-logo-fallback { width: 72px; height: 72px; flex: 0 0 72px; object-fit: contain; padding: 5px; background: #fff; border-radius: 13px; }
                    .brand-logo-fallback { display: flex; align-items: center; justify-content: center; color: #f97316; font-size: 26px; font-weight: 900; }
                    .brand-copy h1 { margin: 0 0 5px; color: #fff; font-size: 21px; letter-spacing: .3px; }
                    .brand-copy p { margin: 3px 0; color: #cbd5e1; font-size: 11px; }
                    .receipt-title { margin: 18px 0 8px; color: #f97316; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; }
                    .meta { width: 100%; margin: 0 0 18px; border-collapse: collapse; }
                    .meta td { width: 50%; padding: 7px 9px; background: #f8fafc; border: 1px solid #e2e8f0; }
                    table.items { width: 100%; border-collapse: collapse; margin: 12px 0 16px; }
                    .items th { padding: 10px 8px; color: #fff; background: #1e293b; text-align: left; }
                    .items td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                    .items .center { text-align: center; white-space: nowrap; }
                    .items .amount { text-align: right; white-space: nowrap; font-weight: 700; }
                    .totals { margin-left: auto; width: min(100%, 390px); padding: 13px 15px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; }
                    .total-row { display: flex; justify-content: space-between; gap: 16px; padding: 5px 0; }
                    .total-row.grand { margin-top: 7px; padding-top: 11px; border-top: 2px solid #f97316; color: #c2410c; font-size: 18px; font-weight: 900; }
                    .total-row.balance { color: #dc2626; }
                    .total-row.paid { color: #15803d; }
                    .verification { display: flex; align-items: center; gap: 16px; margin-top: 20px; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; page-break-inside: avoid; }
                    .verification img { width: 116px; height: 116px; image-rendering: pixelated; }
                    .verification strong { display: block; margin-bottom: 5px; color: #0f172a; }
                    .seal { color: #f97316; font-family: monospace; font-size: 13px; font-weight: 800; }
                    .footer { margin-top: 20px; padding-top: 13px; border-top: 1px dashed #cbd5e1; color: #64748b; text-align: center; font-size: 11px; }
                    @media print { body { padding: 0; } .receipt { max-width: none; } .brand-header, .items th, .totals, .verification { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
                </style>
            </head>
            <body>
                <main class="receipt">
                    <header class="brand-header">
            """.trimIndent()
        )
        html.append(logoMarkup)
        html.append("<div class=\"brand-copy\"><h1>").append(shopName).append("</h1>")
        if (address.isNotBlank()) html.append("<p>").append(address).append("</p>")
        val contactLine = listOf(phone, email).filter { it.isNotBlank() }.joinToString(" • ")
        if (contactLine.isNotBlank()) html.append("<p>").append(contactLine).append("</p>")
        if (tin.isNotBlank()) html.append("<p><strong>TIN:</strong> ").append(tin).append("</p>")
        html.append("</div></header>")
        html.append(
            """
                    <div class="receipt-title">Official sales receipt</div>
                    <table class="meta">
                        <tr><td><strong>Receipt #:</strong> 
            """.trimIndent()
        )
        html.append(receiptNumber).append("</td><td><strong>Date:</strong> ").append(date)
        html.append("</td></tr><tr><td><strong>Customer:</strong> ").append(customerName)
        html.append("</td><td><strong>Cashier:</strong> ").append(cashierName)
        html.append("</td></tr><tr><td><strong>Payment:</strong> ").append(paymentMethod)
        html.append("</td><td><strong>Status:</strong> ").append(paymentStatus)
        html.append(
            """
                        </td></tr>
                    </table>
                    <table class="items">
                        <thead><tr><th>Item</th><th class="center">Qty</th><th class="amount">Amount</th></tr></thead>
                        <tbody>
            """.trimIndent()
        )
        html.append(rows)
        html.append(
            """
                        </tbody>
                    </table>
                    <section class="totals">
                        <div class="total-row grand"><span>TOTAL</span><strong>
            """.trimIndent()
        )
        html.append(total).append("</strong></div>")
        html.append(taxMarkup).append(discountMarkup)
        html.append("<div class=\"total-row\"><span>Paid (").append(paymentMethod)
            .append(")</span><strong>").append(paid).append("</strong></div>")
        html.append(balanceMarkup)
        html.append(
            """
                    </section>
                    <section class="verification">
                        <img src="
            """.trimIndent()
        )
        html.append(qrData).append("\" alt=\"Receipt verification QR\">")
        html.append("<div><strong>Scan to verify this BeBoss receipt</strong><div class=\"seal\">")
            .append(escapeHtml(seal))
            .append("</div><p>Keep this receipt and its verification seal for your records.</p></div></section>")
        html.append("<footer class=\"footer\"><p>").append(footer)
            .append("</p><p>Created with BeBoss POS • Offline receipt verification enabled</p></footer>")
        html.append("</main></body></html>")
        return html.toString()
    }

        fun generateSubscriptionInvoice(
        profile: ShopProfile,
        breakdown: SubscriptionPriceBreakdown,
        txRef: String,
        provider: String,
        payerPhone: String,
        planDays: Int
    ): String {
        val expiryDateStr = SimpleDateFormat("dd MMM yyyy", Locale.US).format(Date(profile.subscriptionExpiresAt))
        val paidDateStr = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.US).format(Date())

        return """
            ================================
               BEBOSS POS — OFFICIAL RECEIPT
                  SUBSCRIPTION INVOICE
            ================================
            Shop Name   : ${profile.shopName}
            Owner Name  : ${profile.name}
            Phone       : $payerPhone
            Invoice Ref : $txRef
            Payment Via : $provider
            Date & Time : $paidDateStr
            --------------------------------
            SUBSCRIPTION ITEMIZATION:
            --------------------------------
            1. Branch Base Tier:
               • Active Branches : ${breakdown.branchCount}
               • Plan Category   : ${breakdown.branchTierName}
               • Branch Base Fee : ${breakdown.branchBasePrice} FRw/mo

            2. Staff Administration:
               • Registered Staff: ${breakdown.workerCount} Workers
               • Staff Tier      : ${breakdown.workerTierName}
               • Staff Addon     : ${breakdown.workerFee} FRw/mo

            --------------------------------
            Monthly Subtotal    : ${breakdown.monthlySubtotal} FRw
            Billing Cycle       : ${breakdown.durationMonths} Month(s)
            Duration Plan       : $planDays Days Access
            ${if (breakdown.discountPercent > 0) "Discount Applied    : -${breakdown.discountAmount} FRw (${breakdown.discountPercent}% OFF)\n" else ""}--------------------------------
            TOTAL AMOUNT PAID   : ${breakdown.totalPayable} FRw
            STATUS              : PAID & ACTIVE
            ACCESS VALID UNTIL  : $expiryDateStr
            ================================
            Cloud Auto-Sync     : ENABLED
            Thank you for building your business with BeBoss!
            Support: +250 788 765 432
            ================================
        """.trimIndent()
    }

    fun shareReceipt(context: Context, text: String) {
        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, text)
            type = "text/plain"
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val shareIntent = Intent.createChooser(sendIntent, "Share Receipt via").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(shareIntent)
    }
}
