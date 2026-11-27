package com.beboss.shopmgmt.util

import com.beboss.shared.MoneyMath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SharedMoneyMathTest {
    @Test
    fun decimalCurrencyRoundingMatchesExistingAndroidRules() {
        assertEquals(101L, MoneyMath.toCents(1.005))
        assertEquals(100L, MoneyMath.toCents(1.0049))
        assertEquals(1L, MoneyMath.toCents(0.005))
        assertEquals(-101L, MoneyMath.toSignedCents(-1.005))
    }

    @Test
    fun priceTimesQuantityIsRoundedOnce() {
        assertEquals(201L, MoneyMath.multiplyPriceQuantityCents(1.005, 2.0))
        assertEquals(300L, MoneyMath.multiplyPriceQuantityCents(1.999, 1.5))
    }

    @Test
    fun invalidAndOverflowValuesDoNotWrap() {
        assertEquals(0L, MoneyMath.toCents(-1.0))
        assertEquals(0L, MoneyMath.toCents(Double.NaN))
        assertThrows(ArithmeticException::class.java) {
            MoneyMath.toSignedCents(Double.MAX_VALUE)
        }
    }
}
