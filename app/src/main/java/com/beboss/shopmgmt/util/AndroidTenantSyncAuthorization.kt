package com.beboss.shopmgmt.util

/**
 * Chooses the only permitted tenant-authentication path for a mobile REST request.
 *
 * An enrollment marker is a security boundary: if encrypted credentials cannot be
 * recovered from Android Keystore, the request must fail closed. It may not silently
 * fall back to the deterministic legacy X-Shop-Sync-Key header.
 */
internal sealed class AndroidTenantSyncAuthorization {
    data class Device(val credential: AndroidDeviceCredential) : AndroidTenantSyncAuthorization()
    object LegacyCompatibility : AndroidTenantSyncAuthorization()
    object Blocked : AndroidTenantSyncAuthorization()
}

internal fun resolveAndroidTenantSyncAuthorization(
    hasEnrollmentMarker: Boolean,
    credential: AndroidDeviceCredential?
): AndroidTenantSyncAuthorization = when {
    !hasEnrollmentMarker -> AndroidTenantSyncAuthorization.LegacyCompatibility
    credential != null -> AndroidTenantSyncAuthorization.Device(credential)
    else -> AndroidTenantSyncAuthorization.Blocked
}
