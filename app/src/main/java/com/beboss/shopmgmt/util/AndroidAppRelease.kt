package com.beboss.shopmgmt.util

import java.util.UUID
import java.security.MessageDigest
import java.util.Locale

/** Public metadata for the one APK release explicitly published by BeBoss Admin. */
data class AndroidAppRelease(
    val id: String,
    val versionName: String,
    val versionCode: Long,
    val fileName: String,
    val sizeBytes: Long,
    val sha256: String,
    val minimumAndroid: String,
    val releaseNotes: String
) {
    fun isNewerThan(installedVersionCode: Long): Boolean =
        versionCode > installedVersionCode

    /**
     * Pins the APK archive to the BeBoss production signing certificate before
     * exposing the downloaded file to Android's package installer.
     */
    fun hasExpectedSigningCertificate(certificateDer: ByteArray, expectedSha256: String): Boolean {
        if (certificateDer.isEmpty()) return false
        val normalized = expectedSha256
            .filter { it.isLetterOrDigit() }
            .uppercase(Locale.ROOT)
        if (!Regex("^[A-F0-9]{64}$").matches(normalized)) return false
        val expectedBytes = ByteArray(32) { index ->
            normalized.substring(index * 2, index * 2 + 2).toInt(16).toByte()
        }
        val actualBytes = MessageDigest.getInstance("SHA-256").digest(certificateDer)
        return MessageDigest.isEqual(actualBytes, expectedBytes)
    }

    /** Reject malformed metadata before it can create a download or installer action. */
    fun hasValidPublicMetadata(): Boolean {
        val validId = runCatching { UUID.fromString(id) }.isSuccess
        val validName = fileName.endsWith(".apk", ignoreCase = true) &&
            fileName.length in 5..180 &&
            !fileName.contains('/') &&
            !fileName.contains('\\') &&
            fileName != "." &&
            fileName != ".."
        val validVersion = versionCode in 1L..1_000_000L &&
            versionName.isNotBlank() &&
            versionName.length <= 80
        val validSize = sizeBytes in 1L..(512L * 1024L * 1024L)
        val validHash = Regex("^[a-f0-9]{64}$").matches(sha256)
        return validId && validName && validVersion && validSize && validHash
    }
}
