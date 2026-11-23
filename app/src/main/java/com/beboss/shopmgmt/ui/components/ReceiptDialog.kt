package com.beboss.shopmgmt.ui.components

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.beboss.shopmgmt.R
import com.beboss.shopmgmt.data.model.SaleWithItems
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.InkDark
import com.beboss.shopmgmt.ui.theme.InkMedium
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.BrandedShareCardGenerator
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.PdfReportGenerator
import com.beboss.shopmgmt.util.QrCodeGenerator
import com.beboss.shopmgmt.util.ReceiptGenerator

@Composable
fun ReceiptDialog(
    saleWithItems: SaleWithItems,
    shopProfile: ShopProfile,
    onDismiss: () -> Unit,
    language: AppLanguage = AppLanguage.ENGLISH,
    customerPhone: String = ""
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val sale = saleWithItems.sale
    val items = saleWithItems.items

    val offlineSeal = remember(sale.id, shopProfile.tinNumber) {
        ReceiptGenerator.computeOfflineReceiptSeal(sale, shopProfile)
    }
    val qrPayload = remember(sale.id, offlineSeal) {
        QrCodeGenerator.buildReceiptQrPayload(sale, shopProfile, offlineSeal)
    }
    val qrImageBitmap = remember(qrPayload) {
        QrCodeGenerator.generateQrImageBitmap(qrPayload, sizePx = 384)
    }

    var showQrExpandedDialog by remember { mutableStateOf(false) }
    var showItemsExpanded by remember { mutableStateOf(true) }

    val paymentMethodEmoji = when {
        sale.paymentMethod.contains("MOMO", ignoreCase = true) ||
            sale.paymentMethod.contains("MOBILE", ignoreCase = true) -> "📱"
        sale.paymentMethod.contains("CREDIT", ignoreCase = true) -> "💳"
        else -> "💵"
    }
    val isFullyPaid = sale.amountPaid >= sale.totalAmount && sale.totalAmount > 0
    val statusEmoji = when {
        isFullyPaid -> "✅"
        sale.amountPaid > 0 -> "⏳"
        else -> "🧾"
    }

    val textReceipt = remember(sale.id, items.size) {
        buildString {
            append("🧾 *${shopProfile.shopName.ifBlank { "BEBOSS STORE" }} — OFFICIAL RECEIPT*\n")
            append("📦 Receipt #: ${sale.receiptNumber}\n")
            append("📅 Date: ${ReceiptGenerator.formatDate(sale.saleDate)}\n")
            append("👤 Customer: ${sale.customerName}\n")
            append("$paymentMethodEmoji Payment: ${sale.paymentMethod} ($statusEmoji ${sale.paymentStatus})\n")
            append("💰 Total: *${ReceiptGenerator.formatMoney(sale.totalAmount, shopProfile)}*\n")
            append("🛡️ Verified Seal: $offlineSeal\n")
            append("━━━━━━━━━━━━━━━━━━━━\n")
            append(ReceiptGenerator.generateTextReceipt(sale, items, shopProfile))
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.94f)
                .padding(vertical = 18.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(10.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(18.dp)
            ) {
                // Top Bar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = "Success",
                            tint = ProfitGreen,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "✅ ${Localization.get("rec_sale_completed", language)}",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = InkDark
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = Localization.get("close", language), tint = InkDark)
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Modern Official Branded Header with BeBoss Logo
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = DarkNavy
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color.White,
                            border = BorderStroke(1.5.dp, OrangePrimary),
                            modifier = Modifier.size(54.dp)
                        ) {
                            Image(
                                painter = painterResource(id = R.drawable.beboss_app_icon),
                                contentDescription = "BeBoss Brand Logo",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(3.dp)
                                    .clip(RoundedCornerShape(11.dp))
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = shopProfile.shopName.ifBlank { "BEBOSS STORE" }.uppercase(),
                                fontWeight = FontWeight.Black,
                                fontSize = 15.5.sp,
                                color = Color.White
                            )
                            if (shopProfile.address.isNotBlank() || shopProfile.phone.isNotBlank()) {
                                Text(
                                    text = listOf(shopProfile.address, shopProfile.phone)
                                        .filter { it.isNotBlank() }
                                        .joinToString(" • "),
                                    fontSize = 11.sp,
                                    color = Color(0xFFCBD5E1)
                                )
                            }
                            if (shopProfile.tinNumber.isNotBlank()) {
                                Text(
                                    text = "🏛️ TIN: ${shopProfile.tinNumber}",
                                    fontSize = 10.5.sp,
                                    color = Color(0xFFFDBA74),
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Paper Receipt Interactive Card
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0))
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Status & Payment Badges with Functional Emojis
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (isFullyPaid) Color(0xFFDCFCE7) else Color(0xFFFFF7ED),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = "$statusEmoji ${Localization.paymentStatusLabel(sale.paymentStatus, language)}",
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isFullyPaid) ProfitGreen else OrangePrimary,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                                )
                            }
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFFEFF6FF),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = "$paymentMethodEmoji ${Localization.paymentMethodLabel(sale.paymentMethod, language)}",
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = DarkNavy,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // Meta rows with functional emojis
                        ReceiptMetaRow("🧾 ${Localization.get("rec_receipt_num_colon", language)}", sale.receiptNumber, boldValue = true)
                        ReceiptMetaRow("📅 ${Localization.get("rec_date_colon", language)}", ReceiptGenerator.formatDate(sale.saleDate))
                        ReceiptMetaRow("👤 ${Localization.get("rec_customer_colon", language)}", sale.customerName, boldValue = true)
                        ReceiptMetaRow("🧑‍💼 Cashier:", sale.cashierName.ifBlank { "Operator" })

                        HorizontalDivider(modifier = Modifier.padding(vertical = 10.dp), color = Color(0xFFCBD5E1))

                        // Interactive Collapsible Items Breakdown
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showItemsExpanded = !showItemsExpanded }
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "🛒 Purchased Items (${items.size})",
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = DarkNavy
                            )
                            Icon(
                                imageVector = if (showItemsExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                contentDescription = "Toggle items",
                                tint = InkMedium,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        AnimatedVisibility(visible = showItemsExpanded) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                items.forEach { item ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 4.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = "• ${item.productName}",
                                                fontSize = 12.5.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = InkDark
                                            )
                                            Text(
                                                text = "   ${item.quantitySold} ${item.unit} × ${ReceiptGenerator.formatMoney(item.unitPriceAtSale, shopProfile)}",
                                                fontSize = 11.sp,
                                                color = InkMedium
                                            )
                                        }
                                        Text(
                                            text = ReceiptGenerator.formatMoney(item.subtotal, shopProfile),
                                            fontSize = 12.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = InkDark
                                        )
                                    }
                                }
                            }
                        }

                        HorizontalDivider(modifier = Modifier.padding(vertical = 10.dp), thickness = 1.5.dp, color = DarkNavy)

                        // Totals
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "💰 ${Localization.get("rec_total_upper", language)}",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = InkDark
                            )
                            Text(
                                text = ReceiptGenerator.formatMoney(sale.totalAmount, shopProfile),
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Black,
                                color = OrangePrimary
                            )
                        }

                        if (shopProfile.showTaxOnReceipt && shopProfile.taxRate > 0.0) {
                            val vatAmount = ReceiptGenerator.computeTaxIncludedAmount(sale.totalAmount, shopProfile.taxRate)
                            ReceiptMetaRow(
                                "🏛️ ${Localization.format("rec_incl_tax_fmt", language, shopProfile.taxRate.toString())}",
                                ReceiptGenerator.formatMoney(vatAmount, shopProfile)
                            )
                        }

                        if (sale.discountAmount > 0) {
                            ReceiptMetaRow(
                                "🏷️ ${Localization.get("rec_discount_colon", language)}",
                                "-${ReceiptGenerator.formatMoney(sale.discountAmount, shopProfile)}"
                            )
                        }

                        ReceiptMetaRow(
                            "💵 ${Localization.get("rec_amount_paid_colon", language)}",
                            ReceiptGenerator.formatMoney(sale.amountPaid, shopProfile)
                        )

                        val debt = sale.totalAmount - sale.amountPaid
                        if (debt > 0) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("⚠️ ${Localization.get("rec_balance_due_colon", language)}", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = LossRed)
                                Text(ReceiptGenerator.formatMoney(debt, shopProfile), fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = LossRed)
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "🙏 ${shopProfile.receiptFooter}",
                            fontSize = 11.sp,
                            color = InkMedium,
                            textAlign = TextAlign.Center
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        // Interactive Scannable ZXing QR Code Card
                        Surface(
                            onClick = { showQrExpandedDialog = true },
                            shape = RoundedCornerShape(14.dp),
                            color = Color.White,
                            border = BorderStroke(1.dp, OrangePrimary.copy(alpha = 0.4f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("receipt_qr_card")
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Image(
                                    bitmap = qrImageBitmap,
                                    contentDescription = "Scannable Receipt QR Code",
                                    modifier = Modifier
                                        .size(92.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(15.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = "🛡️ Official Receipt QR",
                                            fontSize = 12.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = DarkNavy
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = Localization.format("rec_seal_fmt", language, offlineSeal),
                                        fontSize = 11.5.sp,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold,
                                        color = OrangePrimary
                                    )
                                    Spacer(modifier = Modifier.height(3.dp))
                                    Text(
                                        text = "Tap QR to enlarge, verify, or copy cryptographic seal.",
                                        fontSize = 10.5.sp,
                                        color = InkMedium
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Primary WhatsApp Share (Sends High-DPI Branded Logo + QR Card PNG)
                Button(
                    onClick = {
                        try {
                            val cardFile = BrandedShareCardGenerator.generateReceiptCardPng(
                                context = context,
                                sale = sale,
                                items = items,
                                profile = shopProfile
                            )
                            val waCaption = buildString {
                                append("🧾 *${shopProfile.shopName.ifBlank { "BeBoss Store" }}* — Official Receipt #${sale.receiptNumber}\n")
                                append("👤 ${sale.customerName}\n")
                                append("💰 Total: *${ReceiptGenerator.formatMoney(sale.totalAmount, shopProfile)}* ($statusEmoji ${sale.paymentStatus})\n")
                                append("🛡️ Seal: $offlineSeal\n")
                                append("🙏 ${shopProfile.receiptFooter}")
                            }
                            PdfReportGenerator.sendWhatsAppDirect(
                                context = context,
                                phone = customerPhone,
                                message = waCaption,
                                attachmentFile = cardFile,
                                mimeType = "image/png"
                            )
                        } catch (error: Exception) {
                            Toast.makeText(
                                context,
                                "Unable to create the branded receipt. Please retry. " + error.message.orEmpty(),
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .testTag("receipt_whatsapp_card_button"),
                    colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("💬 Share Branded Receipt on WhatsApp", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Secondary Actions: Share PDF Invoice (with Logo+QR) & Print
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            try {
                                val pdf = PdfReportGenerator.generateInvoiceReceiptPdf(
                                    context = context,
                                    sale = sale,
                                    items = items,
                                    shopProfile = shopProfile
                                )
                                PdfReportGenerator.sharePdf(
                                    context = context,
                                    file = pdf,
                                    title = Localization.format("rec_print_job_fmt", language, sale.receiptNumber),
                                    textMessage = "🧾 Official PDF Receipt #${sale.receiptNumber} from ${shopProfile.shopName}"
                                )
                            } catch (error: Exception) {
                                Toast.makeText(
                                    context,
                                    "Unable to create the branded PDF receipt. Please retry. " + error.message.orEmpty(),
                                    Toast.LENGTH_LONG
                                ).show()
                            }
                        },
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.PictureAsPdf, contentDescription = Localization.get("rec_share_pdf", language), modifier = Modifier.size(17.dp))
                        Spacer(modifier = Modifier.width(5.dp))
                        Text(Localization.get("rec_share_pdf", language), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }

                    OutlinedButton(
                        onClick = {
                            printHtmlReceipt(context, ReceiptGenerator.generateHtmlReceipt(context, sale, items, shopProfile), sale.receiptNumber, language)
                        },
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Print, contentDescription = Localization.get("rec_print_pos", language), modifier = Modifier.size(17.dp))
                        Spacer(modifier = Modifier.width(5.dp))
                        Text(Localization.get("rec_print_pos", language), fontSize = 12.sp)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedButton(
                    onClick = {
                        clipboardManager.setText(AnnotatedString(textReceipt))
                        Toast.makeText(context, Localization.get("rec_copied_toast", language), Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.ContentCopy, contentDescription = Localization.get("rec_copy_text_sms", language), modifier = Modifier.size(17.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("📋 ${Localization.get("rec_copy_text_sms", language)}", fontSize = 12.sp)
                }
            }
        }
    }

    if (showQrExpandedDialog) {
        Dialog(onDismissRequest = { showQrExpandedDialog = false }) {
            Card(
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.QrCode2, contentDescription = null, tint = OrangePrimary)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Scannable Receipt Seal", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = DarkNavy)
                    }
                    Spacer(modifier = Modifier.height(14.dp))
                    Image(
                        bitmap = qrImageBitmap,
                        contentDescription = "Full Receipt QR",
                        modifier = Modifier
                            .size(220.dp)
                            .clip(RoundedCornerShape(12.dp))
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = offlineSeal,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Black,
                        fontSize = 15.sp,
                        color = OrangePrimary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = qrPayload,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        color = InkMedium,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                clipboardManager.setText(AnnotatedString(offlineSeal))
                                Toast.makeText(context, "Seal copied: $offlineSeal", Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Copy Seal")
                        }
                        Button(
                            onClick = { showQrExpandedDialog = false },
                            colors = ButtonDefaults.buttonColors(containerColor = DarkNavy),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Close")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceiptMetaRow(label: String, value: String, boldValue: Boolean = false) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 11.5.sp, color = InkMedium)
        Text(
            text = value,
            fontSize = 11.5.sp,
            fontWeight = if (boldValue) FontWeight.Bold else FontWeight.Medium,
            color = InkDark
        )
    }
}

private fun printHtmlReceipt(context: Context, htmlContent: String, jobName: String, language: AppLanguage) {
    try {
        val webView = WebView(context)
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager
                val printAdapter = webView.createPrintDocumentAdapter(jobName)
                printManager?.print(jobName, printAdapter, PrintAttributes.Builder().build())
            }
        }
        webView.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)
    } catch (e: Exception) {
        Toast.makeText(context, Localization.format("rec_print_err_fmt", language, e.message ?: ""), Toast.LENGTH_LONG).show()
    }
}
