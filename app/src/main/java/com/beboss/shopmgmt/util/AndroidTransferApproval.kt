package com.beboss.shopmgmt.util

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.math.BigDecimal
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.MessageDigest
import java.security.spec.ECGenParameterSpec
import java.util.Locale

/**
 * The cached policy is advisory for offline UX only. The server re-reads the current
 * policy and verifies the proof before accepting an above-threshold transfer.
 */
data class CachedTransferApprovalPolicy(
    val version: Long,
    val thresholdRwf: Long,
    val fetchedAt: Long,
    val signingKeyRegistered: Boolean
)

data class TransferApprovalProof(
    val reason: String,
    val actorUserId: String,
    val signedAt: Long,
    val policyVersion: Long,
    val deviceId: String,
    val signature: String
)

object TransferApprovalPolicyCache {
    private const val PREFS = "beboss_transfer_approval_policy_v1"
    private const val MAX_AGE_MS = 30L * 24L * 60L * 60L * 1000L

    private fun key(shopId: String, field: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(shopId.trim().toByteArray(Charsets.UTF_8))
        val shopKey = digest.joinToString("") { "%02x".format(Locale.ROOT, it) }
        return "$shopKey.$field"
    }

    fun load(context: Context, shopId: String): CachedTransferApprovalPolicy? {
        if (shopId.isBlank()) return null
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val prefix = key(shopId, "policy")
        val version = prefs.getLong("$prefix.version", -1L)
        val threshold = prefs.getLong("$prefix.threshold", -1L)
        val fetchedAt = prefs.getLong("$prefix.fetchedAt", 0L)
        val now = System.currentTimeMillis()
        if (version < 0L || threshold < 0L || threshold > 10_000_000_000L ||
            fetchedAt <= 0L || fetchedAt > now + 5L * 60L * 1000L ||
            now - fetchedAt > MAX_AGE_MS) return null
        return CachedTransferApprovalPolicy(
            version = version,
            thresholdRwf = threshold,
            fetchedAt = fetchedAt,
            signingKeyRegistered = prefs.getBoolean("$prefix.keyRegistered", false)
        )
    }

    fun save(
        context: Context,
        shopId: String,
        version: Long,
        thresholdRwf: Long,
        fetchedAt: Long,
        signingKeyRegistered: Boolean
    ) {
        require(shopId.isNotBlank() && version >= 0L && thresholdRwf in 0L..10_000_000_000L)
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val prefix = key(shopId, "policy")
        check(prefs.edit()
            .putLong("$prefix.version", version)
            .putLong("$prefix.threshold", thresholdRwf)
            .putLong("$prefix.fetchedAt", fetchedAt)
            .putBoolean("$prefix.keyRegistered", signingKeyRegistered)
            .commit()) { "Could not persist the shop's transfer approval policy." }
    }

    fun markSigningKeyRegistered(context: Context, shopId: String, registered: Boolean) {
        if (shopId.isBlank()) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val prefix = key(shopId, "policy")
        prefs.edit().putBoolean("$prefix.keyRegistered", registered).apply()
    }
}

/**
 * Non-exportable P-256 private key held by Android Keystore. Only the public key is
 * registered with BeBoss Cloud. A server-side verification is required at sync time.
 */
object AndroidTransferApprovalSigner {
    private const val KEYSTORE = "AndroidKeyStore"

    private fun alias(shopId: String, deviceId: String): String {
        val bytes = MessageDigest.getInstance("SHA-256")
            .digest("${shopId.trim()}|${deviceId.trim()}".toByteArray(Charsets.UTF_8))
        val suffix = bytes.joinToString("") { "%02x".format(Locale.ROOT, it) }
        return "beboss.transfer.owner.$suffix"
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

    private fun ensureKeyPair(shopId: String, deviceId: String): KeyStore {
        require(shopId.isNotBlank() && deviceId.isNotBlank()) {
            "A registered shop and device identity are required for owner approval."
        }
        val store = keyStore()
        val keyAlias = alias(shopId, deviceId)
        if (!store.containsAlias(keyAlias)) {
            val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
            generator.initialize(
                KeyGenParameterSpec.Builder(
                    keyAlias,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                )
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build()
            )
            generator.generateKeyPair()
        }
        return store
    }

    fun publicKeyBase64(shopId: String, deviceId: String): String {
        val store = ensureKeyPair(shopId, deviceId)
        val certificate = store.getCertificate(alias(shopId, deviceId))
            ?: throw SecurityException("The owner approval public key is unavailable.")
        return Base64.encodeToString(certificate.publicKey.encoded, Base64.NO_WRAP)
    }

    fun sign(
        shopId: String,
        deviceId: String,
        transferId: String,
        productId: String,
        fromBranchId: String,
        toBranchId: String,
        quantity: Double,
        costValueRwf: Long,
        policyVersion: Long,
        actorUserId: String,
        reason: String,
        signedAt: Long = System.currentTimeMillis()
    ): TransferApprovalProof {
        require(reason.trim().length >= 8) { "An owner approval explanation of at least 8 characters is required." }
        require(quantity.isFinite() && quantity > 0.0 && costValueRwf >= 0L && policyVersion >= 0L)
        val keyAlias = alias(shopId, deviceId)
        val store = ensureKeyPair(shopId, deviceId)
        val privateKey = store.getKey(keyAlias, null) as? PrivateKey
            ?: throw SecurityException("The Android Keystore owner approval key is unavailable.")
        val canonical = canonicalMessage(
            shopId, transferId, productId, fromBranchId, toBranchId, quantity,
            costValueRwf, policyVersion, actorUserId, deviceId, signedAt, reason.trim()
        )
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(privateKey)
        signer.update(canonical.toByteArray(Charsets.UTF_8))
        return TransferApprovalProof(
            reason = reason.trim(),
            actorUserId = actorUserId,
            signedAt = signedAt,
            policyVersion = policyVersion,
            deviceId = deviceId,
            signature = Base64.encodeToString(signer.sign(), Base64.NO_WRAP)
        )
    }

    fun canonicalMessage(
        shopId: String,
        transferId: String,
        productId: String,
        fromBranchId: String,
        toBranchId: String,
        quantity: Double,
        costValueRwf: Long,
        policyVersion: Long,
        actorUserId: String,
        deviceId: String,
        signedAt: Long,
        reason: String
    ): String {
        val normalizedQuantity = BigDecimal.valueOf(quantity).stripTrailingZeros().toPlainString()
        val fields = listOf(
            "BEBOSS_TRANSFER_APPROVAL_V1",
            shopId.trim(),
            transferId.trim(),
            productId.trim(),
            fromBranchId.trim(),
            toBranchId.trim(),
            normalizedQuantity,
            costValueRwf.toString(),
            policyVersion.toString(),
            actorUserId.trim(),
            deviceId.trim(),
            signedAt.toString(),
            reason.trim()
        )
        return fields.joinToString("|") { field ->
            val bytes = field.toByteArray(Charsets.UTF_8)
            "${bytes.size}:" + Base64.encodeToString(bytes, Base64.NO_WRAP)
        }
    }
}
