package com.beboss.shared

import kotlin.math.roundToLong

/**
 * Cross-platform exact decimal-to-minor-unit conversion.
 *
 * Kotlin common code cannot use java.math.BigDecimal. Instead, the decimal
 * representation emitted by Double.toString() is parsed and rounded using
 * decimal digits, preserving the BigDecimal.valueOf(value) semantics used by
 * the Android POS without introducing binary floating-point rounding drift.
 */
object MoneyMath {
    private data class DecimalValue(
        val negative: Boolean,
        val digits: String,
        val scale: Int
    )

    private const val POSITIVE_LONG_LIMIT = "9223372036854775807"
    private const val NEGATIVE_LONG_LIMIT = "9223372036854775808"

    fun toCents(amount: Double): Long {
        if (!amount.isFinite() || amount <= 0.0) return 0L
        return toScaledLong(parseDecimal(amount), 2)
    }

    fun toSignedCents(amount: Double): Long {
        if (!amount.isFinite() || amount == 0.0) return 0L
        return toScaledLong(parseDecimal(amount), 2)
    }

    fun centsToDouble(cents: Long): Double = cents / 100.0

    fun multiplyPriceQuantityCents(unitPrice: Double, quantity: Double): Long {
        if (!unitPrice.isFinite() || !quantity.isFinite() ||
            unitPrice <= 0.0 || quantity <= 0.0
        ) return 0L

        val price = parseDecimal(unitPrice)
        val amount = parseDecimal(quantity)
        val product = DecimalValue(
            negative = false,
            digits = multiplyDigits(price.digits, amount.digits),
            scale = price.scale + amount.scale
        )
        return toScaledLong(product, 2)
    }

    /**
     * Preserves the existing Android implementation's nearest-cent behavior.
     */
    fun roundMoney(amount: Double): Double {
        if (!amount.isFinite()) return 0.0
        return (amount * 100.0).roundToLong() / 100.0
    }

    private fun parseDecimal(value: Double): DecimalValue {
        val text = value.toString()
        var source = text
        var negative = false

        if (source.startsWith("-")) {
            negative = true
            source = source.substring(1)
        } else if (source.startsWith("+")) {
            source = source.substring(1)
        }

        val exponentIndex = source.indexOfAny(charArrayOf('e', 'E'))
        val exponent = if (exponentIndex >= 0) {
            source.substring(exponentIndex + 1).toIntOrNull()
                ?: throw ArithmeticException("Invalid decimal exponent.")
        } else {
            0
        }
        val mantissa = if (exponentIndex >= 0) source.substring(0, exponentIndex) else source
        val decimalPoint = mantissa.indexOf('.')
        val fractionDigits = if (decimalPoint >= 0) mantissa.length - decimalPoint - 1 else 0
        val digitsWithZeros = mantissa.filter { it != '.' }

        if (digitsWithZeros.isEmpty() || digitsWithZeros.any { it !in '0'..'9' }) {
            throw ArithmeticException("Invalid decimal value.")
        }

        val normalized = digitsWithZeros.trimStart('0').ifEmpty { "0" }
        return DecimalValue(
            negative = negative && normalized != "0",
            digits = normalized,
            scale = fractionDigits - exponent
        )
    }

    private fun toScaledLong(value: DecimalValue, targetScale: Int): Long {
        val shift = targetScale - value.scale
        val magnitudeDigits: String
        val shouldRoundUp: Boolean

        if (shift >= 0) {
            if (shift > 19 || value.digits.length + shift > 20) {
                throw ArithmeticException("Money value exceeds the supported 64-bit range.")
            }
            magnitudeDigits = value.digits + "0".repeat(shift)
            shouldRoundUp = false
        } else {
            val keepLength = value.digits.length + shift
            magnitudeDigits = if (keepLength > 0) value.digits.substring(0, keepLength) else "0"
            // When keepLength is negative, implicit leading fractional zeroes
            // precede the first significant digit, so the value is below 0.5.
            shouldRoundUp = keepLength >= 0 &&
                keepLength < value.digits.length &&
                value.digits[keepLength] >= '5'
        }

        val limit = if (value.negative) NEGATIVE_LONG_LIMIT else POSITIVE_LONG_LIMIT
        var magnitude = magnitudeDigits.toULongOrNull()
            ?: throw ArithmeticException("Money value exceeds the supported 64-bit range.")

        if (shouldRoundUp) {
            if (magnitude == ULong.MAX_VALUE) {
                throw ArithmeticException("Money value exceeds the supported 64-bit range.")
            }
            magnitude += 1u
        }

        val limitValue = limit.toULong()
        if (magnitude > limitValue) {
            throw ArithmeticException("Money value exceeds the supported 64-bit range.")
        }

        if (!value.negative) return magnitude.toLong()
        if (magnitude == 9_223_372_036_854_775_808uL) return Long.MIN_VALUE
        return -magnitude.toLong()
    }

    private fun multiplyDigits(left: String, right: String): String {
        if (left == "0" || right == "0") return "0"
        val result = IntArray(left.length + right.length)

        for (leftIndex in left.indices.reversed()) {
            val leftDigit = left[leftIndex] - '0'
            for (rightIndex in right.indices.reversed()) {
                val rightDigit = right[rightIndex] - '0'
                val position = leftIndex + rightIndex + 1
                val total = result[position] + leftDigit * rightDigit
                result[position] = total % 10
                result[position - 1] += total / 10
            }
        }

        return result.joinToString("").trimStart('0').ifEmpty { "0" }
    }
}
