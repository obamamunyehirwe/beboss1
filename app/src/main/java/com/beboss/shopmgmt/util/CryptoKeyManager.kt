package com.beboss.shopmgmt.util

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Hardware-backed cryptographic key and AES-256-GCM envelope manager.
 * Uses AndroidKeyStore (preferring StrongBox on API 28+ with TEE fallback)
 * to wrap at-rest SQLCipher database passphrases and provides domain-separated
 * HKDF subkeys + AES-GCM encryption for LAN P2P sync.
 * Zero hardcoded secret keys or deterministic key fallbacks.
 */
object CryptoKeyManager {

    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val DB_MASTER_KEY_ALIAS = "BeBoss_SQLCipher_Master_AES256"
    private const val BIOMETRIC_KEY_ALIAS = "BeBoss_Biometric_Strong_AES256"
    private const val LAN_SHARED_SECRET_KEY_ALIAS = "BeBoss_LAN_Shop_Secret_AES256"
    private const val DEVICE_CREDENTIAL_KEY_ALIAS = "BeBoss_Device_Auth_AES256"
    private const val CRYPTO_PREFS = "beboss_hardware_crypto_prefs"
    private const val PREF_WRAPPED_DB_KEY = "wrapped_db_passphrase_v1"

    private const val AES_GCM_TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128
    private const val GCM_IV_BYTES = 12
    private const val ENVELOPE_PREFIX = "GCM1:"

    private val secureRandom = SecureRandom()

    fun isRobolectricJvm(): Boolean {
        return try {
            val fp = Build.FINGERPRINT
            fp.isNullOrBlank() || fp.equals("robolectric", ignoreCase = true)
        } catch (_: Throwable) {
            true
        }
    }

    /**
     * Checks that a BuildConfig secret is present, non-blank, and properly provisioned.
     */
    fun requireConfiguredSecret(rawSecret: String, secretName: String): String {
        val clean = rawSecret.trim()
        if (clean.isEmpty()) {
            throw SecurityException("$secretName is missing from BuildConfig/Secrets.")
        }
        return clean
    }

    /**
     * Retrieves or generates a random 32-byte SQLCipher passphrase wrapped with an
     * AndroidKeyStore hardware AES-256-GCM master key (StrongBox preferred on API 28+).
     * Fails closed on Android devices if AndroidKeyStore cannot protect the key.
     */
    @Synchronized
    fun getOrCreateDatabasePassphrase(context: Context): ByteArray {
        val prefs = context.getSharedPreferences(CRYPTO_PREFS, Context.MODE_PRIVATE)
        val wrapped = prefs.getString(PREF_WRAPPED_DB_KEY, null)
        val masterKey = getOrCreateAndroidKeyStoreAesKey(
            alias = DB_MASTER_KEY_ALIAS,
            requireUserAuth = false
        )

        if (!wrapped.isNullOrBlank()) {
            return unwrapWithKeyStoreKey(masterKey, wrapped)
        }

        val rawPassphrase = ByteArray(32).also { secureRandom.nextBytes(it) }
        val sealed = wrapWithKeyStoreKey(masterKey, rawPassphrase)
        val committed = prefs.edit().putString(PREF_WRAPPED_DB_KEY, sealed).commit()
        if (!committed) {
            throw SecurityException("Failed to persist wrapped SQLCipher passphrase securely.")
        }
        return rawPassphrase
    }

    /**
     * Initializes an authenticated Cipher bound to BIOMETRIC_STRONG in AndroidKeyStore.
     */
    fun createBiometricStrongCipher(): Cipher {
        val key = getOrCreateAndroidKeyStoreAesKey(
            alias = BIOMETRIC_KEY_ALIAS,
            requireUserAuth = true
        )
        return Cipher.getInstance(AES_GCM_TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, key)
        }
    }

    fun getOrCreateAndroidKeyStoreAesKey(
        alias: String,
        requireUserAuth: Boolean
    ): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (ks.containsAlias(alias)) {
            val existing = ks.getKey(alias, null) as? SecretKey
            if (existing != null) return existing
        }

        // Prefer dedicated StrongBox HSM on API 28+, transparently falling back to TEE AndroidKeyStore
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                return generateAndroidKeyStoreAesKey(
                    alias = alias,
                    requireUserAuth = requireUserAuth,
                    useStrongBox = true
                )
            } catch (_: StrongBoxUnavailableException) {
                // Device lacks StrongBox chip; fall back to hardware TEE AndroidKeyStore
            } catch (_: Exception) {
                // Some OEMs throw ProviderException when StrongBox cannot satisfy spec
            }
        }

        return generateAndroidKeyStoreAesKey(
            alias = alias,
            requireUserAuth = requireUserAuth,
            useStrongBox = false
        )
    }

    private fun generateAndroidKeyStoreAesKey(
        alias: String,
        requireUserAuth: Boolean,
        useStrongBox: Boolean
    ): SecretKey {
        val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val builder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)

        if (useStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setIsStrongBoxBacked(true)
        }

        if (requireUserAuth) {
            builder.setUserAuthenticationRequired(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                builder.setInvalidatedByBiometricEnrollment(true)
            }
        }

        keyGen.init(builder.build())
        return keyGen.generateKey()
    }

    /**
     * Reports whether the database wrapping master key resides inside hardware security
     * (StrongBox or TEE) for display in the Security & Diagnostics console.
     */
    fun getHardwareKeystoreStatus(): String {
        if (isRobolectricJvm()) return "JVM Test Harness"
        return try {
            val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            val key = ks.getKey(DB_MASTER_KEY_ALIAS, null) as? SecretKey
                ?: return "AndroidKeyStore Ready (Unprovisioned)"
            val factory = SecretKeyFactory.getInstance(key.algorithm, ANDROID_KEYSTORE)
            val info = factory.getKeySpec(key, KeyInfo::class.java) as? KeyInfo
            if (info == null) return "AndroidKeyStore AES-256-GCM"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                when (info.securityLevel) {
                    KeyProperties.SECURITY_LEVEL_STRONGBOX -> "StrongBox HSM (AES-256-GCM)"
                    KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "Hardware TEE (AES-256-GCM)"
                    else -> "AndroidKeyStore Software"
                }
            } else {
                @Suppress("DEPRECATION")
                if (info.isInsideSecureHardware) "Hardware TEE / StrongBox (AES-256-GCM)"
                else "AndroidKeyStore AES-256-GCM"
            }
        } catch (_: Throwable) {
            "AndroidKeyStore AES-256-GCM"
        }
    }

    private fun wrapWithKeyStoreKey(key: SecretKey, plain: ByteArray): String {
        val cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plain)
        return "$ENVELOPE_PREFIX${b64Encode(iv)}:${b64Encode(ciphertext)}"
    }

    private fun unwrapWithKeyStoreKey(key: SecretKey, envelope: String): ByteArray {
        require(envelope.startsWith(ENVELOPE_PREFIX)) { "Corrupt wrapped key envelope" }
        val parts = envelope.removePrefix(ENVELOPE_PREFIX).split(":", limit = 2)
        require(parts.size == 2) { "Malformed wrapped key envelope" }
        val iv = b64Decode(parts[0])
        val ciphertext = b64Decode(parts[1])
        val cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
        return cipher.doFinal(ciphertext)
    }

    /**
     * Protect opaque server-issued device access/refresh credentials with a dedicated
     * AndroidKeyStore AES-GCM key. The wrapped envelopes are safe to persist in private
     * app preferences; plaintext token values are never written to disk.
     */
    fun encryptDeviceCredential(value: String): String {
        require(value.length in 16..4096) { "Invalid device credential value." }
        val key = getOrCreateAndroidKeyStoreAesKey(
            alias = DEVICE_CREDENTIAL_KEY_ALIAS,
            requireUserAuth = false
        )
        return wrapWithKeyStoreKey(key, value.toByteArray(StandardCharsets.UTF_8))
    }

    fun decryptDeviceCredential(envelope: String): String {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val key = keyStore.getKey(DEVICE_CREDENTIAL_KEY_ALIAS, null) as? SecretKey
            ?: throw SecurityException("This terminal has not provisioned its device credential key.")
        val plain = unwrapWithKeyStoreKey(key, envelope)
        val value = String(plain, StandardCharsets.UTF_8)
        require(value.length in 16..4096) { "The stored device credential is invalid." }
        plain.fill(0)
        return value
    }

    /**
     * Wrap a per-shop LAN authentication secret with this terminal's Android Keystore key.
     * The cloud secret can therefore be shared across a shop's paired phones without
     * storing the raw value in SharedPreferences or inside the APK.
     */
    fun wrapLanSharedSecret(secret: String): String {
        val clean = secret.trim().lowercase()
        require(clean.matches(Regex("[a-f0-9]{64}"))) {
            "Shop LAN secret must be a 256-bit hexadecimal key."
        }
        val key = getOrCreateAndroidKeyStoreAesKey(
            alias = LAN_SHARED_SECRET_KEY_ALIAS,
            requireUserAuth = false
        )
        return wrapWithKeyStoreKey(key, clean.toByteArray(StandardCharsets.UTF_8))
    }

    /** Unwrap the shop secret only on the same terminal/Android Keystore installation. */
    fun unwrapLanSharedSecret(envelope: String): String {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val key = ks.getKey(LAN_SHARED_SECRET_KEY_ALIAS, null) as? SecretKey
            ?: throw SecurityException("This terminal has not provisioned its LAN secret key.")
        val clear = String(unwrapWithKeyStoreKey(key, envelope), StandardCharsets.UTF_8)
        require(clear.matches(Regex("[a-f0-9]{64}"))) {
            "The stored shop LAN secret is invalid."
        }
        return clear
    }

    /**
     * Derives a 32-byte domain-separated subkey using HMAC-SHA256 HKDF-Expand.
     */
    fun deriveSubkey(masterSecret: ByteArray, info: String): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(masterSecret, "HmacSHA256"))
        mac.update(info.toByteArray(StandardCharsets.UTF_8))
        mac.update(byteArrayOf(0x01))
        return mac.doFinal()
    }

    /**
     * Encrypts UTF-8 payload with AES-256-GCM and optional Associated Authenticated Data (AAD).
     */
    fun encryptAesGcm(
        keyBytes32: ByteArray,
        plaintext: ByteArray,
        aad: ByteArray = ByteArray(0)
    ): String {
        require(keyBytes32.size == 32) { "AES-256 key must be 32 bytes." }
        val iv = ByteArray(GCM_IV_BYTES).also { secureRandom.nextBytes(it) }
        val cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION)
        cipher.init(
            Cipher.ENCRYPT_MODE,
            SecretKeySpec(keyBytes32, "AES"),
            GCMParameterSpec(GCM_TAG_BITS, iv)
        )
        if (aad.isNotEmpty()) cipher.updateAAD(aad)
        val ct = cipher.doFinal(plaintext)
        return "$ENVELOPE_PREFIX${b64Encode(iv)}:${b64Encode(ct)}"
    }

    fun decryptAesGcm(
        keyBytes32: ByteArray,
        envelope: String,
        aad: ByteArray = ByteArray(0)
    ): ByteArray {
        require(keyBytes32.size == 32) { "AES-256 key must be 32 bytes." }
        require(envelope.startsWith(ENVELOPE_PREFIX)) { "Missing AES-GCM packet envelope." }
        val parts = envelope.removePrefix(ENVELOPE_PREFIX).split(":", limit = 2)
        require(parts.size == 2) { "Malformed AES-GCM packet envelope." }
        val iv = b64Decode(parts[0])
        val ct = b64Decode(parts[1])
        val cipher = Cipher.getInstance(AES_GCM_TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(keyBytes32, "AES"),
            GCMParameterSpec(GCM_TAG_BITS, iv)
        )
        if (aad.isNotEmpty()) cipher.updateAAD(aad)
        return cipher.doFinal(ct)
    }

    private fun b64Encode(bytes: ByteArray): String =
        Base64.getEncoder().encodeToString(bytes)

    private fun b64Decode(encoded: String): ByteArray =
        Base64.getDecoder().decode(encoded.trim())
}
