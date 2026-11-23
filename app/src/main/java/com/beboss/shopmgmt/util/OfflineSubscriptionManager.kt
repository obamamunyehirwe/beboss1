package com.beboss.shopmgmt.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.core.content.FileProvider
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.User
import java.io.File

data class AdminPaymentConfig(
    val adminWhatsAppNumber: String = "",
    val mtnMoMoCode: String = "",
    val mtnMoMoPhone: String = "",
    val mtnRecipientName: String = "",
    val airtelMoneyPhone: String = "",
    val airtelRecipientName: String = "",
    val perDeviceFeeRwf: Int = 2000,
    val apkDownloadUrl: String = "",
    val apkVersion: String = "2.1.0",
    val updatedAt: Long = 0L
)

data class SubscriptionPriceBreakdown(
    val branchCount: Int,
    val branchBasePrice: Int,
    val branchTierName: String,
    val workerCount: Int,
    val workerFee: Int,
    val workerTierName: String,
    val deviceCount: Int = 1,
    val extraDevicesCount: Int = 0,
    val deviceFee: Int = 0,
    val deviceTierName: String = "1st Owner Device Included",
    val monthlySubtotal: Int,
    val durationMonths: Int,
    val discountPercent: Int,
    val discountAmount: Int,
    val totalPayable: Int,
    val ussdMtnCode: String,
    val ussdAirtelCode: String
)

data class VoucherValidationResult(
    val isValid: Boolean,
    val daysToAdd: Int,
    val message: String,
    val planName: String,
    val verifiedAmount: Int = 0
)

data class PaymentProcessingResult(
    val isSuccess: Boolean,
    val transactionRef: String,
    val amountPaid: Int,
    val planDays: Int,
    val provider: String,
    val payerPhone: String,
    val timestamp: Long,
    val message: String,
    val isPending: Boolean = false,
    val financialId: String? = null
)

object OfflineSubscriptionManager {

    private const val PREFS_NAME = "beboss_admin_payment_config"
    private const val KEY_WHATSAPP = "admin_whatsapp_number"
    private const val KEY_MTN_CODE = "mtn_momo_code"
    private const val KEY_MTN_PHONE = "mtn_momo_phone"
    private const val KEY_MTN_NAME = "mtn_recipient_name"
    private const val KEY_AIRTEL_PHONE = "airtel_money_phone"
    private const val KEY_AIRTEL_NAME = "airtel_recipient_name"
    private const val KEY_PER_DEVICE_FEE = "per_device_fee_rwf"
    private const val KEY_APK_URL = "apk_download_url"
    private const val KEY_APK_VERSION = "apk_version"
    private const val KEY_UPDATED_AT = "updated_at"

    const val PER_EXTRA_DEVICE_FEE_RWF = 2000

    @Volatile
    private var cachedConfig: AdminPaymentConfig = AdminPaymentConfig()

    private fun normalizeBuildWhatsApp(): String = try {
        com.beboss.shopmgmt.BuildConfig.BEBOSS_ADMIN_WHATSAPP.trim().let { raw ->
            if (raw.equals("none", ignoreCase = true) || raw.startsWith("your_", ignoreCase = true)) "" else raw
        }
    } catch (_: Throwable) {
        ""
    }

    fun initConfigCache(context: Context) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val envWa = normalizeBuildWhatsApp()
        cachedConfig = AdminPaymentConfig(
            adminWhatsAppNumber = prefs.getString(KEY_WHATSAPP, null)?.ifBlank { envWa } ?: envWa,
            mtnMoMoCode = prefs.getString(KEY_MTN_CODE, "").orEmpty(),
            mtnMoMoPhone = prefs.getString(KEY_MTN_PHONE, "").orEmpty(),
            mtnRecipientName = prefs.getString(KEY_MTN_NAME, "").orEmpty(),
            airtelMoneyPhone = prefs.getString(KEY_AIRTEL_PHONE, "").orEmpty(),
            airtelRecipientName = prefs.getString(KEY_AIRTEL_NAME, "").orEmpty(),
            perDeviceFeeRwf = PER_EXTRA_DEVICE_FEE_RWF,
            apkDownloadUrl = prefs.getString(KEY_APK_URL, "").orEmpty(),
            apkVersion = prefs.getString(KEY_APK_VERSION, "2.1.0").orEmpty().ifBlank { "2.1.0" },
            updatedAt = prefs.getLong(KEY_UPDATED_AT, 0L)
        )
    }

    fun saveDynamicPaymentConfig(context: Context?, config: AdminPaymentConfig) {
        val envWa = normalizeBuildWhatsApp()
        val effective = config.copy(
            adminWhatsAppNumber = config.adminWhatsAppNumber.trim().ifBlank { envWa },
            mtnMoMoCode = config.mtnMoMoCode.trim(),
            mtnMoMoPhone = config.mtnMoMoPhone.trim(),
            mtnRecipientName = config.mtnRecipientName.trim(),
            airtelMoneyPhone = config.airtelMoneyPhone.trim(),
            airtelRecipientName = config.airtelRecipientName.trim(),
            perDeviceFeeRwf = PER_EXTRA_DEVICE_FEE_RWF,
            apkDownloadUrl = config.apkDownloadUrl.trim(),
            apkVersion = config.apkVersion.trim().ifBlank { "2.1.0" }
        )
        cachedConfig = effective
        context?.applicationContext?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)?.edit()?.apply {
            putString(KEY_WHATSAPP, effective.adminWhatsAppNumber)
            putString(KEY_MTN_CODE, effective.mtnMoMoCode)
            putString(KEY_MTN_PHONE, effective.mtnMoMoPhone)
            putString(KEY_MTN_NAME, effective.mtnRecipientName)
            putString(KEY_AIRTEL_PHONE, effective.airtelMoneyPhone)
            putString(KEY_AIRTEL_NAME, effective.airtelRecipientName)
            putInt(KEY_PER_DEVICE_FEE, PER_EXTRA_DEVICE_FEE_RWF)
            putString(KEY_APK_URL, effective.apkDownloadUrl)
            putString(KEY_APK_VERSION, effective.apkVersion)
            putLong(KEY_UPDATED_AT, effective.updatedAt)
            apply()
        }
    }

    fun getCurrentPaymentConfig(): AdminPaymentConfig {
        val envWa = normalizeBuildWhatsApp()
        return if (cachedConfig.adminWhatsAppNumber.isBlank() && envWa.isNotBlank()) {
            cachedConfig.copy(adminWhatsAppNumber = envWa)
        } else {
            cachedConfig
        }
    }

    var defaultMomoMerchantCode: String
        get() = cachedConfig.mtnMoMoCode
        set(value) {
            cachedConfig = cachedConfig.copy(mtnMoMoCode = value)
        }

    var defaultMomoPhoneNumber: String
        get() = cachedConfig.mtnMoMoPhone
        set(value) {
            cachedConfig = cachedConfig.copy(mtnMoMoPhone = value)
        }

    var defaultAirtelPhoneNumber: String
        get() = cachedConfig.airtelMoneyPhone
        set(value) {
            cachedConfig = cachedConfig.copy(airtelMoneyPhone = value)
        }

    var defaultSupportWhatsApp: String
        get() = getCurrentPaymentConfig().adminWhatsAppNumber
        set(value) {
            cachedConfig = cachedConfig.copy(adminWhatsAppNumber = value.trim())
        }

    fun buildMtnUssdCode(amount: Int, config: AdminPaymentConfig = getCurrentPaymentConfig()): String {
        val code = config.mtnMoMoCode.trim()
        val phone = config.mtnMoMoPhone.trim()
        return when {
            code.isNotBlank() && code != "0" -> "*182*8*1*$code*$amount#"
            phone.isNotBlank() -> "*182*1*1*$phone*$amount#"
            else -> ""
        }
    }

    fun buildAirtelUssdCode(amount: Int, config: AdminPaymentConfig = getCurrentPaymentConfig()): String {
        val phone = config.airtelMoneyPhone.trim()
        return if (phone.isNotBlank()) "*500*1*1*$phone*$amount#" else ""
    }

    /**
     * Dynamic Pricing Calculator based on active Branches, Shop Workers, and Added Shop Devices:
     * - 1 Branch: 5,000 RWF
     * - 2 Branches: 10,000 RWF
     * - >2 Branches (3+): 20,000 RWF
     * - Worker Administration:
     *   * 1 worker: Included (+0 RWF)
     *   * 2-3 workers: +2,000 RWF/mo
     *   * 4-5 workers: +4,000 RWF/mo
     *   * 6+ workers: +4,000 + (workers - 5) * 1,000 RWF/mo
     * - Multi-Device Auto-Sync Addon:
     *   * 1st owner device: Included (+0 RWF)
     *   * Each additional added device with user: +2,000 RWF/mo
     */
    fun calculateSubscriptionPrice(
        branchCount: Int,
        workerCount: Int,
        durationMonths: Int = 1,
        deviceCount: Int = 1,
        perDeviceRateRwf: Int? = null
    ): SubscriptionPriceBreakdown {
        val effectiveBranches = branchCount.coerceAtLeast(1)
        val effectiveWorkers = workerCount.coerceAtLeast(1)
        val effectiveDevices = deviceCount.coerceAtLeast(1)
        val extraDevices = (effectiveDevices - 1).coerceAtLeast(0)
        val perDeviceRate = PER_EXTRA_DEVICE_FEE_RWF

        // 1. Branch Base Tier
        val (branchBasePrice, branchTierName) = when {
            effectiveBranches == 1 -> Pair(5000, "Single Store Plan (5,000 FRw/mo)")
            effectiveBranches == 2 -> Pair(10000, "2 Branches Multi-Store Plan (10,000 FRw/mo)")
            else -> Pair(20000, "Enterprise Multi-Branch ($effectiveBranches Branches - 20,000 FRw/mo)")
        }

        // 2. Staff / Worker Administration Addon
        val (workerFee, workerTierName) = when {
            effectiveWorkers <= 1 -> Pair(0, "Solo Operator (Included)")
            effectiveWorkers in 2..3 -> Pair(2000, "Small Team ($effectiveWorkers Workers • +2,000 FRw/mo)")
            effectiveWorkers in 4..5 -> Pair(4000, "Medium Team ($effectiveWorkers Workers • +4,000 FRw/mo)")
            else -> {
                val addon = 4000 + (effectiveWorkers - 5) * 1000
                Pair(addon, "Large Team ($effectiveWorkers Workers • +$addon FRw/mo)")
            }
        }

        // 3. Added Devices Multi-Terminal Sync Addon (+2,000 FRw/device/mo)
        val deviceFee = extraDevices * perDeviceRate
        val deviceTierName = if (extraDevices == 0) {
            "1st Owner Device Included"
        } else {
            "$effectiveDevices Devices (1 + $extraDevices Added • +$deviceFee FRw/mo)"
        }

        val monthlySubtotal = branchBasePrice + workerFee + deviceFee
        val rawTotal = monthlySubtotal * durationMonths

        val discountPercent = when (durationMonths) {
            3 -> 10
            12 -> 20
            else -> 0
        }
        val discountAmount = (rawTotal * discountPercent) / 100
        val totalPayable = rawTotal - discountAmount

        val ussdMtnCode = buildMtnUssdCode(totalPayable)
        val ussdAirtelCode = buildAirtelUssdCode(totalPayable)

        return SubscriptionPriceBreakdown(
            branchCount = effectiveBranches,
            branchBasePrice = branchBasePrice,
            branchTierName = branchTierName,
            workerCount = effectiveWorkers,
            workerFee = workerFee,
            workerTierName = workerTierName,
            deviceCount = effectiveDevices,
            extraDevicesCount = extraDevices,
            deviceFee = deviceFee,
            deviceTierName = deviceTierName,
            monthlySubtotal = monthlySubtotal,
            durationMonths = durationMonths,
            discountPercent = discountPercent,
            discountAmount = discountAmount,
            totalPayable = totalPayable,
            ussdMtnCode = ussdMtnCode,
            ussdAirtelCode = ussdAirtelCode
        )
    }

    /**
     * Dials MTN Mobile Money USSD with exact dynamic payment amount & Admin's live MTN config.
     */
    fun dialMtnMoMo(context: Context, amount: Int) {
        val cfg = getCurrentPaymentConfig()
        PaymentGatewayManager.dialMtnMoMo(context, amount, cfg.mtnMoMoCode, cfg.mtnMoMoPhone)
    }

    /**
     * Dials Airtel Money USSD with exact dynamic payment amount & Admin's live Airtel number.
     */
    fun dialAirtelMoney(context: Context, amount: Int) {
        val cfg = getCurrentPaymentConfig()
        PaymentGatewayManager.dialAirtelMoney(context, amount, cfg.airtelMoneyPhone)
    }

    /**
     * Generates a unique offline Device Challenge Code for this shop.
     */
    fun getDeviceChallengeCode(shopProfile: ShopProfile): String {
        return SubscriptionSecurityManager.computeDeviceChallenge(shopProfile)
    }

    /**
     * Validates an offline activation voucher or unlock token against branch & worker tiers
     * using cryptographic HMAC-SHA256 signature verification and device binding.
     */
    fun validateVoucherCode(
        inputCode: String,
        shopProfile: ShopProfile,
        branchCount: Int = 1,
        workerCount: Int = 1,
        ownerUsername: String = "",
        ownerPhoneOverride: String = ""
    ): VoucherValidationResult {
        return SubscriptionSecurityManager.verifyVoucherToken(
            voucherInput = inputCode,
            shopProfile = shopProfile,
            branchCount = branchCount,
            workerCount = workerCount,
            ownerUsername = ownerUsername,
            ownerPhoneOverride = ownerPhoneOverride
        )
    }

    /**
     * Legacy synchronous adapter. This client-side path cannot verify a payment with
     * MTN, Airtel or a provider API, so it never creates a pending or successful claim.
     * New subscription payments must use the secure hosted-checkout workflow.
     */
    @Suppress("UNUSED_PARAMETER")
    fun processDirectMoMoPayment(
        shopProfile: ShopProfile,
        payerPhone: String,
        provider: String,
        branchCount: Int,
        workerCount: Int,
        durationMonths: Int,
        deviceCount: Int = 1,
        smsTransactionReference: String? = null,
        alreadyUsedRefs: Set<String> = emptySet()
    ): PaymentProcessingResult {
        val effectivePayer = payerPhone.trim().ifBlank { shopProfile.phone }
        val timestamp = System.currentTimeMillis()
        val (phoneValid, normalizedPhone) = MoMoPaymentGateway.validateRwandaPhoneNumber(effectivePayer, provider)
        return PaymentProcessingResult(
            isSuccess = false,
            isPending = false,
            transactionRef = "",
            financialId = null,
            amountPaid = 0,
            planDays = 0,
            provider = provider,
            payerPhone = if (phoneValid) normalizedPhone else effectivePayer,
            timestamp = timestamp,
            message = if (!phoneValid) normalizedPhone
            else "Unverified SMS references and USSD prompts cannot establish payment. Open BeBoss secure hosted checkout for a provider-verified transaction."
        )
    }

    /**
     * Executes asynchronous payment verification using real gateway endpoints.
     */
    suspend fun processMoMoPaymentAsync(
        context: Context,
        shopProfile: ShopProfile,
        payerPhone: String,
        provider: String,
        branchCount: Int,
        workerCount: Int,
        durationMonths: Int,
        deviceCount: Int = 1,
        userEnteredReference: String? = null,
        alreadyUsedRefs: Set<String> = emptySet()
    ): PaymentProcessingResult {
        val pricing = calculateSubscriptionPrice(branchCount, workerCount, durationMonths, deviceCount)
        val planDays = durationMonths * 30
        val timestamp = System.currentTimeMillis()

        val gatewayRes = MoMoPaymentGateway.executePaymentRequest(
            context = context,
            shopProfile = shopProfile,
            payerPhone = payerPhone,
            provider = provider,
            amount = pricing.totalPayable,
            description = "BeBoss ${pricing.branchTierName} ($durationMonths mo, $deviceCount devices)",
            userEnteredReference = userEnteredReference,
            alreadyUsedRefs = alreadyUsedRefs
        )

        return PaymentProcessingResult(
            isSuccess = gatewayRes.isSuccess,
            isPending = gatewayRes.isPending,
            transactionRef = gatewayRes.transactionReference,
            financialId = gatewayRes.financialId,
            amountPaid = if (gatewayRes.isSuccess) pricing.totalPayable else 0,
            planDays = if (gatewayRes.isSuccess) planDays else 0,
            provider = provider,
            payerPhone = gatewayRes.payerPhone,
            timestamp = timestamp,
            message = gatewayRes.message
        )
    }

    /**
     * Builds the WhatsApp payment proof message containing the shop owner's
     * created account username, registered phone, payer phone, payer registered MoMo names,
     * USSD amount, tier & device count, and device code.
     */
    fun buildPaymentProofWhatsAppMessage(
        shopProfile: ShopProfile,
        ownerUsername: String,
        registeredPhone: String,
        provider: String,
        ussdCode: String,
        amountRwf: Int,
        durationMonths: Int,
        branchCount: Int,
        workerCount: Int,
        deviceCount: Int = 1,
        payerPhone: String = "",
        payerFullName: String = "",
        requestId: String = "",
        paymentTimeMs: Long = System.currentTimeMillis(),
        paymentNote: String = ""
    ): String {
        val deviceCode = getDeviceChallengeCode(shopProfile)
        return buildString {
            append("*BEBOSS SUBSCRIPTION PAYMENT VERIFICATION*\n")
            append("====================\n")
            append("• *Shop Name:* ${shopProfile.shopName}\n")
            append("• *Account Username:* ${ownerUsername.ifBlank { "owner" }}\n")
            append("• *Registered Shop Phone:* ${registeredPhone.ifBlank { shopProfile.phone }}\n")
            append("• *Sender MoMo Phone:* ${payerPhone.ifBlank { registeredPhone.ifBlank { shopProfile.phone } }}\n")
            if (payerFullName.isNotBlank()) {
                append("• *Names on Sender Phone:* ${payerFullName.trim()}\n")
            }
            append("• *Device Code:* $deviceCode\n")
            append("====================\n")
            append("• *Provider:* $provider\n")
            append("• *USSD Dialed:* $ussdCode\n")
            append("• *Amount Paid:* $amountRwf FRw\n")
            append("• *Tier:* $branchCount Branch(es) • $workerCount Staff • $deviceCount Device(s) ($durationMonths Month(s))\n")
            append("• *Payment Time:* " + java.text.SimpleDateFormat("dd MMM yyyy, HH:mm", java.util.Locale.getDefault()).format(java.util.Date(paymentTimeMs)) + "\n")
            if (paymentNote.isNotBlank()) append("• *Payment Note:* " + paymentNote.trim() + "\n")
            if (requestId.isNotBlank()) {
                append("• *Request ID:* ${requestId.take(8).uppercase()}\n")
            }
            append("====================\n")
            append("Please confirm receipt on your phone and either send my Unlock Code or Auto-Unlock my shop in Admin Dashboard. Murakoze!")
        }
    }

    fun sendPaymentProofViaWhatsApp(
        context: Context,
        shopProfile: ShopProfile,
        ownerUsername: String,
        registeredPhone: String,
        provider: String,
        ussdCode: String,
        amountRwf: Int,
        durationMonths: Int,
        branchCount: Int,
        workerCount: Int,
        deviceCount: Int = 1,
        payerPhone: String = "",
        payerFullName: String = "",
        requestId: String = "",
        paymentTimeMs: Long = System.currentTimeMillis(),
        paymentNote: String = "",
        adminWhatsAppNumber: String = ""
    ) {
        val resolvedAdminWa = adminWhatsAppNumber.trim()
            .ifBlank { shopProfile.adminWhatsAppNumber.trim() }
            .ifBlank { getCurrentPaymentConfig().adminWhatsAppNumber }

        val msg = buildPaymentProofWhatsAppMessage(
            shopProfile = shopProfile,
            ownerUsername = ownerUsername,
            registeredPhone = registeredPhone,
            provider = provider,
            ussdCode = ussdCode,
            amountRwf = amountRwf,
            durationMonths = durationMonths,
            branchCount = branchCount,
            workerCount = workerCount,
            deviceCount = deviceCount,
            payerPhone = payerPhone,
            payerFullName = payerFullName,
            requestId = requestId,
            paymentTimeMs = paymentTimeMs,
            paymentNote = paymentNote
        )
        if (resolvedAdminWa.isBlank()) {
            Toast.makeText(
                context,
                "Admin WhatsApp number not yet configured. Check Admin Config or Secrets.",
                Toast.LENGTH_LONG
            ).show()
            return
        }
        PdfReportGenerator.sendWhatsAppDirect(context, resolvedAdminWa, msg)
    }

    fun buildAdminUnlockReplyWhatsAppMessage(
        shopName: String,
        username: String,
        unlockCode: String,
        daysAdded: Int,
        tierName: String
    ): String {
        return """
            *BEBOSS SUBSCRIPTION APPROVED!*
            ====================
            Hello *@$username* ($shopName),
            Your Mobile Money payment has been verified!

            *Your Unlock Code:*
            `$unlockCode`

            • *Plan:* $tierName
            • *Duration Added:* +$daysAdded Days

            *How to Activate:*
            Open BeBoss App -> *Settings* -> *Insert Unlock Code* -> Paste the code above and tap *Verify & Activate*.
            Murakoze gukoresha BeBoss!
        """.trimIndent()
    }

    /**
     * Opens WhatsApp support chat with pre-filled subscription assistance message itemizing branches and staff.
     */
    fun contactSupportViaWhatsApp(
        context: Context,
        shopProfile: ShopProfile,
        branches: List<Branch>,
        allUsers: List<User>,
        customMsg: String? = null,
        deviceCount: Int = 1
    ) {
        val deviceCode = getDeviceChallengeCode(shopProfile)
        val ownerUser = allUsers.firstOrNull { it.role.name == "OWNER" } ?: allUsers.firstOrNull()
        val effectiveDevices = deviceCount.coerceAtLeast(1)
        val pricing = calculateSubscriptionPrice(branches.size, allUsers.size, 1, effectiveDevices)

        val defaultText = """
            Hello BeBoss Official Support,
            I want to activate / renew my shop's subscription:

            • Shop Name: ${shopProfile.shopName}
            • Account Username: ${ownerUser?.username ?: "owner"}
            • Owner: ${shopProfile.name} (${shopProfile.phone})
            • Active Branches: ${branches.size} (${pricing.branchTierName})
            • Registered Staff: ${allUsers.size} (${pricing.workerTierName})
            • Shop Devices: $effectiveDevices (${pricing.deviceTierName})
            • Monthly Calculated Fee: ${pricing.totalPayable} FRw
            • Device Challenge Code: $deviceCode

            Please send my unlock activation code or verify my payment. Murakoze!
        """.trimIndent()

        val textToSend = customMsg ?: defaultText
        val supportNumber = shopProfile.adminWhatsAppNumber.trim()
            .ifBlank { getCurrentPaymentConfig().adminWhatsAppNumber }
        if (supportNumber.isBlank()) {
            Toast.makeText(
                context,
                "Support WhatsApp number is not configured yet.",
                Toast.LENGTH_LONG
            ).show()
            return
        }
        PdfReportGenerator.sendWhatsAppDirect(context, supportNumber, textToSend)
    }

    /**
     * Shares the BeBoss POS app (APK) offline via Bluetooth, Nearby Share, or File Transfer.
     */
    fun shareAppApkOffline(context: Context) {
        try {
            val appInfo = context.applicationInfo
            val originalApk = File(appInfo.sourceDir)
            val cacheApk = File(context.cacheDir, "BeBoss_Offline_POS.apk")

            originalApk.copyTo(cacheApk, overwrite = true)

            val uri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                cacheApk
            )

            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/vnd.android.package-archive"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, "BeBoss Multi-Branch POS")
                putExtra(Intent.EXTRA_TEXT, "Install BeBoss POS on your device to manage inventory, branches, sales, and staff. Works 100% offline with auto-cloud sync!")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            context.startActivity(Intent.createChooser(intent, "Share BeBoss App via Bluetooth / Share..."))
        } catch (e: Exception) {
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, "BeBoss Multi-Branch POS — Local Android management for shops and multi-branch stores.")
            }
            context.startActivity(Intent.createChooser(shareIntent, "Share BeBoss App..."))
        }
    }
}
