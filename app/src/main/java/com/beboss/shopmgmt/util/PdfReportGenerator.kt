package com.beboss.shopmgmt.util

import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.widget.Toast
import androidx.core.content.FileProvider
import com.beboss.shopmgmt.data.model.AnalyticsPeriod
import com.beboss.shopmgmt.data.model.CategorySalesShare
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerPayment
import com.beboss.shopmgmt.data.model.DailyAnalyticsPoint
import com.beboss.shopmgmt.data.model.InventoryValuation
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.ProfitLossSummary
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.TopProductReport
import com.beboss.shopmgmt.data.model.User
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object PdfReportGenerator {

    private fun getReportsDir(context: Context): File {
        val dir = File(context.cacheDir, "reports")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    private fun getUriForFile(context: Context, file: File): Uri {
        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
    }

    // ------------------------------------------------------------------------
    // 1. OFFICIAL SALES TAX INVOICE & RECEIPT PDF (A4 / Formatted)
    // ------------------------------------------------------------------------
    fun generateInvoiceReceiptPdf(
        context: Context,
        sale: Sale,
        items: List<SaleItem>,
        shopProfile: ShopProfile
    ): File = generateReceiptPdf(context, sale, items, shopProfile)

    fun generateReceiptPdf(
        context: Context,
        sale: Sale,
        items: List<SaleItem>,
        profile: ShopProfile
    ): File {
        val pdfDoc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // Standard A4 (595 x 842 pt)
        val page = pdfDoc.startPage(pageInfo)
        val canvas: Canvas = page.canvas

        val paint = Paint().apply { isAntiAlias = true }
        val primaryOrange = Color.rgb(255, 107, 26)
        val darkInk = Color.rgb(17, 24, 39)
        val grayMedium = Color.rgb(107, 114, 128)
        val lightGray = Color.rgb(243, 244, 246)
        val greenProfit = Color.rgb(16, 185, 129)
        val redLoss = Color.rgb(220, 38, 38)

        // Top Accent Bar
        paint.color = primaryOrange
        canvas.drawRect(0f, 0f, 595f, 10f, paint)

        // Header Background with Brand Logo
        paint.color = Color.rgb(254, 243, 235)
        canvas.drawRoundRect(RectF(30f, 25f, 565f, 115f), 12f, 12f, paint)

        val logoBitmap = BrandedShareCardGenerator.loadBrandLogoBitmap(context, 58)
        val headerTextLeft = if (logoBitmap != null) {
            paint.color = Color.WHITE
            canvas.drawRoundRect(RectF(42f, 39f, 104f, 101f), 12f, 12f, paint)
            canvas.drawBitmap(logoBitmap, 44f, 41f, Paint(Paint.FILTER_BITMAP_FLAG))
            114f
        } else {
            45f
        }

        // Shop Name & Title
        paint.color = primaryOrange
        paint.textSize = 18f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText(profile.shopName.uppercase(Locale.getDefault()), headerTextLeft, 58f, paint)

        paint.color = grayMedium
        paint.textSize = 10f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
        canvas.drawText("${profile.address} • Tel: ${profile.phone} • Email: ${profile.email}".take(54), headerTextLeft, 78f, paint)
        canvas.drawText("Tax PIN / TIN: ${profile.tinNumber.ifBlank { "${profile.currencyCode}-REG" }} • Manager: ${profile.ownerName}", headerTextLeft, 96f, paint)

        // Right Badge
        paint.color = primaryOrange
        paint.textSize = 13.5f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("OFFICIAL RECEIPT", 422f, 56f, paint)
        paint.color = darkInk
        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("#${sale.receiptNumber}", 422f, 76f, paint)
        val dateStr = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault()).format(Date(sale.saleDate))
        canvas.drawText(dateStr, 422f, 94f, paint)

        // Customer Details Box
        paint.color = lightGray
        canvas.drawRoundRect(RectF(30f, 125f, 565f, 175f), 8f, 8f, paint)

        paint.color = grayMedium
        paint.textSize = 10f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("BILLED TO / CUSTOMER:", 45f, 145f, paint)
        paint.color = darkInk
        paint.textSize = 13f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText(sale.customerName, 45f, 163f, paint)

        paint.color = grayMedium
        paint.textSize = 10f
        canvas.drawText("PAYMENT METHOD:", 340f, 145f, paint)
        paint.color = darkInk
        paint.textSize = 13f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("${sale.paymentMethod} (${sale.paymentStatus})", 340f, 163f, paint)

        // Items Table Header
        var currentY = 205f
        paint.color = primaryOrange
        canvas.drawRoundRect(RectF(30f, currentY - 18f, 565f, currentY + 12f), 6f, 6f, paint)

        paint.color = Color.WHITE
        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("ITEM DESCRIPTION", 45f, currentY, paint)
        canvas.drawText("QTY & UNIT", 280f, currentY, paint)
        canvas.drawText("UNIT PRICE", 380f, currentY, paint)
        canvas.drawText("TOTAL AMOUNT", 475f, currentY, paint)

        currentY += 26f

        // Table Rows
        items.forEachIndexed { idx, item ->
            if (idx % 2 == 0) {
                paint.color = Color.rgb(250, 250, 250)
                canvas.drawRect(30f, currentY - 14f, 565f, currentY + 14f, paint)
            }

            paint.color = darkInk
            paint.textSize = 11f
            paint.typeface = Typeface.DEFAULT_BOLD
            val name = if (item.productName.length > 28) item.productName.take(26) + ".." else item.productName
            canvas.drawText(name, 45f, currentY + 2f, paint)

            paint.typeface = Typeface.DEFAULT
            paint.color = grayMedium
            val qtyStr = if (item.quantitySold % 1.0 == 0.0) "${item.quantitySold.toInt()}" else "${item.quantitySold}"
            canvas.drawText("$qtyStr ${item.unit}", 280f, currentY + 2f, paint)

            canvas.drawText(ReceiptGenerator.formatMoney(item.unitPriceAtSale, profile), 380f, currentY + 2f, paint)

            paint.color = darkInk
            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText(ReceiptGenerator.formatMoney(item.subtotal, profile), 475f, currentY + 2f, paint)

            currentY += 24f
        }

        // Totals Box
        currentY = maxOf(currentY + 20f, 480f)
        paint.color = darkInk
        paint.strokeWidth = 1f
        canvas.drawLine(300f, currentY - 10f, 565f, currentY - 10f, paint)

        paint.textSize = 11f
        paint.color = grayMedium
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("Subtotal:", 320f, currentY + 10f, paint)
        paint.color = darkInk
        paint.typeface = Typeface.DEFAULT_BOLD
        val rawSubtotal = sale.totalAmount + sale.discountAmount
        canvas.drawText(ReceiptGenerator.formatMoney(rawSubtotal, profile), 475f, currentY + 10f, paint)

        if (sale.discountAmount > 0) {
            currentY += 20f
            paint.color = greenProfit
            paint.typeface = Typeface.DEFAULT
            canvas.drawText("Discount Applied:", 320f, currentY + 10f, paint)
            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText("-${ReceiptGenerator.formatMoney(sale.discountAmount, profile)}", 475f, currentY + 10f, paint)
        }

        if (profile.taxRate > 0.0 && profile.showTaxOnReceipt) {
            val taxFraction = profile.taxRate / (100.0 + profile.taxRate)
            val vatIncluded = sale.totalAmount * taxFraction
            currentY += 20f
            paint.color = grayMedium
            paint.typeface = Typeface.DEFAULT
            canvas.drawText("VAT Included (${String.format(Locale.US, "%.1f", profile.taxRate)}%):", 320f, currentY + 10f, paint)
            paint.color = darkInk
            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText(ReceiptGenerator.formatMoney(vatIncluded, profile), 475f, currentY + 10f, paint)
        }

        currentY += 26f
        paint.color = primaryOrange
        canvas.drawRoundRect(RectF(300f, currentY - 6f, 565f, currentY + 30f), 8f, 8f, paint)

        paint.color = Color.WHITE
        paint.textSize = 14f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("TOTAL PAID:", 320f, currentY + 18f, paint)
        canvas.drawText(ReceiptGenerator.formatMoney(sale.amountPaid, profile), 450f, currentY + 18f, paint)

        val balanceDue = sale.totalAmount - sale.amountPaid
        if (balanceDue > 0) {
            currentY += 46f
            paint.color = redLoss
            paint.textSize = 12f
            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText("OUTSTANDING BALANCE DUE:", 300f, currentY + 10f, paint)
            canvas.drawText(ReceiptGenerator.formatMoney(balanceDue, profile), 475f, currentY + 10f, paint)
        }

        // Footer, Verification Seal & Scannable QR Code Area
        val footerY = 730f
        paint.color = lightGray
        canvas.drawRoundRect(RectF(30f, footerY - 20f, 565f, footerY + 72f), 10f, 10f, paint)

        val seal = ReceiptGenerator.computeOfflineReceiptSeal(sale, profile)
        val qrBitmap = QrCodeGenerator.generateQrBitmap(
            QrCodeGenerator.buildReceiptQrPayload(sale, profile, seal),
            sizePx = 76
        )
        canvas.drawBitmap(qrBitmap, 476f, footerY - 12f, Paint(Paint.FILTER_BITMAP_FLAG))

        paint.color = darkInk
        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText(profile.receiptFooter, 45f, footerY, paint)

        paint.color = grayMedium
        paint.textSize = 9.5f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("Authentic digital tax receipt generated by BeBoss Shop Management System.", 45f, footerY + 20f, paint)
        canvas.drawText("Offline Seal: $seal  •  Ref: BEBOSS-${sale.receiptNumber}", 45f, footerY + 38f, paint)

        pdfDoc.finishPage(page)

        val file = File(getReportsDir(context), "Invoice_${sale.receiptNumber}.pdf")
        FileOutputStream(file).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()
        return file
    }

    // ------------------------------------------------------------------------
    // 2. COMPREHENSIVE BUSINESS FINANCIAL & PROFIT/LOSS REPORT PDF
    // ------------------------------------------------------------------------
    fun generateSalesReportPdf(
        context: Context,
        periodName: String,
        summary: ProfitLossSummary,
        topProducts: List<TopProductReport>,
        categoryShares: List<CategorySalesShare>,
        shopProfile: ShopProfile
    ): File {
        return generateFinancialReportPdf(
            context = context,
            period = AnalyticsPeriod.THIS_MONTH,
            summary = summary,
            chartPoints = emptyList(),
            topProducts = topProducts,
            categories = categoryShares,
            profile = shopProfile
        )
    }

    fun generateFinancialReportPdf(
        context: Context,
        period: AnalyticsPeriod,
        summary: ProfitLossSummary,
        chartPoints: List<DailyAnalyticsPoint>,
        topProducts: List<TopProductReport>,
        categories: List<CategorySalesShare>,
        profile: ShopProfile
    ): File {
        val pdfDoc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdfDoc.startPage(pageInfo)
        val canvas: Canvas = page.canvas

        val paint = Paint().apply { isAntiAlias = true }
        val primaryOrange = Color.rgb(255, 107, 26)
        val darkInk = Color.rgb(17, 24, 39)
        val grayMedium = Color.rgb(107, 114, 128)
        val greenProfit = Color.rgb(16, 185, 129)
        val redLoss = Color.rgb(220, 38, 38)
        val lightGray = Color.rgb(243, 244, 246)

        // Banner with Brand Logo
        paint.color = primaryOrange
        canvas.drawRect(0f, 0f, 595f, 80f, paint)

        val reportLogo = BrandedShareCardGenerator.loadBrandLogoBitmap(context, 48)
        val bannerTextLeft = if (reportLogo != null) {
            paint.color = Color.WHITE
            canvas.drawRoundRect(RectF(28f, 15f, 80f, 67f), 10f, 10f, paint)
            canvas.drawBitmap(reportLogo, 30f, 17f, Paint(Paint.FILTER_BITMAP_FLAG))
            92f
        } else 30f

        paint.color = Color.WHITE
        paint.textSize = 18.5f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("${profile.shopName.uppercase(Locale.getDefault())} — FINANCIAL REPORT", bannerTextLeft, 40f, paint)

        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT
        val reportDateStr = SimpleDateFormat("dd MMMM yyyy, HH:mm", Locale.getDefault()).format(Date())
        canvas.drawText("Period: ${period.displayName}  |  Generated $reportDateStr", bannerTextLeft, 60f, paint)

        // 3 Headline KPI Cards (Revenue, Cost, Net Profit)
        var kpiY = 100f
        drawKpiCard(canvas, 30f, kpiY, 165f, 75f, "TOTAL REVENUE", ReceiptGenerator.formatMoney(summary.totalRevenue, profile), primaryOrange)
        drawKpiCard(canvas, 215f, kpiY, 165f, 75f, "COST OF GOODS", ReceiptGenerator.formatMoney(summary.totalCost, profile), darkInk)
        drawKpiCard(canvas, 400f, kpiY, 165f, 75f, "NET PROFIT", (if (summary.netProfit >= 0) "+" else "") + ReceiptGenerator.formatMoney(summary.netProfit, profile), if (summary.isProfitable) greenProfit else redLoss)

        // Additional Stats Bar
        kpiY += 90f
        paint.color = lightGray
        canvas.drawRoundRect(RectF(30f, kpiY, 565f, kpiY + 45f), 8f, 8f, paint)

        paint.color = darkInk
        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("Total Orders: ${summary.totalSalesCount}", 45f, kpiY + 28f, paint)
        canvas.drawText("Profit Margin: ${summary.profitMarginPercent.toInt()}%", 200f, kpiY + 28f, paint)
        canvas.drawText("Avg Order: ${ReceiptGenerator.formatMoney(summary.averageOrderValue, profile)}", 360f, kpiY + 28f, paint)

        // Top Selling Items Section
        var sectionY = kpiY + 65f
        paint.color = primaryOrange
        paint.textSize = 13f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("TOP PERFORMING PRODUCTS", 30f, sectionY, paint)

        sectionY += 15f
        paint.color = darkInk
        canvas.drawRoundRect(RectF(30f, sectionY - 14f, 565f, sectionY + 12f), 6f, 6f, paint)

        paint.color = Color.WHITE
        paint.textSize = 10.5f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("PRODUCT NAME", 45f, sectionY + 1f, paint)
        canvas.drawText("QTY SOLD", 280f, sectionY + 1f, paint)
        canvas.drawText("REVENUE", 380f, sectionY + 1f, paint)
        canvas.drawText("NET PROFIT", 480f, sectionY + 1f, paint)

        sectionY += 22f
        if (topProducts.isEmpty()) {
            paint.color = grayMedium
            paint.textSize = 11f
            paint.typeface = Typeface.DEFAULT
            canvas.drawText("No product sales recorded in this period.", 45f, sectionY + 10f, paint)
            sectionY += 25f
        } else {
            topProducts.take(6).forEachIndexed { idx, p ->
                if (idx % 2 == 0) {
                    paint.color = Color.rgb(250, 250, 250)
                    canvas.drawRect(30f, sectionY - 12f, 565f, sectionY + 12f, paint)
                }
                paint.color = darkInk
                paint.textSize = 10.5f
                paint.typeface = Typeface.DEFAULT_BOLD
                val name = if (p.productName.length > 25) p.productName.take(23) + ".." else p.productName
                canvas.drawText("${idx + 1}. $name", 45f, sectionY + 2f, paint)

                paint.color = grayMedium
                paint.typeface = Typeface.DEFAULT
                canvas.drawText("${p.totalQuantitySold.toInt()} units", 280f, sectionY + 2f, paint)

                paint.color = darkInk
                canvas.drawText(ReceiptGenerator.formatMoney(p.totalRevenue, profile), 380f, sectionY + 2f, paint)

                paint.color = greenProfit
                paint.typeface = Typeface.DEFAULT_BOLD
                canvas.drawText("+${ReceiptGenerator.formatMoney(p.totalProfit, profile)}", 480f, sectionY + 2f, paint)

                sectionY += 22f
            }
        }

        // Category Share Table
        sectionY += 15f
        paint.color = primaryOrange
        paint.textSize = 13f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("SALES BY CATEGORY", 30f, sectionY, paint)

        sectionY += 15f
        categories.take(5).forEach { cat ->
            paint.color = darkInk
            paint.textSize = 11f
            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText(cat.category, 45f, sectionY, paint)

            paint.color = grayMedium
            paint.typeface = Typeface.DEFAULT
            canvas.drawText("${ReceiptGenerator.formatMoney(cat.revenue, profile)} (${cat.percentage.toInt()}%)", 450f, sectionY, paint)

            sectionY += 18f
        }

        // Footer
        val footerY = 780f
        paint.color = grayMedium
        paint.textSize = 9.5f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("Generated locally with BeBoss Business Management • ${profile.shopName}", 30f, footerY, paint)

        pdfDoc.finishPage(page)

        val file = File(getReportsDir(context), "Financial_Report_${period.name}_${System.currentTimeMillis()}.pdf")
        FileOutputStream(file).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()
        return file
    }

    private fun drawKpiCard(
        canvas: Canvas,
        x: Float,
        y: Float,
        w: Float,
        h: Float,
        label: String,
        value: String,
        accentColor: Int
    ) {
        val paint = Paint().apply { isAntiAlias = true }
        paint.color = Color.WHITE
        canvas.drawRoundRect(RectF(x, y, x + w, y + h), 10f, 10f, paint)

        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1f
        paint.color = Color.rgb(229, 231, 235)
        canvas.drawRoundRect(RectF(x, y, x + w, y + h), 10f, 10f, paint)

        paint.style = Paint.Style.FILL
        paint.color = Color.rgb(107, 114, 128)
        paint.textSize = 9.5f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText(label, x + 12f, y + 24f, paint)

        paint.color = accentColor
        paint.textSize = 14f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText(value, x + 12f, y + 54f, paint)
    }

    // ------------------------------------------------------------------------
    // 3. CUSTOMER CREDIT & DEBT STATEMENT PDF
    // ------------------------------------------------------------------------
    fun generateCustomerStatementPdf(
        context: Context,
        customer: Customer,
        sales: List<Sale>,
        payments: List<CustomerPayment>,
        profile: ShopProfile
    ): File {
        val pdfDoc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdfDoc.startPage(pageInfo)
        val canvas: Canvas = page.canvas

        val paint = Paint().apply { isAntiAlias = true }
        val primaryOrange = Color.rgb(255, 107, 26)
        val darkInk = Color.rgb(17, 24, 39)
        val grayMedium = Color.rgb(107, 114, 128)
        val redLoss = Color.rgb(220, 38, 38)
        val greenProfit = Color.rgb(16, 185, 129)
        val lightGray = Color.rgb(243, 244, 246)

        // Banner with Brand Logo
        paint.color = primaryOrange
        canvas.drawRect(0f, 0f, 595f, 75f, paint)

        val stmtLogo = BrandedShareCardGenerator.loadBrandLogoBitmap(context, 46)
        val stmtTextLeft = if (stmtLogo != null) {
            paint.color = Color.WHITE
            canvas.drawRoundRect(RectF(28f, 13f, 78f, 63f), 10f, 10f, paint)
            canvas.drawBitmap(stmtLogo, 30f, 15f, Paint(Paint.FILTER_BITMAP_FLAG))
            90f
        } else 30f

        paint.color = Color.WHITE
        paint.textSize = 17f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("${profile.shopName.uppercase(Locale.getDefault())} — CUSTOMER STATEMENT", stmtTextLeft, 38f, paint)

        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT
        val nowStr = SimpleDateFormat("dd MMMM yyyy, HH:mm", Locale.getDefault()).format(Date())
        canvas.drawText("Statement Date: $nowStr", stmtTextLeft, 58f, paint)

        // Customer Info Card
        var currentY = 95f
        paint.color = lightGray
        canvas.drawRoundRect(RectF(30f, currentY, 565f, currentY + 80f), 10f, 10f, paint)

        paint.color = primaryOrange
        paint.textSize = 14f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText(customer.name, 45f, currentY + 28f, paint)

        paint.color = grayMedium
        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("Phone: ${customer.phone}  |  Category: ${customer.category}", 45f, currentY + 48f, paint)
        canvas.drawText("Address: ${customer.address.ifBlank { customer.city }}  |  TIN/NIN: ${customer.taxIdOrNin.ifBlank { "N/A" }}", 45f, currentY + 68f, paint)

        // Outstanding Debt Hero
        paint.color = redLoss
        paint.textSize = 18f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("BALANCE DUE: ${ReceiptGenerator.formatMoney(customer.debtBalance, profile)}", 300f, currentY + 36f, paint)

        // Ledger History Table Header
        currentY += 105f
        paint.color = darkInk
        paint.textSize = 13f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("ACCOUNT ACTIVITY & SETTLEMENT HISTORY", 30f, currentY, paint)

        currentY += 15f
        paint.color = darkInk
        canvas.drawRoundRect(RectF(30f, currentY - 14f, 565f, currentY + 12f), 6f, 6f, paint)

        paint.color = Color.WHITE
        paint.textSize = 10.5f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("DATE & REF", 45f, currentY + 1f, paint)
        canvas.drawText("TYPE / DESCRIPTION", 180f, currentY + 1f, paint)
        canvas.drawText("AMOUNT", 380f, currentY + 1f, paint)
        canvas.drawText("STATUS", 480f, currentY + 1f, paint)

        currentY += 22f

        // Render Sales Invoices for this customer
        sales.take(8).forEachIndexed { idx, s ->
            if (idx % 2 == 0) {
                paint.color = Color.rgb(250, 250, 250)
                canvas.drawRect(30f, currentY - 12f, 565f, currentY + 12f, paint)
            }
            paint.color = darkInk
            paint.textSize = 10.5f
            paint.typeface = Typeface.DEFAULT_BOLD
            val dt = SimpleDateFormat("dd/MM/yy", Locale.getDefault()).format(Date(s.saleDate))
            canvas.drawText("$dt (#${s.receiptNumber})", 45f, currentY + 2f, paint)

            paint.color = grayMedium
            paint.typeface = Typeface.DEFAULT
            canvas.drawText("Sales Invoice", 180f, currentY + 2f, paint)

            paint.color = darkInk
            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText(ReceiptGenerator.formatMoney(s.totalAmount, profile), 380f, currentY + 2f, paint)

            paint.color = if (s.paymentStatus == "PAID") greenProfit else redLoss
            canvas.drawText(s.paymentStatus, 480f, currentY + 2f, paint)

            currentY += 22f
        }

        // Render Payments
        payments.take(5).forEach { p ->
            paint.color = Color.rgb(240, 253, 244)
            canvas.drawRect(30f, currentY - 12f, 565f, currentY + 12f, paint)

            paint.color = greenProfit
            paint.textSize = 10.5f
            paint.typeface = Typeface.DEFAULT_BOLD
            val dt = SimpleDateFormat("dd/MM/yy", Locale.getDefault()).format(Date(p.paymentDate))
            canvas.drawText("$dt (#${p.receiptNumber})", 45f, currentY + 2f, paint)

            paint.typeface = Typeface.DEFAULT
            canvas.drawText("Payment Received (${p.paymentMethod})", 180f, currentY + 2f, paint)

            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText("-${ReceiptGenerator.formatMoney(p.amount, profile)}", 380f, currentY + 2f, paint)

            canvas.drawText("CLEARED", 480f, currentY + 2f, paint)

            currentY += 22f
        }

        val footerY = 780f
        paint.color = grayMedium
        paint.textSize = 9.5f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("BeBoss Customer Ledger • Contact: ${profile.phone}", 30f, footerY, paint)

        pdfDoc.finishPage(page)

        val file = File(getReportsDir(context), "Statement_${customer.name.replace(" ", "_")}_${System.currentTimeMillis()}.pdf")
        FileOutputStream(file).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()
        return file
    }

    // ------------------------------------------------------------------------
    // 4. INVENTORY STOCK VALUATION & LOW STOCK REPORT PDF
    // ------------------------------------------------------------------------
    fun generateInventoryValuationPdf(
        context: Context,
        products: List<Product>,
        valuation: InventoryValuation,
        shopProfile: ShopProfile
    ): File = generateInventoryReportPdf(context, products, valuation, shopProfile)

    fun generateInventoryReportPdf(
        context: Context,
        products: List<Product>,
        valuation: InventoryValuation,
        profile: ShopProfile
    ): File {
        val pdfDoc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdfDoc.startPage(pageInfo)
        val canvas: Canvas = page.canvas

        val paint = Paint().apply { isAntiAlias = true }
        val primaryOrange = Color.rgb(255, 107, 26)
        val darkInk = Color.rgb(17, 24, 39)
        val grayMedium = Color.rgb(107, 114, 128)
        val greenProfit = Color.rgb(16, 185, 129)
        val redLoss = Color.rgb(220, 38, 38)
        val lightGray = Color.rgb(243, 244, 246)

        // Header with Brand Logo
        paint.color = primaryOrange
        canvas.drawRect(0f, 0f, 595f, 75f, paint)

        val invLogo = BrandedShareCardGenerator.loadBrandLogoBitmap(context, 46)
        val invTextLeft = if (invLogo != null) {
            paint.color = Color.WHITE
            canvas.drawRoundRect(RectF(28f, 13f, 78f, 63f), 10f, 10f, paint)
            canvas.drawBitmap(invLogo, 30f, 15f, Paint(Paint.FILTER_BITMAP_FLAG))
            90f
        } else 30f

        paint.color = Color.WHITE
        paint.textSize = 17f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("${profile.shopName.uppercase(Locale.getDefault())} — INVENTORY VALUATION", invTextLeft, 38f, paint)

        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT
        val nowStr = SimpleDateFormat("dd MMMM yyyy, HH:mm", Locale.getDefault()).format(Date())
        canvas.drawText("Audit Generated on $nowStr", invTextLeft, 58f, paint)

        // KPI Valuation Bar
        var currentY = 95f
        drawKpiCard(canvas, 30f, currentY, 165f, 75f, "TOTAL STOCK VALUE (COST)", ReceiptGenerator.formatMoney(valuation.totalCostValue, profile), darkInk)
        drawKpiCard(canvas, 215f, currentY, 165f, 75f, "RETAIL VALUE (SELLING)", ReceiptGenerator.formatMoney(valuation.totalRetailValue, profile), primaryOrange)
        drawKpiCard(canvas, 400f, currentY, 165f, 75f, "POTENTIAL PROFIT", "+${ReceiptGenerator.formatMoney(valuation.potentialProfit, profile)}", greenProfit)

        // Inventory Table Header
        currentY += 95f
        paint.color = darkInk
        canvas.drawRoundRect(RectF(30f, currentY - 14f, 565f, currentY + 12f), 6f, 6f, paint)

        paint.color = Color.WHITE
        paint.textSize = 10.5f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("PRODUCT NAME / SKU", 45f, currentY + 1f, paint)
        canvas.drawText("STOCK QTY", 250f, currentY + 1f, paint)
        canvas.drawText("COST", 350f, currentY + 1f, paint)
        canvas.drawText("RETAIL PRICE", 430f, currentY + 1f, paint)
        canvas.drawText("STATUS", 510f, currentY + 1f, paint)

        currentY += 22f

        products.take(22).forEachIndexed { idx, p ->
            if (idx % 2 == 0) {
                paint.color = Color.rgb(250, 250, 250)
                canvas.drawRect(30f, currentY - 12f, 565f, currentY + 12f, paint)
            }

            paint.color = darkInk
            paint.textSize = 10f
            paint.typeface = Typeface.DEFAULT_BOLD
            val name = if (p.name.length > 24) p.name.take(22) + ".." else p.name
            canvas.drawText(name, 45f, currentY + 2f, paint)

            paint.color = grayMedium
            paint.typeface = Typeface.DEFAULT
            val stockStr = if (p.quantityInStock % 1.0 == 0.0) "${p.quantityInStock.toInt()}" else "${p.quantityInStock}"
            canvas.drawText("$stockStr ${p.unit}", 250f, currentY + 2f, paint)

            canvas.drawText(ReceiptGenerator.formatMoney(p.costPrice, profile), 350f, currentY + 2f, paint)

            paint.color = darkInk
            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText(ReceiptGenerator.formatMoney(p.sellingPrice, profile), 430f, currentY + 2f, paint)

            val isLow = p.quantityInStock <= p.lowStockThreshold
            paint.color = if (p.quantityInStock <= 0) redLoss else if (isLow) primaryOrange else greenProfit
            val status = if (p.quantityInStock <= 0) "OUT" else if (isLow) "LOW" else "OK"
            canvas.drawText(status, 510f, currentY + 2f, paint)

            currentY += 20f
        }

        val footerY = 780f
        paint.color = grayMedium
        paint.textSize = 9.5f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("BeBoss Inventory Stock Control • Total Catalog Items: ${products.size}", 30f, footerY, paint)

        pdfDoc.finishPage(page)

        val file = File(getReportsDir(context), "Inventory_Valuation_${System.currentTimeMillis()}.pdf")
        FileOutputStream(file).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()
        return file
    }

    // ------------------------------------------------------------------------
    // INTENT HELPERS: REAL PDF SHARING & OPENING
    // ------------------------------------------------------------------------
    fun sharePdf(context: Context, file: File, title: String, textMessage: String? = null) {
        try {
            val uri = getUriForFile(context, file)
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                if (textMessage != null) {
                    putExtra(Intent.EXTRA_TEXT, textMessage)
                }
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(sendIntent, title)
            context.startActivity(chooser)
        } catch (e: Exception) {
            Toast.makeText(context, "Error sharing PDF: ${e.safeMessage("Unable to share PDF")}", Toast.LENGTH_LONG).show()
        }
    }

    fun openPdf(context: Context, file: File) {
        try {
            val uri = getUriForFile(context, file)
            val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/pdf")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(viewIntent)
        } catch (e: Exception) {
            Toast.makeText(context, "No PDF viewer found on device. Sharing file instead...", Toast.LENGTH_SHORT).show()
            sharePdf(context, file, "Open Report")
        }
    }

    // ------------------------------------------------------------------------
    // 5. OFFICIAL STAFF ACCESS PASS & CREDENTIAL BADGE PDF (A4 Formatted)
    // ------------------------------------------------------------------------
    fun generateStaffBadgePdf(
        context: Context,
        staff: User,
        profile: ShopProfile
    ): File {
        val pdfDoc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdfDoc.startPage(pageInfo)
        val canvas: Canvas = page.canvas

        val paint = Paint().apply { isAntiAlias = true }
        val primaryOrange = Color.rgb(255, 107, 26)
        val darkInk = Color.rgb(17, 24, 39)
        val grayMedium = Color.rgb(107, 114, 128)
        val lightGray = Color.rgb(243, 244, 246)
        val greenProfit = Color.rgb(16, 185, 129)
        val blueRole = Color.rgb(37, 99, 235)

        // Top Accent Bar
        paint.color = primaryOrange
        canvas.drawRect(0f, 0f, 595f, 10f, paint)

        // Header Background with Logo
        paint.color = Color.rgb(254, 243, 235)
        canvas.drawRoundRect(RectF(30f, 25f, 565f, 110f), 12f, 12f, paint)

        val logoBitmap = BrandedShareCardGenerator.loadBrandLogoBitmap(context, 52)
        val headerLeft = if (logoBitmap != null) {
            paint.color = Color.WHITE
            canvas.drawRoundRect(RectF(42f, 39f, 98f, 95f), 10f, 10f, paint)
            canvas.drawBitmap(logoBitmap, 44f, 41f, Paint(Paint.FILTER_BITMAP_FLAG))
            108f
        } else 45f

        // Shop Name & Title
        paint.color = primaryOrange
        paint.textSize = 18f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText(profile.shopName.uppercase(Locale.getDefault()), headerLeft, 58f, paint)

        paint.color = grayMedium
        paint.textSize = 10.5f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("${profile.address} • Phone: ${profile.phone}", headerLeft, 78f, paint)
        canvas.drawText("Official Staff Security & POS Authorization Credential", headerLeft, 95f, paint)

        // Right Badge
        paint.color = blueRole
        paint.textSize = 13f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("STAFF ACCESS PASS", 410f, 60f, paint)
        paint.color = darkInk
        paint.textSize = 10f
        paint.typeface = Typeface.DEFAULT
        val dateStr = SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(Date())
        canvas.drawText("Issued: $dateStr", 410f, 80f, paint)
        canvas.drawText("Terminal: ACTIVE", 410f, 96f, paint)

        // Card Container
        paint.color = lightGray
        canvas.drawRoundRect(RectF(30f, 125f, 565f, 320f), 12f, 12f, paint)

        // Avatar placeholder
        paint.color = when (staff.role.name) {
            "OWNER" -> primaryOrange
            "MANAGER" -> blueRole
            else -> greenProfit
        }
        canvas.drawRoundRect(RectF(50f, 145f, 150f, 245f), 10f, 10f, paint)
        paint.color = Color.WHITE
        paint.textSize = 36f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText(staff.name.take(1).uppercase(), 86f, 208f, paint)

        // Staff Info
        paint.color = darkInk
        paint.textSize = 18f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText(staff.name, 170f, 170f, paint)

        paint.color = blueRole
        paint.textSize = 12f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("ROLE: ${staff.role.displayName.uppercase()}", 170f, 192f, paint)

        paint.color = grayMedium
        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("Username: @${staff.username}", 170f, 212f, paint)
        canvas.drawText("Contact Phone: ${staff.phone.ifBlank { "N/A" }} • Branch: ${staff.assignedBranchName.ifBlank { "All Branches" }}", 170f, 230f, paint)

        // PIN Security Box (Never expose raw PBKDF2 hash on shareable documents)
        paint.color = Color.rgb(236, 253, 245)
        canvas.drawRoundRect(RectF(170f, 245f, 445f, 295f), 8f, 8f, paint)
        paint.color = Color.rgb(6, 95, 70)
        paint.textSize = 11f
        paint.typeface = Typeface.DEFAULT_BOLD
        val pinStatus = if (staff.pinHash.isNotBlank()) "Configured (PBKDF2 Protected)" else "Not Set"
        canvas.drawText("FAST UNLOCK PIN: $pinStatus", 185f, 275f, paint)

        // Granted Permissions Section
        paint.color = darkInk
        paint.textSize = 13f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("AUTHORIZED SYSTEM PERMISSIONS", 30f, 350f, paint)

        var permY = 380f
        val permissionsList = listOf(
            "POS Checkout & Sales Terminal" to staff.canSellPOS,
            "Apply Custom Discounts" to staff.canApplyDiscounts,
            "Manage Inventory & Stock Quantity" to staff.canManageInventory,
            "View Wholesale Cost & Profit Margins" to staff.canViewCostAndProfit,
            "View Business Analytics & Revenue Reports" to staff.canViewAnalytics,
            "Manage Customers & Ledger Profiles" to staff.canManageCustomers,
            "Record Debt Settlements & Repayments" to staff.canCollectDebt,
            "Delete Transactions & Inventory Records" to staff.canDeleteRecords,
            "Export Official PDF Reports" to staff.canExportReports,
            "Manage Collaborator Staff Accounts" to staff.canManageCollaborators,
            "Manage Store Settings & Profile" to staff.canManageShopSettings,
            "Offline Phone Storage Export / Import Data" to staff.canExportImportData
        )

        permissionsList.forEach { (permName, isAllowed) ->
            paint.color = if (isAllowed) Color.rgb(220, 252, 231) else Color.rgb(243, 244, 246)
            canvas.drawRoundRect(RectF(30f, permY - 14f, 565f, permY + 10f), 6f, 6f, paint)

            paint.color = if (isAllowed) greenProfit else grayMedium
            paint.textSize = 11f
            paint.typeface = Typeface.DEFAULT_BOLD
            val checkmark = if (isAllowed) "[GRANTED]" else "[RESTRICTED]"
            canvas.drawText(checkmark, 45f, permY + 2f, paint)

            paint.color = if (isAllowed) darkInk else grayMedium
            paint.typeface = if (isAllowed) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            canvas.drawText(permName, 170f, permY + 2f, paint)

            permY += 30f
        }

        // Security Notice & Signatures
        paint.color = lightGray
        canvas.drawRoundRect(RectF(30f, permY + 15f, 565f, permY + 85f), 8f, 8f, paint)
        paint.color = grayMedium
        paint.textSize = 9.5f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("This access badge is strictly personal and non-transferable. The owner may modify or revoke", 45f, permY + 38f, paint)
        canvas.drawText("permissions at any time directly in the BeBoss Terminal settings.", 45f, permY + 54f, paint)

        // Signature lines
        paint.color = grayMedium
        canvas.drawLine(50f, 790f, 220f, 790f, paint)
        canvas.drawLine(375f, 790f, 545f, 790f, paint)
        paint.textSize = 9.5f
        canvas.drawText("Shop Owner Signature", 75f, 805f, paint)
        canvas.drawText("Staff Member Signature", 400f, 805f, paint)

        pdfDoc.finishPage(page)

        val fileName = "Staff_Pass_${staff.name.replace("\\s+".toRegex(), "_")}_${System.currentTimeMillis()}.pdf"
        val file = File(getReportsDir(context), fileName)
        pdfDoc.writeTo(FileOutputStream(file))
        pdfDoc.close()

        return file
    }

    // ------------------------------------------------------------------------
    // REAL ASYNC INTENTS: WHATSAPP (WITH BRANDED IMAGE/PDF ATTACHMENT), SMS, CALL
    // ------------------------------------------------------------------------
    fun sendWhatsAppDirect(
        context: Context,
        phone: String,
        message: String,
        attachmentFile: File? = null,
        mimeType: String = "image/png"
    ) {
        if (attachmentFile != null && attachmentFile.exists()) {
            shareFileToWhatsAppOrChooser(
                context = context,
                file = attachmentFile,
                mimeType = mimeType,
                caption = message,
                targetPhone = phone,
                chooserTitle = "Share via WhatsApp"
            )
            return
        }
        try {
            val cleanPhone = phone.replace(Regex("[^0-9+]"), "").removePrefix("+")
            val uri = Uri.parse("https://api.whatsapp.com/send?phone=$cleanPhone&text=${Uri.encode(message)}")
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            MessageAuditManager.recordDispatch(
                context = context,
                channel = "WHATSAPP",
                recipient = cleanPhone.ifBlank { "WhatsApp" },
                messageType = "WHATSAPP_DIRECT",
                preview = message,
                status = "SENT"
            )
            context.startActivity(intent)
        } catch (_: Exception) {
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, message)
                `package` = "com.whatsapp"
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                MessageAuditManager.recordDispatch(
                    context = context,
                    channel = "WHATSAPP",
                    recipient = phone.ifBlank { "WhatsApp" },
                    messageType = "WHATSAPP_DIRECT",
                    preview = message,
                    status = "SENT"
                )
                context.startActivity(sendIntent)
            } catch (_: Exception) {
                Toast.makeText(context, "WhatsApp not installed. Sending via SMS...", Toast.LENGTH_SHORT).show()
                sendSmsDirect(context, phone, message)
            }
        }
    }

    fun shareFileToWhatsAppOrChooser(
        context: Context,
        file: File,
        mimeType: String = "image/png",
        caption: String = "",
        targetPhone: String = "",
        chooserTitle: String = "Share BeBoss Card"
    ) {
        try {
            val uri = getUriForFile(context, file)
            val baseIntent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, uri)
                if (caption.isNotBlank()) {
                    putExtra(Intent.EXTRA_TEXT, caption)
                }
                val cleanPhone = targetPhone.replace(Regex("[^0-9+]"), "").removePrefix("+")
                if (cleanPhone.isNotBlank()) {
                    putExtra("jid", "$cleanPhone@s.whatsapp.net")
                }
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            // Try WhatsApp / WhatsApp Business directly first when installed so the BeBoss logo card lands right inside WhatsApp
            val pm = context.packageManager
            val waPkg = listOf("com.whatsapp", "com.whatsapp.w4b").firstOrNull { pkg ->
                try {
                    pm.getPackageInfo(pkg, 0)
                    true
                } catch (_: Throwable) {
                    false
                }
            }

            MessageAuditManager.recordDispatch(
                context = context,
                channel = "SHARE_CARD",
                recipient = targetPhone.ifBlank { waPkg ?: "ShareChooser" },
                messageType = if (mimeType == "application/pdf") "PDF_SHARE" else "LOGO_CARD_SHARE",
                preview = caption.ifBlank { file.name },
                status = "SENT"
            )

            if (waPkg != null) {
                try {
                    val waIntent = Intent(baseIntent).apply {
                        `package` = waPkg
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(waIntent)
                    return
                } catch (_: Exception) {
                    // Fall through to system chooser below
                }
            }

            val chooser = Intent.createChooser(baseIntent, chooserTitle).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooser)
        } catch (e: Exception) {
            Toast.makeText(context, "Unable to share card: ${e.safeMessage("Share unavailable")}", Toast.LENGTH_LONG).show()
        }
    }

    fun sendSmsDirect(context: Context, phone: String, message: String) {
        try {
            val cleanPhone = phone.trim()
            val uri = Uri.parse("smsto:$cleanPhone")
            val intent = Intent(Intent.ACTION_SENDTO, uri).apply {
                putExtra("sms_body", message)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            MessageAuditManager.recordDispatch(
                context = context,
                channel = "SMS",
                recipient = cleanPhone.ifBlank { "SMS" },
                messageType = "SMS_INTENT",
                preview = message,
                status = "COMPOSER_OPENED"
            )
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Cannot open SMS app: ${e.safeMessage("SMS app unavailable")}", Toast.LENGTH_SHORT).show()
        }
    }

    fun makePhoneCall(context: Context, phone: String) {
        try {
            val cleanPhone = phone.trim()
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$cleanPhone")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Cannot open Phone dialer: ${e.safeMessage("Dialer unavailable")}", Toast.LENGTH_SHORT).show()
        }
    }

    fun shareFile(context: Context, file: File, mimeType: String, title: String) {
        try {
            val uri = getUriForFile(context, file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, title)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, title).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (e: Exception) {
            Toast.makeText(context, "Unable to share file: ${e.safeMessage("Share unavailable")}", Toast.LENGTH_SHORT).show()
        }
    }

    fun generateAdminExecutiveReportPdf(
        context: Context,
        shops: List<SupabaseShopAccountDto>,
        payments: List<SupabasePaymentRequestDto>,
        auditLogs: List<SupabaseAuditLogDto>,
        telemetry: List<SupabaseDeviceTelemetryDto>
    ): File {
        val pdfDoc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdfDoc.startPage(pageInfo)
        val canvas = page.canvas

        val paint = Paint().apply { isAntiAlias = true }
        val primaryOrange = Color.rgb(255, 107, 26)
        val darkInk = Color.rgb(17, 24, 39)
        val grayMedium = Color.rgb(107, 114, 128)
        val lightGray = Color.rgb(243, 244, 246)
        val greenOk = Color.rgb(16, 185, 129)
        val redAlert = Color.rgb(220, 38, 38)

        paint.color = primaryOrange
        canvas.drawRect(0f, 0f, 595f, 10f, paint)

        paint.color = Color.rgb(254, 243, 235)
        canvas.drawRoundRect(RectF(30f, 24f, 565f, 102f), 12f, 12f, paint)

        paint.color = primaryOrange
        paint.textSize = 18f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("BEBOSS EXECUTIVE FLEET & REVENUE REPORT", 46f, 56f, paint)

        paint.color = grayMedium
        paint.textSize = 10.5f
        paint.typeface = Typeface.DEFAULT
        val generatedAt = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault()).format(Date())
        canvas.drawText("Generated: $generatedAt • Master Cloud Registry Snapshot", 46f, 78f, paint)

        // KPI Strip
        val activeShops = shops.count { it.subscriptionStatus.equals("ACTIVE", ignoreCase = true) }
        val trialShops = shops.count { it.subscriptionStatus.equals("TRIAL", ignoreCase = true) }
        val mrrRwf = shops.filter { it.subscriptionStatus.equals("ACTIVE", ignoreCase = true) }.sumOf { it.monthlyFeeRwf.toLong() }
        val pendingPay = payments.count { it.status == "PENDING_VERIFICATION" }
        val highRiskDevices = telemetry.count { it.riskScore >= 40 || it.clockRollbackDetected || it.isRooted }

        paint.color = lightGray
        canvas.drawRoundRect(RectF(30f, 118f, 565f, 196f), 10f, 10f, paint)
        paint.color = darkInk
        paint.textSize = 12f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("Organizations: ${shops.size} (${activeShops} Active, ${trialShops} Trial)", 46f, 144f, paint)
        canvas.drawText("Estimated Cloud MRR: $mrrRwf FRw/mo", 330f, 144f, paint)
        canvas.drawText("Pending MoMo/Airtel Proofs: $pendingPay", 46f, 172f, paint)
        paint.color = if (highRiskDevices > 0) redAlert else greenOk
        canvas.drawText("Fleet Security Risk Alerts: $highRiskDevices / ${telemetry.size} terminals", 330f, 172f, paint)

        // Registered Organizations Table
        var curY = 230f
        paint.color = primaryOrange
        canvas.drawRoundRect(RectF(30f, curY - 16f, 565f, curY + 10f), 6f, 6f, paint)
        paint.color = Color.WHITE
        paint.textSize = 10f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("ORGANIZATION / SHOP", 42f, curY, paint)
        canvas.drawText("OWNER", 225f, curY, paint)
        canvas.drawText("QUOTA (BR/STF/DEV)", 340f, curY, paint)
        canvas.drawText("PLAN & STATUS", 475f, curY, paint)
        curY += 24f

        shops.take(12).forEach { s ->
            paint.color = darkInk
            paint.textSize = 9.5f
            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText(s.shopName.take(26), 42f, curY, paint)
            paint.color = grayMedium
            paint.typeface = Typeface.DEFAULT
            canvas.drawText("@${s.ownerUsername}".take(16), 225f, curY, paint)
            canvas.drawText("${s.branchCount} / ${s.workerCount} / ${s.deviceCount}/${s.deviceLimit}", 340f, curY, paint)
            paint.color = if (s.subscriptionStatus == "ACTIVE") greenOk else darkInk
            paint.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText("${s.monthlyFeeRwf} • ${s.subscriptionStatus}", 475f, curY, paint)
            curY += 20f
        }

        // Security Telemetry Alerts / Recent Audits
        curY = maxOf(curY + 16f, 520f)
        paint.color = darkInk
        paint.textSize = 12f
        paint.typeface = Typeface.DEFAULT_BOLD
        canvas.drawText("RECENT ADMIN AUDIT & FLEET SECURITY EVENTS", 30f, curY, paint)
        curY += 20f
        auditLogs.take(10).forEach { log ->
            paint.color = grayMedium
            paint.textSize = 9f
            paint.typeface = Typeface.DEFAULT
            canvas.drawText("• [${log.action}] ${log.targetId}: ${log.details}".take(96), 36f, curY, paint)
            curY += 16f
        }

        paint.color = grayMedium
        paint.textSize = 8.5f
        canvas.drawText("Confidential — BeBoss Enterprise Cloud Operations", 30f, 815f, paint)

        pdfDoc.finishPage(page)
        val file = File(getReportsDir(context), "BeBoss_Executive_Report_${System.currentTimeMillis()}.pdf")
        FileOutputStream(file).use { pdfDoc.writeTo(it) }
        pdfDoc.close()
        return file
    }
}
