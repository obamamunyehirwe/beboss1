package com.beboss.shopmgmt.util

import com.beboss.shared.MoneyMath

/**
 * Android compatibility facade.
 *
 * Currency calculations now come from the Kotlin Multiplatform core, so the
 * Android POS and the iOS client execute the same rounding and line-total code.
 */
object MoneyUtils {
    fun toCents(amount: Double): Long = MoneyMath.toCents(amount)

    fun toSignedCents(amount: Double): Long = MoneyMath.toSignedCents(amount)

    fun centsToDouble(cents: Long): Double = MoneyMath.centsToDouble(cents)

    fun multiplyPriceQuantityCents(unitPrice: Double, quantity: Double): Long =
        MoneyMath.multiplyPriceQuantityCents(unitPrice, quantity)

    fun roundMoney(amount: Double): Double = MoneyMath.roundMoney(amount)
}
