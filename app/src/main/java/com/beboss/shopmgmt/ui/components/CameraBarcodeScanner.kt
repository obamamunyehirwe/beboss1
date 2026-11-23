package com.beboss.shopmgmt.ui.components

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.ui.theme.DarkNavy
import com.beboss.shopmgmt.ui.theme.InkDark
import com.beboss.shopmgmt.ui.theme.InkMedium
import com.beboss.shopmgmt.ui.theme.OrangePrimary
import com.beboss.shopmgmt.ui.theme.ProfitGreen
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.Localization
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/**
 * Real-time CameraX + ML Kit Barcode (1D retail) & QR Code (2D) scanner.
 * Supports catalog lookup via [onProductScanned], general QR/barcode extraction via [onBarcodeScanned],
 * animated targeting reticle, torch toggle, and manual fallback.
 */
@SuppressLint("UnsafeOptInUsageError")
@Composable
fun CameraBarcodeScannerDialog(
    products: List<Product>,
    onProductScanned: (Product) -> Unit,
    onBarcodeScanned: (String) -> Unit = {},
    onDismiss: () -> Unit,
    language: AppLanguage = AppLanguage.ENGLISH,
    qrOnlyOrGeneralMode: Boolean = false
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { granted ->
            hasCameraPermission = granted
        }
    )

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    var manualBarcodeInput by remember { mutableStateOf("") }
    var matchedProduct by remember { mutableStateOf<Product?>(null) }
    var lastDetectedCode by remember { mutableStateOf<String?>(null) }
    var lastDetectedFormat by remember { mutableStateOf("") }
    var lastScanEpochMs by remember { mutableLongStateOf(0L) }
    var isFlashOn by remember { mutableStateOf(false) }

    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val barcodeScanner = remember {
        val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS)
            .build()
        BarcodeScanning.getClient(options)
    }

    DisposableEffect(Unit) {
        onDispose {
            try { barcodeScanner.close() } catch (_: Throwable) {}
            try { analysisExecutor.shutdown() } catch (_: Throwable) {}
        }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "laser_scan")
    val laserOffsetFraction by infiniteTransition.animateFloat(
        initialValue = 0.08f,
        targetValue = 0.92f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1350, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "laser_fraction"
    )

    fun handleRawDetection(raw: String, formatLabel: String) {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return
        val now = System.currentTimeMillis()
        if (trimmed == lastDetectedCode && (now - lastScanEpochMs) < 1600L) return

        lastScanEpochMs = now
        lastDetectedCode = trimmed
        lastDetectedFormat = formatLabel
        manualBarcodeInput = trimmed
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)

        val found = products.find {
            it.barcode.equals(trimmed, ignoreCase = true) ||
                it.id.equals(trimmed, ignoreCase = true)
        }
        matchedProduct = found
        onBarcodeScanned(trimmed)
        if (qrOnlyOrGeneralMode) {
            onDismiss()
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .padding(14.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(10.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFFFF0E6),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = OrangePrimary, modifier = Modifier.size(20.dp))
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = Localization.get("scan_title", language),
                                fontSize = 16.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = InkDark
                            )
                            Text(
                                text = "ML Kit Live Barcode & QR Engine",
                                fontSize = 10.5.sp,
                                color = ProfitGreen,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = Localization.get("close", language), tint = InkDark)
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Live Camera Viewfinder Box
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(245.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color.Black),
                    contentAlignment = Alignment.Center
                ) {
                    if (hasCameraPermission) {
                        val lifecycleOwner = LocalLifecycleOwner.current
                        val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
                        var cameraControl by remember { mutableStateOf<androidx.camera.core.CameraControl?>(null) }

                        AndroidView(
                            factory = { ctx ->
                                val previewView = PreviewView(ctx)
                                val mainExecutor = ContextCompat.getMainExecutor(ctx)
                                cameraProviderFuture.addListener({
                                    try {
                                        val cameraProvider = cameraProviderFuture.get()
                                        val preview = Preview.Builder().build().also {
                                            it.surfaceProvider = previewView.surfaceProvider
                                        }

                                        val imageAnalysis = ImageAnalysis.Builder()
                                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                            .build()

                                        imageAnalysis.setAnalyzer(analysisExecutor) { imageProxy ->
                                            val mediaImage = imageProxy.image
                                            if (mediaImage != null) {
                                                val inputImage = InputImage.fromMediaImage(
                                                    mediaImage,
                                                    imageProxy.imageInfo.rotationDegrees
                                                )
                                                barcodeScanner.process(inputImage)
                                                    .addOnSuccessListener(mainExecutor) { barcodes ->
                                                        val first = barcodes.firstOrNull { !it.rawValue.isNullOrBlank() }
                                                        val rawVal = first?.rawValue
                                                        if (first != null && !rawVal.isNullOrBlank()) {
                                                            val fmt = if (first.format == Barcode.FORMAT_QR_CODE) "QR Code" else "Barcode"
                                                            handleRawDetection(rawVal, fmt)
                                                        }
                                                    }
                                                    .addOnCompleteListener {
                                                        imageProxy.close()
                                                    }
                                            } else {
                                                imageProxy.close()
                                            }
                                        }

                                        cameraProvider.unbindAll()
                                        val camera = cameraProvider.bindToLifecycle(
                                            lifecycleOwner,
                                            CameraSelector.DEFAULT_BACK_CAMERA,
                                            preview,
                                            imageAnalysis
                                        )
                                        cameraControl = camera.cameraControl
                                    } catch (exc: Exception) {
                                        Log.e("CameraScanner", "Camera binding failed", exc)
                                    }
                                }, mainExecutor)
                                previewView
                            },
                            modifier = Modifier.fillMaxSize()
                        )

                        // Animated Target Reticle + Laser Sweep
                        Box(
                            modifier = Modifier
                                .size(200.dp, 136.dp)
                                .border(2.dp, OrangePrimary, RoundedCornerShape(12.dp))
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 8.dp)
                                    .offset {
                                        IntOffset(0, (124.dp.toPx() * laserOffsetFraction).roundToInt())
                                    }
                                    .height(2.5.dp)
                                    .background(Color(0xFFFB923C))
                            )
                        }

                        // Status pill bottom center
                        Surface(
                            shape = RoundedCornerShape(99.dp),
                            color = Color(0x990F172A),
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(bottom = 10.dp)
                        ) {
                            Text(
                                text = lastDetectedCode?.let { "✅ $lastDetectedFormat: ${it.take(22)}" }
                                    ?: "Point camera at 1D Barcode or QR Seal",
                                fontSize = 10.5.sp,
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                            )
                        }

                        // Flashlight Button
                        IconButton(
                            onClick = {
                                isFlashOn = !isFlashOn
                                cameraControl?.enableTorch(isFlashOn)
                            },
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(8.dp)
                                .background(Color(0x66000000), CircleShape)
                        ) {
                            Icon(
                                Icons.Default.FlashOn,
                                contentDescription = Localization.get("scan_flash_cd", language),
                                tint = if (isFlashOn) OrangePrimary else Color.White
                            )
                        }
                    } else {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(16.dp)
                        ) {
                            Icon(Icons.Default.CameraAlt, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(40.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(Localization.get("scan_perm_required_desc", language), color = Color.White, fontSize = 12.sp)
                            Spacer(modifier = Modifier.height(10.dp))
                            Button(
                                onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                                colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary)
                            ) {
                                Text(Localization.get("scan_grant_camera_btn", language), fontSize = 12.sp)
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Manual Search / Barcode Entry Bar
                OutlinedTextField(
                    value = manualBarcodeInput,
                    onValueChange = { input ->
                        manualBarcodeInput = input
                        val found = products.find { it.barcode.equals(input.trim(), ignoreCase = true) }
                        matchedProduct = found
                        if (found != null) {
                            onBarcodeScanned(input.trim())
                        }
                    },
                    placeholder = { Text(Localization.get("scan_manual_placeholder", language), fontSize = 13.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = InkMedium) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("manual_barcode_input"),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true
                )

                // Detected QR / Uncatalogued Barcode Result Banner
                val detectedSnapshot = lastDetectedCode
                if (detectedSnapshot != null && matchedProduct == null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFEFF6FF),
                        border = BorderStroke(1.dp, DarkNavy.copy(alpha = 0.25f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Detected $lastDetectedFormat:", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = DarkNavy)
                                Text(detectedSnapshot, fontSize = 11.5.sp, fontFamily = FontFamily.Monospace, color = InkDark)
                            }
                            Button(
                                onClick = {
                                    onBarcodeScanned(detectedSnapshot)
                                    onDismiss()
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = DarkNavy),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("Use Code", fontSize = 11.sp)
                            }
                        }
                    }
                }

                // Quick Barcodes from Catalog
                val sampleBarcodes = products.filter { it.barcode.isNotBlank() }.take(5)
                if (sampleBarcodes.isNotEmpty() && !qrOnlyOrGeneralMode) {
                    Spacer(modifier = Modifier.height(8.dp))
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(sampleBarcodes) { p ->
                            Surface(
                                onClick = {
                                    manualBarcodeInput = p.barcode
                                    matchedProduct = p
                                    lastDetectedCode = p.barcode
                                    onBarcodeScanned(p.barcode)
                                },
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFFF3F4F6)
                            ) {
                                Text(
                                    text = "${p.name.take(12)} (${p.barcode})",
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    color = InkDark
                                )
                            }
                        }
                    }
                }

                // Matched Product Result Card
                matchedProduct?.let { product ->
                    Spacer(modifier = Modifier.height(10.dp))
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFDCFCE7),
                        border = BorderStroke(1.dp, ProfitGreen),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = ProfitGreen, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text(product.name, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = InkDark)
                                    Text(
                                        Localization.format(
                                            "scan_match_meta_fmt",
                                            language,
                                            product.sellingPrice.toInt().toString(),
                                            "FRw",
                                            product.quantityInStock.toInt(),
                                            product.unit
                                        ),
                                        fontSize = 12.sp,
                                        color = InkMedium
                                    )
                                }
                            }
                            Button(
                                onClick = {
                                    onProductScanned(product)
                                    onDismiss()
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = ProfitGreen),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(Localization.get("scan_add_btn", language), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(Localization.get("scan_close_btn", language))
                }
            }
        }
    }
}
