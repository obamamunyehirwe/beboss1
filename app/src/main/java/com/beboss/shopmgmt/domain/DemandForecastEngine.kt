package com.beboss.shopmgmt.domain

import com.beboss.shared.DemandForecastMath
import com.beboss.shared.ForecastSaleItemRecord
import com.beboss.shared.ForecastSaleRecord
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import java.util.Calendar

/**
 * Android calendar/data adapter for the shared Kotlin demand forecast.
 *
 * Calendar remains platform-local so the shared engine receives the same
 * timezone-aware day boundaries and weekdays the previous Android algorithm used.
 */
object DemandForecastEngine {
    const val HISTORY_DAYS = DemandForecastMath.HISTORY_DAYS
    const val DEFAULT_LEAD_TIME_DAYS = DemandForecastMath.DEFAULT_LEAD_TIME_DAYS
    const val DEFAULT_REVIEW_PERIOD_DAYS = DemandForecastMath.DEFAULT_REVIEW_PERIOD_DAYS
    const val MAX_PLANNING_DAYS = DemandForecastMath.MAX_PLANNING_DAYS

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
        val today = Calendar.getInstance().apply {
            timeInMillis = nowMs
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val dayStarts = LongArray(HISTORY_DAYS) { index ->
            (today.clone() as Calendar).apply {
                add(Calendar.DAY_OF_YEAR, index - (HISTORY_DAYS - 1))
            }.timeInMillis
        }
        val weekdayNumbers = LongArray(HISTORY_DAYS) { index ->
            (today.clone() as Calendar).apply {
                add(Calendar.DAY_OF_YEAR, index - (HISTORY_DAYS - 1))
            }.get(Calendar.DAY_OF_WEEK).toLong()
        }.map(Long::toInt)
        val nextDayWeekday = (today.clone() as Calendar).apply {
            add(Calendar.DAY_OF_YEAR, 1)
        }.get(Calendar.DAY_OF_WEEK)

        val result = DemandForecastMath.forecastProduct(
            productId = productId,
            saleItems = saleItems.map { item ->
                ForecastSaleItemRecord(
                    saleId = item.saleId,
                    productId = item.productId,
                    quantitySold = item.quantitySold,
                    branchId = item.branchId
                )
            },
            sales = sales.map { sale ->
                ForecastSaleRecord(
                    id = sale.id,
                    saleDate = sale.saleDate,
                    branchId = sale.branchId
                )
            },
            dayStarts = dayStarts.toList(),
            weekdayNumbers = weekdayNumbers,
            nextDayWeekday = nextDayWeekday,
            nowMs = nowMs,
            branchIdFilter = branchIdFilter,
            leadTimeDays = leadTimeDays,
            reviewPeriodDays = reviewPeriodDays
        )

        return ProductForecast(
            unitsSoldInHistory = result.unitsSoldInHistory,
            forecastDailyDemand = result.forecastDailyDemand,
            leadTimeDemand = result.leadTimeDemand,
            reviewPeriodDemand = result.reviewPeriodDemand,
            safetyStock = result.safetyStock,
            trendPercent = result.trendPercent,
            hasTrendComparison = result.hasTrendComparison,
            confidence = result.confidence,
            salesDays = result.salesDays,
            hasDemandHistory = result.hasDemandHistory
        )
    }
}
