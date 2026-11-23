package com.beboss.shopmgmt.util

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class MessageDispatchRecord(
    val id: String = UUID.randomUUID().toString(),
    val channel: String, // "SMS", "WHATSAPP", "SHARE_CARD"
    val recipient: String,
    val messageType: String, // "RECEIPT", "DEBT_REMINDER", "REPORT", "ADMIN_CODE", "STAFF_PASS"
    val preview: String,
    val status: String = "SENT", // "SENT", "CHOOSER_OPENED", "FAILED"
    val timestampMs: Long = System.currentTimeMillis(),
    val syncedToCloud: Boolean = false
)

/**
 * Tracks all outbound business communications (SMS, WhatsApp receipts/reports/reminders)
 * for diagnostics inspection and cloud admin telemetry without reading private inbox SMS (Play-compliant).
 */
object MessageAuditManager {

    private const val PREFS_NAME = "beboss_message_audit"
    private const val KEY_RECORDS = "dispatch_records_json"
    private const val MAX_RECORDS = 150

    private val _records = MutableStateFlow<List<MessageDispatchRecord>>(emptyList())
    val records: StateFlow<List<MessageDispatchRecord>> = _records.asStateFlow()

    fun load(context: Context): List<MessageDispatchRecord> {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_RECORDS, "[]") ?: "[]"
        val parsed = try {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    add(
                        MessageDispatchRecord(
                            id = o.optString("id"),
                            channel = o.optString("channel"),
                            recipient = o.optString("recipient"),
                            messageType = o.optString("messageType"),
                            preview = o.optString("preview"),
                            status = o.optString("status", "SENT"),
                            timestampMs = o.optLong("timestampMs", 0L),
                            syncedToCloud = o.optBoolean("syncedToCloud", false)
                        )
                    )
                }
            }
        } catch (_: Throwable) {
            emptyList()
        }
        _records.value = parsed
        return parsed
    }

    @Synchronized
    fun recordDispatch(
        context: Context,
        channel: String,
        recipient: String,
        messageType: String,
        preview: String,
        status: String = "SENT"
    ): MessageDispatchRecord {
        if (_records.value.isEmpty()) {
            load(context)
        }
        val entry = MessageDispatchRecord(
            channel = channel,
            recipient = recipient.ifBlank { "Chooser" },
            messageType = messageType,
            preview = preview.replace("\n", " ").take(120),
            status = status,
            timestampMs = ClockGuard.effectiveNowMs(context),
            syncedToCloud = false
        )
        val updated = (listOf(entry) + _records.value).take(MAX_RECORDS)
        persist(context, updated)
        return entry
    }

    @Synchronized
    fun markAllSynced(context: Context) {
        val current = if (_records.value.isEmpty()) load(context) else _records.value
        val updated = current.map { it.copy(syncedToCloud = true) }
        persist(context, updated)
    }

    fun getUnsyncedCount(context: Context): Int = getUnsyncedRecords(context).size

    /** Returns a stable snapshot; only these IDs are acknowledged after a successful cloud upsert. */
    fun getUnsyncedRecords(context: Context): List<MessageDispatchRecord> {
        val current = if (_records.value.isEmpty()) load(context) else _records.value
        return current.filterNot { it.syncedToCloud }
    }

    /**
     * Cloud-safe aggregate only. Recipient numbers and message previews remain local to the device.
     * SENT means the app initiated its dispatch integration; it is not proof the recipient received it.
     */
    fun buildCloudSummaryJson(context: Context): String {
        val current = if (_records.value.isEmpty()) load(context) else _records.value
        val channels = JSONObject()
        val statuses = JSONObject()
        val types = JSONObject()
        current.groupingBy { it.channel.uppercase() }.eachCount().forEach { (key, value) -> channels.put(key, value) }
        current.groupingBy { it.status.uppercase() }.eachCount().forEach { (key, value) -> statuses.put(key, value) }
        current.groupingBy { it.messageType.uppercase() }.eachCount().forEach { (key, value) -> types.put(key, value) }
        val pending = current.count { !it.syncedToCloud }
        return JSONObject().apply {
            put("record_count", current.size)
            put("pending_records", pending)
            put("channels", channels)
            put("statuses", statuses)
            put("message_types", types)
            put("latest_dispatch_at_ms", current.maxOfOrNull { it.timestampMs } ?: 0L)
        }.toString()
    }

    @Synchronized
    fun markSynced(context: Context, recordIds: Set<String>) {
        if (recordIds.isEmpty()) return
        val current = if (_records.value.isEmpty()) load(context) else _records.value
        val updated = current.map { record ->
            if (record.id in recordIds) record.copy(syncedToCloud = true) else record
        }
        persist(context, updated)
    }

    private fun persist(context: Context, list: List<MessageDispatchRecord>) {
        _records.value = list
        val arr = JSONArray()
        list.forEach { r ->
            arr.put(
                JSONObject().apply {
                    put("id", r.id)
                    put("channel", r.channel)
                    put("recipient", r.recipient)
                    put("messageType", r.messageType)
                    put("preview", r.preview)
                    put("status", r.status)
                    put("timestampMs", r.timestampMs)
                    put("syncedToCloud", r.syncedToCloud)
                }
            )
        }
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_RECORDS, arr.toString())
            .apply()
    }
}
