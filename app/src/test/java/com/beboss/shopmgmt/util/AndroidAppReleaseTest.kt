package com.beboss.shopmgmt.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidAppReleaseTest {
    private val release = AndroidAppRelease(
        id = "2f9d4de0-a015-48ea-baa2-c61edb5dca72",
        versionName = "2.5.1",
        versionCode = 20L,
        fileName = "BeBoss-2.5.1.apk",
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
}
