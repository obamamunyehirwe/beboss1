package com.beboss.shopmgmt.ui.screens

import android.content.Context
import android.widget.Toast
import com.beboss.shopmgmt.util.safeMessage
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.beboss.shopmgmt.data.model.AnalyticsPeriod
import com.beboss.shopmgmt.data.model.BranchPerformanceMetric
import com.beboss.shopmgmt.data.model.CategorySalesShare
import com.beboss.shopmgmt.data.model.CustomerAgingSummary
import com.beboss.shopmgmt.data.model.DailyAnalyticsPoint
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.ProfitLossSummary
import com.beboss.shopmgmt.data.model.ReorderSuggestion
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.StaffPerformanceMetric
import com.beboss.shopmgmt.data.model.TopProductReport
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.ui.components.AnalyticsChart
import com.beboss.shopmgmt.ui.screens.analytics.BranchComparisonSection
import com.beboss.shopmgmt.ui.screens.analytics.CustomerAgingSection
import com.beboss.shopmgmt.ui.screens.analytics.SmartReorderSection
import com.beboss.shopmgmt.ui.screens.analytics.StaffLeaderboardSection
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.ui.theme.WarningAmber
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.PdfReportGenerator
import com.beboss.shopmgmt.util.ReceiptGenerator
import java.text.NumberFormat
import kotlin.math.ceil

@Composable
fun AnalyticsScreen(
    selectedPeriod: AnalyticsPeriod,
    summary: ProfitLossSummary,
    chartPoints: List<DailyAnalyticsPoint>,
    topProducts: List<TopProductReport>,
    categoryShares: List<CategorySalesShare>,
    products: List<Product> = emptyList(),
    shopProfile: ShopProfile,
    currentUser: User? = null,
    branchPerformanceMetrics: List<BranchPerformanceMetric> = emptyList(),
    staffPerformanceMetrics: List<StaffPerformanceMetric> = emptyList(),
    customerAgingSummary: CustomerAgingSummary = CustomerAgingSummary(),
    reorderSuggestions: List<ReorderSuggestion> = emptyList(),
    language: AppLanguage = AppLanguage.ENGLISH,
    onPeriodSelected: (AnalyticsPeriod) -> Unit,
    onCreatePurchaseOrder: (ReorderSuggestion) -> Unit = {},
    onExportCustomerAgingCsv: () -> Unit = {}
) {
    val canViewProfit = currentUser?.canViewCostAndProfit ?: true
    val canExport = currentUser?.canExportReports ?: true
    val canManageInv = currentUser?.canManageInventory ?: true
    val context = LocalContext.current
    val periods = listOf(
        AnalyticsPeriod.TODAY,
        AnalyticsPeriod.THIS_WEEK,
        AnalyticsPeriod.THIS_MONTH,
        AnalyticsPeriod.ALL_TIME
    )

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        val isWideScreen = maxWidth >= 680.dp

        if (isWideScreen) {
            // Adaptive Multi-Column Layout for Tablets, Foldables & Landscape Screens
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Left Column: Controls, Hero P&L, Branch & Staff BI, Demand Forecast & Actions
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    PeriodSelectorTabs(periods, selectedPeriod, language, onPeriodSelected)
                    HeroProfitLossCard(summary, shopProfile, language, canViewProfit)
                    if (branchPerformanceMetrics.isNotEmpty()) {
                        BranchComparisonSection(branchPerformanceMetrics, shopProfile.currencySymbol, canViewProfit)
                    }
                    if (staffPerformanceMetrics.isNotEmpty()) {
                        StaffLeaderboardSection(staffPerformanceMetrics, shopProfile.currencySymbol, canViewProfit)
                    }
                    DemandForecastCard(selectedPeriod, topProducts, products, shopProfile, language)
                    if (canExport) {
                        ReportExportActionsCard(context, selectedPeriod, summary, topProducts, categoryShares, shopProfile, language)
                    }
                }

                // Right Column: Charts, Leaderboards, AR Aging & Smart Reorder
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    AnalyticsChart(points = chartPoints, currencySymbol = shopProfile.currencySymbol, language = language)
                    TopSellingProductsCard(topProducts, shopProfile, language, canViewProfit)
                    if (categoryShares.isNotEmpty()) {
                        CategorySalesShareCard(categoryShares, shopProfile, language)
                    }
                    CustomerAgingSection(customerAgingSummary, shopProfile.currencySymbol, canExport, onExportCustomerAgingCsv)
                    SmartReorderSection(reorderSuggestions, shopProfile.currencySymbol, canManageInv, onCreatePurchaseOrder)
                }
            }
        } else {
            // Standard Single Column Layout for Phones
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                item { PeriodSelectorTabs(periods, selectedPeriod, language, onPeriodSelected) }
                item { HeroProfitLossCard(summary, shopProfile, language, canViewProfit) }
                item { AnalyticsChart(points = chartPoints, currencySymbol = shopProfile.currencySymbol, language = language) }
                if (branchPerformanceMetrics.isNotEmpty()) {
                    item { BranchComparisonSection(branchPerformanceMetrics, shopProfile.currencySymbol, canViewProfit) }
                }
                if (staffPerformanceMetrics.isNotEmpty()) {
                    item { StaffLeaderboardSection(staffPerformanceMetrics, shopProfile.currencySymbol, canViewProfit) }
                }
                item { TopSellingProductsCard(topProducts, shopProfile, language, canViewProfit) }
                if (categoryShares.isNotEmpty()) {
                    item { CategorySalesShareCard(categoryShares, shopProfile, language) }
                }
                item { CustomerAgingSection(customerAgingSummary, shopProfile.currencySymbol, canExport, onExportCustomerAgingCsv) }
                item { SmartReorderSection(reorderSuggestions, shopProfile.currencySymbol, canManageInv, onCreatePurchaseOrder) }
                item { DemandForecastCard(selectedPeriod, topProducts, products, shopProfile, language) }
                if (canExport) {
                    item { ReportExportActionsCard(context, selectedPeriod, summary, topProducts, categoryShares, shopProfile, language) }
                }
                item { Spacer(modifier = Modifier.height(20.dp)) }
            }
        }
    }
}

@Composable
private fun PeriodSelectorTabs(
    periods: List<AnalyticsPeriod>,
    selectedPeriod: AnalyticsPeriod,
    language: AppLanguage,
    onPeriodSelected: (AnalyticsPeriod) -> Unit
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 1.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(4.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            periods.forEach { period ->
                val isSelected = selectedPeriod == period
                Surface(
                    onClick = { onPeriodSelected(period) },
                    modifier = Modifier
                        .weight(1f)
                        .height(42.dp),
                    shape = RoundedCornerShape(10.dp),
                    color = if (isSelected) OrangePrimary else Color.Transparent
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        val periodLabel = when (period) {
                            AnalyticsPeriod.TODAY -> Localization.get("period_today", language)
                            AnalyticsPeriod.THIS_WEEK -> Localization.get("period_this_week", language)
                            AnalyticsPeriod.THIS_MONTH -> Localization.get("period_this_month", language)
                            AnalyticsPeriod.ALL_TIME -> Localization.get("period_all_time", language)
                        }
                        Text(
                            text = periodLabel,
                            fontSize = 11.5.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HeroProfitLossCard(
    summary: ProfitLossSummary,
    shopProfile: ShopProfile,
    language: AppLanguage,
    canViewProfit: Boolean = true
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(3.dp)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (canViewProfit) Localization.get("gross_profit", language).uppercase() else Localization.get("gross_revenue", language).uppercase(),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    letterSpacing = 1.sp
                )
                if (canViewProfit) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (summary.isProfitable) ProfitGreen.copy(alpha = 0.14f) else LossRed.copy(alpha = 0.14f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = if (summary.isProfitable) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                                contentDescription = null,
                                tint = if (summary.isProfitable) ProfitGreen else LossRed,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = Localization.format("ana_margin_fmt", language, summary.profitMarginPercent.toInt()),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (summary.isProfitable) ProfitGreen else LossRed
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = if (canViewProfit) {
                    (if (summary.netProfit >= 0) "+" else "") + ReceiptGenerator.formatMoney(summary.netProfit, shopProfile)
                } else {
                    ReceiptGenerator.formatMoney(summary.totalRevenue, shopProfile)
                },
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                color = if (!canViewProfit) OrangePrimary else if (summary.isProfitable) ProfitGreen else LossRed
            )

            Spacer(modifier = Modifier.height(16.dp))

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    MetricTile(
                        label = Localization.get("gross_revenue", language),
                        value = ReceiptGenerator.formatMoney(summary.totalRevenue, shopProfile),
                        color = OrangePrimary,
                        modifier = Modifier.weight(1f)
                    )
                    MetricTile(
                        label = Localization.get("cost_of_goods", language),
                        value = if (canViewProfit) ReceiptGenerator.formatMoney(summary.totalCost, shopProfile) else "Restricted",
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f)
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    MetricTile(
                        label = Localization.get("today_orders", language),
                        value = "${summary.totalSalesCount}",
                        color = Color(0xFF3B82F6),
                        modifier = Modifier.weight(1f)
                    )
                    MetricTile(
                        label = Localization.get("items_sold", language),
                        value = NumberFormat.getNumberInstance().format(summary.totalItemsSold),
                        color = ProfitGreen,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun TopSellingProductsCard(
    topProducts: List<TopProductReport>,
    shopProfile: ShopProfile,
    language: AppLanguage,
    canViewProfit: Boolean = true
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.EmojiEvents, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = Localization.get("top_selling_products", language),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (topProducts.isEmpty()) {
                Text(Localization.get("ana_no_sales_period", language), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                topProducts.take(5).forEachIndexed { index, item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = if (index == 0) OrangePrimary else MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.size(26.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = "${index + 1}",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (index == 0) Color.White else MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(item.productName, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                                Text(
                                    Localization.format(
                                        "ana_product_perf_fmt",
                                        language,
                                        item.totalQuantitySold.toInt(),
                                        ReceiptGenerator.formatMoney(item.totalRevenue, shopProfile)
                                    ),
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        if (canViewProfit) {
                            Text(
                                text = "+${ReceiptGenerator.formatMoney(item.totalProfit, shopProfile)}",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = ProfitGreen
                            )
                        }
                    }
                    if (index < topProducts.take(5).size - 1) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                    }
                }
            }
        }
    }
}

@Composable
private fun CategorySalesShareCard(
    categoryShares: List<CategorySalesShare>,
    shopProfile: ShopProfile,
    language: AppLanguage
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Category, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = Localization.get("category_sales_share", language),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            categoryShares.forEach { cat ->
                Column(modifier = Modifier.padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(cat.category, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                        Text(
                            "${ReceiptGenerator.formatMoney(cat.revenue, shopProfile)} (${cat.percentage.toInt()}%)",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    LinearProgressIndicator(
                        progress = { (cat.percentage / 100.0).toFloat() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp),
                        color = OrangePrimary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun DemandForecastCard(
    selectedPeriod: AnalyticsPeriod,
    topProducts: List<TopProductReport>,
    products: List<Product>,
    shopProfile: ShopProfile,
    language: AppLanguage
) {
    val periodDays = when (selectedPeriod) {
        AnalyticsPeriod.TODAY -> 1.0
        AnalyticsPeriod.THIS_WEEK -> 7.0
        AnalyticsPeriod.THIS_MONTH -> 30.0
        AnalyticsPeriod.ALL_TIME -> 30.0
    }
    val soldByName = topProducts.associateBy { it.productName.lowercase() }
    val forecasts = products
        .filter { !it.isDeleted }
        .mapNotNull { product ->
            val soldQty = soldByName[product.name.lowercase()]?.totalQuantitySold ?: 0.0
            val dailyVelocity = soldQty / periodDays
            val daysCover = if (dailyVelocity > 0.0) product.quantityInStock / dailyVelocity else Double.POSITIVE_INFINITY
            val needsReorder = product.isLowStock || (dailyVelocity > 0.0 && daysCover < 10.0)
            if (!needsReorder) return@mapNotNull null
            val targetStock = maxOf(
                ceil(dailyVelocity * 14.0),
                product.lowStockThreshold * 2.0,
                5.0
            )
            val reorderQty = (targetStock - product.quantityInStock).coerceAtLeast(1.0).toInt()
            val estCost = reorderQty * product.costPrice
            Triple(product, daysCover, reorderQty to estCost)
        }
        .sortedBy { it.second }
        .take(5)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, WarningAmber.copy(alpha = 0.35f)),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.TrendingUp, contentDescription = null, tint = WarningAmber, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(
                        text = Localization.get("demand_forecast_title", language),
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = Localization.format(
                            "ana_forecast_computed_fmt",
                            language,
                            Localization.analyticsPeriodLabel(selectedPeriod, language).lowercase()
                        ),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            if (forecasts.isEmpty()) {
                Text(
                    text = Localization.get("ana_forecast_healthy", language),
                    fontSize = 12.sp,
                    color = ProfitGreen,
                    fontWeight = FontWeight.Medium
                )
            } else {
                forecasts.forEachIndexed { idx, (product, daysCover, reorderPair) ->
                    val (reorderQty, estCost) = reorderPair
                    val coverText = if (daysCover.isInfinite()) {
                        Localization.get("ana_low_threshold_badge", language)
                    } else {
                        Localization.format("ana_days_cover_fmt", language, daysCover.toInt().coerceAtLeast(0))
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = product.name,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "${product.quantityInStock.toInt()} ${product.unit} • $coverText",
                                fontSize = 11.sp,
                                color = if (product.quantityInStock <= 0 || daysCover < 3.0) LossRed else WarningAmber
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = Localization.format("ana_order_unit_fmt", language, reorderQty, product.unit),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = OrangePrimary
                            )
                            Text(
                                text = Localization.format("ana_est_cost_fmt", language, ReceiptGenerator.formatMoney(estCost, shopProfile)),
                                fontSize = 10.5.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    if (idx < forecasts.lastIndex) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                    }
                }
            }
        }
    }
}

@Composable
private fun ReportExportActionsCard(
    context: Context,
    selectedPeriod: AnalyticsPeriod,
    summary: ProfitLossSummary,
    topProducts: List<TopProductReport>,
    categoryShares: List<CategorySalesShare>,
    shopProfile: ShopProfile,
    language: AppLanguage
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(
            onClick = {
                try {
                    val periodLabel = Localization.analyticsPeriodLabel(selectedPeriod, language)
                    val pdf = PdfReportGenerator.generateSalesReportPdf(
                        context = context,
                        periodName = periodLabel,
                        summary = summary,
                        topProducts = topProducts,
                        categoryShares = categoryShares,
                        shopProfile = shopProfile
                    )
                    PdfReportGenerator.sharePdf(
                        context = context,
                        file = pdf,
                        title = Localization.format("ana_share_pdf_period_fmt", language, periodLabel)
                    )
                } catch (e: Exception) {
                    Toast.makeText(context, Localization.format("ana_pdf_err_fmt", language, e.safeMessage()), Toast.LENGTH_SHORT).show()
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = DarkNavy)
        ) {
            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(Localization.get("export_pdf_report", language), fontWeight = FontWeight.Bold)
        }

        OutlinedButton(
            onClick = {
                val periodLabel = Localization.analyticsPeriodLabel(selectedPeriod, language)
                val reportText = Localization.format(
                    "ana_text_summary_fmt",
                    language,
                    shopProfile.shopName.uppercase(),
                    periodLabel,
                    ReceiptGenerator.formatMoney(summary.totalRevenue, shopProfile),
                    ReceiptGenerator.formatMoney(summary.totalCost, shopProfile),
                    ReceiptGenerator.formatMoney(summary.netProfit, shopProfile),
                    summary.profitMarginPercent.toInt(),
                    summary.totalSalesCount
                )
                try {
                    val cardFile = com.beboss.shopmgmt.util.BrandedShareCardGenerator.generateAnalyticsCardPng(
                        context = context,
                        periodName = periodLabel,
                        summary = summary,
                        topProducts = topProducts,
                        profile = shopProfile
                    )
                    PdfReportGenerator.shareFileToWhatsAppOrChooser(
                        context = context,
                        file = cardFile,
                        mimeType = "image/png",
                        caption = reportText,
                        targetPhone = shopProfile.phone,
                        chooserTitle = Localization.get("ana_share_text_cta", language)
                    )
                } catch (_: Exception) {
                    ReceiptGenerator.shareReceipt(context, reportText)
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(14.dp)
        ) {
            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp), tint = OrangePrimary)
            Spacer(modifier = Modifier.width(8.dp))
            Text("📊 ${Localization.get("ana_share_text_cta", language)} (WhatsApp Card)", fontWeight = FontWeight.SemiBold, color = OrangePrimary)
        }
    }
}

@Composable
private fun MetricTile(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(4.dp))
            Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = color)
        }
    }
}
