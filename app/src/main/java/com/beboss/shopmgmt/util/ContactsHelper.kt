package com.beboss.shopmgmt.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import androidx.core.content.ContextCompat

data class PickedContactInfo(
    val name: String,
    val phone: String,
    val email: String = "",
    val address: String = ""
)

private data class ContactPhoneRow(
    val contactId: String,
    val name: String,
    val phone: String
)

object ContactsHelper {

    fun hasContactsPermission(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED
    }

    /** Digits-only comparison key; the displayed phone number is never rewritten. */
    fun normalizePhoneNumber(phone: String): String = phone.filter { it.isDigit() }

    /**
     * Reads contact data for the user's review only. This function never selects contacts
     * or writes customer records; importing still requires an explicit user selection.
     */
    fun fetchAllPhoneContacts(context: Context): List<PickedContactInfo> {
        if (!hasContactsPermission(context)) return emptyList()

        val rows = mutableListOf<ContactPhoneRow>()
        val seenPhones = mutableSetOf<String>()
        val resolver = context.contentResolver
        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        )

        try {
            resolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
                val nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val phoneIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)

                while (cursor.moveToNext()) {
                    if (idIndex < 0 || nameIndex < 0 || phoneIndex < 0) continue
                    val id = cursor.getString(idIndex).orEmpty()
                    val name = cursor.getString(nameIndex).orEmpty().trim()
                    val phone = cursor.getString(phoneIndex).orEmpty().trim()
                    val normalized = normalizePhoneNumber(phone)
                    if (id.isNotBlank() && name.isNotBlank() && normalized.isNotBlank() &&
                        seenPhones.add(normalized)
                    ) {
                        rows.add(ContactPhoneRow(id, name, phone))
                    }
                }
            }
        } catch (_: SecurityException) {
            return emptyList()
        } catch (_: Exception) {
            return emptyList()
        }

        val emails = valuesByContactId(
            context,
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            ContactsContract.CommonDataKinds.Email.CONTACT_ID,
            ContactsContract.CommonDataKinds.Email.ADDRESS
        )
        val addresses = valuesByContactId(
            context,
            ContactsContract.CommonDataKinds.StructuredPostal.CONTENT_URI,
            ContactsContract.CommonDataKinds.StructuredPostal.CONTACT_ID,
            ContactsContract.CommonDataKinds.StructuredPostal.FORMATTED_ADDRESS
        )

        return rows.map { row ->
            PickedContactInfo(
                name = row.name,
                phone = row.phone,
                email = emails[row.contactId].orEmpty(),
                address = addresses[row.contactId].orEmpty()
            )
        }
    }

    private fun valuesByContactId(
        context: Context,
        uri: Uri,
        idColumn: String,
        valueColumn: String
    ): Map<String, String> {
        val values = linkedMapOf<String, String>()
        try {
            context.contentResolver.query(
                uri,
                arrayOf(idColumn, valueColumn),
                null,
                null,
                null
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndex(idColumn)
                val valueIndex = cursor.getColumnIndex(valueColumn)
                if (idIndex < 0 || valueIndex < 0) return values
                while (cursor.moveToNext()) {
                    val id = cursor.getString(idIndex).orEmpty()
                    val value = cursor.getString(valueIndex).orEmpty().trim()
                    if (id.isNotBlank() && value.isNotBlank() && !values.containsKey(id)) {
                        values[id] = value
                    }
                }
            }
        } catch (_: SecurityException) {
            return emptyMap()
        } catch (_: Exception) {
            return emptyMap()
        }
        return values
    }

    private fun firstValueForContact(
        context: Context,
        uri: Uri,
        idColumn: String,
        valueColumn: String,
        contactId: String
    ): String {
        return try {
            context.contentResolver.query(
                uri,
                arrayOf(valueColumn),
                idColumn + " = ?",
                arrayOf(contactId),
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0).orEmpty().trim() else ""
            }.orEmpty()
        } catch (_: SecurityException) {
            ""
        } catch (_: Exception) {
            ""
        }
    }

    /** Extracts the selected contact's name, phone, email and postal address. */
    fun extractContactDetails(context: Context, contactUri: Uri): PickedContactInfo? {
        var name = ""
        var phone = ""
        var contactId = ""
        val resolver = context.contentResolver

        try {
            resolver.query(contactUri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(ContactsContract.Contacts.DISPLAY_NAME)
                    if (nameIndex >= 0) name = cursor.getString(nameIndex).orEmpty()
                    val idIndex = cursor.getColumnIndex(ContactsContract.Contacts._ID)
                    if (idIndex >= 0) contactId = cursor.getString(idIndex).orEmpty()
                    val hasPhoneIndex = cursor.getColumnIndex(ContactsContract.Contacts.HAS_PHONE_NUMBER)
                    val hasPhone = if (hasPhoneIndex >= 0) cursor.getInt(hasPhoneIndex) else 0

                    if (contactId.isNotBlank() && hasPhone > 0) {
                        resolver.query(
                            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                            arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                            ContactsContract.CommonDataKinds.Phone.CONTACT_ID + " = ?",
                            arrayOf(contactId),
                            ContactsContract.CommonDataKinds.Phone.IS_PRIMARY + " DESC"
                        )?.use { phoneCursor ->
                            if (phoneCursor.moveToFirst()) phone = phoneCursor.getString(0).orEmpty()
                        }
                    }
                }
            }
        } catch (_: SecurityException) {
            return null
        } catch (_: Exception) {
            return null
        }

        if (name.isBlank()) name = contactUri.lastPathSegment.orEmpty()
        if (name.isBlank() && phone.isBlank()) return null
        val email = if (contactId.isBlank()) "" else firstValueForContact(
            context,
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            ContactsContract.CommonDataKinds.Email.CONTACT_ID,
            ContactsContract.CommonDataKinds.Email.ADDRESS,
            contactId
        )
        val address = if (contactId.isBlank()) "" else firstValueForContact(
            context,
            ContactsContract.CommonDataKinds.StructuredPostal.CONTENT_URI,
            ContactsContract.CommonDataKinds.StructuredPostal.CONTACT_ID,
            ContactsContract.CommonDataKinds.StructuredPostal.FORMATTED_ADDRESS,
            contactId
        )
        return PickedContactInfo(
            name = name.ifBlank { "Contact" },
            phone = phone.trim(),
            email = email,
            address = address
        )
    }
}
