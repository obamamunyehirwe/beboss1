package com.beboss.shopmgmt.util

import com.beboss.shared.HlcMath
import java.util.concurrent.atomic.AtomicLong

/**
 * Thread-safe Android HLC adapter.
 *
 * The causal ordering rules live in shared Kotlin code so Android and iOS
 * resolve concurrent/offline record versions with the same deterministic rules.
 */
object HlcClock {
    private val lastHlc = AtomicLong(HlcMath.pack(ClockGuard.effectiveNowMs(), 0))

    fun pack(physicalMs: Long, logical: Int): Long = HlcMath.pack(physicalMs, logical)

    fun physicalOf(hlc: Long): Long = HlcMath.physicalOf(hlc)

    fun logicalOf(hlc: Long): Int = HlcMath.logicalOf(hlc)

    fun current(): Long = lastHlc.get()

    /** Isolates tests from the wall-clock timestamp used when this singleton initializes. */
    internal fun resetForTests(initialHlc: Long = 0L) {
        lastHlc.set(initialHlc)
    }

    fun tick(nowMs: Long = ClockGuard.effectiveNowMs()): Long =
        advance { previous -> HlcMath.tick(previous, nowMs) }

    fun observe(remoteHlc: Long, nowMs: Long = ClockGuard.effectiveNowMs()): Long {
        if (remoteHlc <= 0L) return tick(nowMs)
        return advance { previous -> HlcMath.observe(previous, remoteHlc, nowMs) }
    }

    fun compareVersions(
        localHlc: Long,
        localVersion: Long,
        localUpdatedAt: Long,
        localDeviceId: String,
        remoteHlc: Long,
        remoteVersion: Long,
        remoteUpdatedAt: Long,
        remoteDeviceId: String
    ): Int = HlcMath.compareVersions(
        localHlc = localHlc,
        localVersion = localVersion,
        localUpdatedAt = localUpdatedAt,
        localDeviceId = localDeviceId,
        remoteHlc = remoteHlc,
        remoteVersion = remoteVersion,
        remoteUpdatedAt = remoteUpdatedAt,
        remoteDeviceId = remoteDeviceId
    )

    private inline fun advance(crossinline calculate: (Long) -> Long): Long {
        while (true) {
            val previous = lastHlc.get()
            val next = calculate(previous)
            if (lastHlc.compareAndSet(previous, next)) return next
        }
    }
}
