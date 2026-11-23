package com.beboss.shopmgmt.util

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.util.Log
import com.beboss.shopmgmt.data.model.ShopProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Mobile-money payment helpers for Rwanda (MTN MoMo & Airtel Money).
 *
 * Opens operator USSD flows and can query an explicitly configured backend. A transaction
 * reference format check is not settlement verification; BeBoss does not provide a direct
 * operator API integration here.
 */
object MoMoPaymentGateway {

    private const val TAG = "MoMoPaymentGateway"

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    data class GatewayTransactionResult(
        val isSuccess: Boolean,
        val isPending: Boolean,
        val status: String, // "SUCCESSFUL", "PENDING", "FAILED", "REJECTED", "INVALID_REFERENCE"
        val transactionReference: String,
        val financialId: String?,
        val amount: Int,
        val provider: String,
        val payerPhone: String,
        val message: String,
        val timestamp: Long = System.currentTimeMillis()
    )

    /**
     * Checks if the device has an active internet connection.
     */
    fun isOnline(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val network = cm?.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Launches the system USSD dialer for the given merchant USSD code.
     */
    fun openUssdDialer(context: Context, ussdCode: String) {
        try {
            val encoded = Uri.encode(ussdCode)
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$encoded")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch USSD dialer: ${e.message}")
        }
    }

    /**
     * Validates Rwandan mobile phone number.
     * Must be 10 digits starting with 078/079 (MTN) or 072/073 (Airtel), or +250...
     */
    fun validateRwandaPhoneNumber(phone: String, provider: String): Pair<Boolean, String> {
        val clean = phone.replace(" ", "").replace("-", "").trim()
        val normalized = when {
            clean.startsWith("+250") -> "0" + clean.substring(4)
            clean.startsWith("250") -> "0" + clean.substring(3)
            else -> clean
        }

        if (normalized.length != 10 || !normalized.all { it.isDigit() }) {
            return Pair(false, "Phone number must be a 10-digit Rwandan number (e.g. 0788123456)")
        }

        val prefix = normalized.take(3)
        val isMtn = prefix in listOf("078", "079")
        val isAirtel = prefix in listOf("072", "073")

        if (provider.contains("MTN", ignoreCase = true) && !isMtn) {
            return Pair(false, "Phone $normalized is not an MTN number (expected prefix 078 or 079)")
        }
        if (provider.contains("Airtel", ignoreCase = true) && !isAirtel) {
            return Pair(false, "Phone $normalized is not an Airtel number (expected prefix 072 or 073)")
        }

        return Pair(true, normalized)
    }

    /**
     * Checks a submitted reference's format and prevents local reuse.
     * It cannot verify settlement or confirm the paid amount with the operator.
     */
    @Deprecated("Subscription proof no longer collects transaction references. Use payer and payment-time details.")
    fun verifyTelcoTransactionReference(
        rawReference: String,
        provider: String,
        amount: Int,
        alreadyUsedRefs: Set<String>
    ): GatewayTransactionResult {
        return GatewayTransactionResult(
            isSuccess = false,
            isPending = true,
            status = "PENDING_VERIFICATION",
            transactionReference = "",
            financialId = null,
            amount = amount,
            provider = provider,
            payerPhone = "",
            message = "BeBoss no longer asks for a transaction reference. Submit payer details, payment date/time and an optional note in the subscription proof form. An administrator verifies settlement with the provider."
        )
    }
    /**
     * Sends a request to an optional configured backend and polls its reported status.
     * A submitted SMS reference is only format-checked here; it is not verified with the operator.
     */
    suspend fun executePaymentRequest(
        context: Context,
        shopProfile: ShopProfile,
        payerPhone: String,
        provider: String,
        amount: Int,
        description: String,
        userEnteredReference: String? = null,
        alreadyUsedRefs: Set<String> = emptySet()
    ): GatewayTransactionResult = withContext(Dispatchers.IO) {
        val (phoneValid, normalizedPhone) = validateRwandaPhoneNumber(payerPhone, provider)
        if (!phoneValid) {
            return@withContext GatewayTransactionResult(
                isSuccess = false,
                isPending = false,
                status = "FAILED",
                transactionReference = "",
                financialId = null,
                amount = amount,
                provider = provider,
                payerPhone = payerPhone,
                message = normalizedPhone
            )
        }

        // Subscription proof is submitted with payer details and payment time; no SMS TxID is collected.

        val backendUrl = shopProfile.backendServerUrl?.trim()
        val hasBackend = !backendUrl.isNullOrBlank() && (backendUrl.startsWith("https://") || backendUrl.startsWith("http://"))

        if (!hasBackend) {
            // No automated cloud gateway configured on this shop profile.
            // Prompt the merchant to dial USSD and submit payer/payment-time details.
            return@withContext GatewayTransactionResult(
                isSuccess = false,
                isPending = true,
                status = "PENDING_CONFIRMATION",
                transactionReference = "REF-PENDING-" + UUID.randomUUID().toString().take(8).uppercase(Locale.ROOT),
                financialId = null,
                amount = amount,
                provider = provider,
                payerPhone = normalizedPhone,
                message = "Payment is not confirmed by the dialer. Complete the USSD flow, then submit payer details and payment date/time for administrator verification."
            )
        }

        if (!isOnline(context)) {
            return@withContext GatewayTransactionResult(
                isSuccess = false,
                isPending = false,
                status = "OFFLINE",
                transactionReference = "",
                financialId = null,
                amount = amount,
                provider = provider,
                payerPhone = normalizedPhone,
                message = "No active internet connection. Complete the USSD flow and save the payment proof; BeBoss will sync it when internet returns."
            )
        }

        // Execute real HTTP API call to configured payment gateway endpoint
        val referenceId = UUID.randomUUID().toString()
        val safeBackendUrl = backendUrl.orEmpty().trim()
        val requestUrl = if (safeBackendUrl.endsWith("/")) "${safeBackendUrl}api/momo/request-to-pay" else "$safeBackendUrl/api/momo/request-to-pay"

        try {
            val jsonBody = JSONObject().apply {
                put("referenceId", referenceId)
                put("shopId", shopProfile.id)
                put("shopName", shopProfile.shopName)
                put("payerPhone", normalizedPhone)
                put("provider", provider)
                put("amount", amount)
                put("currency", "RWF")
                put("description", description)
                put("timestamp", System.currentTimeMillis())
            }

            val request = Request.Builder()
                .url(requestUrl)
                .addHeader("Content-Type", "application/json")
                .addHeader("X-Shop-Device", SubscriptionSecurityManager.computeDeviceChallenge(shopProfile))
                .post(jsonBody.toString().toRequestBody("application/json".toMediaType()))
                .build()

            val response = httpClient.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                return@withContext GatewayTransactionResult(
                    isSuccess = false,
                    isPending = false,
                    status = "FAILED",
                    transactionReference = referenceId,
                    financialId = null,
                    amount = amount,
                    provider = provider,
                    payerPhone = normalizedPhone,
                    message = "Payment gateway error (${response.code}): ${response.message.ifBlank { "Request was rejected by gateway" }}"
                )
            }

            val respJson = try { JSONObject(responseBody) } catch (_: Exception) { JSONObject() }
            val status = respJson.optCleanString("status", "PENDING").uppercase(Locale.ROOT)
            val financialId = respJson.optCleanString("financialTransactionId", "")

            when (status) {
                "SUCCESSFUL", "SUCCESS" -> {
                    GatewayTransactionResult(
                        isSuccess = true,
                        isPending = false,
                        status = "SUCCESSFUL",
                        transactionReference = referenceId,
                        financialId = financialId.ifBlank { referenceId },
                        amount = amount,
                        provider = provider,
                        payerPhone = normalizedPhone,
                        message = "MoMo payment of $amount FRw confirmed by gateway."
                    )
                }
                "PENDING" -> {
                    // Poll gateway up to 3 times with delay
                    var pollStatus = "PENDING"
                    var pollFinancialId = ""
                    val statusUrl = if (safeBackendUrl.endsWith("/")) "${safeBackendUrl}api/momo/status/$referenceId" else "$safeBackendUrl/api/momo/status/$referenceId"

                    for (attempt in 1..3) {
                        delay(2500)
                        try {
                            val pollReq = Request.Builder().url(statusUrl).get().build()
                            val pollResp = httpClient.newCall(pollReq).execute()
                            if (pollResp.isSuccessful) {
                                val pJson = JSONObject(pollResp.body?.string() ?: "{}")
                                pollStatus = pJson.optCleanString("status", "PENDING").uppercase(Locale.ROOT)
                                pollFinancialId = pJson.optCleanString("financialTransactionId", "")
                                if (pollStatus == "SUCCESSFUL" || pollStatus == "SUCCESS") break
                            }
                        } catch (e: kotlinx.coroutines.CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            Log.w(TAG, "Polling attempt $attempt failed: ${e.safeMessage("Poll error")}")
                        }
                    }

                    if (pollStatus == "SUCCESSFUL" || pollStatus == "SUCCESS") {
                        GatewayTransactionResult(
                            isSuccess = true,
                            isPending = false,
                            status = "SUCCESSFUL",
                            transactionReference = referenceId,
                            financialId = pollFinancialId.ifBlank { referenceId },
                            amount = amount,
                            provider = provider,
                            payerPhone = normalizedPhone,
                            message = "Payment approved and verified successfully!"
                        )
                    } else {
                        GatewayTransactionResult(
                            isSuccess = false,
                            isPending = true,
                            status = "PENDING",
                            transactionReference = referenceId,
                            financialId = null,
                            amount = amount,
                            provider = provider,
                            payerPhone = normalizedPhone,
                            message = "Prompt was sent to $normalizedPhone. Please approve on your phone or input the confirmation SMS reference code."
                        )
                    }
                }
                else -> {
                    GatewayTransactionResult(
                        isSuccess = false,
                        isPending = false,
                        status = "FAILED",
                        transactionReference = referenceId,
                        financialId = null,
                        amount = amount,
                        provider = provider,
                        payerPhone = normalizedPhone,
                        message = "Payment $status: ${respJson.optCleanString("message", "User declined or insufficient balance.")}"
                    )
                }
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Gateway communication exception", e)
            GatewayTransactionResult(
                isSuccess = false,
                isPending = false,
                status = "NETWORK_ERROR",
                transactionReference = referenceId,
                financialId = null,
                amount = amount,
                provider = provider,
                payerPhone = normalizedPhone,
                message = "Could not reach payment gateway: ${e.safeMessage("Connection timed out")}"
            )
        }
    }
}
