package com.beboss.shopmgmt

import com.beboss.shopmgmt.util.SupabaseAdminClient
import com.beboss.shopmgmt.util.SupabaseBranchSnapshotDto
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SnapshotGenerationIntegrityTest {

    private fun chunk(
        deviceId: String,
        generation: String,
        index: Int,
        count: Int,
        updatedAt: Long
    ) = SupabaseBranchSnapshotDto(
        id = "${deviceId}-${generation}-${index}",
        shopSyncKey = "shop_test",
        deviceId = deviceId,
        syncGeneration = generation,
        chunkIndex = index,
        chunkCount = count,
        branchId = "main_branch",
        branchName = "Main Store",
        shopName = "Test Shop",
        ownerUsername = "owner",
        payloadToken = "signed-token",
        recordsSummary = "$count chunk(s)",
        updatedAt = updatedAt
    )

    @Test
    fun `empty peer set is a valid initial synchronization state`() {
        assertFalse(
            SupabaseAdminClient.hasIncompleteLatestSnapshotGeneration(
                snapshots = emptyList(),
                completeSnapshots = emptyList()
            )
        )
    }

    @Test
    fun `a fully uploaded multi chunk generation is complete`() {
        val rows = listOf(
            chunk("ANDROID-1", "generation-2", 0, 2, 200),
            chunk("ANDROID-1#c1", "generation-2", 1, 2, 201)
        )
        val complete = SupabaseAdminClient.latestCompleteSnapshotChunks(rows)

        assertFalse(SupabaseAdminClient.hasIncompleteLatestSnapshotGeneration(rows, complete))
        assertTrue(complete.size == 2)
    }

    @Test
    fun `a newer partial generation is not mistaken for a successful pull`() {
        val rows = listOf(
            chunk("ANDROID-1", "generation-1", 0, 1, 100),
            chunk("ANDROID-1", "generation-2", 0, 2, 200)
        )
        val complete = SupabaseAdminClient.latestCompleteSnapshotChunks(rows)

        assertTrue(SupabaseAdminClient.hasIncompleteLatestSnapshotGeneration(rows, complete))
        assertTrue(complete.size == 1)
        assertTrue(complete.first().syncGeneration == "generation-1")
    }

    @Test
    fun `a peer's first partial generation is detected`() {
        val rows = listOf(chunk("ANDROID-2", "generation-1", 0, 3, 100))
        val complete = SupabaseAdminClient.latestCompleteSnapshotChunks(rows)

        assertTrue(SupabaseAdminClient.hasIncompleteLatestSnapshotGeneration(rows, complete))
        assertTrue(complete.isEmpty())
    }

    @Test
    fun `a complete newer generation supersedes the previous generation`() {
        val rows = listOf(
            chunk("ANDROID-1", "generation-1", 0, 1, 100),
            chunk("ANDROID-1", "generation-2", 0, 2, 200),
            chunk("ANDROID-1#c1", "generation-2", 1, 2, 201)
        )
        val complete = SupabaseAdminClient.latestCompleteSnapshotChunks(rows)

        assertFalse(SupabaseAdminClient.hasIncompleteLatestSnapshotGeneration(rows, complete))
        assertTrue(complete.all { it.syncGeneration == "generation-2" })
    }
    @Test
    fun `different snapshot generations never overwrite the same cloud row IDs`() {
        val previous = SupabaseAdminClient.snapshotGenerationRowId(
            shopSyncKey = "shop_test",
            deviceId = "ANDROID-1",
            syncGeneration = "generation-1",
            chunkIndex = 0
        )
        val current = SupabaseAdminClient.snapshotGenerationRowId(
            shopSyncKey = "shop_test",
            deviceId = "ANDROID-1",
            syncGeneration = "generation-2",
            chunkIndex = 0
        )

        assertNotEquals(previous, current)
    }

    @Test
    fun `each chunk within a generation has its own immutable cloud row ID`() {
        val first = SupabaseAdminClient.snapshotGenerationRowId(
            shopSyncKey = "shop_test",
            deviceId = "ANDROID-1",
            syncGeneration = "generation-3",
            chunkIndex = 0
        )
        val second = SupabaseAdminClient.snapshotGenerationRowId(
            shopSyncKey = "shop_test",
            deviceId = "ANDROID-1#c1",
            syncGeneration = "generation-3",
            chunkIndex = 1
        )

        assertNotEquals(first, second)
    }

}
