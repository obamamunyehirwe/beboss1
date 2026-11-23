package com.beboss.shopmgmt

import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.domain.AnalyticsEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class InventoryDemandForecastTest {
    private val nowMs = Calendar.getInstance().apply {
        clear()
        set(2025, Calendar.MAY, 25, 18, 0, 0)
    }.timeInMillis

    private fun records(
        productId: String,
        branchId: String = "main_branch",
        quantityForDay: (Int) -> Double
    ): Pair<List<Sale>, List<SaleItem>> {
        val sales = mutableListOf<Sale>()
        val items = mutableListOf<SaleItem>()
        val firstDay = Calendar.getInstance().apply {
            timeInMillis = nowMs
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            add(Calendar.DAY_OF_YEAR, -55)
        }
        for (day in 0 until 56) {
            val quantity = quantityForDay(day)
            if (quantity <= 0.0) continue
            val saleAtNoon = (firstDay.clone() as Calendar).apply {
                add(Calendar.DAY_OF_YEAR, day)
                set(Calendar.HOUR_OF_DAY, 12)
            }.timeInMillis
            val saleId = "sale-$day"
            sales += Sale(
                id = saleId,
                saleDate = saleAtNoon,
                branchId = branchId
            )
            items += SaleItem(
                id = "line-$day",
                saleId = saleId,
                productId = productId,
                productName = "Forecast product",
                quantitySold = quantity,
                branchId = branchId
            )
        }
        return sales to items
    }

    private fun product(stock: Double, threshold: Double = 5.0, branchId: String = "main_branch") =
        Product(
            id = "product-1",
            name = "Forecast product",
            quantityInStock = stock,
            lowStockThreshold = threshold,
            branchId = branchId
        )

    @Test
    fun `steady demand produces a bounded daily forecast and a reorder quantity`() {
        val (sales, items) = records("product-1") { 2.0 }
        val suggestions = AnalyticsEngine.computeReorderSuggestions(
            products = listOf(product(stock = 10.0)),
            saleItems = items,
            branchIdFilter = "main_branch",
            sales = sales,
            nowMs = nowMs
        )
        val suggestion = suggestions.single()
        assertEquals(2.0, suggestion.forecastDailyDemand, 0.05)
        assertEquals(112.0, suggestion.unitsSoldInPeriod, 0.001)
        assertTrue(suggestion.suggestedOrderQty > 0.0)
        assertTrue(suggestion.reorderPoint > suggestion.lowStockThreshold)
        assertEquals("HIGH", suggestion.forecastConfidence)
        assertTrue(suggestion.hasDemandHistory)
    }

    @Test
    fun `recent growth is surfaced but capped in the forecast`() {
        val (sales, items) = records("product-1") { day ->
            when {
                day < 28 -> 1.0
                day < 42 -> 2.0
                else -> 4.0
            }
        }
        val suggestions = AnalyticsEngine.computeReorderSuggestions(
            products = listOf(product(stock = 5.0)),
            saleItems = items,
            branchIdFilter = "main_branch",
            sales = sales,
            nowMs = nowMs
        )
        val suggestion = suggestions.single()
        assertTrue(suggestion.hasTrendComparison)
        assertTrue(suggestion.demandTrendPercent > 0.0)
        assertTrue(suggestion.forecastDailyDemand > 1.0)
        assertTrue(suggestion.forecastDailyDemand < 5.0)
    }

    @Test
    fun `branch filter excludes other branch demand`() {
        val (sales, items) = records("product-1", branchId = "branch-a") { 3.0 }
        val suggestions = AnalyticsEngine.computeReorderSuggestions(
            products = listOf(product(stock = 0.0, threshold = 4.0, branchId = "branch-b")),
            saleItems = items,
            branchIdFilter = "branch-b",
            sales = sales,
            nowMs = nowMs
        )
        val suggestion = suggestions.single()
        assertFalse(suggestion.hasDemandHistory)
        assertEquals(0.0, suggestion.forecastDailyDemand, 0.001)
        assertEquals("LOW", suggestion.forecastConfidence)
        assertEquals(8.0, suggestion.suggestedOrderQty, 0.001)
    }

    @Test
    fun `low stock with no recent sales keeps a threshold-based safety fallback`() {
        val suggestions = AnalyticsEngine.computeReorderSuggestions(
            products = listOf(product(stock = 0.0, threshold = 3.0)),
            saleItems = emptyList(),
            sales = emptyList(),
            nowMs = nowMs
        )
        val suggestion = suggestions.single()
        assertFalse(suggestion.hasDemandHistory)
        assertEquals(-1.0, suggestion.stockCoverDays, 0.001)
        assertEquals(6.0, suggestion.suggestedOrderQty, 0.001)
        assertEquals("LOW", suggestion.forecastConfidence)
    }
}
