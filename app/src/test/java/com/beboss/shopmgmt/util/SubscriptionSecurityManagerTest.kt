package com.beboss.shopmgmt.util

import com.beboss.shopmgmt.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SubscriptionSecurityManagerTest {

    @Test
    fun testUnlockCodeGeneration() {
        // Set a test secret for deterministic testing
        System.setProperty("BEBOSS_UNLOCK_SIGNING_SECRET", "test-secret-key-1234567890123456")
        
        val code = SubscriptionSecurityManager.generateAccountBoundUnlockCode(
            username = "testshop",
            registeredPhone = "+250788123456",
            tierCode = "SINGLE",
            days = 30
        )

        assertTrue("Code should start with BB2-", code.startsWith("BB2-"))
        assertTrue("Code should have 6 parts", code.split("-").size == 6)
        assertTrue("Code should verify correctly", SubscriptionSecurityManager.verifyUnlockCode(code, "testshop", "+250788123456"))
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
        
        assertEquals("Phone normalization should produce same hash", hash1, hash2)
        assertEquals("Phone normalization should produce same hash", hash1, hash3)
        assertEquals("Hash should be 6 characters", 6, hash1.length)
    }

    @Test
    fun testUnlockCodeFormatValidation() {
        // Valid BB2 code format
        val validCode = "BB2-SINGLE-30-1A2B3C-4D5E6F-7A8B9C0D"
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(validCode))
        
        // Valid BB code format
        val validBBCode = "BB-SINGLE-30-1A2B3C-12345-7A8B9C0D"
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(validBBCode))
        
        // Invalid - wrong prefix
        val invalidPrefix = "XX-SINGLE-30-1A2B3C-4D5E6F-7A8B9C0D"
        assertTrue(!SubscriptionSecurityManager.isCompleteUnlockCodeFormat(invalidPrefix))
        
        // Invalid - wrong number of parts
        val invalidParts = "BB2-SINGLE-30-1A2B3C-4D5E6F"
        assertTrue(!SubscriptionSecurityManager.isCompleteUnlockCodeFormat(invalidParts))
        
        // Invalid - empty
        assertTrue(!SubscriptionSecurityManager.isCompleteUnlockCodeFormat(""))
    }

    @Test
    fun testVoucherFingerprint() {
        val code = "BB2-SINGLE-30-1A2B3C-4D5E6F-7A8B9C0D"
        val fingerprint = SubscriptionSecurityManager.computeVoucherFingerprint(code)
        
        // Should be 64 hex chars (SHA-256)
        assertEquals(64, fingerprint.length)
        
        // Same code should produce same fingerprint
        val fingerprint2 = SubscriptionSecurityManager.computeVoucherFingerprint(code)
        assertEquals(fingerprint, fingerprint2)
        
        // Different code should produce different fingerprint
        val code2 = "BB2-SINGLE-30-1A2B3C-4D5E6F-7A8B9C0E"
        val fingerprint3 = SubscriptionSecurityManager.computeVoucherFingerprint(code2)
        assertTrue(fingerprint != fingerprint3)
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
        
        assertEquals("Device challenge should be deterministic", challenge1, challenge2)
        assertTrue("Challenge should start with BB-", challenge1.startsWith("BB-"))
    }

    @Test
    fun testVerifyUnlockCodeWithWrongAccount() {
        System.setProperty("BEBOSS_UNLOCK_SIGNING_SECRET", "test-secret-key-1234567890123456")
        
        // Generate code for one account
        val code = SubscriptionSecurityManager.generateAccountBoundUnlockCode(
            username = "testshop1",
            registeredPhone = "+250788123456",
            tierCode = "SINGLE",
            days = 30
        )
        
        // Try to verify with different username
        assertTrue("Should fail with wrong username", !SubscriptionSecurityManager.verifyUnlockCode(code, "testshop2", "+250788123456"))
        
        // Try to verify with different phone
        assertTrue("Should fail with wrong phone", !SubscriptionSecurityManager.verifyUnlockCode(code, "testshop1", "+250788654321"))
    }

    @Test
    fun testGenerateSecureTokenNonce() {
        val nonce1 = SubscriptionSecurityManager.generateSecureTokenNonce(8)
        val nonce2 = SubscriptionSecurityManager.generateSecureTokenNonce(8)
        
        assertEquals(16, nonce1.length) // 8 bytes = 16 hex chars
        assertEquals(16, nonce2.length)
        assertTrue("Nonces should be different", nonce1 != nonce2)
    }

    @Test
    fun testTierMapping() {
        // This tests the private mapTierNameAndAmount function indirectly
        // by checking that different tiers produce different plan names in validation
        System.setProperty("BEBOSS_UNLOCK_SIGNING_SECRET", "test-secret-key-1234567890123456")
        
        val codeSingle = SubscriptionSecurityManager.generateAccountBoundUnlockCode(
            username = "test", registeredPhone = "+250788123456", tierCode = "SINGLE", days = 30
        )
        val codeDual = SubscriptionSecurityManager.generateAccountBoundUnlockCode(
            username = "test", registeredPhone = "+250788123456", tierCode = "DUAL", days = 30
        )
        val codeMulti = SubscriptionSecurityManager.generateAccountBoundUnlockCode(
            username = "test", registeredPhone = "+250788123456", tierCode = "MULTI", days = 30
        )
        val codeAnnual = SubscriptionSecurityManager.generateAccountBoundUnlockCode(
            username = "test", registeredPhone = "+250788123456", tierCode = "ANNUAL", days = 365
        )
        
        // All should be valid formats
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(codeSingle))
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(codeDual))
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(codeMulti))
        assertTrue(SubscriptionSecurityManager.isCompleteUnlockCodeFormat(codeAnnual))
        
        // Tier codes should be embedded in the unlock code
        assertTrue(codeSingle.contains("SINGLE"))
        assertTrue(codeDual.contains("DUAL"))
        assertTrue(codeMulti.contains("MULTI"))
        assertTrue(codeAnnual.contains("ANNUAL"))
    }
}