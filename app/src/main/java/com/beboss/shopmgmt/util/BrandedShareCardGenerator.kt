package com.beboss.shopmgmt.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import com.beboss.shopmgmt.R
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.ProfitLossSummary
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.TopProductReport
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Generates modern, high-DPI branded PNG cards containing the official BeBoss logo,
 * shop details, structured financial rows, and scannable QR verification seals
 * so every WhatsApp / messaging share carries an unmistakable, well-arranged visual brand card.
 */
object BrandedShareCardGenerator {

    private val ORANGE = Color.parseColor("#F97316")
    private val NAVY = Color.parseColor("#0F172A")
    private val NAVY_SOFT = Color.parseColor("#1E293B")
    private val GREEN = Color.parseColor("#16A34A")
    private val GREEN_BG = Color.parseColor("#DCFCE7")
    private val RED = Color.parseColor("#DC2626")
    private val RED_BG = Color.parseColor("#FEE2E2")
    private val SLATE = Color.parseColor("#475569")
    private val LIGHT_BG = Color.parseColor("#F8FAFC")
    private val BORDER = Color.parseColor("#E2E8F0")

    fun loadBrandLogoBitmap(context: Context, sizePx: Int = 96): Bitmap? {
        return try {
            val raw = BitmapFactory.decodeResource(context.resources, R.drawable.beboss_app_icon)
                ?: return null
            Bitmap.createScaledBitmap(raw, sizePx, sizePx, true)
        } catch (_: Throwable) {
            null
        }
    }

    private fun ensureShareDir(context: Context): File {
        val dir = File(context.cacheDir, "reports")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun savePng(context: Context, bitmap: Bitmap, prefix: String): File {
        val file = File(ensureShareDir(context), "${prefix}_${System.currentTimeMillis()}.png")
        FileOutputStream(file).use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 95, out)
        }
        return file
    }

    private fun drawHeader(
        context: Context,
        canvas: Canvas,
        width: Int,
        shopName: String,
        subtitle: String,
        badgeText: String,
        badgeBg: Int = ORANGE
    ): Float {
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = NAVY }
        canvas.drawRect(0f, 0f, width.toFloat(), 176f, bgPaint)

        // Orange accent bar
        val accentPaint = Paint().apply { color = ORANGE }
        canvas.drawRect(0f, 170f, width.toFloat(), 178f, accentPaint)

        // Rounded logo badge
        val logo = loadBrandLogoBitmap(context, 92)
        if (logo != null) {
            val logoCardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
            canvas.drawRoundRect(RectF(36f, 38f, 136f, 138f), 22f, 22f, logoCardPaint)
            canvas.drawBitmap(logo, 40f, 42f, Paint(Paint.FILTER_BITMAP_FLAG))
        } else {
            val fallbackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ORANGE }
            canvas.drawRoundRect(RectF(36f, 38f, 136f, 138f), 22f, 22f, fallbackPaint)
            val txtPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                textSize = 44f
                typeface = Typeface.DEFAULT_BOLD
            }
            canvas.drawText("B", 72f, 102f, txtPaint)
        }

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 31f
            typeface = Typeface.DEFAULT_BOLD
        }
        val safeShop = shopName.ifBlank { "BEBOSS STORE" }.uppercase(Locale.getDefault()).take(24)
        canvas.drawText(safeShop, 158f, 76f, titlePaint)

        val subPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#CBD5E1")
            textSize = 20f
        }
        canvas.drawText(subtitle.take(44), 158f, 108f, subPaint)

        // Pill badge
        val badgePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = badgeBg }
        val badgeTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
        }
        val bw = badgeTextPaint.measureText(badgeText) + 28f
        canvas.drawRoundRect(RectF(158f, 120f, 158f + bw, 152f), 14f, 14f, badgePaint)
        canvas.drawText(badgeText, 172f, 142f, badgeTextPaint)

        return 198f
    }

    private fun drawFooter(canvas: Canvas, width: Int, height: Int, footerNote: String) {
        val divPaint = Paint().apply {
            color = BORDER
            strokeWidth = 2f
        }
        canvas.drawLine(36f, height - 66f, width - 36f, height - 66f, divPaint)

        val fPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = SLATE
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
        }
        canvas.drawText(footerNote.take(54), 36f, height - 34f, fPaint)

        val brandPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = ORANGE
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            textAlign = Paint.Align.RIGHT
        }
        canvas.drawText("BeBoss POS", width - 36f, height - 34f, brandPaint)
    }

    fun generateReceiptCardPng(
        context: Context,
        sale: Sale,
        items: List<SaleItem>,
        profile: ShopProfile
    ): File {
        val width = 840
        val displayItems = items.take(10)
        val extraCount = (items.size - displayItems.size).coerceAtLeast(0)
        val rowsHeight = (displayItems.size * 42) + (if (extraCount > 0) 32 else 0)
        val height = (620 + rowsHeight).coerceIn(660, 1280)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val seal = ReceiptGenerator.computeOfflineReceiptSeal(sale, profile)
        val isPaidFull = sale.amountPaid >= sale.totalAmount && sale.totalAmount > 0
        val statusBadge = if (isPaidFull) "PAID IN FULL" else if (sale.amountPaid > 0) "PARTIAL PAYMENT" else "CREDIT RECEIPT"
        val badgeColor = if (isPaidFull) GREEN else ORANGE

        var y = drawHeader(
            context = context,
            canvas = canvas,
            width = width,
            shopName = profile.shopName,
            subtitle = listOf(profile.address, profile.phone).filter { it.isNotBlank() }.joinToString(" | ").ifBlank { "Official Digital Receipt" },
            badgeText = statusBadge,
            badgeBg = badgeColor
        )

        // Meta box
        val metaCardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = LIGHT_BG }
        val metaBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = BORDER
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }
        canvas.drawRoundRect(RectF(36f, y, width - 36f, y + 92f), 16f, 16f, metaCardPaint)
        canvas.drawRoundRect(RectF(36f, y, width - 36f, y + 92f), 16f, 16f, metaBorder)

        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = SLATE
            textSize = 19f
        }
        val valPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = NAVY
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
        }
        canvas.drawText("Receipt: #${sale.receiptNumber}", 56f, y + 36f, valPaint)
        canvas.drawText("Date: ${ReceiptGenerator.formatDate(sale.saleDate)}", 56f, y + 68f, labelPaint)

        val rightValPaint = Paint(valPaint).apply { textAlign = Paint.Align.RIGHT }
        val rightLblPaint = Paint(labelPaint).apply { textAlign = Paint.Align.RIGHT }
        canvas.drawText("Customer: ${sale.customerName.take(22)}", width - 56f, y + 36f, rightValPaint)
        canvas.drawText("Method: ${sale.paymentMethod}", width - 56f, y + 68f, rightLblPaint)
        y += 116f

        // Table Header
        val tblHeaderBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = NAVY_SOFT }
        canvas.drawRoundRect(RectF(36f, y, width - 36f, y + 42f), 10f, 10f, tblHeaderBg)
        val thPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
        }
        canvas.drawText("ITEM DESCRIPTION", 54f, y + 28f, thPaint)
        canvas.drawText("QTY", 520f, y + 28f, thPaint)
        val thRight = Paint(thPaint).apply { textAlign = Paint.Align.RIGHT }
        canvas.drawText("SUBTOTAL", width - 54f, y + 28f, thRight)
        y += 56f

        val rowText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = NAVY
            textSize = 20f
        }
        val rowRight = Paint(rowText).apply {
            textAlign = Paint.Align.RIGHT
            typeface = Typeface.DEFAULT_BOLD
        }
        val dashPaint = Paint().apply {
            color = BORDER
            strokeWidth = 1.5f
        }

        displayItems.forEach { item ->
            val qtyStr = if (item.quantitySold % 1.0 == 0.0) "${item.quantitySold.toInt()}" else "${item.quantitySold}"
            canvas.drawText(item.productName.take(30), 54f, y + 20f, rowText)
            canvas.drawText("$qtyStr ${item.unit}", 520f, y + 20f, labelPaint)
            canvas.drawText(ReceiptGenerator.formatMoney(item.subtotal, profile), width - 54f, y + 20f, rowRight)
            canvas.drawLine(46f, y + 34f, width - 46f, y + 34f, dashPaint)
            y += 42f
        }
        if (extraCount > 0) {
            canvas.drawText("+ $extraCount additional item(s)", 54f, y + 18f, labelPaint)
            y += 32f
        }

        y += 14f

        // Total Summary Box + Real ZXing QR Code side-by-side
        val qrSize = 168
        val qrBitmap = QrCodeGenerator.generateQrBitmap(
            QrCodeGenerator.buildReceiptQrPayload(sale, profile, seal),
            sizePx = qrSize
        )

        val summaryRect = RectF(36f, y, width - qrSize - 68f, y + 188f)
        val summaryBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#FFF7ED") }
        val summaryBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = ORANGE
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }
        canvas.drawRoundRect(summaryRect, 16f, 16f, summaryBg)
        canvas.drawRoundRect(summaryRect, 16f, 16f, summaryBorder)

        val bigTotalPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = ORANGE
            textSize = 30f
            typeface = Typeface.DEFAULT_BOLD
        }
        canvas.drawText("TOTAL", 58f, y + 40f, labelPaint)
        canvas.drawText(ReceiptGenerator.formatMoney(sale.totalAmount, profile), 58f, y + 76f, bigTotalPaint)
        canvas.drawText("Paid: ${ReceiptGenerator.formatMoney(sale.amountPaid, profile)}", 58f, y + 114f, valPaint)
        val due = (sale.totalAmount - sale.amountPaid).coerceAtLeast(0.0)
        if (due > 0.0) {
            val duePaint = Paint(valPaint).apply { color = RED }
            canvas.drawText("Balance Due: ${ReceiptGenerator.formatMoney(due, profile)}", 58f, y + 144f, duePaint)
        } else {
            val okPaint = Paint(valPaint).apply { color = GREEN }
            canvas.drawText("Verified Seal: $seal", 58f, y + 144f, okPaint)
        }
        canvas.drawText("Cashier: ${sale.cashierName}", 58f, y + 172f, labelPaint)

        // QR Box on the right
        val qrLeft = width - qrSize - 44f
        val qrBox = RectF(qrLeft - 8f, y, qrLeft + qrSize + 8f, y + 188f)
        canvas.drawRoundRect(qrBox, 16f, 16f, metaCardPaint)
        canvas.drawRoundRect(qrBox, 16f, 16f, metaBorder)
        canvas.drawBitmap(qrBitmap, qrLeft, y + 6f, Paint(Paint.FILTER_BITMAP_FLAG))
        val qrCap = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = NAVY
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText(seal, qrLeft + qrSize / 2f, y + 182f, qrCap)

        drawFooter(canvas, width, height, profile.receiptFooter.ifBlank { "Thank you for your business!" })
        return savePng(context, bitmap, "Receipt_${sale.receiptNumber}")
    }

    fun generateDailySummaryCardPng(
        context: Context,
        profile: ShopProfile,
        summary: ProfitLossSummary,
        lowStockCount: Int
    ): File {
        val width = 840
        val height = 560
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val dateStr = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault()).format(Date())
        var y = drawHeader(
            context = context,
            canvas = canvas,
            width = width,
            shopName = profile.shopName,
            subtitle = "Daily Business Performance • $dateStr",
            badgeText = "DAILY REPORT"
        )

        y += 10f
        drawMetricBox(canvas, 36f, y, 376f, 118f, "TODAY'S REVENUE", ReceiptGenerator.formatMoney(summary.totalRevenue, profile), ORANGE, Color.parseColor("#FFF7ED"))
        drawMetricBox(canvas, 428f, y, 376f, 118f, "NET ESTIMATED PROFIT", ReceiptGenerator.formatMoney(summary.netProfit, profile), GREEN, GREEN_BG)
        y += 136f

        drawMetricBox(canvas, 36f, y, 245f, 102f, "TRANSACTIONS", "${summary.totalSalesCount} sales", NAVY, LIGHT_BG)
        drawMetricBox(canvas, 297f, y, 245f, 102f, "ITEMS SOLD", "${summary.totalItemsSold.toInt()} units", NAVY, LIGHT_BG)
        val stockColor = if (lowStockCount > 0) RED else GREEN
        val stockBg = if (lowStockCount > 0) RED_BG else GREEN_BG
        drawMetricBox(canvas, 558f, y, 246f, 102f, "LOW STOCK", if (lowStockCount > 0) "$lowStockCount alerts" else "Healthy", stockColor, stockBg)

        drawFooter(canvas, width, height, "Avg Basket: ${ReceiptGenerator.formatMoney(summary.averageOrderValue, profile)}")
        return savePng(context, bitmap, "DailySummary")
    }

    fun generateAnalyticsCardPng(
        context: Context,
        periodName: String,
        summary: ProfitLossSummary,
        topProducts: List<TopProductReport>,
        profile: ShopProfile
    ): File {
        val width = 840
        val topList = topProducts.take(5)
        val height = 520 + (topList.size * 38)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        var y = drawHeader(
            context = context,
            canvas = canvas,
            width = width,
            shopName = profile.shopName,
            subtitle = "Financial Analytics • $periodName",
            badgeText = "P&L SUMMARY"
        )

        y += 8f
        drawMetricBox(canvas, 36f, y, 245f, 108f, "REVENUE", ReceiptGenerator.formatMoney(summary.totalRevenue, profile), NAVY, LIGHT_BG)
        drawMetricBox(canvas, 297f, y, 245f, 108f, "NET PROFIT", ReceiptGenerator.formatMoney(summary.netProfit, profile), if (summary.netProfit >= 0) GREEN else RED, if (summary.netProfit >= 0) GREEN_BG else RED_BG)
        drawMetricBox(canvas, 558f, y, 246f, 108f, "MARGIN", "${summary.profitMarginPercent.toInt()}% (${summary.totalSalesCount})", ORANGE, Color.parseColor("#FFF7ED"))
        y += 130f

        val secPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = NAVY
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
        }
        canvas.drawText("Top Performing Products", 36f, y + 18f, secPaint)
        y += 38f

        val rowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = SLATE
            textSize = 19f
        }
        val rightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = NAVY
            textSize = 19f
            typeface = Typeface.DEFAULT_BOLD
            textAlign = Paint.Align.RIGHT
        }

        topList.forEachIndexed { idx, prod ->
            canvas.drawText("${idx + 1}. ${prod.productName.take(32)} (${prod.totalQuantitySold.toInt()} sold)", 42f, y + 20f, rowPaint)
            canvas.drawText(ReceiptGenerator.formatMoney(prod.totalRevenue, profile), width - 42f, y + 20f, rightPaint)
            y += 38f
        }

        drawFooter(canvas, width, height, "COGS: ${ReceiptGenerator.formatMoney(summary.totalCost, profile)} • TIN: ${profile.tinNumber.ifBlank { "N/A" }}")
        return savePng(context, bitmap, "Analytics_$periodName")
    }

    fun generateCustomerDebtCardPng(
        context: Context,
        customer: Customer,
        profile: ShopProfile
    ): File {
        val width = 840
        val height = 470
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val owes = customer.debtBalance > 0
        var y = drawHeader(
            context = context,
            canvas = canvas,
            width = width,
            shopName = profile.shopName,
            subtitle = "Customer Account Notice • ${customer.name}",
            badgeText = if (owes) "BALANCE DUE" else "ACCOUNT CLEAR",
            badgeBg = if (owes) RED else GREEN
        )

        y += 12f
        drawMetricBox(
            canvas = canvas,
            x = 36f,
            y = y,
            w = width - 72f,
            h = 128f,
            title = if (owes) "OUTSTANDING BALANCE DUE" else "CURRENT ACCOUNT BALANCE",
            value = ReceiptGenerator.formatMoney(customer.debtBalance, profile),
            valueColor = if (owes) RED else GREEN,
            bgColor = if (owes) RED_BG else GREEN_BG
        )
        y += 148f

        val infoPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = SLATE
            textSize = 19f
        }
        canvas.drawText("Phone: ${customer.phone.ifBlank { "N/A" }}   •   Shop Phone: ${profile.phone.ifBlank { "N/A" }}", 42f, y + 18f, infoPaint)

        drawFooter(canvas, width, height, "Official Statement from ${profile.shopName}")
        return savePng(context, bitmap, "CustomerNotice_${customer.id.take(6)}")
    }

    fun generateBranchSummaryCardPng(
        context: Context,
        profile: ShopProfile,
        branchCount: Int,
        staffCount: Int,
        totalRevenue: Double,
        productCount: Int
    ): File {
        val width = 840
        val height = 470
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        var y = drawHeader(
            context = context,
            canvas = canvas,
            width = width,
            shopName = profile.shopName,
            subtitle = "Multi-Branch Sync & Operations Summary",
            badgeText = "$branchCount BRANCHES"
        )

        y += 12f
        drawMetricBox(canvas, 36f, y, 245f, 118f, "BRANCHES", "$branchCount Active", NAVY, LIGHT_BG)
        drawMetricBox(canvas, 297f, y, 245f, 118f, "TEAM & STOCK", "$staffCount Staff / $productCount SKUs", ORANGE, Color.parseColor("#FFF7ED"))
        drawMetricBox(canvas, 558f, y, 246f, 118f, "TOTAL REVENUE", ReceiptGenerator.formatMoney(totalRevenue, profile), GREEN, GREEN_BG)

        drawFooter(canvas, width, height, "BeBoss Cloud Multi-Branch Sync Snapshot")
        return savePng(context, bitmap, "BranchSummary")
    }

    private fun drawMetricBox(
        canvas: Canvas,
        x: Float,
        y: Float,
        w: Float,
        h: Float,
        title: String,
        value: String,
        valueColor: Int,
        bgColor: Int
    ) {
        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = bgColor }
        val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = BORDER
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }
        canvas.drawRoundRect(RectF(x, y, x + w, y + h), 16f, 16f, bg)
        canvas.drawRoundRect(RectF(x, y, x + w, y + h), 16f, 16f, border)

        val tPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = SLATE
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
        }
        canvas.drawText(title, x + 20f, y + 34f, tPaint)

        val vPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = valueColor
            textSize = 26f
            typeface = Typeface.DEFAULT_BOLD
        }
        canvas.drawText(value.take(26), x + 20f, y + 78f, vPaint)
    }
}
