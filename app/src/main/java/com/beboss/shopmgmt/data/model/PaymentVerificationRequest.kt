package com.beboss.shopmgmt.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "payment_verification_requests")
data class PaymentVerificationRequest(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val shopName: String = "",
    val ownerUsername: String = "",
    val ownerPhone: String = "",
    val deviceChallenge: String = "",
    val provider: String = "MTN MoMo",
    val ussdCode: String = "",
    val payerPhone: String = "",
    val payerFullName: String = "",
    val amountRwf: Int = 5000,
    val durationMonths: Int = 1,
    val branchCount: Int = 1,
    val workerCount: Int = 1,
    val deviceCount: Int = 1,
    // Legacy Room column retained solely so existing encrypted databases migrate safely.
    // New proof screens and Supabase requests must never collect or send this field.
    @Deprecated("Legacy local database compatibility only; do not collect or sync.")
    val telcoReference: String = "",
    @ColumnInfo(defaultValue = "0") val paymentTimeMs: Long = System.currentTimeMillis(),
    @ColumnInfo(defaultValue = "''") val paymentNote: String = "",
    @ColumnInfo(defaultValue = "2000") val feePerDeviceRwf: Int = 2000,
    val status: String = "PENDING_VERIFICATION", // PENDING_VERIFICATION, APPROVED, REJECTED, REDEEMED
    val approvalMode: String = "", // UNLOCK_CODE, DIRECT_AUTO_UNLOCK, ""
    val generatedUnlockCode: String = "",
    val syncedToSupabase: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
