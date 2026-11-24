package com.beboss.shopmgmt.domain

import com.beboss.shopmgmt.data.dao.SaleDao
import com.beboss.shopmgmt.data.model.AnalyticsPeriod
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.BranchPerformanceMetric
import com.beboss.shopmgmt.data.model.CategorySalesShare
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerAgingEntry
import com.beboss.shopmgmt.data.model.CustomerAgingSummary
import com.beboss.shopmgmt.data.model.DailyAnalyticsPoint
import com.beboss.shopmgmt.data.model.InventoryValuation
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.ProfitLossSummary
import com.beboss.shopmgmt.data.model.ReorderSuggestion
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.data.model.StaffPerformanceMetric
import com.beboss.shopmgmt.data.model.TopProductReport
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.ceil

/**
 * Offline analytics aggregation over Room Flows + pure enterprise BI computations.
 * Each sale or sale-item write is reflected immediately without an expiry-based cache.
 */
class AnalyticsEngine(
    private val saleDao: SaleDao
) {
    fun getProfitLossForPeriod(period: AnalyticsPeriod, branchIdFilter: String = "ALL"): Flow<ProfitLossSummary> {
        val (startTime, _) = period.getRange()
        return combine(
            saleDao.getSalesByDateRange(startTime, Long.MAX_VALUE),
            saleDao.getItemsSoldBetween(startTime, Long.MAX_VALUE)
        ) { sales, itemsCount ->
            val scopedSales = filterSalesByBranch(sales, branchIdFilter)
            val totalRev = scopedSales.sumOf { it.totalAmount }
            val totalProfit = scopedSales.sumOf { it.totalProfit }
            val totalCost = scopedSales.sumOf { it.totalCost }

            val marginPct = if (totalRev > 0) (totalProfit / totalRev) * 100.0 else 0.0
            val avgOrder = if (scopedSales.isNotEmpty()) totalRev / scopedSales.size else 0.0
            val scopedItemsCount = if (isAllBranches(branchIdFilter)) {
                itemsCount
            } else {
                // Proportional/fallback approximation when Flow<Double> is global; ViewModel can also compute exact via allSaleItems
                if (sales.isNotEmpty()) itemsCount * (scopedSales.size.toDouble() / sales.size.toDouble()) else 0.0
            }

            ProfitLossSummary(
                totalRevenue = totalRev,
                totalCost = totalCost,
                netProfit = totalProfit,
                totalSalesCount = scopedSales.size,
                totalItemsSold = scopedItemsCount,
                averageOrderValue = avgOrder,
                profitMarginPercent = marginPct,
                isProfitable = totalProfit >= 0.0,
                periodLabel = period.displayName
            )
        }
    }

    fun getDailyAnalyticsPoints(period: AnalyticsPeriod, branchIdFilter: String = "ALL"): Flow<List<DailyAnalyticsPoint>> {
        val (startTime, _) = period.getRange()
        return saleDao.getSalesByDateRange(startTime, Long.MAX_VALUE).map { sales ->
            computeDailyPoints(filterSalesByBranch(sales, branchIdFilter), period)
        }
    }

    fun getTopProducts(period: AnalyticsPeriod, limit: Int = 10): Flow<List<TopProductReport>> {
        val (startTime, _) = period.getRange()
        return saleDao.getTopProductsByProfit(startTime, Long.MAX_VALUE, limit).map { rawList ->
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
        val (startTime, _) = period.getRange()
        return saleDao.getCategorySalesBreakdown(startTime, Long.MAX_VALUE).map { rawList ->
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

    companion object {
        fun isAllBranches(branchIdFilter: String?): Boolean =
            branchIdFilter.isNullOrBlank() || branchIdFilter.equals("ALL", ignoreCase = true)

        fun matchesBranch(recordBranchId: String, branchIdFilter: String?): Boolean {
            if (isAllBranches(branchIdFilter)) return true
            val target = branchIdFilter.orEmpty()
            return recordBranchId == target || (target == "main_branch" && recordBranchId.isBlank())
        }

        fun filterSalesByBranch(sales: List<Sale>, branchIdFilter: String?): List<Sale> {
            if (isAllBranches(branchIdFilter)) return sales
            return sales.filter { matchesBranch(it.branchId, branchIdFilter) }
        }

        fun filterProductsByBranch(products: List<Product>, branchIdFilter: String?): List<Product> {
            if (isAllBranches(branchIdFilter)) return products
            return products.filter { matchesBranch(it.branchId, branchIdFilter) }
        }

        fun computeInventoryValuation(products: List<Product>): InventoryValuation {
            var totalCost = 0.0
            var totalRetail = 0.0
            var totalUnits = 0.0
            var lowStock = 0
            var outOfStock = 0
            for (p in products) {
                val q = p.quantityInStock.coerceAtLeast(0.0)
                totalCost += q * p.costPrice.coerceAtLeast(0.0)
                totalRetail += q * p.sellingPrice.coerceAtLeast(0.0)
                totalUnits += q
                if (p.isLowStock) lowStock++
                if (p.isOutOfStock) outOfStock++
            }
            return InventoryValuation(
                totalItems = products.size,
                totalUnitsInStock = totalUnits,
                totalCostValue = totalCost,
                totalRetailValue = totalRetail,
                potentialProfit = (totalRetail - totalCost).coerceAtLeast(0.0),
                lowStockCount = lowStock,
                outOfStockCount = outOfStock
            )
        }

        fun computeDailyPoints(sales: List<Sale>, period: AnalyticsPeriod, nowMs: Long = System.currentTimeMillis()): List<DailyAnalyticsPoint> {
            val (startTime, _) = period.getRange()
            val dateFormat = SimpleDateFormat("MMM dd", Locale.getDefault())
            val calendar = Calendar.getInstance()
            calendar.timeInMillis = if (startTime > 0L) startTime else (sales.minOfOrNull { it.saleDate } ?: nowMs)
            calendar.set(Calendar.HOUR_OF_DAY, 0)
            calendar.set(Calendar.MINUTE, 0)
            calendar.set(Calendar.SECOND, 0)
            calendar.set(Calendar.MILLISECOND, 0)

            val daysCount = (((nowMs - calendar.timeInMillis) / (24 * 60 * 60 * 1000L)) + 1).toInt().coerceIn(1, 31)
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
                result.add(
                    DailyAnalyticsPoint(
                        dateLabel = dateFormat.format(Date(dayStart)),
                        timestamp = dayStart,
                        revenue = daySales.sumOf { it.totalAmount },
                        profit = daySales.sumOf { it.totalProfit },
                        salesCount = daySales.size
                    )
                )
            }
            return result
        }

        fun computeBranchPerformance(
            branches: List<Branch>,
            sales: List<Sale>,
            products: List<Product>,
            period: AnalyticsPeriod
        ): List<BranchPerformanceMetric> {
            val (startTime, _) = period.getRange()
            val periodSales = sales.filter { it.saleDate >= startTime }
            return branches.filter { it.isActive }.map { branch ->
                val branchSales = periodSales.filter { matchesBranch(it.branchId, branch.id) }
                val branchProducts = products.filter { !it.isDeleted && matchesBranch(it.branchId, branch.id) }
                val rev = branchSales.sumOf { it.totalAmount }
                val cost = branchSales.sumOf { it.totalCost }
                val profit = branchSales.sumOf { it.totalProfit }
                val marginPct = if (rev > 0.0) (profit / rev) * 100.0 else 0.0
                val liveStockValue = branchProducts.sumOf { (it.costPrice * it.quantityInStock.coerceAtLeast(0.0)).toLong() }
                    .let { if (it > 0L) it else branch.stockValueRwf }
                val targetDenominator = when (period) {
                    AnalyticsPeriod.TODAY -> branch.dailySalesTargetRwf.toDouble()
                    AnalyticsPeriod.THIS_WEEK -> (branch.dailySalesTargetRwf * 7L).toDouble()
                    AnalyticsPeriod.THIS_MONTH -> branch.monthlyTargetRwf.takeIf { it > 0L }?.toDouble()
                        ?: (branch.dailySalesTargetRwf * 30L).toDouble()
                    AnalyticsPeriod.ALL_TIME -> branch.monthlyTargetRwf.toDouble()
                }
                val progress = if (targetDenominator > 0.0) (rev / targetDenominator * 100.0).coerceAtLeast(0.0) else 0.0
                BranchPerformanceMetric(
                    branchId = branch.id,
                    branchName = branch.name,
                    branchCode = branch.code,
                    operationalStatus = branch.operationalStatus,
                    revenue = rev,
                    cost = cost,
                    netProfit = profit,
                    marginPercent = marginPct,
                    salesCount = branchSales.size,
                    stockValueRwf = liveStockValue,
                    dailyTargetRwf = branch.dailySalesTargetRwf,
                    monthlyTargetRwf = branch.monthlyTargetRwf,
                    targetProgressPercent = progress
                )
            }.sortedByDescending { it.revenue }
        }

        fun computeStaffPerformance(
            sales: List<Sale>,
            period: AnalyticsPeriod,
            branchIdFilter: String = "ALL"
        ): List<StaffPerformanceMetric> {
            val (startTime, _) = period.getRange()
            val scoped = filterSalesByBranch(sales, branchIdFilter).filter { it.saleDate >= startTime }
            return scoped
                .groupBy { s ->
                    val nameKey = s.cashierName.ifBlank { "Shop Operator" }
                    (s.cashierId.ifBlank { nameKey.lowercase(Locale.ROOT) }) to nameKey
                }
                .map { (keyPair, cashierSales) ->
                    val rev = cashierSales.sumOf { it.totalAmount }
                    val profit = cashierSales.sumOf { it.totalProfit }
                    val discounts = cashierSales.sumOf { it.discountAmount }
                    val avg = if (cashierSales.isNotEmpty()) rev / cashierSales.size else 0.0
                    StaffPerformanceMetric(
                        cashierId = keyPair.first,
                        cashierName = keyPair.second,
                        salesCount = cashierSales.size,
                        revenue = rev,
                        profit = profit,
                        avgOrderValue = avg,
                        totalDiscountsGiven = discounts
                    )
                }
                .sortedByDescending { it.revenue }
        }

        fun computeCustomerAging(
            customers: List<Customer>,
            sales: List<Sale>,
            nowMs: Long = System.currentTimeMillis()
        ): CustomerAgingSummary {
            val dayMs = 24L * 60L * 60L * 1000L
            val owing = customers.filter { !it.isDeleted && it.debtBalance > 0.0 }
            var b0to30 = 0.0
            var b31to60 = 0.0
            var b61to90 = 0.0
            var b90Plus = 0.0
            var overLimitCount = 0

            val entries = owing.map { c ->
                val customerUnpaidSales = sales.filter {
                    it.customerId == c.id && it.totalAmount > it.amountPaid + 0.01
                }
                val oldestSaleMs = customerUnpaidSales.minOfOrNull { it.saleDate } ?: c.updatedAt
                val ageDays = ((nowMs - oldestSaleMs).coerceAtLeast(0L) / dayMs).toInt()
                val bucket = when {
                    ageDays <= 30 -> { b0to30 += c.debtBalance; "0-30d" }
                    ageDays <= 60 -> { b31to60 += c.debtBalance; "31-60d" }
                    ageDays <= 90 -> { b61to90 += c.debtBalance; "61-90d" }
                    else -> { b90Plus += c.debtBalance; "90+d" }
                }
                val utilization = if (c.creditLimit > 0.0) (c.debtBalance / c.creditLimit * 100.0) else 0.0
                val isOver = c.creditLimit > 0.0 && c.debtBalance > c.creditLimit
                if (isOver) overLimitCount++
                CustomerAgingEntry(
                    customerId = c.id,
                    customerName = c.name,
                    phone = c.phone,
                    debtBalance = c.debtBalance,
                    creditLimit = c.creditLimit,
                    creditUtilizationPercent = utilization,
                    isOverLimit = isOver,
                    oldestUnpaidDays = ageDays,
                    agingBucket = bucket,
                    category = c.category
                )
            }.sortedByDescending { it.debtBalance }

            return CustomerAgingSummary(
                totalReceivable = owing.sumOf { it.debtBalance },
                bucket0To30 = b0to30,
                bucket31To60 = b31to60,
                bucket61To90 = b61to90,
                bucket90Plus = b90Plus,
                overLimitCount = overLimitCount,
                entries = entries
            )
        }

        fun computeReorderSuggestions(
            products: List<Product>,
            saleItems: List<SaleItem> = emptyList(),
            branchIdFilter: String = "ALL",
            sales: List<Sale> = emptyList(),
            nowMs: Long = System.currentTimeMillis(),
            leadTimeDays: Int = DemandForecastEngine.DEFAULT_LEAD_TIME_DAYS,
            reviewPeriodDays: Int = DemandForecastEngine.DEFAULT_REVIEW_PERIOD_DAYS
        ): List<ReorderSuggestion> {
            val scopedSales = filterSalesByBranch(sales, branchIdFilter)
            val safeLeadTime = leadTimeDays.coerceIn(1, DemandForecastEngine.MAX_PLANNING_DAYS)
            val safeReviewPeriod = reviewPeriodDays.coerceIn(1, DemandForecastEngine.MAX_PLANNING_DAYS)

            return filterProductsByBranch(products, branchIdFilter)
                .asSequence()
                .filter { !it.isDeleted }
                .mapNotNull { product ->
                    val forecast = DemandForecastEngine.forecastProduct(
                        productId = product.id,
                        saleItems = saleItems,
                        sales = scopedSales,
                        branchIdFilter = branchIdFilter,
                        nowMs = nowMs,
                        leadTimeDays = safeLeadTime,
                        reviewPeriodDays = safeReviewPeriod
                    )
                    val minimumTarget = (product.lowStockThreshold.coerceAtLeast(0.0) * 2.0).coerceAtLeast(1.0)
                    val reorderPoint = if (forecast.hasDemandHistory) {
                        maxOf(forecast.leadTimeDemand + forecast.safetyStock, product.lowStockThreshold.coerceAtLeast(0.0))
                    } else {
                        product.lowStockThreshold.coerceAtLeast(0.0)
                    }
                    val targetStock = if (forecast.hasDemandHistory) {
                        maxOf(
                            forecast.leadTimeDemand + forecast.reviewPeriodDemand + forecast.safetyStock,
                            minimumTarget
                        )
                    } else {
                        minimumTarget
                    }

                    if (product.quantityInStock > maxOf(reorderPoint, product.lowStockThreshold)) {
                        return@mapNotNull null
                    }

                    // At or below the reorder threshold, always suggest at least one
                    // unit; low sales must not hide a product that has hit its stock floor.
                    val orderQty = ceil((targetStock - product.quantityInStock).coerceAtLeast(1.0))
                    val stockCoverDays = if (forecast.forecastDailyDemand > 0.0) {
                        product.quantityInStock.coerceAtLeast(0.0) / forecast.forecastDailyDemand
                    } else {
                        -1.0
                    }
                    val urgency = when {
                        product.quantityInStock <= 0.0 -> "CRITICAL"
                        forecast.forecastDailyDemand > 0.0 && stockCoverDays <= safeLeadTime -> "CRITICAL"
                        product.quantityInStock <= product.lowStockThreshold -> "LOW"
                        forecast.forecastDailyDemand > 0.0 && stockCoverDays <= safeLeadTime + safeReviewPeriod -> "LOW"
                        else -> "REORDER"
                    }

                    ReorderSuggestion(
                        productId = product.id,
                        productName = product.name,
                        category = product.category,
                        branchId = product.branchId.ifBlank { "main_branch" },
                        unit = product.unit,
                        currentStock = product.quantityInStock,
                        lowStockThreshold = product.lowStockThreshold,
                        unitsSoldInPeriod = forecast.unitsSoldInHistory,
                        suggestedOrderQty = orderQty,
                        estimatedUnitCost = product.costPrice,
                        estimatedOrderCost = orderQty * product.costPrice,
                        urgency = urgency,
                        forecastDailyDemand = forecast.forecastDailyDemand,
                        stockCoverDays = stockCoverDays,
                        reorderPoint = reorderPoint,
                        leadTimeDays = safeLeadTime,
                        demandTrendPercent = forecast.trendPercent,
                        hasTrendComparison = forecast.hasTrendComparison,
                        forecastConfidence = forecast.confidence,
                        forecastSalesDays = forecast.salesDays,
                        hasDemandHistory = forecast.hasDemandHistory
                    )
                }
                .sortedWith(
                    compareBy<ReorderSuggestion> {
                        when (it.urgency) {
                            "CRITICAL" -> 0
                            "LOW" -> 1
                            else -> 2
                        }
                    }.thenBy { if (it.stockCoverDays < 0.0) Double.MAX_VALUE else it.stockCoverDays }
                        .thenBy { it.currentStock }
                )
                .toList()
        }
    }
}

