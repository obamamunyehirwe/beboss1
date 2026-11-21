package com.example.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(
    tableName = "stock_transfers",
    indices = [
        Index(value = ["productId"]),
        Index(value = ["fromBranchId"]),
        Index(value = ["toBranchId"]),
        Index(value = ["status"]),
        Index(value = ["transferDate"])
    ]
)
data class StockTransfer(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val transferNumber: String = "TRF-${System.currentTimeMillis() % 100000}",
    val productId: String,
    val productName: String,
    val fromBranchId: String,
    val fromBranchName: String,
    val toBranchId: String,
    val toBranchName: String,
    val quantity: Double,
    val unit: String = "pcs",
    // Cost value of transferred stock (quantity * costPrice at time of transfer)
    val costValueRwf: Long = 0L,
    val transferDate: Long = System.currentTimeMillis(),
    // PENDING | IN_TRANSIT | COMPLETED | CANCELLED
    val status: String = "COMPLETED",
    val notes: String = "",
    val transferredBy: String = "Store Operator",
    // Receiving confirmation
    val receivedBy: String = "",
    val receivedAt: Long = 0L,
    val synced: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
)
