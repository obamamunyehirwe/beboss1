package com.beboss.shopmgmt.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(
    tableName = "local_audit_logs",
    indices = [
        Index(value = ["createdAt"]),
        Index(value = ["action"]),
        Index(value = ["syncedToCloud", "createdAt"])
    ]
)
data class LocalAuditLog(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val actorName: String,
    val actorRole: String,
    val action: String, // "AUTH_LOCKED", "ADMIN_APPROVE", "DATASHARE_MERGE", "VOUCHER_REDEEM", "DB_INTEGRITY", etc.
    val targetId: String = "",
    val details: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    /** True only after the authenticated device audit endpoint acknowledges this exact event. */
    val syncedToCloud: Boolean = false
)
