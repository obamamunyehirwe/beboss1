package com.beboss.shopmgmt

import com.beboss.shopmgmt.data.model.CartItem
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.ui.viewmodel.CartState
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.Localization
import com.beboss.shopmgmt.util.ReceiptGenerator
import com.beboss.shopmgmt.util.SubscriptionSecurityManager
import com.beboss.shopmgmt.util.SyncPayloadValidator
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.nio.charset.StandardCharsets
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class BeBossHardeningTest {

    private fun createBb3Code(
        username: String,
        phone: String,
        tier: String,
        days: Int
    ): Pair<String, java.security.KeyPair> {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec("secp256r1"))
        val pair = generator.generateKeyPair()
        val accountHash = SubscriptionSecurityManager.computeAccountBindingHash(username, phone)
        val expiryHex = ((System.currentTimeMillis() / 86_400_000L) + 14).toString(16).uppercase()
        val nonce = ByteArray(12).also { java.security.SecureRandom().nextBytes(it) }
            .joinToString("") { "%02X".format(it) }
        val payload = "BB3:$tier:$days:$expiryHex:$accountHash:$nonce"
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(pair.private)
        signer.update(payload.toByteArray(StandardCharsets.UTF_8))
        val signature = Base64.getEncoder().encodeToString(signer.sign())
        return Pair("BB3-$tier-$days-$expiryHex-$accountHash-$nonce-$signature", pair)
    }

    @Test
    fun testNewShopStartsWithMandatoryFourDayFreeTrial() {
        val freshShop = ShopProfile(shopName = "Kigali Tech Shop")
        assertEquals(ShopProfile.STATUS_TRIAL, freshShop.subscriptionStatus)
        assertEquals("FREE-TRIAL-4D", freshShop.lastPaymentRef)
        assertEquals(0, freshShop.lastPaymentAmount)
        assertTrue(freshShop.isFreeTrial)
        assertTrue(freshShop.isSubscriptionActive)
        assertFalse(freshShop.isPaidActive)
        assertFalse(freshShop.isGracePeriod)
        assertTrue(freshShop.daysRemaining in 1..ShopProfile.FREE_TRIAL_DAYS)
    }

    @Test
    fun testFourDayTrialHardLocksImmediatelyUponExpiryWithoutGraceBypass() {
        val now = ClockGuard.effectiveNowMs()
        val expiredTrial = ShopProfile(
            shopName = "Expired Trial Store",
            subscriptionStatus = ShopProfile.STATUS_TRIAL,
            subscriptionExpiresAt = now - 1_000L
        )
        assertFalse(expiredTrial.isSubscriptionActive)
        assertFalse(expiredTrial.isGracePeriod)
        assertFalse(expiredTrial.isFreeTrial)
        assertEquals(0, expiredTrial.daysRemaining)
    }

    @Test
    fun testRemoteSuspensionAndExpiredStatusImmediatelyLockShopEvenWithFutureExpiry() {
        val futureExpiry = ClockGuard.effectiveNowMs() + 30L * 86_400_000L

        val suspendedShop = ShopProfile(
            shopName = "Suspended Shop",
            subscriptionStatus = ShopProfile.STATUS_SUSPENDED,
            subscriptionExpiresAt = futureExpiry
        )
        assertTrue(suspendedShop.isSuspended)
        assertFalse(suspendedShop.isSubscriptionActive)

        val remotelyExpiredShop = ShopProfile(
            shopName = "Expired Shop",
            subscriptionStatus = ShopProfile.STATUS_EXPIRED,
            subscriptionExpiresAt = futureExpiry
        )
        assertFalse(remotelyExpiredShop.isSubscriptionActive)
    }

    @Test
    fun testSyncPayloadValidatorRejectsUnsupportedSchemaOrphanFkAndNegativePrices() {
        val futureSchema = JSONObject().apply {
            put("schemaVersion", SyncPayloadValidator.CURRENT_SCHEMA_VERSION + 5)
            put("products", JSONArray())
        }
        val schemaEx = runCatching {
            SyncPayloadValidator.validateAndParseRoot(futureSchema.toString())
        }.exceptionOrNull()
        assertTrue(schemaEx is IllegalArgumentException)
        assertTrue(schemaEx?.message?.contains("schema version", ignoreCase = true) == true)

        val orphanItemPayload = JSONObject().apply {
            put("schemaVersion", SyncPayloadValidator.CURRENT_SCHEMA_VERSION)
            put("sales", JSONArray().put(JSONObject().apply {
                put("id", "sale-1")
                put("totalAmount", 5000.0)
                put("amountPaid", 5000.0)
            }))
            put("saleItems", JSONArray().put(JSONObject().apply {
                put("id", "item-1")
                put("saleId", "sale-missing")
                put("quantitySold", 1.0)
                put("subtotal", 5000.0)
            }))
        }
        val orphanEx = runCatching {
            SyncPayloadValidator.validateAndParseRoot(orphanItemPayload.toString())
        }.exceptionOrNull()
        assertTrue(orphanEx is IllegalArgumentException)
        assertTrue(orphanEx?.message?.contains("orphan", ignoreCase = true) == true)

        val negativePricePayload = JSONObject().apply {
            put("schemaVersion", SyncPayloadValidator.CURRENT_SCHEMA_VERSION)
            put("products", JSONArray().put(JSONObject().apply {
                put("id", "prod-1")
                put("name", "Sugar 1kg")
                put("sellingPrice", -500.0)
                put("costPrice", 1000.0)
                put("quantityInStock", 10.0)
            }))
        }
        val negativeEx = runCatching {
            SyncPayloadValidator.validateAndParseRoot(negativePricePayload.toString())
        }.exceptionOrNull()
        assertTrue(negativeEx is IllegalArgumentException)
    }

    @Test
    fun testOfflineReceiptSealVerificationAndTamperDetection() {
        val profile = ShopProfile(shopName = "BeBoss Pharmacy", tinNumber = "105588990")
        val sale = Sale(
            id = "sale-uuid-001",
            receiptNumber = "REC-2026-001",
            saleDate = 1_760_000_000_000L,
            totalAmount = 12_500.0,
            amountPaid = 12_500.0,
            branchId = "main_branch",
            cashierId = "cashier_1"
        )
        val seal = ReceiptGenerator.computeOfflineReceiptSeal(sale, profile)
        assertTrue(seal.startsWith("BB-"))
        assertTrue(ReceiptGenerator.verifyOfflineReceiptSeal(sale, profile, seal))
        assertFalse(ReceiptGenerator.verifyOfflineReceiptSeal(sale.copy(totalAmount = 1_250.0), profile, seal))
        assertFalse(ReceiptGenerator.verifyOfflineReceiptSeal(sale, profile, "BB-0000000000"))
    }

    @Test
    fun testSplitPaymentCartMathUsesExactCents() {
        val product = Product(
            id = "p1",
            name = "Rice 5kg",
            costPrice = 6000.0,
            sellingPrice = 7500.0,
            quantityInStock = 20.0
        )
        val cart = CartState(
            items = listOf(CartItem(product = product, quantity = 2.0)),
            paymentMethod = "SPLIT",
            splitCashInput = "10000",
            splitMomoInput = "5000"
        )
        assertEquals(15_000.0, cart.netTotal, 0.001)
        assertEquals(15_000.0, cart.splitTotalPaid, 0.001)
        assertEquals(0.0, cart.splitRemainingAmount, 0.001)
        assertEquals(15_000.0, cart.effectiveAmountPaid, 0.001)
    }

    @Test
    fun testAllFourLanguagesHaveCompleteOfflineTranslations() {
        val allKeys = Localization.allKeys()
        assertTrue("Expected rich localization catalog (>=150 keys)", allKeys.size >= 150)

        for (lang in AppLanguage.entries) {
            for (key in allKeys) {
                assertTrue(
                    "Missing translation for key='$key' in language=${lang.name}",
                    Localization.hasTranslation(key, lang)
                )
                val resolved = Localization.get(key, lang)
                assertTrue("Blank value for key='$key' in ${lang.name}", resolved.isNotBlank())
                assertNotEquals("Raw key leaked for key='$key' in ${lang.name}", key, resolved)
            }
        }

        // Verify language code resolution & cyclic next()
        assertEquals(AppLanguage.ENGLISH, AppLanguage.fromCode("en"))
        assertEquals(AppLanguage.KINYARWANDA, AppLanguage.fromCode("rw"))
        assertEquals(AppLanguage.FRENCH, AppLanguage.fromCode("fr"))
        assertEquals(AppLanguage.SWAHILI, AppLanguage.fromCode("sw"))
        assertEquals(AppLanguage.KINYARWANDA, AppLanguage.ENGLISH.next())
        assertEquals(AppLanguage.FRENCH, AppLanguage.KINYARWANDA.next())
        assertEquals(AppLanguage.SWAHILI, AppLanguage.FRENCH.next())
        assertEquals(AppLanguage.ENGLISH, AppLanguage.SWAHILI.next())
    }

    @Test
    fun testAccountBoundBB3UnlockCodeGenerationVerificationAndAntiReplay() {
        val (code, pair) = createBb3Code(
            username = "jeanpaul",
            phone = "+250 788 123 456",
            tier = "SINGLE",
            days = 30
        )

        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(code))
        assertFalse(SubscriptionSecurityManager.isCompleteUnlockCodeFormat("BB3-SINGLE-30"))
        assertFalse(SubscriptionSecurityManager.isCompleteUnlockCodeFormat("RANDOM-STRING"))

        val matchingPhone = "0788123456"
        assertTrue(
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(
                code, "JeanPaul", matchingPhone, pair.public
            )
        )

        assertFalse(
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(
                code, "otherowner", matchingPhone, pair.public
            )
        )
        assertFalse(
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(
                code, "jeanpaul", "0788999999", pair.public
            )
        )

        val fingerprint = SubscriptionSecurityManager.computeVoucherFingerprint(code)
        val profile = ShopProfile(shopName = "Jean Paul Store", phone = matchingPhone)
        val replayResult = SubscriptionSecurityManager.verifyVoucherToken(
            voucherInput = code,
            shopProfile = profile,
            alreadyRedeemedHashes = setOf(fingerprint),
            ownerUsername = "jeanpaul",
            ownerPhoneOverride = matchingPhone
        )
        assertFalse(replayResult.isValid)
        assertTrue(replayResult.message.contains("Anti-Replay"))
    }
}
