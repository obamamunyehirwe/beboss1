package com.beboss.shopmgmt.util

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
    fun isNewerThan(installedVersionCode: Long): Boolean = versionCode > installedVersionCode
}
