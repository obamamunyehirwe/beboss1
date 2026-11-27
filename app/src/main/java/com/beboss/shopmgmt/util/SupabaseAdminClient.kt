package com.beboss.shopmgmt.util

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import android.util.Log
import com.beboss.shopmgmt.BuildConfig
import com.beboss.shopmgmt.data.model.PaymentVerificationRequest
import com.beboss.shopmgmt.data.model.ShopDevice
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.StockTransfer
import com.beboss.shopmgmt.data.model.SyncTombstone
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.CertificatePinner
import okhttp3.ConnectionSpec
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.TlsVersion
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.text.Normalizer
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

private fun parseAnnouncementTimestamp(value: String): Long? {
    val normalized = value.trim().replace(Regex("(\\.\\d{3})\\d+(?=(Z|[+-]\\d{2}:\\d{2})$)"), "$1")
    val formats = listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX")
    return formats.firstNotNullOfOrNull { pattern ->
        runCatching {
            java.text.SimpleDateFormat(pattern, Locale.US).apply {
                isLenient = false
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.parse(normalized)?.time
        }.getOrNull()
    }
}

data class SupabaseShopAnnouncementDto(
    val id: String,
    val title: String,
    val body: String,
    val severity: String,
    val ctaLabel: String,
    val ctaUrl: String,
    val startsAt: String,
    val endsAt: String?
)

data class SupabaseAdminSession(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val email: String,
    val fullName: String,
    val expiresAt: Long
)

data class SupabaseShopAccountDto(
    val id: String,
    val shopName: String,
    val ownerName: String,
    val ownerUsername: String,
    val ownerPhone: String,
    val deviceChallenge: String,
    val branchCount: Int,
    val workerCount: Int,
    val deviceCount: Int = 1,
    val deviceLimit: Int = 1,
    val adminWhatsApp: String = "",
    val autoUnlockedAt: Long = 0L,
    val monthlyFeeRwf: Int,
    val subscriptionStatus: String,
    val subscriptionExpiresAt: Long,
    val updatedAt: Long,
    val businessType: String = "sector_retail"
)

data class SupabaseShopDeviceDto(
    val id: String,
    val shopSyncKey: String,
    val shopName: String,
    val deviceId: String,
    val deviceName: String,
    val joinCode: String,
    val assignedUserId: String,
    val assignedUsername: String,
    val assignedUserName: String,
    val role: String,
    val branchId: String,
    val branchName: String,
    val isOwnerPrimary: Boolean,
    val isActive: Boolean,
    val monthlyFeeAddonRwf: Int,
    val lastSyncedAt: Long,
    val createdAt: Long,
    val updatedAt: Long
)

data class SupabasePaymentRequestDto(
    val id: String,
    val shopName: String,
    val ownerUsername: String,
    val ownerPhone: String,
    val deviceChallenge: String,
    val provider: String,
    val ussdCode: String,
    val payerPhone: String,
    val payerFullName: String = "",
    val paymentTimeMs: Long = 0L,
    val paymentNote: String = "",
    val amountRwf: Int,
    val durationMonths: Int,
    val branchCount: Int,
    val workerCount: Int,
    val deviceCount: Int = 1,
    val feePerDeviceRwf: Int = 2000,
    val status: String,
    val approvalMode: String = "",
    val generatedUnlockCode: String,
    val verifiedByAdmin: String,
    val rejectionReason: String = "",
    val createdAt: Long,
    val updatedAt: Long,
    val gatewayProvider: String = "",
    val gatewayReference: String = "",
    val gatewayTransactionId: String = "",
    val gatewayAmountRwf: Int = 0,
    val gatewayCurrency: String = "",
    val gatewayVerifiedAt: Long = 0L
)

data class SupabaseSignedPaymentUnlock(
    val code: String,
    val planDigest: String,
    val requestId: String,
    val shopId: String,
    val tierCode: String,
    val days: Int,
    val amountRwf: Int,
    val paymentTimeMs: Long
)

data class SupabaseUnlockCodeDto(
    val id: String,
    val unlockCode: String,
    val shopUsername: String,
    val shopPhone: String,
    val deviceChallenge: String,
    val tierCode: String,
    val planDays: Int,
    val amountRwf: Int,
    val status: String,
    val issuedByAdmin: String,
    val issuedAt: Long,
    val redeemedAt: Long?
)

data class SupabaseBranchSnapshotDto(
    val id: String,
    val shopSyncKey: String,
    val deviceId: String,
    val syncGeneration: String = "",
    val chunkIndex: Int = 0,
    val chunkCount: Int = 0,
    val branchId: String,
    val branchName: String,
    val shopName: String,
    val ownerUsername: String,
    val payloadToken: String,
    val recordsSummary: String,
    val updatedAt: Long
)

data class SupabaseShopUserDto(
    val id: String,
    val shopSyncKey: String,
    val shopName: String,
    val userId: String,
    val fullName: String,
    val username: String,
    val phone: String,
    val role: String,
    val assignedBranchId: String,
    val assignedBranchName: String,
    val isActive: Boolean,
    val updatedAt: Long
)

data class SupabaseBranchDto(
    val id: String,
    val shopSyncKey: String,
    val shopName: String,
    val name: String,
    val code: String,
    val address: String,
    val phone: String,
    val managerUserId: String,
    val managerName: String,
    val isMainBranch: Boolean,
    val isActive: Boolean,
    val colorHex: String,
    val dailySalesTargetRwf: Long,
    val monthlyTargetRwf: Long,
    val openingCashFloat: Long,
    val stockValueRwf: Long,
    val productCount: Int,
    val operationalStatus: String,
    val email: String,
    val notes: String,
    val createdAt: Long,
    val updatedAt: Long,
    val syncVersion: Long,
    val hlcTimestamp: Long,
    val lastModifiedDeviceId: String
)

data class SupabaseStockTransferDto(
    val id: String,
    val shopSyncKey: String,
    val shopName: String,
    val transferNumber: String,
    val productId: String,
    val productName: String,
    val fromBranchId: String,
    val fromBranchName: String,
    val toBranchId: String,
    val toBranchName: String,
    val quantity: Double,
    val unit: String,
    val costValueRwf: Long,
    val transferDate: Long,
    val status: String,
    val notes: String,
    val transferredBy: String,
    val receivedBy: String,
    val receivedAt: Long,
    val synced: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
    val hlcTimestamp: Long,
    val lastModifiedDeviceId: String
)

data class SupabaseAuditLogDto(
    val id: String,
    val adminEmail: String,
    val action: String,
    val targetId: String,
    val details: String,
    val createdAt: Long
)

data class SupabaseSyncResult(
    val success: Boolean,
    val message: String,
    val approvedCodesFound: List<SupabasePaymentRequestDto> = emptyList(),
    val directAutoUnlocked: Boolean = false
)

data class BatchApprovalResult(
    val approvedCount: Int,
    val failedCount: Int,
    val issuedCodes: List<Pair<String, String>> = emptyList()
)

data class SupabaseCloudSyncEventDto(
    val id: Long,
    val shopSyncKey: String,
    val shopName: String,
    val entity: String,
    val action: String,
    val actor: String,
    val deviceId: String,
    val detail: String,
    val createdAt: String
)

data class SupabaseDeviceTelemetryDto(
    val id: String,
    val shopSyncKey: String,
    val shopName: String,
    val deviceId: String,
    val deviceName: String,
    val riskScore: Int,
    val postureLabel: String,
    val isRooted: Boolean,
    val hasHooking: Boolean,
    val isEmulator: Boolean,
    val clockRollbackDetected: Boolean,
    val tamperIncidentCount: Int,
    val clockSkewMs: Long,
    val tamperReason: String,
    val keystoreBacking: String,
    val signals: List<String>,
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val locationCapturedAt: Long,
    val locationLabel: String,
    val unsyncedMessagesCount: Int,
    val permissionsSummary: String,
    val inspectedAt: Long,
    val updatedAt: Long,
    val devicePlatform: String = "ANDROID",
    val manufacturer: String = "",
    val model: String = "",
    val osRelease: String = "",
    val sdkInt: Int = 0,
    val appVersion: String = "",
    val appBuild: Int = 0,
    val localeTag: String = "",
    val timezoneId: String = ""
)

data class CloudHealthDiagnosticsDto(
    val checkedAt: Long,
    val postgrestReachable: Boolean,
    val latencyMs: Long,
    val snapshotSchemaReady: Boolean,
    val telemetryTableReady: Boolean,
    val branchesTableReady: Boolean,
    val transfersTableReady: Boolean,
    val adminSessionValid: Boolean,
    val summaryMessage: String
)

/**
 * Supabase PostgREST + GoTrue Auth Client for:
 * 1. Authenticated Admin Licensing Operations (`shop_accounts`, `payment_requests`, `unlock_codes`, `admin_profiles`, `admin_audit_logs`)
 * 2. Synchronous Cross-Branch Internet DataShare Relay (`branch_sync_snapshots`)
 *
 * All POS, Inventory, Sales, Customers, Purchases, and Debts remain 100% offline-first in Room SQLite.
 */
object SupabaseAdminClient {

    private const val TAG = "SupabaseAdminClient"
    const val MASTER_ADMIN_EMAIL = "obamamunyehirwe@gmail.com"
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    @Volatile
    private var activeAdminSession: SupabaseAdminSession? = null

    private val modernTlsSpec = ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
        .tlsVersions(TlsVersion.TLS_1_3, TlsVersion.TLS_1_2)
        .build()

    fun buildCertificatePinner(
        supabaseUrl: String = getSupabaseUrl(),
        pinsCsv: String = BuildConfig.SUPABASE_CERT_PINS.ifBlank {
            System.getProperty("beboss.supabase.certPins").orEmpty()
        }
    ): CertificatePinner? {
        val rawPins = pinsCsv.split(',').map { it.trim() }.filter { it.startsWith("sha256/") }
        if (rawPins.isEmpty()) return null
        val host = try {
            URL(supabaseUrl).host.takeIf { it.isNotBlank() } ?: return null
        } catch (_: Throwable) {
            return null
        }
        val builder = CertificatePinner.Builder()
        rawPins.forEach { pin -> builder.add(host, pin) }
        return builder.build()
    }

    private val client: OkHttpClient by lazy {
        val pinner = buildCertificatePinner()
        if (pinner == null && !BuildConfig.DEBUG) {
            throw IllegalStateException(
                "SUPABASE_CERT_PINS is not configured. Certificate pinning is mandatory for release builds. " +
                "Provision SHA-256 pins for the Supabase host and rebuild."
            )
        }
        OkHttpClient.Builder()
            .connectionSpecs(listOf(modernTlsSpec))
            .followRedirects(false)
            .followSslRedirects(false)
            .addInterceptor { chain ->
                val response = chain.proceed(chain.request())
                ClockGuard.observeTrustedServerDateHeader(response.header("Date"))
                response
            }
            .apply {
                pinner?.let { certificatePinner(it) }
            }
            .hostnameVerifier { hostname, session ->
                HttpsURLConnection.getDefaultHostnameVerifier().verify(hostname, session)
            }
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    fun getSupabaseUrl(): String {
        return try {
            BuildConfig.SUPABASE_URL.trim().removeSuffix("/")
        } catch (_: Throwable) {
            ""
        }
    }

    /**
     * Returns the project's public Data API key. Prefer the modern publishable key so
     * an expired/rotated legacy anon JWT in a developer .env file cannot poison every
     * cloud request. A publishable key belongs in the client; service-role/secret keys
     * must never be packaged in an Android APK.
     */
    fun getSupabaseApiKey(): String {
        return try {
            val publishable = BuildConfig.SUPABASE_PUBLISHABLE_KEY.trim()
            if (publishable.startsWith("sb_publishable_")) {
                publishable
            } else {
                BuildConfig.SUPABASE_ANON_KEY.trim()
            }
        } catch (_: Throwable) {
            ""
        }
    }

    /** Backwards-compatible accessor used by existing auth and REST call sites. */
    fun getSupabaseAnonKey(): String = getSupabaseApiKey()

    /**
     * Legacy Supabase anon JWTs may be used as public client keys, but service_role
     * JWTs must never be accepted as Android configuration. Decode the JWT role
     * instead of treating any three-segment token as an anon key.
     */
    private fun isLegacyJwtApiKey(key: String): Boolean {
        if (!key.startsWith("eyJ") || key.count { it == '.' } != 2) return false
        return try {
            val payload = key.split('.')[1]
            val decoded = Base64.decode(
                payload,
                Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
            )
            JSONObject(String(decoded, Charsets.UTF_8)).optString("role") == "anon"
        } catch (_: Exception) {
            false
        }
    }

    fun getDefaultAdminEmail(): String = MASTER_ADMIN_EMAIL

    fun isValidAdminLoginEmail(email: String): Boolean {
        val value = email.trim()
        return value.length in 6..200 &&
            Regex("^[A-Za-z0-9.!#$%&'*+/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$").matches(value)
    }

    /** Legacy name retained for callers; authorization is role-based, not email-based. */
    fun isAllowedMasterAdminEmail(email: String): Boolean = isValidAdminLoginEmail(email)

    fun isConfigured(): Boolean {
        val url = getSupabaseUrl()
        val key = getSupabaseAnonKey()
        val isSupportedPublicKey =
            key.startsWith("sb_publishable_") || isLegacyJwtApiKey(key)
        return url.startsWith("https://") &&
            !url.contains("your-project-id") &&
            isSupportedPublicKey
    }

    /**
     * Check if the branch_sync_snapshots table has the new migration columns applied.
     * Returns true if sync_generation, chunk_index, chunk_count columns exist.
     * Call this to verify migration 0004 has been applied.
     */
    suspend fun checkSnapshotMigrationApplied(): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext false
        try {
            val req = buildRestRequest(
                "branch_sync_snapshots?select=sync_generation,chunk_index,chunk_count&limit=1"
            ).get().build()
            client.newCall(req).execute().use { resp ->
                return@withContext resp.isSuccessful
            }
        } catch (e: Exception) {
            Log.w(TAG, "Migration check failed: ${e.message}")
            return@withContext false
        }
    }

    fun getCurrentAdminSession(): SupabaseAdminSession? {
        val current = activeAdminSession ?: return null
        if (System.currentTimeMillis() >= current.expiresAt && current.refreshToken.isBlank()) {
            activeAdminSession = null
            return null
        }
        return current
    }

    @Synchronized
    fun ensureValidAdminSession(): SupabaseAdminSession? {
        val session = activeAdminSession ?: return null
        val now = System.currentTimeMillis()
        if (now < session.expiresAt - 60_000L) {
            return session
        }
        if (session.refreshToken.isBlank() || !isConfigured()) {
            activeAdminSession = null
            return null
        }
        return try {
            val payload = JSONObject().apply { put("refresh_token", session.refreshToken) }
            val req = Request.Builder()
                .url("${getSupabaseUrl()}/auth/v1/token?grant_type=refresh_token")
                .addHeader("apikey", getSupabaseAnonKey())
                .addHeader("Content-Type", "application/json")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    activeAdminSession = null
                    return null
                }
                val raw = resp.body?.string().orEmpty()
                val refreshed = parseAuthSession(JSONObject(raw), session.email, session.fullName)
                if (refreshed != null && isValidAdminLoginEmail(refreshed.email) && verifyAdminAccess(refreshed)) {
                    activeAdminSession = refreshed
                    refreshed
                } else {
                    activeAdminSession = null
                    null
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Admin JWT refresh failed: ${e.message}")
            activeAdminSession = null
            null
        }
    }

    fun computeShopSyncKey(ownerUsername: String, phone: String): String {
        val user = ownerUsername.trim().lowercase(Locale.ROOT).ifBlank { "owner" }
        val phone9 = SubscriptionSecurityManager.normalizePhoneLast9(phone).ifBlank { "000000000" }
        return "${user}_${phone9}"
    }

    fun getOrCreateDeviceId(context: Context): String {
        val prefs = context.getSharedPreferences("beboss_sync_prefs", Context.MODE_PRIVATE)
        val existing = prefs.getString("device_sync_id", null)
        if (!existing.isNullOrBlank()) return existing
        val created = "DEV-${UUID.randomUUID().toString().take(8).uppercase(Locale.ROOT)}"
        prefs.edit().putString("device_sync_id", created).apply()
        return created
    }

    private fun normalizeOwnerPhoneE164(value: String): String {
        val digits = value.filter { it.isDigit() }
        val local = when {
            digits.length == 9 -> digits
            digits.length == 10 && digits.startsWith("0") -> digits.drop(1)
            digits.length == 12 && digits.startsWith("250") -> digits.takeLast(9)
            else -> ""
        }
        require(local.matches(Regex("7[0-9]{8}"))) {
            "Enter the registered Rwanda shop-owner mobile number."
        }
        return "+250$local"
    }

    suspend fun requestOwnerDeviceCredentialOtp(ownerUsername: String, ownerPhone: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            if (!isConfigured()) return@withContext Result.failure(IllegalStateException("Supabase is not configured."))
            val username = ownerUsername.trim().lowercase(Locale.ROOT)
            if (!username.matches(Regex("[a-z0-9._-]{2,80}"))) {
                return@withContext Result.failure(IllegalArgumentException("The registered owner username is invalid."))
            }
            try {
                val phone = normalizeOwnerPhoneE164(ownerPhone)
                val payload = JSONObject().put("username", username).put("phone", phone)
                val request = Request.Builder()
                    .url("${getSupabaseUrl()}/functions/v1/request-desktop-owner-otp")
                    .addHeader("apikey", getSupabaseApiKey())
                    .addHeader("Content-Type", "application/json")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()
                client.newCall(request).execute().use { response ->
                    val raw = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        val message = runCatching { JSONObject(raw).optString("message") }.getOrDefault("")
                        throw IOException(message.ifBlank { "The owner verification SMS could not be requested (HTTP ${response.code})." })
                    }
                }
                Result.success(Unit)
            } catch (error: Exception) {
                Result.failure(error)
            }
        }

    /**
     * Verifies the SMS OTP sent to the registered shop-owner phone through the
     * real provider chain (Supabase Auth -> send-auth-sms hook -> Africa's Talking).
     * Used by the "Join Existing Shop" wizard so a new terminal only pairs after
     * the owner proves control of the registered phone.
     */
    suspend fun verifyOwnerSmsOtp(ownerPhone: String, otp: String): Result<Unit> = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext Result.failure(IllegalStateException("Supabase is not configured."))
        try {
            val phone = normalizeOwnerPhoneE164(ownerPhone)
            verifyOwnerPhoneOtp(phone, otp)
            Result.success(Unit)
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

    /**
     * Online-only compatibility route for customer-held BBSHARE1 and older
     * project-signed BBSHARE2 exports. The global signing key stays in Supabase;
     * the owner proves control of the registered phone and receives sanitized JSON.
     */
    suspend fun verifyLegacyBranchShareToken(
        token: String,
        ownerUsername: String,
        ownerPhone: String,
        otp: String
    ): Result<ShopImportSummary> = withContext(Dispatchers.IO) {
        if (!isConfigured()) {
            return@withContext Result.failure(IllegalStateException("Supabase is not configured."))
        }
        val cleanToken = token.trim()
        if (!cleanToken.startsWith("BBSHARE1:") && !cleanToken.startsWith("BBSHARE2:")) {
            return@withContext Result.failure(IllegalArgumentException("Only signed legacy branch tokens can use this migration route."))
        }
        val maxLegacyTokenLength = if (cleanToken.startsWith("BBSHARE1:")) {
            4 * 1024 * 1024
        } else {
            7 * 1024 * 1024
        }
        if (cleanToken.length > maxLegacyTokenLength) {
            return@withContext Result.failure(IllegalArgumentException("The legacy branch token exceeds the safe size limit."))
        }
        try {
            val username = ownerUsername.trim().lowercase(Locale.ROOT)
            require(username.matches(Regex("[a-z0-9._-]{2,80}"))) {
                "The registered owner username is invalid."
            }
            val phone = normalizeOwnerPhoneE164(ownerPhone)
            val ownerAccessToken = verifyOwnerPhoneOtp(phone, otp)
            val payload = JSONObject()
                .put("action", "verify_branch_share")
                .put("username", username)
                .put("phone", phone)
                .put("token", cleanToken)
            val request = Request.Builder()
                .url("${getSupabaseUrl()}/functions/v1/beboss-desktop")
                .addHeader("apikey", getSupabaseApiKey())
                .addHeader("Authorization", "Bearer $ownerAccessToken")
                .addHeader("Content-Type", "application/json")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                val result = runCatching { JSONObject(raw) }.getOrNull()
                if (!response.isSuccessful || result?.optBoolean("ok") != true) {
                    val message = result?.optString("message").orEmpty()
                    throw IOException(message.ifBlank {
                        "The legacy DataShare could not be verified (HTTP ${response.code})."
                    })
                }
                val snapshot = result.optJSONObject("snapshot")
                    ?: throw IOException("The server returned no verified branch snapshot.")
                Result.success(
                    ShopDataTransferManager.parseShopPackageString(
                        snapshot.toString(),
                        enforceReplayProtection = true
                    )
                )
            }
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

    private fun verifyOwnerPhoneOtp(phoneE164: String, otp: String): String {
        require(otp.matches(Regex("[0-9]{6,8}"))) { "Enter the SMS verification code." }
        val payload = JSONObject()
            .put("phone", phoneE164)
            .put("token", otp.trim())
            .put("type", "sms")
        val request = Request.Builder()
            .url("${getSupabaseUrl()}/auth/v1/verify")
            .addHeader("apikey", getSupabaseApiKey())
            .addHeader("Content-Type", "application/json")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(raw).optString("msg").ifBlank { JSONObject(raw).optString("message") } }
                    .getOrDefault("")
                throw IOException(message.ifBlank { "The owner SMS code is invalid or expired." })
            }
            val session = JSONObject(raw)
            val accessToken = session.optString("access_token")
            val user = session.optJSONObject("user")
            val confirmedAt = user?.optString("phone_confirmed_at").orEmpty()
            if (accessToken.isBlank() || confirmedAt.isBlank()) {
                throw SecurityException("Supabase did not confirm ownership of the registered phone number.")
            }
            return accessToken
        }
    }

    suspend fun enrollCurrentAndroidDevice(
        context: Context,
        ownerUsername: String,
        ownerPhone: String,
        otp: String
    ): Result<String> = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext Result.failure(IllegalStateException("Supabase is not configured."))
        try {
            val username = ownerUsername.trim().lowercase(Locale.ROOT)
            require(username.matches(Regex("[a-z0-9._-]{2,80}"))) { "The registered owner username is invalid." }
            val phone = normalizeOwnerPhoneE164(ownerPhone)
            val ownerAccessToken = verifyOwnerPhoneOtp(phone, otp)
            val deviceId = getOrCreateDeviceId(context)
            val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(120).ifBlank { "Android terminal" }
            val payload = JSONObject()
                .put("action", "device_enroll")
                .put("username", username)
                .put("phone", phone)
                .put("deviceId", deviceId)
                .put("deviceName", deviceName)
            val request = Request.Builder()
                .url("${getSupabaseUrl()}/functions/v1/beboss-desktop")
                .addHeader("apikey", getSupabaseApiKey())
                .addHeader("Authorization", "Bearer $ownerAccessToken")
                .addHeader("Content-Type", "application/json")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val message = runCatching { JSONObject(raw).optString("message") }.getOrDefault("")
                    throw IOException(message.ifBlank { "The server could not provision this Android terminal (HTTP ${response.code})." })
                }
                val result = JSONObject(raw)
                val returnedDeviceId = result.optString("deviceId")
                val accessToken = result.optString("accessToken")
                val refreshToken = result.optString("refreshToken")
                val accessExpiresAt = result.optLong("accessExpiresAt", 0L)
                val refreshExpiresAt = result.optLong("refreshExpiresAt", 0L)
                require(returnedDeviceId == deviceId && accessToken.length == 64 && refreshToken.length == 64) {
                    "The server returned an invalid device credential."
                }
                AndroidDeviceCredentialStore.save(
                    AndroidDeviceCredential(
                        shopId = computeShopSyncKey(username, phone),
                        deviceId = deviceId,
                        accessToken = accessToken,
                        refreshToken = refreshToken,
                        accessExpiresAt = accessExpiresAt,
                        refreshExpiresAt = refreshExpiresAt
                    )
                )
                Result.success("This Android terminal is now authenticated with its own revocable sync credential.")
            }
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

    suspend fun retireLegacyAndroidSync(
        ownerUsername: String,
        ownerPhone: String,
        otp: String
    ): Result<Unit> = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext Result.failure(IllegalStateException("Supabase is not configured."))
        try {
            val username = ownerUsername.trim().lowercase(Locale.ROOT)
            require(username.matches(Regex("[a-z0-9._-]{2,80}"))) { "The registered owner username is invalid." }
            val phone = normalizeOwnerPhoneE164(ownerPhone)
            val ownerAccessToken = verifyOwnerPhoneOtp(phone, otp)
            val payload = JSONObject()
                .put("action", "device_retire_legacy")
                .put("username", username)
                .put("phone", phone)
            val request = Request.Builder()
                .url("${getSupabaseUrl()}/functions/v1/beboss-desktop")
                .addHeader("apikey", getSupabaseApiKey())
                .addHeader("Authorization", "Bearer $ownerAccessToken")
                .addHeader("Content-Type", "application/json")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                val result = runCatching { JSONObject(raw) }.getOrNull()
                if (!response.isSuccessful || result?.optBoolean("legacySyncDisabled") != true) {
                    val message = result?.optString("message").orEmpty()
                    throw IOException(message.ifBlank { "The legacy sync credential could not be retired. Enroll every active device first." })
                }
            }
            Result.success(Unit)
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

    @Synchronized
    private fun refreshAndroidDeviceCredential(
        inputCredential: AndroidDeviceCredential
    ): AndroidDeviceCredential {
        // Another sync request may have rotated the one-time refresh token while
        // this caller was waiting. Re-read the encrypted store under this lock so
        // parallel requests cannot race a valid token.
        val credential = AndroidDeviceCredentialStore.read(inputCredential.shopId, inputCredential.deviceId)
            ?: inputCredential
        val now = System.currentTimeMillis()
        if (credential.accessExpiresAt > now + 120_000L) return credential
        require(credential.refreshExpiresAt > now) {
            "The device refresh credential expired. Re-enroll this terminal with the registered shop owner."
        }

        val payload = JSONObject()
            .put("action", "refresh")
            .put("shopId", credential.shopId)
            .put("deviceId", credential.deviceId)
            .put("refreshToken", credential.refreshToken)
        val request = Request.Builder()
            .url("${getSupabaseUrl()}/functions/v1/android-device-auth")
            .addHeader("apikey", getSupabaseApiKey())
            .addHeader("Content-Type", "application/json")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException("The server rejected this device refresh credential (HTTP ${response.code}).")
            }
            val result = JSONObject(raw)
            val next = credential.copy(
                accessToken = result.getString("accessToken"),
                refreshToken = result.getString("refreshToken"),
                accessExpiresAt = result.getLong("accessExpiresAt"),
                refreshExpiresAt = result.getLong("refreshExpiresAt")
            )
            AndroidDeviceCredentialStore.save(next)
            return next
        }
    }

    /**
     * Migrates project-key-signed legacy branch snapshots without restoring the old
     * global HMAC key to the APK. The Edge Function resolves the tenant from the
     * registered per-device credential and verifies the legacy signature server-side.
     * Current BBSHARE2 packets should still be verified locally with the shop key.
     */
    suspend fun verifyLegacyBranchShareWithDeviceCredential(token: String): Result<ShopImportSummary> =
        withContext(Dispatchers.IO) {
            val cleanToken = token.trim()
            if (!cleanToken.startsWith("BBSHARE1:") && !cleanToken.startsWith("BBSHARE2:")) {
                return@withContext Result.failure(IllegalArgumentException("The supplied branch token is not a supported signed DataShare package."))
            }
            if (!isConfigured()) {
                return@withContext Result.failure(IllegalStateException("Connect this terminal to BeBoss Cloud to verify this older signed branch package."))
            }
            val shopId = AndroidDeviceCredentialStore.currentShopId()
            val saved = AndroidDeviceCredentialStore.readForShop(shopId)
                ?: return@withContext Result.failure(
                    SecurityException("This terminal needs owner-approved device enrollment before it can migrate an older signed branch package.")
                )
            try {
                val active = refreshAndroidDeviceCredential(saved)
                val payload = JSONObject()
                    .put("action", "verify_device_branch_share")
                    .put("token", cleanToken)
                val request = Request.Builder()
                    .url("${getSupabaseUrl()}/functions/v1/beboss-desktop")
                    .addHeader("apikey", getSupabaseApiKey())
                    .addHeader("X-BeBoss-Device-ID", active.deviceId)
                    .addHeader("X-BeBoss-Device-Token", active.accessToken)
                    .addHeader("Content-Type", "application/json")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()
                client.newCall(request).execute().use { response ->
                    val raw = response.body?.string().orEmpty()
                    val result = runCatching { JSONObject(raw) }.getOrNull()
                    if (!response.isSuccessful || result?.optBoolean("ok") != true) {
                        val message = result?.optString("message").orEmpty()
                        throw IOException(message.ifBlank {
                            "The server could not verify this legacy DataShare token (HTTP ${response.code})."
                        })
                    }
                    val snapshot = result.optJSONObject("snapshot")
                        ?: throw IOException("The server returned no verified branch snapshot.")
                    val parsed = ShopDataTransferManager.parseShopPackageString(
                        snapshot.toString(),
                        enforceReplayProtection = true
                    )
                    Result.success(parsed)
                }
            } catch (error: Exception) {
                Result.failure(error)
            }
        }

    private fun buildRestRequest(
        path: String,
        useAdminJwtIfAvailable: Boolean = false,
        tenantSyncKey: String? = null
    ): Request.Builder {
        val url = "${getSupabaseUrl()}/rest/v1/$path"
        val key = getSupabaseAnonKey()
        val adminToken = if (useAdminJwtIfAvailable) ensureValidAdminSession()?.accessToken else null
        val builder = Request.Builder()
            .url(url)
            .addHeader("apikey", key)
            .addHeader("Content-Type", "application/json")

        // A modern sb_publishable_* key is an API gateway key, not a JWT. Sending
        // it as Authorization: Bearer causes PostgREST/Auth to reject it as an
        // invalid token. Use the admin user's JWT for protected reads; otherwise
        // only add a Bearer token for the legacy anon JWT format.
        when {
            !adminToken.isNullOrBlank() -> builder.addHeader("Authorization", "Bearer $adminToken")
            isLegacyJwtApiKey(key) -> builder.addHeader("Authorization", "Bearer $key")
        }
        if (!tenantSyncKey.isNullOrBlank()) {
            val shopId = tenantSyncKey.trim()
            when (val authorization = resolveAndroidTenantSyncAuthorization(
                hasEnrollmentMarker = AndroidDeviceCredentialStore.hasCredentialForShop(shopId),
                credential = AndroidDeviceCredentialStore.readForShop(shopId)
            )) {
                is AndroidTenantSyncAuthorization.Device -> {
                    // Refresh rotates the single-use credential under synchronization.
                    // A transient failure may leave this token expired, but it never
                    // authorizes fallback to the legacy tenant header.
                    val activeCredential = runCatching {
                        refreshAndroidDeviceCredential(authorization.credential)
                    }.onFailure {
                        Log.w(TAG, "Device credential refresh unavailable; legacy fallback is disabled.")
                    }.getOrDefault(authorization.credential)
                    builder
                        .addHeader("X-BeBoss-Device-ID", activeCredential.deviceId)
                        .addHeader("X-BeBoss-Device-Token", activeCredential.accessToken)
                }
                AndroidTenantSyncAuthorization.LegacyCompatibility -> {
                    // Compatibility path for older app builds. The server rejects this
                    // deterministic header after an owner retires legacy access for the shop.
                    builder.addHeader("X-Shop-Sync-Key", shopId)
                }
                AndroidTenantSyncAuthorization.Blocked -> {
                    // Enrollment marker exists but its Keystore-protected credentials
                    // are unavailable. Send no tenant header and fail closed.
                    Log.e(TAG, "Enrolled Android device credential is unavailable; cloud sync is blocked and legacy fallback is disabled.")
                }
            }
        }
        return builder
    }

    /**
     * Ask the trusted Supabase Edge Function to sign a BB3 code. The ECDSA private
     * key never enters this Android process or BuildConfig.
     */
    private suspend fun requestServerSignedBB3Code(paymentRequestId: String, verificationNote: String): Result<SupabaseSignedPaymentUnlock> = withContext(Dispatchers.IO) {
        val session = ensureValidAdminSession()
            ?: return@withContext Result.failure(IllegalStateException("Admin session expired. Sign in again."))
        if (!isConfigured()) {
            return@withContext Result.failure(IllegalStateException("Supabase connection is not configured."))
        }
        if (paymentRequestId.isBlank() || paymentRequestId.length > 200) {
            return@withContext Result.failure(IllegalArgumentException("A valid payment request is required to issue a BB3 code."))
        }
        try {
            val payload = JSONObject()
                .put("paymentRequestId", paymentRequestId.trim())
                .put("providerVerified", true)
                .put("verificationNote", verificationNote.trim())
            val req = Request.Builder()
                .url("${getSupabaseUrl()}/functions/v1/issue-bb3-unlock")
                .addHeader("apikey", getSupabaseAnonKey())
                .addHeader("Authorization", "Bearer ${session.accessToken}")
                .addHeader("Content-Type", "application/json")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                val json = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
                if (!response.isSuccessful) {
                    val message = json.optCleanString("message")
                        .ifBlank { json.optCleanString("error") }
                        .ifBlank { "Secure BB3 payment signing failed (HTTP ${response.code})." }
                    return@withContext Result.failure(IllegalStateException(message))
                }
                val code = json.optCleanString("code").trim()
                val digest = json.optCleanString("planDigest").trim().uppercase(Locale.ROOT)
                val returnedRequestId = json.optCleanString("requestId").trim()
                if (!SubscriptionSecurityManager.isCompleteUnlockCodeFormat(code) || !code.startsWith("BB3-")) {
                    return@withContext Result.failure(IllegalStateException("The BB3 signing service returned an invalid code."))
                }
                if (digest.length != 64 || !digest.all { it in "0123456789ABCDEF" } || returnedRequestId != paymentRequestId) {
                    return@withContext Result.failure(IllegalStateException("The signing service did not bind this code to the submitted payment request."))
                }
                Result.success(
                    SupabaseSignedPaymentUnlock(
                        code = code,
                        planDigest = digest,
                        requestId = returnedRequestId,
                        shopId = json.optCleanString("shopId"),
                        tierCode = json.optCleanString("tier"),
                        days = json.optInt("days", 0),
                        amountRwf = json.optInt("amountRwf", 0),
                        paymentTimeMs = json.optLong("paymentTimeMs", 0L)
                    )
                )
            }
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

    // -------------------------------------------------------------------------
    // REAL SUPABASE ADMIN AUTHENTICATION (GoTrue Email/Password JWT)
    // -------------------------------------------------------------------------
    suspend fun signInAdmin(email: String, password: String): Result<SupabaseAdminSession> = withContext(Dispatchers.IO) {
        val cleanEmail = email.trim().lowercase(Locale.ROOT)
        if (!isValidAdminLoginEmail(cleanEmail)) {
            return@withContext Result.failure(IllegalStateException("Enter a valid BeBoss administrator email address."))
        }
        if (password.isBlank()) {
            return@withContext Result.failure(IllegalStateException("Enter your administrator password."))
        }
        if (!isConfigured()) {
            return@withContext Result.failure(IllegalStateException("Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or the legacy SUPABASE_ANON_KEY) in app secrets."))
        }
        try {
            val payload = JSONObject().apply {
                put("email", cleanEmail)
                put("password", password)
            }
            val req = Request.Builder()
                .url("${getSupabaseUrl()}/auth/v1/token?grant_type=password")
                .addHeader("apikey", getSupabaseAnonKey())
                .addHeader("Content-Type", "application/json")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()

            client.newCall(req).execute().use { resp ->
                val raw = resp.body?.string().orEmpty()
                val json = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
                if (!resp.isSuccessful) {
                    val rawMessage = json.optCleanString("error_description")
                        .ifBlank { json.optCleanString("msg") }
                        .ifBlank { json.optCleanString("message") }
                        .ifBlank { "Sign in failed (HTTP ${resp.code})" }
                    val msg = if (rawMessage.contains("invalid login credentials", ignoreCase = true)) {
                        "Email or password is incorrect. Only accounts with an active BeBoss Super Admin role can sign in here."
                    } else rawMessage
                    return@withContext Result.failure(IllegalStateException(msg))
                }
                val session = parseAuthSession(json, cleanEmail)
                    ?: return@withContext Result.failure(IllegalStateException("Missing access token in Supabase response."))
                if (!verifyAdminAccess(session)) {
                    return@withContext Result.failure(IllegalStateException("This account does not have an active BeBoss Super Admin role. Ask an existing master admin to grant access in Admin Team."))
                }
                activeAdminSession = session
                logAdminAudit("ADMIN_LOGIN", session.email, "Signed in via Android Admin Console")
                Result.success(session)
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Public admin self-registration is deliberately disabled. Existing team
     * members are granted roles only by an authenticated master administrator.
     */
    suspend fun signUpAdmin(email: String, password: String, fullName: String): Result<SupabaseAdminSession> =
        Result.failure(
            IllegalStateException("Admin self-registration is disabled. Ask an existing BeBoss master admin to add this account in Admin Team.")
        )

    suspend fun signOutAdmin() = withContext(Dispatchers.IO) {
        val current = activeAdminSession
        activeAdminSession = null
        if (current != null && isConfigured()) {
            try {
                val req = Request.Builder()
                    .url("${getSupabaseUrl()}/auth/v1/logout")
                    .addHeader("apikey", getSupabaseAnonKey())
                    .addHeader("Authorization", "Bearer ${current.accessToken}")
                    .post("{}".toRequestBody(jsonMediaType))
                    .build()
                client.newCall(req).execute().close()
            } catch (_: Exception) {}
        }
    }

    private fun parseAuthSession(json: JSONObject, fallbackEmail: String, fallbackName: String = "BeBoss Admin"): SupabaseAdminSession? {
        val sessionObj = json.optJSONObject("session") ?: json
        val accessToken = sessionObj.optCleanString("access_token")
        if (accessToken.isBlank()) return null
        val refreshToken = sessionObj.optCleanString("refresh_token")
        val expiresIn = sessionObj.optLong("expires_in", 3600L)
        val userObj = json.optJSONObject("user") ?: sessionObj.optJSONObject("user") ?: JSONObject()
        val userId = userObj.optCleanString("id")
        val email = userObj.optCleanString("email").ifBlank { fallbackEmail.trim().lowercase(Locale.ROOT) }
        val metaName = userObj.optJSONObject("user_metadata")?.optCleanString("full_name").orEmpty()
        return SupabaseAdminSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            userId = userId,
            email = email,
            fullName = metaName.ifBlank { fallbackName },
            expiresAt = System.currentTimeMillis() + expiresIn * 1000L
        )
    }

    /**
     * The app never self-creates administrator roles. Access requires both
     * public.user_roles(role=admin) and an active SUPER_ADMIN profile from the
     * authenticated Supabase identity. RLS limits these reads to the signed-in user.
     */
    private fun verifyAdminAccess(session: SupabaseAdminSession): Boolean {
        if (!isValidAdminLoginEmail(session.email) || session.userId.isBlank()) return false
        val encodedUserId = URLEncoder.encode(session.userId, "UTF-8")
        val roleRequest = Request.Builder()
            .url("${getSupabaseUrl()}/rest/v1/user_roles?user_id=eq.$encodedUserId&role=eq.admin&select=user_id&limit=1")
            .addHeader("apikey", getSupabaseAnonKey())
            .addHeader("Authorization", "Bearer ${session.accessToken}")
            .get()
            .build()
        val hasAdminRole = client.newCall(roleRequest).execute().use { response ->
            if (!response.isSuccessful) {
                Log.w(TAG, "Admin role lookup rejected (HTTP ${response.code})")
                return false
            }
            JSONArray(response.body?.string().orEmpty().ifBlank { "[]" }).length() > 0
        }
        if (!hasAdminRole) return false

        val profileRequest = Request.Builder()
            .url("${getSupabaseUrl()}/rest/v1/admin_profiles?user_id=eq.$encodedUserId&role=eq.SUPER_ADMIN&is_active=eq.true&select=user_id&limit=1")
            .addHeader("apikey", getSupabaseAnonKey())
            .addHeader("Authorization", "Bearer ${session.accessToken}")
            .get()
            .build()
        return client.newCall(profileRequest).execute().use { response ->
            if (!response.isSuccessful) {
                Log.w(TAG, "Admin profile lookup rejected (HTTP ${response.code})")
                false
            } else {
                JSONArray(response.body?.string().orEmpty().ifBlank { "[]" }).length() > 0
            }
        }
    }

    // -------------------------------------------------------------------------
    // SYNCHRONOUS MULTI-BRANCH AUTO-SYNC SNAPSHOTS (`branch_sync_snapshots`)
    // -------------------------------------------------------------------------
    internal fun snapshotGenerationRowId(
        shopSyncKey: String,
        deviceId: String,
        syncGeneration: String,
        chunkIndex: Int
    ): String {
        require(shopSyncKey.isNotBlank()) { "A shop key is required for a snapshot row." }
        require(deviceId.isNotBlank()) { "A device ID is required for a snapshot row." }
        require(syncGeneration.isNotBlank()) { "A generation ID is required for a snapshot row." }
        require(chunkIndex >= 0) { "A snapshot chunk index cannot be negative." }
        return "${shopSyncKey}::${deviceId}::${syncGeneration}::chunk-$chunkIndex"
    }

    suspend fun upsertBranchSyncSnapshot(
        shopSyncKey: String,
        deviceId: String,
        syncGeneration: String,
        chunkIndex: Int,
        chunkCount: Int,
        branchId: String,
        branchName: String,
        shopName: String,
        ownerUsername: String,
        payloadToken: String,
        recordsSummary: String
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || payloadToken.isBlank()) return@withContext false
        try {
            upsertSnapshotWithNewColumns(
                shopSyncKey, deviceId, syncGeneration, chunkIndex, chunkCount,
                branchId, branchName, shopName, ownerUsername, payloadToken, recordsSummary
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // A schema without generation columns is unsafe for chunked sync: it
            // cannot distinguish an interrupted upload from a complete snapshot.
            // Fail closed and keep the durable outbox pending until migrations run.
            Log.e(TAG, "Snapshot upload failed; generation-aware schema is required: ${e.message}")
            false
        }
    }

    private suspend fun upsertSnapshotWithNewColumns(
        shopSyncKey: String,
        deviceId: String,
        syncGeneration: String,
        chunkIndex: Int,
        chunkCount: Int,
        branchId: String,
        branchName: String,
        shopName: String,
        ownerUsername: String,
        payloadToken: String,
        recordsSummary: String
    ): Boolean = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        val snapshotId = snapshotGenerationRowId(shopSyncKey, deviceId, syncGeneration, chunkIndex)
        val body = JSONObject().apply {
            put("id", snapshotId)
            put("shop_sync_key", shopSyncKey)
            put("device_id", deviceId)
            put("sync_generation", syncGeneration)
            put("chunk_index", chunkIndex)
            put("chunk_count", chunkCount)
            put("branch_id", branchId)
            put("branch_name", branchName)
            put("shop_name", shopName)
            put("owner_username", ownerUsername.trim().lowercase(Locale.ROOT))
            put("payload_token", payloadToken)
            put("records_summary", recordsSummary)
            put("updated_at", now)
        }
        val req = buildRestRequest("branch_sync_snapshots?on_conflict=id", tenantSyncKey = shopSyncKey)
            .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                val body = resp.body?.string() ?: ""
                if (body.contains("PGRST204") || body.contains("Could not find")) {
                    throw IOException("Schema missing columns: $body")
                }
                Log.w(TAG, "upsertBranchSyncSnapshot HTTP ${resp.code}: $body")
            }
            resp.isSuccessful
        }
    }

    suspend fun pruneUploadedSnapshotGenerations(
        shopSyncKey: String,
        deviceId: String,
        syncGeneration: String,
        keepGenerations: Int = 5
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || deviceId.isBlank() || syncGeneration.isBlank()) {
            return@withContext false
        }
        try {
            val payload = JSONObject()
                .put("p_shop_sync_key", shopSyncKey)
                .put("p_device_id", deviceId)
                .put("p_sync_generation", syncGeneration)
                .put("p_keep_generations", keepGenerations.coerceIn(2, 10))
            val req = buildRestRequest(
                "rpc/prune_branch_sync_snapshot_generations",
                tenantSyncKey = shopSyncKey
            )
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    Log.w(TAG, "Snapshot generation retention was deferred (HTTP ${response.code}): $body")
                }
                response.isSuccessful
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Snapshot generation retention was deferred: ${e.message}")
            false
        }
    }

    suspend fun fetchShopBranchSnapshots(
        shopSyncKey: String,
        excludingDeviceId: String = ""
    ): List<SupabaseBranchSnapshotDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext emptyList()
        try {
            val encKey = URLEncoder.encode(shopSyncKey, "UTF-8")
            val pageSize = 1000
            val list = mutableListOf<SupabaseBranchSnapshotDto>()
            var offset = 0
            while (true) {
                val req = buildRestRequest(
                    "branch_sync_snapshots?shop_sync_key=eq.$encKey&order=updated_at.asc&limit=$pageSize&offset=$offset",
                    tenantSyncKey = shopSyncKey
                )
                    .get()
                    .build()
                val page = client.newCall(req).execute().use { resp ->
                    val body = resp.body?.string().orEmpty()
                    if (!resp.isSuccessful) {
                        throw IOException("fetchShopBranchSnapshots HTTP ${resp.code}: $body")
                    }
                    val arr = JSONArray(body.ifBlank { "[]" })
                    (0 until arr.length()).map { i ->
                        val o = arr.getJSONObject(i)
                        SupabaseBranchSnapshotDto(
                            id = o.optCleanString("id"),
                            shopSyncKey = o.optCleanString("shop_sync_key"),
                            deviceId = o.optCleanString("device_id"),
                            syncGeneration = o.optCleanString("sync_generation"),
                            chunkIndex = o.optInt("chunk_index", 0),
                            chunkCount = o.optInt("chunk_count", 0),
                            branchId = o.optCleanString("branch_id"),
                            branchName = o.optCleanString("branch_name"),
                            shopName = o.optCleanString("shop_name"),
                            ownerUsername = o.optCleanString("owner_username"),
                            payloadToken = o.optCleanString("payload_token"),
                            recordsSummary = o.optCleanString("records_summary"),
                            updatedAt = o.optLong("updated_at", 0L)
                        )
                    }
                }
                list.addAll(page)
                if (page.size < pageSize) break
                offset += pageSize
            }
            if (excludingDeviceId.isBlank()) list else list.filter { snapshotDeviceBase(it.deviceId) != excludingDeviceId }
        } catch (e: Exception) {
            Log.e(TAG, "fetchShopBranchSnapshots error: ${e.message}")
            throw e
        }
    }

    fun latestCompleteSnapshotChunks(
        snapshots: List<SupabaseBranchSnapshotDto>
    ): List<SupabaseBranchSnapshotDto> =
        snapshots
            .groupBy { snapshotDeviceBase(it.deviceId) }
            .toSortedMap()
            .values
            .flatMap { deviceSnapshots ->
                val completeGeneration = deviceSnapshots
                    .groupBy { it.syncGeneration }
                    .values
                    .sortedByDescending { rows -> rows.maxOfOrNull { it.updatedAt } ?: 0L }
                    .firstNotNullOfOrNull { generationRows ->
                        if (generationRows.isEmpty()) return@firstNotNullOfOrNull null

                        val generation = generationRows.first().syncGeneration
                        if (generation.isBlank()) {
                            val expectedChunks = Regex("(\\d+) chunk\\(s\\)").find(generationRows.first().recordsSummary)
                                ?.groupValues?.getOrNull(1)?.toIntOrNull()
                                ?: generationRows.size
                            val legacyChunks = generationRows.filter {
                                (snapshotChunkIndex(it.deviceId) ?: it.chunkIndex) < expectedChunks
                            }
                            if (
                                completeChunkIndexes(
                                    legacyChunks.map { snapshotChunkIndex(it.deviceId) ?: it.chunkIndex },
                                    expectedChunks
                                )
                            ) {
                                legacyChunks.sortedBy { snapshotChunkIndex(it.deviceId) ?: it.chunkIndex }
                            } else {
                                null
                            }
                        } else {
                            val expectedChunks = generationRows.maxOfOrNull { it.chunkCount } ?: 0
                            if (
                                generationRows.all { it.syncGeneration == generation && it.chunkCount == expectedChunks } &&
                                completeChunkIndexes(generationRows.map { it.chunkIndex }, expectedChunks)
                            ) {
                                generationRows.sortedBy { it.chunkIndex }
                            } else {
                                null
                            }
                        }
                    }
                completeGeneration.orEmpty()
            }

    /**
     * Returns true when any peer's newest uploaded generation is not represented
     * by the newest complete generation selected for merging. This distinguishes
     * an empty shop (valid) from a peer whose first or latest multi-part upload is
     * only partially committed.
     */
    fun hasIncompleteLatestSnapshotGeneration(
        snapshots: List<SupabaseBranchSnapshotDto>,
        completeSnapshots: List<SupabaseBranchSnapshotDto>
    ): Boolean {
        if (snapshots.isEmpty()) return false

        val latestSnapshotByDevice = snapshots
            .groupBy { snapshotDeviceBase(it.deviceId) }
            .mapValues { (_, rows) -> rows.maxByOrNull { it.updatedAt } }

        val completeSnapshotByDevice = completeSnapshots
            .groupBy { snapshotDeviceBase(it.deviceId) }
            .mapValues { (_, rows) -> rows.maxByOrNull { it.updatedAt } }

        return latestSnapshotByDevice.any { (deviceId, latest) ->
            val complete = completeSnapshotByDevice[deviceId]
            complete == null ||
                complete.syncGeneration != latest?.syncGeneration ||
                complete.updatedAt < (latest?.updatedAt ?: 0L)
        }
    }

    private fun snapshotDeviceBase(deviceId: String): String =
        deviceId.replace(Regex("#c\\d+$"), "")

    private fun snapshotChunkIndex(deviceId: String): Int? =
        Regex("#c(\\d+)$").find(deviceId)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: if ("#c" !in deviceId) 0 else null

    private fun completeChunkIndexes(indexes: List<Int?>, expectedCount: Int): Boolean =
        expectedCount > 0 &&
            indexes.size == expectedCount &&
            indexes.all { it != null && it in 0 until expectedCount } &&
            indexes.filterNotNull().toSet().size == expectedCount

    /**
     * Reads only the release explicitly marked current and public in Supabase.
     * The private storage path remains server-side; only public metadata is returned.
     */
    suspend fun fetchCurrentPublicAndroidRelease(): AndroidAppRelease? = withContext(Dispatchers.IO) {
        if (!isConfigured()) {
            throw IOException("BeBoss cloud configuration is unavailable. Updates cannot be checked right now.")
        }
        try {
            val path = "app_releases?select=id,version_name,version_code,file_name,size_bytes,sha256,min_android,release_notes&is_current=eq.true&is_public=eq.true&limit=1"
            val request = buildRestRequest(path).get().build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val status = response.code
                    val detail = response.body?.string().orEmpty().take(180)
                    throw IOException(
                        detail.ifBlank { "The public release service returned HTTP $status." }
                    )
                }
                val releases = JSONArray(response.body?.string().orEmpty())
                // An empty public result is a real "no public release" state; a
                // transport, gateway, RLS or server error is not.
                if (releases.length() == 0) return@withContext null
                val row = releases.getJSONObject(0)
                val release = AndroidAppRelease(
                    id = row.optString("id").trim(),
                    versionName = row.optString("version_name").trim(),
                    versionCode = row.optLong("version_code", 0L),
                    fileName = row.optString("file_name").trim(),
                    sizeBytes = row.optLong("size_bytes", 0L),
                    sha256 = row.optString("sha256").trim().lowercase(Locale.ROOT),
                    minimumAndroid = row.optString("min_android").trim(),
                    releaseNotes = row.optString("release_notes").trim()
                )
                if (!release.hasValidPublicMetadata()) {
                    Log.e(TAG, "The current public Android release metadata failed validation.")
                    throw IOException("The public Android release metadata is incomplete or invalid.")
                }
                release
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: IOException) {
            Log.w(TAG, "Could not check for a public Android update: ${error.message}")
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Could not check for a public Android update: ${error.message}")
            throw IOException("Could not reach the BeBoss update service. Your shop data remains available.", error)
        }
    }

    /**
     * Downloads a public APK only through the rate-limited Edge Function.
     * Redirect origin, exact published size and SHA-256 are verified before
     * the file is returned to Android's system package installer.
     */
    suspend fun downloadPublicAndroidRelease(
        context: Context,
        release: AndroidAppRelease
    ): File = withContext(Dispatchers.IO) {
        if (!isConfigured()) throw IOException("BeBoss cloud configuration is unavailable.")
        if (!release.hasValidPublicMetadata()) {
            throw IOException("The published APK metadata is invalid. Refresh the update check.")
        }

        val projectUrl = URL(getSupabaseUrl())
        if (!projectUrl.protocol.equals("https", ignoreCase = true)) {
            throw IOException("Secure HTTPS is required to download BeBoss updates.")
        }

        val encodedId = URLEncoder.encode(release.id, StandardCharsets.UTF_8.name())
        val endpoint = "${getSupabaseUrl()}/functions/v1/public-apk-download?release=$encodedId&ch=android"
        val redirectRequest = Request.Builder()
            .url(endpoint)
            .header("apikey", getSupabaseApiKey())
            .get()
            .build()

        val signedUrl = client.newCall(redirectRequest).execute().use { response ->
            if (response.code != 302) {
                val detail = response.body?.string().orEmpty().take(240)
                throw IOException(
                    when (response.code) {
                        404 -> "This APK is no longer publicly published."
                        429 -> "Too many update requests. Please retry shortly."
                        else -> detail.ifBlank { "The update service returned HTTP ${response.code}." }
                    }
                )
            }
            val location = response.header("Location")
                ?: throw IOException("The update service did not return a signed APK URL.")
            val resolved = URL(projectUrl, location)
            if (!resolved.protocol.equals("https", ignoreCase = true) ||
                !resolved.host.equals(projectUrl.host, ignoreCase = true) ||
                resolved.userInfo != null) {
                throw IOException("The update service returned an untrusted download location.")
            }
            resolved
        }

        val updatesDirectory = File(context.cacheDir, "verified-apk-updates")
        if (!updatesDirectory.exists() && !updatesDirectory.mkdirs()) {
            throw IOException("BeBoss could not prepare its private update cache.")
        }
        val safeName = release.fileName.replace(Regex("[^A-Za-z0-9._-]"), "_").take(140)
        val destination = File(updatesDirectory, "BeBoss-${release.versionCode}-$safeName")
        val partial = File(updatesDirectory, "BeBoss-${release.versionCode}.download")

        try {
            val downloadRequest = Request.Builder().url(signedUrl).get().build()
            client.newCall(downloadRequest).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IOException("The APK download failed with HTTP ${response.code}.")
                }
                val body = response.body ?: throw IOException("The APK download was empty.")
                if (body.contentLength() > 512L * 1024L * 1024L) {
                    throw IOException("The downloaded APK exceeds the supported size limit.")
                }
                val digest = MessageDigest.getInstance("SHA-256")
                var received = 0L
                body.byteStream().use { input ->
                    FileOutputStream(partial, false).use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            if (count == 0) continue
                            received += count
                            if (received > release.sizeBytes || received > 512L * 1024L * 1024L) {
                                throw IOException("The downloaded APK is larger than the published release.")
                            }
                            digest.update(buffer, 0, count)
                            output.write(buffer, 0, count)
                        }
                        output.fd.sync()
                    }
                }
                if (received != release.sizeBytes) {
                    throw IOException("APK size verification failed. Expected ${release.sizeBytes} bytes, received $received bytes.")
                }
                val actualHash = digest.digest().joinToString("") { byte ->
                    "%02x".format(Locale.ROOT, byte)
                }
                if (!MessageDigest.isEqual(
                        actualHash.toByteArray(Charsets.US_ASCII),
                        release.sha256.toByteArray(Charsets.US_ASCII)
                    )) {
                    throw IOException("APK integrity verification failed. The file was not made installable.")
                }
            }

            // Verify archive identity, version, SDK compatibility and the pinned BeBoss
            // production signer before exposing it to Android's package installer.
            val archiveFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageManager.GET_SIGNING_CERTIFICATES
            } else {
                @Suppress("DEPRECATION")
                PackageManager.GET_SIGNATURES
            }
            @Suppress("DEPRECATION")
            val archiveInfo = context.packageManager.getPackageArchiveInfo(partial.absolutePath, archiveFlags)
                ?: throw IOException("The downloaded file is not a valid Android APK.")
            if (archiveInfo.packageName != context.packageName) {
                throw IOException("The published APK belongs to a different Android application.")
            }
            val signerCertificates = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                archiveInfo.signingInfo?.apkContentsSigners?.toList().orEmpty()
            } else {
                archiveInfo.signatures?.toList().orEmpty()
            }
            if (signerCertificates.size != 1 ||
                !release.hasExpectedSigningCertificate(
                    signerCertificates.singleOrNull()?.toByteArray() ?: ByteArray(0),
                    BuildConfig.ANDROID_RELEASE_CERT_SHA256
                )) {
                throw IOException("The APK signing certificate does not match the official BeBoss production key. The update was blocked.")
            }
            val archiveVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                archiveInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                archiveInfo.versionCode.toLong()
            }
            if (archiveVersionCode != release.versionCode ||
                archiveInfo.versionName != release.versionName) {
                throw IOException("The APK's internal version does not match the published release metadata.")
            }
            val archiveMinSdk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                archiveInfo.applicationInfo?.minSdkVersion ?: 1
            } else {
                1
            }
            if (Build.VERSION.SDK_INT < archiveMinSdk) {
                throw IOException("This update requires Android API $archiveMinSdk or later.")
            }

            if (destination.exists() && !destination.delete()) {
                throw IOException("BeBoss could not replace an older cached update file.")
            }
            if (!partial.renameTo(destination)) {
                partial.copyTo(destination, overwrite = true)
                partial.delete()
            }
            destination
        } catch (error: Exception) {
            partial.delete()
            throw error
        }
    }

    // -------------------------------------------------------------------------
    // GLOBAL ADMIN PAYMENT & WHATSAPP CONFIG (`app_config`)
    // -------------------------------------------------------------------------
    suspend fun fetchPublicAppConfig(): AdminPaymentConfig? = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext null
        try {
            val req = buildRestRequest("app_config?id=eq.global&limit=1").get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                if (arr.length() == 0) return@withContext null
                val o = arr.getJSONObject(0)
                AdminPaymentConfig(
                    adminWhatsAppNumber = o.optCleanString("admin_whatsapp_number"),
                    mtnMoMoCode = o.optCleanString("mtn_momo_code", ""),
                    mtnMoMoPhone = o.optCleanString("mtn_momo_phone", ""),
                    mtnRecipientName = o.optCleanString("mtn_recipient_name", ""),
                    airtelMoneyPhone = o.optCleanString("airtel_money_phone", ""),
                    airtelRecipientName = o.optCleanString("airtel_recipient_name", ""),
                    perDeviceFeeRwf = OfflineSubscriptionManager.PER_EXTRA_DEVICE_FEE_RWF,
                    apkDownloadUrl = o.optCleanString("apk_download_url", ""),
                    apkVersion = o.optCleanString("apk_version", "2.3.0").ifBlank { "2.3.0" },
                    updatedAt = o.optLong("updated_at", 0L)
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchPublicAppConfig error: ${e.message}")
            null
        }
    }

    suspend fun adminSaveAppConfig(config: AdminPaymentConfig): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || ensureValidAdminSession() == null) return@withContext false
        try {
            val now = System.currentTimeMillis()
            val payload = JSONObject().apply {
                put("id", "global")
                put("admin_whatsapp_number", config.adminWhatsAppNumber.trim())
                put("mtn_momo_code", config.mtnMoMoCode.trim())
                put("mtn_momo_phone", config.mtnMoMoPhone.trim())
                put("mtn_recipient_name", config.mtnRecipientName.trim())
                put("airtel_money_phone", config.airtelMoneyPhone.trim())
                put("airtel_recipient_name", config.airtelRecipientName.trim())
                put("per_device_fee_rwf", OfflineSubscriptionManager.PER_EXTRA_DEVICE_FEE_RWF)
                put("apk_download_url", config.apkDownloadUrl.trim())
                put("apk_version", config.apkVersion.trim().ifBlank { "2.3.0" })
                put("updated_at", now)
            }
            val req = buildRestRequest("app_config?on_conflict=id", useAdminJwtIfAvailable = true)
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                logAdminAudit(
                    "UPDATE_PAYMENT_CONFIG",
                    "global",
                    "WhatsApp=${config.adminWhatsAppNumber}, MTN=${config.mtnMoMoCode}/${config.mtnMoMoPhone}, Airtel=${config.airtelMoneyPhone}, PerDevice=${config.perDeviceFeeRwf}"
                )
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "adminSaveAppConfig error: ${e.message}")
            false
        }
    }

    // -------------------------------------------------------------------------
    // SHOP ACCOUNTS & SUBSCRIPTION LICENSING
    // -------------------------------------------------------------------------
    suspend fun upsertShopAccount(
        shopProfile: ShopProfile,
        ownerUser: User?,
        branchCount: Int,
        workerCount: Int,
        deviceCount: Int = 1,
        shopSyncKeyOverride: String? = null,
        shopOwnerUsernameOverride: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext false
        try {
            val registeredOwner = ownerUser?.takeIf { it.role == UserRole.OWNER }
            val username = registeredOwner?.username?.trim()?.lowercase(Locale.ROOT)
                ?: shopOwnerUsernameOverride?.trim()?.lowercase(Locale.ROOT)
                ?: shopProfile.email.substringBefore("@").trim().lowercase(Locale.ROOT)
            val rawPhone = registeredOwner?.phone?.ifBlank { shopProfile.phone } ?: shopProfile.phone
            val phoneDigits = rawPhone.filter { it.isDigit() }.takeLast(9)
            if (username.length < 2 || !username.matches(Regex("[a-z0-9._-]{2,80}")) ||
                phoneDigits.length != 9 || shopProfile.shopName.isBlank()) {
                Log.w(TAG, "upsertShopAccount skipped: a verified owner username, phone and shop name are required.")
                return@withContext false
            }
            // Paired devices pass the server-issued tenant key so the current cashier/manager
            // can never derive a different account ID from their own login identity.
            val accountId = shopSyncKeyOverride?.takeIf { it.isNotBlank() }
                ?: computeShopSyncKey(username, rawPhone)
            val deviceCode = SubscriptionSecurityManager.computeDeviceChallenge(shopProfile)
            val safeDevices = deviceCount.coerceAtLeast(1)
            val pricing = OfflineSubscriptionManager.calculateSubscriptionPrice(branchCount, workerCount, 1, safeDevices)

            // Check existing cloud shop account so offline client never overwrites a newer Admin Direct Auto-Unlock or status
            val existingRemote = fetchShopAccountById(accountId)
            // Only preserve remote entitlement state when that remote account was
            // updated at or after this device's validated shop baseline. This prevents
            // an old account keyed by the same owner username/phone from extending a
            // newly registered four-day trial.
            val trustedRemoteLicense = existingRemote?.takeIf {
                it.updatedAt > shopProfile.trialStartedAt
            }
            val effectiveStatus = when {
                trustedRemoteLicense != null &&
                    trustedRemoteLicense.autoUnlockedAt > shopProfile.lastAppliedCloudUnlockAt ->
                    trustedRemoteLicense.subscriptionStatus
                trustedRemoteLicense != null &&
                    trustedRemoteLicense.subscriptionStatus == ShopProfile.STATUS_ACTIVE &&
                    trustedRemoteLicense.subscriptionExpiresAt > shopProfile.subscriptionExpiresAt ->
                    trustedRemoteLicense.subscriptionStatus
                trustedRemoteLicense != null &&
                    trustedRemoteLicense.subscriptionStatus == ShopProfile.STATUS_SUSPENDED &&
                    trustedRemoteLicense.updatedAt >= shopProfile.updatedAt ->
                    trustedRemoteLicense.subscriptionStatus
                shopProfile.isPaidActive -> ShopProfile.STATUS_ACTIVE
                shopProfile.isFreeTrial -> ShopProfile.STATUS_TRIAL
                shopProfile.isSuspended -> ShopProfile.STATUS_SUSPENDED
                else -> ShopProfile.STATUS_EXPIRED
            }
            val effectiveExpiry = maxOf(
                shopProfile.subscriptionExpiresAt,
                trustedRemoteLicense?.subscriptionExpiresAt ?: 0L
            )

            val payload = JSONObject().apply {
                put("id", accountId)
                put("shop_name", shopProfile.shopName)
                put("business_type", BusinessCatalog.normalize(shopProfile.businessType))
                put("owner_name", registeredOwner?.name?.ifBlank { shopProfile.name } ?: shopProfile.name)
                put("owner_username", username)
                put("owner_phone", rawPhone)
                put("device_challenge", deviceCode)
                put("branch_count", branchCount.coerceAtLeast(1))
                put("worker_count", workerCount.coerceAtLeast(1))
                put("device_count", safeDevices)
                put("device_limit", maxOf(shopProfile.deviceCountLimit, safeDevices, existingRemote?.deviceLimit ?: 1))
                put("admin_whatsapp", shopProfile.adminWhatsAppNumber.ifBlank { existingRemote?.adminWhatsApp.orEmpty() })
                put("monthly_fee_rwf", pricing.monthlySubtotal)
                put("subscription_status", effectiveStatus)
                put("subscription_expires_at", effectiveExpiry)
                put("updated_at", System.currentTimeMillis())
            }

            val req = buildRestRequest("shop_accounts?on_conflict=id", tenantSyncKey = accountId)
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()

            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "upsertShopAccount HTTP ${resp.code}: ${resp.body?.string()}")
                }
                resp.isSuccessful
            }
        } catch (e: Exception) {
            Log.e(TAG, "upsertShopAccount error: ${e.message}")
            false
        }
    }

    /**
     * Read the random 256-bit LAN pairing key belonging to the current shop.
     * RLS scopes the row using X-Shop-Sync-Key; only the matching shop record is selected.
     */
    suspend fun fetchShopLanSyncSecret(shopSyncKey: String): String? = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext null
        try {
            val enc = URLEncoder.encode(shopSyncKey.trim(), "UTF-8")
            val req = buildRestRequest(
                "shop_accounts?select=lan_sync_secret&id=eq.$enc&limit=1",
                tenantSyncKey = shopSyncKey
            ).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "fetchShopLanSyncSecret HTTP ${resp.code}: ${resp.body?.string()}")
                    return@withContext null
                }
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                val secret = arr.optJSONObject(0)?.optCleanString("lan_sync_secret").orEmpty()
                    .trim().lowercase(Locale.ROOT)
                secret.takeIf { it.matches(Regex("[a-f0-9]{64}")) }
            }
        } catch (error: Exception) {
            Log.w(TAG, "fetchShopLanSyncSecret failed: ${error.message}")
            null
        }
    }

    suspend fun fetchShopAccountById(accountId: String): SupabaseShopAccountDto? = withContext(Dispatchers.IO) {
        if (!isConfigured() || accountId.isBlank()) return@withContext null
        try {
            val enc = URLEncoder.encode(accountId, "UTF-8")
            val req = buildRestRequest("shop_accounts?id=eq.$enc&limit=1", tenantSyncKey = accountId).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                if (arr.length() == 0) return@withContext null
                parseShopAccountDto(arr.getJSONObject(0))
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchShopAccountById error: ${e.message}")
            null
        }
    }

    // -------------------------------------------------------------------------
    // SINGLE-SHOP MULTI-DEVICE REGISTRY (`shop_devices`)
    // -------------------------------------------------------------------------
    suspend fun upsertShopDevice(
        shopSyncKey: String,
        shopName: String,
        device: ShopDevice
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext false
        try {
            val payload = JSONObject().apply {
                put("id", device.id)
                put("shop_sync_key", shopSyncKey)
                put("shop_name", shopName)
                put("device_id", device.deviceId)
                put("device_name", device.deviceName)
                put("join_code", "")
                put("assigned_user_id", device.assignedUserId)
                put("assigned_username", device.assignedUsername.trim().lowercase(Locale.ROOT))
                put("assigned_user_name", device.assignedUserName)
                put("role", device.role)
                put("branch_id", device.branchId)
                put("branch_name", device.branchName)
                put("is_owner_primary", device.isOwnerPrimary)
                put("is_active", device.isActive)
                put("monthly_fee_addon_rwf", if (device.isOwnerPrimary) 0 else OfflineSubscriptionManager.PER_EXTRA_DEVICE_FEE_RWF)
                put("last_synced_at", device.lastSyncedAt)
                put("created_at", device.createdAt)
                put("updated_at", device.updatedAt)
            }
            val req = buildRestRequest("shop_devices?on_conflict=id", tenantSyncKey = shopSyncKey)
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "upsertShopDevice HTTP ${resp.code}: ${resp.body?.string()}")
                }
                resp.isSuccessful
            }
        } catch (e: Exception) {
            Log.e(TAG, "upsertShopDevice error: ${e.message}")
            false
        }
    }

    /**
     * Creates a high-entropy, short-lived device invitation. The plaintext is returned
     * to the issuing owner/branch manager only and is never uploaded to shop_devices.
     */
    fun generateShopDeviceJoinCode(): String {
        val bytes = ByteArray(16)
        SecureRandom().nextBytes(bytes)
        val token = bytes.joinToString("") { byte -> "%02X".format(byte.toInt() and 0xff) }
        return "BB-$token"
    }

    private fun hashShopDeviceJoinCode(joinCode: String): String {
        val normalized = joinCode.trim().uppercase(Locale.ROOT)
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(normalized.toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
    }

    suspend fun issueShopDeviceInvite(
        shopSyncKey: String,
        deviceRecordId: String,
        joinCode: String,
        createdByDeviceId: String,
        createdByUserId: String,
        branchId: String,
        expiresAt: Long
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || joinCode.isBlank()) return@withContext false
        try {
            val payload = JSONObject()
                .put("p_shop_sync_key", shopSyncKey)
                .put("p_device_record_id", deviceRecordId)
                .put("p_code_hash", hashShopDeviceJoinCode(joinCode))
                .put("p_created_by_device_id", createdByDeviceId)
                .put("p_created_by_user_id", createdByUserId)
                .put("p_branch_id", branchId)
                .put("p_expires_at", expiresAt)
            val req = buildRestRequest("rpc/issue_shop_device_invite", tenantSyncKey = shopSyncKey)
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "issueShopDeviceInvite HTTP ${response.code}: ${response.body?.string()}")
                }
                response.isSuccessful
            }
        } catch (e: Exception) {
            Log.e(TAG, "issueShopDeviceInvite error: ${e.message}")
            false
        }
    }

    /**
     * Atomically claims a one-time cloud invite for this physical installation.
     * The database binds the slot to the stable hardware ID and rejects reuse elsewhere.
     */
    suspend fun redeemShopDeviceInvite(
        shopSyncKey: String,
        joinCode: String,
        hardwareDeviceId: String,
        deviceName: String
    ): SupabaseShopDeviceDto? = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || joinCode.isBlank() || hardwareDeviceId.isBlank()) {
            return@withContext null
        }
        try {
            val payload = JSONObject()
                .put("p_shop_sync_key", shopSyncKey)
                .put("p_code_hash", hashShopDeviceJoinCode(joinCode))
                .put("p_device_id", hardwareDeviceId)
                .put("p_device_name", deviceName.trim().take(120))
            val req = buildRestRequest("rpc/redeem_shop_device_invite", tenantSyncKey = shopSyncKey)
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    Log.w(TAG, "redeemShopDeviceInvite HTTP ${response.code}: $raw")
                    return@withContext null
                }
                parseShopDeviceDto(JSONObject(raw))
            }
        } catch (e: Exception) {
            Log.e(TAG, "redeemShopDeviceInvite error: ${e.message}")
            null
        }
    }

    suspend fun revokeShopDeviceInvites(
        shopSyncKey: String,
        deviceRecordId: String,
        actorDeviceId: String,
        actorUserId: String
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || deviceRecordId.isBlank()) return@withContext false
        try {
            val payload = JSONObject()
                .put("p_shop_sync_key", shopSyncKey)
                .put("p_device_record_id", deviceRecordId)
                .put("p_actor_device_id", actorDeviceId)
                .put("p_actor_user_id", actorUserId)
            val req = buildRestRequest("rpc/revoke_shop_device_invites", tenantSyncKey = shopSyncKey)
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    Log.w(TAG, "revokeShopDeviceInvites HTTP ${response.code}: $raw")
                    return@withContext false
                }
                raw.trim().equals("true", ignoreCase = true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "revokeShopDeviceInvites error: ${e.message}")
            false
        }
    }

    suspend fun setShopDeviceActive(
        shopSyncKey: String,
        deviceRecordId: String,
        actorDeviceId: String,
        actorUserId: String,
        isActive: Boolean
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || deviceRecordId.isBlank() ||
            actorDeviceId.isBlank() || actorUserId.isBlank()
        ) return@withContext false
        try {
            val payload = JSONObject()
                .put("p_shop_sync_key", shopSyncKey)
                .put("p_device_record_id", deviceRecordId)
                .put("p_actor_device_id", actorDeviceId)
                .put("p_actor_user_id", actorUserId)
                .put("p_is_active", isActive)
            val req = buildRestRequest("rpc/set_shop_device_active", tenantSyncKey = shopSyncKey)
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    Log.w(TAG, "setShopDeviceActive HTTP ${response.code}: $raw")
                    return@withContext false
                }
                raw.trim().equals("true", ignoreCase = true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "setShopDeviceActive error: ${e.message}")
            false
        }
    }

    suspend fun deleteShopDeviceAuthorized(
        shopSyncKey: String,
        deviceRecordId: String,
        actorDeviceId: String,
        actorUserId: String
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || deviceRecordId.isBlank() ||
            actorDeviceId.isBlank() || actorUserId.isBlank()
        ) return@withContext false
        try {
            val payload = JSONObject()
                .put("p_shop_sync_key", shopSyncKey)
                .put("p_device_record_id", deviceRecordId)
                .put("p_actor_device_id", actorDeviceId)
                .put("p_actor_user_id", actorUserId)
            val req = buildRestRequest("rpc/delete_shop_device", tenantSyncKey = shopSyncKey)
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    Log.w(TAG, "deleteShopDeviceAuthorized HTTP ${response.code}: $raw")
                    return@withContext false
                }
                raw.trim().equals("true", ignoreCase = true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "deleteShopDeviceAuthorized error: ${e.message}")
            false
        }
    }

    suspend fun fetchShopDevicesForShop(shopSyncKey: String): List<SupabaseShopDeviceDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext emptyList()
        try {
            val enc = URLEncoder.encode(shopSyncKey, "UTF-8")
            val req = buildRestRequest(
                "shop_devices?shop_sync_key=eq.$enc&order=is_owner_primary.desc,created_at.asc&limit=100",
                tenantSyncKey = shopSyncKey
            ).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseShopDeviceDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchShopDevicesForShop error: ${e.message}")
            emptyList()
        }
    }

    suspend fun deleteShopDeviceInCloud(shopSyncKey: String, deviceRecordId: String, useAdmin: Boolean = false): Boolean =
        withContext(Dispatchers.IO) {
            if (!isConfigured() || deviceRecordId.isBlank()) return@withContext false
            try {
                val req = buildRestRequest(
                    "shop_devices?id=eq.${URLEncoder.encode(deviceRecordId, "UTF-8")}",
                    useAdminJwtIfAvailable = useAdmin,
                    tenantSyncKey = if (useAdmin) null else shopSyncKey
                ).delete().build()
                val ok = client.newCall(req).execute().use { it.isSuccessful }
                if (ok && useAdmin) {
                    logAdminAudit("DELETE_DEVICE", deviceRecordId, "Removed device $deviceRecordId")
                }
                ok
            } catch (e: Exception) {
                Log.e(TAG, "deleteShopDeviceInCloud error: ${e.message}")
                false
            }
        }

    suspend fun fetchAllShopDevices(limit: Int = 250, offset: Int = 0): List<SupabaseShopDeviceDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || ensureValidAdminSession() == null) return@withContext emptyList()
        try {
            val req = buildRestRequest(
                "shop_devices?order=updated_at.desc&limit=${limit.coerceIn(1, 500)}&offset=${offset.coerceAtLeast(0)}",
                useAdminJwtIfAvailable = true
            )
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseShopDeviceDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAllShopDevices error: ${e.message}")
            emptyList()
        }
    }

    suspend fun adminToggleShopDeviceActive(device: SupabaseShopDeviceDto, isActive: Boolean): Boolean =
        withContext(Dispatchers.IO) {
            if (!isConfigured() || ensureValidAdminSession() == null) return@withContext false
            try {
                val patch = JSONObject().apply {
                    put("is_active", isActive)
                    put("updated_at", System.currentTimeMillis())
                }
                val req = buildRestRequest(
                    "shop_devices?id=eq.${URLEncoder.encode(device.id, "UTF-8")}",
                    useAdminJwtIfAvailable = true
                ).patch(patch.toString().toRequestBody(jsonMediaType)).build()
                val ok = client.newCall(req).execute().use { it.isSuccessful }
                if (ok) {
                    logAdminAudit("TOGGLE_DEVICE", device.deviceName, "${device.shopName}: is_active=$isActive")
                }
                ok
            } catch (e: Exception) {
                Log.e(TAG, "adminToggleShopDeviceActive error: ${e.message}")
                false
            }
        }

    suspend fun pushDeviceTelemetry(
        shopSyncKey: String,
        shopName: String,
        deviceId: String,
        deviceName: String,
        integrity: DeviceIntegrityStatus,
        clockTamper: ClockTamperStatus,
        location: CapturedLocation?,
        unsyncedMessagesCount: Int,
        permissionsSummary: String,
        messageSummaryJson: String,
        devicePlatform: String = "ANDROID",
        manufacturer: String = "",
        model: String = "",
        osRelease: String = "",
        sdkInt: Int = 0,
        appVersion: String = "",
        appBuild: Int = 0,
        localeTag: String = "",
        timezoneId: String = ""
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || deviceId.isBlank()) return@withContext false
        val now = ClockGuard.effectiveNowMs()
        var telemetryOk = false

        try {
            val payload = JSONObject().apply {
                put("id", "${shopSyncKey}::${deviceId}")
                put("shop_sync_key", shopSyncKey)
                put("shop_name", shopName)
                put("device_id", deviceId)
                put("device_name", deviceName)
                val normalizedPlatform = devicePlatform.trim().uppercase(Locale.ROOT)
                put("device_platform", normalizedPlatform.takeIf {
                    it in setOf("ANDROID", "DESKTOP", "IOS", "OTHER")
                } ?: "OTHER")
                put("manufacturer", manufacturer.trim().take(120))
                put("model", model.trim().take(120))
                put("os_release", osRelease.trim().take(80))
                put("sdk_int", sdkInt.coerceAtLeast(0))
                put("app_version", appVersion.trim().take(60))
                put("app_build", appBuild.coerceAtLeast(0))
                put("locale_tag", localeTag.trim().take(40))
                put("timezone_id", timezoneId.trim().take(80))
                put("risk_score", integrity.riskScore)
                put("posture_label", integrity.postureLabel)
                put("is_rooted", integrity.isRooted)
                put("has_hooking", integrity.hasHookingFramework)
                put("is_emulator", integrity.isEmulator)
                put("clock_rollback_detected", clockTamper.rollbackDetected || clockTamper.activeTamperLock)
                put("tamper_incident_count", clockTamper.incidentCount)
                put("clock_skew_ms", clockTamper.skewMillis)
                put("tamper_reason", clockTamper.reason)
                put("keystore_backing", integrity.keystoreBacking)
                put("signals_json", JSONArray(integrity.signals).toString())
                put("latitude", location?.latitude ?: 0.0)
                put("longitude", location?.longitude ?: 0.0)
                put("accuracy_meters", location?.accuracyMeters ?: 0f)
                put("location_captured_at", location?.capturedAtMs ?: 0L)
                put("location_label", location?.compactLabel() ?: "Unavailable")
                put("unsynced_messages_count", unsyncedMessagesCount)
                val parsedSummaryJson = try {
                    if (messageSummaryJson.isBlank()) JSONObject() else JSONObject(messageSummaryJson)
                } catch (_: Exception) {
                    JSONObject()
                }
                put("message_summary_json", parsedSummaryJson)
                put("permissions_summary", permissionsSummary)
                put("inspected_at", integrity.inspectedAtMs)
                put("updated_at", now)
            }
            val req = buildRestRequest("device_security_telemetry?on_conflict=id", tenantSyncKey = shopSyncKey)
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { resp ->
                telemetryOk = resp.isSuccessful
            }
        } catch (_: Exception) {
            telemetryOk = false
        }

        var heartbeatOk = false
        try {
            val encShop = URLEncoder.encode(shopSyncKey, "UTF-8")
            val encDev = URLEncoder.encode(deviceId, "UTF-8")
            val patch = JSONObject().apply {
                put("last_synced_at", now)
                put("updated_at", now)
            }
            val req = buildRestRequest(
                "shop_devices?shop_sync_key=eq.$encShop&device_id=eq.$encDev",
                tenantSyncKey = shopSyncKey
            ).patch(patch.toString().toRequestBody(jsonMediaType)).build()
            client.newCall(req).execute().use { resp ->
                heartbeatOk = resp.isSuccessful
            }
        } catch (_: Exception) {}

        if ((integrity.isCompromisedRisk || clockTamper.rollbackDetected || clockTamper.activeTamperLock) &&
            activeAdminSession != null
        ) {
            val locInfo = location?.takeIf { it.isAvailable }?.compactLabel() ?: "No GPS"
            val reasonText = clockTamper.reason.ifBlank { integrity.signals.joinToString(", ") }.ifBlank { integrity.postureLabel }
            logAdminAudit(
                action = "DEVICE_SECURITY_ALERT",
                targetId = deviceId,
                details = "$shopName ($deviceName) • Risk=${integrity.riskScore}/100 • $reasonText • Loc=$locInfo • OutboundMsgs=$unsyncedMessagesCount"
            )
        }

        if (!heartbeatOk && telemetryOk) {
            Log.w(TAG, "Security telemetry saved, but the separate shop-device heartbeat update failed for $deviceId")
        }
        telemetryOk
    }

    suspend fun fetchAdminCloudSyncEvents(
        limit: Int = 200,
        offset: Int = 0
    ): List<SupabaseCloudSyncEventDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || ensureValidAdminSession() == null) return@withContext emptyList()
        try {
            val req = buildRestRequest(
                "cloud_sync_events?select=id,shop_sync_key,shop_name,entity,action,actor,device_id,detail,created_at&order=created_at.desc&limit=${limit.coerceIn(1, 500)}&offset=${offset.coerceAtLeast(0)}",
                useAdminJwtIfAvailable = true
            ).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "fetchAdminCloudSyncEvents returned HTTP ${resp.code}")
                    return@withContext emptyList()
                }
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { index ->
                    val event = arr.getJSONObject(index)
                    SupabaseCloudSyncEventDto(
                        id = event.optLong("id", 0L),
                        shopSyncKey = event.optCleanString("shop_sync_key"),
                        shopName = event.optCleanString("shop_name"),
                        entity = event.optCleanString("entity", "EVENT"),
                        action = event.optCleanString("action", "RECORDED"),
                        actor = event.optCleanString("actor", "SYSTEM"),
                        deviceId = event.optCleanString("device_id"),
                        detail = event.optCleanString("detail"),
                        createdAt = event.optCleanString("created_at")
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAdminCloudSyncEvents error: ${e.safeMessage()}")
            emptyList()
        }
    }

    suspend fun fetchDeviceTelemetryForAdmin(
        limit: Int = 100,
        offset: Int = 0
    ): List<SupabaseDeviceTelemetryDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || ensureValidAdminSession() == null) return@withContext emptyList()
        try {
            val req = buildRestRequest(
                "device_security_telemetry?order=updated_at.desc&limit=${limit.coerceIn(1, 500)}&offset=${offset.coerceAtLeast(0)}",
                useAdminJwtIfAvailable = true
            ).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseDeviceTelemetryDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchDeviceTelemetryForAdmin error: ${e.safeMessage()}")
            emptyList()
        }
    }

    suspend fun fetchDeviceTelemetryForShop(
        shopSyncKey: String,
        limit: Int = 100
    ): List<SupabaseDeviceTelemetryDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext emptyList()
        try {
            val enc = URLEncoder.encode(shopSyncKey, "UTF-8")
            val req = buildRestRequest(
                "device_security_telemetry?shop_sync_key=eq.$enc&order=updated_at.desc&limit=${limit.coerceIn(1, 250)}",
                tenantSyncKey = shopSyncKey
            ).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseDeviceTelemetryDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchDeviceTelemetryForShop error: ${e.safeMessage()}")
            emptyList()
        }
    }

    suspend fun fetchShopAnnouncements(
        shopSyncKey: String,
        language: AppLanguage
    ): List<SupabaseShopAnnouncementDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext emptyList()
        try {
            val req = buildRestRequest(
                "announcements?select=id,title,body,severity,cta_label,cta_url,translations,starts_at,ends_at,is_active&order=starts_at.desc&limit=10",
                tenantSyncKey = shopSyncKey
            ).get().build()
            client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) return@withContext emptyList()
                val now = System.currentTimeMillis()
                val rows = JSONArray(response.body?.string().orEmpty().ifBlank { "[]" })
                (0 until rows.length()).mapNotNull { index ->
                    val row = rows.optJSONObject(index) ?: return@mapNotNull null
                    if (!row.optBoolean("is_active", false)) return@mapNotNull null
                    val starts = row.optString("starts_at", "")
                    val ends = row.optString("ends_at", "").takeIf { it.isNotBlank() && it != "null" }
                    val startsAt = parseAnnouncementTimestamp(starts) ?: Long.MAX_VALUE
                    val endsAt = ends?.let { parseAnnouncementTimestamp(it) ?: 0L }
                    if (startsAt > now || (endsAt != null && endsAt <= now)) return@mapNotNull null
                    val translations = row.optJSONObject("translations") ?: JSONObject()
                    val languageKey = when (language) {
                        AppLanguage.KINYARWANDA -> "rw"
                        AppLanguage.FRENCH -> "fr"
                        AppLanguage.SWAHILI -> "sw"
                        else -> ""
                    }
                    val translated = translations.optJSONObject(languageKey) ?: JSONObject()
                    SupabaseShopAnnouncementDto(
                        id = row.optString("id"),
                        title = translated.optString("title", row.optString("title")),
                        body = translated.optString("body", row.optString("body")),
                        severity = row.optString("severity", "INFO"),
                        ctaLabel = translated.optString("cta_label", row.optString("cta_label")),
                        ctaUrl = row.optString("cta_url"),
                        startsAt = starts,
                        endsAt = ends
                    )
                }
            }
        } catch (error: Exception) {
            Log.w(TAG, "Shop announcement feed is unavailable: ${error.safeMessage()}")
            emptyList()
        }
    }

    suspend fun runCloudHealthDiagnostics(): CloudHealthDiagnosticsDto = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        if (!isConfigured()) {
            return@withContext CloudHealthDiagnosticsDto(
                checkedAt = now,
                postgrestReachable = false,
                latencyMs = -1L,
                snapshotSchemaReady = false,
                telemetryTableReady = false,
                branchesTableReady = false,
                transfersTableReady = false,
                adminSessionValid = false,
                summaryMessage = "Cloud client is not configured in BuildConfig."
            )
        }
        val sessionValid = ensureValidAdminSession() != null
        val start = System.currentTimeMillis()
        var postgrestOk = false
        try {
            val req = buildRestRequest("app_config?select=id&limit=1").get().build()
            client.newCall(req).execute().use { resp ->
                postgrestOk = resp.isSuccessful
            }
        } catch (_: Exception) {}
        val latency = (System.currentTimeMillis() - start).coerceAtLeast(1L)

        fun probeTable(query: String, useAdmin: Boolean = true): Boolean {
            return try {
                val req = buildRestRequest(query, useAdminJwtIfAvailable = useAdmin).get().build()
                client.newCall(req).execute().use { it.isSuccessful }
            } catch (_: Exception) {
                false
            }
        }

        val snapshotSchemaOk = probeTable("branch_sync_snapshots?select=id,sync_generation,chunk_index,chunk_count&limit=1", useAdmin = sessionValid)
        val telemetryOk = probeTable("device_security_telemetry?select=id,risk_score&limit=1", useAdmin = sessionValid)
        val branchesOk = probeTable("shop_branches?select=id,operational_status&limit=1", useAdmin = sessionValid)
        val transfersOk = probeTable("shop_stock_transfers?select=id,status&limit=1", useAdmin = sessionValid)

        val readyCount = listOf(postgrestOk, snapshotSchemaOk, telemetryOk, branchesOk, transfersOk).count { it }
        val summary = buildString {
            append(if (postgrestOk) "PostgREST Online (${latency}ms)" else "PostgREST Unreachable")
            append(" • Checks $readyCount/5")
            if (!snapshotSchemaOk) append(" • Legacy snapshot columns")
            if (!telemetryOk) append(" • Telemetry table restricted/missing")
        }
        CloudHealthDiagnosticsDto(
            checkedAt = now,
            postgrestReachable = postgrestOk,
            latencyMs = latency,
            snapshotSchemaReady = snapshotSchemaOk,
            telemetryTableReady = telemetryOk,
            branchesTableReady = branchesOk,
            transfersTableReady = transfersOk,
            adminSessionValid = sessionValid,
            summaryMessage = summary
        )
    }

    // -------------------------------------------------------------------------
    // SHOP USERS DIRECTORY SYNC (`shop_users`) — Metadata only (No PIN/Password)
    // -------------------------------------------------------------------------
    suspend fun upsertShopUsers(
        shopSyncKey: String,
        shopName: String,
        users: List<User>
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || users.isEmpty()) return@withContext false
        try {
            val arr = JSONArray()
            for (u in users) {
                arr.put(
                    JSONObject().apply {
                        put("id", "${shopSyncKey}::${u.id}")
                        put("shop_sync_key", shopSyncKey)
                        put("shop_name", shopName)
                        put("user_id", u.id)
                        put("full_name", u.name)
                        put("username", u.username.trim().lowercase(Locale.ROOT))
                        put("phone", u.phone)
                        put("role", u.role.name)
                        put("assigned_branch_id", u.assignedBranchId)
                        put("assigned_branch_name", u.assignedBranchName)
                        put("is_active", u.isActive)
                        put("updated_at", u.updatedAt)
                    }
                )
            }
            val req = buildRestRequest("shop_users?on_conflict=id", tenantSyncKey = shopSyncKey)
                .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(arr.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "upsertShopUsers HTTP ${resp.code}: ${resp.body?.string()}")
                }
                resp.isSuccessful
            }
        } catch (e: Exception) {
            Log.e(TAG, "upsertShopUsers error: ${e.message}")
            false
        }
    }

    suspend fun fetchShopUsersForShop(shopSyncKey: String): List<SupabaseShopUserDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext emptyList()
        try {
            val enc = URLEncoder.encode(shopSyncKey, "UTF-8")
            val req = buildRestRequest("shop_users?shop_sync_key=eq.$enc&limit=200", tenantSyncKey = shopSyncKey).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseShopUserDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchShopUsersForShop error: ${e.message}")
            emptyList()
        }
    }

    /**
     * Write a device-authenticated audit journal after the tenant-scoped record upload.
     * The server re-reads the saved row and accepts the event only when its updatedAt,
     * HLC and writer identity still match the version uploaded by this terminal.
     */
    private fun recordDeviceSyncAuditEvents(
        shopSyncKey: String,
        entity: String,
        uploadedRows: JSONArray
    ): Boolean {
        if (uploadedRows.length() == 0) return true
        val saved = AndroidDeviceCredentialStore.readForShop(shopSyncKey)
        if (saved == null) {
            // Older installations remain on the explicitly supported legacy sync path.
            // They cannot authenticate audit writes and must be re-enrolled by the owner.
            Log.w(TAG, "Device audit journal deferred: this legacy terminal needs owner-approved device enrollment.")
            return true
        }
        return try {
            val active = refreshAndroidDeviceCredential(saved)
            // Merged uploads can contain rows last written by another registered terminal.
            // Never attribute those events to the device performing this sync.
            val locallyAuthoredRows = (0 until uploadedRows.length())
                .map { uploadedRows.getJSONObject(it) }
                .filter { it.optString("last_modified_device_id").trim() == active.deviceId }
            if (locallyAuthoredRows.isEmpty()) return true
            for (start in locallyAuthoredRows.indices step 250) {
                val records = JSONArray()
                val end = minOf(start + 250, locallyAuthoredRows.size)
                for (index in start until end) {
                    val row = locallyAuthoredRows[index]
                    records.put(JSONObject().apply {
                        put("id", row.optString("id"))
                        put("updatedAt", row.optLong("updated_at"))
                        put("hlcTimestamp", row.optLong("hlc_timestamp"))
                        put("lastModifiedDeviceId", row.optString("last_modified_device_id"))
                    })
                }
                val payload = JSONObject()
                    .put("action", "record_device_sync_audit")
                    .put("entity", entity)
                    .put("records", records)
                val request = Request.Builder()
                    .url("${getSupabaseUrl()}/functions/v1/beboss-desktop")
                    .addHeader("apikey", getSupabaseApiKey())
                    .addHeader("X-BeBoss-Device-ID", active.deviceId)
                    .addHeader("X-BeBoss-Device-Token", active.accessToken)
                    .addHeader("Content-Type", "application/json")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()
                val acknowledged = client.newCall(request).execute().use { response ->
                    val raw = response.body?.string().orEmpty()
                    val result = runCatching { JSONObject(raw) }.getOrNull()
                    if (!response.isSuccessful || result?.optBoolean("ok") != true) {
                        Log.w(TAG, "Device audit batch was not acknowledged (HTTP ${response.code}): ${result?.optString("message").orEmpty()}")
                        false
                    } else {
                        true
                    }
                }
                if (!acknowledged) return false
            }
            true
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Device audit journal will retry with the next cloud sync: ${error.message}")
            false
        }
    }

    // -------------------------------------------------------------------------
    // BRANCHES (`shop_branches`)
    // -------------------------------------------------------------------------
    /**
     * Submit branch deletion tombstones only after they have been included in the
     * latest complete signed snapshot. The Edge Function verifies the signature,
     * applies a safe cloud deactivation, and appends an idempotent audit record.
     */
    suspend fun recordAndroidBranchDeletionAudits(
        shopSyncKey: String,
        tombstones: List<SyncTombstone>
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext false
        val saved = AndroidDeviceCredentialStore.readForShop(shopSyncKey)
        if (saved == null) {
            // Legacy compatibility remains available, but it cannot prove device identity
            // for branch deletion audit. The owner must enroll this terminal to enable it.
            Log.w(TAG, "Branch deletion audit deferred: this legacy terminal requires owner-approved device enrollment.")
            return@withContext true
        }
        val branchDeletes = tombstones.filter {
            it.tableName == "branches" &&
                (it.deletedByDeviceId.isBlank() || it.deletedByDeviceId == saved.deviceId)
        }
        if (branchDeletes.isEmpty()) return@withContext true
        try {
            val active = refreshAndroidDeviceCredential(saved)
            for (batch in branchDeletes.chunked(250)) {
                val records = JSONArray()
                batch.forEach { tombstone ->
                    records.put(JSONObject().apply {
                        put("tableName", tombstone.tableName)
                        put("recordId", tombstone.recordId)
                        put("deletedAt", tombstone.deletedAt)
                        put("hlcTimestamp", tombstone.hlcTimestamp)
                        put("deletedByDeviceId", tombstone.deletedByDeviceId)
                    })
                }
                val payload = JSONObject()
                    .put("action", "record_device_branch_tombstones")
                    .put("tombstones", records)
                val request = Request.Builder()
                    .url("${getSupabaseUrl()}/functions/v1/beboss-desktop")
                    .addHeader("apikey", getSupabaseApiKey())
                    .addHeader("X-BeBoss-Device-ID", active.deviceId)
                    .addHeader("X-BeBoss-Device-Token", active.accessToken)
                    .addHeader("Content-Type", "application/json")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()
                client.newCall(request).execute().use { response ->
                    val raw = response.body?.string().orEmpty()
                    val result = runCatching { JSONObject(raw) }.getOrNull()
                    if (!response.isSuccessful || result?.optBoolean("ok") != true) {
                        Log.w(TAG, "Branch deletion audit was not acknowledged (HTTP ${response.code}): ${result?.optString("message").orEmpty()}")
                        return@withContext false
                    }
                }
            }
            true
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Branch deletion audit will retry with the next cloud sync: ${error.message}")
            false
        }
    }

    suspend fun upsertShopBranches(shopSyncKey: String, shopName: String, branches: List<Branch>): Boolean =
        withContext(Dispatchers.IO) {
            if (!isConfigured() || shopSyncKey.isBlank()) return@withContext false
            if (branches.isEmpty()) return@withContext true
            try {
                val arr = JSONArray()
                for (b in branches) {
                    arr.put(JSONObject().apply {
                        put("id", b.id)
                        put("shop_sync_key", shopSyncKey)
                        put("shop_name", shopName)
                        put("name", b.name)
                        put("code", b.code)
                        put("address", b.address)
                        put("phone", b.phone)
                        put("manager_user_id", b.managerUserId)
                        put("manager_name", b.managerName)
                        put("is_main_branch", b.isMainBranch)
                        put("is_active", b.isActive)
                        put("color_hex", b.colorHex)
                        put("daily_sales_target_rwf", b.dailySalesTargetRwf)
                        put("monthly_target_rwf", b.monthlyTargetRwf)
                        put("opening_cash_float", b.openingCashFloat)
                        put("stock_value_rwf", b.stockValueRwf)
                        put("product_count", b.productCount)
                        put("operational_status", b.operationalStatus)
                        put("email", b.email)
                        put("notes", b.notes)
                        put("created_at", b.createdAt)
                        put("updated_at", b.updatedAt)
                        put("sync_version", b.syncVersion)
                        put("hlc_timestamp", b.hlcTimestamp)
                        put("last_modified_device_id", b.lastModifiedDeviceId)
                    })
                }
                val req = buildRestRequest("shop_branches?on_conflict=id", tenantSyncKey = shopSyncKey)
                    .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                    .post(arr.toString().toRequestBody(jsonMediaType))
                    .build()
                val uploaded = client.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        Log.w(TAG, "upsertShopBranches HTTP ${resp.code}: ${resp.body?.string()}")
                    }
                    resp.isSuccessful
                }
                uploaded && recordDeviceSyncAuditEvents(shopSyncKey, "BRANCH", arr)
            } catch (e: Exception) {
                Log.e(TAG, "upsertShopBranches error: ${e.message}")
                false
            }
        }

    suspend fun fetchShopBranches(shopSyncKey: String): List<SupabaseBranchDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext emptyList()
        try {
            val enc = URLEncoder.encode(shopSyncKey, "UTF-8")
            val req = buildRestRequest(
                "shop_branches?shop_sync_key=eq.$enc&order=is_main_branch.desc,updated_at.desc&limit=500",
                tenantSyncKey = shopSyncKey
            ).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseBranchDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchShopBranches error: ${e.message}")
            emptyList()
        }
    }

    // -------------------------------------------------------------------------
    // STOCK TRANSFERS (`shop_stock_transfers`)
    // -------------------------------------------------------------------------
    suspend fun upsertShopStockTransfers(shopSyncKey: String, shopName: String, transfers: List<StockTransfer>): Boolean =
        withContext(Dispatchers.IO) {
            if (!isConfigured() || shopSyncKey.isBlank()) return@withContext false
            if (transfers.isEmpty()) return@withContext true
            try {
                val arr = JSONArray()
                for (t in transfers) {
                    arr.put(JSONObject().apply {
                        put("id", t.id)
                        put("shop_sync_key", shopSyncKey)
                        put("shop_name", shopName)
                        put("transfer_number", t.transferNumber)
                        put("product_id", t.productId)
                        put("product_name", t.productName)
                        put("from_branch_id", t.fromBranchId)
                        put("from_branch_name", t.fromBranchName)
                        put("to_branch_id", t.toBranchId)
                        put("to_branch_name", t.toBranchName)
                        put("quantity", t.quantity)
                        put("unit", t.unit)
                        put("cost_value_rwf", t.costValueRwf)
                        put("transfer_date", t.transferDate)
                        put("status", t.status)
                        put("notes", t.notes)
                        put("transferred_by", t.transferredBy)
                        put("received_by", t.receivedBy)
                        put("received_at", t.receivedAt)
                        put("synced", t.synced)
                        put("created_at", t.createdAt)
                        put("updated_at", t.updatedAt.coerceAtLeast(t.createdAt))
                        put("hlc_timestamp", t.hlcTimestamp.takeIf { it > 0L } ?: HlcClock.tick(t.updatedAt.coerceAtLeast(t.createdAt)))
                        put("last_modified_device_id", t.lastModifiedDeviceId.ifBlank { "ANDROID" })
                    })
                }
                val req = buildRestRequest("shop_stock_transfers?on_conflict=id", tenantSyncKey = shopSyncKey)
                    .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                    .post(arr.toString().toRequestBody(jsonMediaType))
                    .build()
                val uploaded = client.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        Log.w(TAG, "upsertShopStockTransfers HTTP ${resp.code}: ${resp.body?.string()}")
                    }
                    resp.isSuccessful
                }
                uploaded && recordDeviceSyncAuditEvents(shopSyncKey, "STOCK_TRANSFER", arr)
            } catch (e: Exception) {
                Log.e(TAG, "upsertShopStockTransfers error: ${e.message}")
                false
            }
        }

    suspend fun fetchShopStockTransfers(shopSyncKey: String): List<SupabaseStockTransferDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank()) return@withContext emptyList()
        try {
            val enc = URLEncoder.encode(shopSyncKey, "UTF-8")
            val req = buildRestRequest(
                "shop_stock_transfers?shop_sync_key=eq.$enc&order=updated_at.desc&limit=1000",
                tenantSyncKey = shopSyncKey
            ).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseStockTransferDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchShopStockTransfers error: ${e.message}")
            emptyList()
        }
    }

    /**
     * Claims one remote transfer command for this paired device. The database RPC uses
     * the tenant RLS header and a lease so two devices cannot apply the same command.
     */
    suspend fun claimShopStockTransfer(
        shopSyncKey: String,
        transferId: String,
        deviceId: String,
        leaseMs: Long = 180_000L
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || transferId.isBlank() || deviceId.isBlank()) {
            return@withContext false
        }
        try {
            val payload = JSONObject()
                .put("p_transfer_id", transferId)
                .put("p_device_id", deviceId)
                .put("p_lease_ms", leaseMs.coerceIn(30_000L, 600_000L))
            val request = buildRestRequest("rpc/claim_shop_stock_transfer", tenantSyncKey = shopSyncKey)
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "claimShopStockTransfer HTTP ${response.code}")
                    return@withContext false
                }
                response.body?.string()?.trim()?.equals("true", ignoreCase = true) == true
            }
        } catch (e: Exception) {
            Log.w(TAG, "claimShopStockTransfer failed: ${e.safeMessage()}")
            false
        }
    }

    suspend fun releaseShopStockTransferClaim(
        shopSyncKey: String,
        transferId: String,
        deviceId: String
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || shopSyncKey.isBlank() || transferId.isBlank() || deviceId.isBlank()) {
            return@withContext false
        }
        try {
            val payload = JSONObject()
                .put("p_transfer_id", transferId)
                .put("p_device_id", deviceId)
            val request = buildRestRequest("rpc/release_shop_stock_transfer_claim", tenantSyncKey = shopSyncKey)
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "releaseShopStockTransferClaim HTTP ${response.code}")
                    return@withContext false
                }
                response.body?.string()?.trim()?.equals("true", ignoreCase = true) == true
            }
        } catch (e: Exception) {
            Log.w(TAG, "releaseShopStockTransferClaim failed: ${e.safeMessage()}")
            false
        }
    }

    suspend fun submitPaymentRequest(request: PaymentVerificationRequest): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext false
        try {
            val shopSyncKey = computeShopSyncKey(request.ownerUsername, request.ownerPhone)
            val cleanId = URLEncoder.encode(request.id.trim(), "UTF-8")
            val existingRequest = buildRestRequest("payment_requests?id=eq.$cleanId&select=id&limit=1", tenantSyncKey = shopSyncKey).get().build()
            val alreadyUploaded = client.newCall(existingRequest).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "submitPaymentRequest lookup HTTP " + response.code)
                    return@withContext false
                }
                JSONArray(response.body?.string().orEmpty().ifBlank { "[]" }).length() > 0
            }
            if (alreadyUploaded) return@withContext true

            val now = System.currentTimeMillis()
            val payload = JSONObject().apply {
                put("id", request.id)
                put("shop_name", request.shopName)
                put("owner_username", request.ownerUsername.trim().lowercase(Locale.ROOT))
                put("owner_phone", request.ownerPhone.trim())
                put("device_challenge", request.deviceChallenge)
                put("provider", request.provider)
                put("ussd_code", request.ussdCode)
                put("payer_phone", request.payerPhone)
                put("payer_full_name", request.payerFullName.trim())
                put("amount_rwf", request.amountRwf)
                put("duration_months", request.durationMonths)
                put("branch_count", request.branchCount)
                put("worker_count", request.workerCount)
                put("device_count", request.deviceCount.coerceAtLeast(1))
                put("fee_per_device_rwf", OfflineSubscriptionManager.PER_EXTRA_DEVICE_FEE_RWF)
                put("payment_time_ms", request.paymentTimeMs.takeIf { it > 0L } ?: request.createdAt.takeIf { it > 0L } ?: now)
                put("payment_note", request.paymentNote.trim())
                put("status", "PENDING_VERIFICATION")
                put("approval_mode", "")
                put("generated_unlock_code", "")
                put("source", "APP")
                put("created_at", request.createdAt)
                put("updated_at", request.updatedAt)
            }
            val req = buildRestRequest("payment_requests", tenantSyncKey = shopSyncKey)
                .addHeader("Prefer", "return=minimal")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "submitPaymentRequest INSERT HTTP " + response.code + ": " + response.body?.string())
                    if (response.code == 409) {
                        val retry = buildRestRequest("payment_requests?id=eq.$cleanId&select=id&limit=1", tenantSyncKey = shopSyncKey).get().build()
                        return@withContext client.newCall(retry).execute().use { check ->
                            check.isSuccessful && JSONArray(check.body?.string().orEmpty().ifBlank { "[]" }).length() > 0
                        }
                    }
                    return@withContext false
                }
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "submitPaymentRequest failed: " + e.message, e)
            false
        }
    }

    suspend fun fetchApprovedRequestsForUser(username: String, phone: String): List<SupabasePaymentRequestDto> =
        withContext(Dispatchers.IO) {
            if (!isConfigured()) return@withContext emptyList()
            try {
                val shopSyncKey = computeShopSyncKey(username, phone)
                val cleanUser = URLEncoder.encode(username.trim().lowercase(Locale.ROOT), "UTF-8")
                val columns = "id,shop_name,owner_username,owner_phone,device_challenge,provider,ussd_code,payer_phone,payer_full_name,amount_rwf,duration_months,branch_count,worker_count,device_count,fee_per_device_rwf,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,verified_by_admin,rejection_reason,created_at,updated_at"
                val path = "payment_requests?select=$columns&owner_username=eq.$cleanUser&status=eq.APPROVED&order=updated_at.desc&limit=10"
                val req = buildRestRequest(path, tenantSyncKey = shopSyncKey).get().build()

                client.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext emptyList()
                    val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                    val list = mutableListOf<SupabasePaymentRequestDto>()
                    val phone9 = SubscriptionSecurityManager.normalizePhoneLast9(phone)
                    for (i in 0 until arr.length()) {
                        val dto = parsePaymentRequestDto(arr.getJSONObject(i))
                        val dtoPhone9 = SubscriptionSecurityManager.normalizePhoneLast9(dto.ownerPhone)
                        if (phone9.isBlank() || dtoPhone9 == phone9) {
                            list.add(dto)
                        }
                    }
                    list
                }
            } catch (e: Exception) {
                Log.e(TAG, "fetchApprovedRequestsForUser error: ${e.message}")
                emptyList()
            }
        }

    suspend fun verifyAndMarkCodeRedeemedInCloud(
        unlockCode: String,
        username: String,
        phone: String
    ): SupabaseUnlockCodeDto? = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext null
        try {
            val rawCode = unlockCode.trim()
            val cleanCode = if (rawCode.startsWith("BB3-", ignoreCase = true)) {
                rawCode // BB3 Base64 ECDSA signatures are case-sensitive.
            } else {
                rawCode.uppercase(Locale.ROOT)
            }
            val shopSyncKey = computeShopSyncKey(username, phone)
            val encodedCode = URLEncoder.encode(cleanCode, "UTF-8")
            val lookup = buildRestRequest(
                "unlock_codes?unlock_code=eq.$encodedCode&limit=1",
                tenantSyncKey = shopSyncKey
            ).get().build()

            val matched = client.newCall(lookup).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val rows = JSONArray(response.body?.string().orEmpty().ifBlank { "[]" })
                if (rows.length() == 0) null else parseUnlockCodeDto(rows.getJSONObject(0))
            } ?: return@withContext null

            // Existing REDEEMED/REVOKED records are authoritative and must never be
            // converted back to ISSUED or silently accepted on another device.
            if (matched.status != "ISSUED") return@withContext matched

            val now = System.currentTimeMillis()
            val patchBody = JSONObject().apply {
                put("status", "REDEEMED")
                put("redeemed_at", now)
            }
            val claimUrl = "unlock_codes?id=eq.${URLEncoder.encode(matched.id, "UTF-8")}&status=eq.ISSUED"
            val patch = buildRestRequest(claimUrl, tenantSyncKey = shopSyncKey)
                .addHeader("Prefer", "return=representation")
                .patch(patchBody.toString().toRequestBody(jsonMediaType))
                .build()

            val claimed = client.newCall(patch).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "Could not atomically claim unlock code (HTTP ${response.code}).")
                    return@withContext matched.copy(status = "CLAIM_FAILED")
                }
                val rows = JSONArray(response.body?.string().orEmpty().ifBlank { "[]" })
                rows.length() > 0
            }
            if (!claimed) {
                // Another device may have redeemed between the read and conditional update.
                return@withContext matched.copy(status = "REDEEMED")
            }

            val cleanUser = URLEncoder.encode(username.trim().lowercase(Locale.ROOT), "UTF-8")
            val paymentPatch = JSONObject().apply {
                put("status", "REDEEMED")
                put("updated_at", now)
            }
            val paymentReq = buildRestRequest(
                "payment_requests?generated_unlock_code=eq.$encodedCode&owner_username=eq.$cleanUser",
                tenantSyncKey = shopSyncKey
            ).patch(paymentPatch.toString().toRequestBody(jsonMediaType)).build()
            client.newCall(paymentReq).execute().close()

            // CLAIMED is a local result marker only; the database row remains REDEEMED.
            // BeBossRepository allows this first claim but rejects later REDEEMED lookups.
            matched.copy(status = "CLAIMED", redeemedAt = now)
        } catch (e: Exception) {
            Log.e(TAG, "verifyAndMarkCodeRedeemedInCloud error: ${e.message}")
            null // Network unavailable: caller may use the BB3 public-key offline path.
        }
    }

    // -------------------------------------------------------------------------
    // AUTHENTICATED ADMIN CONSOLE OPERATIONS
    // -------------------------------------------------------------------------
    suspend fun fetchAllPaymentRequests(limit: Int = 100, offset: Int = 0): List<SupabasePaymentRequestDto> = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext emptyList()
        try {
            val paymentColumns = "id,shop_name,owner_username,owner_phone,device_challenge,provider,ussd_code,payer_phone,payer_full_name,amount_rwf,duration_months,branch_count,worker_count,device_count,fee_per_device_rwf,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,verified_by_admin,rejection_reason,created_at,updated_at,gateway_provider,gateway_reference,gateway_transaction_id,gateway_amount_rwf,gateway_currency,gateway_verified_at"
            val req = buildRestRequest(
                "payment_requests?select=$paymentColumns&order=created_at.desc&limit=${limit.coerceIn(1, 500)}&offset=${offset.coerceAtLeast(0)}",
                useAdminJwtIfAvailable = true
            )
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parsePaymentRequestDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAllPaymentRequests error: ${e.message}")
            emptyList()
        }
    }

    suspend fun fetchAllShopAccounts(limit: Int = 150, offset: Int = 0): List<SupabaseShopAccountDto> = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext emptyList()
        try {
            val req = buildRestRequest(
                "shop_accounts?order=updated_at.desc&limit=${limit.coerceIn(1, 500)}&offset=${offset.coerceAtLeast(0)}",
                useAdminJwtIfAvailable = true
            )
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseShopAccountDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAllShopAccounts error: ${e.message}")
            emptyList()
        }
    }

    suspend fun fetchAllShopUsers(limit: Int = 250, offset: Int = 0): List<SupabaseShopUserDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext emptyList()
        try {
            val req = buildRestRequest(
                "shop_users?order=updated_at.desc&limit=${limit.coerceIn(1, 500)}&offset=${offset.coerceAtLeast(0)}",
                useAdminJwtIfAvailable = true
            )
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseShopUserDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAllShopUsers error: ${e.message}")
            emptyList()
        }
    }

    suspend fun fetchAllBranchSnapshots(limit: Int = 150, offset: Int = 0): List<SupabaseBranchSnapshotDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext emptyList()
        try {
            val req = buildRestRequest(
                "branch_sync_snapshots?order=updated_at.desc&limit=${limit.coerceIn(1, 500)}&offset=${offset.coerceAtLeast(0)}",
                useAdminJwtIfAvailable = true
            )
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { idx ->
                    val o = arr.getJSONObject(idx)
                    SupabaseBranchSnapshotDto(
                        id = o.optCleanString("id"),
                        shopSyncKey = o.optCleanString("shop_sync_key"),
                        deviceId = o.optCleanString("device_id"),
                        syncGeneration = o.optCleanString("sync_generation"),
                        chunkIndex = o.optInt("chunk_index", 0),
                        chunkCount = o.optInt("chunk_count", 0),
                        branchId = o.optCleanString("branch_id"),
                        branchName = o.optCleanString("branch_name"),
                        shopName = o.optCleanString("shop_name"),
                        ownerUsername = o.optCleanString("owner_username"),
                        payloadToken = o.optCleanString("payload_token"),
                        recordsSummary = o.optCleanString("records_summary"),
                        updatedAt = o.optLong("updated_at", 0L)
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAllBranchSnapshots error: ${e.safeMessage()}")
            emptyList()
        }
    }

    suspend fun fetchAllUnlockCodes(limit: Int = 100, offset: Int = 0): List<SupabaseUnlockCodeDto> = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext emptyList()
        try {
            val req = buildRestRequest(
                "unlock_codes?order=issued_at.desc&limit=${limit.coerceIn(1, 500)}&offset=${offset.coerceAtLeast(0)}",
                useAdminJwtIfAvailable = true
            )
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseUnlockCodeDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAllUnlockCodes error: ${e.safeMessage()}")
            emptyList()
        }
    }

    suspend fun fetchAdminAuditLogs(limit: Int = 60, offset: Int = 0): List<SupabaseAuditLogDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext emptyList()
        try {
            val req = buildRestRequest(
                "admin_audit_logs?order=created_at.desc&limit=${limit.coerceIn(1, 500)}&offset=${offset.coerceAtLeast(0)}",
                useAdminJwtIfAvailable = true
            )
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { idx ->
                    val o = arr.getJSONObject(idx)
                    SupabaseAuditLogDto(
                        id = o.optCleanString("id"),
                        adminEmail = o.optCleanString("admin_email"),
                        action = o.optCleanString("action"),
                        targetId = o.optCleanString("target_id"),
                        details = o.optCleanString("details"),
                        createdAt = o.optLong("created_at", 0L)
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAdminAuditLogs error: ${e.safeMessage()}")
            emptyList()
        }
    }

    suspend fun approvePaymentAndIssueCode(request: SupabasePaymentRequestDto, adminName: String, verificationNote: String = ""): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val session = ensureValidAdminSession()
        if (!isConfigured() || session == null) return@withContext Pair(false, "Admin authentication expired or unavailable.")
        val gatewayVerified = request.gatewayVerifiedAt > 0L &&
            request.gatewayCurrency.equals("RWF", ignoreCase = true) &&
            request.gatewayAmountRwf == request.amountRwf &&
            request.gatewayReference.isNotBlank() &&
            request.gatewayTransactionId.isNotBlank() &&
            request.gatewayProvider in setOf("FLUTTERWAVE", "STRIPE", "MTN_MOMO")
        val effectiveVerificationNote = if (gatewayVerified) {
            "Automated ${request.gatewayProvider} settlement verified: reference ${request.gatewayReference}; transaction ${request.gatewayTransactionId}; amount ${request.gatewayAmountRwf} RWF; verified ${request.gatewayVerifiedAt}."
        } else {
            verificationNote.trim()
        }
        if (request.status != "APPROVED" && !gatewayVerified && effectiveVerificationNote.length < 5) {
            return@withContext Pair(false, "This payment has no verified online gateway settlement. Confirm the provider transaction in the official merchant portal before issuing BB3.")
        }
        if (request.status in setOf("APPROVED", "REDEEMED")) {
            if (request.generatedUnlockCode.isBlank() || request.approvalMode != "UNLOCK_CODE") {
                val message = if (request.approvalMode == "DIRECT_AUTO_UNLOCK" || request.generatedUnlockCode.isBlank()) {
                    "This payment has already been activated directly in BeBoss Cloud. No unlock code is required; refresh the registered shop to synchronize its subscription."
                } else {
                    "This payment has already been redeemed. BeBoss will not issue a second unlock code."
                }
                return@withContext Pair(false, message)
            }
            val linked = findUnlockCodeForPayment(request.id)
            return@withContext when {
                linked == request.generatedUnlockCode -> Pair(true, linked)
                request.status == "REDEEMED" -> Pair(false, "This payment is already marked REDEEMED. The original code is not available in the active unlock ledger, so a replacement will not be issued.")
                else -> Pair(false, "This payment does not have its matching unlock-code ledger record. Contact the master administrator.")
            }
        }
        if (request.status !in setOf("PENDING_VERIFICATION", "REJECTED")) {
            return@withContext Pair(false, "This payment claim is no longer awaiting approval.")
        }

        val signed = requestServerSignedBB3Code(request.id, effectiveVerificationNote).getOrElse { error ->
            return@withContext Pair(false, error.safeMessage("Unable to sign a secure payment-linked BB3 unlock code."))
        }

        val paymentTimeMs = request.paymentTimeMs.takeIf { it > 0L } ?: request.createdAt.takeIf { it > 0L } ?: signed.paymentTimeMs
        val savedFeeRate = OfflineSubscriptionManager.PER_EXTRA_DEVICE_FEE_RWF
        val recomputedBreakdown = OfflineSubscriptionManager.calculateSubscriptionPrice(
            branchCount = request.branchCount.coerceAtLeast(1),
            workerCount = request.workerCount.coerceAtLeast(1),
            durationMonths = request.durationMonths.coerceAtLeast(1),
            deviceCount = request.deviceCount.coerceAtLeast(1),
            perDeviceRateRwf = savedFeeRate
        )
        val verifiedAmountRwf = recomputedBreakdown.totalPayable
        val expectedTier = when {
            request.durationMonths >= 12 -> "ANNUAL"
            request.branchCount >= 3 -> "MULTI"
            request.branchCount == 2 -> "DUAL"
            else -> "SINGLE"
        }
        val expectedPlanDigest = paymentPlanDigest(request, verifiedAmountRwf, paymentTimeMs)
        val expectedShopId = computeShopSyncKey(request.ownerUsername, request.ownerPhone)
        if (request.amountRwf != verifiedAmountRwf ||
            signed.requestId != request.id ||
            signed.shopId != expectedShopId ||
            signed.amountRwf != verifiedAmountRwf ||
            signed.days != request.durationMonths.coerceAtLeast(1) * 30 ||
            signed.tierCode != expectedTier ||
            signed.paymentTimeMs != paymentTimeMs ||
            signed.planDigest != expectedPlanDigest
        ) {
            return@withContext Pair(false, "The signed server plan does not exactly match this submitted payment. No code was issued.")
        }

        try {
            val now = System.currentTimeMillis()
            val operatorLabel = "${session.fullName} (${session.email})".ifBlank { adminName }
            var insertedNewCode = false
            var codeToUse = signed.code
            var codeId = UUID.randomUUID().toString()

            val codePayload = JSONObject().apply {
                put("id", codeId)
                put("unlock_code", signed.code)
                put("payment_request_id", request.id)
                put("shop_username", request.ownerUsername.trim().lowercase(Locale.ROOT))
                put("shop_phone", request.ownerPhone.trim())
                put("device_challenge", request.deviceChallenge)
                put("tier_code", signed.tierCode)
                put("plan_days", signed.days)
                put("amount_rwf", verifiedAmountRwf)
                put("duration_months", request.durationMonths)
                put("branch_count", request.branchCount)
                put("worker_count", request.workerCount)
                put("device_count", request.deviceCount.coerceAtLeast(1))
                put("payment_time_ms", signed.paymentTimeMs)
                put("payment_provider", request.provider)
                put("payer_phone", request.payerPhone)
                put("payer_full_name", request.payerFullName)
                put("payment_note", request.paymentNote)
                put("plan_digest", signed.planDigest)
                put("status", "ISSUED")
                put("issued_by_admin", operatorLabel)
                put("issued_at", now)
            }
            val insertCodeReq = buildRestRequest("unlock_codes", useAdminJwtIfAvailable = true)
                .addHeader("Prefer", "return=minimal")
                .post(codePayload.toString().toRequestBody(jsonMediaType))
                .build()
            val insertResult = client.newCall(insertCodeReq).execute().use { response ->
                if (response.isSuccessful) {
                    insertedNewCode = true
                    true
                } else {
                    Log.w(TAG, "Could not store payment-linked BB3 code (HTTP " + response.code + ")")
                    false
                }
            }
            if (!insertResult) {
                val existing = findUnlockCodeRecordForPayment(request.id)
                if (existing == null || existing.optCleanString("plan_digest") != signed.planDigest || existing.optCleanString("unlock_code").isBlank()) {
                    return@withContext Pair(false, "Could not create the one permitted unlock-code record for this payment.")
                }
                codeToUse = existing.optCleanString("unlock_code")
                codeId = existing.optCleanString("id")
            }

            val prPatch = JSONObject().apply {
                put("status", "APPROVED")
                put("approval_mode", "UNLOCK_CODE")
                put("amount_rwf", verifiedAmountRwf)
                put("generated_unlock_code", codeToUse)
                put("verified_by_admin", operatorLabel)
                put("admin_verification_note", effectiveVerificationNote)
                put("rejection_reason", "")
                put("updated_at", now)
            }
            val patchPrReq = buildRestRequest(
                "payment_requests?id=eq.${URLEncoder.encode(request.id, "UTF-8")}&status=in.(PENDING_VERIFICATION,REJECTED)",
                useAdminJwtIfAvailable = true
            ).addHeader("Prefer", "return=representation")
                .patch(prPatch.toString().toRequestBody(jsonMediaType))
                .build()
            val claimWon = client.newCall(patchPrReq).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "Payment approval compare-and-set failed (HTTP " + response.code + ")")
                    false
                } else {
                    JSONArray(response.body?.string().orEmpty().ifBlank { "[]" }).length() > 0
                }
            }
            if (!claimWon) {
                val current = getPaymentRequestStatus(request.id)
                val currentStatus = current?.optCleanString("status").orEmpty()
                val currentCode = current?.optCleanString("generated_unlock_code").orEmpty()
                if (currentStatus in setOf("APPROVED", "REDEEMED") && currentCode.isNotBlank()) {
                    val linkedRecord = findUnlockCodeRecordForPayment(request.id)
                    val linkedCode = linkedRecord?.optCleanString("unlock_code").orEmpty()
                    val linkedDigest = linkedRecord?.optCleanString("plan_digest").orEmpty()
                    if (currentCode == codeToUse && linkedCode == codeToUse && linkedDigest == signed.planDigest) {
                        // A successful redemption may move APPROVED to REDEEMED before
                        // this admin request reads its final response. Reuse the one
                        // code already linked to the payment; never revoke or re-issue it.
                        return@withContext Pair(true, linkedCode)
                    }
                }
                if (currentStatus == "APPROVED" &&
                    current?.optCleanString("approval_mode") == "DIRECT_AUTO_UNLOCK" &&
                    currentCode.isBlank()) {
                    return@withContext Pair(false, "This payment was already activated directly in BeBoss Cloud. Refresh the shop; do not issue a second code.")
                }
                if (currentStatus == "REDEEMED") {
                    return@withContext Pair(false, "This payment has already been redeemed. No replacement unlock code was issued.")
                }
                if (insertedNewCode) {
                    val revokePayload = JSONObject().put("status", "REVOKED")
                    val revoke = buildRestRequest("unlock_codes?id=eq.${URLEncoder.encode(codeId, "UTF-8")}", useAdminJwtIfAvailable = true)
                        .patch(revokePayload.toString().toRequestBody(jsonMediaType)).build()
                    client.newCall(revoke).execute().close()
                }
                val latestStatus = currentStatus.ifBlank { "UNKNOWN" }.lowercase(Locale.ROOT).replace("_", " ")
                return@withContext Pair(false, "This payment is now $latestStatus. Refresh the queue before taking another action.")
            }

            val shopKey = signed.shopId.ifBlank { computeShopSyncKey(request.ownerUsername, request.ownerPhone) }
            extendShopExpiryInternal(
                shopId = shopKey,
                addDays = signed.days,
                branchCount = request.branchCount,
                workerCount = request.workerCount,
                deviceLimit = request.deviceCount.coerceAtLeast(1),
                monthlyFeeRwf = recomputedBreakdown.monthlySubtotal,
                markAutoUnlock = false
            )
            logAdminAudit(
                action = "APPROVE_PAYMENT",
                targetId = request.ownerUsername,
                details = "Provider verification evidence: ${effectiveVerificationNote}. Customer SMS: ${request.paymentNote.ifBlank { "not supplied" }}. Verified ${request.provider} payment ${verifiedAmountRwf} FRw for ${request.durationMonths} months, ${request.branchCount} branches, ${request.workerCount} staff, ${request.deviceCount} devices; unique BB3 code linked to ${request.id}."
            )
            Pair(true, codeToUse)
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            val errMsg = e.safeMessage("Unable to complete payment approval.")
            Log.e(TAG, "approvePaymentAndIssueCode error: $errMsg", e)
            Pair(false, errMsg)
        }
    }


    private suspend fun findUnlockCodeRecordForPayment(paymentRequestId: String): JSONObject? = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(paymentRequestId, "UTF-8")
        val request = buildRestRequest("unlock_codes?payment_request_id=eq.$encoded&status=in.(ISSUED,REDEEMED)&select=id,unlock_code,plan_digest,status,issued_at&order=issued_at.desc&limit=1", useAdminJwtIfAvailable = true).get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@withContext null
            JSONArray(response.body?.string().orEmpty().ifBlank { "[]" }).optJSONObject(0)
        }
    }

    private suspend fun findUnlockCodeForPayment(paymentRequestId: String): String? {
        val record = findUnlockCodeRecordForPayment(paymentRequestId) ?: return null
        return record.optCleanString("unlock_code").takeIf { it.isNotBlank() && record.optCleanString("status") in setOf("ISSUED", "REDEEMED") }
    }

    private suspend fun getPaymentRequestStatus(paymentRequestId: String): JSONObject? = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(paymentRequestId, "UTF-8")
        val request = buildRestRequest("payment_requests?id=eq.$encoded&select=status,approval_mode,generated_unlock_code&limit=1", useAdminJwtIfAvailable = true).get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@withContext null
            JSONArray(response.body?.string().orEmpty().ifBlank { "[]" }).optJSONObject(0)
        }
    }

    /**
     * Option 2 Approval: Directly auto-unlock the shop in cloud without requiring an unlock code.
     * The app detects `auto_unlocked_at` / `DIRECT_AUTO_UNLOCK` on background or foreground sync
     * and activates all features automatically.
     */
    @Deprecated("Payment claims must receive a unique signed BB3 code after manual verification.")
    suspend fun approvePaymentDirectAutoUnlock(
        request: SupabasePaymentRequestDto,
        adminName: String
    ): Boolean = withContext(Dispatchers.IO) {
        Log.w(TAG, "Direct unlock is disabled for payment claims; issue the payment-linked BB3 code instead.")
        false
    }

    suspend fun rejectPaymentRequest(
        request: SupabasePaymentRequestDto,
        reason: String
    ): Boolean = withContext(Dispatchers.IO) {
        val session = ensureValidAdminSession()
        if (!isConfigured() || session == null) return@withContext false
        try {
            val operatorLabel = "${session.fullName} (${session.email})"
            val cleanReason = reason.trim().ifBlank { "Payment reference could not be confirmed by Admin" }
            val prPatch = JSONObject().apply {
                put("status", "REJECTED")
                put("rejection_reason", cleanReason)
                put("verified_by_admin", operatorLabel)
                put("updated_at", System.currentTimeMillis())
            }
            val req = buildRestRequest(
                "payment_requests?id=eq.${URLEncoder.encode(request.id, "UTF-8")}&status=eq.PENDING_VERIFICATION",
                useAdminJwtIfAvailable = true
            )
                .addHeader("Prefer", "return=representation")
                .patch(prPatch.toString().toRequestBody(jsonMediaType))
                .build()
            val ok = client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) false
                else JSONArray(response.body?.string().orEmpty().ifBlank { "[]" }).length() > 0
            }
            if (ok) {
                logAdminAudit("REJECT_PAYMENT", request.ownerUsername, cleanReason)
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "rejectPaymentRequest error: ${e.message}")
            false
        }
    }

    suspend fun revokeUnlockCode(codeDto: SupabaseUnlockCodeDto): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext false
        try {
            val patch = JSONObject().apply { put("status", "REVOKED") }
            val req = buildRestRequest(
                "unlock_codes?id=eq.${URLEncoder.encode(codeDto.id, "UTF-8")}",
                useAdminJwtIfAvailable = true
            ).patch(patch.toString().toRequestBody(jsonMediaType)).build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                logAdminAudit("REVOKE_CODE", codeDto.unlockCode, "Revoked code for @${codeDto.shopUsername}")
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "revokeUnlockCode error: ${e.message}")
            false
        }
    }

    @Deprecated("Standalone unlock-code issuance is disabled. Codes must be linked to manually verified payment requests.")
    suspend fun issueManualUnlockCode(
        username: String,
        registeredPhone: String,
        deviceChallenge: String,
        tierCode: String,
        days: Int,
        amountRwf: Int,
        adminName: String
    ): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        if (!isConfigured() || ensureValidAdminSession() == null) {
            Pair(false, "Admin authentication expired or unavailable.")
        } else {
            Pair(false, "Standalone unlock codes are disabled. Submit the payment proof first, then verify it in the Payments queue to issue the unique BB3 code.")
        }
    }

    suspend fun adminExtendShopSubscription(
        shop: SupabaseShopAccountDto,
        addDays: Int
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext false
        try {
            val now = System.currentTimeMillis()
            val base = maxOf(shop.subscriptionExpiresAt, now)
            val newExpiry = base + addDays.coerceAtLeast(1) * 86_400_000L
            val patch = JSONObject().apply {
                put("subscription_status", "ACTIVE")
                put("subscription_expires_at", newExpiry)
                put("updated_at", now)
            }
            val req = buildRestRequest(
                "shop_accounts?id=eq.${URLEncoder.encode(shop.id, "UTF-8")}",
                useAdminJwtIfAvailable = true
            ).patch(patch.toString().toRequestBody(jsonMediaType)).build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                logAdminAudit("EXTEND_SHOP", "@${shop.ownerUsername}", "Extended ${shop.shopName} license by +$addDays days")
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "adminExtendShopSubscription error: ${e.message}")
            false
        }
    }

    suspend fun adminSetShopStatus(
        shop: SupabaseShopAccountDto,
        newStatus: String
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext false
        try {
            val now = System.currentTimeMillis()
            val normalized = newStatus.trim().uppercase(Locale.ROOT)
            val isLocking = normalized == ShopProfile.STATUS_EXPIRED || normalized == ShopProfile.STATUS_SUSPENDED
            val patch = JSONObject().apply {
                put("subscription_status", normalized)
                if (isLocking) {
                    put("subscription_expires_at", now)
                }
                put("updated_at", now)
            }
            val req = buildRestRequest(
                "shop_accounts?id=eq.${URLEncoder.encode(shop.id, "UTF-8")}",
                useAdminJwtIfAvailable = true
            ).patch(patch.toString().toRequestBody(jsonMediaType)).build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                logAdminAudit("SET_SHOP_STATUS", "@${shop.ownerUsername}", "${shop.shopName} -> $normalized")
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "adminSetShopStatus error: ${e.message}")
            false
        }
    }

    suspend fun adminResetShopTrial(
        shop: SupabaseShopAccountDto,
        trialDays: Int = ShopProfile.FREE_TRIAL_DAYS
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext false
        try {
            val now = System.currentTimeMillis()
            val safeDays = trialDays.coerceIn(1, 14)
            val newExpiry = now + safeDays * 86_400_000L
            val patch = JSONObject().apply {
                put("subscription_status", ShopProfile.STATUS_TRIAL)
                put("subscription_expires_at", newExpiry)
                put("updated_at", now)
            }
            val req = buildRestRequest(
                "shop_accounts?id=eq.${URLEncoder.encode(shop.id, "UTF-8")}",
                useAdminJwtIfAvailable = true
            ).patch(patch.toString().toRequestBody(jsonMediaType)).build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                logAdminAudit("RESET_TRIAL", "@${shop.ownerUsername}", "Reset ${shop.shopName} to ${safeDays}d TRIAL")
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "adminResetShopTrial error: ${e.message}")
            false
        }
    }

    suspend fun approvePaymentBatch(
        requests: List<SupabasePaymentRequestDto>,
        adminName: String
    ): BatchApprovalResult = withContext(Dispatchers.IO) {
        if (!isConfigured() || ensureValidAdminSession() == null) {
            return@withContext BatchApprovalResult(approvedCount = 0, failedCount = requests.size)
        }
        var approved = 0
        var failed = 0
        val issued = mutableListOf<Pair<String, String>>()
        for (req in requests.filter { it.status == "PENDING_VERIFICATION" }) {
            val (ok, code) = approvePaymentAndIssueCode(req, adminName)
            if (ok) {
                approved++
                issued.add(req.ownerUsername to code)
            } else {
                failed++
            }
        }
        if (approved > 0) {
            logAdminAudit(
                action = "BATCH_APPROVE_PAYMENTS",
                targetId = "count:$approved",
                details = "Batch approved $approved pending payment request(s), failed: $failed"
            )
        }
        BatchApprovalResult(approvedCount = approved, failedCount = failed, issuedCodes = issued)
    }

    suspend fun adminUpdateShopLimits(
        shop: SupabaseShopAccountDto,
        branchCount: Int,
        workerCount: Int,
        deviceLimit: Int = shop.deviceLimit.coerceAtLeast(1)
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || ensureValidAdminSession() == null) return@withContext false
        try {
            val safeBranches = branchCount.coerceAtLeast(1)
            val safeWorkers = workerCount.coerceAtLeast(1)
            val safeDevices = deviceLimit.coerceAtLeast(1)
            val pricing = OfflineSubscriptionManager.calculateSubscriptionPrice(safeBranches, safeWorkers, 1, safeDevices)
            val now = System.currentTimeMillis()
            val patch = JSONObject().apply {
                put("branch_count", safeBranches)
                put("worker_count", safeWorkers)
                put("device_limit", safeDevices)
                put("device_count", maxOf(shop.deviceCount, 1))
                put("monthly_fee_rwf", pricing.monthlySubtotal)
                put("updated_at", now)
            }
            val req = buildRestRequest(
                "shop_accounts?id=eq.${URLEncoder.encode(shop.id, "UTF-8")}",
                useAdminJwtIfAvailable = true
            ).patch(patch.toString().toRequestBody(jsonMediaType)).build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                logAdminAudit(
                    "UPDATE_SHOP_LIMITS",
                    "@${shop.ownerUsername}",
                    "${shop.shopName}: branches=$safeBranches, workers=$safeWorkers, devices=$safeDevices, fee=${pricing.monthlySubtotal} FRw/mo"
                )
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "adminUpdateShopLimits error: ${e.message}")
            false
        }
    }

    suspend fun adminDeleteShopAccount(shop: SupabaseShopAccountDto): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext false
        try {
            val req = buildRestRequest(
                "shop_accounts?id=eq.${URLEncoder.encode(shop.id, "UTF-8")}",
                useAdminJwtIfAvailable = true
            ).delete().build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                logAdminAudit("DELETE_SHOP", "@${shop.ownerUsername}", "Deleted shop record ${shop.shopName}")
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "adminDeleteShopAccount error: ${e.message}")
            false
        }
    }

    suspend fun adminUpdateShopUser(
        user: SupabaseShopUserDto,
        newRole: String? = null,
        isActive: Boolean? = null
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext false
        try {
            val now = System.currentTimeMillis()
            val patch = JSONObject().apply {
                if (newRole != null) put("role", newRole)
                if (isActive != null) put("is_active", isActive)
                put("updated_at", now)
            }
            val req = buildRestRequest(
                "shop_users?id=eq.${URLEncoder.encode(user.id, "UTF-8")}",
                useAdminJwtIfAvailable = true
            ).patch(patch.toString().toRequestBody(jsonMediaType)).build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                val changes = buildList {
                    if (newRole != null) add("role=$newRole")
                    if (isActive != null) add("active=$isActive")
                }.joinToString(", ")
                logAdminAudit("UPDATE_USER", "@${user.username}", "Updated ${user.fullName} (${user.shopName}): $changes")
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "adminUpdateShopUser error: ${e.message}")
            false
        }
    }

    suspend fun adminDeleteShopUser(user: SupabaseShopUserDto): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext false
        try {
            val req = buildRestRequest(
                "shop_users?id=eq.${URLEncoder.encode(user.id, "UTF-8")}",
                useAdminJwtIfAvailable = true
            ).delete().build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                logAdminAudit("DELETE_USER", "@${user.username}", "Removed user ${user.fullName} from ${user.shopName}")
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "adminDeleteShopUser error: ${e.message}")
            false
        }
    }

    suspend fun adminDeleteBranchSnapshot(snapshot: SupabaseBranchSnapshotDto): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext false
        try {
            val req = buildRestRequest(
                "branch_sync_snapshots?id=eq.${URLEncoder.encode(snapshot.id, "UTF-8")}",
                useAdminJwtIfAvailable = true
            ).delete().build()
            val ok = client.newCall(req).execute().use { it.isSuccessful }
            if (ok) {
                logAdminAudit("DELETE_SNAPSHOT", snapshot.deviceId, "Removed branch snapshot ${snapshot.branchName} (${snapshot.shopName})")
            }
            ok
        } catch (e: Exception) {
            Log.e(TAG, "adminDeleteBranchSnapshot error: ${e.message}")
            false
        }
    }

    private fun extendShopExpiryInternal(
        shopId: String,
        addDays: Int,
        branchCount: Int? = null,
        workerCount: Int? = null,
        deviceLimit: Int? = null,
        monthlyFeeRwf: Int? = null,
        markAutoUnlock: Boolean = false
    ) {
        try {
            val enc = URLEncoder.encode(shopId, "UTF-8")
            val getReq = buildRestRequest("shop_accounts?id=eq.$enc&limit=1", useAdminJwtIfAvailable = true).get().build()
            var existingExpiry = 0L
            var exists = false
            client.newCall(getReq).execute().use { resp ->
                if (resp.isSuccessful) {
                    val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                    if (arr.length() > 0) {
                        exists = true
                        existingExpiry = arr.getJSONObject(0).optLong("subscription_expires_at", 0L)
                    }
                }
            }
            if (!exists) return
            val now = System.currentTimeMillis()
            val newExpiry = maxOf(existingExpiry, now) + addDays.coerceAtLeast(1) * 86_400_000L
            val patch = JSONObject().apply {
                put("subscription_status", "ACTIVE")
                put("subscription_expires_at", newExpiry)
                if (branchCount != null) put("branch_count", branchCount.coerceAtLeast(1))
                if (workerCount != null) put("worker_count", workerCount.coerceAtLeast(1))
                if (deviceLimit != null) put("device_limit", deviceLimit.coerceAtLeast(1))
                if (monthlyFeeRwf != null) put("monthly_fee_rwf", monthlyFeeRwf.coerceAtLeast(5000))
                if (markAutoUnlock) put("auto_unlocked_at", now)
                put("updated_at", now)
            }
            val patchReq = buildRestRequest("shop_accounts?id=eq.$enc", useAdminJwtIfAvailable = true)
                .patch(patch.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(patchReq).execute().close()
        } catch (_: Exception) {}
    }

    private fun logAdminAudit(action: String, targetId: String, details: String) {
        val session = activeAdminSession ?: return
        try {
            val payload = JSONObject().apply {
                put("id", UUID.randomUUID().toString())
                put("admin_email", session.email)
                put("action", action)
                put("target_id", targetId)
                put("details", details)
                put("created_at", System.currentTimeMillis())
            }
            val req = buildRestRequest("admin_audit_logs", useAdminJwtIfAvailable = true)
                .addHeader("Prefer", "return=minimal")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()
            client.newCall(req).execute().close()
        } catch (_: Exception) {}
    }

    private fun paymentPlanDigest(request: SupabasePaymentRequestDto, amountRwf: Int, paymentTimeMs: Long): String {
        fun phone9(value: String): String = value.filter { it.isDigit() }.takeLast(9)
        fun normalized(value: String): String = Normalizer.normalize(value.trim(), Normalizer.Form.NFKC)
        val canonical = listOf(
            "BEBOSS-PAYMENT-PLAN-V1",
            request.id.trim(),
            request.ownerUsername.trim().lowercase(Locale.ROOT),
            phone9(request.ownerPhone),
            request.provider.trim().uppercase(Locale.ROOT),
            phone9(request.payerPhone),
            normalized(request.payerFullName),
            amountRwf,
            request.durationMonths,
            request.branchCount.coerceAtLeast(1),
            request.workerCount.coerceAtLeast(1),
            request.deviceCount.coerceAtLeast(1),
            paymentTimeMs,
            normalized(request.paymentNote)
        ).joinToString("\n")
        val digest = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString("") { "%02X".format(it) }
    }

    private fun parsePaymentRequestDto(o: JSONObject): SupabasePaymentRequestDto {
        return SupabasePaymentRequestDto(
            id = o.optCleanString("id"),
            shopName = o.optCleanString("shop_name"),
            ownerUsername = o.optCleanString("owner_username"),
            ownerPhone = o.optCleanString("owner_phone"),
            deviceChallenge = o.optCleanString("device_challenge"),
            provider = o.optCleanString("provider"),
            ussdCode = o.optCleanString("ussd_code"),
            payerPhone = o.optCleanString("payer_phone"),
            payerFullName = o.optCleanString("payer_full_name"),
            paymentTimeMs = o.optLong("payment_time_ms", o.optLong("created_at", 0L)),
            paymentNote = o.optCleanString("payment_note"),
            amountRwf = o.optInt("amount_rwf", 0),
            durationMonths = o.optInt("duration_months", 1),
            branchCount = o.optInt("branch_count", 1),
            workerCount = o.optInt("worker_count", 1),
            deviceCount = o.optInt("device_count", 1).coerceAtLeast(1),
            feePerDeviceRwf = OfflineSubscriptionManager.PER_EXTRA_DEVICE_FEE_RWF,
            status = o.optCleanString("status", "PENDING_VERIFICATION"),
            approvalMode = o.optCleanString("approval_mode"),
            generatedUnlockCode = o.optCleanString("generated_unlock_code"),
            verifiedByAdmin = o.optCleanString("verified_by_admin"),
            rejectionReason = o.optCleanString("rejection_reason"),
            createdAt = o.optLong("created_at", 0L),
            updatedAt = o.optLong("updated_at", 0L),
            gatewayProvider = o.optCleanString("gateway_provider"),
            gatewayReference = o.optCleanString("gateway_reference"),
            gatewayTransactionId = o.optCleanString("gateway_transaction_id"),
            gatewayAmountRwf = o.optInt("gateway_amount_rwf", 0),
            gatewayCurrency = o.optCleanString("gateway_currency"),
            gatewayVerifiedAt = o.optLong("gateway_verified_at", 0L)
        )
    }

    private fun parseUnlockCodeDto(o: JSONObject): SupabaseUnlockCodeDto {
        return SupabaseUnlockCodeDto(
            id = o.optCleanString("id"),
            unlockCode = o.optCleanString("unlock_code"),
            shopUsername = o.optCleanString("shop_username"),
            shopPhone = o.optCleanString("shop_phone"),
            deviceChallenge = o.optCleanString("device_challenge"),
            tierCode = o.optCleanString("tier_code"),
            planDays = o.optInt("plan_days", 30),
            amountRwf = o.optInt("amount_rwf", 5000),
            status = o.optCleanString("status", "ISSUED"),
            issuedByAdmin = o.optCleanString("issued_by_admin"),
            issuedAt = o.optLong("issued_at", 0L),
            redeemedAt = if (o.isNull("redeemed_at")) null else o.optLong("redeemed_at")
        )
    }

    private fun parseShopAccountDto(o: JSONObject): SupabaseShopAccountDto {
        return SupabaseShopAccountDto(
            id = o.optCleanString("id"),
            shopName = o.optCleanString("shop_name"),
            ownerName = o.optCleanString("owner_name"),
            ownerUsername = o.optCleanString("owner_username"),
            ownerPhone = o.optCleanString("owner_phone"),
            deviceChallenge = o.optCleanString("device_challenge"),
            branchCount = o.optInt("branch_count", 1),
            workerCount = o.optInt("worker_count", 1),
            deviceCount = o.optInt("device_count", 1).coerceAtLeast(1),
            deviceLimit = o.optInt("device_limit", 1).coerceAtLeast(1),
            adminWhatsApp = o.optCleanString("admin_whatsapp"),
            autoUnlockedAt = o.optLong("auto_unlocked_at", 0L),
            monthlyFeeRwf = o.optInt("monthly_fee_rwf", 5000),
            subscriptionStatus = o.optCleanString("subscription_status", "ACTIVE"),
            subscriptionExpiresAt = o.optLong("subscription_expires_at", 0L),
            updatedAt = o.optLong("updated_at", 0L),
            businessType = BusinessCatalog.normalize(o.optCleanString("business_type", "sector_retail"))
        )
    }

    private fun parseShopDeviceDto(o: JSONObject): SupabaseShopDeviceDto {
        return SupabaseShopDeviceDto(
            id = o.optCleanString("id"),
            shopSyncKey = o.optCleanString("shop_sync_key"),
            shopName = o.optCleanString("shop_name"),
            deviceId = o.optCleanString("device_id"),
            deviceName = o.optCleanString("device_name"),
            joinCode = o.optCleanString("join_code"),
            assignedUserId = o.optCleanString("assigned_user_id"),
            assignedUsername = o.optCleanString("assigned_username"),
            assignedUserName = o.optCleanString("assigned_user_name"),
            role = o.optCleanString("role", "CASHIER"),
            branchId = o.optCleanString("branch_id", "main_branch"),
            branchName = o.optCleanString("branch_name", "Main Store"),
            isOwnerPrimary = o.optBoolean("is_owner_primary", false),
            isActive = o.optBoolean("is_active", true),
            monthlyFeeAddonRwf = o.optInt("monthly_fee_addon_rwf", 2000),
            lastSyncedAt = o.optLong("last_synced_at", 0L),
            createdAt = o.optLong("created_at", 0L),
            updatedAt = o.optLong("updated_at", 0L)
        )
    }

    private fun parseShopUserDto(o: JSONObject): SupabaseShopUserDto {
        return SupabaseShopUserDto(
            id = o.optCleanString("id"),
            shopSyncKey = o.optCleanString("shop_sync_key"),
            shopName = o.optCleanString("shop_name"),
            userId = o.optCleanString("user_id"),
            fullName = o.optCleanString("full_name"),
            username = o.optCleanString("username"),
            phone = o.optCleanString("phone"),
            role = o.optCleanString("role", "CASHIER"),
            assignedBranchId = o.optCleanString("assigned_branch_id"),
            assignedBranchName = o.optCleanString("assigned_branch_name", "All Branches"),
            isActive = o.optBoolean("is_active", true),
            updatedAt = o.optLong("updated_at", 0L)
        )
    }

    private fun parseBranchDto(o: JSONObject): SupabaseBranchDto {
        return SupabaseBranchDto(
            id = o.optCleanString("id"),
            shopSyncKey = o.optCleanString("shop_sync_key"),
            shopName = o.optCleanString("shop_name"),
            name = o.optCleanString("name", "Branch"),
            code = o.optCleanString("code", "BR-01"),
            address = o.optCleanString("address", ""),
            phone = o.optCleanString("phone", ""),
            managerUserId = o.optCleanString("manager_user_id", ""),
            managerName = o.optCleanString("manager_name", ""),
            isMainBranch = o.optBoolean("is_main_branch", false),
            isActive = o.optBoolean("is_active", true),
            colorHex = o.optCleanString("color_hex", "#FF6B1A"),
            dailySalesTargetRwf = o.optLong("daily_sales_target_rwf", 0L),
            monthlyTargetRwf = o.optLong("monthly_target_rwf", 0L),
            openingCashFloat = o.optLong("opening_cash_float", 0L),
            stockValueRwf = o.optLong("stock_value_rwf", 0L),
            productCount = o.optInt("product_count", 0),
            operationalStatus = o.optCleanString("operational_status", "OPEN"),
            email = o.optCleanString("email", ""),
            notes = o.optCleanString("notes", ""),
            createdAt = o.optLong("created_at", 0L),
            updatedAt = o.optLong("updated_at", 0L),
            syncVersion = o.optLong("sync_version", 1L),
            hlcTimestamp = o.optLong("hlc_timestamp", 0L),
            lastModifiedDeviceId = o.optCleanString("last_modified_device_id", "")
        )
    }

    private fun parseStockTransferDto(o: JSONObject): SupabaseStockTransferDto {
        return SupabaseStockTransferDto(
            id = o.optCleanString("id"),
            shopSyncKey = o.optCleanString("shop_sync_key"),
            shopName = o.optCleanString("shop_name"),
            transferNumber = o.optCleanString("transfer_number"),
            productId = o.optCleanString("product_id"),
            productName = o.optCleanString("product_name"),
            fromBranchId = o.optCleanString("from_branch_id"),
            fromBranchName = o.optCleanString("from_branch_name"),
            toBranchId = o.optCleanString("to_branch_id"),
            toBranchName = o.optCleanString("to_branch_name"),
            quantity = o.optDouble("quantity", 0.0),
            unit = o.optCleanString("unit", "pcs"),
            costValueRwf = o.optLong("cost_value_rwf", 0L),
            transferDate = o.optLong("transfer_date", 0L),
            status = o.optCleanString("status", "IN_TRANSIT"),
            notes = o.optCleanString("notes", ""),
            transferredBy = o.optCleanString("transferred_by", ""),
            receivedBy = o.optCleanString("received_by", ""),
            receivedAt = o.optLong("received_at", 0L),
            synced = o.optBoolean("synced", true),
            createdAt = o.optLong("created_at", 0L),
            updatedAt = o.optLong("updated_at", 0L),
            hlcTimestamp = o.optLong("hlc_timestamp", 0L),
            lastModifiedDeviceId = o.optCleanString("last_modified_device_id", "")
        )
    }

    private fun parseDeviceTelemetryDto(o: JSONObject): SupabaseDeviceTelemetryDto {
        val rawSignals = o.optCleanString("signals_json", "[]")
        val signalList = try {
            val arr = JSONArray(rawSignals.ifBlank { "[]" })
            (0 until arr.length()).mapNotNull { idx ->
                arr.optString(idx)?.takeIf { it.isNotBlank() && it != "null" }
            }
        } catch (_: Exception) {
            emptyList()
        }
        return SupabaseDeviceTelemetryDto(
            id = o.optCleanString("id"),
            shopSyncKey = o.optCleanString("shop_sync_key"),
            shopName = o.optCleanString("shop_name"),
            deviceId = o.optCleanString("device_id"),
            deviceName = o.optCleanString("device_name", "Terminal"),
            riskScore = o.optInt("risk_score", 0),
            postureLabel = o.optCleanString("posture_label", "UNKNOWN"),
            isRooted = o.optBoolean("is_rooted", false),
            hasHooking = o.optBoolean("has_hooking", false),
            isEmulator = o.optBoolean("is_emulator", false),
            clockRollbackDetected = o.optBoolean("clock_rollback_detected", false),
            tamperIncidentCount = o.optInt("tamper_incident_count", 0),
            clockSkewMs = o.optLong("clock_skew_ms", 0L),
            tamperReason = o.optCleanString("tamper_reason", ""),
            keystoreBacking = o.optCleanString("keystore_backing", ""),
            signals = signalList,
            latitude = o.optDouble("latitude", 0.0),
            longitude = o.optDouble("longitude", 0.0),
            accuracyMeters = o.optDouble("accuracy_meters", 0.0).toFloat(),
            locationCapturedAt = o.optLong("location_captured_at", 0L),
            locationLabel = o.optCleanString("location_label", "Unavailable"),
            unsyncedMessagesCount = o.optInt("unsynced_messages_count", 0),
            permissionsSummary = o.optCleanString("permissions_summary", ""),
            inspectedAt = o.optLong("inspected_at", 0L),
            updatedAt = o.optLong("updated_at", 0L),
            devicePlatform = o.optCleanString("device_platform", "ANDROID"),
            manufacturer = o.optCleanString("manufacturer", ""),
            model = o.optCleanString("model", ""),
            osRelease = o.optCleanString("os_release", ""),
            sdkInt = o.optInt("sdk_int", 0),
            appVersion = o.optCleanString("app_version", ""),
            appBuild = o.optInt("app_build", 0),
            localeTag = o.optCleanString("locale_tag", ""),
            timezoneId = o.optCleanString("timezone_id", "")
        )
    }
}
