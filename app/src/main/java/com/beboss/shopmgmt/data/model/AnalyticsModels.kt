package com.beboss.shopmgmt.data.model

import java.util.Calendar

enum class AnalyticsPeriod(val displayName: String) {
    TODAY("Today"),
    THIS_WEEK("This Week"),
    THIS_MONTH("This Month"),
    ALL_TIME("All Time");

    fun getRange(): Pair<Long, Long> {
        val cal = Calendar.getInstance()
        val now = cal.timeInMillis

        return when (this) {
            TODAY -> {
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                Pair(cal.timeInMillis, now)
            }
            THIS_WEEK -> {
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                cal.set(Calendar.DAY_OF_WEEK, cal.firstDayOfWeek)
                Pair(cal.timeInMillis, now)
            }
            THIS_MONTH -> {
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                cal.set(Calendar.DAY_OF_MONTH, 1)
                Pair(cal.timeInMillis, now)
            }
            ALL_TIME -> {
                Pair(0L, now)
            }
        }
    }
}

data class DailyAnalyticsPoint(
    val dateLabel: String,
    val timestamp: Long,
    val revenue: Double,
    val profit: Double,
    val salesCount: Int
)

data class TopProductReport(
    val productId: String,
    val productName: String,
    val totalQuantitySold: Double,
    val totalRevenue: Double,
    val totalProfit: Double
)

data class InventoryValuation(
    val totalItems: Int,
    val totalUnitsInStock: Double,
    val totalCostValue: Double,
    val totalRetailValue: Double,
    val potentialProfit: Double,
    val lowStockCount: Int,
    val outOfStockCount: Int
)

data class ProfitLossSummary(
    val totalRevenue: Double,
    val totalCost: Double,
    val netProfit: Double,
    val totalSalesCount: Int,
    val totalItemsSold: Double,
    val averageOrderValue: Double,
    val profitMarginPercent: Double,
    val isProfitable: Boolean,
    val periodLabel: String
) {
    /** Backwards-compatible name used by the dashboard KPI card. */
    val averageSaleValue: Double
        get() = averageOrderValue
}

data class CategorySalesShare(
    val category: String,
    val revenue: Double,
    val percentage: Double
)

data class BranchPerformanceMetric(
    val branchId: String,
    val branchName: String,
    val branchCode: String,
    val operationalStatus: String,
    val revenue: Double,
    val cost: Double,
    val netProfit: Double,
    val marginPercent: Double,
    val salesCount: Int,
    val stockValueRwf: Long,
    val dailyTargetRwf: Long,
    val monthlyTargetRwf: Long,
    val targetProgressPercent: Double
)

data class StaffPerformanceMetric(
    val cashierId: String,
    val cashierName: String,
    val salesCount: Int,
    val revenue: Double,
    val profit: Double,
    val avgOrderValue: Double,
    val totalDiscountsGiven: Double
)

data class CustomerAgingEntry(
    val customerId: String,
    val customerName: String,
    val phone: String,
    val debtBalance: Double,
    val creditLimit: Double,
    val creditUtilizationPercent: Double,
    val isOverLimit: Boolean,
    val oldestUnpaidDays: Int,
    val agingBucket: String, // "0-30d", "31-60d", "61-90d", "90+d"
    val category: String = ""
) {
    // UI/export aliases retained while all calculations use the canonical fields above.
    val daysOld: Int
        get() = oldestUnpaidDays
    val overCreditLimit: Boolean
        get() = isOverLimit
    val bucketLabel: String
        get() = agingBucket
}

data class CustomerAgingSummary(
    val totalReceivable: Double = 0.0,
    val bucket0To30: Double = 0.0,
    val bucket31To60: Double = 0.0,
    val bucket61To90: Double = 0.0,
    val bucket90Plus: Double = 0.0,
    val overLimitCount: Int = 0,
    val entries: List<CustomerAgingEntry> = emptyList()
)

data class ReorderSuggestion(
    val productId: String,
    val productName: String,
    val category: String,
    val branchId: String,
    val unit: String,
    val currentStock: Double,
    val lowStockThreshold: Double,
    val unitsSoldInPeriod: Double,
    val suggestedOrderQty: Double,
    val estimatedUnitCost: Double,
    val estimatedOrderCost: Double,
    val urgency: String, // "CRITICAL" | "LOW" | "REORDER"
    val forecastDailyDemand: Double = 0.0,
    val stockCoverDays: Double = -1.0,
    val reorderPoint: Double = 0.0,
    val leadTimeDays: Int = 7,
    val demandTrendPercent: Double = 0.0,
    val hasTrendComparison: Boolean = false,
    val forecastConfidence: String = "LOW",
    val forecastSalesDays: Int = 0,
    val hasDemandHistory: Boolean = false
)

