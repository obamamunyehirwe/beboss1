package com.beboss.shopmgmt.ui.components

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.beboss.shopmgmt.util.BluetoothThermalPrinter
import com.beboss.shopmgmt.util.PairedThermalPrinter
import kotlinx.coroutines.launch

@Composable
fun BluetoothThermalPrintButton(
    receiptText: String,
    paperWidthMm: Int,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var printers by remember { mutableStateOf<List<PairedThermalPrinter>>(emptyList()) }
    var showPicker by remember { mutableStateOf(false) }
    var printing by remember { mutableStateOf(false) }

    val loadPairedPrinters = {
        try {
            printers = BluetoothThermalPrinter.pairedPrinters(context)
            if (printers.isEmpty()) {
                Toast.makeText(context, "No paired printer found. Pair an ESC/POS Bluetooth printer in Android Settings first.", Toast.LENGTH_LONG).show()
            } else {
                showPicker = true
            }
        } catch (error: Exception) {
            Toast.makeText(context, error.message ?: "Unable to access paired Bluetooth printers.", Toast.LENGTH_LONG).show()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) loadPairedPrinters()
        else Toast.makeText(context, "Bluetooth permission is required to print to a paired printer.", Toast.LENGTH_LONG).show()
    }

    OutlinedButton(
        onClick = {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
            ) {
                permissionLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT)
            } else {
                loadPairedPrinters()
            }
        },
        enabled = !printing,
        modifier = modifier
    ) {
        Icon(imageVector = Icons.Default.Bluetooth, contentDescription = null)
        Text("  Print directly via Bluetooth")
    }

    if (showPicker) {
        AlertDialog(
            onDismissRequest = { if (!printing) showPicker = false },
            title = { Text("Choose paired thermal printer") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("BeBoss connects to paired Bluetooth Classic ESC/POS (SPP) printers. USB printers remain available through Android Print services.")
                    printers.forEach { printer ->
                        TextButton(
                            enabled = !printing,
                            onClick = {
                                printing = true
                                scope.launch {
                                    try {
                                        val sent = BluetoothThermalPrinter.print(
                                            context = context,
                                            printerAddress = printer.address,
                                            receiptText = receiptText,
                                            paperWidthMm = paperWidthMm
                                        )
                                        Toast.makeText(
                                            context,
                                            "Sent $sent bytes to " + printer.name + ". Check the printer output.",
                                            Toast.LENGTH_LONG
                                        ).show()
                                        showPicker = false
                                    } catch (error: Exception) {
                                        Toast.makeText(
                                            context,
                                            error.message ?: "Bluetooth thermal printing failed.",
                                            Toast.LENGTH_LONG
                                        ).show()
                                    } finally {
                                        printing = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(printer.name + "  •  " + printer.address)
                        }
                    }
                    if (printing) CircularProgressIndicator()
                }
            },
            confirmButton = {
                TextButton(onClick = { if (!printing) showPicker = false }, enabled = !printing) {
                    Text("Close")
                }
            }
        )
    }
}
