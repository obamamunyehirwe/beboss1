package com.beboss.shopmgmt.util

import android.content.Context
import android.util.Log
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.ShopProfile

/**
 * Uploads security posture, permission state, consented foreground location and privacy-safe
 * outbound-message aggregates for one paired terminal. Local dispatch records are acknowledged
 * only after the telemetry upsert itself has succeeded.
 */
object DeviceTelemetryUploader {

    private const val TAG = "DeviceTelemetryUploader"
    private const val MAX_LOCATION_AGE_MS = 24L * 60L * 60L * 1000L
    private const val PRIVACY_PREFS = "beboss_device_privacy"
    private const val KEY_LOCATION_SHARING = "foreground_location_sharing_enabled"

    /** Location reporting stays disabled until the device user explicitly enables it. */
    fun isLocationSharingEnabled(context: Context): Boolean =
        context.applicationContext.getSharedPreferences(PRIVACY_PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_LOCATION_SHARING, false)

    fun setLocationSharingEnabled(context: Context, enabled: Boolean) {
        context.applicationContext.getSharedPreferences(PRIVACY_PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_LOCATION_SHARING, enabled).apply()
        if (!enabled) LocationHelper.clearCachedLocation(context)
    }

    suspend fun upload(
        context: Context,
        database: AppDatabase,
        profile: ShopProfile,
        deviceId: String
    ): Boolean {
        val appContext = context.applicationContext
        if (!SupabaseAdminClient.isConfigured() || profile.shopName.isBlank() || deviceId.isBlank()) {
            return false
        }

        return try {
            val device = database.shopDeviceDao().getByDeviceId(deviceId)
                ?: return false
            if (!device.isActive || device.shopSyncKey.isBlank()) {
                Log.w(TAG, "Skipped security telemetry for an unpaired or inactive terminal")
                return false
            }

            val integrity = DeviceSecurityManager.inspectDeviceIntegrity(appContext)
            val clockTamper = ClockGuard.reInspectNow(appContext)
            val now = ClockGuard.effectiveNowMs(appContext)

            // GPS is uploaded only after explicit in-app opt-in and with foreground permission.
            val locationSharingEnabled = isLocationSharingEnabled(appContext)
            val location = if (locationSharingEnabled && PermissionManager.hasLocationPermission(appContext)) {
                LocationHelper.loadCachedLocation(appContext).takeIf { candidate ->
                    val age = now - candidate.capturedAtMs
                    candidate.isAvailable && age in 0L..MAX_LOCATION_AGE_MS
                }
            } else {
                null
            }

            val pendingRecords = MessageAuditManager.getUnsyncedRecords(appContext)
            val result = SupabaseAdminClient.pushDeviceTelemetry(
                shopSyncKey = device.shopSyncKey,
                shopName = profile.shopName,
                deviceId = deviceId,
                deviceName = device.deviceName,
                integrity = integrity,
                clockTamper = clockTamper,
                location = location,
                unsyncedMessagesCount = pendingRecords.size,
                permissionsSummary = PermissionManager.summarizePermissionsStatus(appContext) + ";location_sharing=" + if (locationSharingEnabled) "enabled" else "disabled",
                messageSummaryJson = MessageAuditManager.buildCloudSummaryJson(appContext)
            )

            if (result) {
                MessageAuditManager.markSynced(
                    appContext,
                    pendingRecords.map { it.id }.toSet()
                )
            } else {
                Log.w(TAG, "Cloud security telemetry upload failed; local message dispatch records remain pending")
            }
            result
        } catch (error: Exception) {
            Log.e(TAG, "Security telemetry upload failed: " + error.message, error)
            false
        }
    }
}
