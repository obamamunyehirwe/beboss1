package com.beboss.shopmgmt.ui.viewmodel.coordinators

import android.app.Application
import android.content.Context
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerPayment
import com.beboss.shopmgmt.data.model.DeadLetterItem
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.StockTransfer
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.repository.BeBossRepository
import com.beboss.shopmgmt.util.CloudSyncReport
import com.beboss.shopmgmt.util.CloudSyncScheduler
import com.beboss.shopmgmt.util.DeviceTelemetryUploader
import com.beboss.shopmgmt.util.ConnectivityStatus
import com.beboss.shopmgmt.util.EndpointPingResult
import com.beboss.shopmgmt.util.LocalNetworkSyncServer
import com.beboss.shopmgmt.util.LocationHelper
import com.beboss.shopmgmt.util.NetworkConnectivityObserver
import com.beboss.shopmgmt.util.OfflineSubscriptionManager
import com.beboss.shopmgmt.util.ShopDataTransferManager
import com.beboss.shopmgmt.util.ShopImportSummary
import com.beboss.shopmgmt.util.SupabaseAdminClient
import com.beboss.shopmgmt.util.SupabaseDeviceTelemetryDto
import com.beboss.shopmgmt.util.safeMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File

class SyncCoordinator(
    private val application: Application,
    private val db: AppDatabase,
    private val repository: BeBossRepository,
    private val connectivityObserver: NetworkConnectivityObserver,
    private val deviceId: String,
    private val scope: CoroutineScope,
    private val currentUser: StateFlow<User?>,
    private val selectedBranchId: StateFlow<String>,
    private val shopProfile: StateFlow<ShopProfile>,
    private val allUsers: StateFlow<List<User>>,
    private val branches: StateFlow<List<Branch>>,
    private val allProducts: StateFlow<List<Product>>,
    private val customers: StateFlow<List<Customer>>,
    private val allSales: StateFlow<List<Sale>>,
    private val allCustomerPayments: StateFlow<List<CustomerPayment>>,
    private val allStockTransfers: StateFlow<List<StockTransfer>>,
    private val emitSnackbar: suspend (String) -> Unit,
    private val syncAdminCloud: suspend (Boolean) -> Unit,
    private val runWithBlurLoading: (title: String, subtitle: String, block: suspend () -> Unit) -> Unit = { _, _, block ->
        scope.launch { block() }
    },
    private val isRegistrationNeeded: StateFlow<Boolean> = MutableStateFlow(false)
) {
    private var autoBranchSyncJob: Job? = null

    val connectivityStatus: StateFlow<ConnectivityStatus> = connectivityObserver.networkStatus
        .stateIn(
            scope,
            SharingStarted.WhileSubscribed(5000),
            if (connectivityObserver.isCurrentlyConnected()) ConnectivityStatus.AVAILABLE else ConnectivityStatus.UNAVAILABLE
        )

    private val _cloudSyncReport = MutableStateFlow<CloudSyncReport?>(null)
    val cloudSyncReport: StateFlow<CloudSyncReport?> = _cloudSyncReport.asStateFlow()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private val _isP2pSyncing = MutableStateFlow(false)
    val isP2pSyncing: StateFlow<Boolean> = _isP2pSyncing.asStateFlow()

    val localNetworkSyncServer = LocalNetworkSyncServer(application, db)
    val localServerStatus = localNetworkSyncServer.serverStatus
    val localServerIp = localNetworkSyncServer.serverIpAddress
    val localConnectedClients = localNetworkSyncServer.connectedClientsCount
    val localLastReceivedPacket = localNetworkSyncServer.lastReceivedPacketSummary
    val discoveredHubs = localNetworkSyncServer.discoveredHubs
    val isDiscoveringHubs = localNetworkSyncServer.isDiscoveringHubs
    val peerSyncEvents = localNetworkSyncServer.peerSyncEvents

    val pendingSyncItems: StateFlow<List<SyncQueueItem>> = repository.pendingSyncQueue
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    val deadLetterQueueItems: StateFlow<List<SyncQueueItem>> = repository.deadLetterSyncQueue
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    val deadLetterRecords: StateFlow<List<DeadLetterItem>> = repository.deadLetterItems
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _shopDeviceTelemetry = MutableStateFlow<List<SupabaseDeviceTelemetryDto>>(emptyList())
    val shopDeviceTelemetry: StateFlow<List<SupabaseDeviceTelemetryDto>> = _shopDeviceTelemetry.asStateFlow()

    fun refreshShopTelemetry() {
        scope.launch {
            try {
                val primaryDevice = repository.getAllShopDevicesList().firstOrNull { it.isOwnerPrimary }
                val owner = allUsers.value.firstOrNull { it.role.toString().equals("OWNER", true) }
                val username = owner?.username?.trim()?.ifBlank { shopProfile.value.email.substringBefore("@").trim() }
                    ?: shopProfile.value.email.substringBefore("@").trim()
                val phone = owner?.phone?.trim()?.ifBlank { shopProfile.value.phone.trim() }
                    ?: shopProfile.value.phone.trim()
                val shopKey = primaryDevice?.shopSyncKey?.takeIf { it.isNotBlank() }
                    ?: if (username.isNotBlank() && phone.filter { it.isDigit() }.takeLast(9).length == 9) {
                        SupabaseAdminClient.computeShopSyncKey(username, phone)
                    } else ""
                if (shopKey.isNotBlank()) {
                    _shopDeviceTelemetry.value = repository.fetchShopTelemetry(shopKey)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
    }

    fun requeueDeadLetter(id: String) {
        scope.launch {
            try {
                repository.requeueSyncItem(id, currentUser.value)
                emitSnackbar("Sync record queued for immediate retry.")
                if (connectivityStatus.value == ConnectivityStatus.AVAILABLE) {
                    runAutomaticCloudSync(showResult = false, retryDeadLetters = false)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Could not requeue sync record: ${e.safeMessage()}")
            }
        }
    }

    fun requeueAllDeadLetters() {
        scope.launch {
            try {
                val count = repository.requeueAllDeadLetters(currentUser.value)
                emitSnackbar(
                    if (count > 0) "Re-queued $count failed sync record(s)." else "No failed sync records to retry."
                )
                if (count > 0 && connectivityStatus.value == ConnectivityStatus.AVAILABLE) {
                    runAutomaticCloudSync(showResult = true, retryDeadLetters = true)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed re-queuing records: ${e.safeMessage()}")
            }
        }
    }

    fun discardDeadLetter(id: String) {
        scope.launch {
            try {
                repository.discardDeadLetterItem(id, currentUser.value)
                emitSnackbar("Discarded failed sync record.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Could not discard sync record: ${e.safeMessage()}")
            }
        }
    }

    fun setupAutoCloudSyncOnInternet() {
        scope.launch(Dispatchers.IO) {
            try {
                OfflineSubscriptionManager.initConfigCache(application)
                CloudSyncScheduler.schedulePeriodicSync(application)
                repository.ensureDefaultBranches()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                repository.logSyncEvent("BRANCH_AUTO_SYNC", "FAILED", "Could not prepare branch data: ${e.safeMessage()}")
            }
            connectivityStatus.collect { status ->
                if (status == ConnectivityStatus.AVAILABLE && !isRegistrationNeeded.value && allUsers.value.isNotEmpty()) {
                    runAutomaticCloudSync()
                }
            }
        }
    }

    fun scheduleAutoBranchSync(delayMs: Long = 1600L) {
        if (isRegistrationNeeded.value) return
        CloudSyncScheduler.enqueueImmediateSync(application)
        if (connectivityStatus.value != ConnectivityStatus.AVAILABLE || allUsers.value.isEmpty()) return
        autoBranchSyncJob?.cancel()
        autoBranchSyncJob = scope.launch {
            delay(delayMs)
            if (connectivityStatus.value == ConnectivityStatus.AVAILABLE &&
                !isRegistrationNeeded.value &&
                allUsers.value.isNotEmpty() &&
                !_isSyncing.value
            ) {
                runAutomaticCloudSync()
            }
        }
    }

    fun syncToCloudNow() {
        runWithBlurLoading(
            "Syncing Cloud...",
            "Uploading branch sales, stock & shield telemetry"
        ) {
            runAutomaticCloudSync(showResult = true, retryDeadLetters = true)
        }
    }

    /**
     * Fetches the shop-scoped LAN secret after the normal cloud account sync has
     * created/updated the shop row. It is wrapped by Android Keystore before storage.
     */
    private suspend fun prepareShopLanSecretFromCloud(): Boolean {
        val profile = shopProfile.value
        val owner = allUsers.value.firstOrNull { it.role.toString().equals("OWNER", true) }
        // Joined devices may not have the owner in their local staff table. Prefer
        // the canonical shop identity already recorded on the owner-primary device.
        val primaryDevice = runCatching {
            db.shopDeviceDao().getAllDevicesList().firstOrNull { it.isOwnerPrimary }
        }.getOrNull()
        val username = owner?.username?.trim()?.takeIf { it.isNotBlank() }
            ?: primaryDevice?.assignedUsername?.trim()?.takeIf { it.isNotBlank() }
            ?: profile.email.substringBefore("@").trim()
        val phone = owner?.phone?.trim()?.takeIf { it.isNotBlank() }
            ?: profile.phone.trim()
        val shopSyncKey = primaryDevice?.shopSyncKey?.trim()?.takeIf { it.isNotBlank() }
            ?: if (username.isNotBlank() && phone.filter { it.isDigit() }.takeLast(9).length == 9) {
                SupabaseAdminClient.computeShopSyncKey(username, phone)
            } else return false

        if (!SupabaseAdminClient.isConfigured()) {
            return localNetworkSyncServer.useCachedShopSharedSecret(shopSyncKey)
        }

        val cloudSecret = SupabaseAdminClient.fetchShopLanSyncSecret(shopSyncKey)
        if (!cloudSecret.isNullOrBlank() &&
            localNetworkSyncServer.configureShopSharedSecret(shopSyncKey, cloudSecret)
        ) {
            return true
        }
        // A previously provisioned key remains usable on the local Wi-Fi/hotspot
        // even when the shop's internet connection is temporarily unavailable.
        return localNetworkSyncServer.useCachedShopSharedSecret(shopSyncKey)
    }

    private suspend fun runAutomaticCloudSync(showResult: Boolean = false, retryDeadLetters: Boolean = false) {
        if (!showResult && (isRegistrationNeeded.value || db.userDao().getAllActiveUsersList().isEmpty())) {
            return
        }
        if (!_isSyncing.compareAndSet(expect = false, update = true)) return
        try {
            try {
                com.beboss.shopmgmt.util.ClockGuard.reInspectNow(application)
                // Refresh foreground location telemetry when permission is active before pushing to cloud
                if (com.beboss.shopmgmt.util.DeviceTelemetryUploader.isLocationSharingEnabled(application)) {
                    LocationHelper.captureCurrentLocation(application)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
            try {
                syncAdminCloud(true)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                repository.logSyncEvent("SUPABASE_ADMIN", "FAILED", "Admin cloud check failed: ${e.safeMessage("Check connection")}")
            }
            // Provision or unlock the shop key before constructing the authoritative
            // snapshot. New cloud generations are signed as BBSHARE2 with this key.
            val shopSecretReady = prepareShopLanSecretFromCloud()
            val shopShareSecret = if (shopSecretReady) {
                localNetworkSyncServer.activeShopSharedSecret()
            } else null
            if (shopShareSecret.isNullOrBlank()) {
                repository.logSyncEvent(
                    "DATASHARE_SECURITY",
                    "PENDING",
                    "Shop-scoped snapshot signing key is unavailable. Local records and outbox are preserved; retry online pairing before uploading a new full snapshot."
                )
            }
            val report = repository.performSync(
                activeBranchId = selectedBranchId.value,
                deviceId = deviceId,
                context = application,
                retryDeadLetters = retryDeadLetters,
                shopShareSecret = shopShareSecret
            )
            _cloudSyncReport.value = report
            if (SupabaseAdminClient.isConfigured() && report.state != com.beboss.shopmgmt.util.CloudSyncState.SYNCED) {
                val telemetryUploaded = DeviceTelemetryUploader.upload(
                    context = application,
                    database = db,
                    profile = shopProfile.value,
                    deviceId = deviceId
                )
                if (!telemetryUploaded) {
                    repository.logSyncEvent(
                        "DEVICE_TELEMETRY",
                        "FAILED",
                        "Security, location and outbound-message summary upload failed; local message records remain pending."
                    )
                }
            }
            refreshShopTelemetry()
            if (showResult) emitSnackbar(report.message)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val message = "Automatic cloud sync failed: ${e.safeMessage("Check your internet connection and retry")}"
            repository.logSyncEvent("BRANCH_AUTO_SYNC", "FAILED", message)
            _cloudSyncReport.value = CloudSyncReport(
                state = com.beboss.shopmgmt.util.CloudSyncState.ERROR,
                message = message,
                lastSyncTimestamp = shopProfile.value.lastSyncedAt
            )
            if (showResult) emitSnackbar(message)
        } finally {
            _isSyncing.value = false
        }
    }

    fun syncToCloudWithEndpoint(endpoint: String? = null) {
        runWithBlurLoading(
            "Syncing Relay Server...",
            "Exchanging branch deltas & security state"
        ) {
            if (!_isSyncing.compareAndSet(expect = false, update = true)) return@runWithBlurLoading
            try {
                try {
                    com.beboss.shopmgmt.util.ClockGuard.reInspectNow(application)
                    if (com.beboss.shopmgmt.util.DeviceTelemetryUploader.isLocationSharingEnabled(application)) {
                    LocationHelper.captureCurrentLocation(application)
                }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                }
                val shopSecretReady = prepareShopLanSecretFromCloud()
                val shopShareSecret = if (shopSecretReady) {
                    localNetworkSyncServer.activeShopSharedSecret()
                } else null
                val report = repository.cloudSyncManager.syncAllDataToCloud(
                    serverEndpoint = endpoint,
                    activeBranchId = selectedBranchId.value,
                    deviceId = deviceId,
                    context = application,
                    retryDeadLetters = true,
                    mergeRemoteSummary = { summary -> repository.mergeShopDataPackageLww(summary) },
                    shopShareSecret = shopShareSecret
                )
                _cloudSyncReport.value = report
                if (shopShareSecret.isNullOrBlank()) {
                    repository.logSyncEvent(
                        "DATASHARE_SECURITY",
                        "PENDING",
                        "Relay sync retained local changes, but a complete shop-signed cloud snapshot could not be generated because the shop key is not provisioned."
                    )
                }
                if (SupabaseAdminClient.isConfigured() && report.state != com.beboss.shopmgmt.util.CloudSyncState.SYNCED) {
                    val telemetryUploaded = DeviceTelemetryUploader.upload(
                        context = application,
                        database = db,
                        profile = shopProfile.value,
                        deviceId = deviceId
                    )
                    if (!telemetryUploaded) {
                        repository.logSyncEvent(
                            "DEVICE_TELEMETRY",
                            "FAILED",
                            "Security telemetry upload failed; message dispatch records remain pending for retry."
                        )
                    }
                }
                emitSnackbar(report.message)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val message = "Relay sync failed: ${e.safeMessage("Unable to reach sync server")}"
                repository.logSyncEvent("RELAY_SYNC", "FAILED", message)
                _cloudSyncReport.value = CloudSyncReport(
                    state = com.beboss.shopmgmt.util.CloudSyncState.ERROR,
                    message = message,
                    lastSyncTimestamp = shopProfile.value.lastSyncedAt
                )
                emitSnackbar(message)
            } finally {
                _isSyncing.value = false
            }
        }
    }

    fun testEndpointPing(endpoint: String, onResult: (EndpointPingResult) -> Unit) {
        scope.launch {
            onResult(repository.testServerPing(endpoint))
        }
    }

    fun toggleLocalSyncServer(enable: Boolean) {
        if (enable) {
            scope.launch {
                if (!prepareShopLanSecretFromCloud()) {
                    emitSnackbar("Sync this shop online once to securely provision its LAN pairing key before starting the local hub.")
                    return@launch
                }
                val started = localNetworkSyncServer.startServer()
                if (started) {
                    repository.logSyncEvent("P2P_SERVER", "SUCCESS", "Encrypted LAN Hub started on port ${localNetworkSyncServer.port}")
                } else {
                    emitSnackbar("Unable to start the encrypted LAN hub. Check Wi-Fi permissions, port availability and local network access.")
                }
            }
        } else {
            localNetworkSyncServer.stopServer()
            repository.logSyncEvent("P2P_SERVER", "SUCCESS", "Local Hub Server stopped")
        }
    }

    fun startLanDiscovery() {
        scope.launch {
            if (!prepareShopLanSecretFromCloud()) {
                emitSnackbar("Connect this shop to the internet and run cloud sync once before discovering nearby BeBoss terminals.")
                return@launch
            }
            localNetworkSyncServer.startDiscovery()
        }
    }

    fun stopLanDiscovery() {
        localNetworkSyncServer.stopDiscovery()
    }

    fun syncWithLocalMasterHub(hubIp: String) {
        scope.launch {
            _isP2pSyncing.value = true
            try {
                val res = localNetworkSyncServer.syncWithMasterHub(hubIp, currentUser.value)
                repository.logSyncEvent(
                    type = "P2P_CLIENT",
                    status = if (res.success) "SUCCESS" else "FAILED",
                    summary = res.message,
                    latencyMs = res.latencyMs
                )
                emitSnackbar(res.message)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val err = "P2P sync failed: ${e.safeMessage("Could not connect to master hub")}"
                repository.logSyncEvent(type = "P2P_CLIENT", status = "FAILED", summary = err)
                emitSnackbar(err)
            } finally {
                _isP2pSyncing.value = false
            }
        }
    }

    fun createBranchShareToken(branchIdFilter: String? = null, onReady: (String) -> Unit) {
        scope.launch {
            try {
                val json = ShopDataTransferManager.createExportJson(
                    profile = shopProfile.value,
                    users = allUsers.value,
                    products = allProducts.value,
                    customers = customers.value,
                    sales = allSales.value,
                    saleItems = repository.getAllSaleItemsList(),
                    payments = allCustomerPayments.value,
                    exportedByUser = currentUser.value,
                    branches = branches.value,
                    stockTransfers = allStockTransfers.value,
                    purchases = repository.getAllPurchasesList(),
                    branchIdFilter = branchIdFilter,
                    tombstones = repository.getAllTombstonesList()
                )
                if (!prepareShopLanSecretFromCloud()) {
                    throw SecurityException("Secure shop DataShare is not provisioned. Connect the owner phone to BeBoss Cloud once, then retry.")
                }
                val shopSecret = localNetworkSyncServer.activeShopSharedSecret()
                    ?: throw SecurityException("The shop's protected DataShare key is unavailable on this device.")
                val token = ShopDataTransferManager.createShopScopedShareToken(json, shopSecret)
                repository.logSyncEvent("BRANCH_TOKEN", "SUCCESS", "Generated shop-scoped BBSHARE2 token (${token.length} chars)")
                onReady(token)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed to build branch share token: ${e.safeMessage()}")
            }
        }
    }

    fun exportFullBranchPackage(context: Context, branchIdFilter: String? = null, onReady: (File) -> Unit) {
        scope.launch {
            try {
                val file = ShopDataTransferManager.exportShopPackage(
                    context = context,
                    profile = shopProfile.value,
                    users = allUsers.value,
                    products = allProducts.value,
                    customers = customers.value,
                    sales = allSales.value,
                    saleItems = repository.getAllSaleItemsList(),
                    payments = allCustomerPayments.value,
                    exportedByUser = currentUser.value,
                    branches = branches.value,
                    stockTransfers = allStockTransfers.value,
                    purchases = repository.getAllPurchasesList(),
                    branchIdFilter = branchIdFilter,
                    tombstones = repository.getAllTombstonesList()
                )
                repository.logSyncEvent("FILE_EXPORT", "SUCCESS", "Exported ${file.name} with full branch ledger")
                onReady(file)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Export error: ${e.safeMessage()}")
            }
        }
    }

    fun importBranchShareToken(tokenOrJson: String, onDone: (Boolean, String) -> Unit = { _, _ -> }) {
        scope.launch {
            try {
                val cleanToken = tokenOrJson.trim()
                val shopSecret = if (cleanToken.startsWith("BBSHARE2:")) {
                    if (!prepareShopLanSecretFromCloud()) {
                        throw SecurityException("Connect this device to the shop's registered owner account once to retrieve its protected DataShare key.")
                    }
                    localNetworkSyncServer.activeShopSharedSecret()
                        ?: throw SecurityException("The shop's protected DataShare key is unavailable on this device.")
                } else null
                val summary = ShopDataTransferManager.parseShopPackageString(
                    cleanToken,
                    enforceReplayProtection = true,
                    shopSecret = shopSecret
                )
                val result = repository.importShopDataPackage(summary, currentUser.value)
                val msg = "Merged ${summary.branches.size} branches, ${result.mergedProducts} products, ${result.mergedSales} sales (${result.conflictsResolved} HLC conflicts resolved)."
                repository.logSyncEvent("BRANCH_IMPORT", "SUCCESS", msg)
                repository.recordLocalAudit(
                    actorName = currentUser.value?.name ?: "Operator",
                    actorRole = currentUser.value?.role?.name ?: "SYSTEM",
                    action = "DATASHARE_MERGE",
                    targetId = summary.branchScopeName.orEmpty(),
                    details = msg
                )
                emitSnackbar(msg)
                onDone(true, msg)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val err = "Branch DataShare import failed: ${e.safeMessage()}"
                emitSnackbar(err)
                onDone(false, err)
            }
        }
    }

    /**
     * Requests a one-time owner SMS code for old globally signed DataShare exports.
     * The signing secret never leaves Supabase; only the registered owner can unlock
     * the server-side compatibility verifier.
     */
    fun requestLegacyBranchShareOtp(onDone: (Boolean, String) -> Unit = { _, _ -> }) {
        scope.launch {
            try {
                val owner = allUsers.value.firstOrNull {
                    it.role == com.beboss.shopmgmt.data.model.UserRole.OWNER && it.isActive
                } ?: throw SecurityException("The registered shop owner profile is missing on this terminal.")
                val phone = owner.phone.ifBlank { shopProfile.value.phone }
                SupabaseAdminClient.requestOwnerDeviceCredentialOtp(owner.username, phone).getOrThrow()
                val message = "A verification code was sent to the registered shop-owner phone. Enter it here to verify the legacy token online."
                emitSnackbar(message)
                onDone(true, message)
            } catch (error: Exception) {
                val message = "Could not request owner verification: ${error.safeMessage()}"
                emitSnackbar(message)
                onDone(false, message)
            }
        }
    }

    /**
     * Server-verifies a legacy token using owner SMS OTP, then imports the sanitized
     * snapshot through the existing repository merge path. No shared legacy key is
     * included in the Android request or stored on this device.
     */
    fun importLegacyBranchShareToken(
        token: String,
        otp: String,
        onDone: (Boolean, String) -> Unit = { _, _ -> }
    ) {
        scope.launch {
            try {
                val owner = allUsers.value.firstOrNull {
                    it.role == com.beboss.shopmgmt.data.model.UserRole.OWNER && it.isActive
                } ?: throw SecurityException("The registered shop owner profile is missing on this terminal.")
                val phone = owner.phone.ifBlank { shopProfile.value.phone }
                val summary = SupabaseAdminClient.verifyLegacyBranchShareToken(
                    token = token,
                    ownerUsername = owner.username,
                    ownerPhone = phone,
                    otp = otp
                ).getOrThrow()
                val result = repository.importShopDataPackage(summary, currentUser.value)
                val message = "Legacy branch package verified online and merged: ${summary.branches.size} branches, ${result.mergedProducts} products and ${result.mergedSales} sales."
                repository.logSyncEvent("LEGACY_DATASHARE_MIGRATION", "SUCCESS", message)
                repository.recordLocalAudit(
                    actorName = currentUser.value?.name ?: owner.name,
                    actorRole = currentUser.value?.role?.name ?: "OWNER",
                    action = "LEGACY_DATASHARE_IMPORT",
                    targetId = summary.branchScopeName.orEmpty(),
                    details = message
                )
                emitSnackbar(message)
                onDone(true, message)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                val message = "Legacy DataShare verification failed: ${error.safeMessage()}"
                emitSnackbar(message)
                onDone(false, message)
            }
        }
    }

    fun importShopPackage(summary: ShopImportSummary) {
        scope.launch {
            try {
                repository.importShopDataPackage(summary, currentUser.value)
                repository.recordLocalAudit(
                    actorName = currentUser.value?.name ?: "Operator",
                    actorRole = currentUser.value?.role?.name ?: "SYSTEM",
                    action = "PACKAGE_IMPORT",
                    targetId = summary.shopName,
                    details = "Merged shop package from ${summary.exportedBy}"
                )
                emitSnackbar("Shop data package successfully restored!")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Error restoring shop data: ${e.safeMessage()}")
            }
        }
    }

    fun cleanup() {
        localNetworkSyncServer.stopDiscovery()
        localNetworkSyncServer.stopServer()
    }
}
