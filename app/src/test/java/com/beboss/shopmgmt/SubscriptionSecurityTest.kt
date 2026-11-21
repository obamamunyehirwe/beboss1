package com.beboss.shopmgmt

import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.util.SubscriptionSecurityManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.StandardCharsets
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

class SubscriptionSecurityTest {

    private val sampleShop = ShopProfile(
        id = 1,
        name = "Jean Paul",
        shopName = "BeBoss Kigali Store",
        phone = "+250 788 123 456"
    )

    private fun createBb3Code(username: String, phone: String, tier: String, days: Int): Pair<String, java.security.KeyPair> {
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
    fun testValidCryptographicVoucherVerification() {
        val voucher = SubscriptionSecurityManager.generateCryptographicVoucher(
            shopProfile = sampleShop,
            tierCode = "SINGLE",
            days = 30,
            validityWindowDays = 7
        )

        val result = SubscriptionSecurityManager.verifyVoucherToken(
            voucherInput = voucher,
            shopProfile = sampleShop,
            branchCount = 1,
            workerCount = 1
        )

        assertTrue(result.isValid)
        assertTrue(result.daysToAdd >= 30)
    }

    @Test
    fun testTamperedVoucherSignatureRejected() {
        val validVoucher = SubscriptionSecurityManager.generateCryptographicVoucher(
            shopProfile = sampleShop,
            tierCode = "SINGLE",
            days = 30,
            validityWindowDays = 7
        )

        // Modify signature character
        val tampered = validVoucher.dropLast(2) + "99"

        val result = SubscriptionSecurityManager.verifyVoucherToken(
            voucherInput = tampered,
            shopProfile = sampleShop,
            branchCount = 1,
            workerCount = 1
        )

        assertFalse(result.isValid)
    }

    @Test
    fun testAntiReplayRejection() {
        val voucher = SubscriptionSecurityManager.generateCryptographicVoucher(
            shopProfile = sampleShop,
            tierCode = "SINGLE",
            days = 30,
            validityWindowDays = 7
        )

        val fingerprint = SubscriptionSecurityManager.computeVoucherFingerprint(voucher)
        val redeemedSet = setOf(fingerprint)

        // Second redemption attempt with same token must be blocked
        val result = SubscriptionSecurityManager.verifyVoucherToken(
            voucherInput = voucher,
            shopProfile = sampleShop,
            branchCount = 1,
            workerCount = 1,
            alreadyRedeemedHashes = redeemedSet
        )

        assertFalse(result.isValid)
        assertTrue(result.message.contains("Anti-Replay"))
    }

    @Test
    fun testDeviceChallengeBinding() {
        val otherShop = ShopProfile(
            id = 2,
            name = "Aline",
            shopName = "Nyabugogo Branch",
            phone = "+250 788 999 888"
        )

        // Generate voucher specifically for sampleShop
        val voucherForSample = SubscriptionSecurityManager.generateCryptographicVoucher(
            shopProfile = sampleShop,
            tierCode = "SINGLE",
            days = 30
        )

        // Attempt to apply to otherShop
        val result = SubscriptionSecurityManager.verifyVoucherToken(
            voucherInput = voucherForSample,
            shopProfile = otherShop,
            branchCount = 1,
            workerCount = 1
        )

        assertFalse(result.isValid)
    }

    @Test
    fun testBB3AccountBindingPhoneNormalizationAndSignatureTamperDetection() {
        val (code, pair) = createBb3Code(
            username = "JeanPaul",
            phone = "+250 788 123 456",
            tier = "MULTI",
            days = 30
        )
        assertTrue(code.startsWith("BB3-MULTI-30-"))
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(code))

        // Equivalent local Rwanda phone format verifies with the same normalized account hash.
        assertTrue(
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(
                code, "jeanpaul", "0788123456", pair.public
            )
        )

        assertFalse(
            "A BB3 signature must not verify for another username",
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(
                code, "other_owner", "0788123456", pair.public
            )
        )
        assertFalse(
            "A BB3 signature must not verify for another phone",
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(
                code, "jeanpaul", "0788999999", pair.public
            )
        )

        val tampered = code.dropLast(2) + "AA"
        assertFalse(
            "A changed BB3 signature must be rejected",
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(
                tampered, "jeanpaul", "0788123456", pair.public
            )
        )
    }

    @Test
    fun testLegacyWildcardCodesAndUnverifiedMomoRefsRejected() {
        val all000 = com.beboss.shopmgmt.util.OfflineSubscriptionManager.validateVoucherCode(
            inputCode = "ALL000",
            shopProfile = sampleShop,
            branchCount = 1,
            workerCount = 1,
            ownerUsername = "jeanpaul",
            ownerPhoneOverride = "0788123456"
        )
        assertFalse(all000.isValid)

        val all00 = SubscriptionSecurityManager.verifyVoucherToken(
            voucherInput = "ALL00",
            shopProfile = sampleShop,
            branchCount = 1,
            workerCount = 1,
            ownerUsername = "jeanpaul"
        )
        assertFalse(all00.isValid)

        val unverifiedOfflineMomo = com.beboss.shopmgmt.util.OfflineSubscriptionManager.processDirectMoMoPayment(
            shopProfile = sampleShop,
            payerPhone = "0788123456",
            provider = "MTN MoMo",
            branchCount = 1,
            workerCount = 1,
            durationMonths = 1,
            smsTransactionReference = "1829304756"
        )
        assertFalse(unverifiedOfflineMomo.isSuccess)
        assertTrue(unverifiedOfflineMomo.isPending)
    }
}
