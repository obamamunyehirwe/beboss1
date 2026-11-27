package com.beboss.shopmgmt.data.model

import androidx.room.ColumnInfo
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
    val createdAt: Long = System.currentTimeMillis(),
    /** Last mutation time in epoch milliseconds; separate from the packed HLC. */
    @ColumnInfo(defaultValue = "0") val updatedAt: Long = createdAt,
    /** Packed HLC: epoch milliseconds in upper bits and a logical counter in the lower 16 bits. */
    @ColumnInfo(defaultValue = "0") val hlcTimestamp: Long = 0L,
    /** Stable writer identity used for deterministic conflict resolution. */
    @ColumnInfo(defaultValue = "''") val lastModifiedDeviceId: String = "",
    /** Owner approval proof stays in the encrypted local database until cloud verification. */
    @ColumnInfo(defaultValue = "''") val approvalReason: String = "",
    @ColumnInfo(defaultValue = "''") val approvalActorUserId: String = "",
    @ColumnInfo(defaultValue = "0") val approvalSignedAt: Long = 0L,
    @ColumnInfo(defaultValue = "0") val approvalPolicyVersion: Long = 0L,
    @ColumnInfo(defaultValue = "''") val approvalDeviceId: String = "",
    @ColumnInfo(defaultValue = "''") val approvalSignature: String = ""
)
