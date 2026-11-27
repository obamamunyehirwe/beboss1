package com.beboss.shopmgmt.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest

class AndroidAppReleaseTest {
    private val release = AndroidAppRelease(
        id = "2f9d4de0-a015-48ea-baa2-c61edb5dca72",
        versionName = "2.6.0",
        versionCode = 20L,
        fileName = "BeBoss-2.6.0.apk",
        sizeBytes = 1024L,
        sha256 = "a".repeat(64),
        minimumAndroid = "Android 7.0+",
        releaseNotes = "Security and reliability updates"
    )

    @Test
    fun newerReleaseIsOfferedOnlyForHigherVersionCodes() {
        assertTrue(release.isNewerThan(19L))
        assertFalse(release.isNewerThan(20L))
        assertFalse(release.isNewerThan(21L))
    }

    @Test
    fun downloadedApkMustMatchThePinnedProductionSigningCertificate() {
        val certificateDer = byteArrayOf(0x30, 0x02, 0x01, 0x00, 0x7F)
        val fingerprint = MessageDigest.getInstance("SHA-256")
            .digest(certificateDer)
            .joinToString("") { byte -> "%02X".format(byte.toInt() and 0xFF) }

        assertTrue(release.hasExpectedSigningCertificate(certificateDer, fingerprint))
        assertTrue(release.hasExpectedSigningCertificate(certificateDer, fingerprint.chunked(2).joinToString(":")))
        assertFalse(release.hasExpectedSigningCertificate(certificateDer, "0".repeat(64)))
        assertFalse(release.hasExpectedSigningCertificate(certificateDer, ""))
        assertFalse(release.hasExpectedSigningCertificate(byteArrayOf(), fingerprint))
    }

    @Test
    fun publicReleaseMetadataRejectsInvalidIdsHashesAndPaths() {
        assertTrue(release.hasValidPublicMetadata())
        assertFalse(release.copy(id = "not-a-uuid").hasValidPublicMetadata())
        assertFalse(release.copy(sha256 = "not-a-checksum").hasValidPublicMetadata())
        assertFalse(release.copy(fileName = "../other.apk").hasValidPublicMetadata())
        assertFalse(release.copy(fileName = "BeBoss.zip").hasValidPublicMetadata())
        assertFalse(release.copy(sizeBytes = 0L).hasValidPublicMetadata())
        assertFalse(release.copy(versionCode = 0L).hasValidPublicMetadata())
    }
    @Test
    fun publicReleaseVersionAndFileNameAreBounded() {
        assertFalse(release.copy(versionName = " ".repeat(81)).hasValidPublicMetadata())
        assertFalse(release.copy(fileName = "x".repeat(181) + ".apk").hasValidPublicMetadata())
        assertFalse(release.copy(versionCode = 1_000_001L).hasValidPublicMetadata())
    }
}
