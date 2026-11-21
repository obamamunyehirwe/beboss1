package com.example.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(
    tableName = "dead_letter_queue",
    indices = [
        Index(value = ["originalItemId"]),
        Index(value = ["createdAt"])
    ]
)
data class DeadLetterItem(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val originalItemId: String,
    val tableName: String,
    val operation: String,
    val payloadJson: String,
    val failureReason: String,
    val failureCount: Int = 1,
    val createdAt: Long = System.currentTimeMillis()
)
