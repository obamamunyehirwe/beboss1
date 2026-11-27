package com.beboss.shopmgmt.ui.viewmodel.coordinators

import android.content.Context
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.PaymentVerificationRequest
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import com.beboss.shopmgmt.data.repository.BeBossRepository
import com.beboss.shopmgmt.util.AdminPaymentConfig
import com.beboss.shopmgmt.util.BeBossNotificationManager
import com.beboss.shopmgmt.util.CloudHealthDiagnosticsDto
import com.beboss.shopmgmt.util.CloudSyncScheduler
import com.beboss.shopmgmt.util.ExcelCsvExporter
import com.beboss.shopmgmt.util.OfflineSubscriptionManager
import com.beboss.shopmgmt.util.PaymentProcessingResult
import com.beboss.shopmgmt.util.PdfReportGenerator
import com.beboss.shopmgmt.util.ShopDataTransferManager
import com.beboss.shopmgmt.util.SubscriptionPriceBreakdown
import com.beboss.shopmgmt.util.SubscriptionSecurityManager
import com.beboss.shopmgmt.util.SupabaseAdminClient
import com.beboss.shopmgmt.util.SupabaseAdminSession
import com.beboss.shopmgmt.util.SupabaseAuditLogDto
import com.beboss.shopmgmt.util.SupabaseBranchSnapshotDto
import com.beboss.shopmgmt.util.SupabaseCloudSyncEventDto
import com.beboss.shopmgmt.util.SupabaseDeviceTelemetryDto
import com.beboss.shopmgmt.util.SupabasePaymentRequestDto
import com.beboss.shopmgmt.util.SupabaseShopAccountDto
import com.beboss.shopmgmt.util.SupabaseShopDeviceDto
import com.beboss.shopmgmt.util.SupabaseShopUserDto
import com.beboss.shopmgmt.util.SupabaseUnlockCodeDto
import com.beboss.shopmgmt.util.safeMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AdminConsoleCoordinator(
    private val application: android.app.Application,
    private val repository: BeBossRepository,
    private val scope: CoroutineScope,
    private val currentUser: StateFlow<User?>,
    private val allUsers: StateFlow<List<User>>,
    private val branches: StateFlow<List<Branch>>,
    private val shopProfile: StateFlow<ShopProfile>,
    private val emitSnackbar: suspend (String) -> Unit,
    private val triggerCloudSync: () -> Unit,
    private val runWithBlurLoading: (title: String, subtitle: String, block: suspend () -> Unit) -> Unit = { _, _, block ->
        scope.launch { block() }
    }
) {
    private val _adminSession = MutableStateFlow<SupabaseAdminSession?>(
        SupabaseAdminClient.getCurrentAdminSession()
    )
    val adminSession: StateFlow<SupabaseAdminSession?> = _adminSession.asStateFlow()

    private val _adminAuthError = MutableStateFlow<String?>(null)
    val adminAuthError: StateFlow<String?> = _adminAuthError.asStateFlow()

    private val _isAdminAuthenticating = MutableStateFlow(false)
    val isAdminAuthenticating: StateFlow<Boolean> = _isAdminAuthenticating.asStateFlow()

    private val _adminPaymentRequests = MutableStateFlow<List<SupabasePaymentRequestDto>>(emptyList())
    val adminPaymentRequests: StateFlow<List<SupabasePaymentRequestDto>> = _adminPaymentRequests.asStateFlow()

    private val _adminShopAccounts = MutableStateFlow<List<SupabaseShopAccountDto>>(emptyList())
    val adminShopAccounts: StateFlow<List<SupabaseShopAccountDto>> = _adminShopAccounts.asStateFlow()

    private val _adminShopUsers = MutableStateFlow<List<SupabaseShopUserDto>>(emptyList())
    val adminShopUsers: StateFlow<List<SupabaseShopUserDto>> = _adminShopUsers.asStateFlow()

    private val _adminShopDevices = MutableStateFlow<List<SupabaseShopDeviceDto>>(emptyList())
    val adminShopDevices: StateFlow<List<SupabaseShopDeviceDto>> = _adminShopDevices.asStateFlow()

    private val _adminBranchSnapshots = MutableStateFlow<List<SupabaseBranchSnapshotDto>>(emptyList())
    val adminBranchSnapshots: StateFlow<List<SupabaseBranchSnapshotDto>> = _adminBranchSnapshots.asStateFlow()

    private val _adminUnlockCodes = MutableStateFlow<List<SupabaseUnlockCodeDto>>(emptyList())
    val adminUnlockCodes: StateFlow<List<SupabaseUnlockCodeDto>> = _adminUnlockCodes.asStateFlow()

    private val _adminAuditLogs = MutableStateFlow<List<SupabaseAuditLogDto>>(emptyList())
    val adminAuditLogs: StateFlow<List<SupabaseAuditLogDto>> = _adminAuditLogs.asStateFlow()

    private val _adminDeviceTelemetry = MutableStateFlow<List<SupabaseDeviceTelemetryDto>>(emptyList())
    val adminDeviceTelemetry: StateFlow<List<SupabaseDeviceTelemetryDto>> = _adminDeviceTelemetry.asStateFlow()

    private val _adminCloudActivity = MutableStateFlow<List<SupabaseCloudSyncEventDto>>(emptyList())
    val adminCloudActivity: StateFlow<List<SupabaseCloudSyncEventDto>> = _adminCloudActivity.asStateFlow()

    private val _adminCloudHealth = MutableStateFlow<CloudHealthDiagnosticsDto?>(null)
    val adminCloudHealth: StateFlow<CloudHealthDiagnosticsDto?> = _adminCloudHealth.asStateFlow()

    private val _adminPaymentConfig = MutableStateFlow(
        OfflineSubscriptionManager.getCurrentPaymentConfig()
    )
    val adminPaymentConfig: StateFlow<AdminPaymentConfig> = _adminPaymentConfig.asStateFlow()

    private val _isAdminLoading = MutableStateFlow(false)
    val isAdminLoading: StateFlow<Boolean> = _isAdminLoading.asStateFlow()

    private val _adminLastSyncedAt = MutableStateFlow(0L)
    val adminLastSyncedAt: StateFlow<Long> = _adminLastSyncedAt.asStateFlow()

    private fun resolveOwnerUser(): User? {
        return allUsers.value.firstOrNull { it.role == UserRole.OWNER }
            ?: currentUser.value
            ?: allUsers.value.firstOrNull()
    }

    fun signInSupabaseAdmin(email: String, password: String) {
        runWithBlurLoading("Admin Sign-In", "Authenticating Master Admin...") {
            _isAdminAuthenticating.value = true
            _adminAuthError.value = null
            try {
                val res = SupabaseAdminClient.signInAdmin(email, password)
                res.onSuccess { sess ->
                    _adminSession.value = sess
                    repository.recordLocalAudit(
                        actorName = sess.fullName,
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_SIGN_IN",
                        targetId = sess.email,
                        details = "Signed in to Master Admin Console"
                    )
                    refreshAdminDashboardData()
                    emitSnackbar("Authenticated as Master Admin (${sess.email})")
                }.onFailure { err ->
                    _adminAuthError.value = err.safeMessage("Admin sign-in failed")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _adminAuthError.value = e.safeMessage("Admin sign-in failed")
            } finally {
                _isAdminAuthenticating.value = false
            }
        }
    }

    fun signUpSupabaseAdmin(email: String, password: String, fullName: String) {
        runWithBlurLoading("Admin Setup", "Initializing Master Admin profile...") {
            _isAdminAuthenticating.value = true
            _adminAuthError.value = null
            try {
                val res = SupabaseAdminClient.signUpAdmin(email, password, fullName)
                res.onSuccess { sess ->
                    _adminSession.value = sess
                    repository.recordLocalAudit(
                        actorName = sess.fullName,
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_INITIALIZED",
                        targetId = sess.email,
                        details = "Initialized Master Admin account"
                    )
                    refreshAdminDashboardData()
                    emitSnackbar("Master Admin profile initialized (${sess.email})")
                }.onFailure { err ->
                    _adminAuthError.value = err.safeMessage("Admin initialization failed")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _adminAuthError.value = e.safeMessage("Admin initialization failed")
            } finally {
                _isAdminAuthenticating.value = false
            }
        }
    }

    fun signOutSupabaseAdmin() {
        scope.launch {
            val prev = _adminSession.value
            SupabaseAdminClient.signOutAdmin()
            _adminSession.value = null
            _adminPaymentRequests.value = emptyList()
            _adminShopAccounts.value = emptyList()
            _adminShopUsers.value = emptyList()
            _adminShopDevices.value = emptyList()
            _adminBranchSnapshots.value = emptyList()
            _adminUnlockCodes.value = emptyList()
            _adminAuditLogs.value = emptyList()
            _adminDeviceTelemetry.value = emptyList()
            _adminCloudActivity.value = emptyList()
            _adminCloudHealth.value = null
            _adminAuthError.value = null
            if (prev != null) {
                repository.recordLocalAudit(
                    actorName = prev.fullName,
                    actorRole = "MASTER_ADMIN",
                    action = "ADMIN_SIGN_OUT",
                    targetId = prev.email,
                    details = "Signed out from Master Admin Console"
                )
            }
        }
    }

    fun activateSubscriptionVoucher(code: String) {
        runWithBlurLoading("Activating License", "Verifying cryptographic BB3 voucher...") {
            val currentProf = shopProfile.value
            val owner = resolveOwnerUser()
            val branchCount = branches.value.size.coerceAtLeast(1)
            val workerCount = allUsers.value.size.coerceAtLeast(1)
            val result = repository.redeemVoucher(
                voucherCode = code,
                shopProfile = currentProf,
                branchCount = branchCount,
                workerCount = workerCount,
                ownerUsername = owner?.username.orEmpty(),
                ownerPhoneOverride = owner?.phone.orEmpty(),
                ownerUser = owner
            )
            repository.recordLocalAudit(
                actorName = owner?.name ?: "Shop Owner",
                actorRole = owner?.role?.name ?: "OWNER",
                action = if (result.isValid) "VOUCHER_ACTIVATED" else "VOUCHER_REJECTED",
                targetId = code.trim().take(24),
                details = result.message
            )
            emitSnackbar(result.message)
            if (result.isValid) {
                syncAdminDataToSupabaseSuspended(silent = true)
            }
        }
    }

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
    ) {
        runWithBlurLoading("Submitting Payment", "Syncing verification claim to Admin Cloud...") {
            val profile = shopProfile.value
            val owner = resolveOwnerUser()
            val safeDevices = deviceCount.coerceAtLeast(1)
            val feePerDeviceRwf = OfflineSubscriptionManager.PER_EXTRA_DEVICE_FEE_RWF
            val paymentTimeMs = System.currentTimeMillis()
            val breakdown = OfflineSubscriptionManager.calculateSubscriptionPrice(
                branchCount = branchCount,
                workerCount = workerCount,
                durationMonths = durationMonths,
                deviceCount = safeDevices,
                perDeviceRateRwf = feePerDeviceRwf
            )
            val ussd = if (provider.contains("AIRTEL", ignoreCase = true)) breakdown.ussdAirtelCode else breakdown.ussdMtnCode
            val cleanUsername = username.trim().lowercase().ifBlank { owner?.username ?: "owner" }
            val cleanRegPhone = registeredPhone.trim().ifBlank { profile.phone }
            val req = PaymentVerificationRequest(
                shopName = profile.shopName,
                ownerUsername = cleanUsername,
                ownerPhone = cleanRegPhone,
                deviceChallenge = SubscriptionSecurityManager.computeDeviceChallenge(profile),
                provider = provider,
                ussdCode = ussd,
                payerPhone = payerPhone.trim().ifBlank { cleanRegPhone },
                payerFullName = payerFullName.trim(),
                amountRwf = breakdown.totalPayable,
                durationMonths = durationMonths,
                branchCount = branchCount.coerceAtLeast(1),
                workerCount = workerCount.coerceAtLeast(1),
                deviceCount = safeDevices,
                paymentTimeMs = paymentTimeMs,
                paymentNote = paymentNote.trim(),
                feePerDeviceRwf = feePerDeviceRwf,
                status = "PENDING_VERIFICATION",
                syncedToSupabase = false
            )
            val synced = repository.submitPaymentVerificationRequest(req, profile, owner)
            if (!synced) {
                CloudSyncScheduler.enqueueImmediateSync(application)
            }
            repository.logSyncEvent(
                type = "SUPABASE_ADMIN",
                status = if (synced) "SUCCESS" else "QUEUED",
                summary = if (synced) "Payment proof synced to Supabase Admin Queue" else "Saved offline — auto-syncs to Supabase when internet returns"
            )
            emitSnackbar(
                if (synced) "Payment verification submitted to Admin Cloud! Send WhatsApp proof now."
                else "Saved offline! Will sync to Supabase automatically when internet returns. Send WhatsApp proof now."
            )
            onSubmitted(req, synced)
        }
    }

    suspend fun syncAdminDataToSupabaseSuspended(silent: Boolean = false) {
        val profile = shopProfile.value
        val owner = resolveOwnerUser()
        val branchCount = branches.value.size.coerceAtLeast(1)
        val workerCount = allUsers.value.size.coerceAtLeast(1)
        val activeDevices = repository.getActiveDevicesCount()
        val res = repository.syncPendingAdminDataWithSupabase(
            shopProfile = profile,
            ownerUser = owner,
            branchCount = branchCount,
            workerCount = workerCount,
            deviceCount = activeDevices,
            context = application
        )
        _adminPaymentConfig.value = OfflineSubscriptionManager.getCurrentPaymentConfig()
        if (res.directAutoUnlocked) {
            BeBossNotificationManager.sendDirectAutoUnlockNotification(
                context = application,
                shopName = profile.shopName,
                daysRemaining = shopProfile.value.daysRemaining
            )
            emitSnackbar(res.message)
        } else if (!silent || res.approvedCodesFound.isNotEmpty()) {
            emitSnackbar(res.message)
        }
    }

    fun syncAdminDataToSupabase(silent: Boolean = false) {
        scope.launch {
            try {
                syncAdminDataToSupabaseSuspended(silent)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (!silent) {
                    emitSnackbar("Cloud sync failed: ${e.safeMessage()}")
                }
            }
        }
    }

    fun checkCloudUnlockApprovals() {
        runWithBlurLoading("Checking Approvals", "Fetching cloud unlock & security state...") {
            syncAdminDataToSupabaseSuspended(silent = false)
        }
    }

    fun refreshAdminDashboardData() {
        if (_adminSession.value == null) return
        runWithBlurLoading("Refreshing Admin Cloud", "Loading shops, devices & security logs...") {
            refreshAdminDashboardDataSuspended()
        }
    }

    private suspend fun refreshAdminDashboardDataSuspended() {
        if (_adminSession.value == null) return
        _isAdminLoading.value = true
        try {
            val validSession = SupabaseAdminClient.ensureValidAdminSession()
            _adminSession.value = validSession
            if (validSession == null) {
                _adminAuthError.value = "Admin session expired. Sign in again."
                return
            }
            _adminPaymentRequests.value = SupabaseAdminClient.fetchAllPaymentRequests()
            _adminShopAccounts.value = SupabaseAdminClient.fetchAllShopAccounts()
            _adminShopUsers.value = SupabaseAdminClient.fetchAllShopUsers()
            _adminShopDevices.value = SupabaseAdminClient.fetchAllShopDevices()
            _adminBranchSnapshots.value = SupabaseAdminClient.fetchAllBranchSnapshots()
            _adminUnlockCodes.value = SupabaseAdminClient.fetchAllUnlockCodes()
            _adminAuditLogs.value = SupabaseAdminClient.fetchAdminAuditLogs()
            _adminDeviceTelemetry.value = SupabaseAdminClient.fetchDeviceTelemetryForAdmin()
            _adminCloudActivity.value = SupabaseAdminClient.fetchAdminCloudSyncEvents()
            SupabaseAdminClient.fetchPublicAppConfig()?.let { cfg ->
                OfflineSubscriptionManager.saveDynamicPaymentConfig(application, cfg)
                _adminPaymentConfig.value = cfg
            }
            _adminLastSyncedAt.value = System.currentTimeMillis()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emitSnackbar("Admin cloud refresh failed: ${e.safeMessage()}")
        } finally {
            _isAdminLoading.value = false
        }
    }

    fun runAdminCloudHealthDiagnostics() {
        runWithBlurLoading("Cloud Diagnostics", "Probing Supabase PostgREST & schema...") {
            try {
                val res = SupabaseAdminClient.runCloudHealthDiagnostics()
                _adminCloudHealth.value = res
                emitSnackbar(res.summaryMessage)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Diagnostics failed: ${e.safeMessage()}")
            }
        }
    }

    fun loadMoreAdminShops() {
        if (_adminSession.value == null) return
        scope.launch {
            try {
                val offset = _adminShopAccounts.value.size
                val next = SupabaseAdminClient.fetchAllShopAccounts(limit = 150, offset = offset)
                if (next.isEmpty()) {
                    emitSnackbar("All cloud shop accounts are loaded (${_adminShopAccounts.value.size}).")
                } else {
                    _adminShopAccounts.value = (_adminShopAccounts.value + next).distinctBy { it.id }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Load more shops failed: ${e.safeMessage()}")
            }
        }
    }

    fun loadMoreAdminPaymentRequests() {
        if (_adminSession.value == null) return
        scope.launch {
            try {
                val offset = _adminPaymentRequests.value.size
                val next = SupabaseAdminClient.fetchAllPaymentRequests(limit = 100, offset = offset)
                if (next.isEmpty()) {
                    emitSnackbar("All payment verification records are loaded (${_adminPaymentRequests.value.size}).")
                } else {
                    _adminPaymentRequests.value = (_adminPaymentRequests.value + next).distinctBy { it.id }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Load more payments failed: ${e.safeMessage()}")
            }
        }
    }

    fun loadMoreAdminTelemetry() {
        if (_adminSession.value == null) return
        scope.launch {
            try {
                val offset = _adminDeviceTelemetry.value.size
                val next = SupabaseAdminClient.fetchDeviceTelemetryForAdmin(limit = 100, offset = offset)
                if (next.isEmpty()) {
                    emitSnackbar("All device security telemetry records are loaded (${_adminDeviceTelemetry.value.size}).")
                } else {
                    _adminDeviceTelemetry.value = (_adminDeviceTelemetry.value + next).distinctBy { it.id }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Load more telemetry failed: ${e.safeMessage()}")
            }
        }
    }

    fun loadMoreAdminCloudActivity() {
        if (_adminSession.value == null) return
        scope.launch {
            try {
                val offset = _adminCloudActivity.value.size
                val next = SupabaseAdminClient.fetchAdminCloudSyncEvents(limit = 200, offset = offset)
                if (next.isEmpty()) {
                    emitSnackbar("All cloud activity records are loaded (${_adminCloudActivity.value.size}).")
                } else {
                    _adminCloudActivity.value = (_adminCloudActivity.value + next).distinctBy { it.id }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Load more activity failed: ${e.safeMessage()}")
            }
        }
    }

    fun exportAdminLedgerCsv(context: Context) {
        scope.launch {
            try {
                val file = ExcelCsvExporter.exportAdminLedgerCsv(
                    context = context,
                    shops = _adminShopAccounts.value,
                    payments = _adminPaymentRequests.value
                )
                PdfReportGenerator.shareFile(context, file, "text/csv", "Share BeBoss Admin Ledger CSV")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Admin CSV export failed: ${e.safeMessage()}")
            }
        }
    }

    fun exportAdminExecutivePdf(context: Context) {
        scope.launch {
            try {
                val file = PdfReportGenerator.generateAdminExecutiveReportPdf(
                    context = context,
                    shops = _adminShopAccounts.value,
                    payments = _adminPaymentRequests.value,
                    auditLogs = _adminAuditLogs.value,
                    telemetry = _adminDeviceTelemetry.value
                )
                PdfReportGenerator.shareFile(context, file, "application/pdf", "Share BeBoss Executive Report PDF")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Executive PDF export failed: ${e.safeMessage()}")
            }
        }
    }

    fun adminApproveAndGenerateCode(
        request: SupabasePaymentRequestDto,
        verificationNote: String,
        onGenerated: (Boolean, String) -> Unit
    ) {
        runWithBlurLoading("Generating Unlock Code", "Signing BB3 voucher in Admin Cloud...") {
            _isAdminLoading.value = true
            var ok = false
            var code = ""
            try {
                val adminName = _adminSession.value?.fullName ?: currentUser.value?.name ?: "BeBoss Master Admin"
                val result = SupabaseAdminClient.approvePaymentAndIssueCode(request, adminName, verificationNote)
                ok = result.first
                code = result.second
                if (ok) {
                    repository.recordLocalAudit(
                        actorName = adminName,
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_APPROVE_PAYMENT",
                        targetId = request.ownerUsername,
                        details = "Provider payment manually verified: ${verificationNote.take(300)}. Approved ${request.amountRwf} FRw (${request.durationMonths * 30}d) -> ${code.take(18)}..."
                    )
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Approved & generated unlock code: $code")
                } else {
                    emitSnackbar(code.ifBlank { "Admin Supabase approval failed — sign in as Master Admin." })
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                code = e.safeMessage("Admin Supabase approval failed")
                emitSnackbar(code)
            } finally {
                _isAdminLoading.value = false
                onGenerated(ok, code)
            }
        }
    }

    fun adminDirectAutoUnlockPayment(
        request: SupabasePaymentRequestDto,
        onDone: (Boolean) -> Unit = {}
    ) {
        runWithBlurLoading("Auto-Unlocking Shop", "Activating ${request.shopName} in cloud...") {
            _isAdminLoading.value = true
            var ok = false
            try {
                val adminName = _adminSession.value?.fullName ?: currentUser.value?.name ?: "BeBoss Master Admin"
                ok = SupabaseAdminClient.approvePaymentDirectAutoUnlock(request, adminName)
                if (ok) {
                    repository.recordLocalAudit(
                        actorName = adminName,
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_DIRECT_AUTO_UNLOCK",
                        targetId = request.ownerUsername,
                        details = "Auto-unlocked ${request.shopName} (${request.amountRwf} FRw, ${request.deviceCount} devices) without code"
                    )
                    refreshAdminDashboardDataSuspended()
                    syncAdminDataToSupabaseSuspended(silent = true)
                    emitSnackbar("Auto-Unlocked ${request.shopName} (@${request.ownerUsername}) directly in cloud!")
                } else {
                    emitSnackbar("Direct Auto-Unlock failed — check Master Admin session.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Direct Auto-Unlock failed: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
                onDone(ok)
            }
        }
    }

    fun adminApproveBatchPendingPayments(onDone: (Int, Int) -> Unit = { _, _ -> }) {
        runWithBlurLoading("Batch Approving Claims", "Verifying pending payment queue...") {
            _isAdminLoading.value = true
            var approvedCount = 0
            var failedCount = 0
            try {
                val pending = _adminPaymentRequests.value.filter { it.status == "PENDING_VERIFICATION" }
                val adminName = _adminSession.value?.fullName ?: "BeBoss Master Admin"
                val res = SupabaseAdminClient.approvePaymentBatch(pending, adminName)
                approvedCount = res.approvedCount
                failedCount = res.failedCount
                if (approvedCount > 0) {
                    repository.recordLocalAudit(
                        actorName = adminName,
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_BATCH_APPROVE",
                        targetId = "batch:$approvedCount",
                        details = "Batch approved $approvedCount pending payment claims ($failedCount failed)"
                    )
                    refreshAdminDashboardDataSuspended()
                }
                emitSnackbar("Batch approval: $approvedCount approved, $failedCount failed.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Batch approval failed: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
                onDone(approvedCount, failedCount)
            }
        }
    }

    fun adminRejectPayment(
        request: SupabasePaymentRequestDto,
        reason: String,
        onDone: (Boolean) -> Unit = {}
    ) {
        runWithBlurLoading("Updating Claim", "Marking payment claim rejected...") {
            _isAdminLoading.value = true
            var ok = false
            try {
                ok = SupabaseAdminClient.rejectPaymentRequest(request, reason)
                if (ok) {
                    repository.recordLocalAudit(
                        actorName = _adminSession.value?.fullName ?: "MASTER_ADMIN",
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_REJECT_PAYMENT",
                        targetId = request.ownerUsername,
                        details = reason
                    )
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Payment request marked REJECTED.")
                } else {
                    emitSnackbar("Could not reject request in Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Could not reject request: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
                onDone(ok)
            }
        }
    }

    fun adminRevokeCode(codeDto: SupabaseUnlockCodeDto) {
        runWithBlurLoading("Revoking Code", "Invalidating voucher in Admin Cloud...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.revokeUnlockCode(codeDto)
                if (ok) {
                    repository.recordLocalAudit(
                        actorName = _adminSession.value?.fullName ?: "MASTER_ADMIN",
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_REVOKE_CODE",
                        targetId = codeDto.shopUsername,
                        details = "Revoked ${codeDto.unlockCode}"
                    )
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Revoked unlock code ${codeDto.unlockCode}.")
                } else {
                    emitSnackbar("Could not revoke code in Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Could not revoke code: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminIssueManualCode(
        username: String,
        registeredPhone: String,
        tierCode: String,
        days: Int,
        amountRwf: Int,
        onGenerated: (Boolean, String) -> Unit
    ) {
        runWithBlurLoading("Issuing BB3 Code", "Generating offline unlock voucher...") {
            _isAdminLoading.value = true
            var ok = false
            var code = ""
            try {
                val adminName = _adminSession.value?.fullName ?: currentUser.value?.name ?: "BeBoss Master Admin"
                val deviceCode = SubscriptionSecurityManager.computeDeviceChallenge(shopProfile.value)
                val result = SupabaseAdminClient.issueManualUnlockCode(
                    username = username,
                    registeredPhone = registeredPhone,
                    deviceChallenge = deviceCode,
                    tierCode = tierCode,
                    days = days,
                    amountRwf = amountRwf,
                    adminName = adminName
                )
                ok = result.first
                code = result.second
                if (ok) {
                    repository.recordLocalAudit(
                        actorName = adminName,
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_ISSUE_MANUAL_CODE",
                        targetId = username,
                        details = "$tierCode ($days d, $amountRwf FRw)"
                    )
                    refreshAdminDashboardDataSuspended()
                } else {
                    emitSnackbar(code.ifBlank { "Failed generating BB3 code — verify the server signing key and Admin session." })
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                code = e.safeMessage("Failed generating BB3 code")
                emitSnackbar(code)
            } finally {
                _isAdminLoading.value = false
                onGenerated(ok, code)
            }
        }
    }

    fun adminExtendShopSubscription(shop: SupabaseShopAccountDto, addDays: Int) {
        runWithBlurLoading("Extending Subscription", "Updating license expiry in Supabase...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminExtendShopSubscription(shop, addDays)
                if (ok) {
                    repository.recordLocalAudit(
                        actorName = _adminSession.value?.fullName ?: "MASTER_ADMIN",
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_EXTEND_SHOP",
                        targetId = shop.ownerUsername,
                        details = "+$addDays days for ${shop.shopName}"
                    )
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Extended ${shop.shopName} license by +$addDays days.")
                } else {
                    emitSnackbar("Failed extending shop license in Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed extending shop license: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminSetShopStatus(shop: SupabaseShopAccountDto, status: String) {
        runWithBlurLoading("Updating Shop Status", "Setting ${shop.shopName} to $status...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminSetShopStatus(shop, status)
                if (ok) {
                    repository.recordLocalAudit(
                        actorName = _adminSession.value?.fullName ?: "MASTER_ADMIN",
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_SET_SHOP_STATUS",
                        targetId = shop.ownerUsername,
                        details = "${shop.shopName} -> $status"
                    )
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("${shop.shopName} set to $status.")
                } else {
                    emitSnackbar("Failed updating shop status.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed updating shop status: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminUpdateShopLimits(
        shop: SupabaseShopAccountDto,
        branchCount: Int,
        workerCount: Int,
        deviceLimit: Int = shop.deviceLimit.coerceAtLeast(1)
    ) {
        runWithBlurLoading("Updating Quotas", "Applying branch & device limits...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminUpdateShopLimits(shop, branchCount, workerCount, deviceLimit)
                if (ok) {
                    repository.recordLocalAudit(
                        actorName = _adminSession.value?.fullName ?: "MASTER_ADMIN",
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_UPDATE_SHOP_LIMITS",
                        targetId = shop.ownerUsername,
                        details = "${shop.shopName}: $branchCount br / $workerCount stf / $deviceLimit dev"
                    )
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Updated quotas for ${shop.shopName} ($branchCount br / $workerCount stf / $deviceLimit dev).")
                } else {
                    emitSnackbar("Failed updating shop quotas.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed updating shop quotas: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminSavePaymentConfig(config: AdminPaymentConfig, onDone: (Boolean) -> Unit = {}) {
        runWithBlurLoading("Saving Config", "Publishing payment settings to cloud...") {
            _isAdminLoading.value = true
            var ok = false
            try {
                ok = SupabaseAdminClient.adminSaveAppConfig(config)
                if (ok) {
                    OfflineSubscriptionManager.saveDynamicPaymentConfig(application, config.copy(updatedAt = System.currentTimeMillis()))
                    _adminPaymentConfig.value = OfflineSubscriptionManager.getCurrentPaymentConfig()
                    emitSnackbar("Saved Admin WhatsApp & MoMo/Airtel USSD numbers globally!")
                } else {
                    emitSnackbar("Failed saving payment config to Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed saving payment config: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
                onDone(ok)
            }
        }
    }

    fun adminToggleShopDeviceActive(device: SupabaseShopDeviceDto, isActive: Boolean) {
        runWithBlurLoading("Updating Device", "${if (isActive) "Activating" else "Suspending"} ${device.deviceName}...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminToggleShopDeviceActive(device, isActive)
                if (ok) {
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Device '${device.deviceName}' ${if (isActive) "activated" else "disabled"}.")
                } else {
                    emitSnackbar("Failed updating device in Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed updating device: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminDeleteShopDevice(device: SupabaseShopDeviceDto) {
        runWithBlurLoading("Removing Device", "Deleting ${device.deviceName} from cloud...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.deleteShopDeviceInCloud(device.shopSyncKey, device.id, useAdmin = true)
                if (ok) {
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Removed device '${device.deviceName}'.")
                } else {
                    emitSnackbar("Failed deleting device from Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed deleting device: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminDeleteShopAccount(shop: SupabaseShopAccountDto) {
        runWithBlurLoading("Deleting Shop", "Removing ${shop.shopName} from registry...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminDeleteShopAccount(shop)
                if (ok) {
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Deleted shop record ${shop.shopName}.")
                } else {
                    emitSnackbar("Failed deleting shop record.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed deleting shop record: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminUpdateShopUserRole(user: SupabaseShopUserDto, newRole: String) {
        runWithBlurLoading("Updating Staff Role", "Assigning $newRole to @${user.username}...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminUpdateShopUser(user, newRole = newRole)
                if (ok) {
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("@${user.username} role updated to $newRole.")
                } else {
                    emitSnackbar("Failed updating user role in Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed updating user role: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminToggleShopUserActive(user: SupabaseShopUserDto, newActive: Boolean) {
        runWithBlurLoading("Updating Staff Status", "${if (newActive) "Reactivating" else "Suspending"} @${user.username}...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminUpdateShopUser(user, isActive = newActive)
                if (ok) {
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("@${user.username} ${if (newActive) "reactivated" else "suspended"}.")
                } else {
                    emitSnackbar("Failed updating user status in Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed updating user status: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminDeleteShopUser(user: SupabaseShopUserDto) {
        runWithBlurLoading("Removing Staff", "Deleting @${user.username} from directory...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminDeleteShopUser(user)
                if (ok) {
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Removed user @${user.username} from directory.")
                } else {
                    emitSnackbar("Failed deleting user in Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed deleting user: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun adminDeleteBranchSnapshot(snapshot: SupabaseBranchSnapshotDto) {
        runWithBlurLoading("Removing Snapshot", "Cleaning ${snapshot.branchName} snapshot...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminDeleteBranchSnapshot(snapshot)
                if (ok) {
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Removed branch snapshot (${snapshot.branchName}).")
                } else {
                    emitSnackbar("Failed removing branch snapshot.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed removing branch snapshot: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun shareAdminWebPortal(context: Context) {
        try {
            ShopDataTransferManager.exportAndShareAdminWebPortal(context)
        } catch (e: Exception) {
            scope.launch { emitSnackbar("Cannot export Web Portal: ${e.safeMessage()}") }
        }
    }

    fun adminResetShopTrial(shop: SupabaseShopAccountDto, trialDays: Int = ShopProfile.FREE_TRIAL_DAYS) {
        runWithBlurLoading("Resetting Trial", "Resetting ${shop.shopName} to ${trialDays}-day trial...") {
            _isAdminLoading.value = true
            try {
                val ok = SupabaseAdminClient.adminResetShopTrial(shop, trialDays)
                if (ok) {
                    repository.recordLocalAudit(
                        actorName = _adminSession.value?.fullName ?: "MASTER_ADMIN",
                        actorRole = "MASTER_ADMIN",
                        action = "ADMIN_RESET_TRIAL",
                        targetId = shop.ownerUsername,
                        details = "Reset ${shop.shopName} to ${trialDays}-day TRIAL"
                    )
                    refreshAdminDashboardDataSuspended()
                    emitSnackbar("Reset ${shop.shopName} to $trialDays-day Free Trial.")
                } else {
                    emitSnackbar("Failed resetting trial in Supabase.")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSnackbar("Failed resetting trial: ${e.safeMessage()}")
            } finally {
                _isAdminLoading.value = false
            }
        }
    }

    fun processDirectSubscriptionPayment(
        provider: String,
        phone: String,
        durationMonths: Int,
        userReference: String? = null,
        onResult: (PaymentProcessingResult, SubscriptionPriceBreakdown) -> Unit
    ) {
        runWithBlurLoading("Processing MoMo", "Verifying mobile money transaction...") {
            val currentProf = shopProfile.value
            val owner = resolveOwnerUser()
            val branchCount = branches.value.size.coerceAtLeast(1)
            val workerCount = allUsers.value.size.coerceAtLeast(1)
            val breakdown = OfflineSubscriptionManager.calculateSubscriptionPrice(
                branchCount = branchCount,
                workerCount = workerCount,
                durationMonths = durationMonths
            )
            val pastRefs = setOfNotNull(currentProf.lastPaymentRef.takeIf { it.isNotBlank() })
            val result = OfflineSubscriptionManager.processMoMoPaymentAsync(
                context = application,
                shopProfile = currentProf,
                payerPhone = phone,
                provider = provider,
                branchCount = branchCount,
                workerCount = workerCount,
                durationMonths = durationMonths,
                userEnteredReference = userReference,
                alreadyUsedRefs = pastRefs
            )

            if (result.isSuccess) {
                val now = com.beboss.shopmgmt.util.ClockGuard.effectiveNowMs()
                val currentExpiry = if (currentProf.subscriptionExpiresAt > now && !currentProf.isSuspended)
                    currentProf.subscriptionExpiresAt
                else now
                val newExpiry = currentExpiry + (result.planDays.toLong() * 24 * 60 * 60 * 1000L)

                val updatedProf = currentProf.copy(
                    subscriptionStatus = ShopProfile.STATUS_ACTIVE,
                    subscriptionExpiresAt = newExpiry,
                    lastPaymentRef = result.transactionRef,
                    lastPaymentAmount = result.amountPaid,
                    lastPaymentDate = now,
                    monthlyFeeRwf = breakdown.monthlySubtotal,
                    updatedAt = now
                )
                repository.updateShopProfile(updatedProf)
                repository.recordLocalAudit(
                    actorName = owner?.name ?: currentProf.name.ifBlank { "Shop Owner" },
                    actorRole = owner?.role?.name ?: "OWNER",
                    action = "ONLINE_PAYMENT_VERIFIED",
                    targetId = result.transactionRef,
                    details = "$provider verified ${result.amountPaid} FRw (+${result.planDays}d)"
                )
                emitSnackbar(result.message)
                syncAdminDataToSupabaseSuspended(silent = true)
                triggerCloudSync()
            } else {
                emitSnackbar(result.message)
            }
            onResult(result, breakdown)
        }
    }
}
