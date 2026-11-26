package com.beboss.shopmgmt.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class AndroidTenantSyncAuthorizationTest {
    private val credential = AndroidDeviceCredential(
        shopId = "shop-tenant-1",
        deviceId = "android-install-1",
        accessToken = "a".repeat(64),
        refreshToken = "b".repeat(64),
        accessExpiresAt = 2_000_000_000_000L,
        refreshExpiresAt = 2_000_000_000_000L + 90L * 24L * 60L * 60L * 1000L
    )

    @Test
    fun legacyHeaderIsAvailableOnlyBeforeEnrollment() {
        assertSame(
            AndroidTenantSyncAuthorization.LegacyCompatibility,
            resolveAndroidTenantSyncAuthorization(hasEnrollmentMarker = false, credential = null)
        )
    }

    @Test
    fun enrolledInstallationUsesItsOwnDeviceCredential() {
        val result = resolveAndroidTenantSyncAuthorization(
            hasEnrollmentMarker = true,
            credential = credential
        )
        assertEquals(AndroidTenantSyncAuthorization.Device(credential), result)
    }

    @Test
    fun enrolledInstallationWithMissingKeystoreCredentialFailsClosed() {
        assertSame(
            AndroidTenantSyncAuthorization.Blocked,
            resolveAndroidTenantSyncAuthorization(hasEnrollmentMarker = true, credential = null)
        )
    }

    @Test
    fun unreadableOrInvalidStoredCredentialNeverDowngradesToLegacy() {
        // AndroidDeviceCredentialStore.read() returns null when a wrapped envelope
        // cannot be opened with this installation's Android Keystore key.
        val unreadableCredential: AndroidDeviceCredential? = null
        val decision = resolveAndroidTenantSyncAuthorization(
            hasEnrollmentMarker = true,
            credential = unreadableCredential
        )
        assertEquals(AndroidTenantSyncAuthorization.Blocked, decision)
    }
}
