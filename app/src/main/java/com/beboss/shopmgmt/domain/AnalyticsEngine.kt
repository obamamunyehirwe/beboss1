package com.beboss.shopmgmt.domain

import com.beboss.shopmgmt.data.dao.SaleDao
import com.beboss.shopmgmt.data.model.AnalyticsPeriod
import com.beboss.shopmgmt.data.model.CategorySalesShare
import com.beboss.shopmgmt.data.model.DailyAnalyticsPoint
import com.beboss.shopmgmt.data.model.ProfitLossSummary
import com.beboss.shopmgmt.data.model.TopProductReport
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * High-performance offline analytics aggregation engine.
 * Includes 5-minute in-memory cache to avoid redundant DB queries.
 */
class AnalyticsEngine(
    private val saleDao: SaleDao
) {
    private val analyticsCache = ConcurrentHashMap<String, Pair<Long, ProfitLossSummary>>()
    private val CACHE_TTL_MS = 300_000L // 5 minutes
    fun getProfitLossForPeriod(period: AnalyticsPeriod): Flow<ProfitLossSummary> {
        val (startTime, endTime) = period.getRange()
        return saleDao.getSalesByDateRange(startTime, endTime).map { sales ->
            val cacheKey = period.name
            val cached = analyticsCache[cacheKey]
            if (cached != null && System.currentTimeMillis() - cached.first < CACHE_TTL_MS) {
                return@map cached.second
            }

            var totalRev = 0.0
            var totalProfit = 0.0
            var totalCost = 0.0
            var itemsCount = 0.0

            for (s in sales) {
                totalRev += s.totalAmount
                totalProfit += s.totalProfit
                totalCost += s.totalCost
            }

            val marginPct = if (totalRev > 0) (totalProfit / totalRev) * 100.0 else 0.0
            val avgOrder = if (sales.isNotEmpty()) totalRev / sales.size else 0.0

            val result = ProfitLossSummary(
                totalRevenue = totalRev,
                totalCost = totalCost,
                netProfit = totalProfit,
                totalSalesCount = sales.size,
                totalItemsSold = itemsCount,
                averageOrderValue = avgOrder,
                profitMarginPercent = marginPct,
                isProfitable = totalProfit >= 0.0,
                periodLabel = period.displayName
            )
            analyticsCache[cacheKey] = System.currentTimeMillis() to result
            result
        }
    }

    fun getDailyAnalyticsPoints(period: AnalyticsPeriod): Flow<List<DailyAnalyticsPoint>> {
        val (startTime, endTime) = period.getRange()
        return saleDao.getSalesByDateRange(startTime, endTime).map { sales ->
            val dateFormat = SimpleDateFormat("MMM dd", Locale.getDefault())
            val calendar = Calendar.getInstance()
            calendar.timeInMillis = startTime
            calendar.set(Calendar.HOUR_OF_DAY, 0)
            calendar.set(Calendar.MINUTE, 0)
            calendar.set(Calendar.SECOND, 0)
            calendar.set(Calendar.MILLISECOND, 0)

            val daysCount = (((endTime - calendar.timeInMillis) / (24 * 60 * 60 * 1000L)) + 1).toInt().coerceIn(1, 31)
            val result = mutableListOf<DailyAnalyticsPoint>()

            for (i in 0 until daysCount) {
                val dayCal = Calendar.getInstance().apply {
                    timeInMillis = calendar.timeInMillis
                    add(Calendar.DAY_OF_YEAR, i)
                }
                val dayStart = dayCal.timeInMillis
                dayCal.add(Calendar.DAY_OF_YEAR, 1)
                val dayEnd = dayCal.timeInMillis - 1

                val daySales = sales.filter { it.saleDate in dayStart..dayEnd }
                val rev = daySales.sumOf { it.totalAmount }
                val profit = daySales.sumOf { it.totalProfit }

                result.add(
                    DailyAnalyticsPoint(
                        dateLabel = dateFormat.format(Date(dayStart)),
                        timestamp = dayStart,
                        revenue = rev,
                        profit = profit,
                        salesCount = daySales.size
                    )
                )
            }
            result
        }
    }

    fun getTopProducts(period: AnalyticsPeriod, limit: Int = 10): Flow<List<TopProductReport>> {
        val (startTime, endTime) = period.getRange()
        return saleDao.getTopProductsByProfit(startTime, endTime, limit).map { rawList ->
            rawList.map {
                TopProductReport(
                    productId = it.productId,
                    productName = it.productName,
                    totalQuantitySold = it.totalQuantity,
                    totalRevenue = it.totalRevenue,
                    totalProfit = it.totalProfit
                )
            }
        }
    }

    fun getCategorySalesBreakdown(period: AnalyticsPeriod): Flow<List<CategorySalesShare>> {
        val (startTime, endTime) = period.getRange()
        return saleDao.getCategorySalesBreakdown(startTime, endTime).map { rawList ->
            val totalAllCategories = rawList.sumOf { it.totalRevenue }
            rawList.map {
                CategorySalesShare(
                    category = it.category,
                    revenue = it.totalRevenue,
                    percentage = if (totalAllCategories > 0) (it.totalRevenue / totalAllCategories) * 100.0 else 0.0
                )
            }
        }
    }
}
