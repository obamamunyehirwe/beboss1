package com.beboss.shopmgmt

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.DeviceSecurityManager
import com.beboss.shopmgmt.util.LocationHelper
import com.beboss.shopmgmt.util.MessageAuditManager
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SecurityAndTelemetryRobolectricTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        // Reset the singleton's in-memory StateFlow as well as SharedPreferences between
        // Robolectric tests; the object survives individual test application lifecycles.
        context.getSharedPreferences("beboss_message_audit", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        MessageAuditManager.load(context)
        ClockGuard.init(context)
        ClockGuard.clearRollbackAfterTrustedSync(context, System.currentTimeMillis())
    }

    @After
    fun tearDown() {
        ClockGuard.clearRollbackAfterTrustedSync(context, System.currentTimeMillis())
        context.getSharedPreferences("beboss_message_audit", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun `clock guard detects rollback against trusted epoch and feeds device integrity`() {
        val futureTrustedServerMs = System.currentTimeMillis() + 30L * 60L * 1000L
        ClockGuard.observeTrustedEpoch(futureTrustedServerMs, context)

        assertTrue(ClockGuard.effectiveNowMs(context) >= futureTrustedServerMs)
        assertTrue(ClockGuard.isClockRollbackDetected())

        val status = ClockGuard.reInspectNow(context)
        assertTrue(status.rollbackDetected)
        assertTrue(status.activeTamperLock)
        assertTrue(status.incidentCount >= 1)
        assertTrue(status.recentIncidents.isNotEmpty())
        assertTrue(status.reason.isNotBlank())

        val posture = DeviceSecurityManager.inspectDeviceIntegrity(context)
        assertTrue(posture.clockRollbackDetected)
        assertTrue(posture.isCompromisedRisk)
        assertTrue(posture.riskScore >= 40)
        assertTrue(posture.postureLabel.contains("TAMPER ALERT"))

        // Attempting clear with wrong skewed timestamp keeps lock active
        val rejectedClear = ClockGuard.clearRollbackAfterTrustedSync(context, System.currentTimeMillis() + 20L * 60L * 1000L)
        assertTrue(rejectedClear.activeTamperLock)

        // Clearing with synced current server timestamp lifts lock cleanly
        val cleared = ClockGuard.clearRollbackAfterTrustedSync(context, System.currentTimeMillis())
        assertFalse(cleared.rollbackDetected)
        assertFalse(cleared.activeTamperLock)
        assertEquals("", cleared.reason)
    }

    @Test
    fun `clock guard parses RFC1123 HTTP Date headers and ignores invalid headers`() {
        val formatter = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("GMT")
        }
        val nowHeader = formatter.format(Date(System.currentTimeMillis()))
        val parsed = ClockGuard.observeTrustedServerDateHeader(nowHeader, context)
        assertNotNull(parsed)
        assertTrue(parsed!! > 1_700_000_000_000L)

        assertNull(ClockGuard.observeTrustedServerDateHeader("not-a-valid-date", context))
        assertNull(ClockGuard.observeTrustedServerDateHeader("", context))
    }

    @Test
    fun `message audit manager persists dispatches and marks them synced`() {
        val first = MessageAuditManager.recordDispatch(
            context = context,
            channel = "WHATSAPP",
            recipient = "+250788111222",
            messageType = "RECEIPT",
            preview = "Receipt #R-1001"
        )
        assertFalse(first.syncedToCloud)
        assertEquals(1, MessageAuditManager.getUnsyncedCount(context))

        val loaded = MessageAuditManager.load(context)
        assertEquals(1, loaded.size)
        assertEquals("WHATSAPP", loaded.first().channel)
        assertEquals("+250788111222", loaded.first().recipient)

        MessageAuditManager.markAllSynced(context)
        assertEquals(0, MessageAuditManager.getUnsyncedCount(context))
        assertTrue(MessageAuditManager.load(context).all { it.syncedToCloud })
    }

    @Test
    fun `location helper returns unavailable when permission not granted and handles cache safely`() {
        assertFalse(LocationHelper.hasForegroundLocationPermission(context))
        val cached = LocationHelper.loadCachedLocation(context)
        assertFalse(cached.isAvailable)
        assertEquals("Location not captured", cached.compactLabel())
    }

    @Test
    fun `cloud message summary excludes recipients and previews and acknowledges only uploaded ids`() {
        val first = MessageAuditManager.recordDispatch(
            context = context,
            channel = "WHATSAPP",
            recipient = "+250788111222",
            messageType = "RECEIPT",
            preview = "Private receipt for Alice"
        )
        val second = MessageAuditManager.recordDispatch(
            context = context,
            channel = "SMS",
            recipient = "+250788333444",
            messageType = "DEBT_REMINDER",
            preview = "Private debt reminder"
        )

        val summary = MessageAuditManager.buildCloudSummaryJson(context)
        assertTrue(summary.contains("WHATSAPP"))
        assertTrue(summary.contains("SMS"))
        assertTrue(summary.contains("RECEIPT"))
        assertTrue(summary.contains("DEBT_REMINDER"))
        assertFalse(summary.contains("+250788111222"))
        assertFalse(summary.contains("+250788333444"))
        assertFalse(summary.contains("Private receipt"))

        MessageAuditManager.markSynced(context, setOf(first.id))
        val pending = MessageAuditManager.getUnsyncedRecords(context)
        assertEquals(1, pending.size)
        assertEquals(second.id, pending.single().id)
    }

}
