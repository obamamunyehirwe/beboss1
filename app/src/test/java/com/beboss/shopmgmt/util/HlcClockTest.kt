package com.beboss.shopmgmt.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class HlcClockTest {
    @Before
    fun resetClockForDeterministicTimeTests() {
        HlcClock.resetForTests()
    }

    private data class VersionCase(
        val localHlc: Long,
        val localVersion: Long,
        val localUpdatedAt: Long,
        val localDeviceId: String,
        val remoteHlc: Long,
        val remoteVersion: Long,
        val remoteUpdatedAt: Long,
        val remoteDeviceId: String
    )


    @Test
    fun `pack and unpack round-trip physical and logical components`() {
        val physical = 1_700_000_000_000L
        val hlc = HlcClock.pack(physical, 42)
        assertEquals(physical, HlcClock.physicalOf(hlc))
        assertEquals(42, HlcClock.logicalOf(hlc))
    }

    @Test
    fun `logical counter is masked to sixteen bits`() {
        val hlc = HlcClock.pack(1_000L, 0x1FFFF)
        assertEquals(0xFFFF, HlcClock.logicalOf(hlc))
    }

    @Test
    fun `tick advances the logical counter when physical time is unchanged`() {
        val t0 = HlcClock.tick(5_000L)
        val t1 = HlcClock.tick(5_000L)
        val t2 = HlcClock.tick(5_000L)
        assertEquals(0, HlcClock.logicalOf(t0))
        assertEquals(1, HlcClock.logicalOf(t1))
        assertEquals(2, HlcClock.logicalOf(t2))
        assertTrue(t2 > t1 && t1 > t0)
    }

    @Test
    fun `tick resets the logical counter when physical time moves forward`() {
        HlcClock.tick(5_000L)
        HlcClock.tick(5_000L)
        val t = HlcClock.tick(6_000L)
        assertEquals(6_000L, HlcClock.physicalOf(t))
        assertEquals(0, HlcClock.logicalOf(t))
    }

    @Test
    fun `observe moves the clock strictly past a remote timestamp`() {
        val remote = HlcClock.pack(9_000L, 7)
        val observed = HlcClock.observe(remote, nowMs = 1_000L)
        assertTrue(observed > remote)
        assertTrue(HlcClock.physicalOf(observed) >= 9_000L)
    }

    @Test
    fun `compareVersions is antisymmetric for mixed legacy and modern records`() {
        val cases = listOf(
            VersionCase(0L, 1L, 1_000L, "A", 0L, 2L, 2_000L, "B"),
            VersionCase(500L, 0L, 500L, "A", 0L, 1L, 900L, "B"),
            VersionCase(500L, 3L, 500L, "A", 700L, 3L, 700L, "B"),
            VersionCase(0L, 0L, 0L, "SAME", 0L, 0L, 0L, "SAME")
        )
        for (case in cases) {
            val forward = HlcClock.compareVersions(
                case.localHlc, case.localVersion, case.localUpdatedAt, case.localDeviceId,
                case.remoteHlc, case.remoteVersion, case.remoteUpdatedAt, case.remoteDeviceId
            )
            val reverse = HlcClock.compareVersions(
                case.remoteHlc, case.remoteVersion, case.remoteUpdatedAt, case.remoteDeviceId,
                case.localHlc, case.localVersion, case.localUpdatedAt, case.localDeviceId
            )
            assertEquals("not antisymmetric for $case", Integer.signum(forward), -Integer.signum(reverse))
        }
    }

    @Test
    fun `higher HLC wins when both records carry real clocks`() {
        val newer = HlcClock.compareVersions(
            localHlc = 100L, localVersion = 1, localUpdatedAt = 100L, localDeviceId = "A",
            remoteHlc = 200L, remoteVersion = 1, remoteUpdatedAt = 200L, remoteDeviceId = "B"
        )
        assertTrue("remote with higher HLC must win", newer > 0)
    }

    @Test
    fun `legacy HLC zero records fall back to wall-clock update time`() {
        val result = HlcClock.compareVersions(
            localHlc = 0L, localVersion = 1, localUpdatedAt = 1_000L, localDeviceId = "A",
            remoteHlc = 0L, remoteVersion = 1, remoteUpdatedAt = 2_000L, remoteDeviceId = "B"
        )
        assertTrue(result > 0)
    }

    @Test
    fun `device id breaks ties deterministically`() {
        val ab = HlcClock.compareVersions(0L, 0, 0L, "A", 0L, 0, 0L, "B")
        val ba = HlcClock.compareVersions(0L, 0, 0L, "B", 0L, 0, 0L, "A")
        assertEquals(Integer.signum(ab), -Integer.signum(ba))
        assertTrue(ab != 0)
    }
}