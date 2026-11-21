package com.beboss.shopmgmt.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.nio.charset.StandardCharsets
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SubscriptionSecurityManagerTest {

    private fun createSignedBb3Code(
        username: String,
        phone: String,
        tier: String = "SINGLE",
        days: Int = 30,
        nowMs: Long = System.currentTimeMillis()
    ): Pair<String, KeyPair> {
        val keyPairGenerator = KeyPairGenerator.getInstance("EC")
        keyPairGenerator.initialize(ECGenParameterSpec("secp256r1"))
        val keyPair = keyPairGenerator.generateKeyPair()
        val accountHash = SubscriptionSecurityManager.computeAccountBindingHash(username, phone)
        val expiryHex = ((nowMs / 86_400_000L) + 14).toString(16).uppercase()
        val nonce = ByteArray(12).also { java.security.SecureRandom().nextBytes(it) }
            .joinToString("") { "%02X".format(it) }
        val payload = "BB3:$tier:$days:$expiryHex:$accountHash:$nonce"
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(keyPair.private)
        signer.update(payload.toByteArray(StandardCharsets.UTF_8))
        val signature = Base64.getEncoder().encodeToString(signer.sign())
        return Pair("BB3-$tier-$days-$expiryHex-$accountHash-$nonce-$signature", keyPair)
    }

    @Test
    fun testBB3PublicKeyVerificationAndAccountBinding() {
        val username = "testshop"
        val phone = "+250788123456"
        val (code, keyPair) = createSignedBb3Code(username, phone)

        assertTrue("BB3 code should be recognized", SubscriptionSecurityManager.isCompleteUnlockCodeFormat(code))
        assertTrue(
            "Valid BB3 signature should verify",
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(code, username, phone, keyPair.public)
        )
        assertFalse(
            "A different username must fail",
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(code, "other-shop", phone, keyPair.public)
        )
        assertFalse(
            "A different phone must fail",
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(code, username, "+250788999999", keyPair.public)
        )
        val tampered = code.dropLast(3) + "AAA"
        assertFalse(
            "A modified signature must fail",
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(tampered, username, phone, keyPair.public)
        )
    }

    @Test
    fun testBB3ExpiryIsEnforced() {
        val now = System.currentTimeMillis()
        val (code, keyPair) = createSignedBb3Code("testshop", "+250788123456", nowMs = now)
        assertTrue(
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(
                code, "testshop", "+250788123456", keyPair.public, now
            )
        )
        assertFalse(
            "Expired BB3 codes must be rejected",
            SubscriptionSecurityManager.verifyBB3CodeWithPublicKey(
                code, "testshop", "+250788123456", keyPair.public, now + 16L * 86_400_000L
            )
        )
    }

    @Test
    fun testPhoneNormalization() {
        assertEquals("788123456", SubscriptionSecurityManager.normalizePhoneLast9("+250788123456"))
        assertEquals("788123456", SubscriptionSecurityManager.normalizePhoneLast9("0788123456"))
        assertEquals("788123456", SubscriptionSecurityManager.normalizePhoneLast9("788123456"))
    }

    @Test
    fun testAccountBindingHashConsistency() {
        val hash1 = SubscriptionSecurityManager.computeAccountBindingHash("testshop", "+250788123456")
        val hash2 = SubscriptionSecurityManager.computeAccountBindingHash("testshop", "0788123456")
        val hash3 = SubscriptionSecurityManager.computeAccountBindingHash("testshop", "788123456")
        assertEquals(hash1, hash2)
        assertEquals(hash1, hash3)
        assertEquals(6, hash1.length)
    }

    @Test
    fun testUnlockCodeFormatValidation() {
        val signature = Base64.getEncoder().encodeToString(ByteArray(70) { 1 })
        val validBb3 = "BB3-SINGLE-30-1A2B3C-4D5E6F-0123456789ABCDEF01234567-$signature"
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(validBb3))

        val validLegacyBb2 = "BB2-SINGLE-30-1A2B3C-4D5E6F-7A8B9C0D"
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(validLegacyBb2))

        val validHardwareCode = "BB-SINGLE-30-1A2B3C-12345-7A8B9C0D"
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(validHardwareCode))

        assertFalse(SubscriptionSecurityManager.isCompleteUnlockCodeFormat("XX-SINGLE-30-1A2B3C-4D5E6F-7A8B9C0D"))
        assertFalse(SubscriptionSecurityManager.isCompleteUnlockCodeFormat("BB3-SINGLE-30"))
        assertFalse(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(""))
    }

    @Test
    fun testLegacyBB2RequiresOnlineIssuedRecord() {
        val profile = com.beboss.shopmgmt.data.model.ShopProfile(
            id = 1L,
            shopName = "Test Shop",
            phone = "+250788123456",
            name = "Test Owner"
        )
        val legacy = "BB2-SINGLE-30-1A2B3C-4D5E6F-7A8B9C0D"
        val result = SubscriptionSecurityManager.verifyVoucherToken(
            voucherInput = legacy,
            shopProfile = profile,
            ownerUsername = "testshop",
            ownerPhoneOverride = "+250788123456"
        )
        assertFalse(result.isValid)
        assertTrue(result.message.contains("internet", ignoreCase = true))
    }

    @Test
    fun testVoucherFingerprint() {
        val code = "BB2-SINGLE-30-1A2B3C-4D5E6F-7A8B9C0D"
        val fingerprint = SubscriptionSecurityManager.computeVoucherFingerprint(code)
        assertEquals(64, fingerprint.length)
        assertEquals(fingerprint, SubscriptionSecurityManager.computeVoucherFingerprint(code))
        val other = SubscriptionSecurityManager.computeVoucherFingerprint("BB2-SINGLE-30-1A2B3C-4D5E6F-7A8B9C0E")
        assertNotEquals(fingerprint, other)
    }

    @Test
    fun testBB3FingerprintPreservesCaseSensitiveSignature() {
        val signature = Base64.getEncoder().encodeToString(ByteArray(70) { it.toByte() })
        val code = "BB3-SINGLE-30-1A2B3C-4D5E6F-0123456789ABCDEF01234567-$signature"
        val changedSignature = signature.map { ch ->
            when {
                ch.isUpperCase() -> ch.lowercaseChar()
                ch.isLowerCase() -> ch.uppercaseChar()
                else -> ch
            }
        }.joinToString("")
        val changedCase = code.substringBeforeLast("-") + "-" + changedSignature
        assertNotEquals(
            "Base64 signature case is significant and must not be uppercased before hashing",
            SubscriptionSecurityManager.computeVoucherFingerprint(code),
            SubscriptionSecurityManager.computeVoucherFingerprint(changedCase)
        )
    }

    @Test
    fun testDeviceChallengeConsistency() {
        val profile = com.beboss.shopmgmt.data.model.ShopProfile(
            id = 1L,
            shopName = "Test Shop",
            phone = "+250788123456",
            name = "Test Owner"
        )
        val challenge1 = SubscriptionSecurityManager.computeDeviceChallenge(profile)
        val challenge2 = SubscriptionSecurityManager.computeDeviceChallenge(profile)
        assertEquals(challenge1, challenge2)
        assertTrue(challenge1.startsWith("BB-"))
    }

    @Test
    fun testGenerateSecureTokenNonce() {
        val nonce1 = SubscriptionSecurityManager.generateSecureTokenNonce(8)
        val nonce2 = SubscriptionSecurityManager.generateSecureTokenNonce(8)
        assertEquals(16, nonce1.length)
        assertEquals(16, nonce2.length)
        assertNotEquals(nonce1, nonce2)
    }
}
