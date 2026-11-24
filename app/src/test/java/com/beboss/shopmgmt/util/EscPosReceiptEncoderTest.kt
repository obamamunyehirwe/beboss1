package com.beboss.shopmgmt.util

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EscPosReceiptEncoderTest {
    @Test
    fun startsWithInitializeAndEndsWithCut() {
        val bytes = EscPosReceiptEncoder.encode("BeBoss receipt", 58)
        assertArrayEquals(byteArrayOf(0x1B, 0x40), bytes.copyOfRange(0, 2))
        assertArrayEquals(byteArrayOf(0x1D, 0x56, 0x00), bytes.copyOfRange(bytes.size - 3, bytes.size))
    }

    @Test
    fun wrapsReceiptLinesWithin58mmWidth() {
        val bytes = EscPosReceiptEncoder.encode("A".repeat(42), 58)
        val text = bytes.copyOfRange(8, bytes.size - 6).toString(Charsets.US_ASCII)
        assertTrue(text.lineSequence().filter { it.isNotEmpty() }.all { it.length <= 32 })
    }

    @Test
    fun supports80mmPaperWidth() {
        val bytes = EscPosReceiptEncoder.encode("B".repeat(45), 80)
        val text = bytes.copyOfRange(8, bytes.size - 6).toString(Charsets.US_ASCII)
        assertTrue(text.lineSequence().filter { it.isNotEmpty() }.all { it.length <= 48 })
    }

    @Test
    fun transliteratesDiacriticsAndReplacesUnsupportedGlyphs() {
        val text = EscPosReceiptEncoder.toPrinterAscii("Café — Kigali 😊")
        assertTrue(text.contains("Cafe - Kigali ?"))
        assertFalse(text.any { it.code > 0x7E })
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsUnsupportedPaperSize() {
        EscPosReceiptEncoder.encode("receipt", 72)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsEmptyReceipt() {
        EscPosReceiptEncoder.encode("  ", 58)
    }
}
