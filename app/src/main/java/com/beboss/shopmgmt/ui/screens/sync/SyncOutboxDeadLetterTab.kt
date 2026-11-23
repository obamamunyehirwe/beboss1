package com.beboss.shopmgmt.ui.screens.sync

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudQueue
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.beboss.shopmgmt.data.model.DeadLetterItem
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.LossRedLight
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.ui.theme.ProfitGreenLight
import com.beboss.shopmgmt.ui.theme.WarningAmber
import com.beboss.shopmgmt.ui.theme.WarningAmberLight
import com.beboss.shopmgmt.util.SupabaseDeviceTelemetryDto
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class DeadLetterDisplayRow(
    val id: String,
    val tableName: String,
    val operation: String,
    val errorDetail: String,
    val retryCount: Int,
    val timestamp: Long
)

@Composable
fun SyncOutboxDeadLetterTab(
    pendingSyncItems: List<SyncQueueItem>,
    deadLetterQueueItems: List<SyncQueueItem>,
    deadLetterRecords: List<DeadLetterItem>,
    shopDeviceTelemetry: List<SupabaseDeviceTelemetryDto>,
    onRetryDeadLetter: (String) -> Unit,
    onRetryAllDeadLetters: () -> Unit,
    onDiscardDeadLetter: (String) -> Unit,
    onRefreshTelemetry: () -> Unit
) {
    val timeFmt = remember { SimpleDateFormat("dd MMM HH:mm", Locale.getDefault()) }

    val mergedFailures = remember(deadLetterQueueItems, deadLetterRecords) {
        val byId = linkedMapOf<String, DeadLetterDisplayRow>()
        deadLetterQueueItems.forEach { item ->
            byId[item.id] = DeadLetterDisplayRow(
                id = item.id,
                tableName = item.tableName,
                operation = item.operation,
                errorDetail = item.lastError.ifBlank { "Max sync retries exceeded" },
                retryCount = item.retryCount,
                timestamp = item.createdAt
            )
        }
        deadLetterRecords.forEach { dl ->
            val key = dl.originalItemId.ifBlank { dl.id }
            if (!byId.containsKey(key)) {
                byId[dl.id] = DeadLetterDisplayRow(
                    id = dl.id,
                    tableName = dl.tableName,
                    operation = dl.operation,
                    errorDetail = dl.failureReason.ifBlank { "Sync permanently failed" },
                    retryCount = dl.failureCount,
                    timestamp = dl.createdAt
                )
            }
        }
        byId.values.sortedByDescending { it.timestamp }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Summary Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CloudQueue, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text("Cloud Sync Outbox & Recovery", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Text(
                                "${pendingSyncItems.size} pending • ${mergedFailures.size} failed",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    if (mergedFailures.isNotEmpty()) {
                        Button(
                            onClick = onRetryAllDeadLetters,
                            colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                            modifier = Modifier.testTag("sync_retry_all_dead_letters_btn")
                        ) {
                            Icon(Icons.Default.Replay, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Retry All", fontSize = 12.sp)
                        }
                    }
                }
            }
        }

        // Failed / Dead Letter Queue Inspector
        if (mergedFailures.isNotEmpty()) {
            Text(
                "FAILED SYNC RECORDS (${mergedFailures.size})",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = LossRed
            )
            mergedFailures.forEach { failure ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, LossRed.copy(alpha = 0.35f))
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = LossRed, modifier = Modifier.size(15.dp))
                                Text(
                                    "${failure.tableName.uppercase()} • ${failure.operation}",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                                Text(
                                    "(${failure.retryCount}x)",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Text(
                                failure.errorDetail,
                                fontSize = 11.sp,
                                color = LossRed,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                "Queued ${timeFmt.format(Date(failure.timestamp))}",
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Row {
                            IconButton(
                                onClick = { onRetryDeadLetter(failure.id) },
                                modifier = Modifier.size(48.dp).testTag("sync_retry_item_${failure.id}")
                            ) {
                                Icon(Icons.Default.Replay, contentDescription = "Retry failed sync item", tint = OrangePrimary)
                            }
                            IconButton(
                                onClick = { onDiscardDeadLetter(failure.id) },
                                modifier = Modifier.size(48.dp).testTag("sync_discard_item_${failure.id}")
                            ) {
                                Icon(Icons.Default.DeleteOutline, contentDescription = "Discard failed sync item", tint = LossRed)
                            }
                        }
                    }
                }
            }
        } else if (pendingSyncItems.isEmpty()) {
            Surface(
                color = ProfitGreenLight.copy(alpha = 0.6f),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Outbox Clean — All local mutations are synchronized with cloud.",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = ProfitGreen
                    )
                }
            }
        }

        // Pending Outbox Preview
        if (pendingSyncItems.isNotEmpty()) {
            Text(
                "PENDING OUTBOX (${pendingSyncItems.size})",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = WarningAmber
            )
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    pendingSyncItems.take(10).forEachIndexed { idx, item ->
                        if (idx > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "${item.tableName} • ${item.operation}",
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 12.sp
                                )
                                if (item.lastError.isNotBlank()) {
                                    Text(
                                        "Last attempt: ${item.lastError}",
                                        fontSize = 11.sp,
                                        color = WarningAmber,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                            Text(
                                "Retry #${item.retryCount}",
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    if (pendingSyncItems.size > 10) {
                        Text(
                            "+ ${pendingSyncItems.size - 10} more queued items",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        // Shop Terminals Security Telemetry
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Security, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Shop Terminal Telemetry", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                    OutlinedButton(
                        onClick = onRefreshTelemetry,
                        modifier = Modifier.testTag("sync_refresh_shop_telemetry_btn")
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh shop telemetry", modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Refresh", fontSize = 11.sp)
                    }
                }

                if (shopDeviceTelemetry.isEmpty()) {
                    Text(
                        "No paired terminal telemetry synced yet for this organization.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    shopDeviceTelemetry.forEach { dev ->
                        val riskColor = when {
                            dev.riskScore >= 40 -> LossRed
                            dev.riskScore >= 20 -> WarningAmber
                            else -> ProfitGreen
                        }
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        dev.deviceName.ifBlank { dev.deviceId.take(12) },
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 12.sp
                                    )
                                    Surface(
                                        color = riskColor.copy(alpha = 0.14f),
                                        shape = RoundedCornerShape(999.dp)
                                    ) {
                                        Text(
                                            "Risk ${dev.riskScore}/100",
                                            color = riskColor,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    val hasGps = dev.latitude != 0.0 || dev.longitude != 0.0
                                    Icon(
                                        if (hasGps) Icons.Default.LocationOn else Icons.Default.GpsFixed,
                                        contentDescription = null,
                                        tint = if (hasGps) ProfitGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Spacer(Modifier.width(4.dp))
                                    Text(
                                        text = if (hasGps) {
                                            dev.locationLabel.ifBlank { "${dev.latitude}, ${dev.longitude}" }
                                        } else {
                                            "GPS pending • ${timeFmt.format(Date(dev.updatedAt.coerceAtLeast(dev.inspectedAt)))}"
                                        },
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
