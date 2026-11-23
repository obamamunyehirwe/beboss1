package com.beboss.shopmgmt.domain

import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import java.util.Calendar
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt

/**
 * Deterministic, offline-first demand forecasting from actual sale headers and line items.
 *
 * This is a transparent statistical forecast, not a trained ML model. It uses a
 * recency-weighted daily demand baseline, a bounded recent-trend adjustment,
 * weekday seasonality when enough observations exist, and a service-level safety
 * stock calculation. It deliberately reports low confidence for sparse history.
 */
object DemandForecastEngine {
    const val HISTORY_DAYS = 56
    const val DEFAULT_LEAD_TIME_DAYS = 7
    const val DEFAULT_REVIEW_PERIOD_DAYS = 7
    const val MAX_PLANNING_DAYS = 90

    private const val DAY_MS = 86_400_000L
    private const val HALF_LIFE_DAYS = 28.0
    private const val Z_90_PERCENT_SERVICE_LEVEL = 1.28

    data class ProductForecast(
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

    fun forecastProduct(
        productId: String,
        saleItems: List<SaleItem>,
        sales: List<Sale>,
        branchIdFilter: String = "ALL",
        nowMs: Long = System.currentTimeMillis(),
        leadTimeDays: Int = DEFAULT_LEAD_TIME_DAYS,
        reviewPeriodDays: Int = DEFAULT_REVIEW_PERIOD_DAYS
    ): ProductForecast {
        val safeLeadDays = leadTimeDays.coerceIn(1, MAX_PLANNING_DAYS)
        val safeReviewDays = reviewPeriodDays.coerceIn(1, MAX_PLANNING_DAYS)
        val currentDayStart = Math.floorDiv(nowMs, DAY_MS) * DAY_MS
        val firstDayStart = currentDayStart - ((HISTORY_DAYS - 1L) * DAY_MS)
        val dailyDemand = DoubleArray(HISTORY_DAYS)

        val eligibleSales = sales.asSequence()
            .filter { it.saleDate in firstDayStart..nowMs }
            .filter { matchesBranch(it.branchId, branchIdFilter) }
            .associateBy { it.id }

        saleItems.asSequence()
            .filter { it.productId == productId && it.quantitySold > 0.0 }
            .forEach { item ->
                val sale = eligibleSales[item.saleId] ?: return@forEach
                val effectiveBranch = item.branchId.ifBlank { sale.branchId }
                if (!matchesBranch(effectiveBranch, branchIdFilter)) return@forEach

                val dayIndex = ((sale.saleDate - firstDayStart) / DAY_MS).toInt()
                if (dayIndex in dailyDemand.indices) {
                    dailyDemand[dayIndex] += item.quantitySold
                }
            }

        val totalUnits = dailyDemand.sum()
        val salesDays = dailyDemand.count { it > 0.0 }
        if (totalUnits <= 0.0) {
            return ProductForecast(
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
        }

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
        // Recent activity contributes, but a short spike cannot dominate the baseline.
        val trendRatio = if (hasTrendComparison) {
            (recent14 / previous14).coerceIn(0.70, 1.40)
        } else {
            1.0
        }
        val trendFactor = 0.85 + (0.15 * trendRatio)
        val forecastDaily = (weightedDailyAverage * 0.70 + recent14 * 0.30) * trendFactor

        val dailyMean = totalUnits / HISTORY_DAYS
        val variance = dailyDemand.sumOf { quantity ->
            val delta = quantity - dailyMean
            delta * delta
        } / HISTORY_DAYS
        val dailyStdDev = sqrt(variance)

        val calendar = Calendar.getInstance()
        val weekdayTotals = DoubleArray(8)
        val weekdayCounts = IntArray(8)
        dailyDemand.forEachIndexed { index, quantity ->
            calendar.timeInMillis = firstDayStart + index * DAY_MS
            val weekday = calendar.get(Calendar.DAY_OF_WEEK)
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

        val nextDay = currentDayStart + DAY_MS
        fun forecastForDays(days: Int): Double {
            var expected = 0.0
            for (offset in 0 until days) {
                calendar.timeInMillis = nextDay + offset * DAY_MS
                expected += forecastDaily * weekdayFactor(calendar.get(Calendar.DAY_OF_WEEK))
            }
            return expected
        }

        val leadDemand = forecastForDays(safeLeadDays)
        val reviewDemand = forecastForDays(safeReviewDays)
        val safetyStock = Z_90_PERCENT_SERVICE_LEVEL * dailyStdDev * sqrt(safeLeadDays.toDouble())
        val confidence = when {
            salesDays >= 21 -> "HIGH"
            salesDays >= 8 -> "MEDIUM"
            else -> "LOW"
        }

        return ProductForecast(
            unitsSoldInHistory = totalUnits,
            forecastDailyDemand = forecastDaily,
            leadTimeDemand = leadDemand,
            reviewPeriodDemand = reviewDemand,
            safetyStock = safetyStock,
            trendPercent = trendPercent,
            hasTrendComparison = hasTrendComparison,
            confidence = confidence,
            salesDays = salesDays,
            hasDemandHistory = true
        )
    }

    private fun matchesBranch(recordBranchId: String, branchIdFilter: String?): Boolean {
        if (branchIdFilter.isNullOrBlank() || branchIdFilter.equals("ALL", ignoreCase = true)) return true
        val target = branchIdFilter
        return recordBranchId == target || (target == "main_branch" && recordBranchId.isBlank())
    }
}
