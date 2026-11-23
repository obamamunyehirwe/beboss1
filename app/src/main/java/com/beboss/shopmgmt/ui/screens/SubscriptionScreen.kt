package com.beboss.shopmgmt.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.beboss.shopmgmt.util.normalizeUnlockCodeInput
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.LockClock
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.LinearProgressIndicator
import com.beboss.shopmgmt.R
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.PaymentVerificationRequest
import com.beboss.shopmgmt.data.model.ShopDevice
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.InkDark
import com.beboss.shopmgmt.ui.theme.InkMedium
import com.beboss.shopmgmt.ui.theme.LossRed
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.util.AdminPaymentConfig
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.OfflineSubscriptionManager
import com.beboss.shopmgmt.util.SubscriptionPriceBreakdown
import com.beboss.shopmgmt.util.SubscriptionSecurityManager
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun SubscriptionScreen(
    shopProfile: ShopProfile,
    branches: List<Branch> = emptyList(),
    allUsers: List<User> = emptyList(),
    shopDevices: List<ShopDevice> = emptyList(),
    currentUser: User? = null,
    paymentRequests: List<PaymentVerificationRequest> = emptyList(),
    livePaymentConfig: AdminPaymentConfig = OfflineSubscriptionManager.getCurrentPaymentConfig(),
    language: AppLanguage,
    onActivateVoucher: (String) -> Unit,
    // Compatibility callback retained for configured direct-payment backends.
    // The default subscription UI uses the safer proof-and-admin-verification flow.
    onProcessDirectPayment: ((provider: String, phone: String, durationMonths: Int, userReference: String?, onSuccess: (com.beboss.shopmgmt.util.PaymentProcessingResult, com.beboss.shopmgmt.util.SubscriptionPriceBreakdown) -> Unit) -> Unit)? = null,
    onSubmitPaymentVerification: ((provider: String, payerPhone: String, payerFullName: String, username: String, registeredPhone: String, durationMonths: Int, branchCount: Int, workerCount: Int, deviceCount: Int, paymentNote: String, onDone: (PaymentVerificationRequest, Boolean) -> Unit) -> Unit)? = null,
    onCheckCloudApproval: () -> Unit = {},
    onClose: () -> Unit = {}
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    val ownerAccount = remember(currentUser, allUsers) {
        allUsers.firstOrNull { it.role.name == "OWNER" } ?: currentUser ?: allUsers.firstOrNull()
    }

    val initialBranchCount = branches.size.coerceAtLeast(1)
    val initialWorkerCount = allUsers.size.coerceAtLeast(1)
    val initialDeviceCount = shopDevices.count { it.isActive }.coerceAtLeast(1)
    var selectedBranchCount by remember { mutableIntStateOf(initialBranchCount) }
    var selectedWorkerCount by remember { mutableIntStateOf(initialWorkerCount) }
    var selectedDeviceCount by remember(shopDevices) { mutableIntStateOf(initialDeviceCount) }
    var selectedDurationMonths by remember { mutableIntStateOf(1) }

    val breakdown = remember(selectedBranchCount, selectedWorkerCount, selectedDeviceCount, selectedDurationMonths, livePaymentConfig) {
        OfflineSubscriptionManager.calculateSubscriptionPrice(
            branchCount = selectedBranchCount,
            workerCount = selectedWorkerCount,
            durationMonths = selectedDurationMonths,
            deviceCount = selectedDeviceCount
        )
    }

    var voucherInput by remember { mutableStateOf("") }
    var lastAutoTriggeredCode by remember { mutableStateOf("") }
    val isCompleteUnlockFormat = remember(voucherInput) {
        SubscriptionSecurityManager.isCompleteUnlockCodeFormat(voucherInput)
    }
    LaunchedEffect(voucherInput) {
        // BB3 signatures are case-sensitive Base64. Preserve the exact pasted code;
        // older BB2/BB hardware formats remain case-insensitive.
        val raw = voucherInput.trim()
        val clean = if (raw.startsWith("BB3-", ignoreCase = true)) raw else raw.uppercase(Locale.ROOT)
        if (SubscriptionSecurityManager.isCompleteUnlockCodeFormat(clean) && clean != lastAutoTriggeredCode) {
            lastAutoTriggeredCode = clean
            onActivateVoucher(clean)
        }
    }

    val daysLeft = shopProfile.daysRemaining
    val isActive = shopProfile.isSubscriptionActive
    val deviceCode = OfflineSubscriptionManager.getDeviceChallengeCode(shopProfile)
    val expiryDateStr = SimpleDateFormat("dd MMM yyyy", Locale.US).format(Date(shopProfile.subscriptionExpiresAt))

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(scrollState)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 620.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Hero Status Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(3.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        border = BorderStroke(1.5.dp, OrangePrimary.copy(alpha = 0.5f)),
                        modifier = Modifier.size(54.dp),
                        shadowElevation = 4.dp
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.beboss_app_icon),
                            contentDescription = "BeBoss Logo",
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(RoundedCornerShape(14.dp)),
                            contentScale = ContentScale.Fit
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (isActive) ProfitGreen.copy(alpha = 0.12f) else LossRed.copy(alpha = 0.12f),
                        border = BorderStroke(1.dp, if (isActive) ProfitGreen else LossRed)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                imageVector = if (isActive) Icons.Default.CheckCircle else Icons.Default.Warning,
                                contentDescription = null,
                                tint = if (isActive) ProfitGreen else LossRed,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = if (isActive) "${Localization.get("active_subscription", language)} ($daysLeft ${Localization.get("days_left", language)})"
                                       else Localization.get("subscription_expired", language),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isActive) ProfitGreen else LossRed
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        text = Localization.get("sub_licensing_title", language),
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = Localization.format(
                            "sub_hero_meta_fmt",
                            language,
                            shopProfile.shopName,
                            ownerAccount?.username ?: "owner",
                            expiryDateStr
                        ),
                        fontSize = 12.5.sp,
                        color = OrangePrimary,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.clickable {
                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            cm.setPrimaryClip(ClipData.newPlainText(Localization.get("device_code", language), deviceCode))
                            Toast.makeText(context, Localization.format("sub_copied_device_fmt", language, deviceCode), Toast.LENGTH_SHORT).show()
                        }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.QrCode, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(16.dp))
                            Text(
                                text = "${Localization.get("device_code", language)}: $deviceCode",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Icon(Icons.Default.ContentCopy, contentDescription = Localization.get("sub_copy_device_cd", language), tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                        }
                    }
                }
            }

            // 2. Dynamic Branch & Staff Tier Calculator
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
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
                            Icon(Icons.Default.Storefront, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(22.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = Localization.get("sub_step1_title", language),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(
                            Triple(1, Localization.get("sub_1_branch", language), "5,000 FRw"),
                            Triple(2, Localization.get("sub_2_branches", language), "10,000 FRw"),
                            Triple(3, Localization.get("sub_3_branches", language), "20,000 FRw")
                        ).forEach { (count, label, priceTag) ->
                            val isSelected = (count == 1 && selectedBranchCount == 1) ||
                                (count == 2 && selectedBranchCount == 2) ||
                                (count == 3 && selectedBranchCount >= 3)
                            Surface(
                                onClick = { selectedBranchCount = count },
                                modifier = Modifier
                                    .weight(1f)
                                    .heightIn(min = 52.dp),
                                shape = RoundedCornerShape(12.dp),
                                color = if (isSelected) OrangePrimary else MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Column(
                                    modifier = Modifier.padding(vertical = 10.dp, horizontal = 6.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text(
                                        text = label,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = priceTag,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Black,
                                        color = if (isSelected) Color(0xFFFFE082) else OrangePrimary
                                    )
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = Localization.get("sub_workers_admin", language),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = breakdown.workerTierName,
                                fontSize = 11.sp,
                                color = OrangePrimary,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Surface(
                                onClick = { if (selectedWorkerCount > 1) selectedWorkerCount-- },
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.size(40.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.Remove, contentDescription = Localization.get("sub_dec_staff_cd", language), modifier = Modifier.size(18.dp))
                                }
                            }
                            Text(
                                text = "$selectedWorkerCount",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Black,
                                modifier = Modifier.padding(horizontal = 6.dp)
                            )
                            Surface(
                                onClick = { selectedWorkerCount++ },
                                shape = CircleShape,
                                color = OrangePrimary,
                                modifier = Modifier.size(48.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.Add, contentDescription = Localization.get("sub_inc_staff_cd", language), tint = Color.White, modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Paired Shop Devices Stepper (+2,000 FRw/month per added device)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                Icon(Icons.Default.Devices, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(15.dp))
                                Text(
                                    text = Localization.format("sub_devices_addon_fmt", language, Localization.get("shop_devices_title", language)),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                            Text(
                                text = breakdown.deviceTierName,
                                fontSize = 11.sp,
                                color = OrangePrimary,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Surface(
                                onClick = { if (selectedDeviceCount > 1) selectedDeviceCount-- },
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier
                                    .size(48.dp)
                                    .testTag("sub_device_dec_btn")
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.Remove, contentDescription = Localization.get("sub_dec_device_cd", language), modifier = Modifier.size(18.dp))
                                }
                            }
                            Text(
                                text = "$selectedDeviceCount",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Black,
                                modifier = Modifier.padding(horizontal = 6.dp)
                            )
                            Surface(
                                onClick = { selectedDeviceCount++ },
                                shape = CircleShape,
                                color = OrangePrimary,
                                modifier = Modifier
                                    .size(48.dp)
                                    .testTag("sub_device_inc_btn")
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.Add, contentDescription = Localization.get("sub_inc_device_cd", language), tint = Color.White, modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(
                            Pair(1, Localization.get("sub_1_month", language)),
                            Pair(3, Localization.get("sub_3_mo_short", language)),
                            Pair(12, Localization.get("sub_1_yr_short", language))
                        ).forEach { (months, label) ->
                            val isSelected = selectedDurationMonths == months
                            Surface(
                                onClick = { selectedDurationMonths = months },
                                modifier = Modifier
                                    .weight(1f)
                                    .heightIn(min = 48.dp),
                                shape = RoundedCornerShape(10.dp),
                                color = if (isSelected) DarkNavy else MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(horizontal = 4.dp)) {
                                    Text(
                                        text = label,
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color(0xFFFFF7ED),
                        border = BorderStroke(1.5.dp, OrangePrimary.copy(alpha = 0.5f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(Localization.get("sub_total_ussd_payable", language), fontSize = 11.5.sp, color = InkMedium, fontWeight = FontWeight.SemiBold)
                                Text("${breakdown.totalPayable} FRw", fontSize = 22.sp, fontWeight = FontWeight.Black, color = DarkNavy)
                            }
                            Surface(shape = RoundedCornerShape(8.dp), color = ProfitGreen.copy(alpha = 0.15f)) {
                                Text(
                                    text = Localization.format("sub_plus_days_fmt", language, selectedDurationMonths * 30),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ProfitGreen,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                                )
                            }
                        }
                    }
                }
            }

            // 3. Secure online payment through the BeBoss hosted checkout.
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(2.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Payment, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(22.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Secure online payment",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Text(
                        text = "Your subscription total is ${breakdown.totalPayable} RWF for ${selectedDurationMonths} month(s).",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Use BeBoss hosted checkout to pay through Flutterwave with Rwanda MTN MoMo, Airtel Money or card. Stripe card checkout is shown only when the connected merchant account is eligible. The provider verifies settlement directly with BeBoss; a payment SMS, USSD dial or browser redirect cannot mark your subscription as paid.",
                        fontSize = 11.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        lineHeight = 16.sp
                    )

                    Button(
                        onClick = {
                            val checkoutUri = Uri.parse("https://beboss.rw/my-shop").buildUpon()
                                .appendQueryParameter("pay", "1")
                                .appendQueryParameter("b", selectedBranchCount.toString())
                                .appendQueryParameter("w", selectedWorkerCount.toString())
                                .appendQueryParameter("d", selectedDeviceCount.toString())
                                .appendQueryParameter("m", selectedDurationMonths.toString())
                                .build()
                            try {
                                context.startActivity(Intent(Intent.ACTION_VIEW, checkoutUri))
                            } catch (_: Exception) {
                                Toast.makeText(context, "No browser is available to open secure checkout.", Toast.LENGTH_LONG).show()
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 52.dp)
                            .testTag("open_online_checkout_button"),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Payment, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Continue to Flutterwave / Stripe", fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }

                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Next: verify the registered shop owner by SMS in the browser, complete payment on the provider page, then return to BeBoss to check payment verification and enter the BB3 activation code issued after administrator approval.",
                            modifier = Modifier.padding(12.dp),
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            lineHeight = 15.sp
                        )
                    }
                }
            }

            // 4. Step 4: Admin Unlock Code Activation + Live Cloud Verification Queue
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.Key, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = Localization.get("insert_unlock_code_title", language),
                                fontSize = 14.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }

                        OutlinedButton(
                            onClick = onCheckCloudApproval,
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.CloudSync, contentDescription = Localization.get("sync_cloud_approvals", language), modifier = Modifier.size(15.dp), tint = OrangePrimary)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(Localization.get("sync_cloud_approvals", language), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = OrangePrimary)
                        }
                    }

                    Text(
                        text = Localization.format(
                            "sub_paste_bb2_hint_fmt",
                            language,
                            ownerAccount?.username ?: "owner",
                            ownerAccount?.phone?.ifBlank { shopProfile.phone } ?: shopProfile.phone
                        ),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    OutlinedTextField(
                        value = voucherInput,
                        onValueChange = { voucherInput = it },
                        label = { Text(Localization.get("enter_voucher_code", language)) },
                        placeholder = { Text("BB3-SINGLE-30-...") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("unlock_code_input"),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true
                    )

                    if (isCompleteUnlockFormat) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = ProfitGreen.copy(alpha = 0.14f),
                            border = BorderStroke(1.dp, ProfitGreen.copy(alpha = 0.5f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("auto_unlock_detected_badge")
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(16.dp))
                                Text(
                                    text = Localization.get("auto_unlock_detected", language),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ProfitGreen
                                )
                            }
                        }
                    }

                    Button(
                        onClick = {
                            if (voucherInput.isNotBlank()) {
                                val cleaned = normalizeUnlockCodeInput(voucherInput)
                                lastAutoTriggeredCode = cleaned
                                onActivateVoucher(cleaned)
                                voucherInput = ""
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .testTag("activate_unlock_code_button"),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen),
                        enabled = voucherInput.isNotBlank()
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(Localization.get("activate_code", language), fontWeight = FontWeight.Bold)
                    }

                    // Live Verification Requests History (Offline Room + Cloud Sync Status)
                    if (paymentRequests.isNotEmpty()) {
                        HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                        Text(
                            text = Localization.format("sub_recent_requests_fmt", language, paymentRequests.size),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        paymentRequests.take(4).forEach { req ->
                            val isApproved = req.status == "APPROVED" && req.generatedUnlockCode.isNotBlank()
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                                border = BorderStroke(
                                    1.dp,
                                    if (isApproved) ProfitGreen.copy(alpha = 0.5f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                                ),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "${req.amountRwf} FRw • ${req.provider}",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = if (isApproved) ProfitGreen.copy(alpha = 0.15f)
                                            else if (req.status == "REDEEMED") Color(0xFF3B82F6).copy(alpha = 0.15f)
                                            else OrangePrimary.copy(alpha = 0.15f)
                                        ) {
                                            Text(
                                                text = req.status,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (isApproved) ProfitGreen else if (req.status == "REDEEMED") Color(0xFF2563EB) else OrangePrimary,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                    Text(
                                        text = Localization.format(
                                            "sub_req_meta_fmt",
                                            language,
                                            req.ownerUsername,
                                            req.ownerPhone,
                                            req.deviceCount,
                                            req.payerFullName.ifBlank { req.payerPhone },
                                            if (req.syncedToSupabase) Localization.get("sub_synced_supabase", language) else Localization.get("sub_saved_offline", language)
                                        ),
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    if (req.status == "APPROVED" && req.approvalMode == "DIRECT_AUTO_UNLOCK") {
                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = ProfitGreen.copy(alpha = 0.14f),
                                            border = BorderStroke(1.dp, ProfitGreen.copy(alpha = 0.45f)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(15.dp))
                                                Text(
                                                    text = Localization.get("direct_auto_unlock_badge", language),
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = ProfitGreen
                                                )
                                            }
                                        }
                                    } else if (req.generatedUnlockCode.isNotBlank()) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = req.generatedUnlockCode,
                                                fontFamily = FontFamily.Monospace,
                                                fontSize = 11.5.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = ProfitGreen,
                                                modifier = Modifier.weight(1f)
                                            )
                                            if (req.status == "APPROVED") {
                                                Button(
                                                    onClick = { onActivateVoucher(req.generatedUnlockCode) },
                                                    colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen),
                                                    shape = RoundedCornerShape(8.dp)
                                                ) {
                                                    Text(Localization.get("sub_apply_code_btn", language), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    OutlinedButton(
                        onClick = {
                            OfflineSubscriptionManager.contactSupportViaWhatsApp(
                                context = context,
                                shopProfile = shopProfile,
                                branches = branches,
                                allUsers = allUsers
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.SupportAgent, contentDescription = null, modifier = Modifier.size(16.dp), tint = ProfitGreen)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(Localization.get("sub_wa_admin_support_btn", language), color = ProfitGreen, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }

                    OutlinedButton(
                        onClick = onCheckCloudApproval,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .testTag("check_cloud_unlock_button"),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = OrangePrimary)
                    ) {
                        Icon(Icons.Default.CloudDone, contentDescription = null, modifier = Modifier.size(16.dp), tint = OrangePrimary)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(Localization.get("sub_sync_approved_cloud_btn", language), fontSize = 12.sp, color = OrangePrimary, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }


}

@Composable
fun SubscriptionPaywallDialog(
    shopProfile: ShopProfile,
    branches: List<Branch> = emptyList(),
    allUsers: List<User> = emptyList(),
    shopDevices: List<ShopDevice> = emptyList(),
    currentUser: User? = null,
    paymentRequests: List<PaymentVerificationRequest> = emptyList(),
    livePaymentConfig: AdminPaymentConfig = OfflineSubscriptionManager.getCurrentPaymentConfig(),
    language: AppLanguage,
    onActivateVoucher: (String) -> Unit,
    // Keep the same callback available to hard-lock and Settings subscription surfaces.
    onProcessDirectPayment: ((provider: String, phone: String, durationMonths: Int, userReference: String?, onSuccess: (com.beboss.shopmgmt.util.PaymentProcessingResult, com.beboss.shopmgmt.util.SubscriptionPriceBreakdown) -> Unit) -> Unit)? = null,
    onSubmitPaymentVerification: ((provider: String, payerPhone: String, payerFullName: String, username: String, registeredPhone: String, durationMonths: Int, branchCount: Int, workerCount: Int, deviceCount: Int, paymentNote: String, onDone: (PaymentVerificationRequest, Boolean) -> Unit) -> Unit)? = null,
    onCheckCloudApproval: () -> Unit = {},
    onOpenAdminConsole: (() -> Unit)? = null
) {
    val lockTitle = when {
        shopProfile.isSuspended -> Localization.get("suspended_title", language)
        shopProfile.isFreeTrial -> Localization.get("trial_ended_title", language)
        else -> Localization.get("subscription_expired", language)
    }
    val lockSubtitle = when {
        shopProfile.isSuspended -> Localization.get("suspended_subtitle", language)
        shopProfile.isFreeTrial -> Localization.get("trial_ended_subtitle", language)
        else -> Localization.get("expired_subtitle", language)
    }

    Dialog(
        onDismissRequest = { /* Hard lock: non-dismissible until verified payment approval or a valid unlock code */ },
        properties = DialogProperties(
            dismissOnBackPress = false,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false
        )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .testTag("subscription_hard_lock_screen"),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
            ) {
                // Hard-Lock Header Banner
                Surface(
                    color = LossRed,
                    contentColor = Color.White,
                    shadowElevation = 6.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.weight(1f)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = Color.White.copy(alpha = 0.2f),
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = Icons.Default.Lock,
                                            contentDescription = Localization.get("sub_terminal_locked_cd", language),
                                            tint = Color.White,
                                            modifier = Modifier.size(22.dp)
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        text = lockTitle,
                                        fontWeight = FontWeight.Black,
                                        fontSize = 17.sp,
                                        color = Color.White
                                    )
                                    Text(
                                        text = Localization.format("sub_terminal_locked_fmt", language, shopProfile.shopName.ifBlank { "BeBoss POS" }),
                                        fontSize = 11.5.sp,
                                        color = Color.White.copy(alpha = 0.9f),
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                            if (onOpenAdminConsole != null) {
                                IconButton(
                                    onClick = onOpenAdminConsole,
                                    modifier = Modifier.testTag("paywall_admin_console_button")
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.AdminPanelSettings,
                                        contentDescription = Localization.get("sub_open_admin_console_cd", language),
                                        tint = Color.White
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = lockSubtitle,
                            fontSize = 11.5.sp,
                            lineHeight = 16.sp,
                            color = Color.White.copy(alpha = 0.94f)
                        )
                    }
                }

                // Scrollable Activation & Payment Body
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.TopCenter
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .widthIn(max = 640.dp)
                            .padding(horizontal = 12.dp, vertical = 10.dp)
                    ) {
                        SubscriptionScreen(
                            shopProfile = shopProfile,
                            branches = branches,
                            allUsers = allUsers,
                            shopDevices = shopDevices,
                            currentUser = currentUser,
                            paymentRequests = paymentRequests,
                            livePaymentConfig = livePaymentConfig,
                            language = language,
                            onActivateVoucher = onActivateVoucher,
                            onProcessDirectPayment = onProcessDirectPayment,
                            onSubmitPaymentVerification = onSubmitPaymentVerification,
                            onCheckCloudApproval = onCheckCloudApproval
                        )
                    }
                }
            }
        }
    }
}
