package com.beboss.shopmgmt.ui.screens.admin

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MarkEmailUnread
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.LossRedLight
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.ui.theme.ProfitGreenLight
import com.beboss.shopmgmt.ui.theme.WarningAmber
import com.beboss.shopmgmt.ui.theme.WarningAmberLight
import com.beboss.shopmgmt.util.CloudHealthDiagnosticsDto
import com.beboss.shopmgmt.util.SupabaseCloudSyncEventDto
import com.beboss.shopmgmt.util.SupabaseDeviceTelemetryDto
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AdminFleetTelemetryTab(
    telemetryList: List<SupabaseDeviceTelemetryDto>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit
) {
    val context = LocalContext.current
    val dateFmt = remember { SimpleDateFormat("dd MMM HH:mm", Locale.getDefault()) }

    fun hasConsentedLocation(item: SupabaseDeviceTelemetryDto): Boolean =
        item.permissionsSummary.contains("location_sharing=enabled", ignoreCase = true) &&
            item.locationCapturedAt > 0L &&
            item.latitude in -90.0..90.0 &&
            item.longitude in -180.0..180.0 &&
            (item.latitude != 0.0 || item.longitude != 0.0)

    val highRiskCount = telemetryList.count { it.riskScore >= 40 }
    val tamperCount = telemetryList.count { it.clockRollbackDetected || it.isRooted || it.hasHooking }
    val gpsActiveCount = telemetryList.count(::hasConsentedLocation)

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                        Icon(
                            Icons.Default.Security,
                            contentDescription = "Fleet Telemetry",
                            tint = OrangePrimary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                "Fleet Security & GPS Telemetry",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                            Text(
                                "${telemetryList.size} terminal reports • $gpsActiveCount with a consented location report",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    OutlinedButton(
                        onClick = onRefresh,
                        enabled = !isLoading,
                        modifier = Modifier.testTag("admin_refresh_telemetry_btn")
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh telemetry", modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Sync", fontSize = 12.sp)
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    TelemetrySummaryPill(
                        label = "High Risk",
                        value = "$highRiskCount",
                        color = if (highRiskCount > 0) LossRed else ProfitGreen,
                        modifier = Modifier.weight(1f)
                    )
                    TelemetrySummaryPill(
                        label = "Tamper / Root",
                        value = "$tamperCount",
                        color = if (tamperCount > 0) WarningAmber else ProfitGreen,
                        modifier = Modifier.weight(1f)
                    )
                    TelemetrySummaryPill(
                        label = "Opt-in GPS",
                        value = "$gpsActiveCount",
                        color = OrangePrimary,
                        modifier = Modifier.weight(1f)
                    )
                }
                Text(
                    "Device location is shared only after the device user opts in. Any point shown below is the last captured location, not live tracking.",
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (telemetryList.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        Icons.Default.Shield,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(34.dp)
                    )
                    Text("No Device Telemetry Uploaded Yet", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    Text(
                        "Security posture, monotonic clock checks, and foreground GPS coordinates appear here as soon as shop terminals sync.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            telemetryList.forEach { item ->
                val riskColor = when {
                    item.riskScore >= 40 -> LossRed
                    item.riskScore >= 20 -> WarningAmber
                    else -> ProfitGreen
                }
                val riskBg = when {
                    item.riskScore >= 40 -> LossRedLight
                    item.riskScore >= 20 -> WarningAmberLight
                    else -> ProfitGreenLight
                }
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(
                        1.dp,
                        if (item.riskScore >= 40) LossRed.copy(alpha = 0.45f)
                        else MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
                    )
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    item.shopName.ifBlank { "Shop Terminal" },
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    buildString {
                                        append(item.deviceName.ifBlank { "Terminal" }).append(" • ")
                                        append(item.devicePlatform.ifBlank { "ANDROID" })
                                        val hardware = listOf(item.manufacturer, item.model).filter { it.isNotBlank() }.joinToString(" ")
                                        if (hardware.isNotBlank()) append(" • ").append(hardware)
                                        if (item.osRelease.isNotBlank()) append(" • Android ").append(item.osRelease)
                                        if (item.appVersion.isNotBlank()) append(" • BeBoss ").append(item.appVersion)
                                        append(" • ").append(item.deviceId.take(12))
                                    },
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                            Surface(color = riskBg, shape = RoundedCornerShape(999.dp)) {
                                Text(
                                    "Risk ${item.riskScore}/100 • ${item.postureLabel.ifBlank { "OK" }}",
                                    color = riskColor,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                )
                            }
                        }

                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            if (item.isRooted) TelemetryFlagChip("ROOTED", LossRed)
                            if (item.hasHooking) TelemetryFlagChip("HOOKING / FRIDA", LossRed)
                            if (item.isEmulator) TelemetryFlagChip("EMULATOR", WarningAmber)
                            if (item.clockRollbackDetected) {
                                TelemetryFlagChip("CLOCK ROLLBACK (${item.tamperIncidentCount}x)", LossRed)
                            }
                            if (item.keystoreBacking.isNotBlank()) {
                                TelemetryFlagChip("Keystore: ${item.keystoreBacking}", MaterialTheme.colorScheme.primary)
                            }
                            if (item.unsyncedMessagesCount > 0) {
                                TelemetryFlagChip("Unsynced Msg: ${item.unsyncedMessagesCount}", WarningAmber)
                            }
                        }

                        if (item.tamperReason.isNotBlank()) {
                            Text(
                                "Alert: ${item.tamperReason}",
                                fontSize = 11.sp,
                                color = LossRed,
                                fontWeight = FontWeight.Medium
                            )
                        }
                        if (item.permissionsSummary.isNotBlank()) {
                            Text(
                                "Permissions: ${item.permissionsSummary}",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        val hasGps = hasConsentedLocation(item)
                        val locationSharingEnabled = item.permissionsSummary.contains("location_sharing=enabled", ignoreCase = true)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(
                                    if (hasGps) Icons.Default.LocationOn else Icons.Default.GpsFixed,
                                    contentDescription = "Terminal GPS status",
                                    tint = if (hasGps) ProfitGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = if (hasGps) {
                                        (item.locationLabel.ifBlank {
                                            String.format(Locale.US, "%.4f, %.4f", item.latitude, item.longitude)
                                        }) + " • Captured " + dateFmt.format(Date(item.locationCapturedAt)) +
                                            " • ±${item.accuracyMeters.toInt()}m"
                                    } else {
                                        when {
                                            item.permissionsSummary.isBlank() -> "Location sharing status unavailable on this report"
                                            !locationSharingEnabled -> "Location not shared • Device privacy setting"
                                            else -> "Opt-in enabled • No recent foreground location fix"
                                        } + " • Reported " + dateFmt.format(Date(item.updatedAt.coerceAtLeast(item.inspectedAt)))
                                    },
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }

                            if (hasGps) {
                                OutlinedButton(
                                    onClick = {
                                        val label = Uri.encode(item.shopName.ifBlank { item.deviceName })
                                        val uri = Uri.parse("geo:${item.latitude},${item.longitude}?q=${item.latitude},${item.longitude}($label)")
                                        val intent = Intent(Intent.ACTION_VIEW, uri)
                                        try {
                                            context.startActivity(intent)
                                        } catch (_: Exception) {
                                            Toast.makeText(context, "No map application installed.", Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    modifier = Modifier.testTag("admin_open_map_${item.id}")
                                ) {
                                    Text("Open Map", fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
            }

            if (telemetryList.size >= 100) {
                OutlinedButton(
                    onClick = onLoadMore,
                    modifier = Modifier.fillMaxWidth().testTag("admin_load_more_telemetry_btn")
                ) {
                    Text("Load More Telemetry Reports")
                }
            }
        }
    }
}

@Composable
fun AdminCloudHealthTab(
    cloudHealth: CloudHealthDiagnosticsDto?,
    shopCount: Int,
    paymentCount: Int,
    telemetryCount: Int,
    isLoading: Boolean,
    onRunDiagnostics: () -> Unit,
    onExportAdminCsv: () -> Unit,
    onExportExecutivePdf: () -> Unit
) {
    val dateFmt = remember { SimpleDateFormat("dd MMM yyyy HH:mm:ss", Locale.getDefault()) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
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
                        Icon(
                            Icons.Default.NetworkCheck,
                            contentDescription = "Cloud health",
                            tint = OrangePrimary,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text("Supabase Cloud & Schema Health", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Text(
                                cloudHealth?.let { "Checked ${dateFmt.format(Date(it.checkedAt))}" }
                                    ?: "Run live probe to verify PostgREST latency & tables",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Button(
                        onClick = onRunDiagnostics,
                        enabled = !isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                        modifier = Modifier.testTag("admin_run_cloud_probe_btn")
                    ) {
                        Icon(Icons.Default.HealthAndSafety, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Run Probe", fontSize = 12.sp)
                    }
                }

                if (cloudHealth != null) {
                    Surface(
                        color = if (cloudHealth.postgrestReachable) ProfitGreenLight else LossRedLight,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                if (cloudHealth.postgrestReachable) Icons.Default.CloudDone else Icons.Default.CloudOff,
                                contentDescription = null,
                                tint = if (cloudHealth.postgrestReachable) ProfitGreen else LossRed,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "${cloudHealth.summaryMessage} (${cloudHealth.latencyMs} ms)",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (cloudHealth.postgrestReachable) ProfitGreen else LossRed
                            )
                        }
                    }

                    SchemaStatusRow("PostgREST API Endpoint", cloudHealth.postgrestReachable)
                    SchemaStatusRow("Admin JWT Session Valid", cloudHealth.adminSessionValid)
                    SchemaStatusRow("Branch Snapshots v2 Schema", cloudHealth.snapshotSchemaReady)
                    SchemaStatusRow("Device Security Telemetry Table", cloudHealth.telemetryTableReady)
                    SchemaStatusRow("Cloud Branches Table", cloudHealth.branchesTableReady)
                    SchemaStatusRow("Stock Transfers Table", cloudHealth.transfersTableReady)
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Storage, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text("Executive Cloud Exports", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(
                            "$shopCount shops • $paymentCount payment claims • $telemetryCount telemetry records",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(
                        onClick = onExportAdminCsv,
                        modifier = Modifier.weight(1f).testTag("admin_export_csv_btn")
                    ) {
                        Icon(Icons.Default.TableChart, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Ledger CSV", fontSize = 12.sp)
                    }
                    Button(
                        onClick = onExportExecutivePdf,
                        colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                        modifier = Modifier.weight(1f).testTag("admin_export_pdf_btn")
                    ) {
                        Icon(Icons.Default.Description, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Executive PDF", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun SchemaStatusRow(label: String, ready: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface)
        Surface(
            color = if (ready) ProfitGreenLight else WarningAmberLight,
            shape = RoundedCornerShape(999.dp)
        ) {
            Text(
                if (ready) "READY" else "PENDING",
                color = if (ready) ProfitGreen else WarningAmber,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
            )
        }
    }
}

@Composable
private fun TelemetrySummaryPill(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.dp, color.copy(alpha = 0.3f))
    ) {
        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
            Text(value, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = color)
            Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
private fun TelemetryFlagChip(text: String, color: Color) {
    Surface(
        color = color.copy(alpha = 0.12f),
        shape = RoundedCornerShape(6.dp)
    ) {
        Text(
            text = text,
            color = color,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
        )
    }
}


@Composable
fun AdminCloudActivityTab(
    events: List<SupabaseCloudSyncEventDto>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    val filteredEvents = remember(events, searchQuery) {
        val query = searchQuery.trim()
        if (query.isBlank()) events else events.filter { event ->
            listOf(
                event.shopName, event.shopSyncKey, event.entity, event.action,
                event.actor, event.deviceId, event.detail
            ).any { it.contains(query, ignoreCase = true) }
        }
    }
    val distinctShops = events.map { it.shopSyncKey }.filter { it.isNotBlank() }.distinct().size
    val deviceEvents = events.count { it.deviceId.isNotBlank() }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Platform Activity", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(
                            "Auditable cloud events • ${events.size} loaded",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    OutlinedButton(onClick = onRefresh, enabled = !isLoading) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh activity", modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Refresh", fontSize = 11.sp)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    TelemetrySummaryPill(label = "Shops", value = distinctShops.toString(), color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                    TelemetrySummaryPill(label = "Device events", value = deviceEvents.toString(), color = OrangePrimary, modifier = Modifier.weight(1f))
                    TelemetrySummaryPill(label = "Loaded", value = events.size.toString(), color = ProfitGreen, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier.fillMaxWidth().testTag("admin_cloud_activity_search"),
                    label = { Text("Search activity") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp)
                )
            }
        }

        if (filteredEvents.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(Icons.Default.Security, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(30.dp))
                    Text(
                        if (isLoading) "Loading platform activity…" else if (searchQuery.isBlank()) "No cloud activity loaded" else "No matching activity",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp
                    )
                    Text(
                        if (searchQuery.isBlank()) "Device pairing, activation, synchronization, branch, staff and payment events appear here." else "Try a different shop, device, event or actor name.",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            filteredEvents.forEach { event ->
                val deviceType = when {
                    event.deviceId.startsWith("DESKTOP:", ignoreCase = true) -> "Desktop app"
                    event.deviceId.isNotBlank() -> "Android terminal"
                    event.actor.equals("SYSTEM", ignoreCase = true) -> "Cloud / system"
                    else -> "Admin / web"
                }
                val createdAt = runCatching {
                    val patterns = listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX")
                    patterns.firstNotNullOfOrNull { pattern ->
                        runCatching {
                            SimpleDateFormat(pattern, Locale.US).apply { isLenient = false }.parse(event.createdAt)
                        }.getOrNull()
                    }
                }.getOrNull()
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(13.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f))
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    event.shopName.ifBlank { event.shopSyncKey.ifBlank { "Platform event" } },
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    createdAt?.let { SimpleDateFormat("dd MMM yyyy • HH:mm:ss", Locale.getDefault()).format(it) }
                                        ?: event.createdAt.replace('T', ' ').take(19),
                                    fontSize = 10.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Surface(
                                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                                shape = RoundedCornerShape(999.dp)
                            ) {
                                Text(
                                    event.entity.ifBlank { "EVENT" },
                                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 9.sp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(event.action.ifBlank { "RECORDED" }, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = OrangePrimary)
                            Text("•", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(deviceType, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (event.deviceId.isNotBlank()) {
                            Text(event.deviceId, fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (event.detail.isNotBlank()) {
                            Text(event.detail, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface)
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Actor: ${event.actor.ifBlank { "SYSTEM" }}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("#${event.id}", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontFamily = FontFamily.Monospace)
                        }
                    }
                }
            }
        }

        if (events.size >= 200) {
            OutlinedButton(
                onClick = onLoadMore,
                enabled = !isLoading,
                modifier = Modifier.fillMaxWidth().testTag("admin_load_more_cloud_activity")
            ) {
                Text("Load more activity", fontSize = 12.sp)
            }
        }
    }
}
