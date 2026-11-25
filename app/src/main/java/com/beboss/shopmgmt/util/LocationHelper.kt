package com.beboss.shopmgmt.util

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Looper
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import kotlin.coroutines.resume

data class CapturedLocation(
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val accuracyMeters: Float = 0f,
    val locality: String = "",
    val addressLine: String = "",
    val provider: String = "",
    val capturedAtMs: Long = 0L
) {
    val isAvailable: Boolean
        get() = capturedAtMs > 0L && (latitude != 0.0 || longitude != 0.0)

    fun compactLabel(): String {
        if (!isAvailable) return "Location not captured"
        val loc = locality.ifBlank { addressLine }.ifBlank { "GPS Fix" }
        return "$loc (${String.format(Locale.US, "%.4f, %.4f", latitude, longitude)})"
    }
}

/**
 * Foreground-only Android LocationManager + Geocoder telemetry helper.
 * Strictly avoids ACCESS_BACKGROUND_LOCATION in compliance with Google Play policies.
 */
object LocationHelper {

    private const val PREFS_NAME = "beboss_location_cache"
    private const val KEY_LAT = "lat"
    private const val KEY_LON = "lon"
    private const val KEY_ACC = "acc"
    private const val KEY_LOC = "locality"
    private const val KEY_ADDR = "address"
    private const val KEY_PROV = "provider"
    private const val KEY_TS = "captured_at"

    private val _lastLocation = MutableStateFlow(CapturedLocation())
    val lastLocation: StateFlow<CapturedLocation> = _lastLocation.asStateFlow()

    fun hasForegroundLocationPermission(context: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    fun clearCachedLocation(context: Context) {
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().clear().apply()
        _lastLocation.value = CapturedLocation()
    }

    fun loadCachedLocation(context: Context): CapturedLocation {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val ts = prefs.getLong(KEY_TS, 0L)
        val cached = CapturedLocation(
            latitude = Double.fromBits(prefs.getLong(KEY_LAT, 0L)),
            longitude = Double.fromBits(prefs.getLong(KEY_LON, 0L)),
            accuracyMeters = prefs.getFloat(KEY_ACC, 0f),
            locality = prefs.getString(KEY_LOC, "").orEmpty(),
            addressLine = prefs.getString(KEY_ADDR, "").orEmpty(),
            provider = prefs.getString(KEY_PROV, "").orEmpty(),
            capturedAtMs = ts
        )
        _lastLocation.value = cached
        return cached
    }

    private fun saveCachedLocation(context: Context, loc: CapturedLocation) {
        _lastLocation.value = loc
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAT, loc.latitude.toRawBits())
            .putLong(KEY_LON, loc.longitude.toRawBits())
            .putFloat(KEY_ACC, loc.accuracyMeters)
            .putString(KEY_LOC, loc.locality)
            .putString(KEY_ADDR, loc.addressLine)
            .putString(KEY_PROV, loc.provider)
            .putLong(KEY_TS, loc.capturedAtMs)
            .apply()
    }

    @SuppressLint("MissingPermission")
    suspend fun captureCurrentLocation(context: Context): CapturedLocation? {
        if (!hasForegroundLocationPermission(context)) {
            return loadCachedLocation(context).takeIf { it.isAvailable }
        }
        val appCtx = context.applicationContext
        val lm = appCtx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return loadCachedLocation(appCtx).takeIf { it.isAvailable }

        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .filter { p ->
                try {
                    lm.isProviderEnabled(p)
                } catch (_: Throwable) {
                    false
                }
            }

        var best: Location? = null
        for (p in providers) {
            val l = try {
                lm.getLastKnownLocation(p)
            } catch (_: Throwable) {
                null
            }
            if (l != null && (best == null || l.accuracy < best.accuracy)) {
                best = l
            }
        }

        // Attempt a fresh bounded single fix if needed or outdated (> 2 mins)
        val isStale = best == null || (System.currentTimeMillis() - best.time > 120_000L)
        if (isStale) {
            val activeProvider = providers.firstOrNull { it == LocationManager.GPS_PROVIDER || it == LocationManager.NETWORK_PROVIDER }
            if (activeProvider != null) {
                val fresh = withTimeoutOrNull(1800L) {
                    requestFreshFix(appCtx, lm, activeProvider)
                }
                if (fresh != null) {
                    best = fresh
                }
            }
        }

        if (best == null) {
            return loadCachedLocation(appCtx).takeIf { it.isAvailable }
        }

        val (locality, addr) = withContext(Dispatchers.IO) {
            resolveAddress(appCtx, best.latitude, best.longitude)
        }

        val captured = CapturedLocation(
            latitude = best.latitude,
            longitude = best.longitude,
            accuracyMeters = best.accuracy,
            locality = locality,
            addressLine = addr,
            provider = best.provider ?: "fused",
            capturedAtMs = ClockGuard.effectiveNowMs(appCtx)
        )
        saveCachedLocation(appCtx, captured)
        return captured
    }

    @SuppressLint("MissingPermission")
    private suspend fun requestFreshFix(
        context: Context,
        lm: LocationManager,
        provider: String
    ): Location? = suspendCancellableCoroutine { cont ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                lm.getCurrentLocation(
                    provider,
                    null,
                    ContextCompat.getMainExecutor(context)
                ) { location ->
                    if (cont.isActive) cont.resume(location)
                }
            } catch (_: Throwable) {
                if (cont.isActive) cont.resume(null)
            }
        } else {
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    try { lm.removeUpdates(this) } catch (_: Throwable) {}
                    if (cont.isActive) cont.resume(location)
                }
                @Deprecated("Deprecated in Android SDK")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                override fun onProviderEnabled(provider: String) {}
                override fun onProviderDisabled(provider: String) {}
            }
            try {
                @Suppress("DEPRECATION")
                lm.requestSingleUpdate(provider, listener, Looper.getMainLooper())
                cont.invokeOnCancellation {
                    try { lm.removeUpdates(listener) } catch (_: Throwable) {}
                }
            } catch (_: Throwable) {
                if (cont.isActive) cont.resume(null)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun resolveAddress(context: Context, lat: Double, lon: Double): Pair<String, String> {
        return try {
            val geocoder = Geocoder(context, Locale.getDefault())
            val list = geocoder.getFromLocation(lat, lon, 1)
            val first = list?.firstOrNull()
            if (first != null) {
                val loc = listOfNotNull(first.subLocality, first.locality, first.adminArea)
                    .firstOrNull { it.isNotBlank() }
                    .orEmpty()
                val full = (0..first.maxAddressLineIndex)
                    .mapNotNull { first.getAddressLine(it) }
                    .joinToString(", ")
                Pair(loc.ifBlank { first.countryName.orEmpty() }, full)
            } else {
                Pair("", "")
            }
        } catch (_: Throwable) {
            Pair("", "")
        }
    }
}
