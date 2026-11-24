package com.beboss.shopmgmt.util

import android.content.Context

data class AndroidDeviceCredential(
    val shopId: String,
    val deviceId: String,
    val accessToken: String,
    val refreshToken: String,
    val accessExpiresAt: Long,
    val refreshExpiresAt: Long
)

object AndroidDeviceCredentialStore {
    private const val PREFS = "beboss_android_device_credentials_v1"
    private const val KEY_SHOP_ID = "shop_id"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_ACCESS = "access_wrapped"
    private const val KEY_REFRESH = "refresh_wrapped"
    private const val KEY_ACCESS_EXPIRY = "access_expires_at"
    private const val KEY_REFRESH_EXPIRY = "refresh_expires_at"

    @Volatile
    private var appContext: Context? = null

    fun initialize(context: Context) {
        appContext = context.applicationContext
    }

    fun hasCredential(shopId: String, deviceId: String): Boolean {
        val prefs = appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE) ?: return false
        return prefs.getString(KEY_SHOP_ID, null) == shopId &&
            prefs.getString(KEY_DEVICE_ID, null) == deviceId &&
            !prefs.getString(KEY_ACCESS, null).isNullOrBlank() &&
            !prefs.getString(KEY_REFRESH, null).isNullOrBlank()
    }

    fun readForShop(shopId: String): AndroidDeviceCredential? {
        val context = appContext ?: return null
        val deviceId = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_DEVICE_ID, null) ?: return null
        return read(shopId, deviceId)
    }

    fun hasCredentialForShop(shopId: String): Boolean {
        val context = appContext ?: return false
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getString(KEY_SHOP_ID, null) == shopId &&
            !prefs.getString(KEY_ACCESS, null).isNullOrBlank() &&
            !prefs.getString(KEY_REFRESH, null).isNullOrBlank()
    }

    fun read(shopId: String, deviceId: String): AndroidDeviceCredential? {
        val context = appContext ?: return null
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_SHOP_ID, null) != shopId ||
            prefs.getString(KEY_DEVICE_ID, null) != deviceId) return null

        val accessEnvelope = prefs.getString(KEY_ACCESS, null) ?: return null
        val refreshEnvelope = prefs.getString(KEY_REFRESH, null) ?: return null
        return try {
            AndroidDeviceCredential(
                shopId = shopId,
                deviceId = deviceId,
                accessToken = CryptoKeyManager.decryptDeviceCredential(accessEnvelope),
                refreshToken = CryptoKeyManager.decryptDeviceCredential(refreshEnvelope),
                accessExpiresAt = prefs.getLong(KEY_ACCESS_EXPIRY, 0L),
                refreshExpiresAt = prefs.getLong(KEY_REFRESH_EXPIRY, 0L)
            )
        } catch (error: Exception) {
            // Do not silently fall back to the deterministic tenant key when the
            // keystore-wrapped credential cannot be opened. The caller can re-enroll.
            clear()
            null
        }
    }

    fun save(credential: AndroidDeviceCredential) {
        require(credential.shopId.isNotBlank())
        require(credential.deviceId.length in 4..120)
        require(credential.accessExpiresAt > System.currentTimeMillis())
        require(credential.refreshExpiresAt > credential.accessExpiresAt)

        val context = appContext ?: throw IllegalStateException("Device credential storage is not initialized.")
        val accessEnvelope = CryptoKeyManager.encryptDeviceCredential(credential.accessToken)
        val refreshEnvelope = CryptoKeyManager.encryptDeviceCredential(credential.refreshToken)
        val committed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_SHOP_ID, credential.shopId)
            .putString(KEY_DEVICE_ID, credential.deviceId)
            .putString(KEY_ACCESS, accessEnvelope)
            .putString(KEY_REFRESH, refreshEnvelope)
            .putLong(KEY_ACCESS_EXPIRY, credential.accessExpiresAt)
            .putLong(KEY_REFRESH_EXPIRY, credential.refreshExpiresAt)
            .commit()
        check(committed) { "Failed to persist the encrypted device credential." }
    }

    fun clear() {
        val context = appContext ?: return
        val committed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().clear().commit()
        check(committed) { "Failed to clear the local device credential." }
    }
}
