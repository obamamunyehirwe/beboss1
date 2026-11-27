package com.beboss.shared

import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt

data class ForecastSaleRecord(
    val id: String,
    val saleDate: Long,
    val branchId: String
)

data class ForecastSaleItemRecord(
    val saleId: String,
    val productId: String,
    val quantitySold: Double,
    val branchId: String
)

data class DemandForecastResult(
    val unitsSoldInHistory: Double,
    val forecastDailyDemand: Double,
    val leadTimeDemand: Double,
    val reviewPeriodDemand: Double,
    val safetyStock: Double,
    val trendPercent: Double,
    val hasTrendComparison: Boolean,
    val confidence: String,
    val salesDays: Int,
    val hasDemandHistory: Boolean
)

/**
 * Platform-neutral demand forecast used by Android and iOS.
 *
 * The platform adapter supplies local-midnight boundaries and the matching
 * calendar weekday numbers. This keeps timezone and daylight-saving handling
 * on the device while every statistical/reorder calculation stays identical.
 */
object DemandForecastMath {
    const val HISTORY_DAYS = 56
    const val DEFAULT_LEAD_TIME_DAYS = 7
    const val DEFAULT_REVIEW_PERIOD_DAYS = 7
    const val MAX_PLANNING_DAYS = 90

    private const val HALF_LIFE_DAYS = 28.0
    private const val Z_90_PERCENT_SERVICE_LEVEL = 1.28

    fun forecastProduct(
        productId: String,
        saleItems: List<ForecastSaleItemRecord>,
        sales: List<ForecastSaleRecord>,
        dayStarts: List<Long>,
        weekdayNumbers: List<Int>,
        nextDayWeekday: Int,
        nowMs: Long,
        branchIdFilter: String = "ALL",
        leadTimeDays: Int = DEFAULT_LEAD_TIME_DAYS,
        reviewPeriodDays: Int = DEFAULT_REVIEW_PERIOD_DAYS
    ): DemandForecastResult {
        require(dayStarts.size == HISTORY_DAYS) { "Demand forecast requires 56 local day boundaries." }
        require(weekdayNumbers.size == HISTORY_DAYS) { "Demand forecast requires 56 weekday values." }
        require(dayStarts.zipWithNext().all { (left, right) -> right > left }) {
            "Local day boundaries must be strictly increasing."
        }
        require(weekdayNumbers.all { it in 1..7 } && nextDayWeekday in 1..7) {
            "Weekday values must use the 1..7 calendar range."
        }

        val safeLeadDays = leadTimeDays.coerceIn(1, MAX_PLANNING_DAYS)
        val safeReviewDays = reviewPeriodDays.coerceIn(1, MAX_PLANNING_DAYS)
        val firstDayStart = dayStarts.first()
        val dailyDemand = DoubleArray(HISTORY_DAYS)

        val eligibleSales = sales.asSequence()
            .filter { it.saleDate in firstDayStart..nowMs }
            .filter { matchesBranch(it.branchId, branchIdFilter) }
            .associateBy { it.id }

        saleItems.asSequence()
            .filter { it.productId == productId && it.quantitySold > 0.0 && it.quantitySold.isFinite() }
            .forEach { item ->
                val sale = eligibleSales[item.saleId] ?: return@forEach
                val effectiveBranch = item.branchId.ifBlank { sale.branchId }
                if (!matchesBranch(effectiveBranch, branchIdFilter)) return@forEach

                // Binary search honours the supplied local calendar boundaries,
                // including 23-hour and 25-hour daylight-saving days.
                var low = 0
                var high = dayStarts.lastIndex
                var dayIndex = -1
                while (low <= high) {
                    val mid = (low + high) ushr 1
                    if (dayStarts[mid] <= sale.saleDate) {
                        dayIndex = mid
                        low = mid + 1
                    } else {
                        high = mid - 1
                    }
                }
                if (dayIndex in dailyDemand.indices) dailyDemand[dayIndex] += item.quantitySold
            }

        val totalUnits = dailyDemand.sum()
        val salesDays = dailyDemand.count { it > 0.0 }
        if (totalUnits <= 0.0) return emptyForecast()

        var weightedUnits = 0.0
        var totalWeight = 0.0
        dailyDemand.forEachIndexed { index, quantity ->
            val ageDays = (HISTORY_DAYS - 1 - index).toDouble()
            val weight = exp(-ln(2.0) * ageDays / HALF_LIFE_DAYS)
            weightedUnits += quantity * weight
            totalWeight += weight
        }
        val weightedDailyAverage = weightedUnits / totalWeight

        val recent14 = dailyDemand.takeLast(14).sum() / 14.0
        val previous14 = dailyDemand.slice(28 until 42).sum() / 14.0
        val hasTrendComparison = previous14 > 0.0
        val trendPercent = if (hasTrendComparison) {
            ((recent14 - previous14) / previous14 * 100.0).coerceIn(-100.0, 300.0)
        } else {
            0.0
        }
        // A short sales spike is visible to managers without dominating the baseline.
        val trendRatio = if (hasTrendComparison) {
            (recent14 / previous14).coerceIn(0.70, 1.40)
        } else {
            1.0
        }
        val trendFactor = 0.85 + (0.15 * trendRatio)
        val forecastDaily = (weightedDailyAverage * 0.70 + recent14 * 0.30) * trendFactor

        val dailyMean = totalUnits / HISTORY_DAYS
        val variance = dailyDemand.fold(0.0) { accumulated, quantity ->
            val delta = quantity - dailyMean
            accumulated + delta * delta
        } / HISTORY_DAYS
        val dailyStdDev = sqrt(variance)

        val weekdayTotals = DoubleArray(8)
        val weekdayCounts = IntArray(8)
        dailyDemand.forEachIndexed { index, quantity ->
            val weekday = weekdayNumbers[index]
            weekdayTotals[weekday] += quantity
            weekdayCounts[weekday]++
        }

        fun weekdayFactor(weekday: Int): Double {
            val baseline = dailyMean
            if (baseline <= 0.0 || weekdayCounts[weekday] < 4) return 1.0
            val observedMean = weekdayTotals[weekday] / weekdayCounts[weekday]
            val shrunkMean = observedMean * 0.65 + baseline * 0.35
            return (shrunkMean / baseline).coerceIn(0.60, 1.50)
        }

        fun forecastForDays(days: Int): Double {
            var expected = 0.0
            repeat(days) { offset ->
                val weekday = ((nextDayWeekday - 1 + offset) % 7) + 1
                expected += forecastDaily * weekdayFactor(weekday)
            }
            return expected
        }

        val confidence = when {
            salesDays >= 21 -> "HIGH"
            salesDays >= 8 -> "MEDIUM"
            else -> "LOW"
        }

        return DemandForecastResult(
            unitsSoldInHistory = totalUnits,
            forecastDailyDemand = forecastDaily,
            leadTimeDemand = forecastForDays(safeLeadDays),
            reviewPeriodDemand = forecastForDays(safeReviewDays),
            safetyStock = Z_90_PERCENT_SERVICE_LEVEL * dailyStdDev * sqrt(safeLeadDays.toDouble()),
            trendPercent = trendPercent,
            hasTrendComparison = hasTrendComparison,
            confidence = confidence,
            salesDays = salesDays,
            hasDemandHistory = true
        )
    }

    private fun emptyForecast() = DemandForecastResult(
        unitsSoldInHistory = 0.0,
        forecastDailyDemand = 0.0,
        leadTimeDemand = 0.0,
        reviewPeriodDemand = 0.0,
        safetyStock = 0.0,
        trendPercent = 0.0,
        hasTrendComparison = false,
        confidence = "LOW",
        salesDays = 0,
        hasDemandHistory = false
    )

    private fun matchesBranch(recordBranchId: String, branchIdFilter: String?): Boolean {
        if (branchIdFilter.isNullOrBlank() || branchIdFilter.equals("ALL", ignoreCase = true)) return true
        return recordBranchId == branchIdFilter ||
            (branchIdFilter == "main_branch" && recordBranchId.isBlank())
    }
}
