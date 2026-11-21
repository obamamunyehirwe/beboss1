package com.beboss.shopmgmt.data.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.beboss.shopmgmt.data.model.DeadLetterItem
import kotlinx.coroutines.flow.Flow

@Dao
interface DeadLetterDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: DeadLetterItem)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<DeadLetterItem>)

    @Delete
    suspend fun delete(item: DeadLetterItem)

    @Query("DELETE FROM dead_letter_queue WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT * FROM dead_letter_queue ORDER BY createdAt DESC")
    fun getAllItems(): Flow<List<DeadLetterItem>>

    @Query("SELECT * FROM dead_letter_queue ORDER BY createdAt DESC")
    suspend fun getAllItemsList(): List<DeadLetterItem>

    @Query("SELECT * FROM dead_letter_queue WHERE originalItemId = :itemId LIMIT 1")
    suspend fun getByOriginalItemId(itemId: String): DeadLetterItem?

    @Query("SELECT COUNT(*) FROM dead_letter_queue")
    suspend fun getCount(): Int

    @Query("DELETE FROM dead_letter_queue WHERE createdAt < :cutoffTime")
    suspend fun cleanupOldItems(cutoffTime: Long)
}
