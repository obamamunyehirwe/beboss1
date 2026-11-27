package com.beboss.shopmgmt.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(
    tableName = "branches",
    indices = [Index(value = ["isActive"]), Index(value = ["isMainBranch"])]
)
data class Branch(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val name: String = "Main Branch",
    val code: String = "BR-01",
    // STORE locations serve retail/POS operations; WAREHOUSE locations hold stock.
    val locationType: String = "STORE",
    val address: String = "Kigali, Rwanda",
    val phone: String = "+250 788 000 000",
    val managerUserId: String = "",
    val managerName: String = "",
    val isMainBranch: Boolean = false,
    val isActive: Boolean = true,
    val colorHex: String = "#FF6B1A",
    // Per-branch operational targets
    val dailySalesTargetRwf: Long = 0L,
    val monthlyTargetRwf: Long = 0L,
    // Opening float for this branch's cash drawer
    val openingCashFloat: Long = 0L,
    // Branch-level stock value snapshot (updated on each sync)
    val stockValueRwf: Long = 0L,
    val productCount: Int = 0,
    // Operational status: OPEN | PAUSED | CLOSED (legacy SUSPENDED is normalized on import)
    val operationalStatus: String = "OPEN",
    // Email for branch-level reports
    val email: String = "",
    // Notes / description
    val notes: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val syncVersion: Long = 1L,
    val hlcTimestamp: Long = 0L,
    val lastModifiedDeviceId: String = ""
) {
    val isOpen: Boolean get() = operationalStatus == "OPEN" && isActive
}
