package com.beboss.shopmgmt.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.beboss.shopmgmt.BuildConfig
import com.beboss.shopmgmt.data.model.DatabaseEngineStats
import com.beboss.shopmgmt.data.model.LocalAuditLog
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.ui.theme.WarningAmber
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.CapturedLocation
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.ClockTamperStatus
import com.beboss.shopmgmt.util.ConnectivityStatus
import com.beboss.shopmgmt.util.CryptoKeyManager
import com.beboss.shopmgmt.util.DeviceIntegrityStatus
import com.beboss.shopmgmt.util.DeviceSecurityManager
import com.beboss.shopmgmt.util.HlcClock
import com.beboss.shopmgmt.util.LocationHelper
import com.beboss.shopmgmt.util.MessageAuditManager
import com.beboss.shopmgmt.util.MessageDispatchRecord
import com.beboss.shopmgmt.util.PermissionManager
import com.beboss.shopmgmt.util.SyncAuditLog
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class UnifiedAuditEntry(
    val id: String,
    val timestamp: Long,
    val source: String, // "LOCAL" or "SYNC"
    val category: String,
    val badge: String,
    val message: String,
    val isAlert: Boolean
)

@Composable
fun DiagnosticsDialog(
    shopProfile: ShopProfile,
    databaseStats: DatabaseEngineStats?,
    deviceIntegrityStatus: DeviceIntegrityStatus?,
    connectivityStatus: ConnectivityStatus,
    pendingSyncCount: Int,
    deadLetterSyncCount: Int,
    isSyncing: Boolean,
    isOptimizingDb: Boolean,
    syncAuditLogs: List<SyncAuditLog>,
    localAuditLogs: List<LocalAuditLog>,
    adminLastSyncedAt: Long,
    language: AppLanguage = AppLanguage.ENGLISH,
    clockTamperStatus: ClockTamperStatus = ClockGuard.tamperStatus.value,
    capturedLocation: CapturedLocation = LocationHelper.lastLocation.value,
    messageRecords: List<MessageDispatchRecord> = MessageAuditManager.records.value,
    onVerifyDatabaseIntegrity: () -> Unit = {},
    onOptimizeDatabase: () -> Unit = {},
    onRefreshDatabaseStats: () -> Unit = {},
    onForceSyncNow: () -> Unit = {},
    onReInspectSecurity: () -> Unit = {},
    onCaptureLocation: () -> Unit = {},
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var selectedTab by remember { mutableIntStateOf(0) }
    var auditSearchQuery by remember { mutableStateOf("") }
    var auditFilter by remember { mutableStateOf("ALL") }

    val integrity = deviceIntegrityStatus ?: remember(clockTamperStatus) { DeviceSecurityManager.inspectDeviceIntegrity(context) }
    val keystoreStatus = remember { CryptoKeyManager.getHardwareKeystoreStatus() }
    val dateFormat = remember { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()) }
    val shortDateFormat = remember { SimpleDateFormat("MMM dd, HH:mm:ss", Locale.getDefault()) }
    val pinConfigured = BuildConfig.SUPABASE_CERT_PINS.contains("sha256/")

    val unifiedAuditEntries = remember(localAuditLogs, syncAuditLogs) {
        val local = localAuditLogs.map {
            UnifiedAuditEntry(
                id = "loc_${it.id}",
                timestamp = it.createdAt,
                source = "LOCAL",
                category = it.action,
                badge = "${it.actorName} (${it.actorRole})",
                message = it.details.ifBlank { it.action },
                isAlert = it.action.contains("LOCK", ignoreCase = true) ||
                    it.action.contains("CONFLICT", ignoreCase = true) ||
                    it.action.contains("FAIL", ignoreCase = true)
            )
        }
        val sync = syncAuditLogs.map {
            UnifiedAuditEntry(
                id = "sync_${it.id}",
                timestamp = it.timestamp,
                source = "SYNC",
                category = "${it.type} \u2022 ${it.status}",
                badge = if (it.latencyMs > 0) "${it.latencyMs} ms" else it.status,
                message = it.summary,
                isAlert = it.status.contains("ERROR", ignoreCase = true) ||
                    it.status.contains("DEAD", ignoreCase = true) ||
                    it.type.contains("DEAD", ignoreCase = true)
            )
        }
        (local + sync).sortedByDescending { it.timestamp }
    }

    val filteredAuditEntries = remember(unifiedAuditEntries, auditSearchQuery, auditFilter) {
        val q = auditSearchQuery.trim()
        unifiedAuditEntries.filter { entry ->
            val filterOk = auditFilter == "ALL" || entry.source == auditFilter
            val searchOk = q.isEmpty() ||
                entry.category.contains(q, ignoreCase = true) ||
                entry.message.contains(q, ignoreCase = true) ||
                entry.badge.contains(q, ignoreCase = true)
            filterOk && searchOk
        }
    }

    fun buildDiagnosticsTextReport(): String = buildString {
        appendLine("=== BEBOSS SECURITY & DIAGNOSTICS REPORT ===")
        appendLine("Shop: ${shopProfile.shopName.ifBlank { "Unregistered" }}")
        appendLine("Generated: ${dateFormat.format(Date())}")
        appendLine("Posture: ${integrity.postureLabel} (Risk Score: ${integrity.riskScore}/100)")
        appendLine("Hardware Keystore: $keystoreStatus")
        appendLine("TLS Cert Pinning: ${if (pinConfigured) "Active" else "Not configured"}")
        appendLine("ClockGuard Effective Now: ${dateFormat.format(Date(ClockGuard.effectiveNowMs()))}")
        appendLine("Clock Rollback / Tamper Lock: ${clockTamperStatus.rollbackDetected || clockTamperStatus.activeTamperLock} (Incidents: ${clockTamperStatus.incidentCount})")
        if (clockTamperStatus.reason.isNotBlank()) {
            appendLine("ClockGuard Reason: ${clockTamperStatus.reason}")
        }
        appendLine("Foreground GPS Location: ${capturedLocation.compactLabel()}")
        appendLine("Outbound Messages Logged: ${messageRecords.size} (Unsynced: ${messageRecords.count { !it.syncedToCloud }})")
        appendLine("Permissions: Camera=${PermissionManager.hasCameraPermission(context)}, Contacts=${PermissionManager.hasContactsPermission(context)}, Location=${PermissionManager.hasLocationPermission(context)}, Notifications=${PermissionManager.hasNotificationPermission(context)}")
        appendLine("Connectivity: $connectivityStatus")
        appendLine("Pending Outbox: $pendingSyncCount | Dead-Letter Queue: $deadLetterSyncCount")
        appendLine("DB Engine: SQLCipher AES-256 + ${databaseStats?.journalMode ?: "WAL"} | Status: ${databaseStats?.integrityStatus ?: "OK"}")
        appendLine("DB Size: ${databaseStats?.fileSizeFormatted ?: "Active"} | Total Records: ${databaseStats?.totalRecordsCount ?: 0}")
        appendLine("--- Recent Audit Entries (${filteredAuditEntries.size}) ---")
        filteredAuditEntries.take(25).forEach {
            appendLine("[${shortDateFormat.format(Date(it.timestamp))}] [${it.source}] ${it.category}: ${it.message}")
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .widthIn(max = 620.dp)
                .padding(vertical = 16.dp)
                .testTag("diagnostics_dialog"),
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(8.dp)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                        Surface(
                            shape = CircleShape,
                            color = OrangePrimary.copy(alpha = 0.14f),
                            modifier = Modifier.size(42.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = OrangePrimary)
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Security, DB & Sync Diagnostics",
                                fontWeight = FontWeight.Black,
                                fontSize = 17.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "Hardware Keystore \u2022 SQLCipher \u2022 HLC Audit Trail",
                                fontSize = 11.5.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .size(48.dp)
                            .testTag("diagnostics_close_btn")
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Close Diagnostics")
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                TabRow(
                    selectedTabIndex = selectedTab,
                    containerColor = Color.Transparent,
                    contentColor = OrangePrimary,
                    indicator = { tabPositions ->
                        TabRowDefaults.SecondaryIndicator(
                            modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
                            color = OrangePrimary
                        )
                    }
                ) {
                    Tab(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        text = { Text("Security", fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                        modifier = Modifier.testTag("diagnostics_tab_security")
                    )
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = { Text("DB & Sync", fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                        modifier = Modifier.testTag("diagnostics_tab_database")
                    )
                    Tab(
                        selected = selectedTab == 2,
                        onClick = { selectedTab = 2 },
                        text = { Text("Audit (${unifiedAuditEntries.size})", fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                        modifier = Modifier.testTag("diagnostics_tab_audit")
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false)
                ) {
                    when (selectedTab) {
                        0 -> SecurityPostureTab(
                            integrity = integrity,
                            clockTamperStatus = clockTamperStatus,
                            capturedLocation = capturedLocation,
                            messageRecords = messageRecords,
                            keystoreStatus = keystoreStatus,
                            pinConfigured = pinConfigured,
                            dateFormat = dateFormat,
                            onReInspectSecurity = onReInspectSecurity,
                            onCaptureLocation = onCaptureLocation,
                            onCopyReport = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("BeBoss Diagnostics", buildDiagnosticsTextReport()))
                                Toast.makeText(context, "Diagnostics report copied to clipboard!", Toast.LENGTH_SHORT).show()
                            },
                            onShareReport = {
                                val intent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_SUBJECT, "BeBoss Security & Sync Diagnostics")
                                    putExtra(Intent.EXTRA_TEXT, buildDiagnosticsTextReport())
                                }
                                context.startActivity(Intent.createChooser(intent, "Share Diagnostics Report"))
                            }
                        )

                        1 -> DatabaseSyncTab(
                            databaseStats = databaseStats,
                            connectivityStatus = connectivityStatus,
                            pendingSyncCount = pendingSyncCount,
                            deadLetterSyncCount = deadLetterSyncCount,
                            adminLastSyncedAt = adminLastSyncedAt,
                            isSyncing = isSyncing,
                            isOptimizingDb = isOptimizingDb,
                            shortDateFormat = shortDateFormat,
                            onRefreshDatabaseStats = onRefreshDatabaseStats,
                            onVerifyDatabaseIntegrity = onVerifyDatabaseIntegrity,
                            onOptimizeDatabase = onOptimizeDatabase,
                            onForceSyncNow = onForceSyncNow
                        )

                        2 -> AuditTrailTab(
                            searchQuery = auditSearchQuery,
                            onSearchQueryChange = { auditSearchQuery = it },
                            activeFilter = auditFilter,
                            onFilterChange = { auditFilter = it },
                            entries = filteredAuditEntries,
                            shortDateFormat = shortDateFormat
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SecurityPostureTab(
    integrity: DeviceIntegrityStatus,
    clockTamperStatus: ClockTamperStatus,
    capturedLocation: CapturedLocation,
    messageRecords: List<MessageDispatchRecord>,
    keystoreStatus: String,
    pinConfigured: Boolean,
    dateFormat: SimpleDateFormat,
    onReInspectSecurity: () -> Unit,
    onCaptureLocation: () -> Unit,
    onCopyReport: () -> Unit,
    onShareReport: () -> Unit
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()
    val tamperActive = clockTamperStatus.rollbackDetected || clockTamperStatus.activeTamperLock || integrity.clockRollbackDetected
    val hasRisk = integrity.isRooted || integrity.hasHookingFramework || tamperActive
    val statusColor = when {
        hasRisk -> LossRed
        integrity.isCompromisedRisk || integrity.isEmulator -> WarningAmber
        else -> ProfitGreen
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(scrollState),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = statusColor.copy(alpha = 0.11f),
            border = BorderStroke(1.dp, statusColor.copy(alpha = 0.45f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (hasRisk) Icons.Default.Warning else Icons.Default.Security,
                        contentDescription = null,
                        tint = statusColor,
                        modifier = Modifier.size(26.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = integrity.postureLabel,
                            fontWeight = FontWeight.Black,
                            fontSize = 13.5.sp,
                            color = statusColor
                        )
                        Text(
                            text = if (integrity.signals.isEmpty()) "No tampering, hooking, or root binaries detected."
                            else integrity.signals.joinToString(" • "),
                            fontSize = 11.5.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = statusColor.copy(alpha = 0.18f)
                    ) {
                        Text(
                            text = "Risk ${integrity.riskScore}/100",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            color = statusColor,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
                OutlinedButton(
                    onClick = onReInspectSecurity,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp)
                        .testTag("diagnostics_reinspect_shield_btn"),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, statusColor.copy(alpha = 0.5f))
                ) {
                    Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = statusColor, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Re-Inspect Anti-Tamper Shield (2s)", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = statusColor)
                }
            }
        }

        DiagnosticKeyValueRow("Hardware Keystore", keystoreStatus, ProfitGreen)
        DiagnosticKeyValueRow("Database Encryption", "SQLCipher AES-256-GCM + PBKDF2", ProfitGreen)
        DiagnosticKeyValueRow(
            "Supabase TLS Pinning",
            if (pinConfigured) "SHA-256 Certificate Pin Active" else "Standard System CA Trust",
            if (pinConfigured) ProfitGreen else WarningAmber
        )
        DiagnosticKeyValueRow(
            "ClockGuard Anti-Rollback",
            if (tamperActive) "TAMPER LOCK (${clockTamperStatus.incidentCount} incidents, skew ${integrity.clockSkewSeconds}s)"
            else "Monotonic Verified (${clockTamperStatus.incidentCount} incidents)",
            if (tamperActive) LossRed else ProfitGreen
        )
        DiagnosticKeyValueRow(
            "ClockGuard Effective Time",
            dateFormat.format(Date(ClockGuard.effectiveNowMs(context))),
            if (tamperActive) LossRed else MaterialTheme.colorScheme.onSurface
        )
        if (clockTamperStatus.lastTrustedServerMs > 0L) {
            DiagnosticKeyValueRow(
                "Last Server Time Anchor",
                dateFormat.format(Date(clockTamperStatus.lastTrustedServerMs)),
                Color(0xFF0284C7)
            )
        }
        val hlcNow = HlcClock.current()
        DiagnosticKeyValueRow(
            "HLC Logical Clock",
            "${HlcClock.physicalOf(hlcNow)}:#${HlcClock.logicalOf(hlcNow)}",
            DarkNavy
        )
        DiagnosticKeyValueRow(
            "Root / Hooking Checks",
            "Rooted: ${integrity.isRooted} • Hooking: ${integrity.hasHookingFramework}",
            if (hasRisk) LossRed else ProfitGreen
        )

        if (clockTamperStatus.recentIncidents.isNotEmpty()) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = LossRed.copy(alpha = 0.08f),
                border = BorderStroke(1.dp, LossRed.copy(alpha = 0.35f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Recent ClockGuard Tamper Incidents", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = LossRed)
                    clockTamperStatus.recentIncidents.take(4).forEach { incident ->
                        Text("• $incident", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }

        // Foreground Location Telemetry Card
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Branch Foreground Location Telemetry", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    text = if (capturedLocation.isAvailable) {
                        "${capturedLocation.compactLabel()} • ±${capturedLocation.accuracyMeters.toInt()}m (${capturedLocation.provider})"
                    } else {
                        "Location not captured yet. Grant foreground Location permission and tap Capture GPS."
                    },
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedButton(
                    onClick = onCaptureLocation,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp)
                        .testTag("diagnostics_capture_gps_btn"),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Capture GPS Coordinates Now", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Active Hardware & Permission Access Card
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Real Device Permission Accesses", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(
                    text = "Camera Scanner: ${if (PermissionManager.hasCameraPermission(context)) "GRANTED" else "NOT GRANTED"} • " +
                        "Contacts Picker: ${if (PermissionManager.hasContactsPermission(context)) "GRANTED" else "NOT GRANTED"}\n" +
                        "Foreground GPS: ${if (PermissionManager.hasLocationPermission(context)) "GRANTED" else "NOT GRANTED"} • " +
                        "Notifications: ${if (PermissionManager.hasNotificationPermission(context)) "GRANTED" else "NOT GRANTED"}",
                    fontSize = 11.sp,
                    lineHeight = 16.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Outbound Messages & WhatsApp Dispatch Audit
        val smsCount = messageRecords.count { it.channel == "SMS" }
        val waCount = messageRecords.count { it.channel == "WHATSAPP" }
        val cardCount = messageRecords.count { it.channel == "SHARE_CARD" }
        val unsyncedMsgs = messageRecords.count { !it.syncedToCloud }
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Outbound Message Dispatch Log (${messageRecords.size})",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "SMS: $smsCount • WhatsApp: $waCount • Branded Cards: $cardCount • Pending Cloud Sync: $unsyncedMsgs",
                    fontSize = 11.sp,
                    color = if (unsyncedMsgs > 0) OrangePrimary else ProfitGreen,
                    fontWeight = FontWeight.SemiBold
                )
                messageRecords.take(3).forEach { rec ->
                    Text(
                        text = "• [${rec.channel}/${rec.messageType}] ${rec.recipient}: ${rec.preview}",
                        fontSize = 10.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = onCopyReport,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Copy Report", fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }
            Button(
                onClick = onShareReport,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DarkNavy),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Share Report", fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun DatabaseSyncTab(
    databaseStats: DatabaseEngineStats?,
    connectivityStatus: ConnectivityStatus,
    pendingSyncCount: Int,
    deadLetterSyncCount: Int,
    adminLastSyncedAt: Long,
    isSyncing: Boolean,
    isOptimizingDb: Boolean,
    shortDateFormat: SimpleDateFormat,
    onRefreshDatabaseStats: () -> Unit,
    onVerifyDatabaseIntegrity: () -> Unit,
    onOptimizeDatabase: () -> Unit,
    onForceSyncNow: () -> Unit
) {
    val scrollState = rememberScrollState()
    val isOnline = connectivityStatus == ConnectivityStatus.AVAILABLE

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(scrollState),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (isOnline) Icons.Default.CloudDone else Icons.Default.CloudOff,
                        contentDescription = null,
                        tint = if (isOnline) ProfitGreen else WarningAmber,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isOnline) "Internet available • Sync queue status below" else "Offline • Pending changes remain queued",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
                Text(
                    text = "Pending Outbox: $pendingSyncCount   \u2022   Dead-Letter Queue: $deadLetterSyncCount",
                    fontSize = 12.sp,
                    color = if (deadLetterSyncCount > 0) LossRed else MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (adminLastSyncedAt > 0L) {
                    Text(
                        text = "Last Cloud Admin Poll: ${shortDateFormat.format(Date(adminLastSyncedAt))}",
                        fontSize = 11.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        DiagnosticKeyValueRow(
            "SQLite File & Journal",
            "${databaseStats?.fileSizeFormatted ?: "Active"} \u2022 ${databaseStats?.journalMode ?: "WAL"} (${databaseStats?.pageSize ?: 4096}B pages)",
            Color(0xFF0284C7)
        )
        DiagnosticKeyValueRow(
            "B-Tree Integrity",
            databaseStats?.integrityStatus ?: "OK",
            if (databaseStats?.integrityStatus == "OK" || databaseStats == null) ProfitGreen else LossRed
        )
        DiagnosticKeyValueRow(
            "Total Records Indexed",
            "${databaseStats?.totalRecordsCount ?: 0} rows across 9 tables",
            MaterialTheme.colorScheme.onSurface
        )

        if (databaseStats != null) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Products: ${databaseStats.productCount} \u2022 Sales: ${databaseStats.salesCount} \u2022 Line Items: ${databaseStats.saleItemsCount}\n" +
                        "Customers: ${databaseStats.customerCount} \u2022 Payments: ${databaseStats.paymentsCount} \u2022 Purchases: ${databaseStats.purchasesCount}\n" +
                        "Branches: ${databaseStats.branchesCount} \u2022 Staff: ${databaseStats.usersCount} \u2022 Pages: ${databaseStats.pageCount}",
                    fontSize = 11.5.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(10.dp),
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = onRefreshDatabaseStats,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Refresh Stats", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = onVerifyDatabaseIntegrity,
                enabled = !isOptimizingDb,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("diagnostics_verify_db_btn"),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("PRAGMA Check", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = onOptimizeDatabase,
                enabled = !isOptimizingDb,
                colors = ButtonDefaults.buttonColors(containerColor = DarkNavy),
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Speed, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(if (isOptimizingDb) "Optimizing..." else "WAL Checkpoint", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = onForceSyncNow,
                enabled = !isSyncing,
                colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("diagnostics_force_sync_btn"),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(if (isSyncing) "Syncing..." else "Sync Cloud Now", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun AuditTrailTab(
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    activeFilter: String,
    onFilterChange: (String) -> Unit,
    entries: List<UnifiedAuditEntry>,
    shortDateFormat: SimpleDateFormat
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 460.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchQueryChange,
            placeholder = { Text("Filter audit events, actors, conflicts...", fontSize = 12.sp) },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            singleLine = true,
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("ALL" to "All", "LOCAL" to "Local Security", "SYNC" to "Cloud Sync").forEach { (key, label) ->
                FilterChip(
                    selected = activeFilter == key,
                    onClick = { onFilterChange(key) },
                    label = { Text(label, fontSize = 11.5.sp, fontWeight = FontWeight.Bold) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = OrangePrimary,
                        selectedLabelColor = Color.White
                    )
                )
            }
        }

        if (entries.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 28.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No audit events recorded matching your filter.",
                    fontSize = 12.5.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(entries, key = { it.id }) { entry ->
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        border = BorderStroke(
                            1.dp,
                            if (entry.isAlert) LossRed.copy(alpha = 0.4f) else MaterialTheme.colorScheme.outlineVariant
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${entry.source} \u2022 ${entry.category}",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Black,
                                    color = if (entry.isAlert) LossRed else if (entry.source == "SYNC") Color(0xFF0284C7) else ProfitGreen
                                )
                                Text(
                                    text = shortDateFormat.format(Date(entry.timestamp)),
                                    fontSize = 10.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(
                                text = entry.message,
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = entry.badge,
                                fontSize = 10.5.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagnosticKeyValueRow(
    label: String,
    value: String,
    valueColor: Color
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 9.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = label,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(0.45f)
            )
            Text(
                text = value,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = valueColor,
                modifier = Modifier.weight(0.55f)
            )
        }
    }
}
