package com.beboss.shopmgmt.util

import android.util.Log
import java.security.MessageDigest
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object EnhancedUnlockCodeGenerator {
    
    data class GeneratedCode(
        val code: String,
        val tier: String,
        val days: Int,
        val accountHash: String,
        val expiryTimestamp: Long
    )
    
    data class ValidationResult(
        val isValid: Boolean,
        val tier: String? = null,
        val days: Int? = null,
        val expiryTimestamp: Long? = null,
        val errorMessage: String? = null
    )
    
    private const val CODE_PREFIX = "BB2"
    private const val HMAC_ALGORITHM = "HmacSHA256"
    private const val HASH_ALGORITHM = "SHA-256"
    
    fun generateCode(
        username: String,
        phone: String,
        tier: String,
        days: Int,
        signingSecret: String
    ): GeneratedCode {
        val normalizedUsername = username.lowercase(Locale.ROOT)
        val normalizedPhone = normalizePhoneLast9(phone)
        val accountHash = computeAccountHash(normalizedUsername, normalizedPhone)
        
        val expiryHex = System.currentTimeMillis().plus(days * 86400000L).toString(16).uppercase()
        val codeWithoutSig = "$CODE_PREFIX-$tier-$days-$expiryHex-$accountHash"
        
        val hmacSig = computeHmacSignature(codeWithoutSig, signingSecret)
        val fullCode = "$codeWithoutSig-$hmacSig"
        
        return GeneratedCode(
            code = fullCode,
            tier = tier,
            days = days,
            accountHash = accountHash,
            expiryTimestamp = expiryHex.toLong(16)
        )
    }
    
    fun validateCode(
        code: String,
        username: String,
        phone: String,
        signingSecret: String
    ): ValidationResult {
        val parts = code.split("-")
        if (parts.size != 6) {
            return ValidationResult(false, errorMessage = "Invalid code format")
        }
        
        val prefix = parts[0]
        val tier = parts[1]
        val daysStr = parts[2]
        val expiryHex = parts[3]
        val acctHash = parts[4]
        val hmacSig = parts[5]
        
        if (prefix != CODE_PREFIX) {
            return ValidationResult(false, errorMessage = "Invalid prefix")
        }
        
        val days = daysStr.toIntOrNull() ?: return ValidationResult(false, errorMessage = "Invalid days")
        
        val normalizedUsername = username.lowercase(Locale.ROOT)
        val normalizedPhone = normalizePhoneLast9(phone)
        val expectedHash = computeAccountHash(normalizedUsername, normalizedPhone)
        
        if (!MessageDigest.isEqual(acctHash.toByteArray(), expectedHash.toByteArray())) {
            return ValidationResult(false, errorMessage = "Account binding mismatch")
        }
        
        val codeWithoutSig = "$CODE_PREFIX-$tier-$days-$expiryHex-$acctHash"
        val expectedSig = computeHmacSignature(codeWithoutSig, signingSecret)
        
        if (!MessageDigest.isEqual(hmacSig.toByteArray(), expectedSig.toByteArray())) {
            return ValidationResult(false, errorMessage = "Invalid signature")
        }
        
        val expiryTimestamp = expiryHex.toLong(16)
        if (System.currentTimeMillis() > expiryTimestamp) {
            return ValidationResult(false, errorMessage = "Code expired")
        }
        
        return ValidationResult(
            isValid = true,
            tier = tier,
            days = days,
            expiryTimestamp = expiryTimestamp
        )
    }
    
    private fun computeAccountHash(username: String, phoneLast9: String): String {
        val input = "$username:$phoneLast9"
        val digest = MessageDigest.getInstance(HASH_ALGORITHM)
        val hash = digest.digest(input.toByteArray())
        return hash.take(6).joinToString("") { "%02X".format(it) }
    }
    
    private fun computeHmacSignature(data: String, secret: String): String {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        val keySpec = SecretKeySpec(secret.toByteArray(), 0, secret.length, HMAC_ALGORITHM)
        mac.init(keySpec)
        val signature = mac.doFinal(data.toByteArray())
        return signature.take(4).joinToString("") { "%02X".format(it) }
    }
    
    fun normalizePhoneLast9(phone: String): String {
        val cleaned = phone.replace(Regex("[^0-9]"), "")
        return if (cleaned.length >= 9) {
            cleaned.takeLast(9)
        } else {
            cleaned
        }
    }
}
