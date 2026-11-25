package com.beboss.shopmgmt.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.beboss.shopmgmt.util.safeMessage
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.MoneyOff
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.Warning
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
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerAgingEntry
import com.beboss.shopmgmt.data.model.CustomerAgingSummary
import com.beboss.shopmgmt.data.model.CustomerCategory
import com.beboss.shopmgmt.data.model.CustomerPayment
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.User
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
import com.beboss.shopmgmt.util.ContactsHelper
import com.beboss.shopmgmt.util.ExcelCsvExporter
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.PdfReportGenerator
import com.beboss.shopmgmt.util.PickedContactInfo
import com.beboss.shopmgmt.util.ReceiptGenerator
import com.beboss.shopmgmt.util.SmsHelper
import java.util.UUID

enum class CustomerSortField {
    NAME, DEBT, CREDIT_LIMIT, CATEGORY
}

@Composable
fun CustomersScreen(
    customers: List<Customer>,
    totalOutstandingDebt: Double,
    shopProfile: ShopProfile,
    currentUser: User? = null,
    customerAgingSummary: CustomerAgingSummary = CustomerAgingSummary(),
    allSales: List<Sale> = emptyList(),
    allPayments: List<CustomerPayment> = emptyList(),
    language: AppLanguage = AppLanguage.ENGLISH,
    onSaveCustomer: (Customer) -> Unit,
    onRecordPayment: (String, Double, String) -> Unit,
    onDeleteCustomer: (String) -> Unit,
    onClearAllCustomers: (() -> Unit)? = null,
    onExportAgingCsv: () -> Unit = {}
) {
    val context = LocalContext.current
    val canManageCustomers = currentUser?.canManageCustomers ?: true
    val canCollectDebt = currentUser?.canCollectDebt ?: true
    val canDeleteRecords = currentUser?.canDeleteRecords ?: true
    val canExportReports = currentUser?.canExportReports ?: true

    var searchQuery by rememberSaveable { mutableStateOf("") }
    var filterMode by rememberSaveable { mutableStateOf("ALL") } // ALL, OWES, OVERDUE_30, OVER_LIMIT
    var sortField by rememberSaveable { mutableStateOf(CustomerSortField.DEBT) }
    var sortAscending by rememberSaveable { mutableStateOf(false) }

    val agingMap = remember(customerAgingSummary) {
        customerAgingSummary.entries.associateBy { it.customerId }
    }

    var customerToEdit by remember { mutableStateOf<Customer?>(null) }
    var customerForPayment by remember { mutableStateOf<Customer?>(null) }
    var customerToDelete by remember { mutableStateOf<Customer?>(null) }
    var customerForReminder by remember { mutableStateOf<Customer?>(null) }
    var showClearAllCustomersDialog by remember { mutableStateOf(false) }
    var isAddingNew by remember { mutableStateOf(false) }
    var showBulkContactsDialog by remember { mutableStateOf(false) }

    val filtered = customers.filter { c ->
        val aging = agingMap[c.id]
        val matchesMode = when (filterMode) {
            "OWES" -> c.debtBalance > 0
            "OVERDUE_30" -> c.debtBalance > 0 && (aging?.daysOld ?: 0) >= 31
            "OVER_LIMIT" -> c.debtBalance > 0 && (aging?.overCreditLimit == true || (c.creditLimit > 0 && c.debtBalance > c.creditLimit))
            else -> true
        }
        val matchesSearch = searchQuery.isBlank() ||
                c.name.contains(searchQuery, ignoreCase = true) ||
                c.phone.contains(searchQuery, ignoreCase = true) ||
                c.category.contains(searchQuery, ignoreCase = true) ||
                c.city.contains(searchQuery, ignoreCase = true)
        matchesMode && matchesSearch
    }.let { list ->
        when (sortField) {
            CustomerSortField.NAME -> if (sortAscending) list.sortedBy { it.name.lowercase() } else list.sortedByDescending { it.name.lowercase() }
            CustomerSortField.DEBT -> if (sortAscending) list.sortedBy { it.debtBalance } else list.sortedByDescending { it.debtBalance }
            CustomerSortField.CREDIT_LIMIT -> if (sortAscending) list.sortedBy { it.creditLimit } else list.sortedByDescending { it.creditLimit }
            CustomerSortField.CATEGORY -> if (sortAscending) list.sortedBy { it.category } else list.sortedByDescending { it.category }
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(BackgroundLight)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Outstanding Debt KPI Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = if (totalOutstandingDebt > 0) Color(0xFFFEE2E2) else Color.White),
                    border = if (totalOutstandingDebt > 0) androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFCA5A5)) else null,
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = Localization.get("outstanding_debts", language).uppercase(),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (totalOutstandingDebt > 0) LossRed else InkMedium,
                                    letterSpacing = 0.5.sp
                                )
                                Spacer(modifier = Modifier.height(3.dp))
                                Text(
                                    text = ReceiptGenerator.formatMoney(totalOutstandingDebt, shopProfile),
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.Black,
                                    color = if (totalOutstandingDebt > 0) LossRed else ProfitGreen
                                )
                            }

                            Surface(
                                shape = CircleShape,
                                color = if (totalOutstandingDebt > 0) LossRed else ProfitGreen,
                                modifier = Modifier.size(40.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = if (totalOutstandingDebt > 0) Icons.Default.MoneyOff else Icons.Default.People,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // Action button row: Excel Export, AR Aging Export, Bulk Contacts Import
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            if (canExportReports) {
                                OutlinedButton(
                                    onClick = {
                                        try {
                                            val file = ExcelCsvExporter.exportCustomersCsv(context, customers, shopProfile)
                                            ExcelCsvExporter.shareCsvFile(context, file, Localization.get("cust_share_csv_title", language))
                                        } catch (e: Exception) {
                                            Toast.makeText(context, Localization.format("inv_export_err_fmt", language, e.safeMessage()), Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(8.dp),
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                                ) {
                                    Icon(Icons.Default.FileDownload, contentDescription = null, modifier = Modifier.size(14.dp), tint = OrangePrimary)
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text(Localization.get("export_excel_csv", language), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = OrangePrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }

                                if (customerAgingSummary.entries.isNotEmpty()) {
                                    OutlinedButton(
                                        onClick = onExportAgingCsv,
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                                    ) {
                                        Icon(Icons.Default.TableChart, contentDescription = null, modifier = Modifier.size(14.dp), tint = LossRed)
                                        Spacer(modifier = Modifier.width(3.dp))
                                        Text("AR Aging", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = LossRed, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                            }

                            if (canManageCustomers) {
                                OutlinedButton(
                                    onClick = { showBulkContactsDialog = true },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(8.dp),
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp)
                                ) {
                                    Icon(Icons.Default.Contacts, contentDescription = null, modifier = Modifier.size(14.dp), tint = DarkNavy)
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text(Localization.get("import_contacts", language), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = DarkNavy, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }

                            if (onClearAllCustomers != null && canDeleteRecords && customers.isNotEmpty()) {
                                OutlinedButton(
                                    onClick = { showClearAllCustomersDialog = true },
                                    modifier = Modifier.weight(0.9f),
                                    shape = RoundedCornerShape(8.dp),
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = LossRed)
                                ) {
                                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(14.dp), tint = LossRed)
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text(Localization.get("cust_clear_all_btn", language), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = LossRed, maxLines = 1)
                                }
                            }
                        }
                    }
                }
            }

            // Search and Filter Bar
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
                            placeholder = { Text(Localization.get("cust_search_long_hint", language), fontSize = 13.sp) },
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

                        val debtCount = customers.count { it.debtBalance > 0 }
                        val overdueCount = customerAgingSummary.entries.count { it.daysOld >= 31 }
                        val overLimitCount = customerAgingSummary.overLimitCount
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            FilterChip(
                                selected = filterMode == "ALL",
                                onClick = { filterMode = "ALL" },
                                label = { Text(Localization.format("cust_all_count_fmt", language, customers.size), fontSize = 11.sp) },
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = OrangePrimary, selectedLabelColor = Color.White),
                                shape = RoundedCornerShape(8.dp)
                            )
                            FilterChip(
                                selected = filterMode == "OWES",
                                onClick = { filterMode = "OWES" },
                                label = { Text(Localization.format("cust_owes_count_fmt", language, debtCount), fontSize = 11.sp) },
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = LossRed, selectedLabelColor = Color.White),
                                shape = RoundedCornerShape(8.dp)
                            )
                            if (overdueCount > 0) {
                                FilterChip(
                                    selected = filterMode == "OVERDUE_30",
                                    onClick = { filterMode = "OVERDUE_30" },
                                    label = { Text("31+ Days ($overdueCount)", fontSize = 11.sp) },
                                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = WarningAmber, selectedLabelColor = Color.White),
                                    shape = RoundedCornerShape(8.dp)
                                )
                            }
                            if (overLimitCount > 0) {
                                FilterChip(
                                    selected = filterMode == "OVER_LIMIT",
                                    onClick = { filterMode = "OVER_LIMIT" },
                                    label = { Text("Over Limit ($overLimitCount)", fontSize = 11.sp) },
                                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = LossRed, selectedLabelColor = Color.White),
                                    shape = RoundedCornerShape(8.dp)
                                )
                            }
                        }
                    }
                }
            }

            // Excel Customers Table Header
            item {
                ExcelCustomerTableHeaderRow(
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

            // Excel Customers List
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
                            Icon(Icons.Default.People, contentDescription = null, tint = InkMedium, modifier = Modifier.size(44.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(Localization.get("cust_empty_ledger", language), fontWeight = FontWeight.Bold, fontSize = 14.sp, color = InkDark)
                            Spacer(modifier = Modifier.height(10.dp))
                            if (canManageCustomers) {
                                Button(
                                    onClick = { isAddingNew = true },
                                    colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(Localization.get("cust_add_to_ledger_btn", language))
                                }
                            }
                        }
                    }
                }
            } else {
                itemsIndexed(filtered, key = { _, c -> c.id }) { index, customer ->
                    ExcelCustomerRow(
                        index = index + 1,
                        customer = customer,
                        agingEntry = agingMap[customer.id],
                        shopProfile = shopProfile,
                        language = language,
                        isEven = index % 2 == 0,
                        canManageCustomers = canManageCustomers,
                        canCollectDebt = canCollectDebt,
                        canDeleteRecords = canDeleteRecords,
                        onRecordPayment = { customerForPayment = customer },
                        onEdit = { customerToEdit = customer },
                        onDelete = { customerToDelete = customer },
                        onSendReminder = {
                            if (customer.phone.isNotBlank()) {
                                customerForReminder = customer
                            } else {
                                Toast.makeText(context, Localization.format("cust_no_phone_toast_fmt", language, customer.name), Toast.LENGTH_SHORT).show()
                            }
                        },
                        onGeneratePdf = {
                            try {
                                val customerSales = allSales.filter { it.customerId == customer.id }
                                val customerPaymentsList = allPayments.filter { it.customerId == customer.id }
                                val pdfFile = PdfReportGenerator.generateCustomerStatementPdf(
                                    context = context,
                                    customer = customer,
                                    sales = customerSales,
                                    payments = customerPaymentsList,
                                    profile = shopProfile
                                )
                                PdfReportGenerator.sharePdf(context, pdfFile, Localization.format("cust_statement_title_fmt", language, customer.name))
                            } catch (e: Exception) {
                                Toast.makeText(context, Localization.format("cust_stmt_err_fmt", language, e.safeMessage()), Toast.LENGTH_SHORT).show()
                            }
                        },
                        onCallPhone = {
                            if (customer.phone.isNotBlank()) {
                                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${customer.phone}"))
                                context.startActivity(dialIntent)
                            }
                        }
                    )
                }
            }

            item { Spacer(modifier = Modifier.height(76.dp)) }
        }

        // FAB to Add Customer
        if (canManageCustomers) {
            FloatingActionButton(
                onClick = { isAddingNew = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(20.dp),
                containerColor = OrangePrimary,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(modifier = Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Add, contentDescription = Localization.get("add_customer", language))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(Localization.get("add_customer", language), fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    // Add / Edit Customer Dialog
    if (isAddingNew || customerToEdit != null) {
        CustomerFormDialog(
            initialCustomer = customerToEdit,
            shopProfile = shopProfile,
            language = language,
            onSave = { c ->
                onSaveCustomer(c)
                isAddingNew = false
                customerToEdit = null
            },
            onDelete = if (customerToEdit != null) {
                {
                    val toDelete = customerToEdit
                    customerToEdit = null
                    customerToDelete = toDelete
                }
            } else null,
            onDismiss = {
                isAddingNew = false
                customerToEdit = null
            }
        )
    }

    // Record Debt Payment Dialog
    customerForPayment?.let { paymentCustomer ->
        RecordDebtPaymentDialog(
            customer = paymentCustomer,
            shopProfile = shopProfile,
            language = language,
            onConfirm = { amount, method ->
                onRecordPayment(paymentCustomer.id, amount, method)
                customerForPayment = null
            },
            onDismiss = { customerForPayment = null }
        )
    }

    // Reminder Channel Dialog (WhatsApp Branded Logo Card vs Direct SMS)
    customerForReminder?.let { target ->
        AlertDialog(
            onDismissRequest = { customerForReminder = null },
            title = { Text("💬 Remind ${target.name}", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
            text = {
                Text(
                    text = if (target.debtBalance > 0) {
                        "Send official branded balance card (${ReceiptGenerator.formatMoney(target.debtBalance, shopProfile)}) via WhatsApp with shop logo, or send direct SMS."
                    } else {
                        "Send thank-you notice with BeBoss branded card via WhatsApp or direct SMS."
                    },
                    fontSize = 12.5.sp,
                    color = InkMedium
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        customerForReminder = null
                        sendDebtReminderWhatsAppCard(context, target, shopProfile, language)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen)
                ) {
                    Text("💬 WhatsApp Card (Logo)", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedButton(onClick = { customerForReminder = null }) {
                        Text(Localization.get("cancel", language), fontSize = 11.5.sp)
                    }
                    OutlinedButton(
                        onClick = {
                            customerForReminder = null
                            sendDebtReminder(context, target, shopProfile, language)
                        }
                    ) {
                        Text("📱 SMS", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        )
    }

    // Bulk Phone Contacts Import Dialog (NO auto-select all — user chooses & can edit before adding)
    if (showBulkContactsDialog) {
        BulkContactsImportDialog(
            language = language,
            onImport = { selectedContacts ->
                val knownPhones = customers
                    .map { ContactsHelper.normalizePhoneNumber(it.phone) }
                    .filter { it.isNotBlank() }
                    .toMutableSet()
                var importedCount = 0
                var skippedCount = 0

                selectedContacts.forEach { contact ->
                    val normalizedPhone = ContactsHelper.normalizePhoneNumber(contact.phone)
                    if (contact.name.isBlank() || normalizedPhone.isBlank() ||
                        !knownPhones.add(normalizedPhone)
                    ) {
                        skippedCount++
                    } else {
                        onSaveCustomer(
                            Customer(
                                id = UUID.randomUUID().toString(),
                                name = contact.name.trim(),
                                phone = contact.phone.trim(),
                                email = contact.email.trim(),
                                address = contact.address.trim(),
                                category = CustomerCategory.REGULAR.displayName,
                                creditLimit = 500000.0,
                                city = ""
                            )
                        )
                        importedCount++
                    }
                }
                showBulkContactsDialog = false
                val message = if (skippedCount > 0) {
                    "Added " + importedCount + " customer(s). Skipped " + skippedCount +
                        " duplicate or incomplete contact(s)."
                } else {
                    Localization.format("cust_imported_toast_fmt", language, importedCount)
                }
                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            },
            onPickAndEdit = { contact ->
                showBulkContactsDialog = false
                val normalizedPhone = ContactsHelper.normalizePhoneNumber(contact.phone)
                val existingCustomer = customers.firstOrNull {
                    normalizedPhone.isNotBlank() &&
                        ContactsHelper.normalizePhoneNumber(it.phone) == normalizedPhone
                }
                if (existingCustomer != null) {
                    customerToEdit = existingCustomer
                    Toast.makeText(
                        context,
                        "This phone number is already saved. Opened the existing customer.",
                        Toast.LENGTH_LONG
                    ).show()
                } else {
                    customerToEdit = Customer(
                        id = UUID.randomUUID().toString(),
                        name = contact.name,
                        phone = contact.phone,
                        email = contact.email,
                        address = contact.address,
                        category = CustomerCategory.REGULAR.displayName,
                        creditLimit = 500000.0,
                        city = ""
                    )
                }
            },
            onDismiss = { showBulkContactsDialog = false }
        )
    }

    // Delete Confirmation Dialog
    customerToDelete?.let { deleteTarget ->
        AlertDialog(
            onDismissRequest = { customerToDelete = null },
            title = { Text(Localization.get("cust_delete_cd", language), fontWeight = FontWeight.Bold) },
            text = { Text(Localization.format("cust_delete_confirm_msg_fmt", language, deleteTarget.name)) },
            confirmButton = {
                Button(
                    onClick = {
                        onDeleteCustomer(deleteTarget.id)
                        customerToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LossRed)
                ) {
                    Text(Localization.get("delete", language))
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { customerToDelete = null }) {
                    Text(Localization.get("cancel", language))
                }
            }
        )
    }

    // Clear All Customers Dialog
    if (showClearAllCustomersDialog) {
        AlertDialog(
            onDismissRequest = { showClearAllCustomersDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Delete, contentDescription = null, tint = LossRed)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(Localization.get("set_wipe_customers_title", language), fontWeight = FontWeight.Bold, color = LossRed)
                }
            },
            text = { Text(Localization.get("set_wipe_customers_msg", language)) },
            confirmButton = {
                Button(
                    onClick = {
                        showClearAllCustomersDialog = false
                        onClearAllCustomers?.invoke()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LossRed)
                ) {
                    Text(Localization.get("set_wipe_customers_confirm", language))
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { showClearAllCustomersDialog = false }) {
                    Text(Localization.get("cancel", language))
                }
            }
        )
    }
}

@Composable
private fun ExcelCustomerTableHeaderRow(
    sortField: CustomerSortField,
    sortAscending: Boolean,
    currencySymbol: String,
    language: AppLanguage,
    onSort: (CustomerSortField) -> Unit
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
                    .clickable { onSort(CustomerSortField.NAME) },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = Localization.get("cust_col_name_phone", language),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1
                )
                if (sortField == CustomerSortField.NAME) {
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
                    .clickable { onSort(CustomerSortField.DEBT) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End
            ) {
                Text(
                    text = Localization.format("cust_col_debt_fmt", language, currencySymbol),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1
                )
                if (sortField == CustomerSortField.DEBT) {
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
                modifier = Modifier.width(96.dp),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun ExcelCustomerRow(
    index: Int,
    customer: Customer,
    agingEntry: CustomerAgingEntry? = null,
    shopProfile: ShopProfile,
    language: AppLanguage,
    isEven: Boolean,
    canManageCustomers: Boolean = true,
    canCollectDebt: Boolean = true,
    canDeleteRecords: Boolean = true,
    onRecordPayment: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onSendReminder: () -> Unit,
    onGeneratePdf: () -> Unit,
    onCallPhone: () -> Unit
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
                .padding(horizontal = 8.dp, vertical = 8.dp),
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

            // Name + Phone + Category + Credit Utilization
            Column(
                modifier = Modifier
                    .weight(2.2f)
                    .clickable(enabled = canManageCustomers) { onEdit() }
            ) {
                Text(
                    text = customer.name,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = InkDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = Localization.customerCategoryLabel(customer.category, language),
                        fontSize = 10.sp,
                        color = OrangePrimary,
                        fontWeight = FontWeight.SemiBold
                    )
                    if (customer.phone.isNotBlank()) {
                        Text(
                            text = " • ${customer.phone}",
                            fontSize = 10.sp,
                            color = InkMedium,
                            maxLines = 1
                        )
                    }
                }
                if (customer.debtBalance > 0 && customer.creditLimit > 0) {
                    val ratio = (customer.debtBalance / customer.creditLimit).toFloat().coerceIn(0f, 1f)
                    val overLimit = customer.debtBalance > customer.creditLimit
                    Spacer(modifier = Modifier.height(3.dp))
                    LinearProgressIndicator(
                        progress = { ratio },
                        modifier = Modifier
                            .fillMaxWidth(0.9f)
                            .height(4.dp),
                        color = if (overLimit) LossRed else if (ratio >= 0.8f) WarningAmber else OrangePrimary,
                        trackColor = Color(0xFFE5E7EB)
                    )
                }
            }

            // Debt Column + AR Aging Badge
            Column(
                modifier = Modifier.weight(1.3f),
                horizontalAlignment = Alignment.End
            ) {
                if (customer.debtBalance > 0) {
                    Text(
                        text = ReceiptGenerator.formatMoney(customer.debtBalance, shopProfile),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        color = LossRed,
                        maxLines = 1
                    )
                    val badgeText = when {
                        agingEntry?.overCreditLimit == true || (customer.creditLimit > 0 && customer.debtBalance > customer.creditLimit) ->
                            "OVER LIMIT"
                        agingEntry != null -> agingEntry.bucketLabel
                        else -> Localization.get("cust_unpaid_debt", language)
                    }
                    Text(
                        text = badgeText,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (agingEntry != null && agingEntry.daysOld < 31 && !agingEntry.overCreditLimit) WarningAmber else LossRed
                    )
                } else {
                    Text(
                        text = Localization.get("cust_cleared_zero", language),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = ProfitGreen
                    )
                }
            }

            // Action Icons: Pay (if debt), Reminder, Call, Edit, Delete
            Row(
                modifier = Modifier.width(124.dp),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (customer.debtBalance > 0 && canCollectDebt) {
                    Surface(
                        onClick = onRecordPayment,
                        shape = RoundedCornerShape(6.dp),
                        color = ProfitGreen,
                        modifier = Modifier.size(26.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Payment, contentDescription = Localization.get("cust_pay_cd", language), tint = Color.White, modifier = Modifier.size(15.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(3.dp))
                }

                Surface(
                    onClick = onSendReminder,
                    shape = RoundedCornerShape(6.dp),
                    color = Color(0xFFDCFCE7),
                    modifier = Modifier.size(26.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Send, contentDescription = Localization.get("cust_reminder_cd", language), tint = ProfitGreen, modifier = Modifier.size(14.dp))
                    }
                }
                Spacer(modifier = Modifier.width(3.dp))

                if (customer.phone.isNotBlank()) {
                    Surface(
                        onClick = onCallPhone,
                        shape = RoundedCornerShape(6.dp),
                        color = Color(0xFFFFF0E6),
                        modifier = Modifier.size(26.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Call, contentDescription = Localization.get("cust_call_action_cd", language), tint = OrangePrimary, modifier = Modifier.size(14.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(3.dp))
                }

                if (canManageCustomers) {
                    Surface(
                        onClick = onEdit,
                        shape = RoundedCornerShape(6.dp),
                        color = Color(0xFFF3F4F6),
                        modifier = Modifier.size(26.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Edit, contentDescription = Localization.get("edit", language), tint = InkDark, modifier = Modifier.size(14.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(3.dp))
                }

                if (canDeleteRecords) {
                    Surface(
                        onClick = onDelete,
                        shape = RoundedCornerShape(6.dp),
                        color = Color(0xFFFEE2E2),
                        modifier = Modifier.size(26.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Delete, contentDescription = Localization.get("cust_delete_cd", language), tint = LossRed, modifier = Modifier.size(14.dp))
                        }
                    }
                }
            }
        }
    }
}

private fun sendDebtReminder(context: Context, customer: Customer, shopProfile: ShopProfile, language: AppLanguage) {
    val message = if (customer.debtBalance > 0) {
        Localization.format(
            "cust_reminder_sms_due_fmt",
            language,
            customer.name,
            shopProfile.shopName,
            ReceiptGenerator.formatMoney(customer.debtBalance, shopProfile)
        )
    } else {
        Localization.format(
            "cust_reminder_sms_thanks_fmt",
            language,
            customer.name,
            shopProfile.shopName
        )
    }

    SmsHelper.sendSmsOrOpenIntent(context, customer.phone, message, messageType = "DEBT_REMINDER")
}

private fun sendDebtReminderWhatsAppCard(
    context: Context,
    customer: Customer,
    shopProfile: ShopProfile,
    language: AppLanguage
) {
    val body = if (customer.debtBalance > 0) {
        "🧾 *${shopProfile.shopName.ifBlank { "BeBoss Store" }}* — Account Notice\n" +
            Localization.format(
                "cust_reminder_sms_due_fmt",
                language,
                customer.name,
                shopProfile.shopName,
                ReceiptGenerator.formatMoney(customer.debtBalance, shopProfile)
            )
    } else {
        "🙏 *${shopProfile.shopName.ifBlank { "BeBoss Store" }}*\n" +
            Localization.format(
                "cust_reminder_sms_thanks_fmt",
                language,
                customer.name,
                shopProfile.shopName
            )
    }
    try {
        val cardFile = com.beboss.shopmgmt.util.BrandedShareCardGenerator.generateCustomerDebtCardPng(
            context = context,
            customer = customer,
            profile = shopProfile
        )
        PdfReportGenerator.sendWhatsAppDirect(
            context = context,
            phone = customer.phone,
            message = body,
            attachmentFile = cardFile,
            mimeType = "image/png"
        )
    } catch (_: Exception) {
        PdfReportGenerator.sendWhatsAppDirect(context, customer.phone, body)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerFormDialog(
    initialCustomer: Customer?,
    shopProfile: ShopProfile,
    language: AppLanguage = AppLanguage.ENGLISH,
    onSave: (Customer) -> Unit,
    onDelete: (() -> Unit)? = null,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var name by remember { mutableStateOf(initialCustomer?.name ?: "") }
    var phone by remember { mutableStateOf(initialCustomer?.phone ?: "") }
    var email by remember { mutableStateOf(initialCustomer?.email ?: "") }
    var address by remember { mutableStateOf(initialCustomer?.address ?: "") }
    var city by remember { mutableStateOf(initialCustomer?.city ?: "") }
    var category by remember { mutableStateOf(initialCustomer?.category ?: CustomerCategory.REGULAR.displayName) }
    var creditLimitStr by remember { mutableStateOf(initialCustomer?.creditLimit?.toInt()?.toString() ?: "500000") }
    var notes by remember { mutableStateOf(initialCustomer?.notes ?: "") }
    var debtStr by remember { mutableStateOf(if (initialCustomer != null && initialCustomer.debtBalance > 0) "${initialCustomer.debtBalance.toInt()}" else "") }

    var categoryExpanded by remember { mutableStateOf(false) }

    // Contact picker launcher from device address book
    val contactPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickContact()
    ) { uri: Uri? ->
        if (uri != null) {
            val contact = ContactsHelper.extractContactDetails(context, uri)
            if (contact != null) {
                name = contact.name
                if (contact.phone.isNotBlank()) phone = contact.phone
                if (contact.email.isNotBlank()) email = contact.email
                if (contact.address.isNotBlank()) address = contact.address
                Toast.makeText(context, Localization.format("cust_imported_one_toast_fmt", language, contact.name), Toast.LENGTH_SHORT).show()
            }
        }
    }

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
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (initialCustomer != null) Localization.get("cust_form_edit_title", language) else Localization.get("cust_form_add_title", language),
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = InkDark
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = Localization.get("close", language), tint = InkDark)
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Quick Import from Phonebook Contacts
                OutlinedButton(
                    onClick = { contactPickerLauncher.launch(null) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Default.Contacts, contentDescription = null, modifier = Modifier.size(16.dp), tint = OrangePrimary)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(Localization.get("cust_autofill_contacts", language), fontSize = 12.sp, color = OrangePrimary, fontWeight = FontWeight.SemiBold)
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(Localization.get("cust_name_label", language)) },
                    placeholder = { Text("Jeanne Uwase") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text(Localization.get("cust_phone_wa_label", language)) },
                    placeholder = { Text("+250 788 123 456") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Category Dropdown
                ExposedDropdownMenuBox(
                    expanded = categoryExpanded,
                    onExpandedChange = { categoryExpanded = it }
                ) {
                    OutlinedTextField(
                        value = Localization.customerCategoryLabel(category, language),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(Localization.get("cust_category_label", language)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        shape = RoundedCornerShape(10.dp)
                    )
                    ExposedDropdownMenu(
                        expanded = categoryExpanded,
                        onDismissRequest = { categoryExpanded = false }
                    ) {
                        CustomerCategory.values().forEach { cat ->
                            DropdownMenuItem(
                                text = { Text(Localization.customerCategoryLabel(cat.displayName, language)) },
                                onClick = {
                                    category = cat.displayName
                                    categoryExpanded = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = city,
                    onValueChange = { city = it },
                    label = { Text(Localization.get("cust_city_label", language)) },
                    placeholder = { Text("Kigali") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = debtStr,
                    onValueChange = { debtStr = it },
                    label = { Text(Localization.format("cust_init_debt_fmt", language, shopProfile.currencySymbol)) },
                    placeholder = { Text("0") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text(Localization.get("cust_address_label", language)) },
                    placeholder = { Text("Kimironko, Stall 12") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text(Localization.get("cust_notes_label", language)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(18.dp))

                Button(
                    onClick = {
                        if (name.isNotBlank()) {
                            val c = Customer(
                                id = initialCustomer?.id ?: UUID.randomUUID().toString(),
                                name = name.trim(),
                                phone = phone.trim(),
                                email = email.trim(),
                                address = address.trim(),
                                city = city.trim(),
                                category = category,
                                creditLimit = creditLimitStr.toDoubleOrNull() ?: 500000.0,
                                notes = notes.trim(),
                                debtBalance = debtStr.toDoubleOrNull() ?: 0.0,
                                createdAt = initialCustomer?.createdAt ?: System.currentTimeMillis(),
                                updatedAt = System.currentTimeMillis()
                            )
                            onSave(c)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                    shape = RoundedCornerShape(12.dp),
                    enabled = name.isNotBlank()
                ) {
                    Text(Localization.get("cust_save_profile_btn", language), fontWeight = FontWeight.Bold)
                }

                if (initialCustomer != null && onDelete != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = onDelete,
                        modifier = Modifier.fillMaxWidth().height(44.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = LossRed)
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = null, tint = LossRed, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(Localization.get("cust_delete_from_system", language), color = LossRed, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun RecordDebtPaymentDialog(
    customer: Customer,
    shopProfile: ShopProfile,
    language: AppLanguage = AppLanguage.ENGLISH,
    onConfirm: (Double, String) -> Unit,
    onDismiss: () -> Unit
) {
    var amountStr by remember { mutableStateOf("${customer.debtBalance.toInt()}") }
    var paymentMethod by remember { mutableStateOf("CASH") }
    val parsedAmount = amountStr.toDoubleOrNull() ?: 0.0
    val remainingDebt = (customer.debtBalance - parsedAmount).coerceAtLeast(0.0)

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    text = Localization.get("cust_debt_dialog_title", language),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = InkDark
                )
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = Localization.format("cust_debt_customer_fmt", language, customer.name),
                    fontSize = 13.sp,
                    color = OrangePrimary,
                    fontWeight = FontWeight.SemiBold
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Current Debt Box
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFFEE2E2),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(Localization.get("cust_debt_total_label", language), fontSize = 12.sp, color = LossRed, fontWeight = FontWeight.Medium)
                        Text(
                            ReceiptGenerator.formatMoney(customer.debtBalance, shopProfile),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = LossRed
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = amountStr,
                    onValueChange = { amountStr = it },
                    label = { Text(Localization.format("cust_debt_paid_label_fmt", language, shopProfile.currencySymbol)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Quick buttons: Full, Half
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Surface(
                        onClick = { amountStr = "${customer.debtBalance.toInt()}" },
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFDCFCE7)
                    ) {
                        Text(
                            Localization.format("cust_debt_full_fmt", language, customer.debtBalance.toInt()),
                            fontSize = 11.sp,
                            color = ProfitGreen,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
                        )
                    }

                    if (customer.debtBalance > 1) {
                        Surface(
                            onClick = { amountStr = "${(customer.debtBalance / 2).toInt()}" },
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFF3F4F6)
                        ) {
                            Text(
                                Localization.format("cust_debt_half_fmt", language, (customer.debtBalance / 2).toInt()),
                                fontSize = 11.sp,
                                color = InkDark,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Live Auto-Calculation Remaining Debt Box
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = if (remainingDebt == 0.0) Color(0xFFECFDF5) else Color(0xFFFFFBEB),
                    border = androidx.compose.foundation.BorderStroke(1.dp, if (remainingDebt == 0.0) ProfitGreen.copy(alpha = 0.5f) else Color(0xFFFDE68A)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = if (remainingDebt == 0.0) Localization.get("cust_debt_will_clear", language) else Localization.get("cust_debt_remaining_label", language),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (remainingDebt == 0.0) ProfitGreen else Color(0xFFB45309)
                            )
                            Text(
                                text = ReceiptGenerator.formatMoney(remainingDebt, shopProfile),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Black,
                                color = if (remainingDebt == 0.0) ProfitGreen else Color(0xFFB45309)
                            )
                        }
                        if (remainingDebt == 0.0) {
                            Text(
                                text = Localization.format("cust_debt_settled_zero_fmt", language, shopProfile.currencySymbol),
                                fontSize = 11.sp,
                                color = ProfitGreen
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Payment Method Chips
                Text(Localization.get("cust_debt_method_label", language), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = InkDark)
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf("CASH", "MTN MOMO", "AIRTEL MONEY", "BANK CARD").forEach { method ->
                        val isSelected = paymentMethod == method
                        Surface(
                            onClick = { paymentMethod = method },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) OrangePrimary else Color(0xFFF1F5F9)
                        ) {
                            Text(
                                text = Localization.paymentMethodLabel(method, language),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isSelected) Color.White else InkDark,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
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
                        Text(Localization.get("cancel", language), fontSize = 12.sp)
                    }

                    Button(
                        onClick = {
                            if (parsedAmount > 0) {
                                onConfirm(parsedAmount, paymentMethod)
                            }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen),
                        shape = RoundedCornerShape(10.dp),
                        enabled = parsedAmount > 0
                    ) {
                        Text(Localization.get("cust_debt_save_btn", language), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun BulkContactsImportDialog(
    language: AppLanguage = AppLanguage.ENGLISH,
    onImport: (List<PickedContactInfo>) -> Unit,
    onPickAndEdit: (PickedContactInfo) -> Unit = {},
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var contactsList by remember { mutableStateOf<List<PickedContactInfo>>(emptyList()) }
    var selectedContacts by remember { mutableStateOf<Set<PickedContactInfo>>(emptySet()) }
    var contactSearchQuery by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(true) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            contactsList = ContactsHelper.fetchAllPhoneContacts(context)
            selectedContacts = emptySet() // Never auto-select all contacts
            isLoading = false
        } else {
            isLoading = false
            Toast.makeText(context, Localization.get("cust_contacts_perm_denied", language), Toast.LENGTH_SHORT).show()
            onDismiss()
        }
    }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (ContactsHelper.hasContactsPermission(context)) {
            contactsList = ContactsHelper.fetchAllPhoneContacts(context)
            selectedContacts = emptySet() // User explicitly chooses desired contacts
            isLoading = false
        } else {
            permissionLauncher.launch(android.Manifest.permission.READ_CONTACTS)
        }
    }

    val filteredContacts = remember(contactsList, contactSearchQuery) {
        if (contactSearchQuery.isBlank()) contactsList
        else contactsList.filter {
            it.name.contains(contactSearchQuery, ignoreCase = true) ||
                it.phone.contains(contactSearchQuery, ignoreCase = true)
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = Localization.get("cust_import_contacts_title", language),
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = InkDark
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = Localization.get("close", language), tint = InkDark)
                    }
                }

                Text(
                    text = "Select only the contacts you want, or tap Edit & Add on a contact to customize names, city & credit details.",
                    fontSize = 11.5.sp,
                    color = InkMedium
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = contactSearchQuery,
                    onValueChange = { contactSearchQuery = it },
                    placeholder = { Text("Search name or phone number...", fontSize = 12.5.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = InkMedium, modifier = Modifier.size(18.dp)) },
                    trailingIcon = {
                        if (contactSearchQuery.isNotBlank()) {
                            IconButton(onClick = { contactSearchQuery = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear", tint = InkMedium, modifier = Modifier.size(16.dp))
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                if (selectedContacts.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${selectedContacts.size} selected",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = OrangePrimary
                        )
                        OutlinedButton(
                            onClick = { selectedContacts = emptySet() },
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Clear Selection", fontSize = 11.sp)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                if (isLoading) {
                    Box(modifier = Modifier.fillMaxWidth().height(150.dp), contentAlignment = Alignment.Center) {
                        Text(Localization.get("cust_contacts_reading", language), fontSize = 13.sp, color = InkMedium)
                    }
                } else if (filteredContacts.isEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth().height(150.dp), contentAlignment = Alignment.Center) {
                        Text(Localization.get("cust_contacts_none", language), fontSize = 13.sp, color = InkMedium)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(270.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        items(filteredContacts) { contact ->
                            val isSelected = selectedContacts.contains(contact)
                            Surface(
                                onClick = {
                                    selectedContacts = if (isSelected) {
                                        selectedContacts - contact
                                    } else {
                                        selectedContacts + contact
                                    }
                                },
                                shape = RoundedCornerShape(10.dp),
                                color = if (isSelected) Color(0xFFFFF0E6) else Color(0xFFF9FAFB),
                                border = if (isSelected) androidx.compose.foundation.BorderStroke(1.dp, OrangePrimary) else androidx.compose.foundation.BorderStroke(0.5.dp, Color(0xFFE5E7EB))
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 10.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        modifier = Modifier.weight(1f),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        androidx.compose.material3.Checkbox(
                                            checked = isSelected,
                                            onCheckedChange = { checked ->
                                                selectedContacts = if (checked) {
                                                    selectedContacts + contact
                                                } else {
                                                    selectedContacts - contact
                                                }
                                            }
                                        )
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(contact.name, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = InkDark)
                                            Text(contact.phone, fontSize = 11.sp, color = InkMedium)
                                        }
                                    }

                                    OutlinedButton(
                                        onClick = { onPickAndEdit(contact) },
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Icon(Icons.Default.Edit, contentDescription = "Edit and add customer", tint = DarkNavy, modifier = Modifier.size(13.dp))
                                        Spacer(modifier = Modifier.width(3.dp))
                                        Text("Edit", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = DarkNavy)
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

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
                        onClick = { onImport(selectedContacts.toList()) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                        shape = RoundedCornerShape(10.dp),
                        enabled = selectedContacts.isNotEmpty()
                    ) {
                        Text(Localization.format("cust_import_selected_fmt", language, selectedContacts.size), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
