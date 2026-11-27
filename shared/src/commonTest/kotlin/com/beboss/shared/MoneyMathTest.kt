package com.beboss.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class MoneyMathTest {
    @Test
    fun roundsDecimalHalfUpLikeAndroidBigDecimalValueOf() {
        assertEquals(101L, MoneyMath.toCents(1.005))
        assertEquals(100L, MoneyMath.toCents(1.0049))
        assertEquals(1L, MoneyMath.toCents(0.005))
        assertEquals(0L, MoneyMath.toCents(0.0049))
        assertEquals(-101L, MoneyMath.toSignedCents(-1.005))
    }

    @Test
    fun handlesScientificNotationAndLargeMinorUnits() {
        assertEquals(1L, MoneyMath.toSignedCents(5e-3))
        assertEquals(0L, MoneyMath.toSignedCents(5e-4))
        assertEquals(123456789000L, MoneyMath.toCents(1.23456789e9))
    }

    @Test
    fun multipliesPriceAndQuantityBeforeRounding() {
        assertEquals(201L, MoneyMath.multiplyPriceQuantityCents(1.005, 2.0))
        assertEquals(300L, MoneyMath.multiplyPriceQuantityCents(1.999, 1.5))
        assertEquals(0L, MoneyMath.multiplyPriceQuantityCents(-1.0, 2.0))
    }

    @Test
    fun appliesExistingNonFiniteAndNegativeRules() {
        assertEquals(0L, MoneyMath.toCents(-1.0))
        assertEquals(0L, MoneyMath.toCents(Double.NaN))
        assertEquals(0L, MoneyMath.toSignedCents(Double.POSITIVE_INFINITY))
        assertEquals(0.0, MoneyMath.roundMoney(Double.NaN))
        assertEquals(12.34, MoneyMath.centsToDouble(1234L))
    }

    @Test
    fun detectsOverflowInsteadOfWrapping() {
        assertFailsWith<ArithmeticException> {
            MoneyMath.toCents(Double.MAX_VALUE)
        }
        assertFailsWith<ArithmeticException> {
            MoneyMath.toSignedCents(-Double.MAX_VALUE)
        }
    }
}
