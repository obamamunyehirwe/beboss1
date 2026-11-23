package com.beboss.shopmgmt.ui.components

import android.content.Context
import android.widget.Toast
import com.beboss.shopmgmt.util.safeMessage
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.ViewAgenda
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.PurchaseRecord
import com.beboss.shopmgmt.data.model.PurchaseSummary
import com.beboss.shopmgmt.data.model.ReorderSuggestion
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.InkDark
import com.beboss.shopmgmt.ui.theme.InkMedium
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangeLight
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.ExcelCsvExporter
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.ReceiptGenerator
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class PurchaseSortField {
    DATE, PRODUCT, QUANTITY, COST, TOTAL, SUPPLIER
}

@Composable
fun PurchasesLedgerView(
    purchases: List<PurchaseRecord>,
    products: List<Product>,
    purchaseSummary: PurchaseSummary,
    shopProfile: ShopProfile,
    onRecordPurchase: (productId: String, qty: Double, cost: Double, sellPrice: Double?, supplier: String, phone: String, status: String, invoice: String, notes: String) -> Unit,
    onDeletePurchase: (String) -> Unit,
    language: AppLanguage = AppLanguage.ENGLISH,
    canManageInventory: Boolean = true,
    canDeleteRecords: Boolean = true,
    canExportReports: Boolean = true,
    canViewCostAndProfit: Boolean = true,
    prefillReorderSuggestion: ReorderSuggestion? = null,
    onClearPrefillReorder: () -> Unit = {}
) {
    val context = LocalContext.current
    var searchQuery by remember { mutableStateOf("") }
    var selectedSupplierFilter by remember { mutableStateOf("All") }
    var isExcelTableView by remember { mutableStateOf(true) }
    var sortField by remember { mutableStateOf(PurchaseSortField.DATE) }
    var sortAscending by remember { mutableStateOf(false) }

    var showAddPurchaseDialog by remember { mutableStateOf(false) }
    var purchaseToDelete by remember { mutableStateOf<PurchaseRecord?>(null) }
    var selectedPurchaseDetail by remember { mutableStateOf<PurchaseRecord?>(null) }

    LaunchedEffect(prefillReorderSuggestion) {
        if (prefillReorderSuggestion != null && canManageInventory) {
            showAddPurchaseDialog = true
        }
    }

    val suppliersList = remember(purchases) {
        listOf("All") + purchases.map { it.supplierName }.filter { it.isNotBlank() }.distinct()
    }
    val recentSuppliers = remember(purchases) {
        purchases.mapNotNull { rec ->
            rec.supplierName.trim().takeIf { it.isNotBlank() }?.let { it to rec.supplierPhone.trim() }
        }.distinctBy { it.first.lowercase(Locale.getDefault()) }.take(6)
    }

    val filteredPurchases = purchases.filter { p ->
        val matchesSupplier = selectedSupplierFilter == "All" || p.supplierName.equals(selectedSupplierFilter, ignoreCase = true)
        val matchesSearch = searchQuery.isBlank() ||
                p.productName.contains(searchQuery, ignoreCase = true) ||
                p.supplierName.contains(searchQuery, ignoreCase = true) ||
                p.invoiceNumber.contains(searchQuery, ignoreCase = true) ||
                p.category.contains(searchQuery, ignoreCase = true)
        matchesSupplier && matchesSearch
    }.let { list ->
        when (sortField) {
            PurchaseSortField.DATE -> if (sortAscending) list.sortedBy { it.purchaseDate } else list.sortedByDescending { it.purchaseDate }
            PurchaseSortField.PRODUCT -> if (sortAscending) list.sortedBy { it.productName.lowercase() } else list.sortedByDescending { it.productName.lowercase() }
            PurchaseSortField.QUANTITY -> if (sortAscending) list.sortedBy { it.quantityPurchased } else list.sortedByDescending { it.quantityPurchased }
            PurchaseSortField.COST -> if (sortAscending) list.sortedBy { it.unitCostPrice } else list.sortedByDescending { it.unitCostPrice }
            PurchaseSortField.TOTAL -> if (sortAscending) list.sortedBy { it.totalPurchaseCost } else list.sortedByDescending { it.totalPurchaseCost }
            PurchaseSortField.SUPPLIER -> if (sortAscending) list.sortedBy { it.supplierName.lowercase() } else list.sortedByDescending { it.supplierName.lowercase() }
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // KPI Overview Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(2.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.LocalShipping, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(22.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = Localization.get("pur_sheet_title", language),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = InkDark
                            )
                        }

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFF3F4F6)
                        ) {
                            Text(
                                text = Localization.format("pur_orders_logged_fmt", language, purchaseSummary.totalPurchasesCount),
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = InkDark,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Total Expenditure
                        Surface(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFF0FDF4),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBBF7D0))
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(Localization.get("pur_total_bought_upper", language), fontSize = 9.5.sp, fontWeight = FontWeight.Bold, color = ProfitGreen)
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = ReceiptGenerator.formatMoney(purchaseSummary.totalExpenditure, shopProfile),
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Black,
                                    color = ProfitGreen
                                )
                            }
                        }

                        // Total Units Bought
                        Surface(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFEFF6FF),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBFDBFE))
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(Localization.get("pur_units_restocked_upper", language), fontSize = 9.5.sp, fontWeight = FontWeight.Bold, color = DarkNavy)
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = Localization.format("pur_units_fmt", language, purchaseSummary.totalUnitsBought.toInt()),
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Black,
                                    color = DarkNavy
                                )
                            }
                        }

                        // Unique Suppliers
                        Surface(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFFFF7ED),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFED7AA))
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(Localization.get("pur_suppliers_upper", language), fontSize = 9.5.sp, fontWeight = FontWeight.Bold, color = OrangePrimary)
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = Localization.format("pur_vendors_fmt", language, purchaseSummary.uniqueSuppliersCount),
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Black,
                                    color = OrangePrimary
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Buttons: Export CSV Spreadsheet & Add Purchase Record
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (canExportReports) {
                            OutlinedButton(
                                onClick = {
                                    try {
                                        val file = ExcelCsvExporter.exportPurchasesCsv(context, purchases, shopProfile)
                                        ExcelCsvExporter.shareCsvFile(context, file, Localization.get("pur_share_csv_title", language))
                                    } catch (e: Exception) {
                                        Toast.makeText(context, Localization.format("pur_export_err_fmt", language, e.safeMessage()), Toast.LENGTH_SHORT).show()
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp)
                            ) {
                                Icon(Icons.Default.FileDownload, contentDescription = null, modifier = Modifier.size(15.dp), tint = OrangePrimary)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(Localization.get("pur_export_excel_csv", language), fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = OrangePrimary)
                            }
                        }

                        if (canManageInventory) {
                            Button(
                                onClick = { showAddPurchaseDialog = true },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(15.dp), tint = Color.White)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(Localization.get("pur_buy_restock_btn", language), fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            }
                        }
                    }
                }
            }
        }

        // Search & Filter & Layout Controls
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(1.dp)
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text(Localization.get("pur_search_placeholder", language), fontSize = 12.5.sp) },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = InkMedium, modifier = Modifier.size(18.dp)) },
                        trailingIcon = {
                            if (searchQuery.isNotBlank()) {
                                IconButton(onClick = { searchQuery = "" }) {
                                    Icon(Icons.Default.Clear, contentDescription = Localization.get("search_clear_cd", language), modifier = Modifier.size(16.dp))
                                }
                            }
                        },
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true,
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color(0xFFF9FAFB),
                            unfocusedContainerColor = Color(0xFFF9FAFB),
                            focusedIndicatorColor = OrangePrimary,
                            unfocusedIndicatorColor = Color(0xFFE5E7EB)
                        )
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(Localization.get("pur_view_colon", language), fontSize = 11.5.sp, fontWeight = FontWeight.Medium, color = InkMedium)
                            FilterChip(
                                selected = isExcelTableView,
                                onClick = { isExcelTableView = true },
                                leadingIcon = {
                                    Icon(Icons.Default.TableChart, contentDescription = null, modifier = Modifier.size(13.dp), tint = if (isExcelTableView) OrangePrimary else InkMedium)
                                },
                                label = { Text(Localization.get("pur_view_excel", language), fontSize = 11.sp) },
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = OrangePrimary.copy(alpha = 0.15f))
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            FilterChip(
                                selected = !isExcelTableView,
                                onClick = { isExcelTableView = false },
                                leadingIcon = {
                                    Icon(Icons.Default.ViewAgenda, contentDescription = null, modifier = Modifier.size(13.dp), tint = if (!isExcelTableView) OrangePrimary else InkMedium)
                                },
                                label = { Text(Localization.get("pur_view_cards", language), fontSize = 11.sp) },
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = OrangePrimary.copy(alpha = 0.15f))
                            )
                        }

                        // Sort direction toggle
                        IconButton(onClick = { sortAscending = !sortAscending }, modifier = Modifier.size(32.dp)) {
                            Icon(
                                imageVector = if (sortAscending) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                                contentDescription = Localization.get("pur_sort_cd", language),
                                tint = OrangePrimary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }

        if (filteredPurchases.isEmpty()) {
            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 20.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.TableChart, contentDescription = null, tint = InkMedium, modifier = Modifier.size(40.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(Localization.get("pur_empty_title", language), fontWeight = FontWeight.Bold, color = InkDark)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(Localization.get("pur_empty_sub", language), fontSize = 12.sp, color = InkMedium, textAlign = TextAlign.Center)
                    }
                }
            }
        } else if (isExcelTableView) {
            // Excel Interactive Spreadsheet Grid
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB)),
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    val horizontalScrollState = rememberScrollState()
                    val dateFmt = remember { SimpleDateFormat("MM/dd HH:mm", Locale.getDefault()) }

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(horizontalScrollState)
                    ) {
                        // Excel Header Row
                        Row(
                            modifier = Modifier
                                .background(Color(0xFF1E293B))
                                .padding(vertical = 10.dp, horizontal = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(Localization.get("pur_col_num", language), width = Modifier.width(36.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
                            Text(Localization.get("pur_col_po_ref", language), width = Modifier.width(100.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
                            Text(Localization.get("pur_col_date", language), width = Modifier.width(90.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
                            Text(Localization.get("pur_col_product_name", language), width = Modifier.width(150.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
                            Text(Localization.get("pur_col_supplier_vendor", language), width = Modifier.width(140.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
                            Text(Localization.get("pur_col_qty_in", language), width = Modifier.width(70.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, textAlign = TextAlign.End)
                            if (canViewCostAndProfit) {
                                Text(Localization.get("pur_col_unit_cost", language), width = Modifier.width(90.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, textAlign = TextAlign.End)
                                Text(Localization.get("pur_col_total_cost", language), width = Modifier.width(100.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, textAlign = TextAlign.End)
                            }
                            Text(Localization.get("pur_col_sell_price", language), width = Modifier.width(90.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, textAlign = TextAlign.End)
                            if (canViewCostAndProfit) {
                                Text(Localization.get("pur_col_est_profit", language), width = Modifier.width(90.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, textAlign = TextAlign.End)
                            }
                            Text(Localization.get("pur_col_status", language), width = Modifier.width(80.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, textAlign = TextAlign.Center)
                            Text(Localization.get("pur_col_actions", language), width = Modifier.width(70.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, textAlign = TextAlign.Center)
                        }

                        HorizontalDivider(color = Color(0xFFCBD5E1), thickness = 1.dp)

                        // Data rows
                        filteredPurchases.forEachIndexed { index, record ->
                            val isEven = index % 2 == 0
                            val rowColor = if (isEven) Color.White else Color(0xFFF8FAFC)
                            val profit = record.estimatedTotalProfit

                            Row(
                                modifier = Modifier
                                    .background(rowColor)
                                    .clickable { selectedPurchaseDetail = record }
                                    .padding(vertical = 9.dp, horizontal = 12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("${index + 1}", width = Modifier.width(36.dp), fontSize = 11.sp, color = InkMedium)
                                Text(record.invoiceNumber.ifBlank { "PO-${record.id.take(6)}" }, width = Modifier.width(100.dp), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = DarkNavy)
                                Text(dateFmt.format(Date(record.purchaseDate)), width = Modifier.width(90.dp), fontSize = 10.5.sp, color = InkMedium)
                                Text(record.productName, width = Modifier.width(150.dp), fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = InkDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(record.supplierName, width = Modifier.width(140.dp), fontSize = 11.sp, color = InkMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("${record.quantityPurchased.toInt()}", width = Modifier.width(70.dp), fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = InkDark, textAlign = TextAlign.End)
                                if (canViewCostAndProfit) {
                                    Text(ReceiptGenerator.formatMoney(record.unitCostPrice, shopProfile), width = Modifier.width(90.dp), fontSize = 11.sp, color = InkDark, textAlign = TextAlign.End)
                                    Text(ReceiptGenerator.formatMoney(record.totalPurchaseCost, shopProfile), width = Modifier.width(100.dp), fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = DarkNavy, textAlign = TextAlign.End)
                                }
                                Text(ReceiptGenerator.formatMoney(record.sellingPriceAtPurchase, shopProfile), width = Modifier.width(90.dp), fontSize = 11.sp, color = OrangePrimary, textAlign = TextAlign.End)
                                if (canViewCostAndProfit) {
                                    Text(ReceiptGenerator.formatMoney(profit, shopProfile), width = Modifier.width(90.dp), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ProfitGreen, textAlign = TextAlign.End)
                                }
                                
                                Box(modifier = Modifier.width(80.dp), contentAlignment = Alignment.Center) {
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = if (record.paymentStatus == "PAID_CASH" || record.paymentStatus == "PAID_MOMO") Color(0xFFDCFCE7) else Color(0xFFFEF3C7)
                                    ) {
                                        Text(
                                            text = if (record.paymentStatus.startsWith("PAID")) Localization.get("pur_status_paid", language) else Localization.get("pur_status_credit", language),
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (record.paymentStatus.startsWith("PAID")) Color(0xFF166534) else Color(0xFF92400E),
                                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                Row(modifier = Modifier.width(70.dp), horizontalArrangement = Arrangement.Center) {
                                    if (canDeleteRecords) {
                                        IconButton(
                                            onClick = { purchaseToDelete = record },
                                            modifier = Modifier.size(32.dp)
                                        ) {
                                            Icon(Icons.Default.Delete, contentDescription = Localization.get("delete", language), tint = LossRed, modifier = Modifier.size(15.dp))
                                        }
                                    }
                                }
                            }
                            HorizontalDivider(color = Color(0xFFF1F5F9), thickness = 0.5.dp)
                        }
                    }
                }
            }
        } else {
            // Card based list view
            items(filteredPurchases) { record ->
                PurchaseRecordCard(
                    record = record,
                    shopProfile = shopProfile,
                    onViewDetail = { selectedPurchaseDetail = record },
                    onDelete = { purchaseToDelete = record },
                    language = language
                )
            }
        }
    }

    // Modal Add Purchase / Stock In Dialog
    if (showAddPurchaseDialog) {
        AddPurchaseOrderDialog(
            products = products,
            shopProfile = shopProfile,
            onDismiss = {
                showAddPurchaseDialog = false
                onClearPrefillReorder()
            },
            onConfirm = { prodId, qty, cost, sellPrice, supplier, phone, status, inv, notes ->
                onRecordPurchase(prodId, qty, cost, sellPrice, supplier, phone, status, inv, notes)
                showAddPurchaseDialog = false
                onClearPrefillReorder()
            },
            language = language,
            initialProduct = prefillReorderSuggestion?.product,
            initialQuantity = prefillReorderSuggestion?.recommendedOrderQty,
            recentSuppliers = recentSuppliers
        )
    }

    // Delete Confirmation Dialog
    if (purchaseToDelete != null) {
        AlertDialog(
            onDismissRequest = { purchaseToDelete = null },
            title = { Text(Localization.get("pur_delete_record_title", language)) },
            text = {
                Text(
                    Localization.format(
                        "pur_delete_record_msg_fmt",
                        language,
                        purchaseToDelete?.productName ?: "",
                        "${purchaseToDelete?.quantityPurchased?.toInt() ?: 0}"
                    )
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        purchaseToDelete?.let { onDeletePurchase(it.id) }
                        purchaseToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LossRed)
                ) {
                    Text(Localization.get("delete", language), fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { purchaseToDelete = null }) {
                    Text(Localization.get("cancel", language))
                }
            }
        )
    }
}

@Composable
fun PurchaseRecordCard(
    record: PurchaseRecord,
    shopProfile: ShopProfile,
    onViewDetail: () -> Unit,
    onDelete: () -> Unit,
    language: AppLanguage = AppLanguage.ENGLISH
) {
    val dateFmt = remember { SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault()) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onViewDetail() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.5.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = CircleShape,
                        color = OrangeLight,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Storefront, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(16.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(record.productName, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = InkDark)
                        Text(dateFmt.format(Date(record.purchaseDate)), fontSize = 10.5.sp, color = InkMedium)
                    }
                }

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = Color(0xFFEFF6FF)
                ) {
                    Text(
                        text = record.invoiceNumber.ifBlank { "PO-LOG" },
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = DarkNavy,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(Localization.get("pur_card_supplier", language), fontSize = 10.sp, color = InkMedium)
                    Text(record.supplierName, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = InkDark)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(Localization.get("pur_card_qty_in", language), fontSize = 10.sp, color = InkMedium)
                    Text(Localization.format("pur_card_units_plus_fmt", language, record.quantityPurchased.toInt()), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ProfitGreen)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(Localization.get("pur_card_total_outflow", language), fontSize = 10.sp, color = InkMedium)
                    Text(ReceiptGenerator.formatMoney(record.totalPurchaseCost, shopProfile), fontSize = 13.sp, fontWeight = FontWeight.Black, color = DarkNavy)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddPurchaseOrderDialog(
    products: List<Product>,
    shopProfile: ShopProfile,
    onDismiss: () -> Unit,
    onConfirm: (productId: String, qty: Double, cost: Double, sellPrice: Double?, supplier: String, phone: String, status: String, invoice: String, notes: String) -> Unit,
    language: AppLanguage = AppLanguage.ENGLISH,
    initialProduct: Product? = null,
    initialQuantity: Double? = null,
    recentSuppliers: List<Pair<String, String>> = emptyList()
) {
    var selectedProduct by remember(initialProduct?.id) {
        mutableStateOf(initialProduct ?: products.firstOrNull())
    }
    var quantityStr by remember(initialQuantity) {
        mutableStateOf(initialQuantity?.toInt()?.coerceAtLeast(1)?.toString() ?: "10")
    }
    var unitCostStr by remember(selectedProduct?.id) {
        mutableStateOf(selectedProduct?.costPrice?.takeIf { it > 0 }?.toLong()?.toString() ?: "")
    }
    var sellingPriceStr by remember(selectedProduct?.id) {
        mutableStateOf(selectedProduct?.sellingPrice?.takeIf { it > 0 }?.toLong()?.toString() ?: "")
    }
    var supplierName by remember { mutableStateOf("") }
    var supplierPhone by remember { mutableStateOf("") }
    var invoiceNumber by remember { mutableStateOf("") }
    var paymentStatus by remember { mutableStateOf("PAID_CASH") }
    var notes by remember { mutableStateOf("") }

    var productDropdownExpanded by remember { mutableStateOf(false) }

    val qty = quantityStr.toDoubleOrNull() ?: 0.0
    val cost = unitCostStr.toDoubleOrNull() ?: 0.0
    val sellPrice = sellingPriceStr.toDoubleOrNull() ?: 0.0
    val totalCost = qty * cost
    val estProfit = (sellPrice - cost) * qty

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(6.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(Localization.get("pur_add_dialog_title", language), fontWeight = FontWeight.Bold, fontSize = 16.sp, color = InkDark)
                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = Localization.get("close", language))
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Product Selection Dropdown
                Text(Localization.get("pur_select_product_restock", language), fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = InkMedium)
                Spacer(modifier = Modifier.height(4.dp))

                ExposedDropdownMenuBox(
                    expanded = productDropdownExpanded,
                    onExpandedChange = { productDropdownExpanded = !productDropdownExpanded }
                ) {
                    OutlinedTextField(
                        value = selectedProduct?.name ?: Localization.get("pur_select_product_hint", language),
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = productDropdownExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    ExposedDropdownMenu(
                        expanded = productDropdownExpanded,
                        onDismissRequest = { productDropdownExpanded = false }
                    ) {
                        products.forEach { p ->
                            DropdownMenuItem(
                                text = { Text(Localization.format("pur_dropdown_in_stock_fmt", language, p.name, p.quantityInStock.toInt())) },
                                onClick = {
                                    selectedProduct = p
                                    unitCostStr = p.costPrice.toString()
                                    sellingPriceStr = p.sellingPrice.toString()
                                    productDropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = quantityStr,
                        onValueChange = { quantityStr = it },
                        label = { Text(Localization.get("pur_qty_bought_label", language)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    )

                    OutlinedTextField(
                        value = unitCostStr,
                        onValueChange = { unitCostStr = it },
                        label = { Text(Localization.format("pur_unit_cost_currency_fmt", language, shopProfile.currencySymbol)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = sellingPriceStr,
                    onValueChange = { sellingPriceStr = it },
                    label = { Text(Localization.format("pur_sell_price_currency_fmt", language, shopProfile.currencySymbol)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp)
                )

                Spacer(modifier = Modifier.height(10.dp))

                if (recentSuppliers.isNotEmpty()) {
                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        recentSuppliers.forEach { (sName, sPhone) ->
                            FilterChip(
                                selected = supplierName.equals(sName, ignoreCase = true),
                                onClick = {
                                    supplierName = sName
                                    if (sPhone.isNotBlank()) supplierPhone = sPhone
                                },
                                label = { Text(sName, fontSize = 11.sp) }
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = supplierName,
                        onValueChange = { supplierName = it },
                        label = { Text(Localization.get("pur_supplier_name_label", language)) },
                        placeholder = { Text("Enter supplier / vendor name") },
                        modifier = Modifier.weight(1.2f),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true
                    )

                    OutlinedTextField(
                        value = supplierPhone,
                        onValueChange = { supplierPhone = it },
                        label = { Text(Localization.get("pur_supplier_phone_label", language)) },
                        placeholder = { Text("+250 7XX XXX XXX") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = invoiceNumber,
                    onValueChange = { invoiceNumber = it },
                    label = { Text(Localization.get("pur_po_invoice_optional", language)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp)
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Calculations Summary Box
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFF0FDF4),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBBF7D0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(Localization.get("pur_total_cost_colon", language), fontSize = 11.sp, color = InkMedium)
                            Text(ReceiptGenerator.formatMoney(totalCost, shopProfile), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = DarkNavy)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(Localization.get("pur_expected_profit_colon", language), fontSize = 11.sp, color = InkMedium)
                            Text(ReceiptGenerator.formatMoney(estProfit, shopProfile), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = ProfitGreen)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(Localization.get("cancel", language))
                    }

                    Button(
                        onClick = {
                            val p = selectedProduct
                            if (p != null && qty > 0) {
                                onConfirm(
                                    p.id,
                                    qty,
                                    cost,
                                    sellPrice,
                                    supplierName,
                                    supplierPhone,
                                    paymentStatus,
                                    invoiceNumber,
                                    notes
                                )
                            }
                        },
                        modifier = Modifier.weight(1.3f),
                        colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(Localization.get("pur_save_restock_btn", language), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun Text(
    text: String,
    width: Modifier,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
    fontSize: androidx.compose.ui.unit.TextUnit = androidx.compose.ui.unit.TextUnit.Unspecified,
    textAlign: TextAlign? = null,
    maxLines: Int = 1,
    overflow: TextOverflow = TextOverflow.Clip
) {
    androidx.compose.material3.Text(
        text = text,
        modifier = width,
        color = color,
        fontWeight = fontWeight,
        fontSize = fontSize,
        textAlign = textAlign,
        maxLines = maxLines,
        overflow = overflow
    )
}
