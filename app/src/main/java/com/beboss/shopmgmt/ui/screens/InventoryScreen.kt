package com.beboss.shopmgmt.ui.screens

import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.beboss.shopmgmt.data.model.InventoryValuation
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.PurchaseRecord
import com.beboss.shopmgmt.data.model.PurchaseSummary
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.ui.components.PurchasesLedgerView
import com.beboss.shopmgmt.ui.theme.BackgroundLight
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.InkDark
import com.beboss.shopmgmt.ui.theme.InkMedium
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangeLight
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.ui.theme.WarningAmber
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.BusinessCatalog
import com.beboss.shopmgmt.util.ExcelCsvExporter
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.PdfReportGenerator
import com.beboss.shopmgmt.util.ReceiptGenerator
import java.util.UUID

enum class ProductSortField {
    NAME, STOCK, BUY_PRICE, SELL_PRICE, MARGIN
}

@Composable
fun InventoryScreen(
    products: List<Product>,
    categories: List<String>,
    inventoryValuation: InventoryValuation,
    shopProfile: ShopProfile,
    purchases: List<PurchaseRecord> = emptyList(),
    purchaseSummary: PurchaseSummary = PurchaseSummary(),
    language: AppLanguage = AppLanguage.ENGLISH,
    onSaveProduct: (Product) -> Unit,
    onAdjustStock: (String, Double, String) -> Unit,
    onDeleteProduct: (String) -> Unit,
    onClearAllProducts: (() -> Unit)? = null,
    onRecordPurchase: ((productId: String, qty: Double, cost: Double, sellPrice: Double?, supplier: String, phone: String, status: String, invoice: String, notes: String) -> Unit)? = null,
    onDeletePurchase: ((String) -> Unit)? = null
) {
    val context = LocalContext.current
    var selectedInventoryTab by remember { mutableStateOf(0) } // 0 = Stock Ledger, 1 = Purchases / Inflow
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("All") }
    var showOnlyLowStock by remember { mutableStateOf(false) }
    var sortField by remember { mutableStateOf(ProductSortField.NAME) }
    var sortAscending by remember { mutableStateOf(true) }

    var productToEdit by remember { mutableStateOf<Product?>(null) }
    var productToAdjust by remember { mutableStateOf<Product?>(null) }
    var productToDelete by remember { mutableStateOf<Product?>(null) }
    var showClearAllProductsDialog by remember { mutableStateOf(false) }
    var isAddingNewProduct by remember { mutableStateOf(false) }
    var showImportDialog by remember { mutableStateOf(false) }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val content = inputStream?.bufferedReader()?.use { it.readText() } ?: ""
                val imported = ExcelCsvExporter.parseProductsCsv(content)
                if (imported.isNotEmpty()) {
                    imported.forEach { onSaveProduct(it) }
                    Toast.makeText(context, Localization.format("inv_import_success_fmt", language, imported.size), Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(context, Localization.get("inv_import_empty", language), Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(context, Localization.format("inv_import_err_fmt", language, e.message ?: ""), Toast.LENGTH_SHORT).show()
            }
        }
    }

    val filtered = products.filter { p ->
        val matchesCat = selectedCategory == "All" || p.category.equals(selectedCategory, ignoreCase = true)
        val matchesLowStock = !showOnlyLowStock || p.isLowStock
        val matchesSearch = searchQuery.isBlank() ||
                p.name.contains(searchQuery, ignoreCase = true) ||
                p.category.contains(searchQuery, ignoreCase = true) ||
                p.barcode.contains(searchQuery, ignoreCase = true)
        matchesCat && matchesLowStock && matchesSearch
    }.let { list ->
        when (sortField) {
            ProductSortField.NAME -> if (sortAscending) list.sortedBy { it.name.lowercase() } else list.sortedByDescending { it.name.lowercase() }
            ProductSortField.STOCK -> if (sortAscending) list.sortedBy { it.quantityInStock } else list.sortedByDescending { it.quantityInStock }
            ProductSortField.BUY_PRICE -> if (sortAscending) list.sortedBy { it.costPrice } else list.sortedByDescending { it.costPrice }
            ProductSortField.SELL_PRICE -> if (sortAscending) list.sortedBy { it.sellingPrice } else list.sortedByDescending { it.sellingPrice }
            ProductSortField.MARGIN -> if (sortAscending) list.sortedBy { it.profitMarginPercent } else list.sortedByDescending { it.profitMarginPercent }
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(BackgroundLight)) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Top Tab Switcher: Stock Spreadsheet vs Purchases & Inflow
            Surface(
                color = Color.White,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        onClick = { selectedInventoryTab = 0 },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        color = if (selectedInventoryTab == 0) OrangePrimary else Color(0xFFF3F4F6)
                    ) {
                        Row(
                            modifier = Modifier.padding(vertical = 9.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Inventory,
                                contentDescription = null,
                                tint = if (selectedInventoryTab == 0) Color.White else InkDark,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = Localization.get("excel_mode", language),
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (selectedInventoryTab == 0) Color.White else InkDark
                            )
                        }
                    }

                    Surface(
                        onClick = { selectedInventoryTab = 1 },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        color = if (selectedInventoryTab == 1) OrangePrimary else Color(0xFFF3F4F6)
                    ) {
                        Row(
                            modifier = Modifier.padding(vertical = 9.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.TableChart,
                                contentDescription = null,
                                tint = if (selectedInventoryTab == 1) Color.White else InkDark,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = Localization.format("inv_tab_purchases_fmt", language, purchases.size),
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (selectedInventoryTab == 1) Color.White else InkDark
                            )
                        }
                    }
                }
            }

            if (selectedInventoryTab == 1) {
                PurchasesLedgerView(
                    purchases = purchases,
                    products = products,
                    purchaseSummary = purchaseSummary,
                    shopProfile = shopProfile,
                    language = language,
                    onRecordPurchase = { prodId, qty, cost, sellPrice, supplier, phone, status, inv, notes ->
                        onRecordPurchase?.invoke(prodId, qty, cost, sellPrice, supplier, phone, status, inv, notes)
                    },
                    onDeletePurchase = { pId ->
                        onDeletePurchase?.invoke(pId)
                    }
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
            // Inventory Summary KPI Grid
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
                                Icon(Icons.Default.TableChart, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = Localization.get("inv_sheet_valuation_title", language),
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
                                    text = Localization.format("inv_products_count_fmt", language, inventoryValuation.totalItems),
                                    fontSize = 12.sp,
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
                            // Cost value
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFF9FAFB),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB))
                            ) {
                                Column(modifier = Modifier.padding(8.dp)) {
                                    Text(Localization.get("inv_total_cost", language), fontSize = 10.sp, color = InkMedium, fontWeight = FontWeight.Medium)
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = ReceiptGenerator.formatMoney(inventoryValuation.totalCostValue, shopProfile),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = InkDark,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }

                            // Retail value
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFFFF0E6),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFFD8BF))
                            ) {
                                Column(modifier = Modifier.padding(8.dp)) {
                                    Text(Localization.get("inv_retail_value", language), fontSize = 10.sp, color = InkMedium, fontWeight = FontWeight.Medium)
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = ReceiptGenerator.formatMoney(inventoryValuation.totalRetailValue, shopProfile),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = OrangePrimary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }

                            // Potential Profit
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFDCFCE7),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF86EFAC))
                            ) {
                                Column(modifier = Modifier.padding(8.dp)) {
                                    Text(Localization.get("inv_est_profit", language), fontSize = 10.sp, color = InkMedium, fontWeight = FontWeight.Medium)
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "+${ReceiptGenerator.formatMoney(inventoryValuation.potentialProfit, shopProfile)}",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = ProfitGreen,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // Excel & PDF Export/Import Action Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            OutlinedButton(
                                onClick = {
                                    try {
                                        val file = ExcelCsvExporter.exportProductsCsv(context, products, shopProfile)
                                        ExcelCsvExporter.shareCsvFile(context, file, Localization.get("inv_share_csv_title", language))
                                    } catch (e: Exception) {
                                        Toast.makeText(context, Localization.format("inv_export_err_fmt", language, e.message ?: ""), Toast.LENGTH_SHORT).show()
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                            ) {
                                Icon(Icons.Default.FileDownload, contentDescription = null, modifier = Modifier.size(15.dp), tint = OrangePrimary)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(Localization.get("inv_excel_csv_btn", language), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = OrangePrimary)
                            }

                            OutlinedButton(
                                onClick = {
                                    filePickerLauncher.launch("text/*")
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                            ) {
                                Icon(Icons.Default.FileUpload, contentDescription = null, modifier = Modifier.size(15.dp), tint = InkDark)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(Localization.get("inv_import_csv_btn", language), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = InkDark)
                            }

                            OutlinedButton(
                                onClick = {
                                    try {
                                        val pdf = PdfReportGenerator.generateInventoryValuationPdf(context, products, inventoryValuation, shopProfile)
                                        PdfReportGenerator.sharePdf(context, pdf, Localization.get("inv_share_pdf_title", language))
                                    } catch (e: Exception) {
                                        Toast.makeText(context, Localization.format("inv_pdf_err_fmt", language, e.message ?: ""), Toast.LENGTH_SHORT).show()
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                            ) {
                                Icon(Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(15.dp), tint = LossRed)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(Localization.get("inv_pdf_report_btn", language), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = LossRed)
                            }

                            if (onClearAllProducts != null && products.isNotEmpty()) {
                                OutlinedButton(
                                    onClick = { showClearAllProductsDialog = true },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(8.dp),
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = LossRed)
                                ) {
                                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(15.dp), tint = LossRed)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(Localization.get("inv_clear_all_btn", language), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = LossRed)
                                }
                            }
                        }
                    }
                }
            }

            // Search & Category Filters
            item {
                Surface(
                    color = Color.White,
                    shape = RoundedCornerShape(14.dp),
                    shadowElevation = 1.dp
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = { Text(Localization.get("inv_search_placeholder", language), fontSize = 13.sp) },
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = InkMedium) },
                            trailingIcon = {
                                if (searchQuery.isNotBlank()) {
                                    IconButton(onClick = { searchQuery = "" }) {
                                        Icon(Icons.Default.Clear, contentDescription = Localization.get("pos_clear_cd", language), tint = InkMedium)
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            singleLine = true,
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color(0xFFF9FAFB),
                                unfocusedContainerColor = Color(0xFFF9FAFB)
                            )
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        // Category horizontal chip row
                        val allCats = listOf("All") + categories
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(allCats, key = { it }) { cat ->
                                val isSelected = selectedCategory == cat
                                FilterChip(
                                    selected = isSelected,
                                    onClick = { selectedCategory = cat },
                                    label = { Text(if (cat == "All") Localization.get("all_categories", language) else cat, fontSize = 11.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = OrangePrimary,
                                        selectedLabelColor = Color.White
                                    ),
                                    shape = RoundedCornerShape(8.dp)
                                )
                            }
                        }

                        // Low stock toggle & count
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            val lowCount = products.count { it.isLowStock }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Warning, contentDescription = null, tint = if (lowCount > 0) LossRed else InkMedium, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    Localization.format("inv_low_stock_alert_fmt", language, lowCount),
                                    fontSize = 12.sp,
                                    color = if (lowCount > 0) LossRed else InkDark,
                                    fontWeight = if (lowCount > 0) FontWeight.Bold else FontWeight.Normal
                                )
                            }
                            Switch(
                                checked = showOnlyLowStock,
                                onCheckedChange = { showOnlyLowStock = it },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = Color.White,
                                    checkedTrackColor = OrangePrimary
                                )
                            )
                        }
                    }
                }
            }

            // Excel Spreadsheet Table Container Header
            item {
                ExcelTableHeaderRow(
                    sortField = sortField,
                    sortAscending = sortAscending,
                    currencySymbol = shopProfile.currencySymbol,
                    language = language,
                    onSort = { field ->
                        if (sortField == field) {
                            sortAscending = !sortAscending
                        } else {
                            sortField = field
                            sortAscending = true
                        }
                    }
                )
            }

            // Products Spreadsheet Rows
            if (filtered.isEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(28.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(Icons.Default.Inventory, contentDescription = null, tint = InkMedium, modifier = Modifier.size(44.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(Localization.get("inv_no_match", language), fontWeight = FontWeight.Bold, fontSize = 14.sp, color = InkDark)
                            Spacer(modifier = Modifier.height(10.dp))
                            Button(
                                onClick = { isAddingNewProduct = true },
                                colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(Localization.get("inv_add_to_sheet_btn", language))
                            }
                        }
                    }
                }
            } else {
                itemsIndexed(filtered, key = { _, item -> item.id }) { index, product ->
                    ExcelProductRow(
                        index = index + 1,
                        product = product,
                        shopProfile = shopProfile,
                        language = language,
                        isEven = index % 2 == 0,
                        onQuickAddStock = { delta ->
                            onAdjustStock(product.id, delta, "Quick +$delta stock addition")
                        },
                        onQuickReduceStock = { delta ->
                            onAdjustStock(product.id, -delta, "Quick -$delta reduction")
                        },
                        onEdit = { productToEdit = product },
                        onAdjust = { productToAdjust = product },
                        onDelete = { productToDelete = product }
                    )
                }
            }

            item { Spacer(modifier = Modifier.height(76.dp)) }
        } // closes LazyColumn
        } // closes else
        } // closes Column

        // FAB to Add Product
        if (selectedInventoryTab == 0) {
            FloatingActionButton(
                onClick = { isAddingNewProduct = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(20.dp)
                    .testTag("add_product_fab"),
                containerColor = OrangePrimary,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(modifier = Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Add, contentDescription = Localization.get("add_product_action", language))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(Localization.get("add_product_action", language), fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    // Add / Edit Product Dialog
    if (isAddingNewProduct || productToEdit != null) {
        ProductFormDialog(
            initialProduct = productToEdit,
            categories = categories,
            shopProfile = shopProfile,
            language = language,
            onSave = { product ->
                onSaveProduct(product)
                isAddingNewProduct = false
                productToEdit = null
            },
            onDelete = if (productToEdit != null) {
                {
                    val toDelete = productToEdit
                    productToEdit = null
                    productToDelete = toDelete
                }
            } else null,
            onDismiss = {
                isAddingNewProduct = false
                productToEdit = null
            }
        )
    }

    // Stock Adjust Dialog
    if (productToAdjust != null) {
        StockAdjustDialog(
            product = productToAdjust!!,
            shopProfile = shopProfile,
            language = language,
            onConfirm = { delta, reason ->
                onAdjustStock(productToAdjust!!.id, delta, reason)
                productToAdjust = null
            },
            onDismiss = { productToAdjust = null }
        )
    }

    // Delete Confirmation
    if (productToDelete != null) {
        AlertDialog(
            onDismissRequest = { productToDelete = null },
            title = { Text(Localization.get("inv_delete_product_cd", language), fontWeight = FontWeight.Bold) },
            text = { Text(Localization.format("inv_delete_confirm_msg_fmt", language, productToDelete!!.name)) },
            confirmButton = {
                Button(
                    onClick = {
                        onDeleteProduct(productToDelete!!.id)
                        productToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LossRed)
                ) {
                    Text(Localization.get("delete", language))
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { productToDelete = null }) {
                    Text(Localization.get("cancel", language))
                }
            }
        )
    }

    if (showClearAllProductsDialog) {
        AlertDialog(
            onDismissRequest = { showClearAllProductsDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Delete, contentDescription = null, tint = LossRed)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(Localization.get("set_wipe_products_title", language), fontWeight = FontWeight.Bold, color = LossRed)
                }
            },
            text = { Text(Localization.get("set_wipe_products_msg", language)) },
            confirmButton = {
                Button(
                    onClick = {
                        showClearAllProductsDialog = false
                        onClearAllProducts?.invoke()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LossRed)
                ) {
                    Text(Localization.get("set_wipe_products_confirm", language))
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { showClearAllProductsDialog = false }) {
                    Text(Localization.get("cancel", language))
                }
            }
        )
    }
}

@Composable
private fun ExcelTableHeaderRow(
    sortField: ProductSortField,
    sortAscending: Boolean,
    currencySymbol: String,
    language: AppLanguage = AppLanguage.ENGLISH,
    onSort: (ProductSortField) -> Unit
) {
    Surface(
        color = DarkNavy,
        shape = RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp),
        shadowElevation = 2.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "#",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier.width(24.dp),
                textAlign = TextAlign.Center
            )

            Row(
                modifier = Modifier
                    .weight(2.2f)
                    .clickable { onSort(ProductSortField.NAME) },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = Localization.get("inv_col_product_sku", language),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1
                )
                if (sortField == ProductSortField.NAME) {
                    Icon(
                        if (sortAscending) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                        contentDescription = null,
                        tint = OrangePrimary,
                        modifier = Modifier.size(12.dp)
                    )
                }
            }

            Row(
                modifier = Modifier
                    .weight(1.3f)
                    .clickable { onSort(ProductSortField.STOCK) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    text = Localization.get("inv_col_stock", language),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                if (sortField == ProductSortField.STOCK) {
                    Icon(
                        if (sortAscending) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                        contentDescription = null,
                        tint = OrangePrimary,
                        modifier = Modifier.size(12.dp)
                    )
                }
            }

            Row(
                modifier = Modifier
                    .weight(1.4f)
                    .clickable { onSort(ProductSortField.SELL_PRICE) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End
            ) {
                Text(
                    text = Localization.format("inv_col_price_fmt", language, currencySymbol),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1
                )
                if (sortField == ProductSortField.SELL_PRICE) {
                    Icon(
                        if (sortAscending) Icons.Default.ArrowUpward else Icons.Default.ArrowDownward,
                        contentDescription = null,
                        tint = OrangePrimary,
                        modifier = Modifier.size(12.dp)
                    )
                }
            }

            Text(
                text = Localization.get("inv_col_actions", language),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier.width(100.dp),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun ExcelProductRow(
    index: Int,
    product: Product,
    shopProfile: ShopProfile,
    language: AppLanguage = AppLanguage.ENGLISH,
    isEven: Boolean,
    onQuickAddStock: (Double) -> Unit,
    onQuickReduceStock: (Double) -> Unit,
    onEdit: () -> Unit,
    onAdjust: () -> Unit,
    onDelete: () -> Unit
) {
    Surface(
        color = if (isEven) Color(0xFFF9FAFB) else Color.White,
        modifier = Modifier
            .fillMaxWidth()
            .border(0.5.dp, Color(0xFFE5E7EB)),
        shadowElevation = 0.5.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // # Index
            Text(
                text = "$index",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = InkMedium,
                modifier = Modifier.width(24.dp),
                textAlign = TextAlign.Center
            )

            // Product Name + Barcode / Category
            Column(
                modifier = Modifier
                    .weight(2.2f)
                    .clickable { onEdit() }
            ) {
                Text(
                    text = product.name,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = InkDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = product.category,
                        fontSize = 10.sp,
                        color = InkMedium
                    )
                    if (product.barcode.isNotBlank()) {
                        Text(
                            text = " • #${product.barcode}",
                            fontSize = 10.sp,
                            color = OrangePrimary,
                            maxLines = 1
                        )
                    }
                }
            }

            // Stock Column with Quick +/- Buttons
            Column(
                modifier = Modifier.weight(1.3f),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = if (product.isLowStock) Color(0xFFFEE2E2) else Color(0xFFDCFCE7)
                ) {
                    Text(
                        text = "${product.quantityInStock.toInt()} ${product.unit}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (product.isLowStock) LossRed else ProfitGreen,
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                        maxLines = 1
                    )
                }

                Spacer(modifier = Modifier.height(2.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    // Quick -1
                    Surface(
                        onClick = { onQuickReduceStock(1.0) },
                        shape = CircleShape,
                        color = Color(0xFFE5E7EB),
                        modifier = Modifier.size(20.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Remove, contentDescription = "-1", tint = InkDark, modifier = Modifier.size(12.dp))
                        }
                    }

                    // Quick +1
                    Surface(
                        onClick = { onQuickAddStock(1.0) },
                        shape = CircleShape,
                        color = OrangeLight,
                        modifier = Modifier.size(20.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Add, contentDescription = "+1", tint = OrangePrimary, modifier = Modifier.size(12.dp))
                        }
                    }
                }
            }

            // Price & Gross Margin
            Column(
                modifier = Modifier.weight(1.4f),
                horizontalAlignment = Alignment.End
            ) {
                Text(
                    text = ReceiptGenerator.formatMoney(product.sellingPrice, shopProfile),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = OrangePrimary,
                    maxLines = 1
                )
                Text(
                    text = Localization.format("inv_pct_profit_fmt", language, product.profitMarginPercent.toInt()),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = ProfitGreen
                )
            }

            // Actions Menu
            Row(
                modifier = Modifier.width(100.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onAdjust,
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(Icons.Default.Inventory, contentDescription = Localization.get("restock", language), tint = OrangePrimary, modifier = Modifier.size(16.dp))
                }
                IconButton(
                    onClick = onEdit,
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(Icons.Default.Edit, contentDescription = Localization.get("edit", language), tint = InkDark, modifier = Modifier.size(16.dp))
                }
                IconButton(
                    onClick = onDelete,
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(Icons.Default.Delete, contentDescription = Localization.get("inv_delete_product_cd", language), tint = LossRed, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

@Composable
fun ProductFormDialog(
    initialProduct: Product?,
    categories: List<String>,
    shopProfile: ShopProfile,
    language: AppLanguage = AppLanguage.ENGLISH,
    onSave: (Product) -> Unit,
    onDelete: (() -> Unit)? = null,
    onDismiss: () -> Unit
) {
    val categoryOptions = remember(shopProfile.businessType, categories, initialProduct?.category) {
        BusinessCatalog.categoriesWithExisting(
            shopProfile.businessType,
            categories + listOfNotNull(initialProduct?.category)
        )
    }
    val unitOptions = remember(shopProfile.businessType, initialProduct?.unit) {
        BusinessCatalog.unitsForShop(shopProfile.businessType, initialProduct?.unit.orEmpty())
    }
    var name by remember { mutableStateOf(initialProduct?.name ?: "") }
    var category by remember(initialProduct?.id, shopProfile.businessType) {
        mutableStateOf(initialProduct?.category ?: BusinessCatalog.categoriesForShop(shopProfile.businessType).first())
    }
    var costPriceStr by remember { mutableStateOf(if (initialProduct != null && initialProduct.costPrice > 0) "${initialProduct.costPrice.toInt()}" else "") }
    var sellingPriceStr by remember { mutableStateOf(if (initialProduct != null && initialProduct.sellingPrice > 0) "${initialProduct.sellingPrice.toInt()}" else "") }
    var quantityStr by remember { mutableStateOf(if (initialProduct != null) "${initialProduct.quantityInStock.toInt()}" else "10") }
    var lowThresholdStr by remember { mutableStateOf(if (initialProduct != null) "${initialProduct.lowStockThreshold.toInt()}" else "5") }
    var unit by remember(initialProduct?.id, shopProfile.businessType) {
        mutableStateOf(initialProduct?.unit ?: BusinessCatalog.defaultUnit(shopProfile.businessType))
    }
    var categoryMenuExpanded by remember { mutableStateOf(false) }
    var unitMenuExpanded by remember { mutableStateOf(false) }
    var barcode by remember { mutableStateOf(initialProduct?.barcode ?: "") }

    val cost = costPriceStr.toDoubleOrNull() ?: 0.0
    val selling = sellingPriceStr.toDoubleOrNull() ?: 0.0
    val profitPerUnit = selling - cost
    val marginPct = if (selling > 0) (profitPerUnit / selling) * 100.0 else 0.0

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = Localization.get(if (initialProduct != null) "inv_form_edit_title" else "inv_form_add_title", language),
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = InkDark
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = Localization.get("close", language), tint = InkDark)
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(Localization.get("inv_form_name", language)) },
                    placeholder = { Text("Inyange Milk 500ml") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                Box(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = category,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(Localization.get("inv_form_category", language)) },
                        trailingIcon = {
                            IconButton(onClick = { categoryMenuExpanded = true }) {
                                Icon(Icons.Default.FilterList, contentDescription = "Choose category")
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true
                    )
                    DropdownMenu(
                        expanded = categoryMenuExpanded,
                        onDismissRequest = { categoryMenuExpanded = false },
                        modifier = Modifier.heightIn(max = 320.dp)
                    ) {
                        categoryOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    category = option
                                    categoryMenuExpanded = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = costPriceStr,
                    onValueChange = { costPriceStr = it },
                    label = { Text(Localization.format("inv_form_cost_fmt", language, shopProfile.currencySymbol)) },
                    placeholder = { Text("450") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = sellingPriceStr,
                    onValueChange = { sellingPriceStr = it },
                    label = { Text(Localization.format("inv_form_sell_fmt", language, shopProfile.currencySymbol)) },
                    placeholder = { Text("600") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                // Profit Preview Box
                if (selling > 0) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFDCFCE7),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(Localization.format("inv_form_est_profit_fmt", language, ReceiptGenerator.formatMoney(profitPerUnit, shopProfile)), fontSize = 12.5.sp, color = ProfitGreen, fontWeight = FontWeight.Bold)
                            Text(Localization.format("inv_form_margin_fmt", language, marginPct.toInt()), fontSize = 12.5.sp, color = ProfitGreen, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = quantityStr,
                    onValueChange = { quantityStr = it },
                    label = { Text(Localization.get("inv_form_avail_qty", language)) },
                    placeholder = { Text("10") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                Box(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = unit,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(Localization.get("inv_form_unit", language)) },
                        trailingIcon = {
                            IconButton(onClick = { unitMenuExpanded = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "Choose unit")
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true
                    )
                    DropdownMenu(
                        expanded = unitMenuExpanded,
                        onDismissRequest = { unitMenuExpanded = false },
                        modifier = Modifier.heightIn(max = 320.dp)
                    ) {
                        unitOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    unit = option
                                    unitMenuExpanded = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = lowThresholdStr,
                    onValueChange = { lowThresholdStr = it },
                    label = { Text(Localization.get("inv_form_min_level", language)) },
                    placeholder = { Text("5") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                var showBarcodeScannerForForm by remember { mutableStateOf(false) }

                OutlinedTextField(
                    value = barcode,
                    onValueChange = { barcode = it },
                    label = { Text(Localization.get("inv_form_barcode_num", language)) },
                    placeholder = { Text("616123456789") },
                    trailingIcon = {
                        IconButton(onClick = { showBarcodeScannerForForm = true }) {
                            Icon(Icons.Filled.QrCodeScanner, contentDescription = Localization.get("pos_camera_scan_btn", language), tint = OrangePrimary)
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                if (showBarcodeScannerForForm) {
                    com.beboss.shopmgmt.ui.components.CameraBarcodeScannerDialog(
                        products = emptyList(),
                        language = language,
                        onProductScanned = {},
                        onBarcodeScanned = { scanned ->
                            barcode = scanned
                            showBarcodeScannerForForm = false
                        },
                        onDismiss = { showBarcodeScannerForForm = false }
                    )
                }

                Spacer(modifier = Modifier.height(18.dp))

                Button(
                    onClick = {
                        if (name.isNotBlank()) {
                            val p = Product(
                                id = initialProduct?.id ?: UUID.randomUUID().toString(),
                                name = name.trim(),
                                category = category.trim().ifBlank { "General" },
                                costPrice = costPriceStr.toDoubleOrNull() ?: 0.0,
                                sellingPrice = sellingPriceStr.toDoubleOrNull() ?: 0.0,
                                quantityInStock = quantityStr.toDoubleOrNull() ?: 0.0,
                                lowStockThreshold = lowThresholdStr.toDoubleOrNull() ?: 5.0,
                                unit = unit.trim().ifBlank { "pcs" },
                                barcode = barcode.trim(),
                                createdAt = initialProduct?.createdAt ?: System.currentTimeMillis()
                            )
                            onSave(p)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                    shape = RoundedCornerShape(12.dp),
                    enabled = name.isNotBlank()
                ) {
                    Text(Localization.get("inv_form_save_sheet", language), fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }

                if (initialProduct != null && onDelete != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = onDelete,
                        modifier = Modifier.fillMaxWidth().height(44.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = LossRed)
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = null, tint = LossRed, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(Localization.get("inv_form_delete_stock", language), color = LossRed, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun StockAdjustDialog(
    product: Product,
    shopProfile: ShopProfile,
    language: AppLanguage = AppLanguage.ENGLISH,
    onConfirm: (Double, String) -> Unit,
    onDismiss: () -> Unit
) {
    var deltaStr by remember { mutableStateOf("10") }
    var isAddition by remember { mutableStateOf(true) }
    val defaultReason = Localization.get("inv_adj_default_reason", language)
    var reason by remember(language) { mutableStateOf(defaultReason) }

    val delta = (deltaStr.toDoubleOrNull() ?: 0.0) * (if (isAddition) 1 else -1)
    val resultingStock = (product.quantityInStock + delta).coerceAtLeast(0.0)

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = Localization.get("inv_adj_title", language),
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = InkDark
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = product.name,
                    fontSize = 13.sp,
                    color = OrangePrimary,
                    fontWeight = FontWeight.SemiBold
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Add or Deduct Mode
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        onClick = { isAddition = true },
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = if (isAddition) ProfitGreen else Color(0xFFF3F4F6)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(Localization.get("inv_adj_add_mode", language), fontWeight = FontWeight.Bold, color = if (isAddition) Color.White else InkDark)
                        }
                    }

                    Surface(
                        onClick = { isAddition = false },
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = if (!isAddition) LossRed else Color(0xFFF3F4F6)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(Localization.get("inv_adj_loss_mode", language), fontWeight = FontWeight.Bold, color = if (!isAddition) Color.White else InkDark)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                OutlinedTextField(
                    value = deltaStr,
                    onValueChange = { deltaStr = it },
                    label = { Text(Localization.format("inv_adj_qty_fmt", language, product.unit)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Preset delta chips
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("5", "10", "20", "50", "100").forEach { preset ->
                        Surface(
                            onClick = { deltaStr = preset },
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFF3F4F6)
                        ) {
                            Text("+$preset", fontSize = 12.sp, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), color = InkDark)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text(Localization.get("inv_adj_reason", language)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Stock change preview box
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFF9FAFB),
                    modifier = Modifier.fillMaxWidth(),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(Localization.get("inv_adj_current_stock", language), fontSize = 11.sp, color = InkMedium)
                            Text("${product.quantityInStock.toInt()} ${product.unit}", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(Localization.get("inv_adj_new_stock", language), fontSize = 11.sp, color = InkMedium)
                            Text(
                                "${resultingStock.toInt()} ${product.unit}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = if (resultingStock <= product.lowStockThreshold) LossRed else ProfitGreen
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

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
                            val parsed = deltaStr.toDoubleOrNull() ?: 0.0
                            if (parsed > 0) {
                                onConfirm(if (isAddition) parsed else -parsed, reason)
                            }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(Localization.get("inv_adj_confirm", language), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
