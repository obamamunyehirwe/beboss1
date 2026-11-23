package com.beboss.shopmgmt.ui.screens.analytics

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.ShoppingCartCheckout
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import java.util.Locale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.beboss.shopmgmt.data.model.BranchPerformanceMetric
import com.beboss.shopmgmt.data.model.CustomerAgingSummary
import com.beboss.shopmgmt.data.model.ReorderSuggestion
import com.beboss.shopmgmt.data.model.StaffPerformanceMetric
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.LossRedLight
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.ui.theme.ProfitGreenLight
import com.beboss.shopmgmt.ui.theme.WarningAmber
import com.beboss.shopmgmt.ui.theme.WarningAmberLight
import com.beboss.shopmgmt.util.ReceiptGenerator
import java.util.Locale

@Composable
fun BranchComparisonSection(
    metrics: List<BranchPerformanceMetric>,
    currencySymbol: String,
    canViewProfit: Boolean
) {
    if (metrics.isEmpty()) return

    val totalRev = metrics.sumOf { it.revenue }.coerceAtLeast(1.0)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Store, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Multi-Branch Performance Comparison", fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }

            metrics.forEach { m ->
                val sharePct = ((m.revenue / totalRev) * 100.0).coerceIn(0.0, 100.0)
                val targetProgress = (m.targetProgressPercent / 100.0).toFloat().coerceIn(0f, 1f)
                val statusColor = when (m.operationalStatus.uppercase(Locale.US)) {
                    "CLOSED" -> LossRed
                    "PAUSED" -> WarningAmber
                    else -> ProfitGreen
                }
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "${m.branchName} (${m.branchCode})",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    "${m.salesCount} sales • ${String.format(Locale.US, "%.1f", sharePct)}% revenue share",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Surface(color = statusColor.copy(alpha = 0.14f), shape = RoundedCornerShape(999.dp)) {
                                Text(
                                    m.operationalStatus,
                                    color = statusColor,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                )
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                "Rev: ${ReceiptGenerator.formatMoney(m.revenue, currencySymbol)}",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 12.sp
                            )
                            if (canViewProfit) {
                                Text(
                                    "Net: ${ReceiptGenerator.formatMoney(m.netProfit, currencySymbol)} (${String.format(Locale.US, "%.1f", m.marginPercent)}%)",
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 12.sp,
                                    color = if (m.netProfit >= 0.0) ProfitGreen else LossRed
                                )
                            }
                        }

                        if (m.dailyTargetRwf > 0L) {
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        "Target Progress",
                                        fontSize = 10.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        "${String.format(Locale.US, "%.0f", m.targetProgressPercent)}% of ${ReceiptGenerator.formatMoney(m.dailyTargetRwf.toDouble(), currencySymbol)}",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = OrangePrimary
                                    )
                                }
                                LinearProgressIndicator(
                                    progress = { targetProgress },
                                    modifier = Modifier.fillMaxWidth().height(6.dp),
                                    color = if (m.targetProgressPercent >= 100.0) ProfitGreen else OrangePrimary,
                                    trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StaffLeaderboardSection(
    metrics: List<StaffPerformanceMetric>,
    currencySymbol: String,
    canViewProfit: Boolean
) {
    if (metrics.isEmpty()) return

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Badge, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Cashier & Staff Performance", fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }

            metrics.take(8).forEachIndexed { idx, staff ->
                if (idx > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "#${idx + 1} ${staff.cashierName}",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            "${staff.salesCount} receipts • Avg ${ReceiptGenerator.formatMoney(staff.avgOrderValue, currencySymbol)}",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            ReceiptGenerator.formatMoney(staff.revenue, currencySymbol),
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                        if (canViewProfit) {
                            Text(
                                "+${ReceiptGenerator.formatMoney(staff.profit, currencySymbol)}",
                                fontSize = 11.sp,
                                color = if (staff.profit >= 0.0) ProfitGreen else LossRed
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CustomerAgingSection(
    summary: CustomerAgingSummary,
    currencySymbol: String,
    canExportReports: Boolean,
    onExportAgingCsv: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text("Accounts Receivable Aging", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(
                            "Total Receivable: ${ReceiptGenerator.formatMoney(summary.totalReceivable, currencySymbol)}",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                if (canExportReports && summary.entries.isNotEmpty()) {
                    OutlinedButton(
                        onClick = onExportAgingCsv,
                        modifier = Modifier.testTag("analytics_export_ar_csv_btn")
                    ) {
                        Icon(Icons.Default.Download, contentDescription = "Export AR aging CSV", modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("AR CSV", fontSize = 11.sp)
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                AgingBucketChip("0-30d", summary.bucket0To30, currencySymbol, ProfitGreen, Modifier.weight(1f))
                AgingBucketChip("31-60d", summary.bucket31To60, currencySymbol, WarningAmber, Modifier.weight(1f))
                AgingBucketChip("61-90d", summary.bucket61To90, currencySymbol, OrangePrimary, Modifier.weight(1f))
                AgingBucketChip("90+d", summary.bucket90Plus, currencySymbol, LossRed, Modifier.weight(1f))
            }

            if (summary.overLimitCount > 0) {
                Surface(color = LossRedLight, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(modifier = Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = LossRed, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            "${summary.overLimitCount} customer(s) exceeded credit limit",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = LossRed
                        )
                    }
                }
            }

            if (summary.entries.isEmpty()) {
                Text(
                    "No open customer credit balances.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                summary.entries.take(5).forEach { entry ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(entry.customerName, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                            Text(
                                "${entry.agingBucket} (${entry.oldestUnpaidDays}d) • ${if (entry.isOverLimit) "OVER LIMIT" else "Within limit"}",
                                fontSize = 10.sp,
                                color = if (entry.isOverLimit || entry.agingBucket == "90+d") LossRed else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(
                            ReceiptGenerator.formatMoney(entry.debtBalance, currencySymbol),
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            color = if (entry.isOverLimit) LossRed else MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun SmartReorderSection(
    suggestions: List<ReorderSuggestion>,
    currencySymbol: String,
    canManageInventory: Boolean,
    onCreatePurchaseOrder: (ReorderSuggestion) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Inventory, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Column {
                    Text("Smart Procurement & Reorder Queue", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text(
                        "${suggestions.size} SKU(s) requiring replenishment",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (suggestions.isEmpty()) {
                Surface(color = ProfitGreenLight.copy(alpha = 0.6f), shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "All monitored SKUs are above reorder thresholds.",
                        fontSize = 12.sp,
                        color = ProfitGreen,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            } else {
                suggestions.take(6).forEach { s ->
                    val urgencyColor = if (s.urgency == "CRITICAL") LossRed else WarningAmber
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(
                                        s.productName,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Surface(color = urgencyColor.copy(alpha = 0.14f), shape = RoundedCornerShape(6.dp)) {
                                        Text(
                                            s.urgency,
                                            color = urgencyColor,
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                                Text(
                                    "Stock: ${s.currentStock.toInt()} ${s.unit} (min ${s.lowStockThreshold.toInt()}) • 56d sold: ${s.unitsSoldInPeriod.toInt()}",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    if (s.hasDemandHistory) {
                                        val cover = "${s.stockCoverDays.toInt()}d cover"
                                        val confidence = s.forecastConfidence.lowercase().replaceFirstChar { it.uppercase() }
                                        "Forecast: ${String.format(Locale.getDefault(), "%.2f", s.forecastDailyDemand)} ${s.unit}/day • $cover • $confidence confidence"
                                    } else {
                                        "Forecast: insufficient recent sales history • low confidence"
                                    },
                                    fontSize = 10.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                if (s.hasTrendComparison) {
                                    val trend = if (s.demandTrendPercent >= 0.0) "+" else ""
                                    Text(
                                        "14-day demand trend: $trend${String.format(Locale.getDefault(), "%.1f", s.demandTrendPercent)}% • Reorder point: ${s.reorderPoint.toInt()} ${s.unit}",
                                        fontSize = 10.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Text(
                                    "Suggest Order: ${s.suggestedOrderQty.toInt()} ${s.unit} (~${ReceiptGenerator.formatMoney(s.estimatedOrderCost, currencySymbol)})",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = OrangePrimary
                                )
                            }
                            if (canManageInventory) {
                                Button(
                                    onClick = { onCreatePurchaseOrder(s) },
                                    colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                                    modifier = Modifier.testTag("reorder_create_po_${s.productId}")
                                ) {
                                    Icon(Icons.Default.ShoppingCartCheckout, contentDescription = null, modifier = Modifier.size(15.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Order", fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AgingBucketChip(
    label: String,
    amount: Double,
    currencySymbol: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        color = color.copy(alpha = 0.1f),
        shape = RoundedCornerShape(10.dp)
    ) {
        Column(modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp)) {
            Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = color)
            Text(
                ReceiptGenerator.formatMoney(amount, currencySymbol),
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
