package com.beboss.shopmgmt.util

import android.content.Context
import android.util.Log
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import com.beboss.shopmgmt.data.repository.BranchMergeResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.ConnectionSpec
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.TlsVersion
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import kotlin.math.min
import kotlin.random.Random

enum class CloudSyncState {
    IDLE,
    SYNCING,
    SYNCED,
    OFFLINE,
    ERROR
}

data class CloudSyncReport(
    val state: CloudSyncState,
    val itemsPushed: Int = 0,
    val itemsPulled: Int = 0,
    val lastSyncTimestamp: Long = 0L,
    val message: String = "",
    val branchesCount: Int = 0,
    val productsCount: Int = 0,
    val salesCount: Int = 0,
    val debtsCount: Int = 0,
    val conflictsResolved: Int = 0,
    val latencyMs: Long = 0L
)

data class EndpointPingResult(
    val reachable: Boolean,
    val latencyMs: Long,
    val statusCode: Int,
    val message: String
)

data class SyncAuditLog(
    val id: String = UUID.randomUUID().toString(),
    val timestamp: Long = System.currentTimeMillis(),
    val type: String,
    val status: String,
    val summary: String,
    val latencyMs: Long = 0L,
    val payloadSizeKb: Double = 0.0
)

/**
 * Multi-branch Cloud Sync & Durable Outbox Worker Engine:
 * - Processes SyncQueueDao due items with exponential backoff + jitter + DEAD_LETTER ceiling.
 * - Uses chunked delta exports (`ShopDataTransferManager.exportChunkedTokens`) to avoid HTTP size bloat.
 * - Resolves cross-branch merges via `ConflictResolutionEngine`.
 */
class CloudSyncManager(private val database: AppDatabase) {

    private val TAG = "CloudSyncManager"
    private val MAX_QUEUE_RETRIES = 6

    private val pingClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectionSpecs(
                listOf(
                    ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
                        .tlsVersions(TlsVersion.TLS_1_3, TlsVersion.TLS_1_2)
                        .build(),
                    ConnectionSpec.CLEARTEXT
                )
            )
            .followRedirects(false)
            .followSslRedirects(false)
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .build()
    }

    private val _syncAuditLogs = MutableStateFlow<List<SyncAuditLog>>(emptyList())
    val syncAuditLogs: StateFlow<List<SyncAuditLog>> = _syncAuditLogs.asStateFlow()

    fun addAuditLog(type: String, status: String, summary: String, latencyMs: Long = 0L, payloadSizeKb: Double = 0.0) {
        val newLog = SyncAuditLog(
            type = type,
            status = status,
            summary = summary,
            latencyMs = latencyMs,
            payloadSizeKb = payloadSizeKb
        )
        _syncAuditLogs.value = listOf(newLog) + _syncAuditLogs.value.take(49)
    }

    private fun isSafeEndpointUrl(endpoint: String): Boolean {
        val clean = endpoint.trim()
        if (clean.startsWith("https://", ignoreCase = true)) return true
        if (!clean.startsWith("http://", ignoreCase = true)) return false
        val host = clean.removePrefix("http://").substringBefore("/").substringBefore(":").lowercase()
        return host == "localhost" ||
            host == "127.0.0.1" ||
            host.startsWith("192.168.") ||
            host.startsWith("10.") ||
            Regex("^172\\.(1[6-9]|2[0-9]|3[0-1])\\.").containsMatchIn(host)
    }

    suspend fun testEndpointConnection(endpoint: String): EndpointPingResult = withContext(Dispatchers.IO) {
        val cleanUrl = endpoint.trim()
        if (!isSafeEndpointUrl(cleanUrl)) {
            return@withContext EndpointPingResult(
                reachable = false,
                latencyMs = 0L,
                statusCode = 0,
                message = "HTTPS required for remote servers (http:// allowed only on private LAN)."
            )
        }

        val startTime = System.currentTimeMillis()
        try {
            val pingUrl = if (cleanUrl.endsWith("/")) "${cleanUrl}health" else "$cleanUrl/health"
            val req = Request.Builder().url(pingUrl).get().build()
            val code = pingClient.newCall(req).execute().use { it.code }
            val latency = System.currentTimeMillis() - startTime
            EndpointPingResult(
                reachable = true,
                latencyMs = latency,
                statusCode = code,
                message = if (code in 200..299) "Server online (${latency}ms)" else "Server reachable (HTTP $code)"
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val latency = System.currentTimeMillis() - startTime
            BeBossLogger.w(TAG, "Endpoint health ping failed", e)
            EndpointPingResult(
                reachable = false,
                latencyMs = latency,
                statusCode = 0,
                message = "Unreachable: ${e.safeMessage("Connection timed out")}"
            )
        }
    }

    suspend fun syncAllDataToCloud(
        serverEndpoint: String? = null,
        activeBranchId: String = "main_branch",
        deviceId: String = "DEV-LOCAL",
        context: Context? = null,
        retryDeadLetters: Boolean = false,
        mergeRemoteSummary: (suspend (ShopImportSummary) -> BranchMergeResult)? = null
    ): CloudSyncReport = syncMutex.withLock {
        withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        try {
            val now = System.currentTimeMillis()
            val branchDao = database.branchDao()
            val productDao = database.productDao()
            val customerDao = database.customerDao()
            val customerPaymentDao = database.customerPaymentDao()
            val saleDao = database.saleDao()
            val purchaseDao = database.purchaseDao()
            val stockTransferDao = database.stockTransferDao()
            val userDao = database.userDao()
            val shopProfileDao = database.shopProfileDao()
            val syncQueueDao = database.syncQueueDao()

            val branches = branchDao.getAllActiveBranchesList()
            val products = productDao.getAllProductsList()
            val customers = customerDao.getAllCustomersList()
            val payments = customerPaymentDao.getAllPaymentsList()
            val sales = saleDao.getAllSalesList()
            val saleItems = saleDao.getAllSaleItemsList()
            val purchases = purchaseDao.getAllPurchasesList()
            val transfers = stockTransferDao.getAllTransfersList()
            val users = userDao.getAllUsersDirect()
            val activeUsers = users.filter { it.isActive }
            var profile = shopProfileDao.getShopProfileDirect() ?: ShopProfile()

            val ownerUser = activeUsers.firstOrNull { it.role == UserRole.OWNER }
                ?: users.firstOrNull { it.role == UserRole.OWNER }
                ?: users.firstOrNull()
            val activeBranch = branches.firstOrNull { it.id == activeBranchId }
                ?: branches.firstOrNull { it.isMainBranch }
                ?: branches.firstOrNull()

            // The owner's primary-device row carries the canonical tenant username
            // on paired manager/cashier phones, which do not store the owner as a local user.
            val primaryDeviceForIdentity = database.shopDeviceDao().getAllDevicesList()
                .firstOrNull { it.isOwnerPrimary }
            val registeredOwner = ownerUser?.takeIf { it.role == UserRole.OWNER }
            val cloudOwnerUsername = registeredOwner?.username?.trim()?.lowercase()
                ?: primaryDeviceForIdentity?.assignedUsername?.trim()?.lowercase().orEmpty()
            val cloudOwnerPhone = registeredOwner?.phone?.ifBlank { profile.phone }?.trim() ?: profile.phone.trim()

            // Never create or sync the shared owner_000000000 fallback tenant when
            // Room is incomplete. Keep the existing owner key on paired devices.
            if (SupabaseAdminClient.isConfigured()) {
                val ownerPhoneDigits = cloudOwnerPhone.filter { it.isDigit() }.takeLast(9)
                if (cloudOwnerUsername.length < 2 ||
                    !cloudOwnerUsername.matches(Regex("[a-z0-9._-]{2,80}")) ||
                    ownerPhoneDigits.length != 9 || profile.shopName.isBlank()) {
                    val message = "Cloud sync paused: restore or complete the registered shop owner identity before syncing. Local data is kept on this device; no placeholder tenant was uploaded."
                    addAuditLog(
                        type = "BRANCH_AUTO_SYNC",
                        status = "FAILED",
                        summary = message,
                        latencyMs = System.currentTimeMillis() - startTime
                    )
                    return@withContext CloudSyncReport(
                        state = CloudSyncState.ERROR,
                        lastSyncTimestamp = profile.lastSyncedAt,
                        message = message,
                        branchesCount = branches.size,
                        productsCount = products.size,
                        salesCount = sales.size,
                        debtsCount = customers.count { it.debtBalance > 0 },
                        latencyMs = System.currentTimeMillis() - startTime
                    )
                }
            }

            val tombstones = database.syncTombstoneDao().getAllTombstonesList()

            val deadLetterDao = database.deadLetterDao()

            // Process due outbox items (and optionally requeue dead letters on manual sync)
            if (retryDeadLetters) {
                syncQueueDao.requeueDeadLetters(now)
                for (dl in deadLetterDao.getAllItemsList()) {
                    val existing = syncQueueDao.getSyncQueueItem(dl.originalItemId)
                    if (existing == null) {
                        syncQueueDao.enqueue(
                            com.beboss.shopmgmt.data.model.SyncQueueItem(
                                id = dl.originalItemId,
                                tableName = dl.tableName,
                                recordId = dl.originalItemId,
                                operation = dl.operation,
                                payloadJson = dl.payloadJson,
                                retryCount = 0,
                                status = "PENDING",
                                lastError = "",
                                nextAttemptAt = now,
                                createdAt = dl.createdAt
                            )
                        )
                    } else if (existing.status == "DEAD_LETTER") {
                        syncQueueDao.requeueItem(existing.id, now)
                    }
                    deadLetterDao.deleteById(dl.id)
                }
            }
            val dueQueueItems = syncQueueDao.getDueQueueItems(nowMs = now, limit = 250)

            val chunkedTokens = ShopDataTransferManager.exportChunkedTokens(
                profile = profile,
                users = users,
                products = products,
                customers = customers,
                sales = sales,
                saleItems = saleItems,
                payments = payments,
                exportedByUser = ownerUser,
                branches = branches,
                stockTransfers = transfers,
                purchases = purchases,
                sinceUpdatedAt = 0L, // Full authoritative state per snapshot slot so any branch joining cold catches up safely, while chunked <=250 rows/token
                maxRecordsPerChunk = 250,
                tombstones = tombstones
            )
            val payloadKb = chunkedTokens.sumOf { it.toByteArray(Charsets.UTF_8).size } / 1024.0
            val totalPushedCount = branches.size + users.size + products.size + customers.size +
                payments.size + sales.size + saleItems.size + purchases.size + transfers.size

            var itemsPulledCount = 0
            var conflictsResolvedCount = 0
            var supabaseSyncOk = false
            var customServerSyncOk = false

            // 1. Primary Cross-Branch Internet Sync via Supabase
            if (SupabaseAdminClient.isConfigured()) {
                val currentTerminal = database.shopDeviceDao().getByDeviceId(deviceId)
                val currentTerminalUser = currentTerminal?.let { userDao.getUserById(it.assignedUserId) }
                if (currentTerminal == null ||
                    !currentTerminal.isActive ||
                    currentTerminal.shopSyncKey.isBlank() ||
                    currentTerminalUser == null ||
                    !currentTerminalUser.isActive ||
                    currentTerminalUser.role.name != currentTerminal.role
                ) {
                    val message = "Cloud sync paused: this installation is not paired to an active shop user. Local records are preserved."
                    addAuditLog(
                        type = "BRANCH_AUTO_SYNC",
                        status = "FAILED",
                        summary = message,
                        latencyMs = System.currentTimeMillis() - startTime
                    )
                    return@withContext CloudSyncReport(
                        state = CloudSyncState.ERROR,
                        lastSyncTimestamp = profile.lastSyncedAt,
                        message = message,
                        branchesCount = branches.size,
                        productsCount = products.size,
                        salesCount = sales.size,
                        debtsCount = customers.count { it.debtBalance > 0 },
                        latencyMs = System.currentTimeMillis() - startTime
                    )
                }

                // Check if migration 0004 (chunk columns) has been applied
                val migrationApplied = SupabaseAdminClient.checkSnapshotMigrationApplied()
                if (!migrationApplied) {
                    Log.w(TAG, "Supabase migration 0004 not applied: branch_sync_snapshots missing sync_generation, chunk_index, chunk_count columns. Run migration in Supabase SQL Editor. Sync will use legacy format.")
                    addAuditLog(
                        type = "BRANCH_AUTO_SYNC",
                        status = "WARNING",
                        summary = "Supabase schema migration pending: missing chunk columns. Run: ALTER TABLE branch_sync_snapshots ADD COLUMN sync_generation text, ADD COLUMN chunk_index int, ADD COLUMN chunk_count int;",
                        latencyMs = 0
                    )
                }
                
                val ownerUsername = cloudOwnerUsername
                val ownerPhone = cloudOwnerPhone
                val shopSyncKey = primaryDeviceForIdentity?.shopSyncKey?.takeIf { it.isNotBlank() }
                    ?: SupabaseAdminClient.computeShopSyncKey(ownerUsername, ownerPhone)
                val recordsSummary = "${branches.size} branches • ${products.size} items • ${sales.size} sales • ${customers.size} clients (${chunkedTokens.size} chunk(s))"
                val syncGeneration = UUID.randomUUID().toString()

                val appCfg = SupabaseAdminClient.fetchPublicAppConfig()
                if (appCfg != null) {
                    OfflineSubscriptionManager.saveDynamicPaymentConfig(null, appCfg)
                    if (appCfg.adminWhatsAppNumber.isNotBlank() && appCfg.adminWhatsAppNumber != profile.adminWhatsAppNumber) {
                        profile = profile.copy(adminWhatsAppNumber = appCfg.adminWhatsAppNumber)
                        shopProfileDao.insertOrUpdateProfile(profile)
                    }
                }

                val remoteShop = SupabaseAdminClient.fetchShopAccountById(shopSyncKey)
                if (remoteShop != null) {
                    ClockGuard.observeTrustedEpoch(remoteShop.updatedAt)
                    // Ignore stale cloud license state from an older shop that happened
                    // to reuse the same owner identity. Joined devices set their baseline
                    // from the validated shop account during pairing.
                    val cloudUpdateBelongsToThisShop = remoteShop.updatedAt > profile.trialStartedAt
                    val isDirectUnlockUpdate = cloudUpdateBelongsToThisShop &&
                        remoteShop.autoUnlockedAt > profile.lastAppliedCloudUnlockAt &&
                        remoteShop.autoUnlockedAt >= profile.trialStartedAt &&
                        remoteShop.autoUnlockedAt <= ClockGuard.effectiveNowMs()
                    val isRemoteExtension = cloudUpdateBelongsToThisShop &&
                        remoteShop.subscriptionStatus == ShopProfile.STATUS_ACTIVE &&
                        remoteShop.subscriptionExpiresAt > profile.subscriptionExpiresAt + 60_000L
                    val isRemoteLock = cloudUpdateBelongsToThisShop &&
                        (remoteShop.subscriptionStatus == ShopProfile.STATUS_SUSPENDED ||
                            remoteShop.subscriptionStatus == ShopProfile.STATUS_EXPIRED) &&
                        remoteShop.updatedAt > profile.updatedAt &&
                        remoteShop.autoUnlockedAt <= profile.lastAppliedCloudUnlockAt

                    if (cloudUpdateBelongsToThisShop &&
                        (isDirectUnlockUpdate || isRemoteExtension || isRemoteLock || remoteShop.updatedAt > profile.updatedAt)
                    ) {
                        val updatedProf = profile.copy(
                            subscriptionStatus = if (isDirectUnlockUpdate || isRemoteExtension) ShopProfile.STATUS_ACTIVE else remoteShop.subscriptionStatus,
                            subscriptionExpiresAt = maxOf(profile.subscriptionExpiresAt, remoteShop.subscriptionExpiresAt).let {
                                if (isRemoteLock) remoteShop.subscriptionExpiresAt else it
                            },
                            deviceCountLimit = maxOf(profile.deviceCountLimit, remoteShop.deviceLimit),
                            adminWhatsAppNumber = remoteShop.adminWhatsApp.ifBlank { profile.adminWhatsAppNumber },
                            businessType = com.beboss.shopmgmt.util.BusinessCatalog.normalize(remoteShop.businessType),
                            autoUnlockedAt = maxOf(profile.autoUnlockedAt, remoteShop.autoUnlockedAt),
                            lastAppliedCloudUnlockAt = if (isDirectUnlockUpdate) remoteShop.autoUnlockedAt else profile.lastAppliedCloudUnlockAt,
                            lastPaymentRef = if (isDirectUnlockUpdate) "ADMIN-DIRECT-UNLOCK" else profile.lastPaymentRef,
                            updatedAt = maxOf(profile.updatedAt, remoteShop.updatedAt)
                        )
                        shopProfileDao.insertOrUpdateProfile(updatedProf)
                        profile = updatedProf
                        itemsPulledCount++
                    }
                }

                val shopDeviceDao = database.shopDeviceDao()
                val remoteDevices = SupabaseAdminClient.fetchShopDevicesForShop(shopSyncKey)
                val remoteDeviceIds = remoteDevices.map { it.id }.toSet()
                for (rd in remoteDevices) {
                    val localDev = shopDeviceDao.getDeviceById(rd.id)
                    if (localDev == null || rd.updatedAt > localDev.updatedAt) {
                        shopDeviceDao.insertOrUpdate(
                            com.beboss.shopmgmt.data.model.ShopDevice(
                                id = rd.id,
                                shopSyncKey = rd.shopSyncKey,
                                deviceId = rd.deviceId,
                                deviceName = rd.deviceName,
                                // Pending invitation text is local-only; Supabase stores only its hash.
                                joinCode = if (rd.deviceId.isBlank()) localDev?.joinCode.orEmpty() else "",
                                assignedUserId = rd.assignedUserId,
                                assignedUsername = rd.assignedUsername,
                                assignedUserName = rd.assignedUserName,
                                role = rd.role,
                                branchId = rd.branchId,
                                branchName = rd.branchName,
                                isOwnerPrimary = rd.isOwnerPrimary,
                                isActive = rd.isActive,
                                monthlyFeeAddonRwf = rd.monthlyFeeAddonRwf,
                                lastSyncedAt = rd.lastSyncedAt,
                                syncedToSupabase = true,
                                createdAt = rd.createdAt,
                                updatedAt = rd.updatedAt
                            )
                        )
                        itemsPulledCount++
                    }
                }
                val localDevices = shopDeviceDao.getAllDevicesList()
                val activeDeviceCount = localDevices.count { it.isActive }.coerceAtLeast(1)
                // Every registered shop has a primary device row. Empty local registry
                // must not be treated as a successful upload.
                var allDevicesUploaded = localDevices.isNotEmpty()
                for (ld in localDevices) {
                    // Recreate a missing cloud registry row after server-side deletion or
                    // an interrupted restore, even when Room previously marked it synced.
                    if (!ld.syncedToSupabase || ld.deviceId == deviceId || ld.id !in remoteDeviceIds) {
                        val toPush = if (ld.deviceId == deviceId) ld.copy(lastSyncedAt = now, syncedToSupabase = true) else ld.copy(syncedToSupabase = true)
                        if (SupabaseAdminClient.upsertShopDevice(shopSyncKey, profile.shopName, toPush)) {
                            shopDeviceDao.insertOrUpdate(toPush)
                        } else {
                            allDevicesUploaded = false
                        }
                    }
                }

                val remoteUsers = SupabaseAdminClient.fetchShopUsersForShop(shopSyncKey)
                for (ru in remoteUsers) {
                    val localUser = userDao.getUserById(ru.userId) ?: continue
                    if (ru.updatedAt > localUser.updatedAt) {
                        val parsedRole = try { UserRole.valueOf(ru.role) } catch (_: Exception) { localUser.role }
                        val roleTemplate = User.defaultForRole(
                            name = localUser.name,
                            username = localUser.username,
                            role = parsedRole,
                            pin = localUser.pinHash,
                            phone = localUser.phone
                        )
                        val updatedLocal = if (parsedRole != localUser.role) {
                            roleTemplate.copy(
                                id = localUser.id,
                                email = localUser.email,
                                password = localUser.password,
                                assignedBranchId = ru.assignedBranchId.ifBlank { localUser.assignedBranchId },
                                assignedBranchName = ru.assignedBranchName.ifBlank { localUser.assignedBranchName },
                                isActive = ru.isActive,
                                lastLoginAt = localUser.lastLoginAt,
                                createdAt = localUser.createdAt,
                                updatedAt = ru.updatedAt
                            )
                        } else {
                            localUser.copy(
                                isActive = ru.isActive,
                                assignedBranchId = ru.assignedBranchId.ifBlank { localUser.assignedBranchId },
                                assignedBranchName = ru.assignedBranchName.ifBlank { localUser.assignedBranchName },
                                updatedAt = ru.updatedAt
                            )
                        }
                        userDao.updateUser(updatedLocal)
                        itemsPulledCount++
                    }
                }

                val latestUsers = userDao.getAllUsersDirect()
                var allChunksUploaded = chunkedTokens.isNotEmpty()
                chunkedTokens.forEachIndexed { chunkIdx, token ->
                    val chunkDeviceId = if (chunkIdx == 0) deviceId else "${deviceId}#c$chunkIdx"
                    val ok = retryWithBackoff(maxAttempts = 3) {
                        SupabaseAdminClient.upsertBranchSyncSnapshot(
                            shopSyncKey = shopSyncKey,
                            deviceId = chunkDeviceId,
                            syncGeneration = syncGeneration,
                            chunkIndex = chunkIdx,
                            chunkCount = chunkedTokens.size,
                            branchId = activeBranch?.id ?: activeBranchId,
                            branchName = activeBranch?.name ?: "Main Store",
                            shopName = profile.shopName,
                            ownerUsername = ownerUsername,
                            payloadToken = token,
                            recordsSummary = recordsSummary
                        )
                    }
                    if (!ok) allChunksUploaded = false
                }

                val accountUploaded = SupabaseAdminClient.upsertShopAccount(
                    shopProfile = profile,
                    ownerUser = registeredOwner,
                    branchCount = branches.size,
                    workerCount = latestUsers.count { it.isActive }.coerceAtLeast(1),
                    deviceCount = activeDeviceCount,
                    shopSyncKeyOverride = shopSyncKey,
                    shopOwnerUsernameOverride = ownerUsername
                )
                val usersUploaded = latestUsers.isNotEmpty() &&
                    SupabaseAdminClient.upsertShopUsers(
                        shopSyncKey = shopSyncKey,
                        shopName = profile.shopName,
                        users = latestUsers
                    )

                val peerSnapshots = try {
                    SupabaseAdminClient.latestCompleteSnapshotChunks(
                        SupabaseAdminClient.fetchShopBranchSnapshots(
                            shopSyncKey = shopSyncKey,
                            excludingDeviceId = deviceId
                        )
                    )
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to fetch cloud branch snapshots: ${e.safeMessage("Snapshot fetch failed")}")
                    emptyList()
                }

                for (snap in peerSnapshots) {
                    try {
                        val decoded = ShopDataTransferManager.parseShopPackageString(snap.payloadToken)
                        val mergeRes = mergeRemoteSummary?.invoke(decoded)
                            ?: ConflictResolutionEngine.mergePackage(database, decoded, "CLOUD:${snap.deviceId}")
                        itemsPulledCount += mergeRes.totalMergedCount
                        conflictsResolvedCount += mergeRes.conflictsResolved
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Log.w(TAG, "Skipped corrupt branch snapshot ${snap.id}: ${e.safeMessage("Corrupt snapshot")}")
                    }
                }

                // Pull + HLC-merge branches/transfers edited from the web owner portal.
                // Merge happens BEFORE we push back, so web edits (newer HLC) win over
                // stale phone state instead of being clobbered by the phone's push.
                val remoteBranches = SupabaseAdminClient.fetchShopBranches(shopSyncKey)
                val remoteTransfers = SupabaseAdminClient.fetchShopStockTransfers(shopSyncKey)
                if (remoteBranches.isNotEmpty() || remoteTransfers.isNotEmpty()) {
                    try {
                        val cloudBranches = remoteBranches.map { dto ->
                            com.beboss.shopmgmt.data.model.Branch(
                                id = dto.id,
                                name = dto.name,
                                code = dto.code,
                                address = dto.address,
                                phone = dto.phone,
                                managerUserId = dto.managerUserId,
                                managerName = dto.managerName,
                                isMainBranch = dto.isMainBranch,
                                isActive = dto.isActive,
                                colorHex = dto.colorHex,
                                dailySalesTargetRwf = dto.dailySalesTargetRwf,
                                monthlyTargetRwf = dto.monthlyTargetRwf,
                                openingCashFloat = dto.openingCashFloat,
                                stockValueRwf = dto.stockValueRwf,
                                productCount = dto.productCount,
                                operationalStatus = dto.operationalStatus,
                                email = dto.email,
                                notes = dto.notes,
                                createdAt = dto.createdAt,
                                updatedAt = dto.updatedAt,
                                syncVersion = dto.syncVersion,
                                hlcTimestamp = dto.hlcTimestamp,
                                lastModifiedDeviceId = dto.lastModifiedDeviceId
                            )
                        }
                        val cloudTransfers = remoteTransfers.map { dto ->
                            com.beboss.shopmgmt.data.model.StockTransfer(
                                id = dto.id,
                                transferNumber = dto.transferNumber,
                                productId = dto.productId,
                                productName = dto.productName,
                                fromBranchId = dto.fromBranchId,
                                fromBranchName = dto.fromBranchName,
                                toBranchId = dto.toBranchId,
                                toBranchName = dto.toBranchName,
                                quantity = dto.quantity,
                                unit = dto.unit,
                                costValueRwf = dto.costValueRwf,
                                transferDate = dto.transferDate,
                                status = dto.status,
                                notes = dto.notes,
                                transferredBy = dto.transferredBy,
                                receivedBy = dto.receivedBy,
                                receivedAt = dto.receivedAt,
                                synced = dto.synced,
                                createdAt = dto.createdAt,
                                updatedAt = dto.updatedAt,
                                hlcTimestamp = dto.hlcTimestamp,
                                lastModifiedDeviceId = dto.lastModifiedDeviceId
                            )
                        }
                        val summary = ShopImportSummary(
                            shopName = profile.shopName,
                            exportedAt = now,
                            exportedBy = ownerUsername,
                            userCount = users.size,
                            productCount = products.size,
                            customerCount = customers.size,
                            saleCount = sales.size,
                            paymentCount = payments.size,
                            users = users,
                            products = products,
                            customers = customers,
                            sales = sales,
                            saleItems = saleItems,
                            payments = payments,
                            shopProfile = null,
                            branches = cloudBranches,
                            stockTransfers = cloudTransfers,
                            purchases = purchases,
                            tombstones = tombstones
                        )
                        val mergeRes = ConflictResolutionEngine.mergePackage(database, summary, "CLOUD_BRANCHES")
                        itemsPulledCount += mergeRes.totalMergedCount
                        conflictsResolvedCount += mergeRes.conflictsResolved
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to merge cloud branches/transfers: ${e.safeMessage("Merge failed")}")
                    }
                }

                // Re-read merged state and push back to the normalized cloud tables.
                // HLC timestamps are preserved through the merge, so this is idempotent
                // and converges with the web (no overwrite of web edits).
                val mergedBranches = branchDao.getAllActiveBranchesList()
                val mergedTransfers = stockTransferDao.getAllTransfersList()
                val branchesUploaded = retryWithBackoff(maxAttempts = 3) {
                    SupabaseAdminClient.upsertShopBranches(
                        shopSyncKey = shopSyncKey,
                        shopName = profile.shopName,
                        branches = mergedBranches
                    )
                }
                if (!branchesUploaded) allChunksUploaded = false
                val transfersUploaded = retryWithBackoff(maxAttempts = 3) {
                    SupabaseAdminClient.upsertShopStockTransfers(
                        shopSyncKey = shopSyncKey,
                        shopName = profile.shopName,
                        transfers = mergedTransfers
                    )
                }
                if (!transfersUploaded) allChunksUploaded = false
                supabaseSyncOk = allChunksUploaded && accountUploaded && usersUploaded && allDevicesUploaded

                // Message dispatches are acknowledged only after the telemetry upsert succeeds.
                // DeviceTelemetryUploader uploads privacy-safe aggregates and marks only the IDs
                // included in the successful request; a separate successful shop-table upload
                // must never clear pending message telemetry.
                if (supabaseSyncOk && context != null) {
                    val telemetryUploaded = DeviceTelemetryUploader.upload(
                        context = context,
                        database = database,
                        profile = profile,
                        deviceId = deviceId
                    )
                    if (!telemetryUploaded) {
                        Log.w(TAG, "Device telemetry failed; pending message audit records will retry on the next sync.")
                    }
                }
            }

            // 2. Optional Custom Business Relay Server
            val endpoint = serverEndpoint ?: profile.backendServerUrl
            val hasCustomEndpoint = !endpoint.isNullOrBlank() &&
                endpoint != "https://api.beboss.app/v1" &&
                isSafeEndpointUrl(endpoint)

            if (hasCustomEndpoint) {
                val cleanEp = endpoint?.trim()?.removeSuffix("/").orEmpty()
                val exportJson = ShopDataTransferManager.createExportJson(
                    profile = profile,
                    users = users,
                    products = products,
                    customers = customers,
                    sales = sales,
                    saleItems = saleItems,
                    payments = payments,
                    exportedByUser = ownerUser,
                    branches = branches,
                    stockTransfers = transfers,
                    purchases = purchases,
                    tombstones = tombstones
                )
                val payloadBytes = exportJson.toString().toByteArray(Charsets.UTF_8)
                val hmacKey = SubscriptionSecurityManager.getOrCreateIsolatedHmacKey(profile)
                val mac = Mac.getInstance("HmacSHA256").apply { init(hmacKey) }
                val hmacSignature = SecurityUtils.bytesToHex(mac.doFinal(payloadBytes))

                for (attempt in 1..3) {
                    try {
                        val url = URL("$cleanEp/sync/cloud-push")
                        val conn = (url.openConnection() as HttpURLConnection).apply {
                            requestMethod = "POST"
                            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                            setRequestProperty("X-Shop-Id", profile.id.toString())
                            setRequestProperty("X-Shop-Device", SubscriptionSecurityManager.computeDeviceChallenge(profile))
                            setRequestProperty("X-Shop-Signature", hmacSignature)
                            doOutput = true
                            connectTimeout = 8000
                            readTimeout = 10000
                        }
                        conn.outputStream.use { os -> os.write(payloadBytes, 0, payloadBytes.size) }
                        val respCode = conn.responseCode
                        if (respCode in 200..299) {
                            customServerSyncOk = true
                            val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                            if (responseText.isNotBlank()) {
                                val respJson = JSONObject(responseText)
                                if (respJson.has("remoteProducts")) {
                                    val rProducts = respJson.getJSONArray("remoteProducts")
                                    for (i in 0 until rProducts.length()) {
                                        val rp = rProducts.getJSONObject(i)
                                        val pId = rp.optCleanString("id", "").ifBlank { UUID.randomUUID().toString() }
                                        val remoteUpdated = rp.optLong("updatedAt", 0L)
                                        val existingProd = productDao.getProductById(pId)
                                        if (existingProd == null || remoteUpdated > existingProd.updatedAt) {
                                            productDao.insertProduct(
                                                Product(
                                                    id = pId,
                                                    name = rp.optCleanString("name", "Product"),
                                                    category = rp.optCleanString("category", "General"),
                                                    costPrice = rp.optDouble("costPrice", 0.0).coerceAtLeast(0.0),
                                                    sellingPrice = rp.optDouble("sellingPrice", 0.0).coerceAtLeast(0.0),
                                                    quantityInStock = rp.optDouble("quantityInStock", 0.0).coerceAtLeast(0.0),
                                                    unit = rp.optCleanString("unit", "pcs"),
                                                    barcode = rp.optCleanString("barcode", ""),
                                                    branchId = rp.optCleanString("branchId", "main_branch").ifBlank { "main_branch" },
                                                    updatedAt = remoteUpdated
                                                )
                                            )
                                            itemsPulledCount++
                                            if (existingProd != null) conflictsResolvedCount++
                                        }
                                    }
                                }
                            }
                            break
                        } else if (respCode in 500..599) {
                            delay(400L * (1 shl (attempt - 1)) + Random.nextLong(50, 250))
                        } else {
                            break
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Log.w(TAG, "Custom server sync attempt $attempt failed: ${e.safeMessage("Connection failed")}")
                        if (attempt < 3) {
                            delay(400L * (1 shl (attempt - 1)) + Random.nextLong(50, 250))
                        }
                    }
                }
            }

            if (!SupabaseAdminClient.isConfigured() && !hasCustomEndpoint) {
                val latency = System.currentTimeMillis() - startTime
                addAuditLog(
                    type = "BRANCH_AUTO_SYNC",
                    status = "OFFLINE",
                    summary = "Offline mode: Supabase secrets not configured; data persisted in encrypted SQLite.",
                    latencyMs = latency,
                    payloadSizeKb = payloadKb
                )
                return@withContext CloudSyncReport(
                    state = CloudSyncState.OFFLINE,
                    itemsPushed = 0,
                    itemsPulled = 0,
                    lastSyncTimestamp = profile.lastSyncedAt,
                    message = "Saved on this device only. Configure the cloud sync endpoint to upload data automatically.",
                    branchesCount = branches.size,
                    productsCount = products.size,
                    salesCount = sales.size,
                    debtsCount = customers.count { it.debtBalance > 0 },
                    latencyMs = latency
                )
            }

            val anyCloudSuccess = if (SupabaseAdminClient.isConfigured()) supabaseSyncOk else customServerSyncOk
            if (!anyCloudSuccess) {
                // Record exponential backoff on queued outbox items
                for (qItem in dueQueueItems) {
                    val nextRetry = qItem.retryCount + 1
                    val isDead = nextRetry >= MAX_QUEUE_RETRIES
                    val backoffMs = min(3_600_000L, 5_000L * (1L shl nextRetry.coerceAtMost(8))) + Random.nextLong(200, 1000)
                    val errText = "Cloud unreachable on attempt #$nextRetry"
                    syncQueueDao.recordAttemptFailure(
                        id = qItem.id,
                        retryCount = nextRetry,
                        nextAttemptAt = now + backoffMs,
                        lastError = errText,
                        status = if (isDead) "DEAD_LETTER" else "PENDING"
                    )
                    if (isDead) {
                        val existingDl = deadLetterDao.getByOriginalItemId(qItem.id)
                        deadLetterDao.insert(
                            com.beboss.shopmgmt.data.model.DeadLetterItem(
                                id = existingDl?.id ?: java.util.UUID.randomUUID().toString(),
                                originalItemId = qItem.id,
                                tableName = qItem.tableName,
                                operation = qItem.operation,
                                payloadJson = qItem.payloadJson,
                                failureReason = errText,
                                failureCount = nextRetry,
                                createdAt = qItem.createdAt
                            )
                        )
                    }
                }

                val latency = System.currentTimeMillis() - startTime
                addAuditLog(
                    type = "BRANCH_AUTO_SYNC",
                    status = "FAILED",
                    summary = "Outbox retry scheduled with backoff (${dueQueueItems.size} item(s)).",
                    latencyMs = latency
                )
                return@withContext CloudSyncReport(
                    state = CloudSyncState.ERROR,
                    itemsPushed = 0,
                    itemsPulled = 0,
                    lastSyncTimestamp = profile.lastSyncedAt,
                    message = "Branch sync retry scheduled with exponential backoff.",
                    branchesCount = branches.size,
                    productsCount = products.size,
                    salesCount = sales.size,
                    debtsCount = customers.count { it.debtBalance > 0 },
                    latencyMs = latency
                )
            }

            if (dueQueueItems.isNotEmpty()) {
                syncQueueDao.markAllSynced(dueQueueItems.map { it.id }, now)
                for (syncedItem in dueQueueItems) {
                    deadLetterDao.getByOriginalItemId(syncedItem.id)?.let { deadLetterDao.delete(it) }
                }
            }
            val unsyncedSales = saleDao.getUnsyncedSales()
            for (s in unsyncedSales) {
                saleDao.markSaleSynced(s.id, now)
            }

            shopProfileDao.updateLastSyncedAt(now)
            val latency = System.currentTimeMillis() - startTime

            val summaryText = "Branch Sync: pushed $totalPushedCount records (${"%.1f".format(payloadKb)} KB in ${chunkedTokens.size} chunk(s)), merged $itemsPulledCount updates, resolved $conflictsResolvedCount conflicts"
            addAuditLog(
                type = "BRANCH_AUTO_SYNC",
                status = "SUCCESS",
                summary = summaryText,
                latencyMs = latency,
                payloadSizeKb = payloadKb
            )

            CloudSyncReport(
                state = CloudSyncState.SYNCED,
                itemsPushed = totalPushedCount,
                itemsPulled = itemsPulledCount,
                lastSyncTimestamp = now,
                message = summaryText,
                branchesCount = branches.size,
                productsCount = products.size,
                salesCount = sales.size,
                debtsCount = customers.count { it.debtBalance > 0 },
                conflictsResolved = conflictsResolvedCount,
                latencyMs = latency
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val latency = System.currentTimeMillis() - startTime
            val errMsg = e.safeMessage("Could not complete cloud sync")
            Log.e(TAG, "Cloud branch sync failed: $errMsg", e)
            addAuditLog(
                type = "BRANCH_AUTO_SYNC",
                status = "FAILED",
                summary = "Error: $errMsg",
                latencyMs = latency
            )
            CloudSyncReport(
                state = CloudSyncState.ERROR,
                message = "Branch sync error: $errMsg",
                latencyMs = latency
            )
        }
        }
    }

    private suspend fun retryWithBackoff(
        maxAttempts: Int = 3,
        block: suspend () -> Boolean
    ): Boolean {
        for (attempt in 1..maxAttempts) {
            if (block()) return true
            if (attempt < maxAttempts) {
                val jitter = Random.nextLong(80L, 250L)
                delay(350L * (1 shl (attempt - 1)) + jitter)
            }
        }
        return false
    }

    /**
     * Moves a sync queue item to the dead-letter queue with failure reason.
     * Used when an item has exhausted all retry attempts.
     */
    suspend fun moveToDeadLetter(itemId: String, reason: String) {
        val syncQueueDao = database.syncQueueDao()
        val deadLetterDao = database.deadLetterDao()

        syncQueueDao.getSyncQueueItem(itemId)?.let { item ->
            syncQueueDao.deleteSyncQueueItem(itemId)

            deadLetterDao.insert(
                com.beboss.shopmgmt.data.model.DeadLetterItem(
                    originalItemId = item.id,
                    tableName = item.tableName,
                    operation = item.operation,
                    payloadJson = item.payloadJson,
                    failureReason = reason,
                    failureCount = item.retryCount + 1
                )
            )

            addAuditLog(
                type = "DEAD_LETTER",
                status = "RECORD_MOVED",
                summary = "Moved sync item to dead-letter queue: ${item.tableName}/${item.recordId} - $reason"
            )
        }
    }

    suspend fun requeueSingleDeadLetter(idOrOriginalId: String) {
        val syncQueueDao = database.syncQueueDao()
        val deadLetterDao = database.deadLetterDao()
        val now = System.currentTimeMillis()
        syncQueueDao.requeueItem(idOrOriginalId, now)
        val dlItem = deadLetterDao.getAllItemsList().firstOrNull {
            it.id == idOrOriginalId || it.originalItemId == idOrOriginalId
        }
        if (dlItem != null) {
            if (syncQueueDao.getSyncQueueItem(dlItem.originalItemId) == null) {
                syncQueueDao.enqueue(
                    com.beboss.shopmgmt.data.model.SyncQueueItem(
                        id = dlItem.originalItemId,
                        tableName = dlItem.tableName,
                        recordId = dlItem.originalItemId,
                        operation = dlItem.operation,
                        payloadJson = dlItem.payloadJson,
                        retryCount = 0,
                        status = "PENDING",
                        lastError = "",
                        nextAttemptAt = now,
                        createdAt = dlItem.createdAt
                    )
                )
            } else {
                syncQueueDao.requeueItem(dlItem.originalItemId, now)
            }
            deadLetterDao.delete(dlItem)
        }
    }

    suspend fun discardDeadLetter(idOrOriginalId: String) {
        val syncQueueDao = database.syncQueueDao()
        val deadLetterDao = database.deadLetterDao()
        syncQueueDao.deleteSyncQueueItem(idOrOriginalId)
        val dlItem = deadLetterDao.getAllItemsList().firstOrNull {
            it.id == idOrOriginalId || it.originalItemId == idOrOriginalId
        }
        if (dlItem != null) {
            syncQueueDao.deleteSyncQueueItem(dlItem.originalItemId)
            deadLetterDao.delete(dlItem)
        }
    }

    /**
     * Sync with exponential backoff retry logic.
     * Attempts to sync up to maxRetries times with increasing delays.
     */
    suspend fun syncWithRetry(maxRetries: Int = 5): Boolean {
        var delay = 1000L
        repeat(maxRetries) { attempt ->
            try {
                val report = syncAllDataToCloud()
                return report.state == CloudSyncState.SYNCED
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (attempt < maxRetries - 1) {
                    kotlinx.coroutines.delay(delay)
                    delay = (delay * 1.5).toLong().coerceAtMost(60_000L)
                }
                BeBossLogger.w(TAG, "Sync attempt ${attempt + 1} failed, retrying in ${delay}ms", e)
            }
        }
        return false
    }

    companion object {
        private val syncMutex = Mutex()
    }
}
