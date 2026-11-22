package com.beboss.shopmgmt.util

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.beboss.shopmgmt.data.model.ShopProfile
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.security.SecureRandom
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec
import kotlin.math.abs

/**
 * Enterprise Cryptographic Voucher & Admin Unlock Code Engine for BeBoss.
 *
 * Signing model:
 * - BB3 codes use a pinned P-256 public key; the matching private key stays in the server.
 * - Legacy BB2 codes are checked online against their exact server-issued database record.
 * - BB hardware vouchers retain per-installation AndroidKeyStore HMAC keys (not shared secrets).
 * - No wildcard or unverified payment-reference bypasses.
 */
object SubscriptionSecurityManager {

    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEYSTORE_ALIAS_PREFIX = "BeBoss_Voucher_HW_"
    private const val HMAC_ALGORITHM = "HmacSHA256"

    private val jvmEphemeralKeys = ConcurrentHashMap<Long, SecretKey>()
    private val secureRandom = SecureRandom()

    // Public verification key only. The matching ECDSA private key is stored in Supabase
    // app_secrets and is never included in the Android build.
    private const val BB3_PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEnH8Qg10M7lur8WocoKgklEJ98F6
UF9J9ektcbwahKU79+sHZdQAejA76NlwNldXfWaZGFNYu+ziDItMapV7dA==
-----END PUBLIC KEY-----"""

    private val bb3PublicKey: PublicKey by lazy {
        val encoded = BB3_PUBLIC_KEY_PEM
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace("\\s".toRegex(), "")
        val der = Base64.decode(encoded, Base64.DEFAULT)
        KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(der))
    }

    /**
     * Normalizes phone to last 9 digits so +250788123456 and 0788123456 match identically.
     */
    fun normalizePhoneLast9(phone: String): String {
        return phone.filter { it.isDigit() }.takeLast(9)
    }

    /**
     * Computes deterministic 6-character uppercase SHA-256 binding hash for (username, phone).
     * Mirrors WebCrypto SHA-256 in the Admin Web Dashboard.
     */
    fun computeAccountBindingHash(username: String, phone: String): String {
        val normUser = username.trim().lowercase(Locale.ROOT)
        val normPhone = normalizePhoneLast9(phone)
        val seed = "$normUser:$normPhone"
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(seed.toByteArray(StandardCharsets.UTF_8))
        return SecurityUtils.bytesToHex(digest).take(6).uppercase(Locale.ROOT)
    }

    /**
     * Obtains a hardware-backed SecretKey from AndroidKeyStore.
     * In host JVM unit tests where AndroidKeyStore does not exist, uses a per-shop CSPRNG key
     * (never derived from predictable public profile fields). Fails closed on Android devices if
     * hardware keystore initialization fails.
     */
    fun getOrCreateIsolatedHmacKey(shopProfile: ShopProfile): SecretKey {
        val alias = "$KEYSTORE_ALIAS_PREFIX${shopProfile.id}"
        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (keyStore.containsAlias(alias)) {
                val existing = keyStore.getKey(alias, null) as? SecretKey
                if (existing != null) return existing
            }
            val keyGen = KeyGenerator.getInstance(HMAC_ALGORITHM, ANDROID_KEYSTORE)
            val keySpec = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            ).build()
            keyGen.init(keySpec)
            keyGen.generateKey()
        } catch (t: Throwable) {
            if (!CryptoKeyManager.isRobolectricJvm()) {
                throw SecurityException("Hardware AndroidKeyStore HMAC unavailable.", t)
            }
            jvmEphemeralKeys.getOrPut(shopProfile.id) {
                val raw = ByteArray(32).also { secureRandom.nextBytes(it) }
                SecretKeySpec(raw, HMAC_ALGORITHM)
            }
        }
    }

    /**
     * Computes the unique Shop Device Challenge Code.
     */
    fun computeDeviceChallenge(shopProfile: ShopProfile): String {
        val cleanPhone = shopProfile.phone.filter { it.isDigit() }.takeLast(4).ifBlank { "8801" }
        val shopHash = abs(shopProfile.shopName.trim().lowercase(Locale.ROOT).hashCode() % 900 + 100)
        return "BB-$cleanPhone-$shopHash"
    }

    /**
     * Generates a cryptographically valid device-bound voucher (BB format).
     */
    fun generateCryptographicVoucher(
        shopProfile: ShopProfile,
        tierCode: String,
        days: Int = 30,
        validityWindowDays: Int = 14
    ): String {
        val challenge = computeDeviceChallenge(shopProfile)
        val challengeShortHash = (abs(challenge.hashCode()) % 100000).toString().padStart(5, '0')
        val expiryEpochDays = (System.currentTimeMillis() / (24 * 60 * 60 * 1000L)) + validityWindowDays
        val expiryHex = expiryEpochDays.toString(16).uppercase(Locale.ROOT)

        val rawPayload = "$tierCode:$days:$expiryHex:$challengeShortHash"
        val key = getOrCreateIsolatedHmacKey(shopProfile)
        val signature = computeHmacSignature(rawPayload, key).take(8).uppercase(Locale.ROOT)

        return "BB-$tierCode-$days-$expiryHex-$challengeShortHash-$signature"
    }

    /**
     * Returns true when the pasted or typed text matches a complete cryptographic
     * BB2 account-bound unlock code or BB hardware voucher token so the UI can
     * immediately verify and auto-unlock without extra clicks.
     */
    fun isCompleteUnlockCodeFormat(input: String): Boolean {
        val raw = input.trim()
        if (raw.isBlank()) return false
        val rawParts = raw.split("-")

        // BB3 signatures are case-sensitive standard Base64, so never uppercase the whole code.
        if (rawParts.size == 7 && rawParts[0].equals("BB3", ignoreCase = true)) {
            val tier = rawParts[1].uppercase(Locale.ROOT)
            val days = rawParts[2].toIntOrNull() ?: 0
            val expiry = rawParts[3].uppercase(Locale.ROOT)
            val account = rawParts[4].uppercase(Locale.ROOT)
            val nonce = rawParts[5].uppercase(Locale.ROOT)
            val signature = try {
                Base64.decode(rawParts[6], Base64.NO_WRAP)
            } catch (_: IllegalArgumentException) {
                return false
            }
            val canonicalSignature = Base64.encodeToString(signature, Base64.NO_WRAP)
            return tier.matches(Regex("[A-Z]{2,12}")) &&
                days > 0 &&
                expiry.length in 3..8 && expiry.all { it in '0'..'9' || it in 'A'..'F' } &&
                account.length == 6 && account.all { it in '0'..'9' || it in 'A'..'F' } &&
                nonce.length == 24 && nonce.all { it in '0'..'9' || it in 'A'..'F' } &&
                signature.size in 68..72 &&
                canonicalSignature == rawParts[6]
        }

        val clean = raw.uppercase(Locale.ROOT)
        val parts = clean.split("-")
        if (parts.size != 6) return false
        val prefix = parts[0]
        if (prefix != "BB2" && prefix != "BB") return false
        val tierOk = parts[1].length in 2..12 && parts[1].all { it.isLetter() }
        val daysOk = (parts[2].toIntOrNull() ?: 0) > 0
        val expiryOk = parts[3].length in 3..8 && parts[3].all { it in '0'..'9' || it in 'A'..'F' }
        val bindOk = if (prefix == "BB2") {
            parts[4].length == 6 && parts[4].all { it in '0'..'9' || it in 'A'..'F' }
        } else {
            parts[4].length == 5 && parts[4].all { it.isDigit() }
        }
        val sigOk = parts[5].length == 8 && parts[5].all { it in '0'..'9' || it in 'A'..'F' }
        return tierOk && daysOk && expiryOk && bindOk && sigOk
    }

    /**
     * Verifies an Admin Unlock Code (BB2) or hardware-bound voucher (BB).
     * Rejects unverified payment references and wildcard hashes.
     */
    fun verifyVoucherToken(
        voucherInput: String,
        shopProfile: ShopProfile,
        branchCount: Int = 1,
        workerCount: Int = 1,
        alreadyRedeemedHashes: Set<String> = emptySet(),
        ownerUsername: String = "",
        ownerPhoneOverride: String = ""
    ): VoucherValidationResult {
        val rawCode = voucherInput.trim()
        if (rawCode.isBlank()) {
            return VoucherValidationResult(false, 0, "Please enter an unlock code", "")
        }

        val voucherFingerprint = computeVoucherFingerprint(rawCode)
        if (alreadyRedeemedHashes.contains(voucherFingerprint)) {
            return VoucherValidationResult(
                isValid = false,
                daysToAdd = 0,
                message = "This unlock code has already been redeemed and cannot be reused (Anti-Replay Protection).",
                planName = ""
            )
        }

        val pricing = OfflineSubscriptionManager.calculateSubscriptionPrice(branchCount, workerCount, 1)
        val parts = rawCode.split("-")
        val prefix = parts.firstOrNull()?.uppercase(Locale.ROOT).orEmpty()

        // BB3 is offline-verifiable using a pinned public key. No private/shared key is present here.
        if (parts.size == 7 && prefix == "BB3") {
            val usernames = listOf(ownerUsername.trim()).filter { it.isNotEmpty() }.distinct()
            val phones = listOf(shopProfile.phone, ownerPhoneOverride)
                .map { it.trim() }
                .filter { normalizePhoneLast9(it).isNotEmpty() }
                .distinct()
            val accountMatches = usernames.any { username ->
                phones.any { phone ->
                    computeAccountBindingHash(username, phone) == parts[4].uppercase(Locale.ROOT)
                }
            }
            if (!accountMatches) {
                return VoucherValidationResult(
                    isValid = false,
                    daysToAdd = 0,
                    message = "Account mismatch: this BB3 code belongs to a different username or phone.",
                    planName = ""
                )
            }

            val valid = phones.any { phone ->
                verifyBB3CodeWithPublicKey(rawCode, ownerUsername, phone, bb3PublicKey)
            }
            if (!valid) {
                return VoucherValidationResult(
                    isValid = false,
                    daysToAdd = 0,
                    message = "BB3 signature verification failed. The code may be invalid, expired or modified.",
                    planName = ""
                )
            }
            val tier = parts[1].uppercase(Locale.ROOT)
            val days = parts[2].toIntOrNull() ?: 0
            val (planName, verifiedAmt) = mapTierNameAndAmount(tier, branchCount, pricing.totalPayable)
            return VoucherValidationResult(
                isValid = true,
                daysToAdd = days,
                message = "Secure BB3 unlock code verified offline. Subscription extended by +$days days.",
                planName = planName,
                verifiedAmount = verifiedAmt
            )
        }

        val cleanCode = rawCode.uppercase(Locale.ROOT)
        val normalizedParts = cleanCode.split("-")

        // Legacy BB2 HMAC codes are no longer accepted offline because a shared key was
        // previously distributed in APK builds. SubscriptionManager verifies them online
        // against the exact, unredeemed server-issued record instead.
        if (normalizedParts.size == 6 && normalizedParts[0] == "BB2") {
            return VoucherValidationResult(
                isValid = false,
                daysToAdd = 0,
                message = "This is a legacy BB2 code. Connect to the internet to verify it securely with BeBoss before activation.",
                planName = ""
            )
        }

        // Device-bound hardware voucher: HMAC key never leaves this Android installation.
        if (normalizedParts.size == 6 && normalizedParts[0] == "BB") {
            val tier = normalizedParts[1]
            val days = normalizedParts[2].toIntOrNull() ?: 0
            val expiryHex = normalizedParts[3]
            val challengeHash = normalizedParts[4]
            val receivedSignature = normalizedParts[5]

            val expiryEpochDays = expiryHex.toLongOrNull(16)
            val currentEpochDays = ClockGuard.effectiveNowMs() / 86_400_000L
            if (expiryEpochDays == null || currentEpochDays > expiryEpochDays) {
                return VoucherValidationResult(false, 0, "This voucher has expired or has an invalid expiry header.", "")
            }

            val myChallenge = computeDeviceChallenge(shopProfile)
            val expectedChallengeHash = (abs(myChallenge.hashCode()) % 100000).toString().padStart(5, '0')
            if (challengeHash != expectedChallengeHash) {
                return VoucherValidationResult(
                    isValid = false,
                    daysToAdd = 0,
                    message = "This voucher was issued for a different shop device ($challengeHash).",
                    planName = ""
                )
            }

            val payload = "$tier:$days:$expiryHex:$challengeHash"
            val key = try {
                getOrCreateIsolatedHmacKey(shopProfile)
            } catch (e: SecurityException) {
                return VoucherValidationResult(false, 0, e.message ?: "Hardware voucher keystore unavailable.", "")
            }
            val expectedSig = computeHmacSignature(payload, key).take(8).uppercase(Locale.ROOT)
            return if (slowEquals(receivedSignature, expectedSig)) {
                val (planName, verifiedAmt) = mapTierNameAndAmount(tier, branchCount, pricing.totalPayable)
                VoucherValidationResult(
                    isValid = true,
                    daysToAdd = days.coerceAtLeast(1),
                    message = "Cryptographic Voucher Verified & Authenticated! (+$days Days)",
                    planName = planName,
                    verifiedAmount = verifiedAmt
                )
            } else {
                VoucherValidationResult(false, 0, "Voucher signature verification failed (Tampered or Invalid Code).", "")
            }
        }

        return VoucherValidationResult(
            isValid = false,
            daysToAdd = 0,
            message = "Unrecognized unlock code. Submit your MoMo transaction reference for admin verification to receive a signed BB3-... code.",
            planName = ""
        )
    }

    /**
     * Shared verifier for production and unit tests. The production caller always supplies
     * the public key pinned in this APK; test code can supply a throwaway public key.
     */
    internal fun verifyBB3CodeWithPublicKey(
        code: String,
        username: String,
        phone: String,
        publicKey: PublicKey,
        nowMs: Long = ClockGuard.effectiveNowMs()
    ): Boolean {
        val parts = code.trim().split("-")
        if (parts.size != 7 || !parts[0].equals("BB3", true)) return false
        val tier = parts[1].uppercase(Locale.ROOT)
        val days = parts[2].toIntOrNull() ?: return false
        if (days !in 1..800) return false
        val expiryHex = parts[3].uppercase(Locale.ROOT)
        val expiryEpochDay = expiryHex.toLongOrNull(16) ?: return false
        val today = nowMs / 86_400_000L
        if (today > expiryEpochDay) return false
        val accountHash = parts[4].uppercase(Locale.ROOT)
        if (accountHash != computeAccountBindingHash(username, phone)) return false
        val nonce = parts[5].uppercase(Locale.ROOT)
        if (nonce.length != 24 || !nonce.all { it in '0'..'9' || it in 'A'..'F' }) return false
        val payload = "BB3:$tier:$days:$expiryHex:$accountHash:$nonce"
        val signatureBytes = try {
            Base64.decode(parts[6], Base64.NO_WRAP)
        } catch (_: IllegalArgumentException) {
            return false
        }
        return try {
            val verifier = Signature.getInstance("SHA256withECDSA")
            verifier.initVerify(publicKey)
            verifier.update(payload.toByteArray(StandardCharsets.UTF_8))
            verifier.verify(signatureBytes)
        } catch (_: Exception) {
            false
        }
    }

    private fun mapTierNameAndAmount(tier: String, branchCount: Int, calculatedMonthly: Int): Pair<String, Int> {
        return when (tier) {
            "ANNUAL" -> Pair("Annual VIP Merchant Plan", calculatedMonthly * 10)
            "MULTI" -> Pair("Enterprise Multi-Branch ($branchCount Branches)", 20000)
            "DUAL" -> Pair("Dual Branch Plan", 10000)
            else -> Pair("Single Store Standard Plan", 5000)
        }
    }

    fun computeVoucherFingerprint(code: String): String {
        val raw = code.trim()
        val canonical = if (raw.substringBefore("-").equals("BB3", true)) raw else raw.uppercase(Locale.ROOT)
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(canonical.toByteArray(StandardCharsets.UTF_8))
        return SecurityUtils.bytesToHex(hash)
    }

    private fun computeHmacSignature(data: String, key: SecretKey): String {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(key)
        val hmacBytes = mac.doFinal(data.toByteArray(StandardCharsets.UTF_8))
        return SecurityUtils.bytesToHex(hmacBytes)
    }

    fun generateSecureTokenNonce(byteCount: Int = 8): String {
        val bytes = ByteArray(byteCount)
        secureRandom.nextBytes(bytes)
        return SecurityUtils.bytesToHex(bytes).uppercase(Locale.ROOT)
    }

    private fun slowEquals(a: String, b: String): Boolean {
        if (a.isEmpty() || b.isEmpty()) return false
        return MessageDigest.isEqual(
            a.uppercase(Locale.ROOT).toByteArray(StandardCharsets.UTF_8),
            b.uppercase(Locale.ROOT).toByteArray(StandardCharsets.UTF_8)
        )
    }

    /** Compatibility name retained for callers/tests; only public-key BB3 codes verify locally. */
    fun verifyUnlockCode(code: String, username: String, phone: String): Boolean =
        verifyBB3CodeWithPublicKey(code, username, phone, bb3PublicKey)
}
