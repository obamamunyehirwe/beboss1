package com.beboss.shopmgmt

import android.Manifest
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.beboss.shopmgmt.util.PermissionManager
import com.beboss.shopmgmt.util.SupabaseAdminClient
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class AdminAndPermissionsTest {

    @Test
    fun `first-launch login permissions omit broad storage or file access`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val required = PermissionManager.getRequiredPermissionsList()
        val statuses = PermissionManager.getAllPermissionsStatus(context)

        assertFalse(required.contains(Manifest.permission.READ_EXTERNAL_STORAGE))
        assertFalse(required.contains(Manifest.permission.READ_MEDIA_IMAGES))
        assertFalse(statuses.any { it.iconName == "storage" })
        assertFalse(
            statuses.any {
                it.permission == Manifest.permission.READ_EXTERNAL_STORAGE ||
                    it.permission == Manifest.permission.READ_MEDIA_IMAGES
            }
        )
        assertTrue(required.contains(Manifest.permission.READ_CONTACTS))
        assertTrue(required.contains(Manifest.permission.CAMERA))
    }

    @Test
    fun `android admin login accepts valid emails and relies on Supabase roles`() = runBlocking {
        // The configured address is only the default pre-filled login value.
        // Actual authorization is checked against user_roles + active admin_profiles.
        assertEquals("obamamunyehirwe@gmail.com", SupabaseAdminClient.MASTER_ADMIN_EMAIL)
        assertEquals("obamamunyehirwe@gmail.com", SupabaseAdminClient.getDefaultAdminEmail())
        assertTrue(SupabaseAdminClient.isValidAdminLoginEmail("obamamunyehirwe@gmail.com"))
        assertTrue(SupabaseAdminClient.isValidAdminLoginEmail("reponsekdz01@gmail.com"))
        assertTrue(SupabaseAdminClient.isValidAdminLoginEmail("  REPO@BEBOSS.APP "))
        assertFalse(SupabaseAdminClient.isValidAdminLoginEmail("not-an-email"))
        assertFalse(SupabaseAdminClient.isValidAdminLoginEmail(""))

        // Public self-registration remains disabled; granting an admin role is
        // still an explicit action in the authenticated web Admin Team workspace.
        val signUpRes = SupabaseAdminClient.signUpAdmin("other@example.com", "secret123", "Not an admin")
        assertTrue(signUpRes.isFailure)
    }
}
