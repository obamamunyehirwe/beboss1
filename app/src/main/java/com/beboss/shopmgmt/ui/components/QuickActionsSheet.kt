package com.beboss.shopmgmt.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Money
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleWithItems
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.InkDark
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.Localization
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickSpeedDialSheet(
    language: AppLanguage,
    onDismiss: () -> Unit,
    onQuickCustomSale: () -> Unit,
    onQuickAddProduct: () -> Unit,
    onQuickNewCustomer: () -> Unit,
    onUniversalSearch: () -> Unit,
    onShareDailySummary: () -> Unit,
    onViewLastReceipt: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val haptic = LocalHapticFeedback.current

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp)
                .padding(bottom = 24.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(OrangePrimary.copy(alpha = 0.15f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Bolt, contentDescription = null, tint = OrangePrimary)
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = Localization.get("quick_actions", language),
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = Localization.get("close", language), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Grid of powerful retail actions
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    QuickActionCard(
                        title = Localization.get("quick_custom_sale", language),
                        subtitle = Localization.get("qa_custom_sale_sub", language),
                        icon = Icons.Default.PointOfSale,
                        iconBg = OrangePrimary,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onDismiss()
                            onQuickCustomSale()
                        }
                    )

                    QuickActionCard(
                        title = Localization.get("quick_universal_search", language),
                        subtitle = Localization.get("qa_universal_search_sub", language),
                        icon = Icons.Default.Search,
                        iconBg = Color(0xFF2563EB),
                        modifier = Modifier.weight(1f),
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onDismiss()
                            onUniversalSearch()
                        }
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    QuickActionCard(
                        title = Localization.get("quick_add_product", language),
                        subtitle = Localization.get("qa_add_product_sub", language),
                        icon = Icons.Default.Inventory2,
                        iconBg = ProfitGreen,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onDismiss()
                            onQuickAddProduct()
                        }
                    )

                    QuickActionCard(
                        title = Localization.get("quick_new_customer", language),
                        subtitle = Localization.get("qa_new_customer_sub", language),
                        icon = Icons.Default.People,
                        iconBg = Color(0xFF8B5CF6),
                        modifier = Modifier.weight(1f),
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onDismiss()
                            onQuickNewCustomer()
                        }
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    QuickActionCard(
                        title = Localization.get("send_daily_whatsapp", language),
                        subtitle = Localization.get("qa_daily_whatsapp_sub", language),
                        icon = Icons.Default.Share,
                        iconBg = Color(0xFF10B981),
                        modifier = Modifier.weight(1f),
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onDismiss()
                            onShareDailySummary()
                        }
                    )

                    QuickActionCard(
                        title = Localization.get("view_last_receipt", language),
                        subtitle = Localization.get("qa_last_receipt_sub", language),
                        icon = Icons.Default.Receipt,
                        iconBg = Color(0xFF0F172A),
                        modifier = Modifier.weight(1f),
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onDismiss()
                            onViewLastReceipt()
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickActionCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    iconBg: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Card(
        modifier = modifier
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(iconBg, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = subtitle,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
fun QuickCustomSaleDialog(
    currency: String,
    language: AppLanguage,
    onDismiss: () -> Unit,
    onCompleteQuickSale: (description: String, amount: Double, paymentMethod: String, isDirectCheckout: Boolean) -> Unit
) {
    var amountInput by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var selectedMethod by remember { mutableStateOf("CASH") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val haptic = LocalHapticFeedback.current

    val presets = listOf(500, 1000, 2000, 5000, 10000)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(OrangePrimary, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Bolt, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = Localization.get("quick_custom_sale", language),
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp
                )
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = Localization.get("qa_quick_sale_subtitle", language),
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                errorMessage?.let { err ->
                    Text(err, color = LossRed, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }

                // Amount input field
                OutlinedTextField(
                    value = amountInput,
                    onValueChange = {
                        if (it.all { c -> c.isDigit() }) {
                            amountInput = it
                            errorMessage = null
                        }
                    },
                    label = { Text("${Localization.get("enter_amount_rwf", language)} ($currency) *") },
                    placeholder = { Text(Localization.get("qa_amount_example", language)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )

                // Quick preset buttons (+500, +1k, +2k, +5k, +10k)
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(presets) { preset ->
                        Surface(
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                val current = amountInput.toDoubleOrNull() ?: 0.0
                                amountInput = (current + preset).toInt().toString()
                            },
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant
                        ) {
                            Text(
                                text = "+${preset / 1000}k",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = OrangePrimary,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                            )
                        }
                    }
                }

                // Description field
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text(Localization.get("item_description_optional", language)) },
                    placeholder = { Text(Localization.get("qa_item_example", language)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )

                // Payment Method Selector
                Text(Localization.get("qa_payment_method_colon", language), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf(
                        "CASH" to Localization.get("qa_method_cash", language),
                        "MTN_MOMO" to Localization.get("qa_method_momo", language),
                        "AIRTEL_MONEY" to Localization.get("qa_method_airtel", language),
                        "CREDIT_DEBT" to Localization.get("qa_method_debt", language)
                    ).forEach { (method, label) ->
                        val isSelected = selectedMethod == method
                        Surface(
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                selectedMethod = method
                            },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) OrangePrimary else MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier.weight(1f)
                        ) {
                            Box(
                                modifier = Modifier.padding(vertical = 8.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 11.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val amt = amountInput.toDoubleOrNull()
                    if (amt == null || amt <= 0) {
                        errorMessage = Localization.get("qa_err_valid_amount", language)
                    } else {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onCompleteQuickSale(description, amt, selectedMethod, true)
                        onDismiss()
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(Localization.get("add_and_checkout", language), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            OutlinedButton(
                onClick = {
                    val amt = amountInput.toDoubleOrNull()
                    if (amt == null || amt <= 0) {
                        errorMessage = Localization.get("qa_err_valid_amount", language)
                    } else {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onCompleteQuickSale(description, amt, selectedMethod, false)
                        onDismiss()
                    }
                },
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(Localization.get("add_to_cart_action", language), fontSize = 12.sp)
            }
        }
    )
}

@Composable
fun UniversalSearchDialog(
    products: List<Product>,
    customers: List<Customer>,
    sales: List<Sale>,
    purchases: List<com.beboss.shopmgmt.data.model.PurchaseRecord> = emptyList(),
    shopProfile: ShopProfile,
    language: AppLanguage,
    onDismiss: () -> Unit,
    onAddToCart: (Product) -> Unit,
    onOpenReceipt: (String) -> Unit,
    onSelectCustomer: (Customer) -> Unit,
    onQuickRestock: ((Product) -> Unit)? = null
) {
    var query by remember { mutableStateOf("") }
    var selectedFilter by remember { mutableStateOf("ALL") } // ALL, PRODUCTS, CUSTOMERS, SALES, PURCHASES
    val haptic = LocalHapticFeedback.current

    val filteredProducts = remember(query, products) {
        if (query.isBlank()) products.take(15)
        else products.filter {
            it.name.contains(query, ignoreCase = true) ||
            it.barcode.contains(query, ignoreCase = true) ||
            it.category.contains(query, ignoreCase = true)
        }
    }

    val filteredCustomers = remember(query, customers) {
        if (query.isBlank()) customers.take(15)
        else customers.filter {
            it.name.contains(query, ignoreCase = true) ||
            it.phone.contains(query, ignoreCase = true) ||
            it.city.contains(query, ignoreCase = true)
        }
    }

    val filteredSales = remember(query, sales) {
        if (query.isBlank()) sales.take(15)
        else sales.filter {
            it.customerName.contains(query, ignoreCase = true) ||
            it.receiptNumber.contains(query, ignoreCase = true) ||
            it.id.contains(query, ignoreCase = true) ||
            it.notes.contains(query, ignoreCase = true)
        }
    }

    val filteredPurchases = remember(query, purchases) {
        if (query.isBlank()) purchases.take(15)
        else purchases.filter {
            it.productName.contains(query, ignoreCase = true) ||
            it.supplierName.contains(query, ignoreCase = true) ||
            it.invoiceNumber.contains(query, ignoreCase = true)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = CircleShape,
                            color = OrangePrimary.copy(alpha = 0.15f),
                            modifier = Modifier.size(32.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Search, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(18.dp))
                            }
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = Localization.get("search_dialog_title", language),
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Default.Close, contentDescription = Localization.get("close", language), modifier = Modifier.size(18.dp))
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text(Localization.get("search_placeholder", language), fontSize = 12.sp) },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(18.dp)) },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { query = "" }) {
                                Icon(Icons.Default.Close, contentDescription = Localization.get("search_clear_cd", language), modifier = Modifier.size(16.dp))
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Filter Tabs Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    val totalCount = filteredProducts.size + filteredCustomers.size + filteredSales.size + filteredPurchases.size
                    listOf(
                        "ALL" to Localization.format("search_pill_all_fmt", language, totalCount),
                        "PRODUCTS" to Localization.format("search_pill_stock_fmt", language, filteredProducts.size),
                        "CUSTOMERS" to Localization.format("search_pill_people_fmt", language, filteredCustomers.size),
                        "SALES" to Localization.format("search_pill_sales_fmt", language, filteredSales.size),
                        "PURCHASES" to Localization.format("search_pill_inflow_fmt", language, filteredPurchases.size)
                    ).forEach { (tab, label) ->
                        val isSelected = selectedFilter == tab
                        Surface(
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                selectedFilter = tab
                            },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) OrangePrimary.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant
                        ) {
                            Text(
                                text = label,
                                fontSize = 9.5.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) OrangePrimary else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }
        },
        text = {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(350.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Products Section
                if (selectedFilter == "ALL" || selectedFilter == "PRODUCTS") {
                    if (filteredProducts.isNotEmpty()) {
                        item {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Inventory2, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(Localization.get("search_header_products", language), fontWeight = FontWeight.Bold, fontSize = 12.sp, color = OrangePrimary)
                            }
                        }
                        items(filteredProducts) { product ->
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(product.name, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        Text(
                                            Localization.format(
                                                "search_in_stock_fmt",
                                                language,
                                                product.sellingPrice.toInt(),
                                                shopProfile.currencySymbol,
                                                product.quantityInStock.toInt()
                                            ),
                                            fontSize = 11.sp,
                                            color = if (product.quantityInStock <= 0) LossRed else MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        if (product.quantityInStock <= 0 && onQuickRestock != null) {
                                            OutlinedButton(
                                                onClick = {
                                                    onQuickRestock(product)
                                                    onDismiss()
                                                },
                                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                                                shape = RoundedCornerShape(6.dp)
                                            ) {
                                                Text(Localization.get("search_restock_btn", language), fontSize = 10.sp, color = DarkNavy)
                                            }
                                        }
                                        Button(
                                            onClick = {
                                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                                onAddToCart(product)
                                                onDismiss()
                                            },
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                            shape = RoundedCornerShape(6.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary)
                                        ) {
                                            Text(
                                                if (product.quantityInStock <= 0) Localization.get("search_backorder_btn", language)
                                                else Localization.get("search_sell_btn", language),
                                                fontSize = 10.5.sp
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Customers Section
                if (selectedFilter == "ALL" || selectedFilter == "CUSTOMERS") {
                    if (filteredCustomers.isNotEmpty()) {
                        item {
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.People, contentDescription = null, tint = Color(0xFF2563EB), modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(Localization.get("search_header_customers", language), fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF2563EB))
                            }
                        }
                        items(filteredCustomers) { customer ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        onSelectCustomer(customer)
                                        onDismiss()
                                    },
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(customer.name, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        Text(
                                            customer.phone.ifBlank { Localization.get("search_no_phone", language) },
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    if (customer.debtBalance > 0) {
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = LossRed.copy(alpha = 0.15f)
                                        ) {
                                            Text(
                                                Localization.format("search_debt_fmt", language, customer.debtBalance.toInt(), shopProfile.currencySymbol),
                                                color = LossRed,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 10.sp,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Sales History Section
                if (selectedFilter == "ALL" || selectedFilter == "SALES") {
                    if (filteredSales.isNotEmpty()) {
                        item {
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(Localization.get("search_header_sales", language), fontWeight = FontWeight.Bold, fontSize = 12.sp, color = ProfitGreen)
                            }
                        }
                        items(filteredSales) { s ->
                            val dateStr = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault()).format(Date(s.saleDate))
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        onOpenReceipt(s.id)
                                        onDismiss()
                                    },
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("${s.totalAmount.toInt()} ${shopProfile.currencySymbol}", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        Text(
                                            "${s.customerName} • $dateStr • ${s.receiptNumber}",
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Icon(Icons.Default.Receipt, contentDescription = Localization.get("search_header_sales", language), tint = ProfitGreen, modifier = Modifier.size(20.dp))
                                }
                            }
                        }
                    }
                }

                // Purchases Section
                if (selectedFilter == "ALL" || selectedFilter == "PURCHASES") {
                    if (filteredPurchases.isNotEmpty()) {
                        item {
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.ShoppingCart, contentDescription = null, tint = DarkNavy, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(Localization.get("search_header_purchases", language), fontWeight = FontWeight.Bold, fontSize = 12.sp, color = DarkNavy)
                            }
                        }
                        items(filteredPurchases) { p ->
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("${p.quantityPurchased.toInt()}x ${p.productName}", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        Text(
                                            Localization.format("search_vendor_total_fmt", language, p.supplierName, p.totalPurchaseCost.toInt(), shopProfile.currencySymbol),
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            OutlinedButton(onClick = onDismiss) {
                Text(Localization.get("close", language))
            }
        }
    )
}
