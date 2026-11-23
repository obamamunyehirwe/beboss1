package com.beboss.shopmgmt.util

import org.json.JSONObject
import java.util.Locale

/**
 * Extracts a clean, user-safe message from a Throwable without ever returning
 * null, blank text, or literal "null" strings.
 */
fun Throwable.safeMessage(fallback: String = "Unexpected error occurred"): String {
    val candidates = listOf(
        localizedMessage,
        message,
        cause?.localizedMessage,
        cause?.message
    )
    for (candidate in candidates) {
        val trimmed = candidate?.trim().orEmpty()
        if (trimmed.isNotEmpty() && !trimmed.equals("null", ignoreCase = true)) {
            return trimmed
        }
    }
    return fallback
}

/**
 * Safely reads a JSON string property from [JSONObject], guarding against
 * [JSONObject.NULL] and literal `"null"` strings returned by `JSONObject.optString`
 * (e.g. Supabase PostgREST `null` columns).
 */
fun JSONObject.optCleanString(key: String, fallback: String = ""): String {
    if (!has(key) || isNull(key)) return fallback
    val raw = optString(key, "")
    val trimmed = raw.trim()
    if (trimmed.isEmpty() || trimmed.equals("null", ignoreCase = true)) {
        return fallback
    }
    return raw
}

/**
 * Normalizes an entered unlock code without corrupting case-sensitive Base64
 * ECDSA signatures on `BB3-` offline vouchers.
 */
fun normalizeUnlockCodeInput(raw: String): String {
    val trimmed = raw.trim()
    return if (trimmed.startsWith("BB3-", ignoreCase = true)) {
        "BB3-" + trimmed.substring(4)
    } else {
        trimmed.uppercase(Locale.ROOT)
    }
}
