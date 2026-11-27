package com.beboss.shared

import kotlin.math.max

/**
 * Platform-independent 64-bit Hybrid Logical Clock rules used by every BeBoss
 * terminal to order offline and concurrent writes deterministically.
 *
 * Upper 48 bits: physical epoch milliseconds.
 * Lower 16 bits: logical counter.
 */
object HlcMath {
    fun pack(physicalMs: Long, logical: Int): Long {
        val maskedLogical = (logical and 0xFFFF).toLong()
        return (physicalMs shl 16) or maskedLogical
    }

    fun physicalOf(hlc: Long): Long = hlc ushr 16

    fun logicalOf(hlc: Long): Int = (hlc and 0xFFFFL).toInt()

    fun tick(previousHlc: Long, nowMs: Long): Long {
        val previousPhysical = physicalOf(previousHlc)
        val previousLogical = logicalOf(previousHlc)
        return if (nowMs > previousPhysical) {
            pack(nowMs, 0)
        } else {
            pack(previousPhysical, (previousLogical + 1).coerceAtMost(0xFFFF))
        }
    }

    fun observe(previousHlc: Long, remoteHlc: Long, nowMs: Long): Long {
        if (remoteHlc <= 0L) return tick(previousHlc, nowMs)

        val previousPhysical = physicalOf(previousHlc)
        val remotePhysical = physicalOf(remoteHlc)
        val maxPhysical = max(nowMs, max(previousPhysical, remotePhysical))
        val nextLogical = when {
            maxPhysical == previousPhysical && maxPhysical == remotePhysical ->
                (max(logicalOf(previousHlc), logicalOf(remoteHlc)) + 1).coerceAtMost(0xFFFF)
            maxPhysical == previousPhysical ->
                (logicalOf(previousHlc) + 1).coerceAtMost(0xFFFF)
            maxPhysical == remotePhysical ->
                (logicalOf(remoteHlc) + 1).coerceAtMost(0xFFFF)
            else -> 0
        }
        return pack(maxPhysical, nextLogical)
    }

    /**
     * Returns > 0 when remote wins, < 0 when local wins, and 0 when identical.
     * A real HLC wins first; legacy/tied entries fall back to timestamp, version,
     * then stable device ID so every platform converges to the same record.
     */
    fun compareVersions(
        localHlc: Long,
        localVersion: Long,
        localUpdatedAt: Long,
        localDeviceId: String,
        remoteHlc: Long,
        remoteVersion: Long,
        remoteUpdatedAt: Long,
        remoteDeviceId: String
    ): Int {
        if (localHlc > 0L && remoteHlc > 0L && localHlc != remoteHlc) {
            return remoteHlc.compareTo(localHlc)
        }
        if (remoteUpdatedAt != localUpdatedAt) {
            return remoteUpdatedAt.compareTo(localUpdatedAt)
        }
        if (remoteVersion != localVersion) {
            return remoteVersion.compareTo(localVersion)
        }
        return remoteDeviceId.compareTo(localDeviceId)
    }
}
