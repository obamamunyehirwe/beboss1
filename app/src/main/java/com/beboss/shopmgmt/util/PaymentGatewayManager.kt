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
     * Legacy adapter retained for source compatibility.
     * The Android client cannot trust an arbitrary configured endpoint to confirm
     * provider settlement. Use the BeBoss hosted-checkout flow instead.
     */
    @Suppress("UNUSED_PARAMETER")
    suspend fun initiateMoMoCollection(
        context: Context,
        shopProfile: ShopProfile,
        payerPhone: String,
        provider: String,
        amount: Int,
        planDays: Int
    ): PaymentProcessingResult = withContext(Dispatchers.IO) {
        val effectivePhone = payerPhone.trim().ifBlank { shopProfile.phone }
        PaymentProcessingResult(
            isSuccess = false,
            transactionRef = "",
            amountPaid = 0,
            planDays = 0,
            provider = provider,
            payerPhone = effectivePhone,
            timestamp = System.currentTimeMillis(),
            isPending = false,
            message = "Automated payment collection must be started through BeBoss secure hosted checkout. This Android compatibility adapter never trusts an unverified backend response or treats USSD as settlement confirmation."
        )
    }
}
