package com.beboss.shopmgmt.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import com.beboss.shopmgmt.util.normalizeUnlockCodeInput
import com.beboss.shopmgmt.util.safeMessage
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.DataObject
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.SettingsSuggest
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.beboss.shopmgmt.R
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerPayment
import com.beboss.shopmgmt.data.model.DatabaseEngineStats
import com.beboss.shopmgmt.data.model.DatabaseMaintenanceResult
import com.beboss.shopmgmt.data.model.LocalAuditLog
import com.beboss.shopmgmt.data.model.PaymentVerificationRequest
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.ShopDevice
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.InkDark
import com.beboss.shopmgmt.ui.theme.InkMedium
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangeLight
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.ui.theme.WarningAmber
import com.beboss.shopmgmt.ui.components.PermissionRequestDialog
import com.beboss.shopmgmt.util.AdminPaymentConfig
import com.beboss.shopmgmt.util.AndroidDeviceCredentialStore
import com.beboss.shopmgmt.util.SupabaseAdminClient
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.BranchPeerSyncEvent
import com.beboss.shopmgmt.util.CapturedLocation
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.ClockTamperStatus
import com.beboss.shopmgmt.util.CloudSyncReport
import com.beboss.shopmgmt.util.ConnectivityStatus
import com.beboss.shopmgmt.util.DeviceIntegrityStatus
import com.beboss.shopmgmt.util.DiscoveredBranchHub
import com.beboss.shopmgmt.util.LocalServerStatus
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.LocationHelper
import com.beboss.shopmgmt.util.MessageAuditManager
import com.beboss.shopmgmt.util.MessageDispatchRecord
import com.beboss.shopmgmt.util.OfflineSubscriptionManager
import com.beboss.shopmgmt.util.PdfReportGenerator
import com.beboss.shopmgmt.util.PermissionManager
import com.beboss.shopmgmt.util.ReceiptGenerator
import com.beboss.shopmgmt.util.ShopDataTransferManager
import com.beboss.shopmgmt.util.ShopImportSummary
import com.beboss.shopmgmt.util.SubscriptionSecurityManager
import com.beboss.shopmgmt.util.SupabaseAdminSession
import com.beboss.shopmgmt.util.SupabaseAuditLogDto
import com.beboss.shopmgmt.util.SupabaseBranchSnapshotDto
import com.beboss.shopmgmt.util.SupabasePaymentRequestDto
import com.beboss.shopmgmt.util.SupabaseShopAccountDto
import com.beboss.shopmgmt.util.SupabaseShopDeviceDto
import com.beboss.shopmgmt.util.SupabaseShopUserDto
import com.beboss.shopmgmt.util.SupabaseUnlockCodeDto
import com.beboss.shopmgmt.util.SyncAuditLog
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import java.io.File
import java.util.UUID
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    shopProfile: ShopProfile,
    currentUser: User? = null,
    allUsers: List<User> = emptyList(),
    branches: List<com.beboss.shopmgmt.data.model.Branch> = emptyList(),
    shopDevices: List<ShopDevice> = emptyList(),
    livePaymentConfig: AdminPaymentConfig = OfflineSubscriptionManager.getCurrentPaymentConfig(),
    products: List<Product> = emptyList(),
    customers: List<Customer> = emptyList(),
    sales: List<Sale> = emptyList(),
    customerPayments: List<CustomerPayment> = emptyList(),
    pendingSyncCount: Int = 0,
    isSyncing: Boolean = false,
    connectivityStatus: ConnectivityStatus = ConnectivityStatus.AVAILABLE,
    cloudSyncReport: CloudSyncReport? = null,
    databaseStats: DatabaseEngineStats? = null,
    isOptimizingDb: Boolean = false,
    language: AppLanguage,
    isDarkTheme: Boolean,
    localServerStatus: LocalServerStatus = LocalServerStatus.STOPPED,
    localServerIp: String? = null,
    localConnectedClients: Int = 0,
    localLastReceivedPacket: String? = null,
    isP2pSyncing: Boolean = false,
    syncAuditLogs: List<SyncAuditLog> = emptyList(),
    onToggleLanguage: () -> Unit,
    onToggleTheme: () -> Unit,
    onSaveProfile: (ShopProfile) -> Unit,
    onSyncNow: () -> Unit = {},
    onSyncToCloudNow: () -> Unit = {},
    onSyncCloudWithEndpoint: (String?) -> Unit = {},
    onTestPing: (String, (com.beboss.shopmgmt.util.EndpointPingResult) -> Unit) -> Unit = { _, _ -> },
    onToggleLocalServer: (Boolean) -> Unit = {},
    onSyncWithLocalHub: (String) -> Unit = {},
    onSaveBranch: (com.beboss.shopmgmt.data.model.Branch) -> Unit = {},
    onDeleteBranch: (String) -> Unit = {},
    onAddShopDevice: (deviceName: String, assignedUser: User, branch: com.beboss.shopmgmt.data.model.Branch?, onCreated: (ShopDevice) -> Unit) -> Unit = { _, _, _, _ -> },
    onToggleShopDeviceActive: (deviceId: String, isActive: Boolean) -> Unit = { _, _ -> },
    onDeleteShopDevice: (deviceId: String) -> Unit = {},
    stockTransfers: List<com.beboss.shopmgmt.data.model.StockTransfer> = emptyList(),
    onCreateStockTransfer: (productId: String, fromBranchId: String, fromBranchName: String, toBranchId: String, toBranchName: String, quantity: Double, notes: String) -> Unit = { _, _, _, _, _, _, _ -> },
    onDeleteStockTransfer: (String) -> Unit = {},
    selectedBranchId: String = "ALL",
    onSelectActiveBranch: (String) -> Unit = {},
    onSaveUser: (User) -> Unit = {},
    onDeleteUser: (String) -> Unit = {},
    onImportPackage: (ShopImportSummary) -> Unit = {},
    onImportBranchToken: ((String, (Boolean, String) -> Unit) -> Unit)? = null,
    onRequestLegacyShareOtp: (((Boolean, String) -> Unit) -> Unit)? = null,
    onImportLegacyShareToken: ((String, String, (Boolean, String) -> Unit) -> Unit)? = null,
    onRefreshDatabaseStats: () -> Unit = {},
    onOptimizeDatabase: () -> Unit = {},
    onVerifyDatabaseIntegrity: () -> Unit = {},
    onClearTransactionalData: () -> Unit = {},
    onClearAllProducts: () -> Unit = {},
    onClearAllCustomers: () -> Unit = {},
    onResetWholeApp: () -> Unit = {},
    onLockApp: () -> Unit = {},
    onLogout: () -> Unit = {},
    onSwitchUser: (User) -> Unit = {},
    onActivateVoucher: (String) -> Unit = {},
    onProcessDirectPayment: ((provider: String, phone: String, durationMonths: Int, userReference: String?, onSuccess: (com.beboss.shopmgmt.util.PaymentProcessingResult, com.beboss.shopmgmt.util.SubscriptionPriceBreakdown) -> Unit) -> Unit)? = null,
    deadLetterSyncCount: Int = 0,
    deviceIntegrityStatus: DeviceIntegrityStatus? = null,
    paymentVerificationRequests: List<PaymentVerificationRequest> = emptyList(),
    discoveredHubs: List<DiscoveredBranchHub> = emptyList(),
    isDiscoveringHubs: Boolean = false,
    peerSyncEvents: List<BranchPeerSyncEvent> = emptyList(),
    onStartLanDiscovery: () -> Unit = {},
    onStopLanDiscovery: () -> Unit = {},
    onGenerateBranchShareToken: ((String?, (String) -> Unit) -> Unit)? = null,
    onExportFullBranchPackage: ((String?, (File) -> Unit) -> Unit)? = null,
    onSubmitPaymentVerification: ((provider: String, payerPhone: String, payerFullName: String, username: String, registeredPhone: String, durationMonths: Int, branchCount: Int, workerCount: Int, deviceCount: Int, paymentNote: String, onDone: (PaymentVerificationRequest, Boolean) -> Unit) -> Unit)? = null,
    onCheckCloudApproval: () -> Unit = {},
    adminSession: SupabaseAdminSession? = null,
    adminAuthError: String? = null,
    isAdminAuthenticating: Boolean = false,
    adminPaymentRequests: List<SupabasePaymentRequestDto> = emptyList(),
    adminShopAccounts: List<SupabaseShopAccountDto> = emptyList(),
    adminShopUsers: List<SupabaseShopUserDto> = emptyList(),
    adminShopDevices: List<SupabaseShopDeviceDto> = emptyList(),
    adminBranchSnapshots: List<SupabaseBranchSnapshotDto> = emptyList(),
    adminUnlockCodes: List<SupabaseUnlockCodeDto> = emptyList(),
    adminAuditLogs: List<SupabaseAuditLogDto> = emptyList(),
    localAuditLogs: List<LocalAuditLog> = emptyList(),
    isAdminLoading: Boolean = false,
    onAdminSignIn: (String, String) -> Unit = { _, _ -> },
    onAdminSignUp: (String, String, String) -> Unit = { _, _, _ -> },
    onAdminSignOut: () -> Unit = {},
    onRefreshAdminDashboard: () -> Unit = {},
    onAdminApprovePayment: ((SupabasePaymentRequestDto, String, (Boolean, String) -> Unit) -> Unit)? = null,
    onAdminSavePaymentConfig: ((AdminPaymentConfig, (Boolean) -> Unit) -> Unit)? = null,
    onAdminToggleShopDevice: (SupabaseShopDeviceDto, Boolean) -> Unit = { _, _ -> },
    onAdminDeleteShopDevice: (SupabaseShopDeviceDto) -> Unit = {},
    onAdminRejectPayment: (SupabasePaymentRequestDto, String) -> Unit = { _, _ -> },
    onAdminRevokeCode: (SupabaseUnlockCodeDto) -> Unit = {},
    onAdminExtendShopSubscription: (SupabaseShopAccountDto, Int) -> Unit = { _, _ -> },
    onAdminResetShopTrial: (SupabaseShopAccountDto) -> Unit = {},
    onAdminSetShopStatus: (SupabaseShopAccountDto, String) -> Unit = { _, _ -> },
    onAdminUpdateShopLimits: (SupabaseShopAccountDto, Int, Int, Int) -> Unit = { _, _, _, _ -> },
    onAdminDeleteShopAccount: (SupabaseShopAccountDto) -> Unit = {},
    onAdminUpdateShopUserRole: (SupabaseShopUserDto, String) -> Unit = { _, _ -> },
    onAdminToggleShopUserActive: (SupabaseShopUserDto, Boolean) -> Unit = { _, _ -> },
    onAdminDeleteShopUser: (SupabaseShopUserDto) -> Unit = {},
    onAdminDeleteBranchSnapshot: (SupabaseBranchSnapshotDto) -> Unit = {},
    onShareAdminWebPortal: () -> Unit = {},
    onShowSplashScreen: () -> Unit = {},
    onTestNotification: (String) -> Unit = {},
    onRequestPermissions: () -> Unit = {},
    onSelectLanguage: ((AppLanguage) -> Unit)? = null,
    idleLockMinutes: Int = 5,
    onSetIdleLockMinutes: (Int) -> Unit = {},
    adminLastSyncedAt: Long = 0L,
    clockTamperStatus: ClockTamperStatus = ClockGuard.tamperStatus.value,
    capturedLocation: CapturedLocation = LocationHelper.lastLocation.value,
    messageRecords: List<MessageDispatchRecord> = MessageAuditManager.records.value,
    onReInspectSecurity: () -> Unit = {},
    onCaptureLocation: () -> Unit = {}
) {
    val context = LocalContext.current

    val shopForm = remember(shopProfile) { ShopFormState(shopProfile) }
    var settingsSearchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("ALL") }
    var settingsUnlockCodeInput by remember { mutableStateOf("") }
    var lastAutoSubmittedCode by remember { mutableStateOf("") }
    var showStaffDialog by remember { mutableStateOf(false) }
    var showBranchDialog by remember { mutableStateOf(false) }
    var showShopDevicesDialog by remember { mutableStateOf(false) }
    var showSyncHubDialog by remember { mutableStateOf(false) }
    var showDataTransferDialog by remember { mutableStateOf(false) }
    var showSubscriptionDialog by remember { mutableStateOf(false) }
    var showAdminConsoleDialog by remember { mutableStateOf(false) }
    var showPermissionsDialog by remember { mutableStateOf(false) }
    var showThermalPreviewDialog by remember { mutableStateOf(false) }
    var showResetTransactionsDialog by remember { mutableStateOf(false) }
    var showClearProductsDialog by remember { mutableStateOf(false) }
    var showClearCustomersDialog by remember { mutableStateOf(false) }
    var showResetWholeAppDialog by remember { mutableStateOf(false) }
    var showLogoutConfirm by remember { mutableStateOf(false) }
    var showDiagnosticsDialog by remember { mutableStateOf(false) }
    var currencyExpanded by remember { mutableStateOf(false) }

    val settingsCategories = remember(language) {
        listOf(
            Category("ALL", Localization.get("cat_all", language), Icons.Default.SettingsSuggest, OrangePrimary),
            Category("LANGUAGE", Localization.get("cat_language", language), Icons.Default.Language, OrangePrimary),
            Category("LICENSE", Localization.get("cat_license", language), Icons.Default.Key, ProfitGreen),
            Category("SYNC", Localization.get("cat_sync", language), Icons.Default.Sync, Color(0xFF0284C7)),
            Category("SHOP", Localization.get("cat_shop", language), Icons.Default.Storefront, OrangePrimary),
            Category("TEAM", Localization.get("cat_team", language), Icons.Default.Group, DarkNavy),
            Category("SECURITY", Localization.get("cat_security", language), Icons.Default.Security, ProfitGreen)
        )
    }

    fun shouldShowSection(category: String, keywords: String): Boolean {
        val catOk = selectedCategory == "ALL" || selectedCategory == category
        if (!catOk) return false
        val q = settingsSearchQuery.trim()
        if (q.isEmpty()) return true
        return keywords.contains(q, ignoreCase = true) || category.contains(q, ignoreCase = true)
    }

    val isOnline = connectivityStatus == ConnectivityStatus.AVAILABLE
    val integrity = deviceIntegrityStatus ?: remember { com.beboss.shopmgmt.util.DeviceSecurityManager.inspectDeviceIntegrity() }
    val keystoreLabel = remember { com.beboss.shopmgmt.util.CryptoKeyManager.getHardwareKeystoreStatus() }
    val hasContacts = PermissionManager.hasContactsPermission(context)
    val hasSms = PermissionManager.hasSmsPermission(context)
    val hasNotifications = PermissionManager.hasNotificationPermission(context)
    val hasCamera = PermissionManager.hasCameraPermission(context)
    val isAllGranted = hasContacts && hasSms && hasNotifications && hasCamera
    val isActive = shopProfile.isSubscriptionActive
    val daysRemaining = shopProfile.daysRemaining
    val activeBranchCount = branches.size.coerceAtLeast(1)
    val activeWorkerCount = allUsers.size.coerceAtLeast(1)
    val activeDeviceCount = shopDevices.count { it.isActive }.coerceAtLeast(1)
    val currentPricing = OfflineSubscriptionManager.calculateSubscriptionPrice(
        branchCount = activeBranchCount,
        workerCount = activeWorkerCount,
        durationMonths = 1,
        deviceCount = activeDeviceCount
    )
    val ownerAccount = remember(currentUser, allUsers) {
        allUsers.firstOrNull { it.role == UserRole.OWNER } ?: currentUser ?: allUsers.firstOrNull()
    }
    val deviceCode = remember(shopProfile) {
        OfflineSubscriptionManager.getDeviceChallengeCode(shopProfile)
    }
    val isCompleteCode = SubscriptionSecurityManager.isCompleteUnlockCodeFormat(settingsUnlockCodeInput)
    val liveWhatsApp = livePaymentConfig.adminWhatsAppNumber.trim()
        .ifBlank { shopProfile.adminWhatsAppNumber.trim() }

    // Only the authenticated local OWNER can manage tenant credential migration.
    val canEnrollDeviceCredential = currentUser != null
    val canRetireLegacySync = currentUser?.role == UserRole.OWNER
    val registeredOwnerUsername = ownerAccount?.username?.trim().orEmpty()
    val registeredOwnerPhone = ownerAccount?.phone?.trim().orEmpty().ifBlank { shopProfile.phone.trim() }
    val credentialShopId = remember(registeredOwnerUsername, registeredOwnerPhone) {
        if (registeredOwnerUsername.isNotBlank() && registeredOwnerPhone.isNotBlank()) {
            SupabaseAdminClient.computeShopSyncKey(registeredOwnerUsername, registeredOwnerPhone)
        } else ""
    }
    val coroutineScope = rememberCoroutineScope()
    var deviceCredentialReady by remember(credentialShopId) {
        mutableStateOf(credentialShopId.isNotBlank() && AndroidDeviceCredentialStore.hasCredentialForShop(credentialShopId))
    }
    var legacySyncRetired by remember(credentialShopId) { mutableStateOf(false) }
    var showDeviceCredentialDialog by remember { mutableStateOf(false) }
    var showLegacyRetirementConfirm by remember { mutableStateOf(false) }
    var deviceCredentialPurpose by remember { mutableStateOf("ENROLL") }
    var deviceCredentialOtp by remember { mutableStateOf("") }
    var deviceCredentialBusy by remember { mutableStateOf(false) }
    var deviceCredentialOtpSent by remember { mutableStateOf(false) }
    var deviceCredentialMessage by remember { mutableStateOf("") }

    fun requestDeviceCredentialOtp(purpose: String) {
        if (!canEnrollDeviceCredential || registeredOwnerUsername.isBlank() || registeredOwnerPhone.isBlank()) {
            deviceCredentialMessage = "Complete the registered owner username and phone before enabling secure device sync."
            showDeviceCredentialDialog = true
            return
        }
        deviceCredentialPurpose = purpose
        deviceCredentialOtp = ""
        deviceCredentialOtpSent = false
        deviceCredentialMessage = "Sending an owner verification code to the registered shop phone…"
        showDeviceCredentialDialog = true
        deviceCredentialBusy = true
        coroutineScope.launch {
            val result = SupabaseAdminClient.requestOwnerDeviceCredentialOtp(
                registeredOwnerUsername,
                registeredOwnerPhone
            )
            deviceCredentialBusy = false
            deviceCredentialOtpSent = result.isSuccess
            deviceCredentialMessage = result.exceptionOrNull()?.message
                ?: "A verification code was requested. Enter the code sent to the registered owner phone."
        }
    }

    fun submitDeviceCredentialOtp() {
        if (deviceCredentialBusy || deviceCredentialOtp.length !in 6..8) return
        deviceCredentialBusy = true
        deviceCredentialMessage = "Verifying the registered owner and updating this terminal…"
        coroutineScope.launch {
            if (deviceCredentialPurpose == "ENROLL") {
                val result = SupabaseAdminClient.enrollCurrentAndroidDevice(
                    context,
                    registeredOwnerUsername,
                    registeredOwnerPhone,
                    deviceCredentialOtp
                )
                deviceCredentialBusy = false
                if (result.isSuccess) {
                    deviceCredentialReady = true
                    deviceCredentialMessage = result.getOrNull().orEmpty()
                    showDeviceCredentialDialog = false
                } else {
                    deviceCredentialMessage = result.exceptionOrNull()?.message
                        ?: "This terminal could not be enrolled. Check the owner code and device registration."
                }
            } else {
                val result = SupabaseAdminClient.retireLegacyAndroidSync(
                    registeredOwnerUsername,
                    registeredOwnerPhone,
                    deviceCredentialOtp
                )
                deviceCredentialBusy = false
                if (result.isSuccess) {
                    legacySyncRetired = true
                    deviceCredentialMessage = "Legacy tenant sync has been retired for this shop. All registered active terminals must use their device credentials."
                    showDeviceCredentialDialog = false
                } else {
                    deviceCredentialMessage = result.exceptionOrNull()?.message
                        ?: "Legacy sync was not retired. Enroll every active terminal first."
                }
            }
        }
    }

    LaunchedEffect(settingsUnlockCodeInput) {
        val clean = normalizeUnlockCodeInput(settingsUnlockCodeInput)
        if (SubscriptionSecurityManager.isCompleteUnlockCodeFormat(clean) && clean != lastAutoSubmittedCode) {
            lastAutoSubmittedCode = clean
            onActivateVoucher(clean)
            settingsUnlockCodeInput = ""
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item { SettingsHeroCard(shopProfile = shopProfile, language = language) }

        item {
            SettingsSearchBar(
                query = settingsSearchQuery,
                onQueryChange = { settingsSearchQuery = it },
                language = language
            )
        }

        item {
            CategoryFilterChips(
                categories = settingsCategories,
                selectedCategory = selectedCategory,
                onCategoryClick = { selectedCategory = it },
                language = language
            )
        }

        // Language & Theme Section
        if (shouldShowSection("LANGUAGE", "language theme dark light english kinyarwanda french swahili ururimi langue lugha display")) {
            item { LanguageThemeCard(
                language = language,
                isDarkTheme = isDarkTheme,
                onSelectLanguage = onSelectLanguage ?: { onToggleLanguage() },
                onToggleTheme = onToggleTheme,
                onToggleLanguage = onToggleLanguage
            ) }
        }

        // Active User & Team Section
        if (shouldShowSection("TEAM", "staff users branches backup export share apk logout lock terminal role abakozi amashami")) {
            item { ActiveUserTeamCard(
                currentUser = currentUser,
                allUsers = allUsers,
                branches = branches,
                shopDevices = shopDevices,
                language = language,
                onLockApp = onLockApp,
                onShowStaffDialog = { showStaffDialog = true },
                onShowBranchDialog = { showBranchDialog = true },
                onShowShopDevicesDialog = { showShopDevicesDialog = true },
                onShowDataTransferDialog = { showDataTransferDialog = true },
                onShareApk = { OfflineSubscriptionManager.shareAppApkOffline(context) },
                onLogout = { showLogoutConfirm = true }
            ) }
        }

        // Cloud & LAN Sync Section
        if (shouldShowSection("SYNC", "cloud sync lan network branch hub offline online push supabase")) {
            item { CloudSyncCard(
                isOnline = isOnline,
                isSyncing = isSyncing,
                cloudSyncReport = cloudSyncReport,
                connectivityStatus = connectivityStatus,
                language = language,
                onSyncToCloudNow = onSyncToCloudNow,
                onOpenSyncHub = { showSyncHubDialog = true }
            ) }
        }

        // Owner-only authenticated device credentials and safe legacy migration.
        if (canEnrollDeviceCredential && shouldShowSection("SYNC", "device security credential authenticated terminal migration legacy tenant isolation")) {
            item {
                SettingsSectionCard(
                    title = "Authenticated device sync",
                    subtitle = "Per-terminal credentials protected by Android Keystore",
                    icon = Icons.Default.VerifiedUser,
                    iconColor = ProfitGreen
                ) {
                    Text(
                        text = if (deviceCredentialReady) {
                            "This terminal is enrolled with a unique, revocable device credential."
                        } else {
                            "This terminal is still using the compatibility sync route. Enroll it before retiring the legacy shop key."
                        },
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Active registered terminals: " + shopDevices.count { it.isActive } +
                            ". Each active terminal must be enrolled separately.",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = { requestDeviceCredentialOtp("ENROLL") },
                        enabled = !deviceCredentialBusy && isOnline && registeredOwnerUsername.isNotBlank() && registeredOwnerPhone.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 46.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary)
                    ) {
                        Icon(Icons.Default.VerifiedUser, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            if (deviceCredentialReady) "Re-enroll / rotate this device credential" else "Secure this Android terminal",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { showLegacyRetirementConfirm = true },
                        enabled = canRetireLegacySync && deviceCredentialReady && !legacySyncRetired && !deviceCredentialBusy && isOnline,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(17.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            if (canRetireLegacySync) "Retire legacy shop sync for all devices" else "Only the shop owner can retire legacy sync",
                            fontSize = 11.sp
                        )
                    }
                    if (legacySyncRetired) {
                        Text(
                            "Legacy sync is retired. Old app builds and terminals without credentials will no longer sync this shop.",
                            fontSize = 11.sp,
                            color = WarningAmber,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    } else {
                        Text(
                            "Do not retire the legacy route until every active terminal listed above has been enrolled and tested online. The server refuses the cutover when any active registered terminal is missing a valid credential.",
                            fontSize = 10.sp,
                            color = WarningAmber,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            }
        }

        // License & Subscription Section
        if (shouldShowSection("LICENSE", "subscription license unlock code bb2 momo airtel ussd whatsapp trial pay")) {
            item { LicenseSubscriptionCard(
                shopProfile = shopProfile,
                isActive = isActive,
                daysRemaining = daysRemaining,
                currentPricing = currentPricing,
                activeDeviceCount = activeDeviceCount,
                ownerAccount = ownerAccount,
                deviceCode = deviceCode,
                liveWhatsApp = liveWhatsApp,
                settingsUnlockCodeInput = settingsUnlockCodeInput,
                onUnlockCodeChange = { settingsUnlockCodeInput = it },
                isCompleteCode = isCompleteCode,
                language = language,
                onDialMtn = { OfflineSubscriptionManager.dialMtnMoMo(context, currentPricing.totalPayable) },
                onDialAirtel = { OfflineSubscriptionManager.dialAirtelMoney(context, currentPricing.totalPayable) },
                onShowSubscriptionDialog = { showSubscriptionDialog = true },
                onActivateVoucher = { code ->
                    val normalized = normalizeUnlockCodeInput(code)
                    lastAutoSubmittedCode = normalized
                    onActivateVoucher(normalized)
                    settingsUnlockCodeInput = ""
                },
                onSyncCloudApprovals = onCheckCloudApproval,
                paymentVerificationRequests = paymentVerificationRequests
            ) }
        }

        // Admin Console Section
        if (shouldShowSection("LICENSE", "admin console master supabase web portal unlock codes verification")) {
            item { AdminConsoleCard(
                adminSession = adminSession,
                language = language,
                onOpenConsole = {
                    onRefreshAdminDashboard()
                    showAdminConsoleDialog = true
                },
                onShareWebPortal = onShareAdminWebPortal
            ) }
        }

        // Shop Profile Section
        if (shouldShowSection("SHOP", "shop profile name owner phone tin tax vat currency address")) {
            item { ShopProfileCard(
                formState = shopForm,
                language = language,
                currencyExpanded = currencyExpanded,
                onCurrencyExpandedChange = { currencyExpanded = it },
                onSave = {
                    val parsedTax = shopForm.taxRateText.toDoubleOrNull() ?: 0.0
                    val parsedDailyTarget = shopForm.dailySalesTargetText.toDoubleOrNull() ?: shopProfile.dailySalesTarget
                    val parsedMonthlyTarget = shopForm.monthlyRevenueTargetText.toDoubleOrNull() ?: shopProfile.monthlyRevenueTarget
                    val parsedMargin = shopForm.targetMarginText.toDoubleOrNull() ?: shopProfile.targetMarginPercent
                    val parsedFloat = shopForm.cashFloatText.toDoubleOrNull() ?: shopProfile.cashRegisterFloat

                    onSaveProfile(
                        shopProfile.copy(
                            shopName = shopForm.shopName.trim(),
                            name = shopForm.ownerName.trim(),
                            phone = shopForm.phone.trim(),
                            address = shopForm.address.trim(),
                            tinNumber = shopForm.tinNumber.trim(),
                            taxRate = parsedTax,
                            receiptHeader = shopForm.receiptHeader.trim(),
                            receiptFooter = shopForm.receiptFooter.trim(),
                            currencyCode = shopForm.currencyCode,
                            currencySymbol = shopForm.currencySymbol,
                            dailySalesTarget = parsedDailyTarget,
                            monthlyRevenueTarget = parsedMonthlyTarget,
                            targetMarginPercent = parsedMargin,
                            cashRegisterFloat = parsedFloat,
                            receiptPaperWidthMm = shopForm.paperWidthMm,
                            showLogoOnReceipt = shopForm.showLogoOnReceipt,
                            showTaxOnReceipt = shopForm.showTaxOnReceipt,
                            showBarcodeOnReceipt = shopForm.showBarcodeOnReceipt,
                            autoPrintReceiptOnSale = shopForm.autoPrintReceiptOnSale,
                            soundFeedbackEnabled = shopForm.soundFeedbackEnabled,
                            hapticFeedbackEnabled = shopForm.hapticFeedbackEnabled
                        )
                    )
                    Toast.makeText(context, Localization.get("save_shop_profile", language), Toast.LENGTH_SHORT).show()
                }
            ) }
        }

        // Financial Targets Section
        if (shouldShowSection("SHOP", "financial targets daily monthly goal margin cash register float")) {
            item { FinancialTargetsCard(
                formState = shopForm,
                language = language,
                currencySymbol = shopForm.currencySymbol
            ) }
        }

        // Thermal Printer & Receipts Section
        if (shouldShowSection("SHOP", "thermal printer receipt paper 58mm 80mm esc pos logo tax barcode qr")) {
            item { ThermalPrinterCard(
                formState = shopForm,
                language = language,
                onPreviewClick = { showThermalPreviewDialog = true }
            ) }
        }

        // Sound & Haptic Section
        if (shouldShowSection("SHOP", "audio sound chime haptic vibration feedback pos")) {
            item { SensoryFeedbackCard(
                formState = shopForm,
                language = language
            ) }
        }

        // Terminal Security & Auto-Lock Section
        if (shouldShowSection("SECURITY", "security autolock idle timeout hardware integrity strongbox keystore sqlcipher aes audit")) {
            item { TerminalSecurityCard(
                integrity = integrity,
                keystoreLabel = keystoreLabel,
                idleLockMinutes = idleLockMinutes,
                language = language,
                onSetIdleLockMinutes = onSetIdleLockMinutes,
                onOpenDiagnostics = {
                    onRefreshDatabaseStats()
                    showDiagnosticsDialog = true
                }
            ) }
        }

        // Database Engine Section
        if (shouldShowSection("SECURITY", "sqlite database engine sqlcipher pragma integrity wal checkpoint reset wipe factory")) {
            item { DatabaseEngineCard(
                databaseStats = databaseStats,
                products = products,
                sales = sales,
                customers = customers,
                customerPayments = customerPayments,
                pendingSyncCount = pendingSyncCount,
                isOptimizingDb = isOptimizingDb,
                language = language,
                onRefreshStats = onRefreshDatabaseStats,
                onVerifyIntegrity = onVerifyDatabaseIntegrity,
                onOptimize = onOptimizeDatabase,
                onOpenDiagnostics = {
                    onRefreshDatabaseStats()
                    showDiagnosticsDialog = true
                },
                onResetTransactions = { showResetTransactionsDialog = true },
                onWipeProducts = { showClearProductsDialog = true },
                onWipeCustomers = { showClearCustomersDialog = true },
                onFactoryReset = { showResetWholeAppDialog = true }
            ) }
        }

        // Device Permissions Section
        if (shouldShowSection("SECURITY", "permissions contacts sms messages notifications camera scanner")) {
            item { DevicePermissionsCard(
                hasContacts = hasContacts,
                hasSms = hasSms,
                hasNotifications = hasNotifications,
                hasCamera = hasCamera,
                isAllGranted = isAllGranted,
                language = language,
                onManagePermissions = { showPermissionsDialog = true }
            ) }
        }

        // Push Notifications Section
        if (shouldShowSection("SECURITY", "notifications alerts push sale low stock debt transfer goal sync")) {
            item { PushNotificationsCard(
                language = language,
                onTestNotification = onTestNotification
            ) }
        }

        // About/Branding Section
        if (shouldShowSection("LANGUAGE", "about brand version splash intro beboss")) {
            item { AboutBrandCard(
                language = language,
                onReplaySplash = onShowSplashScreen
            ) }
        }
    }

    // Dialogs
    if (showThermalPreviewDialog) ThermalPreviewDialog(
        paperWidthMm = shopForm.paperWidthMm,
        shopName = shopForm.shopName,
        receiptHeader = shopForm.receiptHeader,
        address = shopForm.address,
        phone = shopForm.phone,
        ownerName = shopForm.ownerName,
        tinNumber = shopForm.tinNumber,
        showLogoOnReceipt = shopForm.showLogoOnReceipt,
        showTaxOnReceipt = shopForm.showTaxOnReceipt,
        showBarcodeOnReceipt = shopForm.showBarcodeOnReceipt,
        receiptFooter = shopForm.receiptFooter,
        currencySymbol = shopForm.currencySymbol,
        onDismiss = { showThermalPreviewDialog = false },
        onTestPrint = {
            printThermalTestPage(
                context = context,
                paperWidthMm = shopForm.paperWidthMm,
                shopName = shopForm.shopName,
                receiptHeader = shopForm.receiptHeader,
                address = shopForm.address,
                phone = shopForm.phone,
                ownerName = shopForm.ownerName,
                tinNumber = shopForm.tinNumber,
                showTaxOnReceipt = shopForm.showTaxOnReceipt,
                receiptFooter = shopForm.receiptFooter,
                currencySymbol = shopForm.currencySymbol
            )
            showThermalPreviewDialog = false
        },
        language = language
    )

    if (showResetTransactionsDialog) ResetTransactionsDialog(
        onConfirm = {
            showResetTransactionsDialog = false
            onClearTransactionalData()
            Toast.makeText(context, "Sales history reset successfully. Catalog preserved!", Toast.LENGTH_LONG).show()
        },
        onDismiss = { showResetTransactionsDialog = false },
        language = language
    )

    if (showClearProductsDialog) ConfirmDestructiveDialog(
        title = "Wipe All Products?",
        message = "This will permanently delete ALL products from your catalog. This action cannot be undone.",
        confirmText = "Delete All Products",
        onConfirm = {
            showClearProductsDialog = false
            onClearAllProducts()
        },
        onDismiss = { showClearProductsDialog = false },
        destructive = true,
        language = language
    )

    if (showClearCustomersDialog) ConfirmDestructiveDialog(
        title = "Wipe All Customers?",
        message = "This will permanently delete ALL customers and their debt records. This action cannot be undone.",
        confirmText = "Delete All Customers",
        onConfirm = {
            showClearCustomersDialog = false
            onClearAllCustomers()
        },
        onDismiss = { showClearCustomersDialog = false },
        destructive = true,
        language = language
    )

    if (showResetWholeAppDialog) ConfirmDestructiveDialog(
        title = "Factory Reset Whole App?",
        message = "This will completely wipe the application: all products, customers, sales, staff, branches, settings, and licenses. The app will return to first-run state. THIS CANNOT BE UNDONE.",
        confirmText = "Factory Reset Everything",
        onConfirm = {
            showResetWholeAppDialog = false
            onResetWholeApp()
        },
        onDismiss = { showResetWholeAppDialog = false },
        destructive = true,
        language = language
    )

    if (showLogoutConfirm) ConfirmDialog(
        title = Localization.get("logout", language),
        message = Localization.get("logout_confirm_msg", language),
        confirmText = Localization.get("logout", language),
        onConfirm = {
            showLogoutConfirm = false
            onLogout()
        },
        onDismiss = { showLogoutConfirm = false },
        language = language
    )

    // Dialogs for Team, Multi-Branch, Sync, Licensing, Admin & Diagnostics
    if (showStaffDialog) StaffManagementDialog(
        allUsers = allUsers,
        currentUser = currentUser,
        branches = branches,
        shopProfile = shopProfile,
        language = language,
        onSaveUser = onSaveUser,
        onDeleteUser = onDeleteUser,
        onDismiss = { showStaffDialog = false }
    )

    if (showBranchDialog) BranchManagementDialog(
        branches = branches,
        allUsers = allUsers,
        products = products,
        sales = sales,
        stockTransfers = stockTransfers,
        currencySymbol = shopProfile.currencySymbol,
        selectedBranchId = selectedBranchId,
        language = language,
        onSelectActiveBranch = onSelectActiveBranch,
        onSaveBranch = onSaveBranch,
        onDeleteBranch = onDeleteBranch,
        onCreateStockTransfer = onCreateStockTransfer,
        onDeleteStockTransfer = onDeleteStockTransfer,
        onDismiss = { showBranchDialog = false }
    )

    if (showShopDevicesDialog) ShopDevicesDialog(
        shopDevices = shopDevices,
        allUsers = allUsers,
        branches = branches,
        currentUser = currentUser,
        language = language,
        onAddDevice = onAddShopDevice,
        onToggleActive = onToggleShopDeviceActive,
        onDelete = onDeleteShopDevice,
        onDismiss = { showShopDevicesDialog = false }
    )

    if (showSyncHubDialog) ShopOwnerSyncHubDialog(
        shopProfile = shopProfile,
        currentUser = currentUser,
        allUsers = allUsers,
        branches = branches,
        sales = sales,
        products = products,
        customers = customers,
        customerPayments = customerPayments,
        stockTransfers = stockTransfers,
        cloudSyncReport = cloudSyncReport,
        isSyncing = isSyncing,
        language = language,
        localServerStatus = localServerStatus,
        localServerIp = localServerIp,
        localConnectedClients = localConnectedClients,
        localLastReceivedPacket = localLastReceivedPacket,
        discoveredHubs = discoveredHubs,
        isDiscoveringHubs = isDiscoveringHubs,
        peerSyncEvents = peerSyncEvents,
        isP2pSyncing = isP2pSyncing,
        syncAuditLogs = syncAuditLogs,
        onStartLanDiscovery = onStartLanDiscovery,
        onStopLanDiscovery = onStopLanDiscovery,
        onGenerateBranchShareToken = onGenerateBranchShareToken,
        onExportFullBranchPackage = onExportFullBranchPackage,
        onSyncToCloudNow = onSyncToCloudNow,
        onSyncCloudWithEndpoint = onSyncCloudWithEndpoint,
        onTestPing = onTestPing,
        onToggleLocalServer = onToggleLocalServer,
        onSyncWithLocalHub = onSyncWithLocalHub,
        onImportBranchPacket = onImportPackage,
        onImportBranchToken = onImportBranchToken,
        onDismiss = { showSyncHubDialog = false }
    )

    if (showSubscriptionDialog) {
        Dialog(
            onDismissRequest = { showSubscriptionDialog = false },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.background
            ) {
                SubscriptionScreen(
                    shopProfile = shopProfile,
                    branches = branches,
                    allUsers = allUsers,
                    shopDevices = shopDevices,
                    currentUser = currentUser,
                    paymentRequests = paymentVerificationRequests,
                    livePaymentConfig = livePaymentConfig,
                    language = language,
                    onActivateVoucher = onActivateVoucher,
                    onProcessDirectPayment = onProcessDirectPayment,
                    onSubmitPaymentVerification = onSubmitPaymentVerification,
                    onCheckCloudApproval = onCheckCloudApproval,
                    onClose = { showSubscriptionDialog = false }
                )
            }
        }
    }

    if (showAdminConsoleDialog) AdminVerificationConsoleDialog(
        shopProfile = shopProfile,
        adminSession = adminSession,
        adminAuthError = adminAuthError,
        isAdminAuthenticating = isAdminAuthenticating,
        paymentRequests = adminPaymentRequests,
        shopAccounts = adminShopAccounts,
        shopUsers = adminShopUsers,
        shopDevices = adminShopDevices,
        branchSnapshots = adminBranchSnapshots,
        unlockCodes = adminUnlockCodes,
        auditLogs = adminAuditLogs,
        localAuditLogs = localAuditLogs,
        paymentConfig = livePaymentConfig,
        isLoading = isAdminLoading,
        language = language,
        lastSyncedAt = adminLastSyncedAt,
        onSignInAdmin = onAdminSignIn,
        onSignUpAdmin = onAdminSignUp,
        onSignOutAdmin = onAdminSignOut,
        onRefresh = onRefreshAdminDashboard,
        onApprovePayment = onAdminApprovePayment ?: { _, _, onDone -> onDone(false, "Admin approval unavailable") },
        onSavePaymentConfig = onAdminSavePaymentConfig ?: { _, onDone -> onDone(false) },
        onToggleShopDeviceActive = onAdminToggleShopDevice,
        onDeleteShopDevice = onAdminDeleteShopDevice,
        onRejectPayment = onAdminRejectPayment,
        onRevokeCode = onAdminRevokeCode,
        onExtendShopSubscription = onAdminExtendShopSubscription,
        onResetShopTrial = onAdminResetShopTrial,
        onSetShopStatus = onAdminSetShopStatus,
        onUpdateShopLimits = onAdminUpdateShopLimits,
        onDeleteShopAccount = onAdminDeleteShopAccount,
        onUpdateShopUserRole = onAdminUpdateShopUserRole,
        onToggleShopUserActive = onAdminToggleShopUserActive,
        onDeleteShopUser = onAdminDeleteShopUser,
        onDeleteBranchSnapshot = onAdminDeleteBranchSnapshot,
        onShareWebPortal = onShareAdminWebPortal,
        clockTamperStatus = clockTamperStatus,
        capturedLocation = capturedLocation,
        messageRecords = messageRecords,
        onReInspectSecurity = onReInspectSecurity,
        onDismiss = { showAdminConsoleDialog = false }
    )

    if (showDataTransferDialog) DataTransferDialog(
        shopProfile = shopProfile,
        allUsers = allUsers,
        products = products,
        customers = customers,
        sales = sales,
        customerPayments = customerPayments,
        currentUser = currentUser,
        onImportPackage = onImportPackage,
        onExportFullPackage = onExportFullBranchPackage?.let { exportFn ->
            { onReady -> exportFn(null, onReady) }
        },
        onCreateShareToken = onGenerateBranchShareToken?.let { tokenFn ->
            { onReady -> tokenFn(null, onReady) }
        },
        onImportBranchToken = onImportBranchToken,
        onDismiss = { showDataTransferDialog = false }
    )

    if (showLegacyRetirementConfirm) {
        AlertDialog(
            onDismissRequest = { showLegacyRetirementConfirm = false },
            title = { Text("Retire the legacy shop sync key?") },
            text = {
                Text(
                    "This is a one-way security cutover for the entire shop. Every active terminal in the cloud device registry must first be enrolled with its own credential. Older app builds will stop syncing after this change. Continue to owner phone verification?"
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showLegacyRetirementConfirm = false
                        requestDeviceCredentialOtp("RETIRE_LEGACY")
                    },
                    enabled = !deviceCredentialBusy && isOnline
                ) { Text("Continue to owner verification") }
            },
            dismissButton = {
                OutlinedButton(onClick = { showLegacyRetirementConfirm = false }) { Text("Cancel") }
            }
        )
    }

    if (showDeviceCredentialDialog) {
        AlertDialog(
            onDismissRequest = { if (!deviceCredentialBusy) showDeviceCredentialDialog = false },
            title = {
                Text(if (deviceCredentialPurpose == "ENROLL") "Verify owner to secure this terminal" else "Verify owner to retire legacy sync")
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        if (deviceCredentialPurpose == "ENROLL") {
                            "A one-time code is sent to the registered shop-owner phone. On success, this installation receives a unique device credential stored encrypted by Android Keystore."
                        } else {
                            "Enter the latest code sent to the registered shop-owner phone. The server will retire legacy access only when every active registered terminal has a valid device credential."
                        },
                        fontSize = 12.sp
                    )
                    OutlinedTextField(
                        value = deviceCredentialOtp,
                        onValueChange = { value ->
                            deviceCredentialOtp = value.filter(Char::isDigit).take(8)
                        },
                        label = { Text("SMS verification code") },
                        singleLine = true,
                        enabled = !deviceCredentialBusy,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        deviceCredentialMessage,
                        fontSize = 11.sp,
                        color = if (deviceCredentialOtpSent || deviceCredentialMessage.contains("enrolled", true) || deviceCredentialMessage.contains("retired", true)) ProfitGreen else MaterialTheme.colorScheme.error
                    )
                    if (deviceCredentialBusy) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Secure request in progress…", fontSize = 11.sp)
                        }
                    }
                    if (!deviceCredentialOtpSent && !deviceCredentialBusy) {
                        OutlinedButton(
                            onClick = { requestDeviceCredentialOtp(deviceCredentialPurpose) },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Send verification code again") }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { submitDeviceCredentialOtp() },
                    enabled = deviceCredentialOtp.length in 6..8 && deviceCredentialOtpSent && !deviceCredentialBusy
                ) {
                    Text(if (deviceCredentialPurpose == "ENROLL") "Enroll this device" else "Retire legacy sync")
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { showDeviceCredentialDialog = false },
                    enabled = !deviceCredentialBusy
                ) { Text("Cancel") }
            }
        )
    }

    if (showPermissionsDialog) PermissionRequestDialog(
        language = language,
        onDismiss = { showPermissionsDialog = false },
        onPermissionGranted = { showPermissionsDialog = false }
    )

    if (showDiagnosticsDialog) DiagnosticsDialog(
        shopProfile = shopProfile,
        databaseStats = databaseStats,
        deviceIntegrityStatus = integrity,
        connectivityStatus = connectivityStatus,
        pendingSyncCount = pendingSyncCount,
        deadLetterSyncCount = deadLetterSyncCount,
        isSyncing = isSyncing,
        isOptimizingDb = isOptimizingDb,
        syncAuditLogs = syncAuditLogs,
        localAuditLogs = localAuditLogs,
        adminLastSyncedAt = adminLastSyncedAt,
        language = language,
        clockTamperStatus = clockTamperStatus,
        capturedLocation = capturedLocation,
        messageRecords = messageRecords,
        onVerifyDatabaseIntegrity = onVerifyDatabaseIntegrity,
        onOptimizeDatabase = onOptimizeDatabase,
        onRefreshDatabaseStats = onRefreshDatabaseStats,
        onForceSyncNow = onSyncToCloudNow,
        onReInspectSecurity = onReInspectSecurity,
        onCaptureLocation = onCaptureLocation,
        onDismiss = { showDiagnosticsDialog = false }
    )
}

// ========================================================================
// DATA CLASSES & STATE
// ========================================================================

data class Category(
    val id: String,
    val label: String,
    val icon: ImageVector,
    val color: Color
)

class ShopFormState(profile: ShopProfile) {
    var shopName by mutableStateOf(profile.shopName)
    var ownerName by mutableStateOf(profile.name)
    var phone by mutableStateOf(profile.phone)
    var address by mutableStateOf(profile.address)
    var tinNumber by mutableStateOf(profile.tinNumber)
    var taxRateText by mutableStateOf(if (profile.taxRate > 0) profile.taxRate.toString() else "")
    var receiptHeader by mutableStateOf(profile.receiptHeader)
    var receiptFooter by mutableStateOf(profile.receiptFooter)
    var currencyCode by mutableStateOf(profile.currencyCode)
    var currencySymbol by mutableStateOf(profile.currencySymbol)
    var dailySalesTargetText by mutableStateOf(profile.dailySalesTarget.toLong().toString())
    var monthlyRevenueTargetText by mutableStateOf(profile.monthlyRevenueTarget.toLong().toString())
    var targetMarginText by mutableStateOf(profile.targetMarginPercent.toString())
    var cashFloatText by mutableStateOf(profile.cashRegisterFloat.toLong().toString())
    var paperWidthMm by mutableStateOf(profile.receiptPaperWidthMm)
    var showLogoOnReceipt by mutableStateOf(profile.showLogoOnReceipt)
    var showTaxOnReceipt by mutableStateOf(profile.showTaxOnReceipt)
    var showBarcodeOnReceipt by mutableStateOf(profile.showBarcodeOnReceipt)
    var autoPrintReceiptOnSale by mutableStateOf(profile.autoPrintReceiptOnSale)
    var soundFeedbackEnabled by mutableStateOf(profile.soundFeedbackEnabled)
    var hapticFeedbackEnabled by mutableStateOf(profile.hapticFeedbackEnabled)
}

// ========================================================================
// REUSABLE COMPONENTS
// ========================================================================

@Composable
fun SettingsHeroCard(shopProfile: ShopProfile, language: AppLanguage) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, OrangePrimary.copy(alpha = 0.35f)),
        elevation = CardDefaults.cardElevation(4.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFF0F172A),
                border = BorderStroke(2.dp, OrangePrimary),
                modifier = Modifier.size(60.dp),
                shadowElevation = 6.dp
            ) {
                Image(
                    painter = painterResource(id = R.drawable.beboss_app_icon),
                    contentDescription = "BeBoss Logo",
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(16.dp)),
                    contentScale = ContentScale.Fit
                )
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "BeBoss POS",
                        fontWeight = FontWeight.Black,
                        fontSize = 18.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = OrangePrimary.copy(alpha = 0.15f)
                    ) {
                        Text(
                            text = "PRO v2.6",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = OrangePrimary,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }

                Text(
                    text = shopProfile.shopName.ifBlank { "Enterprise Retail Edition" },
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .background(ProfitGreen, CircleShape)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = Localization.get("offline_db_active", language),
                        fontSize = 10.5.sp,
                        color = ProfitGreen,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
fun SettingsSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    language: AppLanguage
) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        placeholder = {
            Text(
                text = Localization.get("settings_search_hint", language),
                fontSize = 13.sp
            )
        },
        leadingIcon = {
            Icon(
                Icons.Default.Search,
                contentDescription = Localization.get("search", language),
                tint = OrangePrimary
            )
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(
                    onClick = { onQueryChange("") },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = Localization.get("close", language)
                    )
                }
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("settings_search_input")
    )
}

@Composable
fun CategoryFilterChips(
    categories: List<Category>,
    selectedCategory: String,
    onCategoryClick: (String) -> Unit,
    language: AppLanguage
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        items(categories) { category ->
            val isSelected = selectedCategory == category.id
            FilterChip(
                selected = isSelected,
                onClick = { onCategoryClick(category.id) },
                label = {
                    Text(
                        text = category.label,
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                    )
                },
                leadingIcon = {
                    if (isSelected) {
                        Icon(category.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = category.color,
                    selectedLabelColor = Color.White,
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                ),
                modifier = Modifier
                    .heightIn(min = 40.dp)
                    .testTag("settings_cat_${category.id.lowercase()}")
            )
        }
    }
}

@Composable
fun SettingsSectionCard(
    title: String,
    subtitle: String? = null,
    icon: ImageVector,
    iconColor: Color,
    modifier: Modifier = Modifier,
    showDivider: Boolean = false,
    onAction: (() -> Unit)? = null,
    actionLabel: String? = null,
    actionIcon: ImageVector? = null,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = CircleShape,
                        color = iconColor.copy(alpha = 0.15f),
                        modifier = Modifier.size(40.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                icon,
                                contentDescription = null,
                                tint = iconColor,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = title,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        subtitle?.let {
                            Text(
                                text = it,
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                
                onAction?.let { action ->
                    actionLabel?.let { label ->
                        actionIcon?.let { actionIcon ->
                            OutlinedButton(
                                onClick = action,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.heightIn(min = 36.dp)
                            ) {
                                Icon(actionIcon, contentDescription = null, modifier = Modifier.size(16.dp), tint = iconColor)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = iconColor)
                            }
                        }
                    }
                }
            }

            if (showDivider) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 10.dp), color = MaterialTheme.colorScheme.outlineVariant)
            }

            content()
        }
    }
}

@Composable
fun LanguageThemeCard(
    language: AppLanguage,
    isDarkTheme: Boolean,
    onSelectLanguage: (AppLanguage) -> Unit,
    onToggleTheme: () -> Unit,
    onToggleLanguage: () -> Unit
) {
    SettingsSectionCard(
        title = Localization.get("display_and_language", language),
        subtitle = Localization.get("select_language_subtitle", language),
        icon = Icons.Default.Language,
        iconColor = OrangePrimary
    ) {
        val languagePairs = AppLanguage.entries.chunked(2)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            languagePairs.forEach { pair ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    pair.forEach { langOption ->
                        val isSelected = langOption == language
                        Surface(
                            onClick = { onSelectLanguage(langOption) },
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) OrangePrimary.copy(alpha = 0.14f)
                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                            border = BorderStroke(
                                width = if (isSelected) 1.6.dp else 1.dp,
                                color = if (isSelected) OrangePrimary else MaterialTheme.colorScheme.outlineVariant
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 50.dp)
                                .testTag("settings_lang_${langOption.code}")
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = if (isSelected) OrangePrimary else DarkNavy.copy(alpha = 0.15f)
                                    ) {
                                        Text(
                                            text = langOption.flag,
                                            fontSize = 10.5.sp,
                                            fontWeight = FontWeight.Black,
                                            color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = langOption.displayName,
                                        fontSize = 13.sp,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (isSelected) OrangePrimary else MaterialTheme.colorScheme.onSurface
                                    )
                                }
                                if (isSelected) {
                                    Icon(
                                        Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = OrangePrimary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 10.dp), color = MaterialTheme.colorScheme.outlineVariant)

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onToggleTheme() }
                .padding(vertical = 6.dp)
                .testTag("settings_theme_toggle_row"),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = CircleShape,
                    color = if (isDarkTheme) Color(0x33FFD166) else Color(0x33334155),
                    modifier = Modifier.size(36.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (isDarkTheme) Icons.Default.LightMode else Icons.Default.DarkMode,
                            contentDescription = Localization.get("app_theme", language),
                            tint = if (isDarkTheme) Color(0xFFFFD166) else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = Localization.get("app_theme", language),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = if (isDarkTheme) Localization.get("dark_mode", language) else Localization.get("light_mode", language),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Switch(
                checked = isDarkTheme,
                onCheckedChange = { onToggleTheme() },
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = OrangePrimary
                )
            )
        }
    }
}

@Composable
fun ActiveUserTeamCard(
    currentUser: User?,
    allUsers: List<User>,
    branches: List<com.beboss.shopmgmt.data.model.Branch>,
    shopDevices: List<ShopDevice>,
    language: AppLanguage,
    onLockApp: () -> Unit,
    onShowStaffDialog: () -> Unit,
    onShowBranchDialog: () -> Unit,
    onShowShopDevicesDialog: () -> Unit,
    onShowDataTransferDialog: () -> Unit,
    onShareApk: () -> Unit,
    onLogout: () -> Unit
) {
    SettingsSectionCard(
        title = currentUser?.name ?: "Active Staff User",
        subtitle = "Role: ${currentUser?.role?.displayName ?: "Owner"}",
        icon = Icons.Default.Security,
        iconColor = OrangePrimary
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = onShowStaffDialog,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Group, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(Localization.get("staff_management", language), fontSize = 12.sp)
            }

            OutlinedButton(
                onClick = onShowBranchDialog,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Storefront, contentDescription = null, modifier = Modifier.size(16.dp), tint = OrangePrimary)
                Spacer(modifier = Modifier.width(6.dp))
                Text("${Localization.get("branches_title", language)} (${branches.size})", fontSize = 12.sp, color = OrangePrimary, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedButton(
            onClick = onShowShopDevicesDialog,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .testTag("settings_shop_devices_btn"),
            shape = RoundedCornerShape(10.dp),
            border = BorderStroke(1.dp, ProfitGreen.copy(alpha = 0.55f))
        ) {
            Icon(Icons.Default.Devices, contentDescription = null, modifier = Modifier.size(17.dp), tint = ProfitGreen)
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "${Localization.get("shop_devices_title", language)} (${shopDevices.count { it.isActive }.coerceAtLeast(1)}) \u2022 +2,000 FRw/extra",
                fontSize = 12.sp,
                color = ProfitGreen,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = onShowDataTransferDialog,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.DataObject, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(Localization.get("data_backup", language), fontSize = 12.sp)
            }

            OutlinedButton(
                onClick = onShareApk,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp), tint = OrangePrimary)
                Spacer(modifier = Modifier.width(6.dp))
                Text(Localization.get("share_app_apk", language), fontSize = 12.sp, color = OrangePrimary, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = LossRed)
        ) {
            Text(Localization.get("logout", language), fontSize = 12.sp, color = LossRed, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun CloudSyncCard(
    isOnline: Boolean,
    isSyncing: Boolean,
    cloudSyncReport: CloudSyncReport?,
    connectivityStatus: ConnectivityStatus,
    language: AppLanguage,
    onSyncToCloudNow: () -> Unit,
    onOpenSyncHub: () -> Unit
) {
    SettingsSectionCard(
        title = Localization.get("cloud_sync_card_title", language),
        subtitle = if (isOnline) Localization.get("cloud_online_desc", language)
        else Localization.get("cloud_offline_desc", language),
        icon = if (isOnline) Icons.Default.CloudDone else Icons.Default.Sync,
        iconColor = if (isOnline) ProfitGreen else Color(0xFF64748B)
    ) {
        cloudSyncReport?.let {
            Spacer(modifier = Modifier.height(10.dp))
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    Text(
                        text = Localization.get("sync_completed", language),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = "\u2022 ${it.productsCount} Products  \u2022 ${it.debtsCount} Debts  \u2022 ${it.salesCount} Sales  \u2022 ${it.branchesCount} Branches",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        Button(
            onClick = onSyncToCloudNow,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .testTag("settings_push_cloud_btn"),
            colors = ButtonDefaults.buttonColors(containerColor = if (isOnline) OrangePrimary else Color(0xFF475569)),
            shape = RoundedCornerShape(10.dp),
            enabled = !isSyncing
        ) {
            Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (isSyncing) Localization.get("pushing_to_cloud", language)
                else Localization.get("push_to_cloud_now", language),
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedButton(
            onClick = onOpenSyncHub,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .testTag("settings_open_sync_hub_btn"),
            shape = RoundedCornerShape(10.dp)
        ) {
            Icon(Icons.Default.CloudSync, contentDescription = null, modifier = Modifier.size(18.dp), tint = OrangePrimary)
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = Localization.get("open_sync_hub", language),
                fontWeight = FontWeight.Bold,
                fontSize = 12.5.sp,
                color = OrangePrimary
            )
        }
    }
}

@Composable
fun LicenseSubscriptionCard(
    shopProfile: ShopProfile,
    isActive: Boolean,
    daysRemaining: Int,
    currentPricing: com.beboss.shopmgmt.util.SubscriptionPriceBreakdown,
    activeDeviceCount: Int,
    ownerAccount: User?,
    deviceCode: String,
    liveWhatsApp: String,
    settingsUnlockCodeInput: String,
    onUnlockCodeChange: (String) -> Unit,
    isCompleteCode: Boolean,
    language: AppLanguage,
    onDialMtn: () -> Unit,
    onDialAirtel: () -> Unit,
    onShowSubscriptionDialog: () -> Unit,
    onActivateVoucher: (String) -> Unit,
    onSyncCloudApprovals: () -> Unit,
    paymentVerificationRequests: List<PaymentVerificationRequest>
) {
    SettingsSectionCard(
        title = Localization.get("subscription_title", language),
        subtitle = "${currentPricing.branchTierName} \u2022 ${currentPricing.totalPayable} FRw/mo",
        icon = Icons.Default.Security,
        iconColor = if (isActive) ProfitGreen else LossRed
    ) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = if (isActive) ProfitGreen.copy(alpha = 0.15f) else LossRed.copy(alpha = 0.15f)
        ) {
            Text(
                text = if (isActive) "$daysRemaining ${Localization.get("days_left", language)}" else "Expired",
                color = if (isActive) ProfitGreen else LossRed,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        Surface(
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = "Account: @${ownerAccount?.username?.ifBlank { "owner" } ?: "owner"} \u2022 Phone: ${ownerAccount?.phone?.ifBlank { shopProfile.phone } ?: shopProfile.phone}",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "Devices: $activeDeviceCount paired (${currentPricing.deviceTierName}) \u2022 Device ID: $deviceCode",
                    fontSize = 10.5.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "Admin WhatsApp: ${liveWhatsApp.ifBlank { "Configure in Admin Console -> Pay Config" }}",
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (liveWhatsApp.isNotBlank()) ProfitGreen else OrangePrimary
                )
                Text(
                    text = "MTN: ${currentPricing.ussdMtnCode} \u2022 Airtel: ${currentPricing.ussdAirtelCode}",
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "Background WorkManager Cloud Auto-Sync: Active even when app is closed",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = ProfitGreen
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = onDialMtn,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("settings_ussd_mtn_btn"),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFFCC00))
            ) {
                Text("Dial MTN *182# (${currentPricing.totalPayable} FRw)", color = Color(0xFF0F172A), fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }

            Button(
                onClick = onDialAirtel,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("settings_ussd_airtel_btn"),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))
            ) {
                Text("Dial Airtel *500# (${currentPricing.totalPayable} FRw)", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Button(
            onClick = onShowSubscriptionDialog,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .testTag("settings_open_subscription_wizard_btn"),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary)
        ) {
            Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = Localization.get("pay_ussd_whatsapp_cta", language),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 12.5.sp
            )
        }

        Spacer(modifier = Modifier.height(12.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = Localization.get("insert_unlock_code_title", language),
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = "@${ownerAccount?.username?.ifBlank { "owner" } ?: "owner"} \u2022 ${ownerAccount?.phone?.ifBlank { shopProfile.phone } ?: shopProfile.phone}",
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = settingsUnlockCodeInput,
            onValueChange = onUnlockCodeChange,
            label = { Text(Localization.get("enter_voucher_code", language)) },
            placeholder = { Text("BB2-SINGLE-030D-...") },
            leadingIcon = { Icon(Icons.Default.Key, contentDescription = null, tint = OrangePrimary) },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("settings_unlock_code_input"),
            shape = RoundedCornerShape(10.dp)
        )

        AnimatedVisibility(visible = isCompleteCode) {
            Spacer(modifier = Modifier.height(6.dp))
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = ProfitGreen.copy(alpha = 0.14f),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings_auto_unlock_badge")
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = Localization.get("auto_unlock_detected", language),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = ProfitGreen
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = { onActivateVoucher(settingsUnlockCodeInput.trim()) },
                enabled = settingsUnlockCodeInput.isNotBlank(),
                modifier = Modifier
                    .weight(1.3f)
                    .heightIn(min = 48.dp)
                    .testTag("settings_activate_unlock_code_btn"),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen)
            ) {
                Icon(Icons.Default.VerifiedUser, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(Localization.get("activate_code", language), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = onSyncCloudApprovals,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("settings_sync_cloud_approvals_btn"),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.CloudSync, contentDescription = null, modifier = Modifier.size(16.dp), tint = OrangePrimary)
                Spacer(modifier = Modifier.width(4.dp))
                Text(Localization.get("sync_cloud_approvals", language), fontSize = 11.sp, color = OrangePrimary, fontWeight = FontWeight.Bold)
            }
        }

        if (paymentVerificationRequests.isNotEmpty()) {
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Recent Payment Requests (${paymentVerificationRequests.size}):",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(4.dp))
            paymentVerificationRequests.take(2).forEach { req ->
                val isApproved = req.status == "APPROVED" && req.generatedUnlockCode.isNotBlank()
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (isApproved) ProfitGreen.copy(alpha = 0.1f) else Color(0xFFFFF7ED),
                    border = BorderStroke(1.dp, if (isApproved) ProfitGreen.copy(alpha = 0.4f) else OrangePrimary.copy(alpha = 0.35f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 3.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "${req.provider} \u2022 ${req.amountRwf} FRw (${req.status})",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isApproved) ProfitGreen else DarkNavy
                            )
                            Text(
                                text = if (isApproved) "Code: ${req.generatedUnlockCode}"
                                else "@${req.ownerUsername} \u2022 ${if (req.syncedToSupabase) "In Supabase Queue" else "Queued Offline"}",
                                fontSize = 10.sp,
                                color = InkMedium
                            )
                        }
                        if (isApproved) {
                            Button(
                                onClick = { onActivateVoucher(req.generatedUnlockCode) },
                                modifier = Modifier.heightIn(min = 48.dp),
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen)
                            ) {
                                Text("Apply", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AdminConsoleCard(
    adminSession: SupabaseAdminSession?,
    language: AppLanguage,
    onOpenConsole: () -> Unit,
    onShareWebPortal: () -> Unit
) {
    SettingsSectionCard(
        title = Localization.get("admin_portal_title", language),
        subtitle = if (adminSession != null) {
            "Signed in as ${adminSession.email} \u2022 Live Supabase Sync"
        } else {
            "Supabase Auth licensing portal \u2022 Multi-shop management & BB2 codes"
        },
        icon = Icons.Default.AdminPanelSettings,
        iconColor = DarkNavy
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = onOpenConsole,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("open_admin_console_btn"),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DarkNavy)
            ) {
                Icon(Icons.Default.VerifiedUser, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(Localization.get("open_admin_console", language), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = onShareWebPortal,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("share_admin_web_portal_btn"),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Public, contentDescription = null, modifier = Modifier.size(16.dp), tint = OrangePrimary)
                Spacer(modifier = Modifier.width(6.dp))
                Text(Localization.get("web_admin_portal", language), fontSize = 12.sp, color = OrangePrimary, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShopProfileCard(
    formState: ShopFormState,
    language: AppLanguage,
    currencyExpanded: Boolean,
    onCurrencyExpandedChange: (Boolean) -> Unit,
    onSave: () -> Unit
) {
    SettingsSectionCard(
        title = Localization.get("shop_profile", language),
        subtitle = null,
        icon = Icons.Default.Storefront,
        iconColor = OrangePrimary
    ) {
        OutlinedTextField(
            value = formState.shopName,
            onValueChange = { formState.shopName = it },
            label = { Text(Localization.get("shop_name", language)) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = formState.ownerName,
            onValueChange = { formState.ownerName = it },
            label = { Text(Localization.get("owner_name", language)) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = formState.phone,
            onValueChange = { formState.phone = it },
            label = { Text(Localization.get("phone_number", language)) },
            placeholder = { Text("+250 788 123 456") },
            leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null, tint = OrangePrimary) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedTextField(
                value = formState.tinNumber,
                onValueChange = { formState.tinNumber = it },
                label = { Text("TIN / Tax ID") },
                placeholder = { Text("100234567") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )

            OutlinedTextField(
                value = formState.taxRateText,
                onValueChange = { formState.taxRateText = it },
                label = { Text("Tax % (VAT)") },
                placeholder = { Text("18.0") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(0.8f),
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        ExposedDropdownMenuBox(
            expanded = currencyExpanded,
            onExpandedChange = onCurrencyExpandedChange,
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = "${formState.currencySymbol} - ${formState.currencyCode}",
                onValueChange = {},
                readOnly = true,
                label = { Text(Localization.get("currency", language)) },
                leadingIcon = { Icon(Icons.Default.AttachMoney, contentDescription = null, tint = OrangePrimary) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = currencyExpanded) },
                modifier = Modifier
                    .menuAnchor()
                    .fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )
            ExposedDropdownMenu(
                expanded = currencyExpanded,
                onDismissRequest = { onCurrencyExpandedChange(false) }
            ) {
                listOf(
                    Triple("FRw", "RWF", "Rwandan Franc"),
                    Triple("$", "USD", "US Dollar"),
                    Triple("KSh", "KES", "Kenyan Shilling"),
                    Triple("USh", "UGX", "Ugandan Shilling"),
                    Triple("\u20ac", "EUR", "Euro")
                ).forEach { (sym, code, name) ->
                    DropdownMenuItem(
                        text = { Text("$sym - $name ($code)") },
                        onClick = {
                            formState.currencySymbol = sym
                            formState.currencyCode = code
                            onCurrencyExpandedChange(false)
                        }
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = formState.address,
            onValueChange = { formState.address = it },
            label = { Text(Localization.get("address", language)) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = onSave,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(Icons.Default.Save, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text(Localization.get("save_shop_profile", language), fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun FinancialTargetsCard(
    formState: ShopFormState,
    language: AppLanguage,
    currencySymbol: String
) {
    SettingsSectionCard(
        title = if (language == AppLanguage.KINYARWANDA) "Intego z'Ubucuruzi & Isanduku (Financial Goals)" else "Financial Targets & Cash Float",
        subtitle = null,
        icon = Icons.Default.TrendingUp,
        iconColor = ProfitGreen
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedTextField(
                value = formState.dailySalesTargetText,
                onValueChange = { formState.dailySalesTargetText = it },
                label = { Text("Daily Target ($currencySymbol)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp)
            )

            OutlinedTextField(
                value = formState.monthlyRevenueTargetText,
                onValueChange = { formState.monthlyRevenueTargetText = it },
                label = { Text("Monthly Goal ($currencySymbol)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp)
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedTextField(
                value = formState.targetMarginText,
                onValueChange = { formState.targetMarginText = it },
                label = { Text("Target Margin %") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp)
            )

            OutlinedTextField(
                value = formState.cashFloatText,
                onValueChange = { formState.cashFloatText = it },
                label = { Text("Opening Cash Float") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp)
            )
        }
    }
}

@Composable
fun ThermalPrinterCard(
    formState: ShopFormState,
    language: AppLanguage,
    onPreviewClick: () -> Unit
) {
    SettingsSectionCard(
        title = if (language == AppLanguage.KINYARWANDA) "Ibicapishwa & Resi (Thermal Printer)" else "Thermal Printer & Receipts",
        subtitle = "${formState.paperWidthMm}mm ESC/POS",
        icon = Icons.Default.Print,
        iconColor = OrangePrimary
    ) {
        Text(
            text = "Receipt Paper Width:",
            fontSize = 12.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(6.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Button(
                onClick = { formState.paperWidthMm = 58 },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (formState.paperWidthMm == 58) OrangePrimary else MaterialTheme.colorScheme.surfaceVariant
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(
                    text = "58 mm (Mobile POS)",
                    color = if (formState.paperWidthMm == 58) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
            }

            Button(
                onClick = { formState.paperWidthMm = 80 },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (formState.paperWidthMm == 80) OrangePrimary else MaterialTheme.colorScheme.surfaceVariant
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(
                    text = "80 mm (Counter Desktop)",
                    color = if (formState.paperWidthMm == 80) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = formState.receiptHeader,
            onValueChange = { formState.receiptHeader = it },
            label = { Text("Receipt Header Subtitle") },
            placeholder = { Text("Quality Goods & Fast Delivery") },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedTextField(
            value = formState.receiptFooter,
            onValueChange = { formState.receiptFooter = it },
            label = { Text(Localization.get("receipt_footer", language)) },
            placeholder = { Text("Murakoze Cyane! Welcome Again!") },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        SettingRow(
            label = "Show Logo on Printed Receipt",
            value = formState.showLogoOnReceipt,
            onValueChange = { formState.showLogoOnReceipt = it }
        )

        SettingRow(
            label = "Include Tax / TIN Breakdown",
            value = formState.showTaxOnReceipt,
            onValueChange = { formState.showTaxOnReceipt = it }
        )

        SettingRow(
            label = "Print Barcode / QR Code on Bottom",
            value = formState.showBarcodeOnReceipt,
            onValueChange = { formState.showBarcodeOnReceipt = it }
        )

        SettingRow(
            label = "Auto-Print on Checkout Finish",
            value = formState.autoPrintReceiptOnSale,
            onValueChange = { formState.autoPrintReceiptOnSale = it }
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedButton(
            onClick = onPreviewClick,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp)
        ) {
            Icon(Icons.Default.Receipt, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Preview Thermal Receipt Layout", fontWeight = FontWeight.Bold, color = OrangePrimary, fontSize = 12.5.sp)
        }
    }
}

@Composable
fun SensoryFeedbackCard(
    formState: ShopFormState,
    language: AppLanguage
) {
    SettingsSectionCard(
        title = if (language == AppLanguage.KINYARWANDA) "Amajwi & Gukoraho (Sensory Feedback)" else "Audio & Haptic Feedback",
        subtitle = null,
        icon = Icons.Default.VolumeUp,
        iconColor = OrangePrimary
    ) {
        SettingRow(
            label = "POS Audio Chime",
            subtitle = "Play sound on barcode scan & checkout",
            value = formState.soundFeedbackEnabled,
            onValueChange = { formState.soundFeedbackEnabled = it }
        )

        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

        SettingRow(
            label = "Haptic Vibration",
            subtitle = "Tactile pulse on keypad click & buttons",
            value = formState.hapticFeedbackEnabled,
            onValueChange = { formState.hapticFeedbackEnabled = it }
        )
    }
}

@Composable
fun TerminalSecurityCard(
    integrity: com.beboss.shopmgmt.util.DeviceIntegrityStatus,
    keystoreLabel: String,
    idleLockMinutes: Int,
    language: AppLanguage,
    onSetIdleLockMinutes: (Int) -> Unit,
    onOpenDiagnostics: () -> Unit
) {
    SettingsSectionCard(
        title = Localization.get("security_autolock_title", language),
        subtitle = "${integrity.postureLabel} \u2022 $keystoreLabel",
        icon = Icons.Default.Timer,
        iconColor = ProfitGreen,
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .border(BorderStroke(1.dp, ProfitGreen.copy(alpha = 0.35f)), RoundedCornerShape(18.dp))
    ) {
        Text(
            text = Localization.get("idle_lock_timeout", language),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(6.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf(1, 5, 15, 30).forEach { mins ->
                val selected = idleLockMinutes == mins
                FilterChip(
                    selected = selected,
                    onClick = { onSetIdleLockMinutes(mins) },
                    label = {
                        Text(
                            text = "${mins}m",
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = OrangePrimary,
                        selectedLabelColor = Color.White
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .testTag("settings_idle_lock_${mins}m")
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedButton(
            onClick = onOpenDiagnostics,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .testTag("settings_security_audit_card_btn"),
            shape = RoundedCornerShape(10.dp)
        ) {
            Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Security Posture & HLC Sync Diagnostics", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = ProfitGreen)
        }
    }
}

@Composable
fun DatabaseEngineCard(
    databaseStats: DatabaseEngineStats?,
    products: List<Product>,
    sales: List<Sale>,
    customers: List<Customer>,
    customerPayments: List<CustomerPayment>,
    pendingSyncCount: Int,
    isOptimizingDb: Boolean,
    language: AppLanguage,
    onRefreshStats: () -> Unit,
    onVerifyIntegrity: () -> Unit,
    onOptimize: () -> Unit,
    onOpenDiagnostics: () -> Unit,
    onResetTransactions: () -> Unit,
    onWipeProducts: () -> Unit,
    onWipeCustomers: () -> Unit,
    onFactoryReset: () -> Unit
) {
    SettingsSectionCard(
        title = if (language == AppLanguage.KINYARWANDA) "Ububiko bwa SQLite (Database Engine)" else "SQLite Database Engine & Health",
        subtitle = "Room SQLite v11 \u2022 SQLCipher AES-256 + WAL",
        icon = Icons.Default.Storage,
        iconColor = Color(0xFF0284C7),
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .border(BorderStroke(1.dp, Color(0xFF0284C7).copy(alpha = 0.35f)), RoundedCornerShape(18.dp))
    ) {
        Spacer(modifier = Modifier.height(14.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            StatCard(
                label = "Total Records",
                value = databaseStats?.totalRecordsCount?.toString() ?: "${products.size + sales.size + customers.size}",
                color = MaterialTheme.colorScheme.onSurface
            )
            StatCard(
                label = "DB Storage",
                value = databaseStats?.fileSizeFormatted ?: "Active",
                color = ProfitGreen
            )
            StatCard(
                label = "B-Tree Health",
                value = if (databaseStats?.integrityStatus == "OK") "100% OK" else "Optimal",
                color = Color(0xFF0284C7)
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Surface(
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    text = "Live Schema Counts:",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "\u2022 Products: ${databaseStats?.productCount ?: products.size}   \u2022 Sales: ${databaseStats?.salesCount ?: sales.size}   \u2022 Customers: ${databaseStats?.customerCount ?: customers.size}\n\u2022 Payments: ${databaseStats?.paymentsCount ?: customerPayments.size}   \u2022 Sync Queue: ${databaseStats?.syncQueueCount ?: pendingSyncCount}   \u2022 Purchases: ${databaseStats?.purchasesCount ?: 0}",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    lineHeight = 16.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = onVerifyIntegrity,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(15.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("PRAGMA Integrity", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = onOptimize,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = DarkNavy),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Speed, contentDescription = null, modifier = Modifier.size(15.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(if (isOptimizingDb) "Optimizing..." else "WAL Checkpoint", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = onOpenDiagnostics,
                modifier = Modifier
                    .weight(1f)
                    .testTag("settings_open_diagnostics_btn"),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.VerifiedUser, contentDescription = null, modifier = Modifier.size(15.dp), tint = OrangePrimary)
                Spacer(modifier = Modifier.width(4.dp))
                Text("Sync & Security Audit", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = onResetTransactions,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = LossRed)
            ) {
                Icon(Icons.Default.RestartAlt, contentDescription = null, modifier = Modifier.size(15.dp), tint = LossRed)
                Spacer(modifier = Modifier.width(4.dp))
                Text("Reset Sales History", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = onWipeProducts,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = LossRed)
            ) {
                Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(15.dp), tint = LossRed)
                Spacer(modifier = Modifier.width(4.dp))
                Text("Wipe All Products", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = onWipeCustomers,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = LossRed)
            ) {
                Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(15.dp), tint = LossRed)
                Spacer(modifier = Modifier.width(4.dp))
                Text("Wipe All Customers", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = onFactoryReset,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = LossRed)
        ) {
            Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color.White)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Factory Reset Whole App (Wipe All)", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}

@Composable
fun DevicePermissionsCard(
    hasContacts: Boolean,
    hasSms: Boolean,
    hasNotifications: Boolean,
    hasCamera: Boolean,
    isAllGranted: Boolean,
    language: AppLanguage,
    onManagePermissions: () -> Unit
) {
    SettingsSectionCard(
        title = if (language == AppLanguage.KINYARWANDA) "Uburenganzira bwa Telefone (Permissions)" else "Device Permissions & Access",
        subtitle = if (isAllGranted) "All capabilities active & ready" else "Grant access for contacts, SMS & scanner",
        icon = Icons.Default.Security,
        iconColor = if (isAllGranted) ProfitGreen else OrangePrimary
    ) {
        Spacer(modifier = Modifier.height(14.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            PermissionBadge(
                label = "Contacts",
                granted = hasContacts
            )
            PermissionBadge(
                label = "Messages",
                granted = hasSms
            )
            PermissionBadge(
                label = "Alerts",
                granted = hasNotifications
            )
            PermissionBadge(
                label = "Camera",
                granted = hasCamera
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        val context = LocalContext.current
        var locationSharingEnabled by remember {
            mutableStateOf(com.beboss.shopmgmt.util.DeviceTelemetryUploader.isLocationSharingEnabled(context))
        }
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(Icons.Default.Public, contentDescription = null, tint = OrangePrimary)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (language == AppLanguage.KINYARWANDA) "Sangira aho igikoresho giherereye" else "Share this device's foreground location",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.sp
                    )
                    Text(
                        text = if (language == AppLanguage.KINYARWANDA)
                            "Bifungura GPS igihe ukoresha BeBoss gusa. Nta gukurikirana mu ibanga cyangwa inyuma ya porogaramu."
                        else "Optional. Uses GPS only while BeBoss is in use and permission is granted. No background tracking.",
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = locationSharingEnabled,
                    onCheckedChange = { enabled ->
                        if (enabled && !PermissionManager.hasLocationPermission(context)) {
                            onManagePermissions()
                        } else {
                            com.beboss.shopmgmt.util.DeviceTelemetryUploader.setLocationSharingEnabled(context, enabled)
                            locationSharingEnabled = enabled
                        }
                    }
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Button(
            onClick = onManagePermissions,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
            shape = RoundedCornerShape(10.dp)
        ) {
            Icon(Icons.Default.Security, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (language == AppLanguage.KINYARWANDA) "Genzura & Tanga Uburenganzira Bwose" else "Manage & Request All Permissions",
                fontWeight = FontWeight.Bold,
                fontSize = 12.5.sp
            )
        }
    }
}

@Composable
fun PushNotificationsCard(
    language: AppLanguage,
    onTestNotification: (String) -> Unit
) {
    SettingsSectionCard(
        title = if (language == AppLanguage.KINYARWANDA) "Uburyo bw'Imenyesha (Push Notifications)" else "Enterprise Push Notifications",
        subtitle = if (language == AppLanguage.KINYARWANDA) "Imenyesha ry'igurisha, ibicuruzwa biri gushira & amadeni" else "Real-time alerts for Sales, Low Stock, Debts & Sync",
        icon = Icons.Default.NotificationsActive,
        iconColor = OrangePrimary
    ) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = ProfitGreen.copy(alpha = 0.15f),
            modifier = Modifier
                .wrapContentWidth()
                .padding(horizontal = 7.dp, vertical = 3.dp)
        ) {
            Text(
                text = "ACTIVE",
                fontSize = 10.sp,
                fontWeight = FontWeight.Black,
                color = ProfitGreen
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = if (language == AppLanguage.KINYARWANDA)
                "Kanda hano munsi kugira ngo ugerageze uburyo buri bwoko bw'imenyesha bugaragara muri telefone yawe:"
                else "Tap below to test real system notifications delivered to your device status bar and notification tray:",
            fontSize = 11.5.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(12.dp))

        NotificationTestButtons(
            onTest = onTestNotification,
            language = language
        )
    }
}

@Composable
fun AboutBrandCard(
    language: AppLanguage,
    onReplaySplash: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                border = BorderStroke(1.5.dp, OrangePrimary.copy(alpha = 0.5f)),
                modifier = Modifier.size(54.dp),
                shadowElevation = 4.dp
            ) {
                Image(
                    painter = painterResource(id = R.drawable.beboss_app_icon),
                    contentDescription = "BeBoss Logo",
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(14.dp)),
                    contentScale = ContentScale.Fit
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = "BeBoss Business POS",
                fontWeight = FontWeight.Black,
                fontSize = 17.sp,
                color = MaterialTheme.colorScheme.onSurface
            )

            Text(
                text = "Version 2.6.0 \u2022 Enterprise SQLite Powered Edition",
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = OrangePrimary
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(Icons.Default.Security, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(14.dp))
                Text(
                    text = "Hardware Token & AES SQLite Room Database Active",
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            OutlinedButton(
                onClick = onReplaySplash,
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp), tint = OrangePrimary)
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (language == AppLanguage.KINYARWANDA) "Reba Intangiriro ya BeBoss" else "Replay Brand Launch Intro",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

// ========================================================================
// SMALL REUSABLE COMPONENTS
// ========================================================================

@Composable
fun SettingRow(
    label: String,
    subtitle: String? = null,
    value: Boolean,
    onValueChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(text = label, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
            subtitle?.let {
                Text(text = it, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Switch(
            checked = value,
            onCheckedChange = onValueChange,
            colors = SwitchDefaults.colors(checkedThumbColor = OrangePrimary, checkedTrackColor = OrangeLight)
        )
    }
}

@Composable
fun RowScope.StatCard(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = modifier.weight(1f)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                text = value,
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = color
            )
        }
    }
}

@Composable
fun RowScope.PermissionBadge(
    label: String,
    granted: Boolean
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (granted) Color(0xFFDCFCE7) else Color(0xFFFEE2E2),
        modifier = Modifier.weight(1f)
    ) {
        Column(
            modifier = Modifier.padding(vertical = 6.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (granted) ProfitGreen else LossRed)
            Text(if (granted) "Granted" else "Missing", fontSize = 9.sp, color = InkMedium)
        }
    }
}

@Composable
fun NotificationTestButtons(
    onTest: (String) -> Unit,
    language: AppLanguage
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = { onTest("SALE") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.ShoppingBag, contentDescription = null, modifier = Modifier.size(15.dp), tint = ProfitGreen)
                Spacer(modifier = Modifier.width(4.dp))
                Text("POS Sale Alert", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = { onTest("LOW_STOCK") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Warning, contentDescription = null, modifier = Modifier.size(15.dp), tint = LossRed)
                Spacer(modifier = Modifier.width(4.dp))
                Text("Low Stock Alert", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = { onTest("DEBT") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Payment, contentDescription = null, modifier = Modifier.size(15.dp), tint = OrangePrimary)
                Spacer(modifier = Modifier.width(4.dp))
                Text("Debt Payment", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = { onTest("TRANSFER") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(15.dp), tint = Color(0xFF2563EB))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Stock Transfer", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = { onTest("TARGET") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Flag, contentDescription = null, modifier = Modifier.size(15.dp), tint = Color(0xFFD97706))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Daily Goal Hit", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = { onTest("SYNC") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(15.dp), tint = ProfitGreen)
                Spacer(modifier = Modifier.width(4.dp))
                Text("Branch Sync Done", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = { onTest("SYNC_DEVICE") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Security, contentDescription = null, modifier = Modifier.size(15.dp), tint = Color(0xFF0284C7))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Admin Console Sync Alert", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ========================================================================
// SETTINGS UTILITY DIALOGS & PRINT DISPATCH
// ========================================================================

@Composable
fun ThermalPreviewDialog(
    paperWidthMm: Int,
    shopName: String,
    receiptHeader: String,
    address: String,
    phone: String,
    ownerName: String,
    tinNumber: String,
    showLogoOnReceipt: Boolean,
    showTaxOnReceipt: Boolean,
    showBarcodeOnReceipt: Boolean,
    receiptFooter: String,
    currencySymbol: String,
    onDismiss: () -> Unit,
    onTestPrint: () -> Unit,
    language: AppLanguage
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Receipt, contentDescription = null, tint = OrangePrimary)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Thermal Receipt (${paperWidthMm}mm ESC/POS)", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth(if (paperWidthMm == 58) 0.95f else 1f)
                        .padding(vertical = 8.dp),
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFFBFBFB),
                    border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                    shadowElevation = 4.dp
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        if (showLogoOnReceipt) {
                            Surface(
                                shape = CircleShape,
                                color = Color.Black,
                                modifier = Modifier.size(36.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text("BB", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                }
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                        }

                        Text(shopName.ifBlank { "BEBOSS RETAIL SHOP" }.uppercase(), fontWeight = FontWeight.Black, fontSize = 14.sp, color = Color.Black, fontFamily = FontFamily.Monospace)
                        if (receiptHeader.isNotBlank()) {
                            Text(receiptHeader, fontSize = 11.sp, color = Color.DarkGray, fontFamily = FontFamily.Monospace)
                        }
                        Text(address.ifBlank { "Kigali, Rwanda" }, fontSize = 10.5.sp, color = Color.DarkGray, fontFamily = FontFamily.Monospace)
                        Text("Tel: ${phone.ifBlank { "+250 788 000 000" }}", fontSize = 10.5.sp, color = Color.DarkGray, fontFamily = FontFamily.Monospace)
                        if (showTaxOnReceipt && tinNumber.isNotBlank()) {
                            Text("TIN: $tinNumber", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color.Black, fontFamily = FontFamily.Monospace)
                        }

                        Text("--------------------------------", fontSize = 11.sp, color = Color.Gray, fontFamily = FontFamily.Monospace)
                        Text("RECEIPT #: RC-2026-08819", fontSize = 10.sp, color = Color.DarkGray, fontFamily = FontFamily.Monospace)
                        Text("Date: 2026-08-29 14:30:22", fontSize = 10.sp, color = Color.DarkGray, fontFamily = FontFamily.Monospace)
                        Text("Cashier: ${ownerName.ifBlank { "Main Cashier" }}", fontSize = 10.sp, color = Color.DarkGray, fontFamily = FontFamily.Monospace)
                        Text("--------------------------------", fontSize = 11.sp, color = Color.Gray, fontFamily = FontFamily.Monospace)

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Inyange Milk 500ml x 2", fontSize = 10.5.sp, color = Color.Black, fontFamily = FontFamily.Monospace)
                            Text("1,400 $currencySymbol", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color.Black, fontFamily = FontFamily.Monospace)
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Bakhresa Azam Bread 1kg", fontSize = 10.5.sp, color = Color.Black, fontFamily = FontFamily.Monospace)
                            Text("1,200 $currencySymbol", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color.Black, fontFamily = FontFamily.Monospace)
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Gorilla Coffee 250g", fontSize = 10.5.sp, color = Color.Black, fontFamily = FontFamily.Monospace)
                            Text("4,500 $currencySymbol", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color.Black, fontFamily = FontFamily.Monospace)
                        }

                        Text("--------------------------------", fontSize = 11.sp, color = Color.Gray, fontFamily = FontFamily.Monospace)
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("SUBTOTAL:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.Black, fontFamily = FontFamily.Monospace)
                            Text("7,100 $currencySymbol", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.Black, fontFamily = FontFamily.Monospace)
                        }
                        if (showTaxOnReceipt) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("VAT (18% Included):", fontSize = 10.sp, color = Color.DarkGray, fontFamily = FontFamily.Monospace)
                                Text("1,083 $currencySymbol", fontSize = 10.sp, color = Color.DarkGray, fontFamily = FontFamily.Monospace)
                            }
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("TOTAL PAID (CASH):", fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color.Black, fontFamily = FontFamily.Monospace)
                            Text("7,100 $currencySymbol", fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color.Black, fontFamily = FontFamily.Monospace)
                        }
                        Text("================================", fontSize = 11.sp, color = Color.Gray, fontFamily = FontFamily.Monospace)

                        if (showBarcodeOnReceipt) {
                            Icon(Icons.Default.QrCode, contentDescription = null, modifier = Modifier.size(64.dp), tint = Color.Black)
                            Text("*RC-2026-08819*", fontSize = 9.sp, color = Color.Black, fontFamily = FontFamily.Monospace)
                            Spacer(modifier = Modifier.height(4.dp))
                        }

                        Text(receiptFooter.ifBlank { "Murakoze Cyane! Thank you!" }, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.Black, fontFamily = FontFamily.Monospace)
                        Text("Powered by BeBoss Offline POS", fontSize = 9.sp, color = Color.Gray, fontFamily = FontFamily.Monospace)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onTestPrint()
                },
                colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary)
            ) {
                Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Send Test Print")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("Close")
            }
        }
    )
}

@Composable
fun ResetTransactionsDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    language: AppLanguage
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.RestartAlt, contentDescription = null, tint = LossRed)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Reset Sales History?", fontWeight = FontWeight.Bold, color = LossRed, fontSize = 17.sp)
            }
        },
        text = {
            Text(
                "This will safely erase sales transactions, purchases, and debt histories so you can start a fresh accounting period.\n\nYour product catalog, branches, users, and shop settings will be 100% PRESERVED."
            )
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(containerColor = LossRed)
            ) {
                Text("Reset Now", color = Color.White, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun ConfirmDestructiveDialog(
    title: String,
    message: String,
    confirmText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = true,
    language: AppLanguage
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Warning, contentDescription = null, tint = if (destructive) LossRed else OrangePrimary)
                Spacer(modifier = Modifier.width(8.dp))
                Text(title, fontWeight = FontWeight.Bold, color = if (destructive) LossRed else MaterialTheme.colorScheme.onSurface, fontSize = 17.sp)
            }
        },
        text = {
            Text(message)
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(containerColor = if (destructive) LossRed else OrangePrimary)
            ) {
                Text(confirmText, color = Color.White, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    confirmText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    language: AppLanguage
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp) },
        text = { Text(message) },
        confirmButton = {
            Button(onClick = onConfirm) {
                Text(confirmText, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

private fun printThermalTestPage(
    context: Context,
    paperWidthMm: Int,
    shopName: String,
    receiptHeader: String,
    address: String,
    phone: String,
    ownerName: String,
    tinNumber: String,
    showTaxOnReceipt: Boolean,
    receiptFooter: String,
    currencySymbol: String
) {
    val safeShop = shopName.ifBlank { "BEBOSS RETAIL SHOP" }
    val safeAddress = address.ifBlank { "Kigali, Rwanda" }
    val safePhone = phone.ifBlank { "+250 788 000 000" }
    val safeCashier = ownerName.ifBlank { "Main Cashier" }
    val safeFooter = receiptFooter.ifBlank { "Murakoze Cyane! Thank you!" }
    val html = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8" />
            <style>
                body { font-family: monospace; width: ${paperWidthMm}mm; margin: 0 auto; padding: 8px; font-size: 11px; color: #000; }
                .center { text-align: center; }
                .row { display: flex; justify-content: space-between; margin: 2px 0; }
                hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
            </style>
        </head>
        <body>
            <div class="center">
                <strong>${safeShop.uppercase()}</strong><br/>
                ${if (receiptHeader.isNotBlank()) "$receiptHeader<br/>" else ""}
                $safeAddress<br/>Tel: $safePhone<br/>
                ${if (showTaxOnReceipt && tinNumber.isNotBlank()) "TIN: $tinNumber<br/>" else ""}
            </div>
            <hr/>
            <div>TEST PRINT (${paperWidthMm}mm ESC/POS)<br/>Cashier: $safeCashier</div>
            <hr/>
            <div class="row"><span>Inyange Milk 500ml x 2</span><span>1,400 $currencySymbol</span></div>
            <div class="row"><span>Azam Bread 1kg</span><span>1,200 $currencySymbol</span></div>
            <div class="row"><span>Gorilla Coffee 250g</span><span>4,500 $currencySymbol</span></div>
            <hr/>
            <div class="row"><strong>TOTAL PAID</strong><strong>7,100 $currencySymbol</strong></div>
            <hr/>
            <div class="center">$safeFooter<br/><small>Powered by BeBoss Offline POS</small></div>
        </body>
        </html>
    """.trimIndent()

    try {
        val webView = WebView(context)
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager
                val jobName = "BeBoss_Thermal_Test_${paperWidthMm}mm"
                val adapter = webView.createPrintDocumentAdapter(jobName)
                printManager?.print(jobName, adapter, PrintAttributes.Builder().build())
            }
        }
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
    } catch (e: Exception) {
        Toast.makeText(context, "Unable to open print service: ${e.safeMessage()}", Toast.LENGTH_LONG).show()
    }
}