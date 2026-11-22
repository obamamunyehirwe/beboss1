package com.beboss.shopmgmt.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import com.beboss.shopmgmt.BuildConfig
import com.beboss.shopmgmt.data.model.LocalAuditLog
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.ui.theme.WarningAmber
import com.beboss.shopmgmt.util.AdminPaymentConfig
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.CryptoKeyManager
import com.beboss.shopmgmt.util.DeviceSecurityManager
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.OfflineSubscriptionManager
import com.beboss.shopmgmt.util.PdfReportGenerator
import com.beboss.shopmgmt.util.SubscriptionSecurityManager
import com.beboss.shopmgmt.util.SupabaseAdminClient
import com.beboss.shopmgmt.util.SupabaseAdminSession
import com.beboss.shopmgmt.util.SupabaseAuditLogDto
import com.beboss.shopmgmt.util.SupabaseBranchSnapshotDto
import com.beboss.shopmgmt.util.SupabasePaymentRequestDto
import com.beboss.shopmgmt.util.SupabaseShopAccountDto
import com.beboss.shopmgmt.util.SupabaseShopDeviceDto
import com.beboss.shopmgmt.util.SupabaseShopUserDto
import com.beboss.shopmgmt.util.SupabaseUnlockCodeDto
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun AdminVerificationConsoleDialog(
    shopProfile: ShopProfile,
    adminSession: SupabaseAdminSession?,
    adminAuthError: String?,
    isAdminAuthenticating: Boolean,
    paymentRequests: List<SupabasePaymentRequestDto>,
    shopAccounts: List<SupabaseShopAccountDto>,
    shopUsers: List<SupabaseShopUserDto> = emptyList(),
    shopDevices: List<SupabaseShopDeviceDto> = emptyList(),
    branchSnapshots: List<SupabaseBranchSnapshotDto> = emptyList(),
    unlockCodes: List<SupabaseUnlockCodeDto>,
    auditLogs: List<SupabaseAuditLogDto>,
    localAuditLogs: List<LocalAuditLog> = emptyList(),
    paymentConfig: AdminPaymentConfig = OfflineSubscriptionManager.getCurrentPaymentConfig(),
    isLoading: Boolean,
    language: AppLanguage = AppLanguage.ENGLISH,
    lastSyncedAt: Long = 0L,
    onSignInAdmin: (email: String, password: String) -> Unit,
    onSignUpAdmin: (email: String, password: String, fullName: String) -> Unit,
    onSignOutAdmin: () -> Unit,
    onRefresh: () -> Unit,
    onApprovePayment: (SupabasePaymentRequestDto, (Boolean, String) -> Unit) -> Unit,
    onSavePaymentConfig: (AdminPaymentConfig, (Boolean) -> Unit) -> Unit = { _, _ -> },
    onToggleShopDeviceActive: (SupabaseShopDeviceDto, Boolean) -> Unit = { _, _ -> },
    onDeleteShopDevice: (SupabaseShopDeviceDto) -> Unit = {},
    onRejectPayment: (SupabasePaymentRequestDto, String) -> Unit,
    onRevokeCode: (SupabaseUnlockCodeDto) -> Unit,
    onExtendShopSubscription: (SupabaseShopAccountDto, Int) -> Unit = { _, _ -> },
    onResetShopTrial: (SupabaseShopAccountDto) -> Unit = {},
    onSetShopStatus: (SupabaseShopAccountDto, String) -> Unit = { _, _ -> },
    onUpdateShopLimits: (SupabaseShopAccountDto, Int, Int, Int) -> Unit = { _, _, _, _ -> },
    onDeleteShopAccount: (SupabaseShopAccountDto) -> Unit = {},
    onUpdateShopUserRole: (SupabaseShopUserDto, String) -> Unit = { _, _ -> },
    onToggleShopUserActive: (SupabaseShopUserDto, Boolean) -> Unit = { _, _ -> },
    onDeleteShopUser: (SupabaseShopUserDto) -> Unit = {},
    onDeleteBranchSnapshot: (SupabaseBranchSnapshotDto) -> Unit = {},
    onShareWebPortal: () -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var selectedTab by remember { mutableIntStateOf(0) }
    var lastGeneratedCode by remember { mutableStateOf<String?>(null) }
    var lastTargetPhone by remember { mutableStateOf("") }
    var lastTargetUsername by remember { mutableStateOf("") }
    var lastTargetAmount by remember { mutableIntStateOf(0) }
    var lastTargetDays by remember { mutableIntStateOf(30) }

    // Single Master Admin Auth Form State (Email locked strictly to MASTER_ADMIN_EMAIL)
    var adminEmail by remember { mutableStateOf(SupabaseAdminClient.getDefaultAdminEmail()) }
    var adminPassword by remember { mutableStateOf("") }
    var showAdminPassword by remember { mutableStateOf(false) }

    // Queue, Users, Devices, Shops, Codes, Audit Filters
    var queueStatusFilter by remember { mutableStateOf("ALL") }
    var queueSearchQuery by remember { mutableStateOf("") }
    var userSearchQuery by remember { mutableStateOf("") }
    var deviceSearchQuery by remember { mutableStateOf("") }
    var shopSearchQuery by remember { mutableStateOf("") }
    var shopStatusFilter by remember { mutableStateOf("ALL") }
    var codeSearchQuery by remember { mutableStateOf("") }
    var codeStatusFilter by remember { mutableStateOf("ALL") }
    var auditSubTab by remember { mutableIntStateOf(0) } // 0 = Cloud, 1 = Local Security, 2 = Security Diagnostics

    // Reject Modal State
    var requestToReject by remember { mutableStateOf<SupabasePaymentRequestDto?>(null) }
    var rejectReasonInput by remember { mutableStateOf("Payment could not be confirmed in the provider statement") }

    // Manual Generator Form State
    var manualUsername by remember { mutableStateOf("") }
    var manualPhone by remember { mutableStateOf("") }
    var manualTier by remember { mutableStateOf("SINGLE") }
    var manualDaysText by remember { mutableStateOf("30") }
    var manualAmountText by remember { mutableStateOf("5000") }

    val dateFormatter = remember { SimpleDateFormat("dd MMM HH:mm", Locale.getDefault()) }
    val syncTimeFormatter = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .widthIn(max = 840.dp)
                .padding(vertical = 12.dp),
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(
                modifier = Modifier
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState())
            ) {
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
                            modifier = Modifier.size(40.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.AdminPanelSettings,
                                    contentDescription = null,
                                    tint = OrangePrimary,
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = Localization.get("admin_console_title", language),
                                fontWeight = FontWeight.Black,
                                fontSize = 15.5.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = if (adminSession != null) {
                                    Localization.format("admin_session_fmt", language, adminSession.email)
                                } else {
                                    Localization.get("admin_role_verified", language)
                                },
                                fontSize = 11.sp,
                                color = if (adminSession != null) ProfitGreen else OrangePrimary,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Default.Close, contentDescription = Localization.get("close", language))
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                if (adminSession == null) {
                    // Password-only master admin gate. First-time setup is invitation-only
                    // through the secure web bootstrap flow; the Android app never self-registers.
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = Localization.get("admin_signin_help", language),
                                fontSize = 11.5.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            OutlinedTextField(
                                value = adminEmail,
                                onValueChange = { adminEmail = it },
                                label = { Text(Localization.get("admin_email_label", language)) },
                                leadingIcon = { Icon(Icons.Default.Email, contentDescription = null, tint = OrangePrimary) },
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("admin_email_input"),
                                shape = RoundedCornerShape(12.dp)
                            )

                            OutlinedTextField(
                                value = adminPassword,
                                onValueChange = { adminPassword = it },
                                label = { Text(Localization.get("admin_password_label", language)) },
                                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = OrangePrimary) },
                                trailingIcon = {
                                    IconButton(onClick = { showAdminPassword = !showAdminPassword }) {
                                        Icon(
                                            imageVector = if (showAdminPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = Localization.get("admin_toggle_password_cd", language)
                                        )
                                    }
                                },
                                visualTransformation = if (showAdminPassword) VisualTransformation.None else PasswordVisualTransformation(),
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("admin_password_input"),
                                shape = RoundedCornerShape(12.dp)
                            )

                            if (!adminAuthError.isNullOrBlank()) {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = LossRed.copy(alpha = 0.14f),
                                    border = BorderStroke(1.dp, LossRed.copy(alpha = 0.4f)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = adminAuthError,
                                        color = LossRed,
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(10.dp)
                                    )
                                }
                            }

                            Button(
                                onClick = { onSignInAdmin(adminEmail.trim(), adminPassword) },
                                enabled = !isAdminAuthenticating && adminPassword.length >= 6,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .testTag("admin_auth_submit_btn"),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary)
                            ) {
                                if (isAdminAuthenticating) {
                                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(Localization.get("admin_authenticating", language), fontWeight = FontWeight.Bold)
                                } else {
                                    Icon(Icons.Default.VerifiedUser, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(Localization.get("admin_signin_button", language), fontWeight = FontWeight.Bold)
                                }
                            }

                            OutlinedButton(
                                onClick = onShareWebPortal,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .testTag("admin_export_portal_unauth_btn"),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(Icons.Default.Public, contentDescription = null, modifier = Modifier.size(16.dp), tint = OrangePrimary)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(Localization.get("admin_export_portal", language), fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = OrangePrimary)
                            }
                        }
                    }
                } else {
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = onRefresh,
                            enabled = !isLoading,
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 48.dp)
                                .testTag("admin_sync_supabase_btn")
                        ) {
                            if (isLoading) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Sync All", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                        }

                        Button(
                            onClick = onShareWebPortal,
                            modifier = Modifier
                                .weight(1.2f)
                                .heightIn(min = 48.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary)
                        ) {
                            Icon(Icons.Default.Public, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Web Portal", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = onSignOutAdmin,
                            modifier = Modifier
                                .heightIn(min = 48.dp)
                                .testTag("admin_signout_btn")
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sign out admin", tint = LossRed, modifier = Modifier.size(16.dp))
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    val nowMs = ClockGuard.effectiveNowMs()
                    val pendingCount = paymentRequests.count { it.status == "PENDING_VERIFICATION" }
                    val pendingTotalRwf = paymentRequests
                        .filter { it.status == "PENDING_VERIFICATION" }
                        .sumOf { it.amountRwf }
                    val paidActiveShops = shopAccounts.filter {
                        it.subscriptionStatus == ShopProfile.STATUS_ACTIVE && it.subscriptionExpiresAt > nowMs
                    }
                    val activeTrialShopsCount = shopAccounts.count {
                        it.subscriptionStatus == ShopProfile.STATUS_TRIAL && it.subscriptionExpiresAt > nowMs
                    }
                    val lockedShopsCount = shopAccounts.count {
                        it.subscriptionStatus == ShopProfile.STATUS_SUSPENDED ||
                            it.subscriptionStatus == ShopProfile.STATUS_EXPIRED ||
                            it.subscriptionExpiresAt <= nowMs
                    }
                    val monthlyMrrRwf = paidActiveShops.sumOf { it.monthlyFeeRwf }

                    // Master Admin KPI Summary Strip (Row 1: Revenue & Queue)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AdminKpiCard(
                            label = Localization.get("admin_kpi_pending", language),
                            value = "$pendingCount",
                            accent = if (pendingCount > 0) WarningAmber else ProfitGreen,
                            modifier = Modifier.weight(1f)
                        )
                        AdminKpiCard(
                            label = Localization.get("admin_kpi_queue_rwf", language),
                            value = "${pendingTotalRwf / 1000}k",
                            accent = OrangePrimary,
                            modifier = Modifier.weight(1f)
                        )
                        AdminKpiCard(
                            label = Localization.get("admin_kpi_paid_active", language),
                            value = "${paidActiveShops.size}",
                            accent = ProfitGreen,
                            modifier = Modifier.weight(1f)
                        )
                        AdminKpiCard(
                            label = Localization.get("admin_kpi_mrr", language),
                            value = "${monthlyMrrRwf / 1000}k",
                            accent = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // Row 2: Trials, Locked Terminals, Unlock Codes
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AdminKpiCard(
                            label = Localization.get("admin_kpi_trials", language),
                            value = "$activeTrialShopsCount",
                            accent = Color(0xFF0284C7),
                            modifier = Modifier.weight(1f)
                        )
                        AdminKpiCard(
                            label = Localization.get("admin_kpi_locked", language),
                            value = "$lockedShopsCount",
                            accent = if (lockedShopsCount > 0) LossRed else ProfitGreen,
                            modifier = Modifier.weight(1f)
                        )
                        AdminKpiCard(
                            label = Localization.get("admin_kpi_bb3_issued", language),
                            value = "${unlockCodes.size}",
                            accent = OrangePrimary,
                            modifier = Modifier.weight(1f)
                        )
                    }

                    if (lastSyncedAt > 0L) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = ProfitGreen.copy(alpha = 0.1f),
                            border = BorderStroke(1.dp, ProfitGreen.copy(alpha = 0.35f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Icon(Icons.Default.CloudSync, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(14.dp))
                                    Text(
                                        text = "Live Supabase Sync Ã¢â‚¬Â¢ ${syncTimeFormatter.format(Date(lastSyncedAt))}",
                                        fontSize = 10.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = ProfitGreen
                                    )
                                }
                                Text(
                                    text = "${shopAccounts.size} shops Ã¢â‚¬Â¢ ${shopDevices.size} dev Ã¢â‚¬Â¢ ${shopUsers.size} users",
                                    fontSize = 10.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    ScrollableTabRow(
                        selectedTabIndex = selectedTab,
                        containerColor = Color.Transparent,
                        contentColor = OrangePrimary,
                        edgePadding = 0.dp
                    ) {
                        Tab(
                            selected = selectedTab == 0,
                            onClick = { selectedTab = 0 },
                            text = { Text("${Localization.get("admin_tab_queue", language)} ($pendingCount/${paymentRequests.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                        )
                        Tab(
                            selected = selectedTab == 1,
                            onClick = { selectedTab = 1 },
                            text = { Text("${Localization.get("admin_tab_users", language)} (${shopUsers.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                        )
                        Tab(
                            selected = selectedTab == 2,
                            onClick = { selectedTab = 2 },
                            text = { Text("${Localization.get("admin_tab_shops", language)} (${shopAccounts.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                        )
                        Tab(
                            selected = selectedTab == 3,
                            onClick = { selectedTab = 3 },
                            text = { Text(Localization.get("admin_tab_issue", language), fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                        )
                        Tab(
                            selected = selectedTab == 4,
                            onClick = { selectedTab = 4 },
                            text = { Text("${Localization.get("admin_tab_codes", language)} (${unlockCodes.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                        )
                        Tab(
                            selected = selectedTab == 5,
                            onClick = { selectedTab = 5 },
                            text = { Text("${Localization.get("admin_tab_branches", language)} (${branchSnapshots.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                        )
                        Tab(
                            selected = selectedTab == 6,
                            onClick = { selectedTab = 6 },
                            text = { Text("${Localization.get("admin_tab_audit", language)} (${auditLogs.size + localAuditLogs.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                        )
                        Tab(
                            selected = selectedTab == 7,
                            onClick = { selectedTab = 7 },
                            modifier = Modifier.testTag("admin_tab_devices"),
                            text = { Text("${Localization.get("admin_tab_devices", language)} (${shopDevices.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                        )
                        Tab(
                            selected = selectedTab == 8,
                            onClick = { selectedTab = 8 },
                            modifier = Modifier.testTag("admin_tab_pay_config"),
                            text = { Text(Localization.get("admin_tab_pay_config", language), fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    if (lastGeneratedCode != null) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = ProfitGreen.copy(alpha = 0.1f),
                            border = BorderStroke(1.dp, ProfitGreen.copy(alpha = 0.5f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("${Localization.get("admin_kpi_bb3_issued", language)} (@$lastTargetUsername)", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ProfitGreen)
                                Text(
                                    text = lastGeneratedCode!!,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Black,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(
                                        onClick = {
                                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                            clipboard.setPrimaryClip(ClipData.newPlainText("BeBoss Unlock Code", lastGeneratedCode!!))
                                            Toast.makeText(context, "Unlock code copied!", Toast.LENGTH_SHORT).show()
                                        },
                                        modifier = Modifier
                                            .weight(1f)
                                            .heightIn(min = 48.dp)
                                    ) {
                                        Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(15.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Copy Code", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }

                                    Button(
                                        onClick = {
                                            val msg = OfflineSubscriptionManager.buildAdminUnlockReplyWhatsAppMessage(
                                                shopName = shopProfile.shopName.ifBlank { "BeBoss Shop" },
                                                username = lastTargetUsername,
                                                unlockCode = lastGeneratedCode!!,
                                                daysAdded = lastTargetDays,
                                                tierName = "$manualTier ($lastTargetAmount FRw)"
                                            )
                                            PdfReportGenerator.sendWhatsAppDirect(context, lastTargetPhone, msg)
                                        },
                                        modifier = Modifier
                                            .weight(1f)
                                            .heightIn(min = 48.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen)
                                    ) {
                                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(15.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("WhatsApp", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                    }

                    when (selectedTab) {
                        0 -> {
                            // Payment Verification Queue with Filters & Batch Approve
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = queueSearchQuery,
                                    onValueChange = { queueSearchQuery = it },
                                    label = { Text(Localization.get("admin_queue_search", language)) },
                                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                                    singleLine = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("admin_queue_search_input"),
                                    shape = RoundedCornerShape(12.dp)
                                )

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    listOf(
                                        "ALL" to "admin_filter_all",
                                        "PENDING_VERIFICATION" to "admin_filter_pending",
                                        "APPROVED" to "admin_filter_approved",
                                        "REJECTED" to "admin_filter_rejected"
                                    ).forEach { (statusKey, label) ->
                                        val selected = queueStatusFilter == statusKey
                                        OutlinedButton(
                                            onClick = { queueStatusFilter = statusKey },
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 42.dp),
                                            contentPadding = PaddingValues(horizontal = 4.dp),
                                            colors = ButtonDefaults.outlinedButtonColors(
                                                containerColor = if (selected) OrangePrimary.copy(alpha = 0.16f) else Color.Transparent
                                            )
                                        ) {
                                            Text(
                                                text = Localization.get(label, language),
                                                fontSize = 10.5.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (selected) OrangePrimary else MaterialTheme.colorScheme.onSurface
                                            )
                                        }
                                    }
                                }

                            }

                            Spacer(modifier = Modifier.height(6.dp))

                            val filteredQueue = paymentRequests.filter { req ->
                                val statusMatch = queueStatusFilter == "ALL" || req.status == queueStatusFilter
                                val q = queueSearchQuery.trim().lowercase(Locale.ROOT)
                                val searchMatch = q.isBlank() ||
                                    req.shopName.lowercase(Locale.ROOT).contains(q) ||
                                    req.ownerUsername.lowercase(Locale.ROOT).contains(q) ||
                                    req.ownerPhone.contains(q) ||
                                    req.payerPhone.contains(q) ||
                                    req.payerFullName.lowercase(Locale.ROOT).contains(q) ||
                                    req.paymentNote.lowercase(Locale.ROOT).contains(q)
                                statusMatch && searchMatch
                            }

                            if (filteredQueue.isEmpty()) {
                                Text(
                                    text = Localization.get("admin_queue_empty", language),
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(8.dp)
                                )
                            } else {
                                filteredQueue.forEach { req ->
                                    val hasCodeIssued = req.status == "APPROVED" && req.generatedUnlockCode.isNotBlank()
                                    val isDirectUnlocked = req.status == "APPROVED" && req.approvalMode == "DIRECT_AUTO_UNLOCK"
                                    val isApprovedAny = req.status == "APPROVED"
                                    val isRejected = req.status == "REJECTED"
                                    val ussdLabel = if (req.ussdCode == "MANUAL_WHATSAPP_PROOF") Localization.get("admin_manual_proof", language) else req.ussdCode.ifBlank { "Manual" }
                                    val effectiveDevices = req.deviceCount.coerceAtLeast(1)
                                    val expectedFee = OfflineSubscriptionManager.calculateSubscriptionPrice(
                                        branchCount = req.branchCount.coerceAtLeast(1),
                                        workerCount = req.workerCount.coerceAtLeast(1),
                                        durationMonths = req.durationMonths.coerceAtLeast(1),
                                        deviceCount = effectiveDevices
                                    ).totalPayable
                                    val feeOk = req.amountRwf == expectedFee
                                    val reqPhoneLast9 = SubscriptionSecurityManager.normalizePhoneLast9(req.ownerPhone)
                                    val matchedShop = shopAccounts.firstOrNull { acc ->
                                        acc.ownerUsername.equals(req.ownerUsername, ignoreCase = true) &&
                                            reqPhoneLast9.isNotBlank() &&
                                            SubscriptionSecurityManager.normalizePhoneLast9(acc.ownerPhone) == reqPhoneLast9
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                        border = BorderStroke(
                                            1.dp,
                                            when {
                                                isApprovedAny -> ProfitGreen.copy(alpha = 0.45f)
                                                isRejected -> LossRed.copy(alpha = 0.45f)
                                                else -> OrangePrimary.copy(alpha = 0.4f)
                                            }
                                        ),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 4.dp)
                                    ) {
                                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(req.shopName, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                                    Surface(
                                                        shape = RoundedCornerShape(6.dp),
                                                        color = if (feeOk) ProfitGreen.copy(alpha = 0.14f) else WarningAmber.copy(alpha = 0.16f)
                                                    ) {
                                                        Text(
                                                            text = if (feeOk) Localization.get("admin_fee_ok", language) else Localization.format("admin_fee_check_fmt", language, expectedFee),
                                                            fontSize = 9.5.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = if (feeOk) ProfitGreen else WarningAmber,
                                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                        )
                                                    }
                                                    Text(
                                                        text = if (isDirectUnlocked) Localization.get("admin_status_auto_unlocked", language) else when (req.status) { "PENDING_VERIFICATION" -> Localization.get("admin_filter_pending", language); "APPROVED" -> Localization.get("admin_filter_approved", language); "REJECTED" -> Localization.get("admin_filter_rejected", language); else -> req.status },
                                                        fontSize = 10.sp,
                                                        fontWeight = FontWeight.Black,
                                                        color = when {
                                                            isApprovedAny -> ProfitGreen
                                                            isRejected -> LossRed
                                                            else -> OrangePrimary
                                                        }
                                                    )
                                                }
                                            }

                                            Text(
                                                text = Localization.format("admin_account_phone_fmt", language, req.ownerUsername, req.ownerPhone),
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            Text(
                                                text = Localization.format("admin_sender_fmt", language, req.payerFullName.ifBlank { "Not specified" }, req.payerPhone),
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = OrangePrimary
                                            )
                                            Text(
                                                text = Localization.format("admin_plan_fmt", language, req.provider, req.amountRwf, req.durationMonths * 30, req.branchCount, req.workerCount, effectiveDevices),
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                            Text(
                                                text = "$ussdLabel • ${SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault()).format(Date(req.paymentTimeMs.takeIf { it > 0L } ?: req.createdAt))}",
                                                fontSize = 10.5.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )

                                            // Matching System Account Inspector (Compare WhatsApp Proof vs Cloud Shop Account)
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = if (matchedShop != null) ProfitGreen.copy(alpha = 0.08f) else WarningAmber.copy(alpha = 0.10f),
                                                border = BorderStroke(1.dp, (if (matchedShop != null) ProfitGreen else WarningAmber).copy(alpha = 0.35f)),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                if (matchedShop != null) {
                                                    val matchedDays = ((matchedShop.subscriptionExpiresAt - nowMs).coerceAtLeast(0L) / 86_400_000L).toInt()
                                                    Column(modifier = Modifier.padding(8.dp)) {
                                                        Text(
                                                            text = Localization.format("admin_matched_shop_fmt", language, matchedShop.shopName, matchedShop.ownerName, matchedShop.ownerUsername),
                                                            fontSize = 10.5.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = ProfitGreen
                                                        )
                                                        Text(
                                                            text = Localization.format("admin_matched_status_fmt", language, matchedShop.subscriptionStatus, matchedDays, matchedShop.branchCount, matchedShop.workerCount, matchedShop.deviceLimit, matchedShop.monthlyFeeRwf),
                                                            fontSize = 10.sp,
                                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                                        )
                                                    }
                                                } else {
                                                    Text(
                                                        text = Localization.format("admin_no_matching_shop_fmt", language, req.ownerUsername, req.ownerPhone),
                                                        fontSize = 10.sp,
                                                        color = WarningAmber,
                                                        fontWeight = FontWeight.Medium,
                                                        modifier = Modifier.padding(8.dp)
                                                    )
                                                }
                                            }

                                            if (hasCodeIssued) {
                                                Text(
                                                    text = Localization.format("admin_code_fmt", language, req.generatedUnlockCode),
                                                    fontFamily = FontFamily.Monospace,
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = ProfitGreen
                                                )
                                            } else if (isDirectUnlocked) {
                                                Text(
                                                    text = Localization.get("admin_direct_unlocked_note", language),
                                                    fontSize = 10.5.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = ProfitGreen
                                                )
                                            } else if (isRejected && req.rejectionReason.isNotBlank()) {
                                                Text(
                                                    text = Localization.format("admin_rejected_fmt", language, req.rejectionReason),
                                                    fontSize = 11.sp,
                                                    color = LossRed,
                                                    fontWeight = FontWeight.Medium
                                                )
                                            }

                                            Spacer(modifier = Modifier.height(4.dp))
                                            // Option 1: Issue a server-signed BB3 code (+ WhatsApp reply button if issued)
                                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                                Button(
                                                    onClick = {
                                                        onApprovePayment(req) { _, code ->
                                                            lastGeneratedCode = code
                                                            lastTargetUsername = req.ownerUsername
                                                            lastTargetPhone = req.ownerPhone
                                                            lastTargetAmount = req.amountRwf
                                                            lastTargetDays = req.durationMonths * 30
                                                        }
                                                    },
                                                    modifier = Modifier
                                                        .weight(1.3f)
                                                        .heightIn(min = 48.dp)
                                                        .testTag("admin_issue_bb3_btn_${req.id}"),
                                                    enabled = matchedShop != null && feeOk,
                                                    colors = ButtonDefaults.buttonColors(containerColor = if (hasCodeIssued) DarkNavy else ProfitGreen)
                                                ) {
                                                    Icon(Icons.Default.Key, contentDescription = null, modifier = Modifier.size(15.dp))
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text(
                                                        text = if (hasCodeIssued) Localization.get("admin_resend_bb3", language) else Localization.get("admin_verify_issue_bb3", language),
                                                        fontSize = 10.5.sp,
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                }

                                                if (hasCodeIssued) {
                                                    IconButton(
                                                        onClick = {
                                                            val msg = OfflineSubscriptionManager.buildAdminUnlockReplyWhatsAppMessage(
                                                                shopName = req.shopName,
                                                                username = req.ownerUsername,
                                                                unlockCode = req.generatedUnlockCode,
                                                                daysAdded = req.durationMonths * 30,
                                                                tierName = "${req.branchCount}br/${req.workerCount}stf/$effectiveDevices dev (${req.amountRwf} FRw)"
                                                            )
                                                            PdfReportGenerator.sendWhatsAppDirect(context, req.ownerPhone, msg)
                                                        },
                                                        modifier = Modifier.size(48.dp)
                                                    ) {
                                                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = Localization.get("admin_send_bb3_whatsapp", language), tint = ProfitGreen)
                                                    }
                                                }

                                                if (!isApprovedAny && !isRejected) {
                                                    OutlinedButton(
                                                        onClick = {
                                                            requestToReject = req
                                                            rejectReasonInput = Localization.get("admin_default_reject_reason", language)
                                                        },
                                                        modifier = Modifier
                                                            .weight(0.9f)
                                                            .heightIn(min = 48.dp),
                                                        contentPadding = PaddingValues(horizontal = 4.dp),
                                                        border = BorderStroke(1.dp, LossRed.copy(alpha = 0.6f))
                                                    ) {
                                                        Text(Localization.get("admin_reject", language), fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = LossRed)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        1 -> {
                            // ALL SHOP USERS DIRECTORY & ROLE / ACCESS MANAGEMENT
                            OutlinedTextField(
                                value = userSearchQuery,
                                onValueChange = { userSearchQuery = it },
                                label = { Text("Search users by name, @username, shop or role") },
                                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp)
                                    .testTag("admin_user_search_input"),
                                shape = RoundedCornerShape(12.dp)
                            )

                            val filteredUsers = shopUsers.filter { u ->
                                val q = userSearchQuery.trim().lowercase(Locale.ROOT)
                                q.isBlank() ||
                                    u.fullName.lowercase(Locale.ROOT).contains(q) ||
                                    u.username.lowercase(Locale.ROOT).contains(q) ||
                                    u.shopName.lowercase(Locale.ROOT).contains(q) ||
                                    u.role.lowercase(Locale.ROOT).contains(q) ||
                                    u.phone.contains(q)
                            }

                            if (filteredUsers.isEmpty()) {
                                Text(
                                    text = "No users synced yet. Shops automatically upload staff profiles (without passwords) when syncing online.",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(8.dp)
                                )
                            } else {
                                filteredUsers.forEach { u ->
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                        border = BorderStroke(
                                            1.dp,
                                            if (u.isActive) MaterialTheme.colorScheme.outlineVariant else LossRed.copy(alpha = 0.5f)
                                        ),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 4.dp)
                                    ) {
                                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(
                                                        text = "${u.fullName} (@${u.username})",
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 13.sp,
                                                        color = MaterialTheme.colorScheme.onSurface
                                                    )
                                                    Text(
                                                        text = "${u.shopName} Ã¢â‚¬Â¢ ${u.assignedBranchName} Ã¢â‚¬Â¢ ${u.phone.ifBlank { "No phone" }}",
                                                        fontSize = 11.sp,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = (if (u.isActive) ProfitGreen else LossRed).copy(alpha = 0.15f)
                                                ) {
                                                    Text(
                                                        text = if (u.isActive) u.role else "SUSPENDED",
                                                        fontSize = 10.sp,
                                                        fontWeight = FontWeight.Black,
                                                        color = if (u.isActive) ProfitGreen else LossRed,
                                                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                                                    )
                                                }
                                            }

                                            // Role Switcher Row
                                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                listOf("OWNER", "MANAGER", "CASHIER").forEach { roleOpt ->
                                                    val isCurrent = u.role == roleOpt
                                                    OutlinedButton(
                                                        onClick = {
                                                            if (!isCurrent) onUpdateShopUserRole(u, roleOpt)
                                                        },
                                                        modifier = Modifier
                                                            .weight(1f)
                                                            .heightIn(min = 40.dp),
                                                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
                                                        colors = ButtonDefaults.outlinedButtonColors(
                                                            containerColor = if (isCurrent) OrangePrimary.copy(alpha = 0.16f) else Color.Transparent
                                                        )
                                                    ) {
                                                        Text(
                                                            text = roleOpt,
                                                            fontSize = 10.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = if (isCurrent) OrangePrimary else MaterialTheme.colorScheme.onSurface
                                                        )
                                                    }
                                                }
                                            }

                                            // Suspend/Activate & Delete Row
                                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                OutlinedButton(
                                                    onClick = { onToggleShopUserActive(u, !u.isActive) },
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .heightIn(min = 48.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = if (u.isActive) Icons.Default.PauseCircle else Icons.Default.PlayCircle,
                                                        contentDescription = null,
                                                        tint = if (u.isActive) WarningAmber else ProfitGreen,
                                                        modifier = Modifier.size(16.dp)
                                                    )
                                                    Spacer(modifier = Modifier.width(5.dp))
                                                    Text(
                                                        text = if (u.isActive) "Suspend" else "Activate",
                                                        fontSize = 11.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = if (u.isActive) WarningAmber else ProfitGreen
                                                    )
                                                }

                                                OutlinedButton(
                                                    onClick = { onDeleteShopUser(u) },
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .heightIn(min = 48.dp),
                                                    border = BorderStroke(1.dp, LossRed.copy(alpha = 0.55f))
                                                ) {
                                                    Icon(Icons.Default.Delete, contentDescription = null, tint = LossRed, modifier = Modifier.size(16.dp))
                                                    Spacer(modifier = Modifier.width(5.dp))
                                                    Text("Remove", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = LossRed)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        2 -> {
                            // ALL SHOPS LICENSING, 4-DAY TRIAL & REMOTE LOCK MANAGEMENT
                            OutlinedTextField(
                                value = shopSearchQuery,
                                onValueChange = { shopSearchQuery = it },
                                label = { Text("Filter shops by name, @owner or phone") },
                                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 6.dp)
                                    .testTag("admin_shop_search_input"),
                                shape = RoundedCornerShape(12.dp)
                            )

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                listOf("ALL", "ACTIVE", "TRIAL", "EXPIRED", "SUSPENDED").forEach { statusOpt ->
                                    val selected = shopStatusFilter == statusOpt
                                    OutlinedButton(
                                        onClick = { shopStatusFilter = statusOpt },
                                        modifier = Modifier
                                            .weight(1f)
                                            .heightIn(min = 42.dp),
                                        contentPadding = PaddingValues(horizontal = 2.dp),
                                        colors = ButtonDefaults.outlinedButtonColors(
                                            containerColor = if (selected) OrangePrimary.copy(alpha = 0.16f) else Color.Transparent
                                        )
                                    ) {
                                        Text(
                                            text = if (statusOpt == "SUSPENDED") "LOCKED" else statusOpt,
                                            fontSize = 9.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (selected) OrangePrimary else MaterialTheme.colorScheme.onSurface,
                                            maxLines = 1
                                        )
                                    }
                                }
                            }

                            val nowCheck = ClockGuard.effectiveNowMs()
                            val filteredShops = shopAccounts.filter { s ->
                                val isExpiredTime = s.subscriptionExpiresAt <= nowCheck
                                val derivedStatus = when {
                                    s.subscriptionStatus == ShopProfile.STATUS_SUSPENDED -> ShopProfile.STATUS_SUSPENDED
                                    s.subscriptionStatus == ShopProfile.STATUS_EXPIRED || isExpiredTime -> ShopProfile.STATUS_EXPIRED
                                    s.subscriptionStatus == ShopProfile.STATUS_TRIAL -> ShopProfile.STATUS_TRIAL
                                    else -> ShopProfile.STATUS_ACTIVE
                                }
                                val matchesFilter = shopStatusFilter == "ALL" || derivedStatus == shopStatusFilter
                                val q = shopSearchQuery.trim().lowercase(Locale.ROOT)
                                val matchesQuery = q.isBlank() ||
                                    s.shopName.lowercase(Locale.ROOT).contains(q) ||
                                    s.ownerUsername.lowercase(Locale.ROOT).contains(q) ||
                                    s.ownerPhone.contains(q)
                                matchesFilter && matchesQuery
                            }

                            if (filteredShops.isEmpty()) {
                                Text(
                                    text = "No Supabase shop accounts match this filter.",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(8.dp)
                                )
                            } else {
                                filteredShops.forEach { acc ->
                                    val millisLeft = (acc.subscriptionExpiresAt - nowCheck).coerceAtLeast(0L)
                                    val daysLeft = if (millisLeft <= 0L) 0 else ((millisLeft + 86_399_999L) / 86_400_000L).toInt()
                                    val isSuspended = acc.subscriptionStatus == ShopProfile.STATUS_SUSPENDED
                                    val isTrial = acc.subscriptionStatus == ShopProfile.STATUS_TRIAL && millisLeft > 0L
                                    val isLockedOut = isSuspended || acc.subscriptionStatus == ShopProfile.STATUS_EXPIRED || millisLeft <= 0L
                                    val statusColor = when {
                                        isSuspended -> LossRed
                                        isLockedOut -> LossRed
                                        isTrial -> Color(0xFF0284C7)
                                        else -> ProfitGreen
                                    }
                                    val badgeLabel = when {
                                        isSuspended -> "SUSPENDED"
                                        isLockedOut -> "EXPIRED (LOCKED)"
                                        isTrial -> "TRIAL (${daysLeft}d)"
                                        else -> "ACTIVE (${daysLeft}d)"
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                        border = BorderStroke(1.dp, statusColor.copy(alpha = 0.35f)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 4.dp)
                                    ) {
                                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                                    Icon(Icons.Default.Store, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(16.dp))
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    Text("${acc.shopName} (@${acc.ownerUsername})", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                                }
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = statusColor.copy(alpha = 0.15f)
                                                ) {
                                                    Text(
                                                        text = badgeLabel,
                                                        fontSize = 9.5.sp,
                                                        fontWeight = FontWeight.Black,
                                                        color = statusColor,
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                    )
                                                }
                                            }
                                            Text(
                                                text = "Phone: ${acc.ownerPhone} Ã¢â‚¬Â¢ ${acc.branchCount} br / ${acc.workerCount} stf / ${acc.deviceCount}/${acc.deviceLimit} dev Ã¢â‚¬Â¢ ${acc.monthlyFeeRwf} FRw/mo",
                                                fontSize = 11.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            if (acc.autoUnlockedAt > 0L) {
                                                Text(
                                                    text = "Direct Auto-Unlocked: ${dateFormatter.format(Date(acc.autoUnlockedAt))}",
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = ProfitGreen
                                                )
                                            }

                                            var draftBranches by remember(acc.ownerUsername, acc.branchCount) { mutableIntStateOf(acc.branchCount.coerceAtLeast(1)) }
                                            var draftWorkers by remember(acc.ownerUsername, acc.workerCount) { mutableIntStateOf(acc.workerCount.coerceAtLeast(1)) }
                                            var draftDevices by remember(acc.ownerUsername, acc.deviceLimit) { mutableIntStateOf(acc.deviceLimit.coerceAtLeast(1)) }
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Surface(
                                                    shape = RoundedCornerShape(10.dp),
                                                    color = MaterialTheme.colorScheme.surface,
                                                    modifier = Modifier.weight(1f)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        IconButton(
                                                            onClick = { if (draftBranches > 1) draftBranches-- },
                                                            modifier = Modifier.size(34.dp)
                                                        ) {
                                                            Icon(Icons.Default.Remove, contentDescription = "Decrease branch limit", modifier = Modifier.size(15.dp))
                                                        }
                                                        Text("Br:$draftBranches", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                                        IconButton(
                                                            onClick = { draftBranches++ },
                                                            modifier = Modifier.size(34.dp)
                                                        ) {
                                                            Icon(Icons.Default.Add, contentDescription = "Increase branch limit", modifier = Modifier.size(15.dp))
                                                        }
                                                    }
                                                }
                                                Surface(
                                                    shape = RoundedCornerShape(10.dp),
                                                    color = MaterialTheme.colorScheme.surface,
                                                    modifier = Modifier.weight(1f)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        IconButton(
                                                            onClick = { if (draftWorkers > 1) draftWorkers-- },
                                                            modifier = Modifier.size(34.dp)
                                                        ) {
                                                            Icon(Icons.Default.Remove, contentDescription = "Decrease worker limit", modifier = Modifier.size(15.dp))
                                                        }
                                                        Text("Stf:$draftWorkers", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                                        IconButton(
                                                            onClick = { draftWorkers++ },
                                                            modifier = Modifier.size(34.dp)
                                                        ) {
                                                            Icon(Icons.Default.Add, contentDescription = "Increase worker limit", modifier = Modifier.size(15.dp))
                                                        }
                                                    }
                                                }
                                                Surface(
                                                    shape = RoundedCornerShape(10.dp),
                                                    color = MaterialTheme.colorScheme.surface,
                                                    modifier = Modifier.weight(1f)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        IconButton(
                                                            onClick = { if (draftDevices > 1) draftDevices-- },
                                                            modifier = Modifier.size(34.dp)
                                                        ) {
                                                            Icon(Icons.Default.Remove, contentDescription = "Decrease device limit", modifier = Modifier.size(15.dp))
                                                        }
                                                        Text("Dev:$draftDevices", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                                        IconButton(
                                                            onClick = { draftDevices++ },
                                                            modifier = Modifier.size(34.dp)
                                                        ) {
                                                            Icon(Icons.Default.Add, contentDescription = "Increase device limit", modifier = Modifier.size(15.dp))
                                                        }
                                                    }
                                                }
                                            }
                                            OutlinedButton(
                                                onClick = { onUpdateShopLimits(acc, draftBranches, draftWorkers, draftDevices) },
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .heightIn(min = 42.dp)
                                            ) {
                                                Text(
                                                    text = "Save Quotas (${OfflineSubscriptionManager.calculateSubscriptionPrice(draftBranches, draftWorkers, 1, draftDevices).totalPayable} FRw/mo)",
                                                    fontSize = 10.5.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }

                                            // Quick Duration Extension Row (+4d Trial, +30d, +90d, +365d)
                                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                OutlinedButton(
                                                    onClick = { onResetShopTrial(acc) },
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .heightIn(min = 44.dp),
                                                    contentPadding = PaddingValues(horizontal = 4.dp),
                                                    border = BorderStroke(1.dp, Color(0xFF0284C7).copy(alpha = 0.5f))
                                                ) {
                                                    Icon(Icons.Default.RestartAlt, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(14.dp))
                                                    Spacer(modifier = Modifier.width(3.dp))
                                                    Text("4d Trial", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0284C7))
                                                }
                                                Button(
                                                    onClick = { onExtendShopSubscription(acc, 30) },
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .heightIn(min = 44.dp),
                                                    contentPadding = PaddingValues(horizontal = 4.dp),
                                                    colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen)
                                                ) {
                                                    Text("+30d", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                                }
                                                OutlinedButton(
                                                    onClick = { onExtendShopSubscription(acc, 90) },
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .heightIn(min = 44.dp),
                                                    contentPadding = PaddingValues(horizontal = 4.dp)
                                                ) {
                                                    Text("+90d", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = ProfitGreen)
                                                }
                                                OutlinedButton(
                                                    onClick = { onExtendShopSubscription(acc, 365) },
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .heightIn(min = 44.dp),
                                                    contentPadding = PaddingValues(horizontal = 4.dp)
                                                ) {
                                                    Text("+1yr", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = OrangePrimary)
                                                }
                                            }

                                            // Controls Row: BB3 code, remote lock/activate, WhatsApp, delete
                                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                                OutlinedButton(
                                                    onClick = {
                                                        manualUsername = acc.ownerUsername
                                                        manualPhone = acc.ownerPhone
                                                        manualAmountText = acc.monthlyFeeRwf.toString()
                                                        selectedTab = 3
                                                    },
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .heightIn(min = 48.dp),
                                                    contentPadding = PaddingValues(horizontal = 6.dp)
                                                ) {
                                                    Icon(Icons.Default.Key, contentDescription = null, modifier = Modifier.size(14.dp))
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text(Localization.get("admin_verify_issue_bb3", language), fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                                }

                                                OutlinedButton(
                                                    onClick = {
                                                        onSetShopStatus(
                                                            acc,
                                                            if (isLockedOut) ShopProfile.STATUS_ACTIVE else ShopProfile.STATUS_SUSPENDED
                                                        )
                                                    },
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .heightIn(min = 48.dp),
                                                    contentPadding = PaddingValues(horizontal = 6.dp),
                                                    border = BorderStroke(1.dp, if (isLockedOut) ProfitGreen else LossRed.copy(alpha = 0.6f))
                                                ) {
                                                    Text(
                                                        text = if (isLockedOut) "Unlock" else "Lock App",
                                                        fontSize = 10.5.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = if (isLockedOut) ProfitGreen else LossRed
                                                    )
                                                }

                                                IconButton(
                                                    onClick = {
                                                        val msg = "Hello ${acc.shopName} (@${acc.ownerUsername}), this is BeBoss Master Support. Your current plan status is $badgeLabel (${acc.monthlyFeeRwf} FRw/mo). Reply here if you need renewal assistance."
                                                        PdfReportGenerator.sendWhatsAppDirect(context, acc.ownerPhone, msg)
                                                    },
                                                    modifier = Modifier.size(48.dp)
                                                ) {
                                                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Message shop on WhatsApp", tint = ProfitGreen)
                                                }

                                                IconButton(
                                                    onClick = { onDeleteShopAccount(acc) },
                                                    modifier = Modifier.size(48.dp)
                                                ) {
                                                    Icon(Icons.Default.Delete, contentDescription = "Delete shop", tint = LossRed)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        3 -> {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                    border = BorderStroke(1.dp, OrangePrimary.copy(alpha = 0.35f)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(26.dp))
                                        Text("Payment-linked unlock codes only", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                                        Text(
                                            "To issue a code, open the Payments queue, select the customer payment, verify the payer, amount and plan with the mobile-money provider, then choose Verify & Issue BB3. BeBoss signs one code for that exact payment request and registered shop. Standalone codes are disabled.",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                        4 -> {
                            // Unlock Codes Ledger with Search, Status Filter, Copy, WhatsApp & Revoke
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = codeSearchQuery,
                                    onValueChange = { codeSearchQuery = it },
                                    label = { Text(Localization.get("admin_code_search", language)) },
                                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp)
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    listOf(
                                        "ALL" to "admin_code_status_all",
                                        "ISSUED" to "admin_code_status_issued",
                                        "REDEEMED" to "admin_code_status_redeemed",
                                        "REVOKED" to "admin_code_status_revoked"
                                    ).forEach { (st, labelKey) ->
                                        val selected = codeStatusFilter == st
                                        OutlinedButton(
                                            onClick = { codeStatusFilter = st },
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 40.dp),
                                            contentPadding = PaddingValues(horizontal = 4.dp),
                                            colors = ButtonDefaults.outlinedButtonColors(
                                                containerColor = if (selected) OrangePrimary.copy(alpha = 0.16f) else Color.Transparent
                                            )
                                        ) {
                                            Text(Localization.get(labelKey, language), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (selected) OrangePrimary else MaterialTheme.colorScheme.onSurface)
                                        }
                                    }
                                }

                                val filteredCodes = unlockCodes.filter { dto ->
                                    val statusOk = codeStatusFilter == "ALL" || dto.status.equals(codeStatusFilter, ignoreCase = true)
                                    val q = codeSearchQuery.trim().lowercase(Locale.ROOT)
                                    val queryOk = q.isBlank() ||
                                        dto.unlockCode.lowercase(Locale.ROOT).contains(q) ||
                                        dto.shopUsername.lowercase(Locale.ROOT).contains(q) ||
                                        dto.shopPhone.contains(q) ||
                                        dto.tierCode.lowercase(Locale.ROOT).contains(q)
                                    statusOk && queryOk
                                }

                                if (filteredCodes.isEmpty()) {
                                    Text(
                                        text = Localization.get("admin_no_codes", language),
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(8.dp)
                                    )
                                } else {
                                    filteredCodes.forEach { codeDto ->
                                        val isRevoked = codeDto.status == "REVOKED"
                                        val isRedeemed = codeDto.status == "REDEEMED"
                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                            border = BorderStroke(
                                                1.dp,
                                                when {
                                                    isRevoked -> LossRed.copy(alpha = 0.4f)
                                                    isRedeemed -> ProfitGreen.copy(alpha = 0.4f)
                                                    else -> MaterialTheme.colorScheme.outlineVariant
                                                }
                                            ),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 2.dp)
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(10.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(
                                                        text = codeDto.unlockCode,
                                                        fontFamily = FontFamily.Monospace,
                                                        fontSize = 11.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = if (isRevoked) LossRed else MaterialTheme.colorScheme.onSurface
                                                    )
                                                    Text(
                                                        text = "@${codeDto.shopUsername} (${codeDto.shopPhone}) • " + Localization.format("admin_code_status_fmt", language, codeDto.tierCode, codeDto.planDays, codeDto.amountRwf, when (codeDto.status.uppercase(Locale.ROOT)) { "ISSUED" -> Localization.get("admin_code_status_issued", language); "REDEEMED" -> Localization.get("admin_code_status_redeemed", language); "REVOKED" -> Localization.get("admin_code_status_revoked", language); else -> codeDto.status }),
                                                        fontSize = 10.sp,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }
                                                if (!isRevoked) {
                                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                                        IconButton(
                                                            onClick = {
                                                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                                                clipboard.setPrimaryClip(ClipData.newPlainText("BeBoss Unlock Code", codeDto.unlockCode))
                                                                Toast.makeText(context, "Copied ${codeDto.unlockCode}", Toast.LENGTH_SHORT).show()
                                                            },
                                                            modifier = Modifier.size(42.dp)
                                                        ) {
                                                            Icon(Icons.Default.ContentCopy, contentDescription = "Copy unlock code", tint = OrangePrimary, modifier = Modifier.size(17.dp))
                                                        }
                                                        IconButton(
                                                            onClick = {
                                                                val msg = OfflineSubscriptionManager.buildAdminUnlockReplyWhatsAppMessage(
                                                                    shopName = shopAccounts.firstOrNull { it.ownerUsername.equals(codeDto.shopUsername, true) }?.shopName ?: "BeBoss Shop",
                                                                    username = codeDto.shopUsername,
                                                                    unlockCode = codeDto.unlockCode,
                                                                    daysAdded = codeDto.planDays,
                                                                    tierName = "${codeDto.tierCode} (${codeDto.amountRwf} FRw)"
                                                                )
                                                                PdfReportGenerator.sendWhatsAppDirect(context, codeDto.shopPhone, msg)
                                                            },
                                                            modifier = Modifier.size(42.dp)
                                                        ) {
                                                            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send code via WhatsApp", tint = ProfitGreen, modifier = Modifier.size(17.dp))
                                                        }
                                                        IconButton(
                                                            onClick = { onRevokeCode(codeDto) },
                                                            modifier = Modifier.size(42.dp)
                                                        ) {
                                                            Icon(Icons.Default.Block, contentDescription = "Revoke code", tint = LossRed, modifier = Modifier.size(17.dp))
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        5 -> {
                            // Branch Sync Snapshots Monitor & Cleanup
                            if (branchSnapshots.isEmpty()) {
                                Text(
                                    text = "No cloud branch snapshots recorded yet.",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(8.dp)
                                )
                            } else {
                                branchSnapshots.forEach { snap ->
                                    Surface(
                                        shape = RoundedCornerShape(10.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 4.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(10.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    Icon(Icons.Default.CloudSync, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(15.dp))
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    Text("${snap.shopName} Ã¢â‚¬Â¢ ${snap.branchName}", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                                }
                                                Text(
                                                    text = "${snap.recordsSummary} Ã¢â‚¬Â¢ Device: ${snap.deviceId} Ã¢â‚¬Â¢ ${dateFormatter.format(Date(snap.updatedAt))}",
                                                    fontSize = 10.5.sp,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                            IconButton(
                                                onClick = { onDeleteBranchSnapshot(snap) },
                                                modifier = Modifier.size(48.dp)
                                            ) {
                                                Icon(Icons.Default.Delete, contentDescription = "Remove branch snapshot", tint = LossRed)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        6 -> {
                            // Unified Cloud + Local Security Audit Trail + Hardware Security Diagnostics
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                listOf(
                                    0 to "Cloud (${auditLogs.size})",
                                    1 to "Local (${localAuditLogs.size})",
                                    2 to "Security"
                                ).forEach { (idx, label) ->
                                    OutlinedButton(
                                        onClick = { auditSubTab = idx },
                                        modifier = Modifier
                                            .weight(1f)
                                            .heightIn(min = 44.dp),
                                        contentPadding = PaddingValues(horizontal = 4.dp),
                                        colors = ButtonDefaults.outlinedButtonColors(
                                            containerColor = if (auditSubTab == idx) OrangePrimary.copy(alpha = 0.16f) else Color.Transparent
                                        )
                                    ) {
                                        Text(
                                            text = label,
                                            fontSize = 10.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (auditSubTab == idx) OrangePrimary else MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }

                            when (auditSubTab) {
                                0 -> {
                                    if (auditLogs.isEmpty()) {
                                        Text(
                                            text = "No cloud admin audit events recorded yet.",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(8.dp)
                                        )
                                    } else {
                                        auditLogs.forEach { entry ->
                                            Surface(
                                                shape = RoundedCornerShape(10.dp),
                                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(vertical = 3.dp)
                                            ) {
                                                Column(modifier = Modifier.padding(10.dp)) {
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.SpaceBetween
                                                    ) {
                                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                                            Icon(Icons.Default.History, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(14.dp))
                                                            Spacer(modifier = Modifier.width(4.dp))
                                                            Text(entry.action, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = OrangePrimary)
                                                        }
                                                        Text(
                                                            text = dateFormatter.format(Date(entry.createdAt)),
                                                            fontSize = 10.sp,
                                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                                        )
                                                    }
                                                    Text(
                                                        text = "${entry.adminEmail} Ã¢â‚¬Â¢ ${entry.details}",
                                                        fontSize = 11.sp,
                                                        color = MaterialTheme.colorScheme.onSurface
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }

                                1 -> {
                                    if (localAuditLogs.isEmpty()) {
                                        Text(
                                            text = "No local security audit events recorded yet.",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(8.dp)
                                        )
                                    } else {
                                        localAuditLogs.forEach { entry ->
                                            val isConflict = entry.action.contains("CONFLICT", ignoreCase = true) ||
                                                entry.action.contains("WARNING", ignoreCase = true) ||
                                                entry.action.contains("REFUND", ignoreCase = true)
                                            val accent = if (isConflict) WarningAmber else ProfitGreen
                                            Surface(
                                                shape = RoundedCornerShape(10.dp),
                                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(vertical = 3.dp)
                                            ) {
                                                Column(modifier = Modifier.padding(10.dp)) {
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.SpaceBetween
                                                    ) {
                                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                                            Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
                                                            Spacer(modifier = Modifier.width(4.dp))
                                                            Text(entry.action, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = accent)
                                                        }
                                                        Text(
                                                            text = dateFormatter.format(Date(entry.createdAt)),
                                                            fontSize = 10.sp,
                                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                                        )
                                                    }
                                                    Text(
                                                        text = "${entry.actorName} (${entry.actorRole}) Ã¢â‚¬Â¢ ${entry.details}",
                                                        fontSize = 11.sp,
                                                        color = MaterialTheme.colorScheme.onSurface
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }

                                else -> {
                                    val integrity = remember { DeviceSecurityManager.inspectDeviceIntegrity() }
                                    val keystoreStatus = remember { CryptoKeyManager.getHardwareKeystoreStatus() }
                                    val rollbackFlag = remember { ClockGuard.isClockRollbackDetected() }
                                    val pinConfigured = BuildConfig.SUPABASE_CERT_PINS.contains("sha256/")

                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                        border = BorderStroke(
                                            1.dp,
                                            if (integrity.isCompromisedRisk || rollbackFlag) LossRed.copy(alpha = 0.45f) else ProfitGreen.copy(alpha = 0.45f)
                                        ),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Icon(
                                                    Icons.Default.Security,
                                                    contentDescription = null,
                                                    tint = if (integrity.isCompromisedRisk) LossRed else ProfitGreen,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text(
                                                    text = "Live Terminal Security Posture",
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp,
                                                    color = MaterialTheme.colorScheme.onSurface
                                                )
                                            }
                                            Text("Ã¢â‚¬Â¢ Integrity: ${integrity.postureLabel}", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = if (integrity.isCompromisedRisk) LossRed else ProfitGreen)
                                            Text("Ã¢â‚¬Â¢ Keystore Hardware: $keystoreStatus", fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurface)
                                            Text("Ã¢â‚¬Â¢ Database Encryption: SQLCipher AES-256 (Keystore-wrapped)", fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurface)
                                            Text(
                                                text = "Ã¢â‚¬Â¢ Anti-Rollback ClockGuard: ${if (rollbackFlag) "ROLLBACK DETECTED" else "Verified Monotonic"}",
                                                fontSize = 11.5.sp,
                                                color = if (rollbackFlag) LossRed else ProfitGreen
                                            )
                                            Text(
                                                text = "Ã¢â‚¬Â¢ Supabase TLS Certificate Pinning: ${if (pinConfigured) "Pinned (Fail-Closed)" else "Standard TLS (Configure SUPABASE_CERT_PINS)"}",
                                                fontSize = 11.5.sp,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                            if (integrity.signals.isNotEmpty()) {
                                                Text(
                                                    text = "Signals: ${integrity.signals.joinToString(", ")}",
                                                    fontSize = 10.5.sp,
                                                    color = WarningAmber
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        7 -> {
                            // SHOP DEVICES REGISTRY (+2,000 FRw/mo per added secondary device)
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = deviceSearchQuery,
                                    onValueChange = { deviceSearchQuery = it },
                                    label = { Text("Search devices by shop, @user, device name or join code") },
                                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                                    singleLine = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("admin_device_search_input"),
                                    shape = RoundedCornerShape(12.dp)
                                )

                                val extraDevicesActive = shopDevices.count { !it.isOwnerPrimary && it.isActive }
                                val totalDeviceAddonMrr = shopDevices.filter { it.isActive && !it.isOwnerPrimary }
                                    .sumOf { it.monthlyFeeAddonRwf }
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = OrangePrimary.copy(alpha = 0.09f),
                                    border = BorderStroke(1.dp, OrangePrimary.copy(alpha = 0.3f)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = "${shopDevices.size} Registered Terminals Ã¢â‚¬Â¢ $extraDevicesActive Active Extra Devices (+${totalDeviceAddonMrr} FRw/mo)",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = OrangePrimary,
                                        modifier = Modifier.padding(10.dp)
                                    )
                                }

                                val filteredDevices = shopDevices.filter { dev ->
                                    val q = deviceSearchQuery.trim().lowercase(Locale.ROOT)
                                    q.isBlank() ||
                                        dev.deviceName.lowercase(Locale.ROOT).contains(q) ||
                                        dev.shopName.lowercase(Locale.ROOT).contains(q) ||
                                        dev.assignedUsername.lowercase(Locale.ROOT).contains(q) ||
                                        dev.joinCode.lowercase(Locale.ROOT).contains(q) ||
                                        dev.branchName.lowercase(Locale.ROOT).contains(q)
                                }

                                if (filteredDevices.isEmpty()) {
                                    Text(
                                        text = "No paired shop devices synced to Supabase yet.",
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(8.dp)
                                    )
                                } else {
                                    filteredDevices.forEach { dev ->
                                        Surface(
                                            shape = RoundedCornerShape(12.dp),
                                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                            border = BorderStroke(
                                                1.dp,
                                                when {
                                                    dev.isOwnerPrimary -> ProfitGreen.copy(alpha = 0.4f)
                                                    dev.isActive -> OrangePrimary.copy(alpha = 0.35f)
                                                    else -> LossRed.copy(alpha = 0.4f)
                                                }
                                            ),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                                        Icon(Icons.Default.Devices, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(16.dp))
                                                        Spacer(modifier = Modifier.width(6.dp))
                                                        Text(dev.deviceName, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                                                    }
                                                    Surface(
                                                        shape = RoundedCornerShape(6.dp),
                                                        color = (if (dev.isOwnerPrimary) ProfitGreen else OrangePrimary).copy(alpha = 0.15f)
                                                    ) {
                                                        Text(
                                                            text = if (dev.isOwnerPrimary) "PRIMARY FREE" else "+${dev.monthlyFeeAddonRwf} FRw/mo",
                                                            fontSize = 9.5.sp,
                                                            fontWeight = FontWeight.Black,
                                                            color = if (dev.isOwnerPrimary) ProfitGreen else OrangePrimary,
                                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                        )
                                                    }
                                                }

                                                Text(
                                                    text = "${dev.shopName} Ã¢â‚¬Â¢ @${dev.assignedUsername} (${dev.role}) Ã¢â‚¬Â¢ ${dev.branchName}",
                                                    fontSize = 11.sp,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                                Text(
                                                    text = "Join Code: ${dev.joinCode} Ã¢â‚¬Â¢ Last Sync: ${dateFormatter.format(Date(dev.lastSyncedAt.coerceAtLeast(dev.updatedAt)))}",
                                                    fontSize = 10.5.sp,
                                                    fontFamily = FontFamily.Monospace,
                                                    color = MaterialTheme.colorScheme.onSurface
                                                )

                                                if (!dev.isOwnerPrimary) {
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                            Switch(
                                                                checked = dev.isActive,
                                                                onCheckedChange = { checked -> onToggleShopDeviceActive(dev, checked) },
                                                                colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = ProfitGreen)
                                                            )
                                                            Text(
                                                                text = if (dev.isActive) "Active (Billed)" else "Paused",
                                                                fontSize = 11.sp,
                                                                fontWeight = FontWeight.Bold,
                                                                color = if (dev.isActive) ProfitGreen else LossRed
                                                            )
                                                        }

                                                        IconButton(
                                                            onClick = { onDeleteShopDevice(dev) },
                                                            modifier = Modifier.size(48.dp)
                                                        ) {
                                                            Icon(Icons.Default.Delete, contentDescription = "Remove paired device", tint = LossRed)
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        else -> {
                            // TAB 8: GLOBAL PAYMENT NUMBERS, USSD & ADMIN WHATSAPP CONFIG
                            var cfgWhatsApp by remember(paymentConfig) { mutableStateOf(paymentConfig.adminWhatsAppNumber) }
                            var cfgMtnCode by remember(paymentConfig) { mutableStateOf(paymentConfig.mtnMoMoCode) }
                            var cfgMtnPhone by remember(paymentConfig) { mutableStateOf(paymentConfig.mtnMoMoPhone) }
                            var cfgMtnName by remember(paymentConfig) { mutableStateOf(paymentConfig.mtnRecipientName) }
                            var cfgAirtelPhone by remember(paymentConfig) { mutableStateOf(paymentConfig.airtelMoneyPhone) }
                            var cfgAirtelName by remember(paymentConfig) { mutableStateOf(paymentConfig.airtelRecipientName) }
                            var cfgPerDeviceFee by remember(paymentConfig) { mutableStateOf(paymentConfig.perDeviceFeeRwf.toString()) }
                            var cfgApkUrl by remember(paymentConfig) { mutableStateOf(paymentConfig.apkDownloadUrl) }
                            var cfgApkVersion by remember(paymentConfig) { mutableStateOf(paymentConfig.apkVersion.ifBlank { "2.1.0" }) }
                            var savingCfg by remember { mutableStateOf(false) }

                            val draftConfig = AdminPaymentConfig(
                                adminWhatsAppNumber = cfgWhatsApp.trim(),
                                mtnMoMoCode = cfgMtnCode.trim(),
                                mtnMoMoPhone = cfgMtnPhone.trim(),
                                mtnRecipientName = cfgMtnName.trim(),
                                airtelMoneyPhone = cfgAirtelPhone.trim(),
                                airtelRecipientName = cfgAirtelName.trim(),
                                perDeviceFeeRwf = cfgPerDeviceFee.toIntOrNull() ?: 2000,
                                apkDownloadUrl = cfgApkUrl.trim(),
                                apkVersion = cfgApkVersion.trim().ifBlank { "2.1.0" },
                                updatedAt = System.currentTimeMillis()
                            )

                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    text = "Global Payment, USSD & Admin WhatsApp Settings",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.5.sp,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "Changes saved here sync to Supabase (app_config) and automatically appear in every shop's Subscription USSD dialer, WhatsApp proof form & Public APK QR site.",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                OutlinedTextField(
                                    value = cfgWhatsApp,
                                    onValueChange = { cfgWhatsApp = it },
                                    label = { Text("Admin WhatsApp Number * (e.g. +250788123456)") },
                                    leadingIcon = { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, tint = ProfitGreen) },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                    singleLine = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("admin_cfg_whatsapp_input"),
                                    shape = RoundedCornerShape(12.dp)
                                )

                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = cfgMtnCode,
                                        onValueChange = { cfgMtnCode = it },
                                        label = { Text("MTN MoMo Pay Code") },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = cfgMtnPhone,
                                        onValueChange = { cfgMtnPhone = it },
                                        label = { Text("MTN MoMo Phone") },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                        singleLine = true,
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                }

                                OutlinedTextField(
                                    value = cfgMtnName,
                                    onValueChange = { cfgMtnName = it },
                                    label = { Text("MTN Recipient Account Name") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp)
                                )

                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = cfgAirtelPhone,
                                        onValueChange = { cfgAirtelPhone = it },
                                        label = { Text("Airtel Money Phone") },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                        singleLine = true,
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = cfgPerDeviceFee,
                                        onValueChange = { cfgPerDeviceFee = it.filter { ch -> ch.isDigit() } },
                                        label = { Text("Fee/Device (FRw)") },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        singleLine = true,
                                        modifier = Modifier.weight(0.9f),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                }

                                OutlinedTextField(
                                    value = cfgAirtelName,
                                    onValueChange = { cfgAirtelName = it },
                                    label = { Text("Airtel Recipient Account Name") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp)
                                )

                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = cfgApkUrl,
                                        onValueChange = { cfgApkUrl = it },
                                        label = { Text("Public APK URL (optional CDN link)") },
                                        singleLine = true,
                                        modifier = Modifier.weight(1.4f),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = cfgApkVersion,
                                        onValueChange = { cfgApkVersion = it },
                                        label = { Text("APK Ver") },
                                        singleLine = true,
                                        modifier = Modifier.weight(0.6f),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                }

                                // Live USSD Preview Banner
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = DarkNavy,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                        Text(Localization.get("admin_live_ussd_preview", language), fontSize = 9.5.sp, fontWeight = FontWeight.Black, color = OrangePrimary)
                                        Text(
                                            text = "MTN: ${OfflineSubscriptionManager.buildMtnUssdCode(5000, draftConfig)} (${draftConfig.mtnRecipientName})",
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace,
                                            color = Color.White
                                        )
                                        Text(
                                            text = "Airtel: ${OfflineSubscriptionManager.buildAirtelUssdCode(5000, draftConfig)} (${draftConfig.airtelRecipientName})",
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace,
                                            color = Color.White
                                        )
                                        Text(
                                            text = "WhatsApp Target: ${draftConfig.adminWhatsAppNumber.ifBlank { "Not set" }} Ã¢â‚¬Â¢ +${draftConfig.perDeviceFeeRwf} FRw/extra device",
                                            fontSize = 10.5.sp,
                                            color = ProfitGreen
                                        )
                                    }
                                }

                                Button(
                                    onClick = {
                                        savingCfg = true
                                        onSavePaymentConfig(draftConfig) { ok ->
                                            savingCfg = false
                                            Toast.makeText(
                                                context,
                                                if (ok) Localization.get("admin_global_config_saved", language)
                                                else Localization.get("admin_global_config_failed", language),
                                                Toast.LENGTH_SHORT
                                            ).show()
                                        }
                                    },
                                    enabled = !savingCfg && cfgWhatsApp.isNotBlank(),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(min = 48.dp)
                                        .testTag("admin_cfg_save_btn"),
                                    colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen)
                                ) {
                                    if (savingCfg) {
                                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                                    } else {
                                        Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.size(16.dp))
                                    }
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(Localization.get("admin_save_global_config", language), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (requestToReject != null) {
        AlertDialog(
            onDismissRequest = { requestToReject = null },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = LossRed)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(Localization.get("admin_reject_payment_title", language), fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Rejecting claim from @${requestToReject!!.ownerUsername} (${requestToReject!!.amountRwf} FRw).",
                        fontSize = 12.sp
                    )
                    OutlinedTextField(
                        value = rejectReasonInput,
                        onValueChange = { rejectReasonInput = it },
                        label = { Text(Localization.get("admin_reject_reason", language)) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        onRejectPayment(requestToReject!!, rejectReasonInput.trim())
                        requestToReject = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LossRed)
                ) {
                    Text(Localization.get("admin_confirm_reject", language), color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { requestToReject = null }) {
                    Text(Localization.get("admin_cancel", language))
                }
            }
        )
    }
}

@Composable
private fun AdminKpiCard(
    label: String,
    value: String,
    accent: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = accent.copy(alpha = 0.10f),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.32f))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = value,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Black,
                color = accent,
                maxLines = 1
            )
            Text(
                text = label,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
        }
    }
}
