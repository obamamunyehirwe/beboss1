package com.beboss.shopmgmt

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.data.repository.BeBossRepository
import com.beboss.shopmgmt.util.BeBossLogger
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.ShopDataTransferManager
import com.beboss.shopmgmt.util.ShopImportSummary
import com.beboss.shopmgmt.util.SupabaseAdminClient
import com.beboss.shopmgmt.util.SupabaseBranchSnapshotDto
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SyncResilienceTest {

    @Test
    fun `BBSHARE1 token replay protection accepts first use and blocks replay`() {
        val profile = ShopProfile(id = 1L, name = "Owner", shopName = "BeBoss Kigali", phone = "+250788111222")
        val json = ShopDataTransferManager.createExportJson(
            profile = profile,
            users = emptyList(),
            products = emptyList(),
            customers = emptyList(),
            sales = emptyList(),
            saleItems = emptyList(),
            payments = emptyList(),
            exportedByUser = null
        )
        val token = ShopDataTransferManager.createCompressedSyncToken(json)

        val firstParse = ShopDataTransferManager.parseShopPackageString(token, enforceReplayProtection = true)
        assertEquals("BeBoss Kigali", firstParse.shopName)
        assertTrue(firstParse.packetNonce.isNotBlank())

        try {
            ShopDataTransferManager.parseShopPackageString(token, enforceReplayProtection = true)
            fail("Expected replayed BBSHARE1 packet to throw IllegalArgumentException")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message?.contains("replayed", ignoreCase = true) == true)
        }

        @Test
        fun `latest complete snapshot generation includes each peer and excludes stale or partial chunks`() {
            fun snapshot(device: String, generation: String, index: Int, count: Int, updatedAt: Long) =
                SupabaseBranchSnapshotDto(
                    id = "$device-$generation-$index",
                    shopSyncKey = "shop_123456789",
                    deviceId = if (index == 0) device else "$device#c$index",
                    syncGeneration = generation,
                    chunkIndex = index,
                    chunkCount = count,
                    branchId = "main",
                    branchName = "Main",
                    shopName = "Test Shop",
                    ownerUsername = "owner",
                    payloadToken = "token",
                    recordsSummary = "$count chunk(s)",
                    updatedAt = updatedAt
                )

            val selected = SupabaseAdminClient.latestCompleteSnapshotChunks(
                listOf(
                    snapshot("device-a", "old", 0, 2, 10),
                    snapshot("device-a", "old", 1, 2, 11),
                    snapshot("device-a", "new", 0, 1, 20),
                    snapshot("device-b", "peer", 0, 2, 30),
                    snapshot("device-b", "peer", 1, 2, 31),
                    snapshot("device-c", "partial", 0, 2, 40)
                )
            )

            assertEquals(listOf("device-a", "device-b", "device-b#c1"), selected.map { it.deviceId })
            assertEquals(listOf("new", "peer", "peer"), selected.map { it.syncGeneration })
        }
    }

    @Test
    fun `BeBossLogger scrubs secrets, PINs, passwords, and tokens from logs`() {
        val raw = "Auth failed for pin=4829 password='SuperSecret2026' apikey=sb_live_abc123 " +
            "Bearer eyJhbGciOi.test.sig token=BB2-ALPHA-9999 pbkdf2:120000:deadbeef:cafebabe BBSHARE1:ABCD:payload123"
        val clean = BeBossLogger.scrub(raw)

        assertFalse(clean.contains("4829"))
        assertFalse(clean.contains("SuperSecret2026"))
        assertFalse(clean.contains("sb_live_abc123"))
        assertFalse(clean.contains("eyJhbGciOi"))
        assertFalse(clean.contains("BB2-ALPHA-9999"))
        assertFalse(clean.contains("deadbeef"))
        assertFalse(clean.contains("payload123"))
        assertTrue(clean.contains("[REDACTED]"))
    }

    @Test
    fun `ClockGuard detects rolled-back wall clock and preserves monotonic high-water timestamp`() {
        val futureServerMs = System.currentTimeMillis() + 3_600_000L // +1 hour ahead of local clock
        ClockGuard.observeTrustedEpoch(futureServerMs)

        assertTrue(ClockGuard.isClockRollbackDetected())
        assertTrue(ClockGuard.effectiveNowMs() >= futureServerMs)
    }

    @Test
    fun `merge conflicts emit SYNC_CONFLICT audit log and dead-letter flow updates reactively`() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        try {
            val repo = BeBossRepository(db)
            val now = System.currentTimeMillis()
            db.productDao().insertProduct(
                Product(id = "p_conf", name = "Sugar 1kg", sellingPrice = 1500.0, updatedAt = now - 5000L)
            )
            val summary = ShopImportSummary(
                shopName = "BeBoss Test",
                exportedAt = now,
                exportedBy = "PeerBranch",
                userCount = 0,
                productCount = 1,
                customerCount = 0,
                saleCount = 0,
                paymentCount = 0,
                users = emptyList(),
                products = listOf(
                    Product(id = "p_conf", name = "Sugar Updated", sellingPrice = 1650.0, updatedAt = now + 5000L)
                ),
                customers = emptyList(),
                sales = emptyList(),
                saleItems = emptyList(),
                payments = emptyList(),
                shopProfile = null
            )

            val mergeRes = repo.mergeShopDataPackageLww(summary)
            assertEquals(1, mergeRes.conflictsResolved)

            val audits = db.localAuditLogDao().getRecentLogsDirect(10)
            assertTrue(audits.any { it.action == "SYNC_CONFLICT" })

            // Verify dead-letter reactive flow
            assertEquals(0, repo.deadLetterSyncCount.first())
            db.syncQueueDao().enqueue(
                SyncQueueItem(
                    id = "sq_dlq_1",
                    tableName = "sales",
                    recordId = "s_1",
                    operation = "UPSERT",
                    payloadJson = "{}",
                    status = "DEAD_LETTER"
                )
            )
            assertEquals(1, repo.deadLetterSyncCount.first())
        } finally {
            db.close()
        }
    }
}
