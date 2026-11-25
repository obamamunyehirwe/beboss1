package com.beboss.shopmgmt

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.MotionEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.SyncProblem
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.beboss.shopmgmt.util.safeMessage
import androidx.lifecycle.viewmodel.compose.viewModel
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.ui.components.BeBossBlurLoadingContainer
import com.beboss.shopmgmt.ui.components.BeBossBottomNav
import com.beboss.shopmgmt.ui.components.BeBossNavigationRail
import com.beboss.shopmgmt.ui.components.BeBossTopBar
import com.beboss.shopmgmt.ui.components.PermissionRequestDialog
import com.beboss.shopmgmt.ui.components.QuickCustomSaleDialog
import com.beboss.shopmgmt.ui.components.QuickSpeedDialSheet
import com.beboss.shopmgmt.ui.components.ReceiptDialog
import com.beboss.shopmgmt.ui.components.UniversalSearchDialog
import com.beboss.shopmgmt.ui.screens.AnalyticsScreen
import com.beboss.shopmgmt.ui.screens.AppSplashScreen
import com.beboss.shopmgmt.ui.screens.AuthLockScreen
import com.beboss.shopmgmt.ui.screens.CustomersScreen
import com.beboss.shopmgmt.ui.screens.DashboardScreen
import com.beboss.shopmgmt.ui.screens.InventoryScreen
import com.beboss.shopmgmt.ui.screens.SalesHistoryScreen
import com.beboss.shopmgmt.ui.screens.SalesPosScreen
import com.beboss.shopmgmt.ui.screens.SettingsScreen
import com.beboss.shopmgmt.ui.screens.ShopRegistrationScreen
import com.beboss.shopmgmt.ui.theme.MyApplicationTheme
import com.beboss.shopmgmt.ui.viewmodel.AppScreen
import com.beboss.shopmgmt.ui.viewmodel.BeBossViewModel
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.BiometricAuthManager
import com.beboss.shopmgmt.util.AndroidDeviceCredentialStore
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.ConnectivityStatus
import com.beboss.shopmgmt.util.Localization
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    @Volatile
    private var activeViewModel: BeBossViewModel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AndroidDeviceCredentialStore.initialize(applicationContext)
        ClockGuard.init(this)
        // Enterprise hardening: FLAG_SECURE, screenshot prevention and touch filtering apply to
        // ALL builds (debug and release) so no screen content ever leaks to recents, adb
        // screencap, or third-party accessibility/capture services.
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            setRecentsScreenshotEnabled(false)
        }
        window.decorView.rootView.filterTouchesWhenObscured = true
        enableEdgeToEdge()

        setContent {
            var databaseReady by remember { mutableStateOf(false) }
            var startupError by remember { mutableStateOf<String?>(null) }
            var startupAttempt by remember { mutableStateOf(0) }

            // Open the encrypted Room database before constructing the ViewModel.
            // Previously the ViewModel was created first and database errors were
            // swallowed, which could leave emulator/BlueStacks users with a blank
            // screen and no actionable error.
            LaunchedEffect(startupAttempt) {
                databaseReady = false
                startupError = null
                try {
                    withContext(Dispatchers.IO) {
                        AppDatabase.getDatabase(applicationContext)
                    }
                    databaseReady = true
                } catch (error: Throwable) {
                    startupError = error.safeMessage(error.javaClass.simpleName)
                }
            }

            if (databaseReady) {
                val viewModel: BeBossViewModel = viewModel()
                val isDarkTheme by viewModel.isDarkTheme.collectAsState(initial = false)
                MyApplicationTheme(darkTheme = isDarkTheme) {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        activeViewModel = viewModel
                        BeBossApp(viewModel = viewModel)
                    }
                }
            } else {
                MyApplicationTheme(darkTheme = false) {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(28.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            if (startupError == null) {
                                Text("BeBoss", fontSize = 28.sp, fontWeight = FontWeight.Black)
                                CircularProgressIndicator(modifier = Modifier.padding(20.dp))
                                Text("Preparing your secure business workspace…")
                            } else {
                                Icon(
                                    imageVector = androidx.compose.material.icons.Icons.Filled.Warning,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(42.dp)
                                )
                                Text(
                                    "BeBoss could not open its local database",
                                    fontSize = 19.sp,
                                    fontWeight = FontWeight.Bold,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                    modifier = Modifier.padding(top = 16.dp)
                                )
                                Text(
                                    startupError.orEmpty(),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                    modifier = Modifier.padding(vertical = 12.dp)
                                )
                                Text(
                                    "Your saved shop data has not been deleted. Check available storage and retry.",
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                                TextButton(onClick = { startupAttempt++ }) {
                                    Text("Try again")
                                }
                            }
                        }
                    }
                }
            }
        }
    }


    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        if (ev != null) {
            activeViewModel?.onUserInteraction()
        }
        return super.dispatchTouchEvent(ev)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            window.decorView.post { hideSystemNavigationBars() }
        }
    }

    /**
     * Automatically hides the phone bottom navigation bar (home, back, recent tasks)
     * in immersive mode so the app behaves like an enterprise hardware POS terminal.
     */
    private fun hideSystemNavigationBars() {
        try {
            val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
            windowInsetsController.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            windowInsetsController.hide(WindowInsetsCompat.Type.navigationBars())
        } catch (e: Exception) {
            // Graceful fallback on older vendor skins
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        activeViewModel = null
    }
}

@Composable
fun BeBossApp(viewModel: BeBossViewModel = viewModel()) {
    val isDarkTheme by viewModel.isDarkTheme.collectAsState()
    val currentLanguage by viewModel.currentLanguage.collectAsState()
    var showSplashScreen by remember { mutableStateOf(true) }

    if (showSplashScreen) {
        AppSplashScreen(
            isDarkTheme = isDarkTheme,
            language = currentLanguage,
            durationMs = 520L,
            onSplashFinished = { showSplashScreen = false }
        )
    } else {
        BeBossMainContent(
            viewModel = viewModel,
            isDarkTheme = isDarkTheme,
            onShowSplashScreen = { showSplashScreen = true }
        )
    }
}

@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
private fun BeBossMainContent(
    viewModel: BeBossViewModel,
    isDarkTheme: Boolean,
    onShowSplashScreen: () -> Unit
) {
    val context = LocalContext.current
    val hostActivity = context as? Activity
    val widthSizeClass = if (hostActivity != null) {
        calculateWindowSizeClass(hostActivity).widthSizeClass
    } else {
        WindowWidthSizeClass.Compact
    }
    val useNavRail = widthSizeClass != WindowWidthSizeClass.Compact
    val currentScreen by viewModel.currentScreen.collectAsState()
    val shopProfile by viewModel.shopProfile.collectAsState()
    val allProducts by viewModel.allProducts.collectAsState()
    val lowStockProducts by viewModel.lowStockProducts.collectAsState()
    val categories by viewModel.categories.collectAsState()
    val inventoryValuation by viewModel.inventoryValuation.collectAsState()
    val customers by viewModel.customers.collectAsState()
    val totalOutstandingDebt by viewModel.totalOutstandingDebt.collectAsState()
    val cartState by viewModel.cartState.collectAsState()
    val heldCarts by viewModel.heldCarts.collectAsState()
    val deviceIntegrityStatus by viewModel.deviceIntegrityStatus.collectAsState()
    val allSales by viewModel.allSales.collectAsState()
    val allPurchases by viewModel.allPurchases.collectAsState()
    val purchaseSummary by viewModel.purchaseSummary.collectAsState()
    val allCustomerPayments by viewModel.allCustomerPayments.collectAsState()
    val todaySummary by viewModel.todaySummary.collectAsState()
    val profitLossSummary by viewModel.profitLossSummary.collectAsState()
    val dailyChartPoints by viewModel.dailyChartPoints.collectAsState()
    val topProducts by viewModel.topProducts.collectAsState()
    val categoryBreakdown by viewModel.categoryBreakdown.collectAsState()
    val selectedPeriod by viewModel.selectedAnalyticsPeriod.collectAsState()
    val pendingSyncCount by viewModel.pendingSyncCount.collectAsState()
    val deadLetterSyncCount by viewModel.deadLetterSyncCount.collectAsState()
    val startupIntegrityOk by viewModel.startupIntegrityOk.collectAsState()
    val isSyncing by viewModel.isSyncing.collectAsState()
    val activeReceipt by viewModel.activeReceiptSale.collectAsState()

    // Auth, Theme & Language state
    val currentUser by viewModel.currentUser.collectAsState()
    val allUsers by viewModel.allUsers.collectAsState()
    val branches by viewModel.branches.collectAsState()
    val shopDevices by viewModel.shopDevices.collectAsState()
    val selectedBranchId by viewModel.selectedBranchId.collectAsState()
    val connectivityStatus by viewModel.connectivityStatus.collectAsState()
    val cloudSyncReport by viewModel.cloudSyncReport.collectAsState()
    val localServerStatus by viewModel.localServerStatus.collectAsState()
    val localServerIp by viewModel.localServerIp.collectAsState()
    val localConnectedClients by viewModel.localConnectedClients.collectAsState()
    val localLastReceivedPacket by viewModel.localLastReceivedPacket.collectAsState()
    val isP2pSyncing by viewModel.isP2pSyncing.collectAsState()
    val syncAuditLogs by viewModel.syncAuditLogs.collectAsState()
    val isLocked by viewModel.isLocked.collectAsState()
    val isRegistrationNeeded by viewModel.isRegistrationNeeded.collectAsState()
    val authError by viewModel.authError.collectAsState()
    val currentLanguage by viewModel.currentLanguage.collectAsState()
    val databaseStats by viewModel.databaseStats.collectAsState()
    val isOptimizingDb by viewModel.isOptimizingDb.collectAsState()
    val stockTransfers by viewModel.allStockTransfers.collectAsState()
    val paymentVerificationRequests by viewModel.paymentVerificationRequests.collectAsState()
    val discoveredHubs by viewModel.discoveredHubs.collectAsState()
    val isDiscoveringHubs by viewModel.isDiscoveringHubs.collectAsState()
    val peerSyncEvents by viewModel.peerSyncEvents.collectAsState()
    val adminSession by viewModel.adminSession.collectAsState()
    val adminAuthError by viewModel.adminAuthError.collectAsState()
    val isAdminAuthenticating by viewModel.isAdminAuthenticating.collectAsState()
    val adminPaymentRequests by viewModel.adminPaymentRequests.collectAsState()
    val adminShopAccounts by viewModel.adminShopAccounts.collectAsState()
    val adminShopUsers by viewModel.adminShopUsers.collectAsState()
    val adminShopDevices by viewModel.adminShopDevices.collectAsState()
    val adminBranchSnapshots by viewModel.adminBranchSnapshots.collectAsState()
    val adminUnlockCodes by viewModel.adminUnlockCodes.collectAsState()
    val adminAuditLogs by viewModel.adminAuditLogs.collectAsState()
    val localAuditLogs by viewModel.localAuditLogs.collectAsState()
    val adminPaymentConfig by viewModel.adminPaymentConfig.collectAsState()
    val isAdminLoading by viewModel.isAdminLoading.collectAsState()
    val adminLastSyncedAt by viewModel.adminLastSyncedAt.collectAsState()
    val idleLockMinutes by viewModel.idleLockMinutes.collectAsState()
    val blurLoadingState by viewModel.blurLoadingState.collectAsState()
    val clockTamperStatus by viewModel.clockTamperStatus.collectAsState()
    val lastCapturedLocation by viewModel.lastCapturedLocation.collectAsState()
    val messageDispatchRecords by viewModel.messageDispatchRecords.collectAsState()

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.onAppResumedSecurityCheck()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val snackbarHostState = remember { SnackbarHostState() }
    var showQuickSpeedDialSheet by remember { mutableStateOf(false) }
    var showQuickCustomSaleDialog by remember { mutableStateOf(false) }
    var showUniversalSearchDialog by remember { mutableStateOf(false) }
    var showPermissionOnboardingDialog by remember { mutableStateOf(false) }
    var showPaywallAdminConsole by remember { mutableStateOf(false) }

    val debtorsCount = remember(customers) { customers.count { it.debtBalance > 0 } }
    val activeTamperRollback = clockTamperStatus.rollbackDetected || clockTamperStatus.activeTamperLock || deviceIntegrityStatus.clockRollbackDetected

    // Proactively check crucial hardware and phone permissions right after splash
    LaunchedEffect(Unit) {
        if (!com.beboss.shopmgmt.util.PermissionManager.hasAllCrucialPermissions(context)) {
            showPermissionOnboardingDialog = true
        } else {
            viewModel.onPermissionsUpdated()
        }
    }

    LaunchedEffect(Unit) {
        viewModel.snackbarMessage.collectLatest { msg ->
            snackbarHostState.showSnackbar(
                message = msg,
                duration = SnackbarDuration.Short
            )
        }
    }

    BeBossBlurLoadingContainer(loadingState = blurLoadingState) {
    if (isRegistrationNeeded) {
        ShopRegistrationScreen(
            language = currentLanguage,
            isDarkTheme = isDarkTheme,
            authError = authError,
            onRegister = { shopName, businessType, currencyCode, currencySymbol, address, phone, ownerName, username, pin, password ->
                viewModel.registerNewShopAndOwner(
                    shopName = shopName,
                    businessType = businessType,
                    currencyCode = currencyCode,
                    currencySymbol = currencySymbol,
                    address = address,
                    phone = phone,
                    ownerFullName = ownerName,
                    username = username,
                    pin = pin,
                    password = password
                )
            },
            onJoinExistingShop = { ownerUsername, ownerPhone, deviceJoinCode, thisDeviceName, pin, password ->
                viewModel.joinExistingShopFromCloud(
                    ownerUsername = ownerUsername,
                    ownerPhone = ownerPhone,
                    deviceJoinCode = deviceJoinCode,
                    thisDeviceName = thisDeviceName,
                    pin = pin,
                    password = password
                )
            },
            onClearError = { viewModel.clearAuthError() },
            onCancel = { viewModel.cancelRegistration() },
            onToggleLanguage = { viewModel.toggleLanguage() },
            onSelectLanguage = { lang -> viewModel.setLanguage(lang) },
            onToggleTheme = { viewModel.toggleDarkMode() }
        )
    } else if (isLocked) {
        val activity = context as? Activity
        AuthLockScreen(
            currentUser = currentUser,
            allUsers = allUsers,
            shopProfile = shopProfile,
            authError = authError,
            language = currentLanguage,
            isDarkTheme = isDarkTheme,
            onUnlockWithPin = { pin -> viewModel.unlockAppWithPin(pin) },
            onLoginWithCredentials = { user, pass -> viewModel.loginWithCredentials(user, pass) },
            onBiometricUnlock = {
                if (activity != null && BiometricAuthManager.isBiometricAvailable(context)) {
                    BiometricAuthManager.promptBiometric(
                        activity = activity,
                        title = Localization.get("biometric_prompt_title", currentLanguage),
                        subtitle = Localization.get("biometric_prompt_subtitle", currentLanguage),
                        negativeButtonText = Localization.get("biometric_use_pin", currentLanguage),
                        onSuccess = { viewModel.unlockWithBiometric(verifiedByHardware = true) },
                        onError = { msg -> viewModel.reportBiometricError(msg) },
                        onFailed = { viewModel.reportBiometricCancelled() }
                    )
                } else {
                    viewModel.reportBiometricError(
                        Localization.get("biometric_unavailable", currentLanguage)
                    )
                }
            },
            onSelectUser = { user -> viewModel.selectLockedOperator(user) },
            onClearError = { viewModel.clearAuthError() },
            onToggleLanguage = { viewModel.toggleLanguage() },
            onSelectLanguage = { lang -> viewModel.setLanguage(lang) },
            onToggleTheme = { viewModel.toggleDarkMode() },
            onOpenRegister = { viewModel.showRegistrationScreen() }
        )
    } else {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            snackbarHost = { SnackbarHost(snackbarHostState) },
            topBar = {
                BeBossTopBar(
                    currentScreen = currentScreen,
                    shopProfile = shopProfile,
                    currentUser = currentUser,
                    pendingSyncCount = pendingSyncCount,
                    isSyncing = isSyncing,
                    language = currentLanguage,
                    isDarkTheme = isDarkTheme,
                    onToggleLanguage = { viewModel.toggleLanguage() },
                    onToggleTheme = { viewModel.toggleDarkMode() },
                    onSearchClick = { showUniversalSearchDialog = true },
                    onQuickActionsClick = { showQuickSpeedDialSheet = true },
                    onSettingsClick = { viewModel.navigateTo(AppScreen.SETTINGS) },
                    onSyncClick = { viewModel.performSync() },
                    onHistoryClick = { viewModel.navigateTo(AppScreen.SALES_HISTORY) },
                    onLockClick = { viewModel.lockApp() }
                )
            },
            bottomBar = {
                if (!useNavRail) {
                    BeBossBottomNav(
                        currentScreen = currentScreen,
                        cartItemCount = cartState.items.size,
                        lowStockCount = lowStockProducts.size,
                        debtorCount = debtorsCount,
                        language = currentLanguage,
                        onNavigate = { screen -> viewModel.navigateTo(screen) },
                        onOpenQuickActions = { showQuickSpeedDialSheet = true }
                    )
                }
            }
        ) { innerPadding ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                if (useNavRail) {
                    BeBossNavigationRail(
                        currentScreen = currentScreen,
                        cartItemCount = cartState.items.size,
                        lowStockCount = lowStockProducts.size,
                        debtorCount = debtorsCount,
                        language = currentLanguage,
                        onNavigate = { screen -> viewModel.navigateTo(screen) },
                        onOpenQuickActions = { showQuickSpeedDialSheet = true }
                    )
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxSize(),
                    contentAlignment = Alignment.TopCenter
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .widthIn(max = 1140.dp)
                    ) {
                        BeBossRuntimeStatusBanner(
                            connectivityStatus = connectivityStatus,
                            pendingSyncCount = pendingSyncCount,
                            deadLetterSyncCount = deadLetterSyncCount,
                            startupIntegrityOk = startupIntegrityOk,
                            clockRollbackDetected = activeTamperRollback,
                            tamperIncidentCount = clockTamperStatus.incidentCount,
                            language = currentLanguage,
                            onRetrySync = { viewModel.performSync() },
                            onVerifyShield = { viewModel.reInspectSecurityPosture(syncTrustedTime = true) },
                            onOpenSettings = { viewModel.navigateTo(AppScreen.SETTINGS) }
                        )
                        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                            AnimatedContent(
                                targetState = currentScreen,
                                transitionSpec = {
                                    fadeIn(animationSpec = tween(140)) togetherWith fadeOut(animationSpec = tween(90))
                                },
                                label = "ScreenTransition"
                            ) { targetScreen ->
                    when (targetScreen) {
                        AppScreen.DASHBOARD -> {
                            DashboardScreen(
                                shopProfile = shopProfile,
                                todaySummary = todaySummary,
                                inventoryValuation = inventoryValuation,
                                lowStockProducts = lowStockProducts,
                                recentSales = allSales,
                                hasProducts = allProducts.isNotEmpty(),
                                currentUser = currentUser,
                                language = currentLanguage,
                                branches = branches,
                                selectedBranchId = selectedBranchId,
                                connectivityStatus = connectivityStatus,
                                isSyncing = isSyncing,
                                cloudSyncReport = cloudSyncReport,
                                onSelectBranch = { branchId -> viewModel.selectBranch(branchId) },
                                onNavigate = { screen -> viewModel.navigateTo(screen) },
                                onOpenReceipt = { saleId -> viewModel.openReceipt(saleId) },
                                onRestockClick = { product ->
                                    viewModel.navigateTo(AppScreen.INVENTORY)
                                },
                                onAddProductClick = {
                                    viewModel.navigateTo(AppScreen.INVENTORY)
                                }
                            )
                        }

                        AppScreen.SALES_POS -> {
                            SalesPosScreen(
                                products = allProducts,
                                categories = categories,
                                customers = customers,
                                cartState = cartState,
                                heldCarts = heldCarts,
                                shopProfile = shopProfile,
                                language = currentLanguage,
                                onAddToCart = { p -> viewModel.addToCart(p) },
                                onUpdateQuantity = { pId, qty -> viewModel.updateCartItemQuantity(pId, qty) },
                                onRemoveItem = { pId -> viewModel.removeCartItem(pId) },
                                onClearCart = { viewModel.clearCart() },
                                onSelectCustomer = { c -> viewModel.setCartCustomer(c) },
                                onSetPaymentMethod = { m -> viewModel.setCartPaymentMethod(m) },
                                onSetDiscount = { d -> viewModel.setCartDiscount(d) },
                                onSetAmountPaid = { a -> viewModel.setCartAmountPaidInput(a) },
                                onSetSplitCash = { s -> viewModel.setCartSplitCashInput(s) },
                                onSetSplitMomo = { s -> viewModel.setCartSplitMomoInput(s) },
                                onSetNotes = { n -> viewModel.setCartNotes(n) },
                                onHoldCart = { lbl -> viewModel.holdCurrentCart(lbl) },
                                onResumeHeldCart = { id -> viewModel.resumeHeldCart(id) },
                                onDeleteHeldCart = { id -> viewModel.deleteHeldCart(id) },
                                onCheckout = { viewModel.checkoutSale() },
                                onQuickAddProduct = { viewModel.navigateTo(AppScreen.INVENTORY) }
                            )
                        }

                        AppScreen.INVENTORY -> {
                            InventoryScreen(
                                products = allProducts,
                                categories = categories,
                                inventoryValuation = inventoryValuation,
                                shopProfile = shopProfile,
                                purchases = allPurchases,
                                purchaseSummary = purchaseSummary,
                                language = currentLanguage,
                                onSaveProduct = { p -> viewModel.saveProduct(p) },
                                onAdjustStock = { pId, delta, reason -> viewModel.adjustStock(pId, delta, reason) },
                                onDeleteProduct = { pId -> viewModel.deleteProduct(pId) },
                                onClearAllProducts = { viewModel.clearAllProducts() },
                                onRecordPurchase = { prodId, qty, cost, sellPrice, supplier, phone, status, inv, notes ->
                                    viewModel.recordPurchaseOrder(
                                        productId = prodId,
                                        quantity = qty,
                                        unitCostPrice = cost,
                                        newSellingPrice = sellPrice,
                                        supplierName = supplier,
                                        supplierPhone = phone,
                                        paymentStatus = status,
                                        invoiceNumber = inv,
                                        notes = notes
                                    )
                                },
                                onDeletePurchase = { pId -> viewModel.deletePurchaseRecord(pId) }
                            )
                        }

                        AppScreen.ANALYTICS -> {
                            AnalyticsScreen(
                                selectedPeriod = selectedPeriod,
                                summary = profitLossSummary,
                                chartPoints = dailyChartPoints,
                                topProducts = topProducts,
                                categoryShares = categoryBreakdown,
                                products = allProducts,
                                shopProfile = shopProfile,
                                language = currentLanguage,
                                onPeriodSelected = { p -> viewModel.setAnalyticsPeriod(p) }
                            )
                        }

                        AppScreen.CUSTOMERS -> {
                            CustomersScreen(
                                customers = customers,
                                totalOutstandingDebt = totalOutstandingDebt,
                                shopProfile = shopProfile,
                                allSales = allSales,
                                allPayments = allCustomerPayments,
                                language = currentLanguage,
                                onSaveCustomer = { c -> viewModel.saveCustomer(c) },
                                onRecordPayment = { cId, amt, method -> viewModel.recordDebtPayment(cId, amt, method) },
                                onDeleteCustomer = { cId -> viewModel.deleteCustomer(cId) },
                                onClearAllCustomers = { viewModel.clearAllCustomers() }
                            )
                        }

                        AppScreen.SALES_HISTORY -> {
                            SalesHistoryScreen(
                                sales = allSales,
                                shopProfile = shopProfile,
                                language = currentLanguage,
                                onOpenReceipt = { saleId -> viewModel.openReceipt(saleId) },
                                onDeleteSale = { saleId, reason -> viewModel.deleteSale(saleId, reason) }
                            )
                        }

                        AppScreen.SETTINGS -> {
                            SettingsScreen(
                                shopProfile = shopProfile,
                                currentUser = currentUser,
                                allUsers = allUsers,
                                branches = branches,
                                shopDevices = shopDevices,
                                livePaymentConfig = adminPaymentConfig,
                                products = allProducts,
                                customers = customers,
                                sales = allSales,
                                customerPayments = allCustomerPayments,
                                pendingSyncCount = pendingSyncCount,
                                isSyncing = isSyncing,
                                connectivityStatus = connectivityStatus,
                                cloudSyncReport = cloudSyncReport,
                                databaseStats = databaseStats,
                                isOptimizingDb = isOptimizingDb,
                                language = currentLanguage,
                                isDarkTheme = isDarkTheme,
                                localServerStatus = localServerStatus,
                                localServerIp = localServerIp,
                                localConnectedClients = localConnectedClients,
                                localLastReceivedPacket = localLastReceivedPacket,
                                isP2pSyncing = isP2pSyncing,
                                syncAuditLogs = syncAuditLogs,
                                onToggleLanguage = { viewModel.toggleLanguage() },
                                onToggleTheme = { viewModel.toggleDarkMode() },
                                onSaveProfile = { prof -> viewModel.updateShopProfile(prof) },
                                onSyncNow = { viewModel.performSync() },
                                onSyncToCloudNow = { viewModel.syncToCloudNow() },
                                onSyncCloudWithEndpoint = { endpoint -> viewModel.syncToCloudWithEndpoint(endpoint) },
                                onTestPing = { endpoint, cb -> viewModel.testEndpointPing(endpoint, cb) },
                                onToggleLocalServer = { enable -> viewModel.toggleLocalSyncServer(enable) },
                                onSyncWithLocalHub = { hubIp -> viewModel.syncWithLocalMasterHub(hubIp) },
                                onRefreshDatabaseStats = { viewModel.refreshDatabaseStats() },
                                onOptimizeDatabase = { viewModel.optimizeDatabase() },
                                onVerifyDatabaseIntegrity = { viewModel.verifyDatabaseIntegrity() },
                                onClearTransactionalData = { viewModel.clearTransactionalDataOnly() },
                                onClearAllProducts = { viewModel.clearAllProducts() },
                                onClearAllCustomers = { viewModel.clearAllCustomers() },
                                onResetWholeApp = { viewModel.resetWholeApp() },
                                onSaveBranch = { b -> viewModel.saveBranch(b) },
                                onDeleteBranch = { bId -> viewModel.deleteBranch(bId) },
                                onAddShopDevice = { deviceName, assignedUser, branch, onCreated ->
                                    viewModel.addSecondaryShopDevice(deviceName, assignedUser, branch, onCreated)
                                },
                                onToggleShopDeviceActive = { deviceId, isActive ->
                                    viewModel.toggleShopDeviceActive(deviceId, isActive)
                                },
                                onDeleteShopDevice = { deviceId ->
                                    viewModel.deleteShopDevice(deviceId)
                                },
                                onCreateStockTransfer = { prodId, fromId, fromName, toId, toName, qty, notes ->
                                    viewModel.createStockTransfer(prodId, fromId, fromName, toId, toName, qty, notes)
                                },
                                onDeleteStockTransfer = { id -> viewModel.deleteStockTransfer(id) },
                                selectedBranchId = selectedBranchId,
                                onSelectActiveBranch = { branchId -> viewModel.selectBranch(branchId) },
                                onSaveUser = { u -> viewModel.saveUser(u) },
                                onDeleteUser = { uId -> viewModel.deleteUser(uId) },
                                onImportPackage = { summary -> viewModel.importShopPackage(summary) },
                                onLockApp = { viewModel.lockApp() },
                                onLogout = { viewModel.logoutUser() },
                                onSwitchUser = { u -> viewModel.switchUser(u) },
                                onActivateVoucher = { code -> viewModel.activateSubscriptionVoucher(code) },
                                onProcessDirectPayment = { provider, phone, durationMonths, userRef, onSuccess ->
                                    viewModel.processDirectSubscriptionPayment(
                                        provider = provider,
                                        phone = phone,
                                        durationMonths = durationMonths,
                                        userReference = userRef,
                                        onResult = onSuccess
                                    )
                                },
                                deadLetterSyncCount = deadLetterSyncCount,
                                deviceIntegrityStatus = deviceIntegrityStatus,
                                paymentVerificationRequests = paymentVerificationRequests,
                                discoveredHubs = discoveredHubs,
                                isDiscoveringHubs = isDiscoveringHubs,
                                peerSyncEvents = peerSyncEvents,
                                onStartLanDiscovery = { viewModel.startLanDiscovery() },
                                onStopLanDiscovery = { viewModel.stopLanDiscovery() },
                                onGenerateBranchShareToken = { branchFilter, onReady ->
                                    viewModel.createBranchShareToken(branchFilter, onReady)
                                },
                                onExportFullBranchPackage = { branchFilter, onReady ->
                                    viewModel.exportFullBranchPackage(context, branchFilter, onReady)
                                },
                                onSubmitPaymentVerification = { provider, payerPhone, payerFullName, username, regPhone, months, branchCount, workerCount, deviceCount, paymentNote, onDone ->
                                    viewModel.submitUssdPaymentProof(
                                        provider = provider,
                                        payerPhone = payerPhone,
                                        username = username,
                                        registeredPhone = regPhone,
                                        durationMonths = months,
                                        branchCount = branchCount,
                                        workerCount = workerCount,
                                        payerFullName = payerFullName,
                                        deviceCount = deviceCount,
                                        paymentNote = paymentNote,
                                        onSubmitted = onDone
                                    )
                                },
                                onCheckCloudApproval = { viewModel.checkCloudUnlockApprovals() },
                                adminSession = adminSession,
                                adminAuthError = adminAuthError,
                                isAdminAuthenticating = isAdminAuthenticating,
                                adminPaymentRequests = adminPaymentRequests,
                                adminShopAccounts = adminShopAccounts,
                                adminShopUsers = adminShopUsers,
                                adminShopDevices = adminShopDevices,
                                adminBranchSnapshots = adminBranchSnapshots,
                                adminUnlockCodes = adminUnlockCodes,
                                adminAuditLogs = adminAuditLogs,
                                localAuditLogs = localAuditLogs,
                                isAdminLoading = isAdminLoading,
                                onAdminSignIn = { email, password -> viewModel.signInSupabaseAdmin(email, password) },
                                onAdminSignUp = { email, password, fullName -> viewModel.signUpSupabaseAdmin(email, password, fullName) },
                                onAdminSignOut = { viewModel.signOutSupabaseAdmin() },
                                onRefreshAdminDashboard = { viewModel.refreshAdminDashboardData() },
                                onAdminApprovePayment = { req, verificationNote, onDone ->
                                    viewModel.adminApproveAndGenerateCode(req, verificationNote, onDone)
                                },
                                onAdminSavePaymentConfig = { cfg, onDone ->
                                    viewModel.adminSavePaymentConfig(cfg, onDone)
                                },
                                onAdminToggleShopDevice = { dev, active ->
                                    viewModel.adminToggleShopDeviceActive(dev, active)
                                },
                                onAdminDeleteShopDevice = { dev ->
                                    viewModel.adminDeleteShopDevice(dev)
                                },
                                onAdminRejectPayment = { req, reason ->
                                    viewModel.adminRejectPayment(req, reason)
                                },
                                onAdminRevokeCode = { codeDto ->
                                    viewModel.adminRevokeCode(codeDto)
                                },
                                onAdminExtendShopSubscription = { shop, addDays ->
                                    viewModel.adminExtendShopSubscription(shop, addDays)
                                },
                                onAdminResetShopTrial = { shop ->
                                    viewModel.adminResetShopTrial(shop)
                                },
                                onAdminSetShopStatus = { shop, status ->
                                    viewModel.adminSetShopStatus(shop, status)
                                },
                                onAdminUpdateShopLimits = { shop, branchLimit, workerLimit, deviceLimit ->
                                    viewModel.adminUpdateShopLimits(shop, branchLimit, workerLimit, deviceLimit)
                                },
                                onAdminDeleteShopAccount = { shop ->
                                    viewModel.adminDeleteShopAccount(shop)
                                },
                                onAdminUpdateShopUserRole = { user, role ->
                                    viewModel.adminUpdateShopUserRole(user, role)
                                },
                                onAdminToggleShopUserActive = { user, active ->
                                    viewModel.adminToggleShopUserActive(user, active)
                                },
                                onAdminDeleteShopUser = { user ->
                                    viewModel.adminDeleteShopUser(user)
                                },
                                onAdminDeleteBranchSnapshot = { snap ->
                                    viewModel.adminDeleteBranchSnapshot(snap)
                                },
                                onShareAdminWebPortal = { viewModel.shareAdminWebPortal(context) },
                                onShowSplashScreen = onShowSplashScreen,
                                onTestNotification = { type -> viewModel.testNotification(type) },
                                onRequestPermissions = { showPermissionOnboardingDialog = true },
                                onSelectLanguage = { lang -> viewModel.setLanguage(lang) },
                                idleLockMinutes = idleLockMinutes,
                                onSetIdleLockMinutes = { mins -> viewModel.setIdleLockMinutes(mins) },
                                adminLastSyncedAt = adminLastSyncedAt,
                                clockTamperStatus = clockTamperStatus,
                                capturedLocation = lastCapturedLocation,
                                messageRecords = messageDispatchRecords,
                                onReInspectSecurity = { viewModel.reInspectSecurityPosture(syncTrustedTime = true) },
                                onCaptureLocation = { viewModel.captureCurrentLocationNow() }
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

    // Universal Permission Request Dialog (Proactive on first launch + On-Demand from Settings/Features)
    if (showPermissionOnboardingDialog) {
        PermissionRequestDialog(
            language = currentLanguage,
            onDismiss = { showPermissionOnboardingDialog = false }
        )
    }

    // Quick Speed Dial Sheet (Fast Actions)
    if (showQuickSpeedDialSheet) {
        QuickSpeedDialSheet(
            language = currentLanguage,
            onDismiss = { showQuickSpeedDialSheet = false },
            onQuickCustomSale = { showQuickCustomSaleDialog = true },
            onQuickAddProduct = { viewModel.navigateTo(AppScreen.INVENTORY) },
            onQuickNewCustomer = { viewModel.navigateTo(AppScreen.CUSTOMERS) },
            onUniversalSearch = { showUniversalSearchDialog = true },
            onShareDailySummary = { viewModel.shareDailyWhatsAppSummary(context) },
            onViewLastReceipt = { viewModel.openLastReceipt() }
        )
    }

    // Quick Custom Sale / Cashier Instant Checkout Modal
    if (showQuickCustomSaleDialog) {
        QuickCustomSaleDialog(
            currency = shopProfile.currencySymbol,
            language = currentLanguage,
            onDismiss = { showQuickCustomSaleDialog = false },
            onCompleteQuickSale = { desc, amt, method, isDirect ->
                viewModel.performQuickCustomSale(desc, amt, method, isDirect)
            }
        )
    }

    // Instant Universal Search Modal
    if (showUniversalSearchDialog) {
        UniversalSearchDialog(
            products = allProducts,
            customers = customers,
            sales = allSales,
            purchases = allPurchases,
            shopProfile = shopProfile,
            language = currentLanguage,
            onDismiss = { showUniversalSearchDialog = false },
            onAddToCart = { p ->
                viewModel.addToCart(p)
                viewModel.navigateTo(AppScreen.SALES_POS)
            },
            onOpenReceipt = { id -> viewModel.openReceipt(id) },
            onSelectCustomer = { c ->
                viewModel.setCartCustomer(c)
                viewModel.navigateTo(AppScreen.SALES_POS)
            },
            onQuickRestock = { p ->
                viewModel.navigateTo(AppScreen.INVENTORY)
            }
        )
    }

    // Active Subscription Hard-Lock Paywall (Non-dismissible after 4-day free trial or remote lock)
    if (shopProfile.shopName.isNotBlank() && !shopProfile.isSubscriptionActive && !isRegistrationNeeded) {
        com.beboss.shopmgmt.ui.screens.SubscriptionPaywallDialog(
            shopProfile = shopProfile,
            branches = branches,
            allUsers = allUsers,
            shopDevices = shopDevices,
            currentUser = currentUser,
            paymentRequests = paymentVerificationRequests,
            livePaymentConfig = adminPaymentConfig,
            language = currentLanguage,
            onActivateVoucher = { code -> viewModel.activateSubscriptionVoucher(code) },
            onProcessDirectPayment = { provider, phone, durationMonths, userRef, onSuccess ->
                viewModel.processDirectSubscriptionPayment(
                    provider = provider,
                    phone = phone,
                    durationMonths = durationMonths,
                    userReference = userRef,
                    onResult = onSuccess
                )
            },
            onSubmitPaymentVerification = { provider, payerPhone, payerFullName, username, regPhone, months, branchCount, workerCount, deviceCount, paymentNote, onDone ->
                viewModel.submitUssdPaymentProof(
                    provider = provider,
                    payerPhone = payerPhone,
                    username = username,
                    registeredPhone = regPhone,
                    durationMonths = months,
                    branchCount = branchCount,
                    workerCount = workerCount,
                    paymentNote = paymentNote,
                    payerFullName = payerFullName,
                    deviceCount = deviceCount,
                    onSubmitted = onDone
                )
            },
            onCheckCloudApproval = { viewModel.checkCloudUnlockApprovals() },
            onOpenAdminConsole = null
        )
    }

    // Master Admin Console accessible even when a terminal is on the Subscription Hard-Lock Paywall
    if (showPaywallAdminConsole) {
        com.beboss.shopmgmt.ui.screens.AdminVerificationConsoleDialog(
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
            paymentConfig = adminPaymentConfig,
            isLoading = isAdminLoading,
            language = currentLanguage,
            lastSyncedAt = adminLastSyncedAt,
            onSignInAdmin = { email, password -> viewModel.signInSupabaseAdmin(email, password) },
            onSignUpAdmin = { email, password, fullName -> viewModel.signUpSupabaseAdmin(email, password, fullName) },
            onSignOutAdmin = { viewModel.signOutSupabaseAdmin() },
            onRefresh = { viewModel.refreshAdminDashboardData() },
            onApprovePayment = { req, verificationNote, onDone -> viewModel.adminApproveAndGenerateCode(req, verificationNote, onDone) },
            onSavePaymentConfig = { cfg, onDone -> viewModel.adminSavePaymentConfig(cfg, onDone) },
            onToggleShopDeviceActive = { dev, active -> viewModel.adminToggleShopDeviceActive(dev, active) },
            onDeleteShopDevice = { dev -> viewModel.adminDeleteShopDevice(dev) },
            onRejectPayment = { req, reason -> viewModel.adminRejectPayment(req, reason) },
            onRevokeCode = { codeDto -> viewModel.adminRevokeCode(codeDto) },
            onExtendShopSubscription = { shop, addDays -> viewModel.adminExtendShopSubscription(shop, addDays) },
            onResetShopTrial = { shop -> viewModel.adminResetShopTrial(shop) },
            onSetShopStatus = { shop, status -> viewModel.adminSetShopStatus(shop, status) },
            onUpdateShopLimits = { shop, branchLimit, workerLimit, deviceLimit ->
                viewModel.adminUpdateShopLimits(shop, branchLimit, workerLimit, deviceLimit)
            },
            onDeleteShopAccount = { shop -> viewModel.adminDeleteShopAccount(shop) },
            onUpdateShopUserRole = { user, role -> viewModel.adminUpdateShopUserRole(user, role) },
            onToggleShopUserActive = { user, active -> viewModel.adminToggleShopUserActive(user, active) },
            onDeleteShopUser = { user -> viewModel.adminDeleteShopUser(user) },
            onDeleteBranchSnapshot = { snap -> viewModel.adminDeleteBranchSnapshot(snap) },
            onShareWebPortal = { viewModel.shareAdminWebPortal(context) },
            clockTamperStatus = clockTamperStatus,
            capturedLocation = lastCapturedLocation,
            messageRecords = messageDispatchRecords,
            onReInspectSecurity = { viewModel.reInspectSecurityPosture(syncTrustedTime = true) },
            onDismiss = { showPaywallAdminConsole = false }
        )
    }

    // Active Interactive Receipt Dialog
    activeReceipt?.let { receipt ->
        val receiptCustomerPhone = remember(receipt, customers) {
            customers.firstOrNull { it.id == receipt.sale.customerId }?.phone.orEmpty()
        }
        ReceiptDialog(
            saleWithItems = receipt,
            shopProfile = shopProfile,
            language = currentLanguage,
            customerPhone = receiptCustomerPhone,
            onDismiss = { viewModel.closeReceipt() }
        )
    }
    }
}

@Composable
private fun BeBossRuntimeStatusBanner(
    connectivityStatus: ConnectivityStatus,
    pendingSyncCount: Int,
    deadLetterSyncCount: Int,
    startupIntegrityOk: Boolean?,
    clockRollbackDetected: Boolean,
    tamperIncidentCount: Int = 0,
    language: AppLanguage,
    onRetrySync: () -> Unit,
    onVerifyShield: () -> Unit = {},
    onOpenSettings: () -> Unit
) {
    val isOfflineWithQueue = connectivityStatus != ConnectivityStatus.AVAILABLE && pendingSyncCount > 0
    val showBanner = startupIntegrityOk == false || clockRollbackDetected || deadLetterSyncCount > 0 || isOfflineWithQueue
    AnimatedVisibility(visible = showBanner) {
        val isCritical = startupIntegrityOk == false || clockRollbackDetected || deadLetterSyncCount > 0
        val containerColor = if (isCritical) {
            MaterialTheme.colorScheme.errorContainer
        } else {
            MaterialTheme.colorScheme.secondaryContainer
        }
        val contentColor = if (isCritical) {
            MaterialTheme.colorScheme.onErrorContainer
        } else {
            MaterialTheme.colorScheme.onSecondaryContainer
        }
        val icon = when {
            startupIntegrityOk == false || clockRollbackDetected -> Icons.Default.Warning
            deadLetterSyncCount > 0 -> Icons.Default.SyncProblem
            else -> Icons.Default.CloudOff
        }
        val message = when {
            startupIntegrityOk == false -> Localization.get("banner_db_warning", language)
            clockRollbackDetected -> buildString {
                append(Localization.get("banner_clock_rollback", language))
                if (tamperIncidentCount > 0) append(" ($tamperIncidentCount)")
            }
            deadLetterSyncCount > 0 -> "${Localization.get("banner_dead_letter", language)} ($deadLetterSyncCount)"
            else -> "${Localization.get("banner_offline_queue", language)} ($pendingSyncCount)"
        }
        val actionLabel = when {
            clockRollbackDetected -> "Verify Shield"
            deadLetterSyncCount > 0 -> Localization.get("retry", language)
            isCritical -> Localization.get("inspect", language)
            else -> null
        }

        Surface(
            color = containerColor,
            contentColor = contentColor,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 4.dp)
                .testTag("runtime_status_banner")
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(
                    text = message,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f)
                )
                if (actionLabel != null) {
                    TextButton(
                        onClick = {
                            when {
                                clockRollbackDetected -> onVerifyShield()
                                deadLetterSyncCount > 0 -> onRetrySync()
                                else -> onOpenSettings()
                            }
                        },
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .testTag(if (clockRollbackDetected) "banner_verify_shield_btn" else "banner_action_btn")
                    ) {
                        Text(actionLabel, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
