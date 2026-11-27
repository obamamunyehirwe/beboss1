package com.beboss.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DemandForecastMathTest {
    private val start = 1_700_000_000_000L
    private val dayMs = 86_400_000L
    private val boundaries = (0 until DemandForecastMath.HISTORY_DAYS).map { start + it * dayMs }
    private val weekdays = (0 until DemandForecastMath.HISTORY_DAYS).map { (it % 7) + 1 }
    private val now = boundaries.last() + dayMs - 1
    private val nextWeekday = (weekdays.last() % 7) + 1

    private fun records(
        branch: String = "main_branch",
        quantityForDay: (Int) -> Double
    ): Pair<List<ForecastSaleRecord>, List<ForecastSaleItemRecord>> {
        val sales = mutableListOf<ForecastSaleRecord>()
        val items = mutableListOf<ForecastSaleItemRecord>()
        for (day in 0 until DemandForecastMath.HISTORY_DAYS) {
            val quantity = quantityForDay(day)
            if (quantity <= 0.0) continue
            val saleId = "sale-$day"
            sales += ForecastSaleRecord(saleId, boundaries[day] + 12 * 60 * 60 * 1000L, branch)
            items += ForecastSaleItemRecord(saleId, "product-1", quantity, branch)
        }
        return sales to items
    }

    private fun forecast(
        records: Pair<List<ForecastSaleRecord>, List<ForecastSaleItemRecord>>,
        branch: String = "main_branch"
    ) = DemandForecastMath.forecastProduct(
        productId = "product-1",
        saleItems = records.second,
        sales = records.first,
        dayStarts = boundaries,
        weekdayNumbers = weekdays,
        nextDayWeekday = nextWeekday,
        nowMs = now,
        branchIdFilter = branch
    )

    @Test
    fun steadyDemandProducesBoundedForecastAndLeadTimeDemand() {
        val result = forecast(records { 2.0 })
        assertEquals(112.0, result.unitsSoldInHistory, 0.001)
        assertEquals(2.0, result.forecastDailyDemand, 0.05)
        assertTrue(result.leadTimeDemand > 0.0)
        assertTrue(result.safetyStock >= 0.0)
        assertEquals("HIGH", result.confidence)
        assertTrue(result.hasDemandHistory)
    }

    @Test
    fun recentGrowthIsVisibleButItsEffectIsBounded() {
        val result = forecast(records { day ->
            when {
                day < 28 -> 1.0
                day < 42 -> 2.0
                else -> 4.0
            }
        })
        assertTrue(result.hasTrendComparison)
        assertTrue(result.trendPercent > 0.0)
        assertTrue(result.forecastDailyDemand > 1.0)
        assertTrue(result.forecastDailyDemand < 5.0)
    }

    @Test
    fun branchScopePreventsCrossBranchDemandFromAffectingReorderForecast() {
        val result = forecast(records(branch = "branch-a") { 3.0 }, branch = "branch-b")
        assertFalse(result.hasDemandHistory)
        assertEquals(0.0, result.forecastDailyDemand, 0.001)
        assertEquals("LOW", result.confidence)
    }

    @Test
    fun sparseHistoryReportsLowConfidence() {
        val result = forecast(records { day -> if (day == 55) 1.0 else 0.0 })
        assertEquals(1, result.salesDays)
        assertEquals("LOW", result.confidence)
        assertTrue(result.hasDemandHistory)
    }

    @Test
    fun invalidLeadAndReviewDaysAreClamped() {
        val data = records { 2.0 }
        val result = DemandForecastMath.forecastProduct(
            productId = "product-1",
            saleItems = data.second,
            sales = data.first,
            dayStarts = boundaries,
            weekdayNumbers = weekdays,
            nextDayWeekday = nextWeekday,
            nowMs = now,
            leadTimeDays = 10_000,
            reviewPeriodDays = 0
        )
        assertEquals(2.0 * DemandForecastMath.MAX_PLANNING_DAYS, result.leadTimeDemand, 1.0)
        assertEquals(2.0, result.reviewPeriodDemand, 0.1)
    }
}
