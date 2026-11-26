package com.beboss.shopmgmt.util

import java.io.ByteArrayInputStream
import java.io.EOFException
import java.nio.charset.StandardCharsets
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalNetworkHttpProtocolTest {

    @Test
    fun `reads UTF-8 bodies by declared byte length without truncating multibyte text`() {
        val body = """{"shopName":"BeBoss Kigali – École, Murakaza neza"}"""
        val bodyBytes = body.toByteArray(StandardCharsets.UTF_8)
        val headers = (
            "POST /api/sync/push HTTP/1.1\r\n" +
                "Host: 192.168.43.1:8989\r\n" +
                "Content-Length: ${bodyBytes.size}\r\n" +
                "X-BeBoss-Signature: abc123\r\n" +
                "\r\n"
            ).toByteArray(StandardCharsets.US_ASCII)
        val input = ByteArrayInputStream(headers + bodyBytes)

        val request = readLanHttpRequestHead(input)
        assertEquals("POST", request.method)
        assertEquals("/api/sync/push", request.path)
        assertEquals(bodyBytes.size, request.contentLength)
        assertEquals("abc123", request.headers["x-beboss-signature"])
        assertEquals(body, readLanHttpRequestBody(input, request.contentLength, 1024))
        assertEquals(0, input.available())
    }

    @Test
    fun `rejects truncated request bodies instead of accepting partial snapshots`() {
        val input = ByteArrayInputStream("partial".toByteArray(StandardCharsets.UTF_8))
        var rejected = false
        try {
            readLanHttpRequestBody(input, 12, 1024)
        } catch (_: EOFException) {
            rejected = true
        }
        assertTrue("a partial body must be rejected", rejected)
    }

    @Test
    fun `rejects conflicting content length headers`() {
        val header = (
            "POST /api/sync/push HTTP/1.1\r\n" +
                "Content-Length: 1\r\n" +
                "content-length: 2\r\n" +
                "\r\n"
            ).toByteArray(StandardCharsets.US_ASCII)
        var rejected = false
        try {
            readLanHttpRequestHead(ByteArrayInputStream(header))
        } catch (_: IllegalArgumentException) {
            rejected = true
        }
        assertTrue("duplicate Content-Length headers must be rejected", rejected)
    }

    @Test
    fun `rejects chunked transfer encoding on the bounded LAN protocol`() {
        val header = (
            "POST /api/sync/push HTTP/1.1\r\n" +
                "Transfer-Encoding: chunked\r\n" +
                "\r\n"
            ).toByteArray(StandardCharsets.US_ASCII)
        var rejected = false
        try {
            readLanHttpRequestHead(ByteArrayInputStream(header))
        } catch (_: IllegalArgumentException) {
            rejected = true
        }
        assertTrue("unsupported chunked bodies must fail closed", rejected)
    }

    @Test
    fun `allows empty UTF-8 request bodies for signed GET requests`() {
        val input = ByteArrayInputStream(ByteArray(0))
        assertEquals("", readLanHttpRequestBody(input, 0, 1024))
        assertFalse(input.available() > 0)
    }
}
