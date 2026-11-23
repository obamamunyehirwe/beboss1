package com.beboss.shopmgmt.util

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.ShopProfile
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

data class ParsedReceiptQr(
    val receiptNumber: String,
    val seal: String,
    val totalAmount: Double? = null
)

object QrCodeGenerator {

    fun generateQrBitmap(
        content: String,
        sizePx: Int = 512,
        fgColor: Int = Color.parseColor("#0F172A"),
        bgColor: Int = Color.WHITE
    ): Bitmap {
        val safeContent = content.ifBlank { "BEBOSS-POS" }
        val targetSize = sizePx.coerceIn(128, 1024)
        return try {
            val hints = mapOf(
                EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
                EncodeHintType.MARGIN to 1,
                EncodeHintType.CHARACTER_SET to "UTF-8"
            )
            val matrix = QRCodeWriter().encode(
                safeContent,
                BarcodeFormat.QR_CODE,
                targetSize,
                targetSize,
                hints
            )
            val width = matrix.width
            val height = matrix.height
            val pixels = IntArray(width * height)
            for (y in 0 until height) {
                val offset = y * width
                for (x in 0 until width) {
                    pixels[offset + x] = if (matrix[x, y]) fgColor else bgColor
                }
            }
            Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply {
                setPixels(pixels, 0, width, 0, 0, width, height)
            }
        } catch (_: Throwable) {
            Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888).apply {
                eraseColor(bgColor)
            }
        }
    }

    fun generateQrImageBitmap(
        content: String,
        sizePx: Int = 512
    ): ImageBitmap = generateQrBitmap(content, sizePx).asImageBitmap()

    fun buildReceiptQrPayload(
        sale: Sale,
        profile: ShopProfile,
        seal: String
    ): String {
        val safeShop = profile.shopName.replace("|", " ").trim().take(28)
        val totalCents = MoneyUtils.toCents(sale.totalAmount)
        return "BEBOSS|RCPT|${sale.receiptNumber}|$seal|${sale.totalAmount.toLong()}|${profile.currencySymbol}|${sale.saleDate}|$safeShop|$totalCents"
    }

    fun parseReceiptQrPayload(raw: String): ParsedReceiptQr? {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return null

        if (trimmed.startsWith("BEBOSS|RCPT|")) {
            val parts = trimmed.split("|")
            if (parts.size >= 4) {
                val receiptNo = parts[2].trim()
                val seal = parts[3].trim()
                val amount = parts.getOrNull(4)?.toDoubleOrNull()
                if (receiptNo.isNotBlank() && seal.isNotBlank()) {
                    return ParsedReceiptQr(receiptNo, seal, amount)
                }
            }
        }

        // Also support simple "RECEIPT|SEAL" or JSON/colon formats
        if (trimmed.contains("|")) {
            val parts = trimmed.split("|").map { it.trim() }.filter { it.isNotBlank() }
            val sealIdx = parts.indexOfFirst { it.startsWith("BB-", ignoreCase = true) }
            if (sealIdx >= 1) {
                return ParsedReceiptQr(
                    receiptNumber = parts[sealIdx - 1],
                    seal = parts[sealIdx].uppercase(),
                    totalAmount = parts.getOrNull(sealIdx + 1)?.toDoubleOrNull()
                )
            }
        }
        return null
    }
}
