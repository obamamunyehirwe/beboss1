package com.beboss.shopmgmt.util

import android.content.Context
import android.os.Build
import java.io.File

data class DeviceIntegrityStatus(
    val isCompromisedRisk: Boolean,
    val signals: List<String> = emptyList(),
    val isRooted: Boolean = false,
    val isEmulator: Boolean = false,
    val hasHookingFramework: Boolean = false,
    val keystoreBacking: String = "AndroidKeyStore",
    val clockRollbackDetected: Boolean = false,
    val tamperIncidentCount: Int = 0,
    val clockSkewSeconds: Long = 0L,
    val riskScore: Int = 0,
    val inspectedAtMs: Long = System.currentTimeMillis()
) {
    val postureLabel: String
        get() = when {
            clockRollbackDetected -> "TAMPER ALERT — Clock Rollback Detected"
            isRooted || hasHookingFramework -> "HIGH RISK — Tampered Environment"
            isCompromisedRisk -> "ELEVATED RISK — Unsigned Build"
            isEmulator -> "EMULATOR — Non-Hardware Attested"
            else -> "VERIFIED — Hardware Protected"
        }
}

/**
 * Runtime device posture inspection (root binaries, Magisk/KernelSU, hooking frameworks,
 * test-keys, emulator indicators, AndroidKeyStore hardware level, and active ClockGuard rollback telemetry).
 */
object DeviceSecurityManager {

    private val suPaths = listOf(
        "/system/bin/su",
        "/system/xbin/su",
        "/sbin/su",
        "/su/bin/su",
        "/system/app/Superuser.apk",
        "/system/bin/.ext/su",
        "/system/usr/we-need-root/su",
        "/sbin/.magisk",
        "/data/adb/magisk",
        "/data/adb/ksu"
    )

    private val hookingIndicators = listOf(
        "/data/local/tmp/frida-server",
        "/data/local/tmp/re.frida.server",
        "/system/framework/XposedBridge.jar",
        "/data/adb/lspd"
    )

    fun inspectDeviceIntegrity(context: Context? = null): DeviceIntegrityStatus {
        val signals = mutableListOf<String>()
        val tags = Build.TAGS.orEmpty()
        val hasTestKeys = tags.contains("test-keys", ignoreCase = true)
        if (hasTestKeys) {
            signals.add("Unsigned test-keys OS build")
        }

        val hasSu = suPaths.any { path ->
            try {
                File(path).exists()
            } catch (_: Throwable) {
                false
            }
        }
        if (hasSu) {
            signals.add("Privileged root/Magisk artifact detected")
        }

        val hasHooks = hookingIndicators.any { path ->
            try {
                File(path).exists()
            } catch (_: Throwable) {
                false
            }
        }
        if (hasHooks) {
            signals.add("Instrumentation / hooking framework detected")
        }

        val isEmulator = (Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.contains("emulator", ignoreCase = true) ||
            Build.MODEL.contains("Android SDK built for", ignoreCase = true) ||
            Build.HARDWARE.contains("goldfish", ignoreCase = true) ||
            Build.HARDWARE.contains("ranchu", ignoreCase = true)) &&
            !CryptoKeyManager.isRobolectricJvm()
        if (isEmulator) {
            signals.add("Running inside virtualized emulator")
        }

        val clockStatus = if (context != null) {
            ClockGuard.reInspectNow(context)
        } else {
            val rollback = ClockGuard.isClockRollbackDetected()
            val cur = ClockGuard.tamperStatus.value
            cur.copy(rollbackDetected = rollback || cur.rollbackDetected)
        }
        val rollbackActive = clockStatus.rollbackDetected || clockStatus.activeTamperLock
        if (rollbackActive) {
            signals.add(
                clockStatus.reason.ifBlank { "Device clock rollback or tamper skew detected" }
            )
        }

        val keystoreBacking = CryptoKeyManager.getHardwareKeystoreStatus()

        var riskScore = 0
        if (hasSu) riskScore += 45
        if (hasHooks) riskScore += 45
        if (hasTestKeys) riskScore += 20
        if (rollbackActive) riskScore += 40
        if (isEmulator) riskScore += 10
        riskScore = riskScore.coerceIn(0, 100)

        return DeviceIntegrityStatus(
            isCompromisedRisk = hasSu || hasHooks || hasTestKeys || rollbackActive,
            signals = signals,
            isRooted = hasSu,
            isEmulator = isEmulator,
            hasHookingFramework = hasHooks,
            keystoreBacking = keystoreBacking,
            clockRollbackDetected = rollbackActive,
            tamperIncidentCount = clockStatus.incidentCount,
            clockSkewSeconds = clockStatus.skewMillis / 1000L,
            riskScore = riskScore,
            inspectedAtMs = ClockGuard.effectiveNowMs(context)
        )
    }
}
