package com.beboss.shopmgmt.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.ShopDevice
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.OfflineSubscriptionManager
import java.text.DecimalFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShopDevicesDialog(
    shopDevices: List<ShopDevice>,
    allUsers: List<User>,
    branches: List<Branch>,
    currentUser: User? = null,
    language: AppLanguage = AppLanguage.ENGLISH,
    onAddDevice: (deviceName: String, assignedUser: User, branch: Branch?, onCreated: (ShopDevice) -> Unit) -> Unit,
    onToggleActive: (deviceId: String, isActive: Boolean) -> Unit,
    onDelete: (deviceId: String) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val numberFormat = remember { DecimalFormat("#,###") }
    val dateFormat = remember { SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault()) }

    val isShopOwner = currentUser == null || currentUser.role.name == "OWNER"
    val managedBranchIds = remember(currentUser, branches) {
        if (isShopOwner) branches.map { it.id }.toSet()
        else branches.filter {
            it.managerUserId == currentUser?.id || it.id == currentUser?.assignedBranchId
        }.map { it.id }.toSet()
    }
    val availableBranches = remember(branches, managedBranchIds) {
        branches.filter { it.isActive && it.id in managedBranchIds }
    }
    val availableUsers = remember(allUsers, availableBranches, isShopOwner) {
        allUsers.filter { user ->
            user.isActive &&
                user.role.name != "OWNER" &&
                (isShopOwner || availableBranches.any { it.id == user.assignedBranchId })
        }
    }
    val visibleDevices = remember(shopDevices, managedBranchIds, isShopOwner) {
        if (isShopOwner) shopDevices
        else shopDevices.filter { it.branchId in managedBranchIds }
    }

    var showAddForm by remember { mutableStateOf(false) }
    var newDeviceName by remember { mutableStateOf("") }
    var selectedUser by remember(availableUsers) { mutableStateOf(availableUsers.firstOrNull()) }
    var selectedBranch by remember(availableBranches) { mutableStateOf(availableBranches.firstOrNull()) }
    var userMenuExpanded by remember { mutableStateOf(false) }
    var branchMenuExpanded by remember { mutableStateOf(false) }
    var lastCreatedDevice by remember { mutableStateOf<ShopDevice?>(null) }
    var deviceToDelete by remember { mutableStateOf<ShopDevice?>(null) }

    val activeCount = visibleDevices.count { it.isActive }.coerceAtLeast(1)
    val extraDevices = (activeCount - 1).coerceAtLeast(0)
    val extraMonthlyCost = extraDevices * OfflineSubscriptionManager.PER_EXTRA_DEVICE_FEE_RWF

    fun copyJoinCode(device: ShopDevice) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("BeBoss Join Code", device.joinCode))
        Toast.makeText(context, "Copied Join Code: ${device.joinCode}", Toast.LENGTH_SHORT).show()
    }

    fun shareJoinCode(device: ShopDevice) {
        val text = buildString {
            appendLine("BeBoss Terminal Pairing Credentials")
            appendLine("Terminal: ${device.deviceName}")
            appendLine("Operator: ${device.assignedUserName} (@${device.assignedUsername})")
            appendLine("Branch: ${device.branchName}")
            appendLine("Join Code: ${device.joinCode}")
            appendLine("Open BeBoss -> Tap 'Join Existing Shop' and enter this code.")
        }
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "BeBoss Join Code: ${device.joinCode}")
            putExtra(Intent.EXTRA_TEXT, text)
        }
        context.startActivity(Intent.createChooser(intent, "Share Terminal Join Code"))
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .widthIn(max = 600.dp)
                .padding(vertical = 16.dp)
                .testTag("shop_devices_dialog"),
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(8.dp)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                        Surface(
                            shape = CircleShape,
                            color = ProfitGreen.copy(alpha = 0.14f),
                            modifier = Modifier.size(42.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Devices, contentDescription = null, tint = ProfitGreen)
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = Localization.get("shop_devices_title", language),
                                fontWeight = FontWeight.Black,
                                fontSize = 18.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "$activeCount active terminal(s) \u2022 +${numberFormat.format(extraMonthlyCost)} FRw/mo add-on",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .size(48.dp)
                            .testTag("shop_devices_close_btn")
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Close Shop Devices")
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Summary Strip + Add Action
                    item(key = "summary_strip") {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = DarkNavy,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "MULTI-TERMINAL CLOUD SYNC",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Color(0xFF94A3B8),
                                        letterSpacing = 0.6.sp
                                    )
                                    Text(
                                        text = "Primary owner terminal is included free. Extra paired POS terminals add +${numberFormat.format(OfflineSubscriptionManager.PER_EXTRA_DEVICE_FEE_RWF)} FRw/mo.",
                                        fontSize = 11.sp,
                                        color = Color.White.copy(alpha = 0.9f),
                                        lineHeight = 15.sp
                                    )
                                }
                                Spacer(modifier = Modifier.width(10.dp))
                                Button(
                                    onClick = { showAddForm = !showAddForm },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (showAddForm) Color(0xFF334155) else OrangePrimary
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier
                                        .heightIn(min = 48.dp)
                                        .testTag("shop_devices_toggle_add_btn")
                                ) {
                                    Icon(
                                        imageVector = if (showAddForm) Icons.Default.Close else Icons.Default.Add,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = if (showAddForm) "Hide" else "Pair New",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    // Newly Created Terminal Join Code Banner
                    lastCreatedDevice?.let { created ->
                        item(key = "created_banner") {
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = ProfitGreen.copy(alpha = 0.12f),
                                border = BorderStroke(1.2.dp, ProfitGreen.copy(alpha = 0.5f)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = "Terminal Paired: ${created.deviceName}",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp,
                                            color = ProfitGreen
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = "Join Code: ${created.joinCode}",
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Black,
                                        fontSize = 18.sp,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "Assigned to ${created.assignedUserName} (@${created.assignedUsername}) \u2022 ${created.branchName}",
                                        fontSize = 11.5.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedButton(
                                            onClick = { copyJoinCode(created) },
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp)
                                        ) {
                                            Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(15.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text("Copy Code", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                        }
                                        Button(
                                            onClick = { shareJoinCode(created) },
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen)
                                        ) {
                                            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(15.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text("Share", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Pair New Terminal Form
                    if (showAddForm) {
                        item(key = "add_form") {
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Text(
                                        text = if (isShopOwner) "Register Secondary POS Terminal" else "Register Terminal for Your Branch",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )

                                    OutlinedTextField(
                                        value = newDeviceName,
                                        onValueChange = { newDeviceName = it },
                                        label = { Text("Terminal Name (e.g. Counter #2 Tablet)") },
                                        leadingIcon = { Icon(Icons.Default.Devices, contentDescription = null) },
                                        singleLine = true,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .testTag("shop_device_name_input"),
                                        shape = RoundedCornerShape(10.dp)
                                    )

                                    // Staff Operator Selector
                                    ExposedDropdownMenuBox(
                                        expanded = userMenuExpanded,
                                        onExpandedChange = { userMenuExpanded = !userMenuExpanded }
                                    ) {
                                        OutlinedTextField(
                                            value = selectedUser?.let { "${it.name} (@${it.username}) \u2022 ${it.role.displayName}" } ?: "No staff users found",
                                            onValueChange = {},
                                            readOnly = true,
                                            label = { Text("Assigned Staff Operator") },
                                            leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = userMenuExpanded) },
                                            modifier = Modifier
                                                .menuAnchor()
                                                .fillMaxWidth(),
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        ExposedDropdownMenu(
                                            expanded = userMenuExpanded,
                                            onDismissRequest = { userMenuExpanded = false }
                                        ) {
                                            availableUsers.forEach { user ->
                                                DropdownMenuItem(
                                                    text = { Text("${user.name} (@${user.username}) \u2022 ${user.role.displayName}") },
                                                    onClick = {
                                                        selectedUser = user
                                                        val matchedBranch = branches.firstOrNull { it.id == user.assignedBranchId }
                                                        if (matchedBranch != null) selectedBranch = matchedBranch
                                                        userMenuExpanded = false
                                                    }
                                                )
                                            }
                                        }
                                    }

                                    // Branch Selector
                                    ExposedDropdownMenuBox(
                                        expanded = branchMenuExpanded,
                                        onExpandedChange = { branchMenuExpanded = !branchMenuExpanded }
                                    ) {
                                        OutlinedTextField(
                                            value = selectedBranch?.name ?: "Main Store",
                                            onValueChange = {},
                                            readOnly = true,
                                            label = { Text("Assigned Branch Outlet") },
                                            leadingIcon = { Icon(Icons.Default.Store, contentDescription = null) },
                                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = branchMenuExpanded) },
                                            modifier = Modifier
                                                .menuAnchor()
                                                .fillMaxWidth(),
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        ExposedDropdownMenu(
                                            expanded = branchMenuExpanded,
                                            onDismissRequest = { branchMenuExpanded = false }
                                        ) {
                                            availableBranches.forEach { branch ->
                                                DropdownMenuItem(
                                                    text = { Text(branch.name) },
                                                    onClick = {
                                                        selectedBranch = branch
                                                        branchMenuExpanded = false
                                                    }
                                                )
                                            }
                                        }
                                    }

                                    Button(
                                        onClick = {
                                            val user = selectedUser
                                            if (user == null) {
                                                Toast.makeText(context, "Create an active Manager or Cashier in your branch first.", Toast.LENGTH_SHORT).show()
                                                return@Button
                                            }
                                            val branchToUse = selectedBranch
                                            if (branchToUse == null) {
                                                Toast.makeText(context, "Select an active branch you manage.", Toast.LENGTH_SHORT).show()
                                                return@Button
                                            }
                                            val nameToUse = newDeviceName.trim().ifBlank { "${user.name}'s Terminal" }
                                            onAddDevice(nameToUse, user, branchToUse) { created ->
                                                lastCreatedDevice = created
                                                newDeviceName = ""
                                                showAddForm = false
                                            }
                                        },
                                        enabled = selectedUser != null && selectedBranch != null,
                                        colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary),
                                        shape = RoundedCornerShape(10.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .heightIn(min = 48.dp)
                                            .testTag("shop_devices_add_btn")
                                    ) {
                                        Icon(Icons.Default.Key, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Generate Join Code & Register Device", fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }

                    item(key = "divider") {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }

                    // Device List
                    if (visibleDevices.isEmpty()) {
                        item(key = "empty_devices") {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 28.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Icon(
                                        Icons.Default.Devices,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(40.dp)
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = "No terminals registered yet.",
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "Tap 'Pair New' above to generate a terminal join code for your staff.",
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    } else {
                        items(visibleDevices, key = { it.id }) { device ->
                            ShopDeviceRowCard(
                                device = device,
                                dateFormat = dateFormat,
                                onCopyJoinCode = { copyJoinCode(device) },
                                onShareJoinCode = { shareJoinCode(device) },
                                onToggleActive = { active -> onToggleActive(device.id, active) },
                                onRequestDelete = { deviceToDelete = device }
                            )
                        }
                    }
                }
            }
        }
    }

    deviceToDelete?.let { dev ->
        AlertDialog(
            onDismissRequest = { deviceToDelete = null },
            title = { Text("Remove Terminal?", fontWeight = FontWeight.Bold, color = LossRed) },
            text = {
                Text("Revoke and delete '${dev.deviceName}' (${dev.joinCode})? Any tablet using this join code will no longer sync with the shop.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        onDelete(dev.id)
                        if (lastCreatedDevice?.id == dev.id) lastCreatedDevice = null
                        deviceToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LossRed)
                ) {
                    Text("Delete", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { deviceToDelete = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun ShopDeviceRowCard(
    device: ShopDevice,
    dateFormat: SimpleDateFormat,
    onCopyJoinCode: () -> Unit,
    onShareJoinCode: () -> Unit,
    onToggleActive: (Boolean) -> Unit,
    onRequestDelete: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
        border = BorderStroke(
            width = 1.dp,
            color = when {
                device.isOwnerPrimary -> OrangePrimary.copy(alpha = 0.45f)
                device.isActive -> ProfitGreen.copy(alpha = 0.4f)
                else -> LossRed.copy(alpha = 0.35f)
            }
        ),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("shop_device_card_${device.id}")
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    Surface(
                        shape = CircleShape,
                        color = if (device.isOwnerPrimary) OrangePrimary.copy(alpha = 0.14f) else DarkNavy.copy(alpha = 0.1f),
                        modifier = Modifier.size(36.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = if (device.isOwnerPrimary) Icons.Default.VerifiedUser else Icons.Default.Devices,
                                contentDescription = null,
                                tint = if (device.isOwnerPrimary) OrangePrimary else DarkNavy,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = device.deviceName.ifBlank { "POS Terminal" },
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "${device.assignedUserName.ifBlank { device.assignedUsername }} (@${device.assignedUsername}) \u2022 ${device.role}",
                            fontSize = 11.5.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = when {
                        device.isOwnerPrimary -> OrangePrimary.copy(alpha = 0.14f)
                        device.isActive -> ProfitGreen.copy(alpha = 0.14f)
                        else -> LossRed.copy(alpha = 0.14f)
                    }
                ) {
                    Text(
                        text = when {
                            device.isOwnerPrimary -> "PRIMARY"
                            device.isActive -> "ACTIVE"
                            else -> "REVOKED"
                        },
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        color = when {
                            device.isOwnerPrimary -> OrangePrimary
                            device.isActive -> ProfitGreen
                            else -> LossRed
                        },
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Branch: ${device.branchName.ifBlank { "Main Store" }}",
                        fontSize = 11.5.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(modifier = Modifier.width(4.dp))
                        val syncText = if (device.lastSyncedAt > 0L) {
                            "Synced ${dateFormat.format(Date(device.lastSyncedAt))}"
                        } else {
                            "Awaiting first device pairing"
                        }
                        Text(
                            text = syncText,
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                if (!device.isOwnerPrimary) {
                    if (device.isActive && device.deviceId.isBlank() && device.joinCode.isNotBlank()) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surface,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                        ) {
                            Text(
                                text = device.joinCode,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Black,
                                fontSize = 12.sp,
                                color = OrangePrimary,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    } else {
                        Text(
                            text = if (device.deviceId.isNotBlank()) "Paired to this shop" else if (!device.isActive) "Invitation paused" else "No active invitation",
                            fontSize = 10.5.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            if (!device.isOwnerPrimary) {
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Switch(
                            checked = device.isActive,
                            onCheckedChange = onToggleActive,
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = ProfitGreen
                            ),
                            modifier = Modifier.testTag("shop_device_switch_${device.id}")
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (device.isActive) "Enabled" else "Paused",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        if (device.isActive && device.deviceId.isBlank() && device.joinCode.isNotBlank()) {
                            IconButton(
                                onClick = onCopyJoinCode,
                                modifier = Modifier.size(48.dp)
                            ) {
                                Icon(Icons.Default.ContentCopy, contentDescription = "Copy Join Code", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            IconButton(
                                onClick = onShareJoinCode,
                                modifier = Modifier.size(48.dp)
                            ) {
                                Icon(Icons.Default.Share, contentDescription = "Share Join Code", tint = OrangePrimary)
                            }
                        }
                        IconButton(
                            onClick = onRequestDelete,
                            modifier = Modifier.size(48.dp)
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete Terminal", tint = LossRed)
                        }
                    }
                }
            }
        }
    }
}
