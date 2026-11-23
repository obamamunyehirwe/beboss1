package com.beboss.shopmgmt.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

data class AppPermissionItem(
    val permission: String,
    val title: String,
    val titleRw: String,
    val description: String,
    val descriptionRw: String,
    val isGranted: Boolean,
    val isCrucial: Boolean = true,
    val iconName: String = "shield",
    val titleKey: String = "",
    val descriptionKey: String = ""
) {
    fun localizedTitle(language: AppLanguage): String {
        if (titleKey.isNotBlank()) return Localization.get(titleKey, language)
        return when (language) {
            AppLanguage.KINYARWANDA -> titleRw
            else -> title
        }
    }

    fun localizedDescription(language: AppLanguage): String {
        if (descriptionKey.isNotBlank()) return Localization.get(descriptionKey, language)
        return when (language) {
            AppLanguage.KINYARWANDA -> descriptionRw
            else -> description
        }
    }
}

object PermissionManager {

    fun hasPermission(context: Context, permission: String): Boolean {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    fun hasContactsPermission(context: Context): Boolean {
        return hasPermission(context, Manifest.permission.READ_CONTACTS)
    }

    fun hasSmsPermission(context: Context): Boolean {
        return hasPermission(context, Manifest.permission.SEND_SMS)
    }

    fun hasCameraPermission(context: Context): Boolean {
        return hasPermission(context, Manifest.permission.CAMERA)
    }

    fun hasLocationPermission(context: Context): Boolean {
        return hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ||
            hasPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    }

    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            hasPermission(context, Manifest.permission.POST_NOTIFICATIONS)
        } else {
            true
        }
    }

    fun hasNearbyWifiPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            hasPermission(context, Manifest.permission.NEARBY_WIFI_DEVICES)
        } else {
            true
        }
    }

    fun getAllPermissionsStatus(context: Context): List<AppPermissionItem> {
        val list = mutableListOf<AppPermissionItem>()

        // Contacts
        list.add(
            AppPermissionItem(
                permission = Manifest.permission.READ_CONTACTS,
                title = "Phone Contacts Access",
                titleRw = "Uburenganzira bwa Contacts",
                description = "Select individual contacts to add into customers with editable names and credit profiles.",
                descriptionRw = "Guhitamo abakiriya muri contacts ukabongeraho amazina n'amakuru ya ngombwa.",
                isGranted = hasContactsPermission(context),
                isCrucial = true,
                iconName = "contacts",
                titleKey = "perm_contacts_title",
                descriptionKey = "perm_contacts_desc"
            )
        )

        // SMS / Messages
        list.add(
            AppPermissionItem(
                permission = Manifest.permission.SEND_SMS,
                title = "Direct SMS Messaging",
                titleRw = "Kohereza Ubutumwa bwa SMS",
                description = "Send instant official SMS payment reminders, debt alerts, and sale receipts directly to customers.",
                descriptionRw = "Kohereza ubutumwa bwa SMS bw'amadeni, inyemezabuguzi na raporo z'ubucuruzi ako kanya.",
                isGranted = hasSmsPermission(context),
                isCrucial = true,
                iconName = "sms",
                titleKey = "perm_sms_title",
                descriptionKey = "perm_sms_desc"
            )
        )

        // Camera (Barcode + QR)
        list.add(
            AppPermissionItem(
                permission = Manifest.permission.CAMERA,
                title = "Camera Barcode & QR Scanner",
                titleRw = "Kamera yo Gusoma Barcode na QR",
                description = "Scan product barcodes, receipt QR seals, and branch sync codes in real time.",
                descriptionRw = "Gusoma barcode z'ibicuruzwa, QR z'inyemezabuguzi n'amashami ukoresheje kamera.",
                isGranted = hasCameraPermission(context),
                isCrucial = true,
                iconName = "camera",
                titleKey = "perm_camera_title",
                descriptionKey = "perm_camera_desc"
            )
        )

        // Foreground Location (Branch & Terminal Audit — no background tracking)
        list.add(
            AppPermissionItem(
                permission = Manifest.permission.ACCESS_FINE_LOCATION,
                title = "Branch Terminal Location (Foreground)",
                titleRw = "Aho Iduka Riherereye (GPS)",
                description = "Attach active branch GPS locality to device telemetry, sales audits, and cloud admin verification.",
                descriptionRw = "Guhuza aho terminal iherereye n'ubugenzuzi bw'amashami kuri cloud igihe uyikoresha.",
                isGranted = hasLocationPermission(context),
                isCrucial = false,
                iconName = "location"
            )
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            list.add(
                AppPermissionItem(
                    permission = Manifest.permission.POST_NOTIFICATIONS,
                    title = "Business Alerts & Notifications",
                    titleRw = "Imenyesha ry'Ubucuruzi",
                    description = "Receive instant alerts when stock runs out, debt payment is due, or security checks trigger.",
                    descriptionRw = "Kumenyeshwa ibicuruzwa bishize mu bubiko, amadeni n'umutekano w'ikoreshwa.",
                    isGranted = hasNotificationPermission(context),
                    isCrucial = true,
                    iconName = "notifications",
                    titleKey = "perm_notif_title",
                    descriptionKey = "perm_notif_desc"
                )
            )
            list.add(
                AppPermissionItem(
                    permission = Manifest.permission.NEARBY_WIFI_DEVICES,
                    title = "Nearby Branch LAN Sync",
                    titleRw = "Guhuza Amashami kuri Wi-Fi",
                    description = "Discover local master POS hubs over Wi-Fi without requiring continuous location access.",
                    descriptionRw = "Kubona amashami ari kuri Wi-Fi imwe byihuse.",
                    isGranted = hasNearbyWifiPermission(context),
                    isCrucial = false,
                    iconName = "wifi",
                    titleKey = "perm_wifi_title",
                    descriptionKey = "perm_wifi_desc"
                )
            )
        }

        return list
    }

    fun getRequiredPermissionsList(): List<String> {
        val list = mutableListOf(
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            list.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        return list
    }

    fun hasAllCrucialPermissions(context: Context): Boolean {
        val required = listOf(
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.CAMERA
        ) + if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            listOf(Manifest.permission.POST_NOTIFICATIONS)
        } else emptyList()
        return required.all { hasPermission(context, it) }
    }

    fun getUngrantedPermissions(context: Context): List<String> {
        return getRequiredPermissionsList().filter { !hasPermission(context, it) }
    }

    fun summarizePermissionsStatus(context: Context): String {
        val items = getAllPermissionsStatus(context)
        val granted = items.count { it.isGranted }
        return "$granted/${items.size} active (" +
            items.joinToString(", ") {
                val short = when (it.iconName) {
                    "contacts" -> "Contacts"
                    "sms" -> "SMS"
                    "camera" -> "Camera"
                    "location" -> "Location"
                    "notifications" -> "Notif"
                    "wifi" -> "WiFi"
                    else -> it.iconName
                }
                "$short:${if (it.isGranted) "ON" else "OFF"}"
            } + ")"
    }
}
