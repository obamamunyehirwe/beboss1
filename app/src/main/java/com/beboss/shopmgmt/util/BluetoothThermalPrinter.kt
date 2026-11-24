package com.beboss.shopmgmt.util

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID

data class PairedThermalPrinter(val name: String, val address: String)

/**
 * Sends ESC/POS receipts to already-paired Bluetooth Classic SPP printers.
 * It never performs nearby-device discovery or background Bluetooth access.
 */
object BluetoothThermalPrinter {
    private val serialPortUuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    fun pairedPrinters(context: Context): List<PairedThermalPrinter> {
        requireConnectPermission(context)
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
            ?: throw IllegalStateException("Bluetooth is not supported on this Android device.")
        if (!adapter.isEnabled) {
            throw IllegalStateException("Turn on Bluetooth and pair the printer in Android Settings first.")
        }
        return adapter.bondedDevices
            .map { device: BluetoothDevice ->
                PairedThermalPrinter(
                    name = device.name?.takeIf { it.isNotBlank() } ?: "Bluetooth printer",
                    address = device.address
                )
            }
            .sortedBy { it.name.lowercase() }
    }

    suspend fun print(
        context: Context,
        printerAddress: String,
        receiptText: String,
        paperWidthMm: Int
    ): Int = withContext(Dispatchers.IO) {
        requireConnectPermission(context)
        require(printerAddress.matches(Regex("(?i)^([0-9a-f]{2}:){5}[0-9a-f]{2}$"))) {
            "The selected Bluetooth printer address is invalid."
        }
        val bytes = EscPosReceiptEncoder.encode(receiptText, paperWidthMm)
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
            ?: throw IllegalStateException("Bluetooth is not supported on this Android device.")
        if (!adapter.isEnabled) throw IllegalStateException("Bluetooth is turned off.")

        val device = adapter.getRemoteDevice(printerAddress)
        val socket = device.createRfcommSocketToServiceRecord(serialPortUuid)
        try {
            socket.connect()
            socket.outputStream.apply {
                write(bytes)
                flush()
            }
            bytes.size
        } finally {
            runCatching { socket.close() }
        }
    }

    private fun requireConnectPermission(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
        ) {
            throw SecurityException("Allow Nearby devices / Bluetooth access to print to a paired thermal printer.")
        }
    }
}
