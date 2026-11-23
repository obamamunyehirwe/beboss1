package com.beboss.shopmgmt.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.beboss.shopmgmt.data.model.StockTransfer
import kotlinx.coroutines.flow.Flow

@Dao
interface StockTransferDao {

    @Query("SELECT * FROM stock_transfers ORDER BY transferDate DESC")
    fun getAllTransfers(): Flow<List<StockTransfer>>

    @Query("SELECT * FROM stock_transfers ORDER BY transferDate DESC")
    suspend fun getAllTransfersList(): List<StockTransfer>

    @Query("SELECT * FROM stock_transfers WHERE fromBranchId = :branchId OR toBranchId = :branchId ORDER BY transferDate DESC")
    fun getTransfersByBranch(branchId: String): Flow<List<StockTransfer>>

    @Query("SELECT * FROM stock_transfers WHERE fromBranchId = :branchId OR toBranchId = :branchId ORDER BY transferDate DESC")
    suspend fun getTransfersByBranchList(branchId: String): List<StockTransfer>

    @Query("SELECT * FROM stock_transfers WHERE productId = :productId ORDER BY transferDate DESC")
    suspend fun getTransfersByProduct(productId: String): List<StockTransfer>

    @Query("SELECT * FROM stock_transfers WHERE status = :status ORDER BY transferDate DESC")
    fun getTransfersByStatus(status: String): Flow<List<StockTransfer>>

    @Query("SELECT * FROM stock_transfers WHERE id = :id LIMIT 1")
    suspend fun getTransferById(id: String): StockTransfer?

    @Query("SELECT COUNT(*) FROM stock_transfers WHERE (fromBranchId = :branchId OR toBranchId = :branchId) AND transferDate >= :sinceMs")
    suspend fun getTransferCountForBranchSince(branchId: String, sinceMs: Long): Int

    @Query("SELECT SUM(costValueRwf) FROM stock_transfers WHERE toBranchId = :branchId AND transferDate >= :sinceMs")
    suspend fun getTotalInboundValueSince(branchId: String, sinceMs: Long): Long?

    @Query("SELECT SUM(costValueRwf) FROM stock_transfers WHERE fromBranchId = :branchId AND transferDate >= :sinceMs")
    suspend fun getTotalOutboundValueSince(branchId: String, sinceMs: Long): Long?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransfer(transfer: StockTransfer)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransfers(transfers: List<StockTransfer>)

    @Update
    suspend fun updateTransfer(transfer: StockTransfer)

    @Query("""
        UPDATE stock_transfers
        SET status = :status, receivedBy = :receivedBy, receivedAt = :receivedAt
        WHERE id = :id AND status IN ('IN_TRANSIT', 'PENDING')
    """)
    suspend fun confirmReceived(id: String, receivedBy: String, receivedAt: Long, status: String = "COMPLETED"): Int

    @Query("""
        UPDATE stock_transfers
        SET status = 'CANCELLED', receivedBy = :actorName, receivedAt = :receivedAt, notes = :notes
        WHERE id = :id AND status IN ('IN_TRANSIT', 'PENDING')
    """)
    suspend fun cancelPendingTransfer(id: String, actorName: String, receivedAt: Long, notes: String): Int

    @Query("DELETE FROM stock_transfers WHERE id = :id")
    suspend fun deleteTransfer(id: String)

    @Query("DELETE FROM stock_transfers")
    suspend fun clearAllTransfers()

    @Query("SELECT COUNT(*) FROM stock_transfers")
    suspend fun getTransferCount(): Int
}
