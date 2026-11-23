package com.beboss.shopmgmt.util

import android.content.Context
import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.abs

data class ClockTamperStatus(
    val rollbackDetected: Boolean = false,
    val activeTamperLock: Boolean = false,
    val reason: String = "",
    val skewMillis: Long = 0L,
    val incidentCount: Int = 0,
    val lastTrustedServerMs: Long = 0L,
    val lastInspectedMs: Long = 0L,
    val recentIncidents: List<String> = emptyList()
)

/**
 * Active monotonic high-water & trusted server clock guard against device clock-rollback
 * and forward-skew tampering. Persists tamper incident telemetry and emits live StateFlow alerts.
 */
object ClockGuard {

    private const val PREFS_NAME = "beboss_monotonic_clock"
    private const val KEY_HIGH_WATER_EPOCH = "hw_epoch_ms"
    private const val KEY_ANCHOR_ELAPSED = "hw_elapsed_ms"
    private const val KEY_ROLLBACK_COUNT = "tamper_incident_count"
    private const val KEY_ACTIVE_LOCK = "active_tamper_lock"
    private const val KEY_ROLLBACK_REASON = "rollback_reason"
    private const val KEY_LAST_SERVER_MS = "last_trusted_server_ms"
    private const val KEY_INCIDENT_LOG = "tamper_incident_log"

    private const val ROLLBACK_TOLERANCE_MS = 300_000L // 5 minutes
    private const val FORWARD_JUMP_THRESHOLD_MS = 7L * 24L * 60L * 60L * 1000L // 7 days ahead of server

    private val highWaterEpoch = AtomicLong(0L)
    private val anchorElapsed = AtomicLong(0L)
    @Volatile
    private var initialized = false

    private val _tamperStatus = MutableStateFlow(ClockTamperStatus())
    val tamperStatus: StateFlow<ClockTamperStatus> = _tamperStatus.asStateFlow()

    @Synchronized
    fun init(context: Context) {
        if (!initialized) {
            val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val savedEpoch = prefs.getLong(KEY_HIGH_WATER_EPOCH, 0L)
            val now = System.currentTimeMillis()
            val elapsed = safeElapsedRealtime()
            val initialHighWater = maxOf(savedEpoch, now)
            highWaterEpoch.set(initialHighWater)
            anchorElapsed.set(elapsed)
            prefs.edit()
                .putLong(KEY_HIGH_WATER_EPOCH, initialHighWater)
                .putLong(KEY_ANCHOR_ELAPSED, elapsed)
                .apply()
            initialized = true
        }
        reInspectNow(context)
    }

    /**
     * Returns a monotonic timestamp that never moves backwards even if the OS wall clock is rolled back.
     */
    fun effectiveNowMs(context: Context? = null): Long {
        if (context != null && !initialized) init(context)
        val sysNow = System.currentTimeMillis()
        val prev = highWaterEpoch.get()
        val elapsedDelta = (safeElapsedRealtime() - anchorElapsed.get()).coerceAtLeast(0L)
        val monotonicEstimate = if (prev > 0L) prev + elapsedDelta else sysNow
        val candidate = maxOf(sysNow, monotonicEstimate)

        if (candidate > prev) {
            highWaterEpoch.compareAndSet(prev, candidate)
            if (context != null && candidate - prev > 5_000L) {
                context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putLong(KEY_HIGH_WATER_EPOCH, candidate)
                    .apply()
            }
        }
        return candidate
    }

    /**
     * Records an external trusted server or peer timestamp high-water mark.
     */
    fun observeTrustedEpoch(trustedEpochMs: Long, context: Context? = null) {
        if (trustedEpochMs <= 0L) return
        val appCtx = context?.applicationContext
        if (appCtx != null) {
            appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_LAST_SERVER_MS, trustedEpochMs)
                .apply()
        }
        while (true) {
            val prev = highWaterEpoch.get()
            if (trustedEpochMs <= prev) break
            if (highWaterEpoch.compareAndSet(prev, trustedEpochMs)) {
                val elapsed = safeElapsedRealtime()
                anchorElapsed.set(elapsed)
                appCtx?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    ?.edit()
                    ?.putLong(KEY_HIGH_WATER_EPOCH, trustedEpochMs)
                    ?.putLong(KEY_ANCHOR_ELAPSED, elapsed)
                    ?.apply()
                break
            }
        }
        reInspectNow(appCtx, verifiedServerMs = trustedEpochMs)
    }

    /**
     * Parses HTTP `Date` response header from Supabase / API calls to calibrate trusted server epoch.
     */
    fun observeTrustedServerDateHeader(dateHeader: String?, context: Context? = null): Long? {
        if (dateHeader.isNullOrBlank()) return null
        val formats = listOf(
            "EEE, dd MMM yyyy HH:mm:ss zzz",
            "EEEE, dd-MMM-yy HH:mm:ss zzz"
        )
        for (pattern in formats) {
            try {
                val sdf = SimpleDateFormat(pattern, Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("GMT")
                }
                val parsed = sdf.parse(dateHeader.trim())
                if (parsed != null && parsed.time > 1_700_000_000_000L) {
                    observeTrustedEpoch(parsed.time, context)
                    return parsed.time
                }
            } catch (_: Throwable) {}
        }
        return null
    }

    /**
     * Detects suspicious backwards clock skew (> 5 minutes earlier than monotonic high-water mark).
     */
    fun isClockRollbackDetected(): Boolean {
        val prev = highWaterEpoch.get()
        if (prev <= 0L) return false
        val skewRollback = System.currentTimeMillis() + ROLLBACK_TOLERANCE_MS < prev
        return skewRollback || _tamperStatus.value.activeTamperLock
    }

    /**
     * Actively re-inspects OS wall clock against monotonic high-water mark, uptime elapsed delta,
     * and last trusted server time. Persists incident count & logs if active tampering is detected.
     */
    @Synchronized
    fun reInspectNow(context: Context? = null, verifiedServerMs: Long? = null): ClockTamperStatus {
        val sysNow = System.currentTimeMillis()
        val prev = highWaterEpoch.get()
        val elapsedDelta = (safeElapsedRealtime() - anchorElapsed.get()).coerceAtLeast(0L)
        val expectedMonotonic = if (prev > 0L) prev + elapsedDelta else sysNow
        val prefs = context?.applicationContext?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val savedServerMs = verifiedServerMs ?: prefs?.getLong(KEY_LAST_SERVER_MS, 0L) ?: 0L
        var count = prefs?.getInt(KEY_ROLLBACK_COUNT, 0) ?: _tamperStatus.value.incidentCount
        var activeLock = prefs?.getBoolean(KEY_ACTIVE_LOCK, false) ?: _tamperStatus.value.activeTamperLock
        var reason = prefs?.getString(KEY_ROLLBACK_REASON, "").orEmpty().ifBlank { _tamperStatus.value.reason }
        val logEntries = prefs?.getString(KEY_INCIDENT_LOG, "")
            ?.split("\n")
            ?.filter { it.isNotBlank() }
            ?.toMutableList()
            ?: _tamperStatus.value.recentIncidents.toMutableList()

        val rollbackAgainstHw = prev > 0L && (sysNow + ROLLBACK_TOLERANCE_MS < expectedMonotonic)
        val rollbackAgainstServer = savedServerMs > 0L && (sysNow + ROLLBACK_TOLERANCE_MS < savedServerMs)
        val forwardJumpAgainstServer = savedServerMs > 0L && (sysNow - savedServerMs > FORWARD_JUMP_THRESHOLD_MS)

        val currentRollback = rollbackAgainstHw || rollbackAgainstServer
        val skew = when {
            rollbackAgainstServer -> savedServerMs - sysNow
            rollbackAgainstHw -> expectedMonotonic - sysNow
            forwardJumpAgainstServer -> sysNow - savedServerMs
            else -> abs(expectedMonotonic - sysNow)
        }

        if (currentRollback || forwardJumpAgainstServer) {
            val newReason = when {
                rollbackAgainstServer -> "OS time set ${(skew / 60_000L).coerceAtLeast(1)} min behind verified cloud server clock"
                rollbackAgainstHw -> "Device clock rolled back ${(skew / 60_000L).coerceAtLeast(1)} min below monotonic high-water seal"
                else -> "Suspicious forward clock jump (${skew / 86_400_000L} days ahead of trusted server time)"
            }
            if (!activeLock || reason != newReason) {
                count += 1
                val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date(maxOf(sysNow, expectedMonotonic)))
                logEntries.add(0, "$stamp • $newReason")
                while (logEntries.size > 20) logEntries.removeAt(logEntries.lastIndex)
            }
            activeLock = true
            reason = newReason
        } else if (verifiedServerMs != null && abs(sysNow - verifiedServerMs) <= ROLLBACK_TOLERANCE_MS) {
            // Device wall clock has been restored and matches verified cloud server time
            activeLock = false
            reason = ""
        }

        prefs?.edit()
            ?.putInt(KEY_ROLLBACK_COUNT, count)
            ?.putBoolean(KEY_ACTIVE_LOCK, activeLock)
            ?.putString(KEY_ROLLBACK_REASON, reason)
            ?.putString(KEY_INCIDENT_LOG, logEntries.joinToString("\n"))
            ?.apply()

        val status = ClockTamperStatus(
            rollbackDetected = currentRollback,
            activeTamperLock = activeLock,
            reason = reason,
            skewMillis = skew,
            incidentCount = count,
            lastTrustedServerMs = savedServerMs,
            lastInspectedMs = maxOf(sysNow, expectedMonotonic),
            recentIncidents = logEntries
        )
        _tamperStatus.value = status
        return status
    }

    /**
     * Allows clearing a persistent tamper lock after OS clock matches verified server time or admin override.
     */
    @Synchronized
    fun clearRollbackAfterTrustedSync(context: Context, verifiedServerMs: Long = System.currentTimeMillis()): ClockTamperStatus {
        val sysNow = System.currentTimeMillis()
        if (abs(sysNow - verifiedServerMs) > ROLLBACK_TOLERANCE_MS) {
            // Wall clock is still tampered — keep lock active
            return reInspectNow(context, verifiedServerMs)
        }
        val elapsed = safeElapsedRealtime()
        val floor = maxOf(sysNow, verifiedServerMs)
        highWaterEpoch.set(floor)
        anchorElapsed.set(elapsed)
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_HIGH_WATER_EPOCH, floor)
            .putLong(KEY_ANCHOR_ELAPSED, elapsed)
            .putLong(KEY_LAST_SERVER_MS, verifiedServerMs)
            .putBoolean(KEY_ACTIVE_LOCK, false)
            .putString(KEY_ROLLBACK_REASON, "")
            .apply()
        return reInspectNow(context, verifiedServerMs)
    }

    private fun safeElapsedRealtime(): Long {
        return try {
            SystemClock.elapsedRealtime()
        } catch (_: Throwable) {
            0L
        }
    }
}
