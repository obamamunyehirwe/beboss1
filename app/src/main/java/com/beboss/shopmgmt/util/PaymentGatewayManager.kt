package com.beboss.shopmgmt.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.widget.Toast
import com.beboss.shopmgmt.data.model.ShopProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlin.math.abs

data class MoMoPaymentRequest(
    val shopId: Long,
    val shopName: String,
    val payerPhone: String,
    val amount: Int,
    val provider: String, // "MTN_MOMO", "AIRTEL_MONEY", "BK_QUICK"
    val merchantCode: String,
    val durationMonths: Int
)

data class PaymentTransactionRecord(
    val transactionRef: String,
    val amount: Int,
    val provider: String,
    val payerPhone: String,
    val timestamp: Long,
    val status: String, // "PENDING", "SUCCESS", "FAILED"
    val message: String
)

/**
 * Payment-method and USSD helpers for mobile-money providers.
 * Settlement is not verified by opening a dialer; any configured backend must explicitly confirm it.
 */
object PaymentGatewayManager {

    private const val TAG = "PaymentGatewayManager"

    /**
     * Dials MTN Mobile Money USSD with exact dynamic payment amount.
     */
    fun dialMtnMoMo(context: Context, amount: Int, merchantCode: String = "054321", merchantPhone: String = "0788765432") {
        try {
            // USSD format for MTN Rwanda Merchant pay (*182*8*1*CODE*AMOUNT#) or Person transfer (*182*1*1*PHONE*AMOUNT#)
            val ussd = if (merchantCode.isNotBlank() && merchantCode != "0") {
                "*182*8*1*$merchantCode*$amount#"
            } else {
                "*182*1*1*$merchantPhone*$amount#"
            }
            val intent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:" + Uri.encode(ussd))
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Could not open dialer: ${e.safeMessage("No phone app available")}", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Dials Airtel Money USSD with exact dynamic payment amount.
     */
    fun dialAirtelMoney(context: Context, amount: Int, airtelNumber: String = "0738765432") {
        try {
            val ussd = "*500*1*1*$airtelNumber*$amount#"
            val intent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:" + Uri.encode(ussd))
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Could not open dialer: ${e.safeMessage("No phone app available")}", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Requests payment status from an optional configured backend or returns a pending USSD payment.
     */
    suspend fun initiateMoMoCollection(
        context: Context,
        shopProfile: ShopProfile,
        payerPhone: String,
        provider: String,
        amount: Int,
        planDays: Int
    ): PaymentProcessingResult = withContext(Dispatchers.IO) {
        val cleanPhone = payerPhone.trim().filter { it.isDigit() || it == '+' }
        val effectivePhone = if (cleanPhone.isNotBlank()) cleanPhone else shopProfile.phone
        val now = System.currentTimeMillis()
        val dateStr = SimpleDateFormat("yyMMdd-HHmmss", Locale.getDefault()).format(Date(now))

        val providerPrefix = when (provider.uppercase(Locale.ROOT)) {
            "AIRTEL MONEY", "AIRTEL" -> "AIRTEL-RW"
            "BK QUICK", "BANK" -> "BK-RW"
            else -> "MOMO-RW"
        }
        val txRef = "$providerPrefix-$dateStr-${abs(UUID.randomUUID().mostSignificantBits % 9000L + 1000L)}"

        // If backend URL is configured, attempt real HTTP payment request
        val backendUrl = shopProfile.backendServerUrl.trim().removeSuffix("/")
        if (backendUrl.isNotBlank() && (backendUrl.startsWith("http://") || backendUrl.startsWith("https://"))) {
            try {
                val url = URL("$backendUrl/payments/momo-push")
                val payload = JSONObject().apply {
                    put("shopId", shopProfile.id)
                    put("shopName", shopProfile.shopName)
                    put("payerPhone", effectivePhone)
                    put("amount", amount)
                    put("provider", provider)
                    put("transactionRef", txRef)
                    put("timestamp", now)
                }

                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                    setRequestProperty("X-Shop-Device", shopProfile.lastPaymentRef)
                    doOutput = true
                    connectTimeout = 6000
                    readTimeout = 6000
                }

                conn.outputStream.use { os ->
                    val bytes = payload.toString().toByteArray(Charsets.UTF_8)
                    os.write(bytes, 0, bytes.size)
                }

                val code = conn.responseCode
                if (code in 200..299) {
                    val respStr = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(respStr)
                    val status = json.optCleanString("status").uppercase(Locale.ROOT)
                    val responseAmount = json.optInt("amount", amount)
                    val confirmedRef = json.optCleanString("transactionRef", txRef)
                    val confirmed = status in setOf("SUCCESS", "SUCCESSFUL") && responseAmount == amount

                    return@withContext PaymentProcessingResult(
                        isSuccess = confirmed,
                        isPending = !confirmed && status !in setOf("FAILED", "REJECTED", "CANCELLED"),
                        transactionRef = confirmedRef,
                        amountPaid = if (confirmed) amount else 0,
                        planDays = if (confirmed) planDays else 0,
                        provider = provider,
                        payerPhone = effectivePhone,
                        timestamp = now,
                        message = json.optCleanString(
                            "message",
                            if (confirmed) "Payment confirmed by the configured payment endpoint."
                            else "Payment has not been verified. Submit your proof for admin review."
                        )
                    )
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Online payment push fallback to local verification: ${e.safeMessage("Connection failed")}")
            }
        }

        PaymentProcessingResult(
            isSuccess = false,
            transactionRef = txRef,
            amountPaid = 0,
            planDays = 0,
            provider = provider,
            payerPhone = effectivePhone,
            timestamp = now,
            isPending = true,
            message = "Payment initiated via $provider. Complete the operator USSD flow, then submit payer details and payment date/time in BeBoss for administrator verification. The dialer does not confirm settlement."
        )
    }
}
