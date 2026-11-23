package com.beboss.shopmgmt.util

import com.beboss.shopmgmt.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Online compatibility bridge for BB2 codes issued by older BeBoss admin builds.
 *
 * BB2 used a shared HMAC secret that was shipped inside APKs. New builds never verify
 * that shared secret locally. The server accepts only a matching, still-ISSUED record
 * in public.unlock_codes and atomically marks it REDEEMED.
 */
object LegacyUnlockVerificationClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun verify(
        code: String,
        username: String,
        phone: String
    ): VoucherValidationResult = withContext(Dispatchers.IO) {
        val baseUrl = BuildConfig.SUPABASE_URL.trim().trimEnd('/')
        val apiKey = BuildConfig.SUPABASE_ANON_KEY.trim()
        if (baseUrl.isBlank() || apiKey.isBlank()) {
            return@withContext invalid("Secure legacy-code verification is not configured in this app build.")
        }
        if (username.isBlank() || phone.isBlank()) {
            return@withContext invalid("Enter the registered shop username and phone before verifying this older code.")
        }

        try {
            val payload = JSONObject().apply {
                put("code", code.trim().uppercase(Locale.ROOT))
                put("username", username.trim().lowercase(Locale.ROOT))
                put("phone", phone.trim())
            }
            val request = Request.Builder()
                .url("$baseUrl/functions/v1/verify-legacy-bb2")
                .addHeader("apikey", apiKey)
                .addHeader("Content-Type", "application/json")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()

            client.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                val json = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
                if (!response.isSuccessful || !json.optBoolean("valid", false)) {
                    val message = json.optCleanString("message")
                        .ifBlank { "This legacy BB2 code could not be verified. Check the code and internet connection." }
                    return@withContext invalid(message)
                }

                val days = json.optInt("days", 0)
                val tier = json.optCleanString("tier", "SINGLE").uppercase(Locale.ROOT)
                val amount = json.optInt("amount_rwf", 0)
                if (days !in 1..800) {
                    return@withContext invalid("The server returned an invalid legacy subscription period.")
                }
                VoucherValidationResult(
                    isValid = true,
                    daysToAdd = days,
                    message = "Legacy BB2 code verified online and marked as redeemed (+$days days).",
                    planName = planName(tier),
                    verifiedAmount = amount
                )
            }
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (error: Exception) {
            val detail = error.safeMessage("")
            invalid(
                if (detail.isNotBlank()) "Could not reach BeBoss to verify this legacy code: $detail"
                else "Could not reach BeBoss to verify this legacy code. Connect to the internet and retry."
            )
        }
    }

    private fun planName(tier: String): String = when (tier) {
        "ANNUAL" -> "Annual VIP Merchant Plan"
        "MULTI" -> "Enterprise Multi-Branch Plan"
        "DUAL" -> "Dual Branch Plan"
        else -> "Single Store Standard Plan"
    }

    private fun invalid(message: String) = VoucherValidationResult(
        isValid = false,
        daysToAdd = 0,
        message = message,
        planName = ""
    )
}
