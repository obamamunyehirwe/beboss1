package com.beboss.shopmgmt.util

import android.content.Context

/**
 * One-time migration vault for old PBKDF2-v1 staff hashes.
 *
 * The Transition APK contains the legacy pepper only long enough to seal it with
 * Android Keystore. Secure APKs do not define that BuildConfig field and can only
 * read the device-wrapped envelope. New credentials never use this value.
 *
 * This value must stay device-local: do not back up or sync the envelope, because
 * the wrapping key belongs to the current Android Keystore installation.
 */
object LegacyCredentialPepperStore {
    private const val PREFERENCES = "beboss_legacy_credential_migration_v1"
    private const val WRAPPED_PEPPER = "android_keystore_wrapped_pepper_v1"

    @Volatile
    private var applicationContext: Context? = null

    @Volatile
    private var cachedPepper: String? = null

    @Volatile
    private var persistentEnvelopeReady: Boolean = false

    @Synchronized
    fun initialize(context: Context) {
        val app = context.applicationContext
        applicationContext = app
        val preferences = app.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        val storedEnvelope = preferences.getString(WRAPPED_PEPPER, null)

        if (!storedEnvelope.isNullOrBlank()) {
            try {
                val recovered = CryptoKeyManager.decryptDeviceCredential(storedEnvelope)
                if (isValidPepper(recovered)) {
                    cachedPepper = recovered
                    persistentEnvelopeReady = true
                    return
                }
                throw SecurityException("The encrypted legacy credential migration value is invalid.")
            } catch (error: Exception) {
                // Do not replace or delete a broken envelope. The transition release
                // can recover using its migration-only BuildConfig value; the secure
                // release fails closed for old hashes without touching user data.
                persistentEnvelopeReady = false
                val transitional = readTransitionBuildConfigPepper()
                if (transitional != null) {
                    cachedPepper = transitional
                    persistWithCurrentKeystore(preferences, transitional)
                    return
                }
                cachedPepper = null
                return
            }
        }

        val transitional = readTransitionBuildConfigPepper()
        if (transitional == null) {
            cachedPepper = null
            persistentEnvelopeReady = false
            return
        }

        cachedPepper = transitional
        if (CryptoKeyManager.isRobolectricJvm()) {
            // Unit tests do not provide AndroidKeyStore. Production Android never
            // treats this in-memory fallback as a completed migration.
            persistentEnvelopeReady = false
            return
        }
        persistWithCurrentKeystore(preferences, transitional)
    }

    fun getLegacyPepper(): String? = cachedPepper

    fun isMigrationEnvelopeReady(): Boolean = persistentEnvelopeReady

    fun migrationStatus(): String = when {
        persistentEnvelopeReady -> "SECURED_IN_ANDROID_KEYSTORE"
        cachedPepper != null -> "TRANSITION_VALUE_AVAILABLE_BUT_NOT_PERSISTED"
        else -> "NO_LEGACY_PEPPER_AVAILABLE"
    }

    private fun persistWithCurrentKeystore(
        preferences: android.content.SharedPreferences,
        pepper: String
    ) {
        try {
            val envelope = CryptoKeyManager.encryptDeviceCredential(pepper)
            val committed = preferences.edit().putString(WRAPPED_PEPPER, envelope).commit()
            persistentEnvelopeReady = committed
            if (!committed) {
                throw IllegalStateException("The Android Keystore migration envelope could not be committed.")
            }
        } catch (_: Exception) {
            // Keep the transition APK usable for this session. Do not claim the device
            // is migrated; diagnostics expose the missing persistent envelope.
            persistentEnvelopeReady = false
        }
    }

    private fun readTransitionBuildConfigPepper(): String? {
        return try {
            val field = Class.forName("com.beboss.shopmgmt.BuildConfig").getField("BEBOSS_SECURITY_PEPPER")
            (field.get(null) as? String)?.trim()?.takeIf(::isValidPepper)
        } catch (_: ReflectiveOperationException) {
            // The final Secure flavor intentionally does not declare this field.
            null
        } catch (_: Exception) {
            null
        }
    }

    private fun isValidPepper(value: String): Boolean =
        value.length >= 32 &&
            value != "DEFAULT_PEPPER_PLACEHOLDER" &&
            value != "BeBossRuntimeHardwarePepperV2"

    @Synchronized
    internal fun setForTests(value: String?) {
        cachedPepper = value?.takeIf(::isValidPepper)
        persistentEnvelopeReady = false
    }
}
