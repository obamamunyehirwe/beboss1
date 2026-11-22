package com.beboss.shopmgmt.util

import android.content.Context
import android.util.Log
import com.beboss.shopmgmt.BuildConfig
import com.beboss.shopmgmt.data.model.PaymentVerificationRequest
import com.beboss.shopmgmt.data.model.ShopDevice
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.StockTransfer
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.User
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
import java.io.IOException
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

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
    val updatedAt: Long
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
    val updatedAt: Long
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
        OkHttpClient.Builder()
            .connectionSpecs(listOf(modernTlsSpec))
            .followRedirects(false)
            .followSslRedirects(false)
            .apply {
                buildCertificatePinner()?.let { certificatePinner(it) }
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

    fun getSupabaseAnonKey(): String {
        return try {
            BuildConfig.SUPABASE_ANON_KEY.trim()
        } catch (_: Throwable) {
            ""
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
        return url.startsWith("https://") &&
            !url.contains("your-project-id") &&
            key.isNotBlank() &&
            !key.contains("your_supabase_anon_key")
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

    private fun buildRestRequest(
        path: String,
        useAdminJwtIfAvailable: Boolean = false,
        tenantSyncKey: String? = null
    ): Request.Builder {
        val url = "${getSupabaseUrl()}/rest/v1/$path"
        val key = getSupabaseAnonKey()
        val adminToken = if (useAdminJwtIfAvailable) ensureValidAdminSession()?.accessToken else null
        val bearer = adminToken ?: key
        val builder = Request.Builder()
            .url(url)
            .addHeader("apikey", key)
            .addHeader("Authorization", "Bearer $bearer")
            .addHeader("Content-Type", "application/json")
        if (!tenantSyncKey.isNullOrBlank()) {
            builder.addHeader("X-Shop-Sync-Key", tenantSyncKey.trim())
        }
        return builder
    }

    /**
     * Ask the trusted Supabase Edge Function to sign a BB3 code. The ECDSA private
     * key never enters this Android process or BuildConfig.
     */
    private suspend fun requestServerSignedBB3Code(paymentRequestId: String): Result<SupabaseSignedPaymentUnlock> = withContext(Dispatchers.IO) {
        val session = ensureValidAdminSession()
            ?: return@withContext Result.failure(IllegalStateException("Admin session expired. Sign in again."))
        if (!isConfigured()) {
            return@withContext Result.failure(IllegalStateException("Supabase connection is not configured."))
        }
        if (paymentRequestId.isBlank() || paymentRequestId.length > 200) {
            return@withContext Result.failure(IllegalArgumentException("A valid payment request is required to issue a BB3 code."))
        }
        try {
            val payload = JSONObject().put("paymentRequestId", paymentRequestId.trim())
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
                    val message = json.optString("message")
                        .ifBlank { json.optString("error") }
                        .ifBlank { "Secure BB3 payment signing failed (HTTP ${response.code})." }
                    return@withContext Result.failure(IllegalStateException(message))
                }
                val code = json.optString("code").trim()
                val digest = json.optString("planDigest").trim().uppercase(Locale.ROOT)
                val returnedRequestId = json.optString("requestId").trim()
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
                        shopId = json.optString("shopId"),
                        tierCode = json.optString("tier"),
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
            return@withContext Result.failure(IllegalStateException("Configure SUPABASE_URL and SUPABASE_ANON_KEY in app secrets."))
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
                    val rawMessage = json.optString("error_description")
                        .ifBlank { json.optString("msg") }
                        .ifBlank { json.optString("message") }
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
        val accessToken = sessionObj.optString("access_token")
        if (accessToken.isBlank()) return null
        val refreshToken = sessionObj.optString("refresh_token")
        val expiresIn = sessionObj.optLong("expires_in", 3600L)
        val userObj = json.optJSONObject("user") ?: sessionObj.optJSONObject("user") ?: JSONObject()
        val userId = userObj.optString("id")
        val email = userObj.optString("email").ifBlank { fallbackEmail.trim().lowercase(Locale.ROOT) }
        val metaName = userObj.optJSONObject("user_metadata")?.optString("full_name").orEmpty()
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
        
        // Try with new columns first (sync_generation, chunk_index, chunk_count)
        // If columns don't exist (schema cache stale), fall back to legacy format
        return@withContext try {
            upsertSnapshotWithNewColumns(
                shopSyncKey, deviceId, syncGeneration, chunkIndex, chunkCount,
                branchId, branchName, shopName, ownerUsername, payloadToken, recordsSummary
            )
        } catch (e: Exception) {
            // Check if error is about missing columns (PGRST204 = column not found)
            if (e.message?.contains("PGRST204") == true || 
                e.message?.contains("Could not find") == true ||
                e.message?.contains("column") == true) {
                Log.w(TAG, "New snapshot columns not found, falling back to legacy format")
                upsertSnapshotLegacy(
                    shopSyncKey, deviceId, branchId, branchName, shopName, 
                    ownerUsername, payloadToken, recordsSummary
                )
            } else {
                Log.e(TAG, "upsertBranchSyncSnapshot error: ${e.message}")
                false
            }
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
        val snapshotId = "${shopSyncKey}::${deviceId}"
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

    private suspend fun upsertSnapshotLegacy(
        shopSyncKey: String,
        deviceId: String,
        branchId: String,
        branchName: String,
        shopName: String,
        ownerUsername: String,
        payloadToken: String,
        recordsSummary: String
    ): Boolean = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        val snapshotId = "${shopSyncKey}::${deviceId}"
        val body = JSONObject().apply {
            put("id", snapshotId)
            put("shop_sync_key", shopSyncKey)
            put("device_id", deviceId)
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
                Log.w(TAG, "upsertSnapshotLegacy HTTP ${resp.code}: ${resp.body?.string()}")
            }
            resp.isSuccessful
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
                            id = o.optString("id"),
                            shopSyncKey = o.optString("shop_sync_key"),
                            deviceId = o.optString("device_id"),
                            syncGeneration = o.optString("sync_generation"),
                            chunkIndex = o.optInt("chunk_index", 0),
                            chunkCount = o.optInt("chunk_count", 0),
                            branchId = o.optString("branch_id"),
                            branchName = o.optString("branch_name"),
                            shopName = o.optString("shop_name"),
                            ownerUsername = o.optString("owner_username"),
                            payloadToken = o.optString("payload_token"),
                            recordsSummary = o.optString("records_summary"),
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
                val generations = deviceSnapshots.groupBy { it.syncGeneration }
                val latestGeneration = generations.values.maxByOrNull { rows -> rows.maxOfOrNull { it.updatedAt } ?: 0L }
                    .orEmpty()
                if (latestGeneration.isEmpty()) return@flatMap emptyList()

                val generation = latestGeneration.first().syncGeneration
                if (generation.isBlank()) {
                    val expectedChunks = Regex("(\\d+) chunk\\(s\\)").find(latestGeneration.first().recordsSummary)
                        ?.groupValues?.getOrNull(1)?.toIntOrNull()
                        ?: latestGeneration.size
                    val legacyChunks = latestGeneration.filter {
                        (snapshotChunkIndex(it.deviceId) ?: it.chunkIndex) < expectedChunks
                    }
                    if (completeChunkIndexes(legacyChunks.map { snapshotChunkIndex(it.deviceId) ?: it.chunkIndex }, expectedChunks)) {
                        legacyChunks.sortedBy { snapshotChunkIndex(it.deviceId) ?: it.chunkIndex }
                    } else {
                        emptyList()
                    }
                } else {
                    val expectedChunks = latestGeneration.maxOfOrNull { it.chunkCount } ?: 0
                    if (latestGeneration.all { it.syncGeneration == generation && it.chunkCount == expectedChunks } &&
                        completeChunkIndexes(latestGeneration.map { it.chunkIndex }, expectedChunks)
                    ) {
                        latestGeneration.sortedBy { it.chunkIndex }
                    } else {
                        emptyList()
                    }
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
                    adminWhatsAppNumber = o.optString("admin_whatsapp_number"),
                    mtnMoMoCode = o.optString("mtn_momo_code", "054321"),
                    mtnMoMoPhone = o.optString("mtn_momo_phone", "0788765432"),
                    mtnRecipientName = o.optString("mtn_recipient_name", "BeBoss Pay"),
                    airtelMoneyPhone = o.optString("airtel_money_phone", "0738765432"),
                    airtelRecipientName = o.optString("airtel_recipient_name", "BeBoss Pay"),
                    perDeviceFeeRwf = o.optInt("per_device_fee_rwf", 2000),
                    apkDownloadUrl = o.optString("apk_download_url", ""),
                    apkVersion = o.optString("apk_version", "2.1.0").ifBlank { "2.1.0" },
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
                put("per_device_fee_rwf", config.perDeviceFeeRwf.coerceAtLeast(0))
                put("apk_download_url", config.apkDownloadUrl.trim())
                put("apk_version", config.apkVersion.trim().ifBlank { "2.1.0" })
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
            val effectiveStatus = when {
                existingRemote != null && existingRemote.autoUnlockedAt > shopProfile.lastAppliedCloudUnlockAt ->
                    existingRemote.subscriptionStatus
                existingRemote != null && existingRemote.subscriptionStatus == ShopProfile.STATUS_ACTIVE &&
                    existingRemote.subscriptionExpiresAt > shopProfile.subscriptionExpiresAt ->
                    existingRemote.subscriptionStatus
                existingRemote != null && existingRemote.subscriptionStatus == ShopProfile.STATUS_SUSPENDED &&
                    existingRemote.updatedAt >= shopProfile.updatedAt ->
                    existingRemote.subscriptionStatus
                shopProfile.isPaidActive -> ShopProfile.STATUS_ACTIVE
                shopProfile.isFreeTrial -> ShopProfile.STATUS_TRIAL
                shopProfile.isSuspended -> ShopProfile.STATUS_SUSPENDED
                else -> ShopProfile.STATUS_EXPIRED
            }
            val effectiveExpiry = maxOf(
                shopProfile.subscriptionExpiresAt,
                existingRemote?.subscriptionExpiresAt ?: 0L
            )

            val payload = JSONObject().apply {
                put("id", accountId)
                put("shop_name", shopProfile.shopName)
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
                put("join_code", device.joinCode.uppercase(Locale.ROOT))
                put("assigned_user_id", device.assignedUserId)
                put("assigned_username", device.assignedUsername.trim().lowercase(Locale.ROOT))
                put("assigned_user_name", device.assignedUserName)
                put("role", device.role)
                put("branch_id", device.branchId)
                put("branch_name", device.branchName)
                put("is_owner_primary", device.isOwnerPrimary)
                put("is_active", device.isActive)
                put("monthly_fee_addon_rwf", if (device.isOwnerPrimary) 0 else device.monthlyFeeAddonRwf)
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

    suspend fun fetchAllShopDevices(): List<SupabaseShopDeviceDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || ensureValidAdminSession() == null) return@withContext emptyList()
        try {
            val req = buildRestRequest("shop_devices?order=updated_at.desc&limit=250", useAdminJwtIfAvailable = true)
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

    // -------------------------------------------------------------------------
    // SHOP USERS DIRECTORY SYNC (`shop_users`) Ã¢â‚¬â€ Metadata only (No PIN/Password)
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

    // -------------------------------------------------------------------------
    // BRANCHES (`shop_branches`)
    // -------------------------------------------------------------------------
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
                client.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        Log.w(TAG, "upsertShopBranches HTTP ${resp.code}: ${resp.body?.string()}")
                    }
                    resp.isSuccessful
                }
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
                        put("updated_at", System.currentTimeMillis())
                        put("hlc_timestamp", HlcClock.tick(t.createdAt))
                        put("last_modified_device_id", "")
                    })
                }
                val req = buildRestRequest("shop_stock_transfers?on_conflict=id", tenantSyncKey = shopSyncKey)
                    .addHeader("Prefer", "resolution=merge-duplicates,return=minimal")
                    .post(arr.toString().toRequestBody(jsonMediaType))
                    .build()
                client.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        Log.w(TAG, "upsertShopStockTransfers HTTP ${resp.code}: ${resp.body?.string()}")
                    }
                    resp.isSuccessful
                }
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
                put("fee_per_device_rwf", request.feePerDeviceRwf.coerceAtLeast(0))
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
    suspend fun fetchAllPaymentRequests(): List<SupabasePaymentRequestDto> = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext emptyList()
        try {
            val paymentColumns = "id,shop_name,owner_username,owner_phone,device_challenge,provider,ussd_code,payer_phone,payer_full_name,amount_rwf,duration_months,branch_count,worker_count,device_count,fee_per_device_rwf,payment_time_ms,payment_note,status,approval_mode,generated_unlock_code,verified_by_admin,rejection_reason,created_at,updated_at"
            val req = buildRestRequest("payment_requests?select=$paymentColumns&order=created_at.desc&limit=100", useAdminJwtIfAvailable = true)
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

    suspend fun fetchAllShopAccounts(): List<SupabaseShopAccountDto> = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext emptyList()
        try {
            val req = buildRestRequest("shop_accounts?order=updated_at.desc&limit=150", useAdminJwtIfAvailable = true)
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

    suspend fun fetchAllShopUsers(): List<SupabaseShopUserDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext emptyList()
        try {
            val req = buildRestRequest("shop_users?order=updated_at.desc&limit=250", useAdminJwtIfAvailable = true)
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

    suspend fun fetchAllBranchSnapshots(): List<SupabaseBranchSnapshotDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext emptyList()
        try {
            val req = buildRestRequest("branch_sync_snapshots?order=updated_at.desc&limit=150", useAdminJwtIfAvailable = true)
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { idx ->
                    val o = arr.getJSONObject(idx)
                    SupabaseBranchSnapshotDto(
                        id = o.optString("id"),
                        shopSyncKey = o.optString("shop_sync_key"),
                        deviceId = o.optString("device_id"),
                        branchId = o.optString("branch_id"),
                        branchName = o.optString("branch_name"),
                        shopName = o.optString("shop_name"),
                        ownerUsername = o.optString("owner_username"),
                        payloadToken = o.optString("payload_token"),
                        recordsSummary = o.optString("records_summary"),
                        updatedAt = o.optLong("updated_at", 0L)
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAllBranchSnapshots error: ${e.message}")
            emptyList()
        }
    }

    suspend fun fetchAllUnlockCodes(): List<SupabaseUnlockCodeDto> = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext emptyList()
        try {
            val req = buildRestRequest("unlock_codes?order=issued_at.desc&limit=100", useAdminJwtIfAvailable = true)
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { parseUnlockCodeDto(arr.getJSONObject(it)) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAllUnlockCodes error: ${e.message}")
            emptyList()
        }
    }

    suspend fun fetchAdminAuditLogs(): List<SupabaseAuditLogDto> = withContext(Dispatchers.IO) {
        if (!isConfigured() || activeAdminSession == null) return@withContext emptyList()
        try {
            val req = buildRestRequest("admin_audit_logs?order=created_at.desc&limit=60", useAdminJwtIfAvailable = true)
                .get()
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                val arr = JSONArray(resp.body?.string().orEmpty().ifBlank { "[]" })
                (0 until arr.length()).map { idx ->
                    val o = arr.getJSONObject(idx)
                    SupabaseAuditLogDto(
                        id = o.optString("id"),
                        adminEmail = o.optString("admin_email"),
                        action = o.optString("action"),
                        targetId = o.optString("target_id"),
                        details = o.optString("details"),
                        createdAt = o.optLong("created_at", 0L)
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "fetchAdminAuditLogs error: ${e.message}")
            emptyList()
        }
    }

    suspend fun approvePaymentAndIssueCode(request: SupabasePaymentRequestDto, adminName: String): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val session = ensureValidAdminSession()
        if (!isConfigured() || session == null) return@withContext Pair(false, "Admin authentication expired or unavailable.")
        if (request.status == "APPROVED") {
            if (request.generatedUnlockCode.isBlank() || request.approvalMode != "UNLOCK_CODE") {
                return@withContext Pair(false, "This payment has already been approved using direct auto-unlock.")
            }
            val linked = findUnlockCodeForPayment(request.id)
            return@withContext if (linked == request.generatedUnlockCode) Pair(true, linked)
                else Pair(false, "This payment does not have its matching unlock-code ledger record. Contact the master administrator.")
        }
        if (request.status !in setOf("PENDING_VERIFICATION", "REJECTED")) {
            return@withContext Pair(false, "This payment claim is no longer awaiting approval.")
        }

        val signed = requestServerSignedBB3Code(request.id).getOrElse { error ->
            return@withContext Pair(false, error.message ?: "Unable to sign a secure payment-linked BB3 unlock code.")
        }

        val paymentTimeMs = request.paymentTimeMs.takeIf { it > 0L } ?: request.createdAt.takeIf { it > 0L } ?: signed.paymentTimeMs
        val savedFeeRate = request.feePerDeviceRwf.takeIf { it > 0 }
            ?: OfflineSubscriptionManager.getCurrentPaymentConfig().perDeviceFeeRwf.coerceAtLeast(0)
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
                if (existing == null || existing.optString("plan_digest") != signed.planDigest || existing.optString("unlock_code").isBlank()) {
                    return@withContext Pair(false, "Could not create the one permitted unlock-code record for this payment.")
                }
                codeToUse = existing.optString("unlock_code")
                codeId = existing.optString("id")
            }

            val prPatch = JSONObject().apply {
                put("status", "APPROVED")
                put("approval_mode", "UNLOCK_CODE")
                put("amount_rwf", verifiedAmountRwf)
                put("generated_unlock_code", codeToUse)
                put("verified_by_admin", operatorLabel)
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
                if (current?.optString("status") == "APPROVED" && current.optString("generated_unlock_code") == codeToUse) {
                    return@withContext Pair(true, codeToUse)
                }
                if (insertedNewCode) {
                    val revokePayload = JSONObject().put("status", "REVOKED")
                    val revoke = buildRestRequest("unlock_codes?id=eq.${URLEncoder.encode(codeId, "UTF-8")}", useAdminJwtIfAvailable = true)
                        .patch(revokePayload.toString().toRequestBody(jsonMediaType)).build()
                    client.newCall(revoke).execute().close()
                }
                return@withContext Pair(false, "Another administrator processed this payment first. Refresh the queue.")
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
                details = "Verified ${request.provider} payment ${verifiedAmountRwf} FRw for ${request.durationMonths} months, ${request.branchCount} branches, ${request.workerCount} staff, ${request.deviceCount} devices; unique BB3 code linked to ${request.id}."
            )
            Pair(true, codeToUse)
        } catch (e: Exception) {
            Log.e(TAG, "approvePaymentAndIssueCode error: " + e.message, e)
            Pair(false, e.message ?: "Unable to complete payment approval.")
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
        return record.optString("unlock_code").takeIf { it.isNotBlank() && record.optString("status") in setOf("ISSUED", "REDEEMED") }
    }

    private suspend fun getPaymentRequestStatus(paymentRequestId: String): JSONObject? = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(paymentRequestId, "UTF-8")
        val request = buildRestRequest("payment_requests?id=eq.$encoded&select=status,generated_unlock_code&limit=1", useAdminJwtIfAvailable = true).get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@withContext null
            JSONArray(response.body?.string().orEmpty().ifBlank { "[]" }).optJSONObject(0)
        }
    }    /**
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
        if (!isConfigured() || activeAdminSession == null) return@withContext false
        try {
            val operatorLabel = "${activeAdminSession!!.fullName} (${activeAdminSession!!.email})"
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
            id = o.optString("id"),
            shopName = o.optString("shop_name"),
            ownerUsername = o.optString("owner_username"),
            ownerPhone = o.optString("owner_phone"),
            deviceChallenge = o.optString("device_challenge"),
            provider = o.optString("provider"),
            ussdCode = o.optString("ussd_code"),
            payerPhone = o.optString("payer_phone"),
            payerFullName = o.optString("payer_full_name"),
            paymentTimeMs = o.optLong("payment_time_ms", o.optLong("created_at", 0L)),
            paymentNote = o.optString("payment_note"),
            amountRwf = o.optInt("amount_rwf", 0),
            durationMonths = o.optInt("duration_months", 1),
            branchCount = o.optInt("branch_count", 1),
            workerCount = o.optInt("worker_count", 1),
            deviceCount = o.optInt("device_count", 1).coerceAtLeast(1),
            feePerDeviceRwf = o.optInt("fee_per_device_rwf", 2000).coerceAtLeast(0),
            status = o.optString("status", "PENDING_VERIFICATION"),
            approvalMode = o.optString("approval_mode"),
            generatedUnlockCode = o.optString("generated_unlock_code"),
            verifiedByAdmin = o.optString("verified_by_admin"),
            rejectionReason = o.optString("rejection_reason"),
            createdAt = o.optLong("created_at", 0L),
            updatedAt = o.optLong("updated_at", 0L)
        )
    }

    private fun parseUnlockCodeDto(o: JSONObject): SupabaseUnlockCodeDto {
        return SupabaseUnlockCodeDto(
            id = o.optString("id"),
            unlockCode = o.optString("unlock_code"),
            shopUsername = o.optString("shop_username"),
            shopPhone = o.optString("shop_phone"),
            deviceChallenge = o.optString("device_challenge"),
            tierCode = o.optString("tier_code"),
            planDays = o.optInt("plan_days", 30),
            amountRwf = o.optInt("amount_rwf", 5000),
            status = o.optString("status", "ISSUED"),
            issuedByAdmin = o.optString("issued_by_admin"),
            issuedAt = o.optLong("issued_at", 0L),
            redeemedAt = if (o.isNull("redeemed_at")) null else o.optLong("redeemed_at")
        )
    }

    private fun parseShopAccountDto(o: JSONObject): SupabaseShopAccountDto {
        return SupabaseShopAccountDto(
            id = o.optString("id"),
            shopName = o.optString("shop_name"),
            ownerName = o.optString("owner_name"),
            ownerUsername = o.optString("owner_username"),
            ownerPhone = o.optString("owner_phone"),
            deviceChallenge = o.optString("device_challenge"),
            branchCount = o.optInt("branch_count", 1),
            workerCount = o.optInt("worker_count", 1),
            deviceCount = o.optInt("device_count", 1).coerceAtLeast(1),
            deviceLimit = o.optInt("device_limit", 1).coerceAtLeast(1),
            adminWhatsApp = o.optString("admin_whatsapp"),
            autoUnlockedAt = o.optLong("auto_unlocked_at", 0L),
            monthlyFeeRwf = o.optInt("monthly_fee_rwf", 5000),
            subscriptionStatus = o.optString("subscription_status", "ACTIVE"),
            subscriptionExpiresAt = o.optLong("subscription_expires_at", 0L),
            updatedAt = o.optLong("updated_at", 0L)
        )
    }

    private fun parseShopDeviceDto(o: JSONObject): SupabaseShopDeviceDto {
        return SupabaseShopDeviceDto(
            id = o.optString("id"),
            shopSyncKey = o.optString("shop_sync_key"),
            shopName = o.optString("shop_name"),
            deviceId = o.optString("device_id"),
            deviceName = o.optString("device_name"),
            joinCode = o.optString("join_code"),
            assignedUserId = o.optString("assigned_user_id"),
            assignedUsername = o.optString("assigned_username"),
            assignedUserName = o.optString("assigned_user_name"),
            role = o.optString("role", "CASHIER"),
            branchId = o.optString("branch_id", "main_branch"),
            branchName = o.optString("branch_name", "Main Store"),
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
            id = o.optString("id"),
            shopSyncKey = o.optString("shop_sync_key"),
            shopName = o.optString("shop_name"),
            userId = o.optString("user_id"),
            fullName = o.optString("full_name"),
            username = o.optString("username"),
            phone = o.optString("phone"),
            role = o.optString("role", "CASHIER"),
            assignedBranchId = o.optString("assigned_branch_id"),
            assignedBranchName = o.optString("assigned_branch_name", "All Branches"),
            isActive = o.optBoolean("is_active", true),
            updatedAt = o.optLong("updated_at", 0L)
        )
    }

    private fun parseBranchDto(o: JSONObject): SupabaseBranchDto {
        return SupabaseBranchDto(
            id = o.optString("id"),
            shopSyncKey = o.optString("shop_sync_key"),
            shopName = o.optString("shop_name"),
            name = o.optString("name", "Branch"),
            code = o.optString("code", "BR-01"),
            address = o.optString("address", ""),
            phone = o.optString("phone", ""),
            managerUserId = o.optString("manager_user_id", ""),
            managerName = o.optString("manager_name", ""),
            isMainBranch = o.optBoolean("is_main_branch", false),
            isActive = o.optBoolean("is_active", true),
            colorHex = o.optString("color_hex", "#FF6B1A"),
            dailySalesTargetRwf = o.optLong("daily_sales_target_rwf", 0L),
            monthlyTargetRwf = o.optLong("monthly_target_rwf", 0L),
            openingCashFloat = o.optLong("opening_cash_float", 0L),
            stockValueRwf = o.optLong("stock_value_rwf", 0L),
            productCount = o.optInt("product_count", 0),
            operationalStatus = o.optString("operational_status", "OPEN"),
            email = o.optString("email", ""),
            notes = o.optString("notes", ""),
            createdAt = o.optLong("created_at", 0L),
            updatedAt = o.optLong("updated_at", 0L),
            syncVersion = o.optLong("sync_version", 1L),
            hlcTimestamp = o.optLong("hlc_timestamp", 0L),
            lastModifiedDeviceId = o.optString("last_modified_device_id", "")
        )
    }

    private fun parseStockTransferDto(o: JSONObject): SupabaseStockTransferDto {
        return SupabaseStockTransferDto(
            id = o.optString("id"),
            shopSyncKey = o.optString("shop_sync_key"),
            shopName = o.optString("shop_name"),
            transferNumber = o.optString("transfer_number"),
            productId = o.optString("product_id"),
            productName = o.optString("product_name"),
            fromBranchId = o.optString("from_branch_id"),
            fromBranchName = o.optString("from_branch_name"),
            toBranchId = o.optString("to_branch_id"),
            toBranchName = o.optString("to_branch_name"),
            quantity = o.optDouble("quantity", 0.0),
            unit = o.optString("unit", "pcs"),
            costValueRwf = o.optLong("cost_value_rwf", 0L),
            transferDate = o.optLong("transfer_date", 0L),
            status = o.optString("status", "IN_TRANSIT"),
            notes = o.optString("notes", ""),
            transferredBy = o.optString("transferred_by", ""),
            receivedBy = o.optString("received_by", ""),
            receivedAt = o.optLong("received_at", 0L),
            synced = o.optBoolean("synced", true),
            createdAt = o.optLong("created_at", 0L),
            updatedAt = o.optLong("updated_at", 0L),
            hlcTimestamp = o.optLong("hlc_timestamp", 0L),
            lastModifiedDeviceId = o.optString("last_modified_device_id", "")
        )
    }
}
