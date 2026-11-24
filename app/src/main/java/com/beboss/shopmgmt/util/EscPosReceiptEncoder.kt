package com.beboss.shopmgmt.util

import java.io.ByteArrayOutputStream
import java.text.Normalizer

/** Minimal ESC/POS text encoder for paired 58mm/80mm serial thermal printers. */
object EscPosReceiptEncoder {
    private val initialize = byteArrayOf(0x1B, 0x40)
    private val leftAlign = byteArrayOf(0x1B, 0x61, 0x00)
    private val pc437 = byteArrayOf(0x1B, 0x74, 0x00)
    private val feedAndCut = byteArrayOf(0x1B, 0x64, 0x03, 0x1D, 0x56, 0x00)

    fun encode(receiptText: String, paperWidthMm: Int): ByteArray {
        require(paperWidthMm == 58 || paperWidthMm == 80) {
            "Paper width must be 58mm or 80mm."
        }
        require(receiptText.isNotBlank()) { "Receipt text is empty." }
        val columns = if (paperWidthMm == 58) 32 else 48
        val output = ByteArrayOutputStream()
        output.write(initialize)
        output.write(pc437)
        output.write(leftAlign)
        toPrinterAscii(receiptText).split('\n').forEach { line ->
            wrapLine(line, columns).forEach { wrapped ->
                output.write(wrapped.toByteArray(Charsets.US_ASCII))
                output.write(0x0A)
            }
        }
        output.write(feedAndCut)
        return output.toByteArray()
    }

    internal fun toPrinterAscii(value: String): String {
        val normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace("\\p{M}+".toRegex(), "")
            .replace("\\u2018|\\u2019".toRegex(), "'")
            .replace("\\u201c|\\u201d".toRegex(), "\"")
            .replace("\\u2013|\\u2014|\\u2212".toRegex(), "-")
            .replace("\\u2022".toRegex(), "*")
            .replace("\\u00a0".toRegex(), " ")
        return buildString(normalized.length) {
            normalized.forEach { char ->
                append(if (char == '\n' || char == '\r' || char == '\t' || char in ' '..'~') char else '?')
            }
        }
    }

    private fun wrapLine(line: String, columns: Int): List<String> {
        if (line.length <= columns) return listOf(line)
        val result = ArrayList<String>()
        var remaining = line
        while (remaining.length > columns) {
            val candidate = remaining.lastIndexOf(' ', columns)
            val splitAt = if (candidate > 0) candidate else columns
            result += remaining.substring(0, splitAt)
            remaining = remaining.substring(splitAt).trimStart()
        }
        result += remaining
        return result
    }
}
