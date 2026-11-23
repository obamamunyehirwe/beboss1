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
     * Legacy adapter retained for source compatibility only.
     *
     * A shop-configured backend URL is not a trusted payment provider. The app cannot
     * independently verify MTN/Airtel settlement, so this method deliberately refuses
     * to return SUCCESS based on arbitrary HTTP JSON or an unverified SMS reference.
     * New subscription payments must use BeBoss hosted checkout and its signed provider
     * webhook + server-side provider transaction verification.
     */
    @Suppress("UNUSED_PARAMETER")
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

        GatewayTransactionResult(
            isSuccess = false,
            isPending = false,
            status = "HOSTED_CHECKOUT_REQUIRED",
            transactionReference = "",
            financialId = null,
            amount = amount,
            provider = provider,
            payerPhone = normalizedPhone,
            message = "Automated payment collection must be started through BeBoss secure hosted checkout. A shop-configured server, USSD dialer, SMS text or client response cannot confirm provider settlement."
        )
    }
}
