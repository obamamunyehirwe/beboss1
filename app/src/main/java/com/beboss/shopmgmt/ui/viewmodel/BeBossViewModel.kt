package com.beboss.shopmgmt.ui.viewmodel

import android.app.Application
import android.content.Context
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.AnalyticsPeriod
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.BranchPerformanceMetric
import com.beboss.shopmgmt.data.model.CartItem
import com.beboss.shopmgmt.data.model.CategorySalesShare
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerAgingSummary
import com.beboss.shopmgmt.data.model.CustomerPayment
import com.beboss.shopmgmt.data.model.DailyAnalyticsPoint
import com.beboss.shopmgmt.data.model.DatabaseEngineStats
import com.beboss.shopmgmt.data.model.DatabaseMaintenanceResult
import com.beboss.shopmgmt.data.model.DeadLetterItem
import com.beboss.shopmgmt.data.model.InventoryValuation
import com.beboss.shopmgmt.data.model.LocalAuditLog
import com.beboss.shopmgmt.data.model.PaymentVerificationRequest
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.ProfitLossSummary
import com.beboss.shopmgmt.data.model.PurchaseRecord
import com.beboss.shopmgmt.data.model.PurchaseSummary
import com.beboss.shopmgmt.data.model.ReorderSuggestion
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleWithItems
import com.beboss.shopmgmt.data.model.ShopDevice
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.StaffPerformanceMetric
import com.beboss.shopmgmt.data.model.StockTransfer
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.data.model.TopProductReport
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import com.beboss.shopmgmt.data.repository.BeBossRepository
import com.beboss.shopmgmt.domain.AnalyticsEngine
import com.beboss.shopmgmt.ui.components.BlurLoadingUiState
import com.beboss.shopmgmt.ui.viewmodel.coordinators.AdminConsoleCoordinator
import com.beboss.shopmgmt.ui.viewmodel.coordinators.AuthSessionCoordinator
import com.beboss.shopmgmt.ui.viewmodel.coordinators.DatabaseMaintenanceCoordinator
import com.beboss.shopmgmt.ui.viewmodel.coordinators.PosCartCoordinator
import com.beboss.shopmgmt.ui.viewmodel.coordinators.SyncCoordinator
import com.beboss.shopmgmt.util.AdminPaymentConfig
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.BeBossLogger
import com.beboss.shopmgmt.util.BeBossNotificationManager
import com.beboss.shopmgmt.util.CapturedLocation
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.ClockTamperStatus
import com.beboss.shopmgmt.util.CloudHealthDiagnosticsDto
import com.beboss.shopmgmt.util.CloudSyncReport
import com.beboss.shopmgmt.util.ConnectivityStatus
import com.beboss.shopmgmt.util.DeviceIntegrityStatus
import com.beboss.shopmgmt.util.DeviceSecurityManager
import com.beboss.shopmgmt.util.EndpointPingResult
import com.beboss.shopmgmt.util.LocationHelper
import com.beboss.shopmgmt.util.MessageAuditManager
import com.beboss.shopmgmt.util.MessageDispatchRecord
import com.beboss.shopmgmt.util.NetworkConnectivityObserver
import com.beboss.shopmgmt.util.OfflineSubscriptionManager
import com.beboss.shopmgmt.util.PaymentProcessingResult
import com.beboss.shopmgmt.util.ShopImportSummary
import com.beboss.shopmgmt.util.SubscriptionPriceBreakdown
import com.beboss.shopmgmt.util.SupabaseAdminClient
import com.beboss.shopmgmt.util.SupabaseAdminSession
import com.beboss.shopmgmt.util.SupabaseAuditLogDto
import com.beboss.shopmgmt.util.SupabaseBranchSnapshotDto
import com.beboss.shopmgmt.util.SupabaseDeviceTelemetryDto
import com.beboss.shopmgmt.util.SupabasePaymentRequestDto
import com.beboss.shopmgmt.util.SupabaseShopAccountDto
import com.beboss.shopmgmt.util.SupabaseShopDeviceDto
import com.beboss.shopmgmt.util.SupabaseShopUserDto
import com.beboss.shopmgmt.util.SupabaseUnlockCodeDto
import com.beboss.shopmgmt.util.SyncAuditLog
import com.beboss.shopmgmt.util.safeMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

enum class AppScreen(val stringKey: String, val title: String) {
    DASHBOARD("dashboard", "Dashboard"),
    SALES_POS("sales_pos", "POS Sale"),
    INVENTORY("inventory", "Inventory"),
    ANALYTICS("analytics", "Reports & P/L"),
    CUSTOMERS("customers", "Customers & Debt"),
    SALES_HISTORY("sales_history", "Sales History"),
    SETTINGS("settings", "Settings")
}

data class HeldCart(
    val id: String = UUID.randomUUID().toString(),
    val label: String,
    val heldAt: Long = System.currentTimeMillis(),
    val items: List<CartItem>,
    val selectedCustomerId: String? = null,
    val selectedCustomerName: String = "Walk-in Customer",
    val discountAmount: Double = 0.0,
    val paymentMethod: String = "CASH",
    val notes: String = ""
) {
    val netTotal: Double
        get() = (items.sumOf { it.effectiveUnitPrice * it.quantity } - discountAmount).coerceAtLeast(0.0)

    val totalUnits: Double
        get() = items.sumOf { it.quantity }
}

data class CartState(
    val items: List<CartItem> = emptyList(),
    val selectedCustomerId: String? = null,
    val selectedCustomerName: String = "Walk-in Customer",
    val discountAmount: Double = 0.0,
    val paymentMethod: String = "CASH", // CASH, MOMO, AIRTEL, CARD, SPLIT, CREDIT_DEBT
    val amountPaidInput: String = "",
    val splitCashInput: String = "",
    val splitMomoInput: String = "",
    val notes: String = ""
) {
    val rawTotal: Double
        get() = items.sumOf { it.effectiveUnitPrice * it.quantity }

    val netTotal: Double
        get() = (rawTotal - discountAmount).coerceAtLeast(0.0)

    val totalCost: Double
        get() = items.sumOf { it.product.costPrice * it.quantity }

    val estimatedProfit: Double
        get() = netTotal - totalCost

    val splitCashAmount: Double
        get() = (splitCashInput.toDoubleOrNull() ?: 0.0).coerceAtLeast(0.0)

    val splitMomoAmount: Double
        get() = (splitMomoInput.toDoubleOrNull() ?: 0.0).coerceAtLeast(0.0)

    val splitTotalPaid: Double
        get() = com.beboss.shopmgmt.util.MoneyUtils.centsToDouble(
            com.beboss.shopmgmt.util.MoneyUtils.toCents(splitCashAmount) +
                com.beboss.shopmgmt.util.MoneyUtils.toCents(splitMomoAmount)
        )

    val splitRemainingAmount: Double
        get() = com.beboss.shopmgmt.util.MoneyUtils.centsToDouble(
            (com.beboss.shopmgmt.util.MoneyUtils.toCents(netTotal) -
                com.beboss.shopmgmt.util.MoneyUtils.toCents(splitTotalPaid)).coerceAtLeast(0L)
        )

    val effectiveAmountPaid: Double
        get() {
            if (paymentMethod == "SPLIT") {
                return if (splitTotalPaid > 0.0) splitTotalPaid else netTotal
            }
            val parsed = amountPaidInput.toDoubleOrNull()
            return when {
                parsed != null -> parsed
                paymentMethod == "CREDIT_DEBT" -> 0.0
                else -> netTotal
            }
        }

    val totalUnitsCount: Double
        get() = items.sumOf { it.quantity }
}

@OptIn(ExperimentalCoroutinesApi::class)
class BeBossViewModel(application: Application) : AndroidViewModel(application) {

    private val prefs = application.getSharedPreferences("beboss_prefs", Context.MODE_PRIVATE)
    private val db = AppDatabase.getDatabase(application)
    val repository = BeBossRepository(db)
    private val connectivityObserver = NetworkConnectivityObserver(application)
    private val deviceId: String = SupabaseAdminClient.getOrCreateDeviceId(application)

    private val _deviceIntegrityStatus = MutableStateFlow(DeviceIntegrityStatus(isCompromisedRisk = false))
    val deviceIntegrityStatus: StateFlow<DeviceIntegrityStatus> = _deviceIntegrityStatus.asStateFlow()

    val clockTamperStatus: StateFlow<ClockTamperStatus> = ClockGuard.tamperStatus
    val lastCapturedLocation: StateFlow<CapturedLocation> = LocationHelper.lastLocation
    val messageDispatchRecords: StateFlow<List<MessageDispatchRecord>> = MessageAuditManager.records

    private val _blurLoadingState = MutableStateFlow(BlurLoadingUiState())
    val blurLoadingState: StateFlow<BlurLoadingUiState> = _blurLoadingState.asStateFlow()
    private val blurToken = AtomicLong(0L)

    private var idleLockJob: Job? = null
    private val _idleLockMinutes = MutableStateFlow(prefs.getInt("idle_lock_minutes", 5).coerceIn(1, 60))
    val idleLockMinutes: StateFlow<Int> = _idleLockMinutes.asStateFlow()

    private val _snackbarMessage = MutableSharedFlow<String>()
    val snackbarMessage: SharedFlow<String> = _snackbarMessage.asSharedFlow()

    // Language & Theme State (EN / RW / FR / SW — 100% local offline translations)
    private val _currentLanguage = MutableStateFlow(
        AppLanguage.fromCode(prefs.getString("lang", "en"))
    )
    val currentLanguage: StateFlow<AppLanguage> = _currentLanguage.asStateFlow()

    private val _isDarkTheme = MutableStateFlow(prefs.getBoolean("dark_theme", false))
    val isDarkTheme: StateFlow<Boolean> = _isDarkTheme.asStateFlow()

    // Branch & Navigation State
    private val _selectedBranchId = MutableStateFlow("ALL")
    val selectedBranchId: StateFlow<String> = _selectedBranchId.asStateFlow()

    private val _currentScreen = MutableStateFlow(AppScreen.DASHBOARD)
    val currentScreen: StateFlow<AppScreen> = _currentScreen.asStateFlow()

    // Core Reactive Room Flows
    val shopProfile: StateFlow<ShopProfile> = repository.shopProfile.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = ShopProfile()
    )

    val allUsers: StateFlow<List<User>> = repository.allActiveUsers.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    val branches: StateFlow<List<Branch>> = repository.allBranches.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    val shopDevices: StateFlow<List<ShopDevice>> = repository.allShopDevices.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    val allStockTransfers: StateFlow<List<StockTransfer>> = repository.allStockTransfers.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    // Products / Stock
    private val _productSearchQuery = MutableStateFlow("")
    val productSearchQuery: StateFlow<String> = _productSearchQuery.asStateFlow()

    private val _selectedProductCategory = MutableStateFlow("All")
    val selectedProductCategory: StateFlow<String> = _selectedProductCategory.asStateFlow()

    private val _showOnlyLowStock = MutableStateFlow(false)
    val showOnlyLowStock: StateFlow<Boolean> = _showOnlyLowStock.asStateFlow()

    val allProducts: StateFlow<List<Product>> = _productSearchQuery
        .flatMapLatest { query -> repository.searchProducts(query) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val lowStockProducts: StateFlow<List<Product>> = repository.lowStockProducts.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    val categories: StateFlow<List<String>> = combine(repository.categories, shopProfile) { stored, profile ->
        com.beboss.shopmgmt.util.BusinessCatalog.categoriesWithExisting(profile.businessType, stored)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Customers
    private val _customerSearchQuery = MutableStateFlow("")
    val customerSearchQuery: StateFlow<String> = _customerSearchQuery.asStateFlow()

    val customers: StateFlow<List<Customer>> = _customerSearchQuery
        .flatMapLatest { query -> repository.searchCustomers(query) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val customersWithDebt: StateFlow<List<Customer>> = repository.customersWithDebt.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    val totalOutstandingDebt: StateFlow<Double> = repository.totalOutstandingDebt.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0
    )

    val allCustomerPayments: StateFlow<List<CustomerPayment>> = repository.allCustomerPayments.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    // Sales & Purchases
    val allSales: StateFlow<List<Sale>> = repository.allSales.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    val allPurchases: StateFlow<List<PurchaseRecord>> = repository.allPurchases.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    // Analytics Period
    private val _selectedAnalyticsPeriod = MutableStateFlow(AnalyticsPeriod.THIS_WEEK)
    val selectedAnalyticsPeriod: StateFlow<AnalyticsPeriod> = _selectedAnalyticsPeriod.asStateFlow()

    // Sync Queue, Audit & Licensing Flows
    val pendingSyncCount: StateFlow<Int> = repository.pendingSyncCount.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), 0
    )

    val deadLetterSyncCount: StateFlow<Int> = repository.deadLetterSyncCount.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), 0
    )

    val paymentVerificationRequests: StateFlow<List<PaymentVerificationRequest>> =
        repository.allPaymentRequests.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val localAuditLogs: StateFlow<List<LocalAuditLog>> = repository.localAuditLogs.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList()
    )

    val syncAuditLogs: StateFlow<List<SyncAuditLog>> = repository.syncAuditLogs

    // ------------------------------------------------------------------------
    // 2-SECOND BOUNDED BLUR LOADING ENGINE
    // ------------------------------------------------------------------------
    fun runWithBlurLoading(
        title: String = "Processing...",
        subtitle: String = "Syncing & securing shop records",
        block: suspend () -> Unit
    ) {
        val token = blurToken.incrementAndGet()
        _blurLoadingState.value = BlurLoadingUiState(
            isLoading = true,
            title = title,
            subtitle = subtitle
        )
        viewModelScope.launch {
            delay(2000L)
            if (blurToken.get() == token && _blurLoadingState.value.isLoading) {
                _blurLoadingState.value = BlurLoadingUiState()
            }
        }
        viewModelScope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                BeBossLogger.e("BeBossViewModel", "Action failed inside runWithBlurLoading", e)
                _snackbarMessage.emit(e.safeMessage("Action failed"))
            } finally {
                if (blurToken.get() == token) {
                    _blurLoadingState.value = BlurLoadingUiState()
                }
            }
        }
    }

    // ------------------------------------------------------------------------
    // FEATURE COORDINATORS
    // ------------------------------------------------------------------------
    private val authCoordinator = AuthSessionCoordinator(
        application = application,
        prefs = prefs,
        db = db,
        repository = repository,
        scope = viewModelScope,
        language = currentLanguage,
        emitSnackbar = { msg -> _snackbarMessage.emit(msg) },
        onRegistrationCloudSync = {
            syncCoordinator.syncToCloudNow()
        }
    )

    val effectiveBranchId: StateFlow<String> = combine(_selectedBranchId, authCoordinator.currentUser) { selected, user ->
        if (user != null && user.role != UserRole.OWNER && user.assignedBranchId.isNotBlank()) {
            user.assignedBranchId
        } else {
            selected
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "ALL")

    val isBranchLockedForCurrentUser: StateFlow<Boolean> = authCoordinator.currentUser.map { user ->
        user != null && user.role != UserRole.OWNER && user.assignedBranchId.isNotBlank()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    val scopedProducts: StateFlow<List<Product>> = combine(allProducts, effectiveBranchId) { prods, branchId ->
        AnalyticsEngine.filterProductsByBranch(prods, branchId)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val scopedLowStockProducts: StateFlow<List<Product>> = combine(lowStockProducts, effectiveBranchId) { prods, branchId ->
        AnalyticsEngine.filterProductsByBranch(prods, branchId)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val scopedSales: StateFlow<List<Sale>> = combine(allSales, effectiveBranchId) { sales, branchId ->
        AnalyticsEngine.filterSalesByBranch(sales, branchId)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val scopedPurchases: StateFlow<List<PurchaseRecord>> = combine(allPurchases, effectiveBranchId) { purchases, branchId ->
        if (branchId.isBlank() || branchId == "ALL") purchases else purchases.filter { it.branchId == branchId }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val inventoryValuation: StateFlow<InventoryValuation> = scopedProducts.map { prods ->
        AnalyticsEngine.computeInventoryValuation(prods)
    }.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000),
        InventoryValuation(0, 0.0, 0.0, 0.0, 0.0, 0, 0)
    )

    val purchaseSummary: StateFlow<PurchaseSummary> = scopedPurchases.map { purchases ->
        val totalCost = purchases.sumOf { it.totalPurchaseCost }
        val totalUnits = purchases.sumOf { it.quantityPurchased }
        val suppliers = purchases.map { it.supplierName.lowercase() }.distinct().size
        val avg = if (purchases.isNotEmpty()) totalCost / purchases.size else 0.0
        PurchaseSummary(
            totalPurchasesCount = purchases.size,
            totalUnitsBought = totalUnits,
            totalExpenditure = totalCost,
            uniqueSuppliersCount = suppliers,
            averagePurchaseCost = avg
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), PurchaseSummary())

    val profitLossSummary: StateFlow<ProfitLossSummary> = combine(_selectedAnalyticsPeriod, effectiveBranchId) { period, branchId ->
        period to branchId
    }.flatMapLatest { (period, branchId) ->
        repository.getProfitLossForPeriod(period, branchId)
    }.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000),
        ProfitLossSummary(0.0, 0.0, 0.0, 0, 0.0, 0.0, 0.0, true, "This Week")
    )

    val dailyChartPoints: StateFlow<List<DailyAnalyticsPoint>> = combine(_selectedAnalyticsPeriod, effectiveBranchId) { period, branchId ->
        period to branchId
    }.flatMapLatest { (period, branchId) ->
        repository.getDailyAnalyticsPoints(period, branchId)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val topProducts: StateFlow<List<TopProductReport>> = _selectedAnalyticsPeriod
        .flatMapLatest { period -> repository.getTopProducts(period) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val categoryBreakdown: StateFlow<List<CategorySalesShare>> = _selectedAnalyticsPeriod
        .flatMapLatest { period -> repository.getCategorySalesBreakdown(period) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val todaySummary: StateFlow<ProfitLossSummary> = effectiveBranchId
        .flatMapLatest { branchId -> repository.getProfitLossForPeriod(AnalyticsPeriod.TODAY, branchId) }
        .stateIn(
            viewModelScope, SharingStarted.WhileSubscribed(5000),
            ProfitLossSummary(0.0, 0.0, 0.0, 0, 0.0, 0.0, 0.0, true, "Today")
        )

    val branchPerformanceMetrics: StateFlow<List<BranchPerformanceMetric>> =
        combine(branches, allSales, allProducts, _selectedAnalyticsPeriod) { branchList, sales, prods, period ->
            AnalyticsEngine.computeBranchPerformance(branchList, sales, prods, period)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val staffPerformanceMetrics: StateFlow<List<StaffPerformanceMetric>> =
        combine(scopedSales, _selectedAnalyticsPeriod) { sales, period ->
            AnalyticsEngine.computeStaffPerformance(sales, period)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val customerAgingSummary: StateFlow<CustomerAgingSummary> =
        combine(customers, allSales) { custList, sales ->
            AnalyticsEngine.computeCustomerAging(custList, sales)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), CustomerAgingSummary())

    val reorderSuggestions: StateFlow<List<ReorderSuggestion>> =
        combine(scopedProducts, repository.allSaleItems, effectiveBranchId, allSales) { prods, saleItems, branchId, sales ->
            AnalyticsEngine.computeReorderSuggestions(
                products = prods,
                saleItems = saleItems,
                branchIdFilter = branchId,
                sales = sales
            )
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private lateinit var adminCoordinator: AdminConsoleCoordinator
    private lateinit var syncCoordinator: SyncCoordinator
    private lateinit var posCoordinator: PosCartCoordinator
    private lateinit var dbCoordinator: DatabaseMaintenanceCoordinator

    init {
        ClockGuard.init(application)
        LocationHelper.loadCachedLocation(application)
        MessageAuditManager.load(application)

        syncCoordinator = SyncCoordinator(
            application = application,
            db = db,
            repository = repository,
            connectivityObserver = connectivityObserver,
            deviceId = deviceId,
            scope = viewModelScope,
            currentUser = authCoordinator.currentUser,
            selectedBranchId = effectiveBranchId,
            shopProfile = shopProfile,
            allUsers = allUsers,
            branches = branches,
            allProducts = allProducts,
            customers = customers,
            allSales = allSales,
            allCustomerPayments = allCustomerPayments,
            allStockTransfers = allStockTransfers,
            emitSnackbar = { msg -> _snackbarMessage.emit(msg) },
            syncAdminCloud = { silent -> adminCoordinator.syncAdminDataToSupabaseSuspended(silent) },
            runWithBlurLoading = ::runWithBlurLoading,
            isRegistrationNeeded = authCoordinator.isRegistrationNeeded
        )

        adminCoordinator = AdminConsoleCoordinator(
            application = application,
            repository = repository,
            scope = viewModelScope,
            currentUser = authCoordinator.currentUser,
            allUsers = allUsers,
            branches = branches,
            shopProfile = shopProfile,
            emitSnackbar = { msg -> _snackbarMessage.emit(msg) },
            triggerCloudSync = { syncCoordinator.syncToCloudNow() },
            runWithBlurLoading = ::runWithBlurLoading
        )

        posCoordinator = PosCartCoordinator(
            application = application,
            repository = repository,
            scope = viewModelScope,
            language = currentLanguage,
            currentUser = authCoordinator.currentUser,
            selectedBranchId = effectiveBranchId,
            branches = branches,
            shopProfile = shopProfile,
            allSales = scopedSales,
            todaySummary = todaySummary,
            lowStockProducts = scopedLowStockProducts,
            emitSnackbar = { msg -> _snackbarMessage.emit(msg) },
            onMutationSuccess = { syncCoordinator.scheduleAutoBranchSync() },
            runWithBlurLoading = ::runWithBlurLoading
        )

        dbCoordinator = DatabaseMaintenanceCoordinator(
            application = application,
            repository = repository,
            scope = viewModelScope,
            language = currentLanguage,
            onClearUiSessionState = {
                posCoordinator.clearCart()
                posCoordinator.closeReceipt()
            },
            emitSnackbar = { msg -> _snackbarMessage.emit(msg) }
        )

        viewModelScope.launch(Dispatchers.IO) {
            try {
                authCoordinator.checkAuthenticationAndInit()
                syncCoordinator.setupAutoCloudSyncOnInternet()
                dbCoordinator.verifyStartupIntegritySilently()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                BeBossLogger.e("BeBossStartup", "One startup subsystem failed", e)
            }

            try {
                reInspectSecurityPostureInternal(syncTrustedTime = false)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                BeBossLogger.w("BeBossStartup", "Device integrity check skipped: ${e.safeMessage()}")
            }
        }
        onUserInteraction()
    }

    private suspend fun reInspectSecurityPostureInternal(syncTrustedTime: Boolean): Pair<DeviceIntegrityStatus, ClockTamperStatus> {
        val app = getApplication<Application>()
        if (syncTrustedTime && SupabaseAdminClient.isConfigured()) {
            withContext(Dispatchers.IO) {
                try {
                    val cfg = SupabaseAdminClient.fetchPublicAppConfig()
                    if (cfg != null && cfg.updatedAt > 1_700_000_000_000L) {
                        ClockGuard.observeTrustedEpoch(cfg.updatedAt, app)
                    }
                    val serverMs = ClockGuard.tamperStatus.value.lastTrustedServerMs
                    if (serverMs > 0L) {
                        ClockGuard.clearRollbackAfterTrustedSync(app, serverMs)
                    }
                } catch (_: Throwable) {}
            }
        }
        val clockStatus = ClockGuard.reInspectNow(app)
        val integrity = DeviceSecurityManager.inspectDeviceIntegrity(app)
        _deviceIntegrityStatus.value = integrity
        if (integrity.isCompromisedRisk || clockStatus.rollbackDetected || clockStatus.activeTamperLock) {
            val detailsText = if (clockStatus.reason.isNotBlank()) {
                "${clockStatus.reason} (${integrity.signals.joinToString("; ")})"
            } else {
                integrity.signals.joinToString("; ").ifBlank { integrity.postureLabel }
            }
            try {
                repository.recordLocalAudit(
                    actorName = "System",
                    actorRole = "SECURITY",
                    action = if (clockStatus.rollbackDetected || clockStatus.activeTamperLock) {
                        "CLOCK_ROLLBACK_TAMPER_DETECTED"
                    } else {
                        "DEVICE_INTEGRITY_WARNING"
                    },
                    targetId = deviceId,
                    details = detailsText
                )
            } catch (_: Throwable) {}
            BeBossNotificationManager.sendSecurityTamperNotification(
                context = app,
                title = if (clockStatus.rollbackDetected || clockStatus.activeTamperLock) {
                    "Device Clock Rollback Detected"
                } else {
                    "Security Shield Warning"
                },
                details = detailsText
            )
        }
        return integrity to clockStatus
    }

    fun onAppResumedSecurityCheck() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                reInspectSecurityPostureInternal(syncTrustedTime = false)
            } catch (_: Throwable) {}
        }
    }

    fun reInspectSecurityPosture(syncTrustedTime: Boolean = false) {
        runWithBlurLoading(
            title = "Inspecting Anti-Tamper Shield...",
            subtitle = "Verifying monotonic clock, keystore & device posture"
        ) {
            val (integrity, clock) = reInspectSecurityPostureInternal(syncTrustedTime = syncTrustedTime)
            val msg = if (clock.rollbackDetected || clock.activeTamperLock) {
                "Anti-Tamper Shield ALERT: ${clock.reason.ifBlank { "Clock rollback detected" }} (Risk ${integrity.riskScore}/100)"
            } else if (integrity.isCompromisedRisk) {
                "Security Shield Warning: ${integrity.postureLabel} (Risk ${integrity.riskScore}/100)"
            } else {
                "Anti-Tamper Shield Verified: No rollback or tamper signals (Risk ${integrity.riskScore}/100)"
            }
            _snackbarMessage.emit(msg)
        }
    }

    fun captureCurrentLocationNow() {
        runWithBlurLoading(
            title = "Capturing Branch GPS...",
            subtitle = "Reading foreground location & geocoding address"
        ) {
            val app = getApplication<Application>()
            val loc = LocationHelper.captureCurrentLocation(app)
            if (loc != null && loc.isAvailable) {
                _snackbarMessage.emit("Branch GPS captured: ${loc.compactLabel()}")
            } else if (!LocationHelper.hasForegroundLocationPermission(app)) {
                _snackbarMessage.emit("Grant foreground Location permission in Settings to capture branch GPS.")
            } else {
                _snackbarMessage.emit("Unable to obtain GPS fix yet — ensure device Location is enabled.")
            }
        }
    }

    fun onUserInteraction() {
        idleLockJob?.cancel()
        if (!authCoordinator.isLocked.value && !authCoordinator.isRegistrationNeeded.value) {
            val timeoutMs = _idleLockMinutes.value.coerceIn(1, 60) * 60_000L
            idleLockJob = viewModelScope.launch {
                delay(timeoutMs)
                if (!authCoordinator.isLocked.value && !authCoordinator.isRegistrationNeeded.value) {
                    lockApp()
                }
            }
        }
    }

    fun setIdleLockMinutes(minutes: Int) {
        val clamped = minutes.coerceIn(1, 60)
        _idleLockMinutes.value = clamped
        prefs.edit().putInt("idle_lock_minutes", clamped).apply()
        onUserInteraction()
    }

    // Delegated Auth Flows
    val currentUser: StateFlow<User?> get() = authCoordinator.currentUser
    val isLocked: StateFlow<Boolean> get() = authCoordinator.isLocked
    val isRegistrationNeeded: StateFlow<Boolean> get() = authCoordinator.isRegistrationNeeded
    val authError: StateFlow<String?> get() = authCoordinator.authError

    // Delegated POS Flows
    val cartState: StateFlow<CartState> get() = posCoordinator.cartState
    val heldCarts: StateFlow<List<HeldCart>> get() = posCoordinator.heldCarts
    val activeReceiptSale: StateFlow<SaleWithItems?> get() = posCoordinator.activeReceiptSale

    // Delegated Sync & LAN P2P Flows
    val connectivityStatus: StateFlow<ConnectivityStatus> get() = syncCoordinator.connectivityStatus
    val cloudSyncReport: StateFlow<CloudSyncReport?> get() = syncCoordinator.cloudSyncReport
    val isSyncing: StateFlow<Boolean> get() = syncCoordinator.isSyncing
    val isP2pSyncing: StateFlow<Boolean> get() = syncCoordinator.isP2pSyncing
    val localNetworkSyncServer get() = syncCoordinator.localNetworkSyncServer
    val localServerStatus get() = syncCoordinator.localServerStatus
    val localServerIp get() = syncCoordinator.localServerIp
    val localConnectedClients get() = syncCoordinator.localConnectedClients
    val localLastReceivedPacket get() = syncCoordinator.localLastReceivedPacket
    val discoveredHubs get() = syncCoordinator.discoveredHubs
    val isDiscoveringHubs get() = syncCoordinator.isDiscoveringHubs
    val peerSyncEvents get() = syncCoordinator.peerSyncEvents
    val pendingSyncItems: StateFlow<List<SyncQueueItem>> get() = syncCoordinator.pendingSyncItems
    val deadLetterQueueItems: StateFlow<List<SyncQueueItem>> get() = syncCoordinator.deadLetterQueueItems
    val deadLetterRecords: StateFlow<List<DeadLetterItem>> get() = syncCoordinator.deadLetterRecords
    val shopDeviceTelemetry: StateFlow<List<SupabaseDeviceTelemetryDto>> get() = syncCoordinator.shopDeviceTelemetry

    // Delegated Admin Console Flows
    val adminSession: StateFlow<SupabaseAdminSession?> get() = adminCoordinator.adminSession
    val adminAuthError: StateFlow<String?> get() = adminCoordinator.adminAuthError
    val isAdminAuthenticating: StateFlow<Boolean> get() = adminCoordinator.isAdminAuthenticating
    val adminPaymentRequests: StateFlow<List<SupabasePaymentRequestDto>> get() = adminCoordinator.adminPaymentRequests
    val adminShopAccounts: StateFlow<List<SupabaseShopAccountDto>> get() = adminCoordinator.adminShopAccounts
    val adminShopUsers: StateFlow<List<SupabaseShopUserDto>> get() = adminCoordinator.adminShopUsers
    val adminShopDevices: StateFlow<List<SupabaseShopDeviceDto>> get() = adminCoordinator.adminShopDevices
    val adminBranchSnapshots: StateFlow<List<SupabaseBranchSnapshotDto>> get() = adminCoordinator.adminBranchSnapshots
    val adminUnlockCodes: StateFlow<List<SupabaseUnlockCodeDto>> get() = adminCoordinator.adminUnlockCodes
    val adminAuditLogs: StateFlow<List<SupabaseAuditLogDto>> get() = adminCoordinator.adminAuditLogs
    val adminDeviceTelemetry: StateFlow<List<SupabaseDeviceTelemetryDto>> get() = adminCoordinator.adminDeviceTelemetry
    val adminCloudHealth: StateFlow<CloudHealthDiagnosticsDto?> get() = adminCoordinator.adminCloudHealth
    val adminPaymentConfig: StateFlow<AdminPaymentConfig> get() = adminCoordinator.adminPaymentConfig
    val isAdminLoading: StateFlow<Boolean> get() = adminCoordinator.isAdminLoading
    val adminLastSyncedAt: StateFlow<Long> get() = adminCoordinator.adminLastSyncedAt

    // Delegated Database Engine Flows
    val databaseStats: StateFlow<DatabaseEngineStats?> get() = dbCoordinator.databaseStats
    val databaseMaintenanceResult: StateFlow<DatabaseMaintenanceResult?> get() = dbCoordinator.databaseMaintenanceResult
    val isOptimizingDb: StateFlow<Boolean> get() = dbCoordinator.isOptimizingDb
    val startupIntegrityOk: StateFlow<Boolean?> get() = dbCoordinator.startupIntegrityOk

    // ------------------------------------------------------------------------
    // LANGUAGE, THEME & NAVIGATION
    // ------------------------------------------------------------------------
    fun toggleLanguage() {
        val next = _currentLanguage.value.next()
        _currentLanguage.value = next
        prefs.edit().putString("lang", next.code).apply()
    }

    fun setLanguage(lang: AppLanguage) {
        _currentLanguage.value = lang
        prefs.edit().putString("lang", lang.code).apply()
    }

    fun toggleDarkMode() {
        val next = !_isDarkTheme.value
        _isDarkTheme.value = next
        prefs.edit().putBoolean("dark_theme", next).apply()
    }

    fun setDarkMode(enabled: Boolean) {
        _isDarkTheme.value = enabled
        prefs.edit().putBoolean("dark_theme", enabled).apply()
    }

    fun navigateTo(screen: AppScreen) {
        val user = currentUser.value
        if (screen == AppScreen.ANALYTICS && user != null && !user.canViewAnalytics) {
            viewModelScope.launch {
                _snackbarMessage.emit("Permission denied: Analytics access is restricted for ${user.role.name}.")
            }
            return
        }
        _currentScreen.value = screen
    }

    fun selectBranch(branchId: String) {
        val user = currentUser.value
        if (user != null && user.role != UserRole.OWNER && user.assignedBranchId.isNotBlank() && branchId != user.assignedBranchId) {
            viewModelScope.launch {
                _snackbarMessage.emit("Branch scope locked to ${user.assignedBranchName.ifBlank { "your assigned branch" }}.")
            }
            return
        }
        _selectedBranchId.value = branchId
    }

    // ------------------------------------------------------------------------
    // AUTHENTICATION DELEGATION
    // ------------------------------------------------------------------------
    fun registerNewShopAndOwner(
        shopName: String,
        businessType: String,
        currencyCode: String,
        currencySymbol: String,
        address: String,
        phone: String,
        ownerFullName: String,
        username: String,
        pin: String,
        password: String
    ) = authCoordinator.registerNewShopAndOwner(
        shopName, businessType, currencyCode, currencySymbol, address, phone,
        ownerFullName, username, pin, password
    )

    fun joinExistingShopFromCloud(
        ownerUsername: String,
        ownerPhone: String,
        deviceJoinCode: String,
        thisDeviceName: String,
        pin: String,
        password: String
    ) = authCoordinator.joinExistingShopFromCloud(
        ownerUsername = ownerUsername,
        ownerPhone = ownerPhone,
        deviceJoinCode = deviceJoinCode,
        thisDeviceName = thisDeviceName,
        pin = pin,
        password = password
    )

    fun addSecondaryShopDevice(
        deviceName: String,
        assignedUser: User,
        branch: Branch?,
        onCreated: (ShopDevice) -> Unit = {}
    ) {
        runWithBlurLoading("Registering Terminal...", "Pairing shop device & updating cloud quota") {
            try {
                val created = repository.addSecondaryShopDevice(
                    deviceName = deviceName,
                    assignedUser = assignedUser,
                    branch = branch,
                    creatorDeviceId = deviceId,
                    actor = currentUser.value
                )
                scheduleAutoBranchSync()
                _snackbarMessage.emit(
                    "Added device '${created.deviceName}' (Join Code: ${created.joinCode} • +2,000 FRw/mo)"
                )
                onCreated(created)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Device error: ${e.safeMessage()}")
            }
        }
    }

    fun toggleShopDeviceActive(deviceId: String, isActive: Boolean) {
        runWithBlurLoading("Updating Terminal...", "Applying device activation status") {
            try {
                repository.toggleShopDeviceActive(
                    deviceId,
                    isActive,
                    actor = currentUser.value,
                    actorDeviceId = this@BeBossViewModel.deviceId
                )
                scheduleAutoBranchSync()
                _snackbarMessage.emit(
                    if (isActive) "Shop device enabled (+2,000 FRw/mo when active)."
                    else "Shop device paused."
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Device toggle error: ${e.safeMessage()}")
            }
        }
    }

    fun deleteShopDevice(deviceId: String) {
        runWithBlurLoading("Removing Terminal...", "Revoking device pairing") {
            try {
                repository.deleteShopDevice(deviceId, actor = currentUser.value, actorDeviceId = this@BeBossViewModel.deviceId)
                scheduleAutoBranchSync()
                _snackbarMessage.emit("Secondary shop device removed.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Remove device error: ${e.safeMessage()}")
            }
        }
    }

    fun loginWithPin(pin: String): Boolean = authCoordinator.loginWithPin(pin)
    fun loginWithCredentials(username: String, pinOrPass: String): Boolean = authCoordinator.loginWithCredentials(username, pinOrPass)
    fun unlockAppWithPin(pin: String): Boolean = authCoordinator.unlockAppWithPin(pin)
    fun unlockWithBiometric(verifiedByHardware: Boolean) = authCoordinator.unlockWithBiometric(verifiedByHardware)
    fun reportBiometricError(message: String) = authCoordinator.reportBiometricError(message)
    fun reportBiometricCancelled() = authCoordinator.reportBiometricCancelled()
    fun selectLockedOperator(user: User) = authCoordinator.selectLockedOperator(user)
    fun lockApp() = authCoordinator.lockApp()
    fun logoutUser() = authCoordinator.logoutUser()
    fun switchUser(user: User) = authCoordinator.switchUser(user)
    fun showRegistrationScreen() = authCoordinator.showRegistrationScreen()
    fun cancelRegistration() = authCoordinator.cancelRegistration()
    fun clearAuthError() = authCoordinator.clearAuthError()

    // ------------------------------------------------------------------------
    // POS & CART DELEGATION
    // ------------------------------------------------------------------------
    fun addToCart(product: Product, quantity: Double = 1.0) = posCoordinator.addToCart(product, quantity)
    fun updateCartItemQuantity(productId: String, newQuantity: Double) = posCoordinator.updateCartItemQuantity(productId, newQuantity)
    fun removeCartItem(productId: String) = posCoordinator.removeCartItem(productId)
    fun clearCart() = posCoordinator.clearCart()
    fun setCartCustomer(customer: Customer?) = posCoordinator.setCartCustomer(customer)
    fun setCartPaymentMethod(method: String) = posCoordinator.setCartPaymentMethod(method)
    fun setCartDiscount(discount: Double) = posCoordinator.setCartDiscount(discount)
    fun setCartAmountPaidInput(input: String) = posCoordinator.setCartAmountPaidInput(input)
    fun setCartSplitCashInput(input: String) = posCoordinator.setCartSplitCashInput(input)
    fun setCartSplitMomoInput(input: String) = posCoordinator.setCartSplitMomoInput(input)
    fun setCartNotes(notes: String) = posCoordinator.setCartNotes(notes)
    fun holdCurrentCart(label: String = "") = posCoordinator.holdCurrentCart(label)
    fun resumeHeldCart(heldId: String) = posCoordinator.resumeHeldCart(heldId)
    fun deleteHeldCart(heldId: String) = posCoordinator.deleteHeldCart(heldId)
    fun checkoutSale() = posCoordinator.checkoutSale()
    fun performQuickCustomSale(description: String, amount: Double, paymentMethod: String, isDirectCheckout: Boolean = true) =
        posCoordinator.performQuickCustomSale(description, amount, paymentMethod, isDirectCheckout)
    fun openReceipt(saleId: String) = posCoordinator.openReceipt(saleId)
    fun openLastReceipt() = posCoordinator.openLastReceipt()
    fun closeReceipt() = posCoordinator.closeReceipt()
    fun shareDailyWhatsAppSummary(context: Context) = posCoordinator.shareDailyWhatsAppSummary(context)

    // ------------------------------------------------------------------------
    // SYNC & P2P DELEGATION
    // ------------------------------------------------------------------------
    fun scheduleAutoBranchSync(delayMs: Long = 1600L) = syncCoordinator.scheduleAutoBranchSync(delayMs)
    fun performSync() = syncCoordinator.syncToCloudNow()
    fun syncToCloudNow() = syncCoordinator.syncToCloudNow()
    fun syncToCloudWithEndpoint(endpoint: String? = null) = syncCoordinator.syncToCloudWithEndpoint(endpoint)
    fun testEndpointPing(endpoint: String, onResult: (EndpointPingResult) -> Unit) = syncCoordinator.testEndpointPing(endpoint, onResult)
    fun toggleLocalSyncServer(enable: Boolean) = syncCoordinator.toggleLocalSyncServer(enable)
    fun startLanDiscovery() = syncCoordinator.startLanDiscovery()
    fun stopLanDiscovery() = syncCoordinator.stopLanDiscovery()
    fun syncWithLocalMasterHub(hubIp: String) = syncCoordinator.syncWithLocalMasterHub(hubIp)
    fun createBranchShareToken(branchIdFilter: String? = null, onReady: (String) -> Unit) = syncCoordinator.createBranchShareToken(branchIdFilter, onReady)
    fun exportFullBranchPackage(context: Context, branchIdFilter: String? = null, onReady: (File) -> Unit) =
        syncCoordinator.exportFullBranchPackage(context, branchIdFilter, onReady)
    fun importBranchShareToken(tokenOrJson: String, onDone: (Boolean, String) -> Unit = { _, _ -> }) =
        syncCoordinator.importBranchShareToken(tokenOrJson, onDone)
    fun importShopPackage(summary: ShopImportSummary) = syncCoordinator.importShopPackage(summary)
    fun refreshShopDeviceTelemetry() = syncCoordinator.refreshShopTelemetry()
    fun requeueDeadLetter(id: String) = syncCoordinator.requeueDeadLetter(id)
    fun requeueAllDeadLetters() = syncCoordinator.requeueAllDeadLetters()
    fun discardDeadLetter(id: String) = syncCoordinator.discardDeadLetter(id)

    // ------------------------------------------------------------------------
    // ADMIN CONSOLE & SUBSCRIPTION DELEGATION
    // ------------------------------------------------------------------------
    fun signInSupabaseAdmin(email: String, password: String) = adminCoordinator.signInSupabaseAdmin(email, password)
    fun signUpSupabaseAdmin(email: String, password: String, fullName: String) = adminCoordinator.signUpSupabaseAdmin(email, password, fullName)
    fun signOutSupabaseAdmin() = adminCoordinator.signOutSupabaseAdmin()
    fun activateSubscriptionVoucher(code: String) = adminCoordinator.activateSubscriptionVoucher(code)
    fun submitUssdPaymentProof(
        provider: String,
        payerPhone: String,
        username: String,
        registeredPhone: String,
        durationMonths: Int,
        branchCount: Int,
        workerCount: Int,
        payerFullName: String = "",
        deviceCount: Int = 1,
        paymentNote: String = "",
        onSubmitted: (PaymentVerificationRequest, Boolean) -> Unit = { _, _ -> }
    ) = adminCoordinator.submitUssdPaymentProof(
        provider = provider,
        payerPhone = payerPhone,
        username = username,
        registeredPhone = registeredPhone,
        durationMonths = durationMonths,
        branchCount = branchCount,
        workerCount = workerCount,
        payerFullName = payerFullName,
        deviceCount = deviceCount,
        paymentNote = paymentNote,
        onSubmitted = onSubmitted
    )

    fun syncAdminDataToSupabase(silent: Boolean = false) = adminCoordinator.syncAdminDataToSupabase(silent)
    fun checkCloudUnlockApprovals() = adminCoordinator.checkCloudUnlockApprovals()
    fun refreshAdminDashboardData() = adminCoordinator.refreshAdminDashboardData()
    fun adminApproveAndGenerateCode(request: SupabasePaymentRequestDto, verificationNote: String, onGenerated: (Boolean, String) -> Unit) =
        adminCoordinator.adminApproveAndGenerateCode(request, verificationNote, onGenerated)
    fun adminDirectAutoUnlockPayment(request: SupabasePaymentRequestDto, onDone: (Boolean) -> Unit = {}) =
        adminCoordinator.adminDirectAutoUnlockPayment(request, onDone)
    fun adminApproveBatchPendingPayments(onDone: (Int, Int) -> Unit = { _, _ -> }) =
        adminCoordinator.adminApproveBatchPendingPayments(onDone)
    fun adminRejectPayment(request: SupabasePaymentRequestDto, reason: String, onDone: (Boolean) -> Unit = {}) =
        adminCoordinator.adminRejectPayment(request, reason, onDone)
    fun adminRevokeCode(codeDto: SupabaseUnlockCodeDto) = adminCoordinator.adminRevokeCode(codeDto)
    fun adminIssueManualCode(
        username: String,
        registeredPhone: String,
        tierCode: String,
        days: Int,
        amountRwf: Int,
        onGenerated: (Boolean, String) -> Unit
    ) = adminCoordinator.adminIssueManualCode(username, registeredPhone, tierCode, days, amountRwf, onGenerated)

    fun adminExtendShopSubscription(shop: SupabaseShopAccountDto, addDays: Int) = adminCoordinator.adminExtendShopSubscription(shop, addDays)
    fun adminResetShopTrial(shop: SupabaseShopAccountDto, trialDays: Int = ShopProfile.FREE_TRIAL_DAYS) =
        adminCoordinator.adminResetShopTrial(shop, trialDays)
    fun adminSetShopStatus(shop: SupabaseShopAccountDto, status: String) = adminCoordinator.adminSetShopStatus(shop, status)
    fun adminUpdateShopLimits(
        shop: SupabaseShopAccountDto,
        branchCount: Int,
        workerCount: Int,
        deviceLimit: Int = shop.deviceLimit.coerceAtLeast(1)
    ) = adminCoordinator.adminUpdateShopLimits(shop, branchCount, workerCount, deviceLimit)
    fun adminSavePaymentConfig(config: AdminPaymentConfig, onDone: (Boolean) -> Unit = {}) =
        adminCoordinator.adminSavePaymentConfig(config, onDone)
    fun adminToggleShopDeviceActive(device: SupabaseShopDeviceDto, isActive: Boolean) =
        adminCoordinator.adminToggleShopDeviceActive(device, isActive)
    fun adminDeleteShopDevice(device: SupabaseShopDeviceDto) =
        adminCoordinator.adminDeleteShopDevice(device)
    fun adminDeleteShopAccount(shop: SupabaseShopAccountDto) = adminCoordinator.adminDeleteShopAccount(shop)
    fun adminUpdateShopUserRole(user: SupabaseShopUserDto, newRole: String) = adminCoordinator.adminUpdateShopUserRole(user, newRole)
    fun adminToggleShopUserActive(user: SupabaseShopUserDto, newActive: Boolean) = adminCoordinator.adminToggleShopUserActive(user, newActive)
    fun adminDeleteShopUser(user: SupabaseShopUserDto) = adminCoordinator.adminDeleteShopUser(user)
    fun adminDeleteBranchSnapshot(snapshot: SupabaseBranchSnapshotDto) = adminCoordinator.adminDeleteBranchSnapshot(snapshot)
    fun shareAdminWebPortal(context: Context) = adminCoordinator.shareAdminWebPortal(context)
    fun runAdminCloudDiagnostics() = adminCoordinator.runAdminCloudHealthDiagnostics()
    fun loadMoreAdminShops() = adminCoordinator.loadMoreAdminShops()
    fun loadMoreAdminPaymentRequests() = adminCoordinator.loadMoreAdminPaymentRequests()
    fun loadMoreAdminTelemetry() = adminCoordinator.loadMoreAdminTelemetry()
    fun exportAdminLedgerCsv(context: Context) = adminCoordinator.exportAdminLedgerCsv(context)
    fun exportAdminExecutivePdf(context: Context) = adminCoordinator.exportAdminExecutivePdf(context)
    fun processDirectSubscriptionPayment(
        provider: String,
        phone: String,
        durationMonths: Int,
        userReference: String? = null,
        onResult: (PaymentProcessingResult, SubscriptionPriceBreakdown) -> Unit
    ) = adminCoordinator.processDirectSubscriptionPayment(provider, phone, durationMonths, userReference, onResult)

    // ------------------------------------------------------------------------
    // BRANCH, STAFF, PRODUCT, PURCHASE, CUSTOMER MUTATIONS
    // ------------------------------------------------------------------------
    fun saveBranch(branch: Branch) {
        runWithBlurLoading("Saving Branch...", "Updating multi-branch structure & pricing") {
            try {
                repository.saveBranch(branch, actor = currentUser.value)
                val allBranches = db.branchDao().getAllActiveBranchesList()
                val allStaff = db.userDao().getAllActiveUsersList()
                val activeDevices = repository.getActiveDevicesCount()
                val newPricing = OfflineSubscriptionManager.calculateSubscriptionPrice(
                    branchCount = allBranches.size.coerceAtLeast(1),
                    workerCount = allStaff.size.coerceAtLeast(1),
                    deviceCount = activeDevices
                )
                repository.updateShopProfile(
                    shopProfile.value.copy(
                        monthlyFeeRwf = newPricing.monthlySubtotal,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                scheduleAutoBranchSync()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Ishami '${branch.name}' ryabitswe neza (${newPricing.monthlySubtotal} FRw/mo)."
                else "Branch '${branch.name}' saved (${newPricing.monthlySubtotal} FRw/mo)."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Branch error: ${e.safeMessage()}")
            }
        }
    }

    fun deleteBranch(branchId: String) {
        runWithBlurLoading("Removing Branch...", "Updating branch directory") {
            try {
                repository.deleteBranch(branchId, actor = currentUser.value)
                val allBranches = db.branchDao().getAllActiveBranchesList()
                val allStaff = db.userDao().getAllActiveUsersList()
                val activeDevices = repository.getActiveDevicesCount()
                val newPricing = OfflineSubscriptionManager.calculateSubscriptionPrice(
                    branchCount = allBranches.size.coerceAtLeast(1),
                    workerCount = allStaff.size.coerceAtLeast(1),
                    deviceCount = activeDevices
                )
                repository.updateShopProfile(
                    shopProfile.value.copy(
                        monthlyFeeRwf = newPricing.monthlySubtotal,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                scheduleAutoBranchSync()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Ishami ryasibwe."
                else "Branch removed."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Delete branch error: ${e.safeMessage()}")
            }
        }
    }

    fun createStockTransfer(
        productId: String,
        fromBranchId: String,
        fromBranchName: String,
        toBranchId: String,
        toBranchName: String,
        quantity: Double,
        notes: String = ""
    ) {
        runWithBlurLoading("Transferring Stock...", "Moving inventory to $toBranchName") {
            try {
                val user = currentUser.value
                val transfer = repository.createStockTransfer(
                    productId = productId,
                    fromBranchId = fromBranchId,
                    fromBranchName = fromBranchName,
                    toBranchId = toBranchId,
                    toBranchName = toBranchName,
                    quantity = quantity,
                    notes = notes,
                    transferredBy = user?.name ?: "Store Manager"
                )
                BeBossNotificationManager.sendStockTransferNotification(getApplication(), transfer)
                scheduleAutoBranchSync()

                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Kwohereza ibicuruzwa (${quantity.toInt()} ${transfer.productName}) muri $toBranchName byakozwe neza!"
                else "Stock transfer of ${quantity.toInt()} ${transfer.productName} to $toBranchName recorded!"
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _snackbarMessage.emit("Transfer error: ${e.safeMessage()}")
            }
        }
    }

    fun deleteStockTransfer(id: String) {
        viewModelScope.launch {
            try {
                repository.deleteStockTransfer(id)
                scheduleAutoBranchSync()
                _snackbarMessage.emit("Stock transfer log removed.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _snackbarMessage.emit("Delete transfer error: ${e.safeMessage()}")
            }
        }
    }

    fun confirmTransferReceived(transferId: String) {
        runWithBlurLoading("Confirming Transfer...", "Crediting destination branch inventory") {
            try {
                val user = currentUser.value
                repository.confirmTransferReceived(transferId, user?.name ?: "Store Manager", actor = user)
                scheduleAutoBranchSync()
                _snackbarMessage.emit("Transfer confirmed received — destination stock credited.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Confirm received error: ${e.safeMessage()}")
            }
        }
    }

    fun rejectStockTransfer(transferId: String, reason: String = "Cancelled at destination") {
        runWithBlurLoading("Cancelling Transfer...", "Returning reserved stock to source branch") {
            try {
                val user = currentUser.value
                repository.rejectOrCancelTransfer(
                    transferId = transferId,
                    actorName = user?.name ?: "Store Manager",
                    reason = reason,
                    actor = user
                )
                scheduleAutoBranchSync()
                _snackbarMessage.emit("Transfer cancelled — stock returned to source branch.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Cancel transfer error: ${e.safeMessage()}")
            }
        }
    }

    fun updateBranchOperationalStatus(branchId: String, status: String) {
        viewModelScope.launch {
            try {
                repository.updateBranchOperationalStatus(branchId, status)
                scheduleAutoBranchSync()
                _snackbarMessage.emit("Branch status updated to $status.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _snackbarMessage.emit("Status update error: ${e.safeMessage()}")
            }
        }
    }

    fun saveUser(user: User) {
        runWithBlurLoading("Saving Staff Member...", "Updating role permissions & cloud roster") {
            try {
                repository.saveUser(user, actor = currentUser.value)
                val allBranches = db.branchDao().getAllActiveBranchesList()
                val allStaff = db.userDao().getAllActiveUsersList()
                val activeDevices = repository.getActiveDevicesCount()
                val newPricing = OfflineSubscriptionManager.calculateSubscriptionPrice(
                    branchCount = allBranches.size.coerceAtLeast(1),
                    workerCount = allStaff.size.coerceAtLeast(1),
                    deviceCount = activeDevices
                )
                repository.updateShopProfile(
                    shopProfile.value.copy(
                        monthlyFeeRwf = newPricing.monthlySubtotal,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                repository.recordLocalAudit(
                    actorName = currentUser.value?.name ?: "Owner",
                    actorRole = currentUser.value?.role?.name ?: "OWNER",
                    action = "STAFF_SAVED",
                    targetId = user.username,
                    details = "Saved staff member '${user.name}' (${user.role.name})"
                )
                scheduleAutoBranchSync()
                _snackbarMessage.emit("Staff member '${user.name}' saved (${newPricing.monthlySubtotal} FRw/mo total plan).")
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Staff save error: ${e.safeMessage()}")
            }
        }
    }

    fun deleteUser(userId: String) {
        runWithBlurLoading("Removing Staff...", "Updating branch roster & security access") {
            try {
                if (currentUser.value?.id == userId) {
                    _snackbarMessage.emit("Cannot delete the currently active account.")
                    return@runWithBlurLoading
                }
                repository.deleteUser(userId, actor = currentUser.value)
                val allBranches = db.branchDao().getAllActiveBranchesList()
                val allStaff = db.userDao().getAllActiveUsersList()
                val activeDevices = repository.getActiveDevicesCount()
                val newPricing = OfflineSubscriptionManager.calculateSubscriptionPrice(
                    branchCount = allBranches.size.coerceAtLeast(1),
                    workerCount = allStaff.size.coerceAtLeast(1),
                    deviceCount = activeDevices
                )
                repository.updateShopProfile(
                    shopProfile.value.copy(
                        monthlyFeeRwf = newPricing.monthlySubtotal,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                repository.recordLocalAudit(
                    actorName = currentUser.value?.name ?: "Owner",
                    actorRole = currentUser.value?.role?.name ?: "OWNER",
                    action = "STAFF_REMOVED",
                    targetId = userId,
                    details = "Removed staff account"
                )
                scheduleAutoBranchSync()
                _snackbarMessage.emit("Staff account removed.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Staff delete error: ${e.safeMessage()}")
            }
        }
    }

    fun setProductSearchQuery(query: String) {
        _productSearchQuery.value = query
    }

    fun setSelectedProductCategory(cat: String) {
        _selectedProductCategory.value = cat
    }

    fun toggleLowStockFilter() {
        _showOnlyLowStock.value = !_showOnlyLowStock.value
    }

    fun saveProduct(product: Product) {
        runWithBlurLoading("Saving Product...", "Updating inventory catalog & sync queue") {
            try {
                repository.saveProduct(product, actor = currentUser.value)
                scheduleAutoBranchSync()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Igicuruzwa '${product.name}' cyabitswe neza."
                else "Product '${product.name}' saved."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Product save error: ${e.safeMessage()}")
            }
        }
    }

    fun adjustStock(productId: String, delta: Double, reason: String) {
        runWithBlurLoading("Adjusting Stock...", "Updating audited stock ledger") {
            try {
                repository.adjustStock(productId, delta, reason, actor = currentUser.value)
                scheduleAutoBranchSync()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Ingano y'ububiko yahinduwe (${if (delta > 0) "+$delta" else "$delta"})."
                else "Stock adjusted (${if (delta > 0) "+$delta" else "$delta"})."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Stock adjust error: ${e.safeMessage()}")
            }
        }
    }

    fun deleteProduct(productId: String) {
        runWithBlurLoading("Deleting Product...", "Updating catalog & tombstones") {
            try {
                repository.deleteProduct(productId, actor = currentUser.value)
                scheduleAutoBranchSync()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Igicuruzwa cyasibwe."
                else "Product deleted."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Delete product error: ${e.safeMessage()}")
            }
        }
    }

    fun restoreDeletedProduct(productId: String) {
        viewModelScope.launch {
            try {
                repository.restoreProduct(productId, actor = currentUser.value)
                scheduleAutoBranchSync()
                _snackbarMessage.emit("Product restored.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Restore error: ${e.safeMessage()}")
            }
        }
    }

    fun recordPurchaseOrder(
        productId: String,
        quantity: Double,
        unitCostPrice: Double,
        newSellingPrice: Double? = null,
        supplierName: String,
        supplierPhone: String = "",
        paymentStatus: String = "PAID_CASH",
        invoiceNumber: String = "",
        notes: String = ""
    ) {
        runWithBlurLoading("Recording Purchase...", "Crediting stock & Excel purchase ledger") {
            try {
                val user = currentUser.value
                val branch = branches.value.firstOrNull { it.id == _selectedBranchId.value }
                    ?: branches.value.firstOrNull { it.isMainBranch }
                    ?: Branch()

                val purchase = repository.recordPurchaseOrder(
                    productId = productId,
                    quantity = quantity,
                    unitCostPrice = unitCostPrice,
                    newSellingPrice = newSellingPrice,
                    supplierName = supplierName,
                    supplierPhone = supplierPhone,
                    paymentStatus = paymentStatus,
                    invoiceNumber = invoiceNumber,
                    branchId = branch.id,
                    branchName = branch.name,
                    buyerId = user?.id ?: "",
                    buyerName = user?.name ?: "Shop Manager",
                    notes = notes
                )
                scheduleAutoBranchSync()

                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Kugura ibicuruzwa (${purchase.quantityPurchased.toInt()} ${purchase.productName}) byanditswe neza muri Excel Ledger!"
                else "Stock In / Purchase order for ${purchase.quantityPurchased.toInt()} ${purchase.productName} recorded successfully in Excel Ledger!"
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _snackbarMessage.emit("Purchase order error: ${e.safeMessage()}")
            }
        }
    }

    fun quickRestockAndAddToCart(
        product: Product,
        quantityToAdd: Double,
        unitCost: Double,
        supplierName: String
    ) {
        runWithBlurLoading("Quick Restocking...", "Updating inventory & adding to cart") {
            try {
                val user = currentUser.value
                val branch = branches.value.firstOrNull { it.id == _selectedBranchId.value }
                    ?: branches.value.firstOrNull { it.isMainBranch }
                    ?: Branch()

                repository.recordPurchaseOrder(
                    productId = product.id,
                    quantity = quantityToAdd,
                    unitCostPrice = unitCost,
                    newSellingPrice = product.sellingPrice,
                    supplierName = supplierName.ifBlank { "Immediate Supplier" },
                    branchId = branch.id,
                    branchName = branch.name,
                    buyerId = user?.id ?: "",
                    buyerName = user?.name ?: "Shop Manager",
                    notes = "Quick POS 1-Tap Restock"
                )

                val updatedProd = repository.getProductById(product.id) ?: product.copy(quantityInStock = product.quantityInStock + quantityToAdd)
                addToCart(updatedProd, 1.0)
                scheduleAutoBranchSync()

                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "${product.name} yongerewe mu bubiko (+${quantityToAdd.toInt()}) kandi yongerewe muri POS Cart!"
                else "Restocked ${product.name} (+${quantityToAdd.toInt()} units) and added to POS cart!"
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _snackbarMessage.emit("Quick restock error: ${e.safeMessage()}")
            }
        }
    }

    fun deletePurchaseRecord(purchaseId: String) {
        viewModelScope.launch {
            try {
                repository.deletePurchaseRecord(purchaseId)
                scheduleAutoBranchSync()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Inyandiko yo kugura yasibwe."
                else "Purchase order removed from ledger."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _snackbarMessage.emit("Delete purchase error: ${e.safeMessage()}")
            }
        }
    }

    fun setCustomerSearchQuery(query: String) {
        _customerSearchQuery.value = query
    }

    fun saveCustomer(customer: Customer) {
        runWithBlurLoading("Saving Customer...", "Updating CRM & credit ledger") {
            try {
                repository.saveCustomer(customer, actor = currentUser.value)
                scheduleAutoBranchSync()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Umukiriya '${customer.name}' yanditswe neza."
                else "Customer '${customer.name}' saved."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Customer save error: ${e.safeMessage()}")
            }
        }
    }

    fun recordDebtPayment(
        customerId: String,
        amount: Double,
        paymentMethod: String = "Cash",
        notes: String = ""
    ) {
        runWithBlurLoading("Recording Repayment...", "Updating customer balance & receipt log") {
            try {
                val user = currentUser.value
                val branch = branches.value.firstOrNull { it.id == _selectedBranchId.value }
                    ?: branches.value.firstOrNull { it.isMainBranch }
                    ?: Branch()

                val payment = CustomerPayment(
                    customerId = customerId,
                    customerName = customers.value.firstOrNull { it.id == customerId }?.name ?: "Customer",
                    amount = amount,
                    paymentMethod = paymentMethod,
                    notes = notes,
                    recordedBy = user?.name ?: "Shop Operator",
                    branchId = branch.id,
                    branchName = branch.name
                )

                val updatedPayment = repository.recordCustomerPayment(payment)
                val symbol = shopProfile.value.currencySymbol

                BeBossNotificationManager.sendDebtPaymentNotification(
                    context = getApplication(),
                    customerName = payment.customerName,
                    amountPaid = amount,
                    remainingDebt = updatedPayment.remainingDebt,
                    currencySymbol = symbol
                )
                scheduleAutoBranchSync()

                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA) {
                    if (updatedPayment.remainingDebt <= 0) {
                        "Kwishyura ${amount.toInt()} $symbol byakiriwe! UMWENDA WARANGIYE NEZA (0 $symbol)!"
                    } else {
                        "Kwishyura ${amount.toInt()} $symbol byakiriwe. Hasigaye ${updatedPayment.remainingDebt.toInt()} $symbol."
                    }
                } else {
                    if (updatedPayment.remainingDebt <= 0) {
                        "Payment of ${amount.toInt()} $symbol received! DEBT FULLY CLEARED (0 $symbol)!"
                    } else {
                        "Payment of ${amount.toInt()} $symbol received. Remaining debt: ${updatedPayment.remainingDebt.toInt()} $symbol."
                    }
                }
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Debt payment error: ${e.safeMessage()}")
            }
        }
    }

    fun deleteCustomer(customerId: String) {
        runWithBlurLoading("Removing Customer...", "Updating customer directory") {
            try {
                repository.deleteCustomer(customerId, actor = currentUser.value)
                scheduleAutoBranchSync()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Umukiriya yasibwe."
                else "Customer removed."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Customer remove error: ${e.safeMessage()}")
            }
        }
    }

    fun restoreDeletedCustomer(customerId: String) {
        viewModelScope.launch {
            try {
                repository.restoreCustomer(customerId, actor = currentUser.value)
                scheduleAutoBranchSync()
                _snackbarMessage.emit("Customer restored.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Restore error: ${e.safeMessage()}")
            }
        }
    }

    fun deleteSale(saleId: String, refundReason: String = "") {
        runWithBlurLoading("Voiding Sale...", "Restoring stock & recording security audit") {
            try {
                val saleSnapshot = allSales.value.firstOrNull { it.id == saleId }
                repository.deleteSale(saleId, actor = currentUser.value)
                repository.recordLocalAudit(
                    actorName = currentUser.value?.name ?: "Manager",
                    actorRole = currentUser.value?.role?.name ?: "MANAGER",
                    action = "SALE_REFUNDED_VOIDED",
                    targetId = saleSnapshot?.receiptNumber ?: saleId,
                    details = buildString {
                        append("Voided/refunded receipt #${saleSnapshot?.receiptNumber ?: saleId}")
                        if (saleSnapshot != null) {
                            append(" (${saleSnapshot.totalAmount.toLong()} ${shopProfile.value.currencySymbol})")
                        }
                        if (refundReason.isNotBlank()) {
                            append(" • Reason: ${refundReason.trim()}")
                        }
                    }
                )
                scheduleAutoBranchSync()
                refreshDatabaseStats()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Igurisha ryasubijwe/ryasibwe neza, ububiko bwasubijweho."
                else "Sale refunded/voided with audit log and stock restored."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Manager/Owner approval required to refund or void sales."))
            } catch (e: Exception) {
                _snackbarMessage.emit("Failed to refund/void sale: ${e.safeMessage()}")
            }
        }
    }

    fun setAnalyticsPeriod(period: AnalyticsPeriod) {
        _selectedAnalyticsPeriod.value = period
    }

    fun updateShopProfile(profile: ShopProfile) {
        runWithBlurLoading("Saving Shop Settings...", "Updating receipt branding & cloud profile") {
            try {
                repository.updateShopProfile(profile, actor = currentUser.value)
                scheduleAutoBranchSync()
                val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                    "Amakuru y'ububiko yavuguruwe."
                else "Shop profile updated."
                _snackbarMessage.emit(msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                _snackbarMessage.emit(e.safeMessage("Permission denied"))
            } catch (e: Exception) {
                _snackbarMessage.emit("Settings save error: ${e.safeMessage()}")
            }
        }
    }

    fun testNotification(channelType: String) {
        val app = getApplication<Application>()
        val shop = shopProfile.value
        val activeBranch = branches.value.firstOrNull { it.id == effectiveBranchId.value }
            ?: branches.value.firstOrNull { it.isMainBranch }
            ?: branches.value.firstOrNull()
        when (channelType) {
            "SALE" -> {
                val realSale = scopedSales.value.firstOrNull() ?: Sale(
                    id = UUID.randomUUID().toString(),
                    customerName = "Walk-in Customer",
                    saleDate = System.currentTimeMillis(),
                    totalAmount = todaySummary.value.totalRevenue,
                    paymentMethod = "CASH",
                    receiptNumber = "LIVE-${System.currentTimeMillis().toString().takeLast(5)}",
                    branchId = activeBranch?.id ?: "main_branch",
                    branchName = activeBranch?.name ?: shop.shopName.ifBlank { "Main Store" }
                )
                BeBossNotificationManager.sendSaleCompletedNotification(app, realSale, shop)
            }
            "LOW_STOCK" -> {
                val lowProd = scopedLowStockProducts.value.firstOrNull() ?: scopedProducts.value.firstOrNull()
                if (lowProd != null) {
                    BeBossNotificationManager.sendLowStockNotification(
                        app,
                        lowProd.name,
                        lowProd.quantityInStock,
                        lowProd.lowStockThreshold,
                        lowProd.unit
                    )
                } else {
                    BeBossNotificationManager.sendLowStockNotification(
                        app,
                        "${shop.shopName.ifBlank { "Shop" }} Inventory Check",
                        0.0,
                        shop.lowStockThresholdDefault,
                        "units"
                    )
                }
            }
            "DEBT" -> {
                val debtor = customersWithDebt.value.firstOrNull() ?: customers.value.firstOrNull()
                BeBossNotificationManager.sendDebtPaymentNotification(
                    app,
                    debtor?.name ?: "Credit Account",
                    debtor?.debtBalance ?: 0.0,
                    0.0,
                    shop.currencySymbol
                )
            }
            "TRANSFER" -> {
                val latestTransfer = allStockTransfers.value.firstOrNull() ?: run {
                    val branchList = branches.value
                    val from = activeBranch ?: branchList.firstOrNull()
                    val to = branchList.firstOrNull { it.id != from?.id } ?: from
                    val prod = scopedProducts.value.firstOrNull()
                    StockTransfer(
                        transferNumber = "TRF-${System.currentTimeMillis().toString().takeLast(4)}",
                        productId = prod?.id ?: "",
                        productName = prod?.name ?: "Stock Dispatch",
                        fromBranchId = from?.id ?: "main_branch",
                        fromBranchName = from?.name ?: "${shop.shopName.ifBlank { "HQ" }}",
                        toBranchId = to?.id ?: "main_branch",
                        toBranchName = to?.name ?: "Branch Outlet",
                        quantity = 1.0,
                        unit = prod?.unit ?: "units"
                    )
                }
                BeBossNotificationManager.sendStockTransferNotification(app, latestTransfer)
            }
            "TARGET" -> {
                val target = activeBranch?.dailySalesTargetRwf?.takeIf { it > 0L }?.toDouble()
                    ?: shop.dailySalesTarget.takeIf { it > 0.0 }
                    ?: 100_000.0
                BeBossNotificationManager.sendDailyTargetReachedNotification(
                    app,
                    todaySummary.value.totalRevenue,
                    target,
                    shop.currencySymbol
                )
            }
            "SYNC" -> {
                val branchName = activeBranch?.name ?: shop.shopName.ifBlank { "Headquarters" }
                BeBossNotificationManager.sendBranchSyncNotification(app, branchName, scopedProducts.value.size)
            }
            "SYNC_DEVICE" -> {
                val shopName = shop.shopName.ifBlank { "BeBoss Store" }
                val devName = Build.MODEL ?: "Mobile Terminal"
                BeBossNotificationManager.sendDeviceSyncedNotification(app, shopName, devName)
            }
        }
        viewModelScope.launch {
            _snackbarMessage.emit("Dispatched live $channelType notification alert.")
        }
    }

    fun onPermissionsUpdated() {
        val app = getApplication<Application>()
        // 1. Ensure modern channels exist
        BeBossNotificationManager.createNotificationChannels(app)

        // 2. Schedule periodic & immediate cloud sync
        CloudSyncScheduler.schedulePeriodicSync(app)
        CloudSyncScheduler.enqueueImmediateSync(app)

        // 3. Trigger immediate cloud sync & telemetry upload
        syncToCloudNow()

        // 4. Re-inspect security posture & upload device telemetry
        reInspectSecurityPosture(syncTrustedTime = true)

        // 5. Send notification confirmation if notification permission granted
        val shopName = shopProfile.value.shopName
        val activeDevName = Build.MODEL ?: "Mobile Device"
        BeBossNotificationManager.sendDeviceSyncedNotification(app, shopName, activeDevName)

        viewModelScope.launch {
            val msg = if (_currentLanguage.value == AppLanguage.KINYARWANDA)
                "Uburyo bw'imenyesha n'ibya Admin Sync byatangiye gukora!"
            else "Notification shield & real-time Admin Management Sync activated!"
            _snackbarMessage.emit(msg)
        }
    }

    // ------------------------------------------------------------------------
    // DATABASE ENGINE DELEGATION
    // ------------------------------------------------------------------------
    fun refreshDatabaseStats(context: Context? = null) = dbCoordinator.refreshDatabaseStats(context)
    fun optimizeDatabase(context: Context? = null) = dbCoordinator.optimizeDatabase(context)
    fun verifyDatabaseIntegrity() = dbCoordinator.verifyDatabaseIntegrity()
    fun clearTransactionalDataOnly(context: Context? = null) = dbCoordinator.clearTransactionalDataOnly(context)
    fun clearAllProducts(context: Context? = null) = dbCoordinator.clearAllProducts(context) {
        posCoordinator.clearCart()
        _productSearchQuery.value = ""
    }

    fun clearAllCustomers(context: Context? = null) = dbCoordinator.clearAllCustomers(context) {
        _customerSearchQuery.value = ""
    }

    fun resetWholeApp(context: Context? = null) = dbCoordinator.resetWholeApp(context) {
        _productSearchQuery.value = ""
        _customerSearchQuery.value = ""
    }


    override fun onCleared() {
        super.onCleared()
        idleLockJob?.cancel()
        syncCoordinator.cleanup()
    }
}
