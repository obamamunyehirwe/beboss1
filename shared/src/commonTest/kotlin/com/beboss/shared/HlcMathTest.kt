package com.beboss.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HlcMathTest {
    @Test
    fun packsAndUnpacksPhysicalAndLogicalParts() {
        val packed = HlcMath.pack(1_800_000_000_000L, 27)
        assertEquals(1_800_000_000_000L, HlcMath.physicalOf(packed))
        assertEquals(27, HlcMath.logicalOf(packed))
    }

    @Test
    fun localTickUsesWallClockOrAdvancesLogicalCounter() {
        val previous = HlcMath.pack(1_000L, 7)
        assertEquals(HlcMath.pack(1_001L, 0), HlcMath.tick(previous, 1_001L))
        assertEquals(HlcMath.pack(1_000L, 8), HlcMath.tick(previous, 1_000L))
        assertEquals(HlcMath.pack(1_000L, 8), HlcMath.tick(previous, 900L))
    }

    @Test
    fun observeMergesRemoteAndLocalClocks() {
        val previous = HlcMath.pack(1_000L, 3)
        val remote = HlcMath.pack(1_000L, 8)
        assertEquals(HlcMath.pack(1_000L, 9), HlcMath.observe(previous, remote, 900L))
        assertEquals(HlcMath.pack(1_001L, 0), HlcMath.observe(previous, remote, 1_001L))
        assertEquals(HlcMath.pack(1_000L, 4), HlcMath.observe(previous, HlcMath.pack(800L, 2), 900L))
    }

    @Test
    fun compareVersionsIsDeterministicForConcurrentAndLegacyRows() {
        assertTrue(HlcMath.compareVersions(100L, 9L, 50L, "a", 101L, 1L, 1L, "b") > 0)
        assertTrue(HlcMath.compareVersions(0L, 1L, 50L, "a", 0L, 1L, 50L, "b") > 0)
        assertTrue(HlcMath.compareVersions(0L, 2L, 50L, "b", 0L, 1L, 50L, "a") < 0)
        assertEquals(0, HlcMath.compareVersions(0L, 1L, 50L, "same", 0L, 1L, 50L, "same"))
    }
}
