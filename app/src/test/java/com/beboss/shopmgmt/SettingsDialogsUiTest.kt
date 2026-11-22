package com.beboss.shopmgmt

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.DatabaseEngineStats
import com.beboss.shopmgmt.data.model.LocalAuditLog
import com.beboss.shopmgmt.data.model.ShopDevice
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import com.beboss.shopmgmt.ui.screens.DiagnosticsDialog
import com.beboss.shopmgmt.ui.screens.ShopDevicesDialog
import com.beboss.shopmgmt.ui.theme.MyApplicationTheme
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.ConnectivityStatus
import com.beboss.shopmgmt.util.DeviceIntegrityStatus
import com.beboss.shopmgmt.util.SyncAuditLog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w412dp-h915dp-xxhdpi")
class SettingsDialogsUiTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `shop devices dialog registers secondary terminal and shows generated join code`() {
        val owner = User(
            id = "u_owner",
            name = "Jean Paul",
            username = "jeanpaul",
            role = UserRole.OWNER,
            isActive = true
        )
        val cashier = User(
            id = "u_cashier",
            name = "Alice Uwase",
            username = "alice",
            role = UserRole.CASHIER,
            assignedBranchId = "br_main",
            assignedBranchName = "Main Store",
            isActive = true
        )
        val branch = Branch(
            id = "br_main",
            name = "Main Store",
            code = "HQ-01",
            isMainBranch = true
        )
        val primaryDevice = ShopDevice(
            id = "dev_primary",
            deviceName = "Owner Tablet",
            joinCode = "OWNER",
            assignedUserId = owner.id,
            assignedUsername = owner.username,
            assignedUserName = owner.name,
            role = "OWNER",
            branchId = branch.id,
            branchName = branch.name,
            isOwnerPrimary = true,
            isActive = true,
            monthlyFeeAddonRwf = 0
        )

        var addedDeviceName = ""
        composeTestRule.setContent {
            MyApplicationTheme(darkTheme = false) {
                ShopDevicesDialog(
                    shopDevices = listOf(primaryDevice),
                    allUsers = listOf(owner, cashier),
                    branches = listOf(branch),
                    language = AppLanguage.ENGLISH,
                    onAddDevice = { name, user, selectedBranch, onCreated ->
                        addedDeviceName = name
                        onCreated(
                            ShopDevice(
                                id = "dev_2",
                                deviceName = name,
                                joinCode = "BB-778899",
                                assignedUserId = user.id,
                                assignedUsername = user.username,
                                assignedUserName = user.name,
                                role = user.role.name,
                                branchId = selectedBranch?.id ?: "br_main",
                                branchName = selectedBranch?.name ?: "Main Store",
                                isOwnerPrimary = false,
                                isActive = true
                            )
                        )
                    },
                    onToggleActive = { _, _ -> },
                    onDelete = {},
                    onDismiss = {}
                )
            }
        }

        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("shop_devices_dialog").assertIsDisplayed()
        composeTestRule.onNodeWithTag("shop_devices_toggle_add_btn")
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("shop_device_name_input")
            .performScrollTo()
            .performTextInput("Counter #2")
        composeTestRule.onNodeWithTag("shop_devices_add_btn")
            .performScrollTo()
            .performClick()
        composeTestRule.waitForIdle()

        assertEquals("Counter #2", addedDeviceName)
        composeTestRule.onNodeWithText("Join Code: BB-778899").assertIsDisplayed()
    }

    @Test
    fun `diagnostics dialog switches across security database and audit tabs and triggers actions`() {
        var verifiedClicked = false
        var syncClicked = false

        composeTestRule.setContent {
            MyApplicationTheme(darkTheme = false) {
                DiagnosticsDialog(
                    shopProfile = ShopProfile(id = 1L, shopName = "BeBoss Flagship"),
                    databaseStats = DatabaseEngineStats(
                        productCount = 42,
                        salesCount = 128,
                        totalRecordsCount = 210,
                        fileSizeFormatted = "512 KB",
                        integrityStatus = "OK"
                    ),
                    deviceIntegrityStatus = DeviceIntegrityStatus(
                        isCompromisedRisk = false,
                        signals = emptyList(),
                        keystoreBacking = "StrongBox"
                    ),
                    connectivityStatus = ConnectivityStatus.AVAILABLE,
                    pendingSyncCount = 3,
                    deadLetterSyncCount = 0,
                    isSyncing = false,
                    isOptimizingDb = false,
                    syncAuditLogs = listOf(
                        SyncAuditLog(
                            type = "CLOUD_PUSH",
                            status = "SUCCESS",
                            summary = "Synced 3 sales to Supabase",
                            latencyMs = 140L
                        )
                    ),
                    localAuditLogs = listOf(
                        LocalAuditLog(
                            actorName = "Jean Paul",
                            actorRole = "OWNER",
                            action = "DB_INTEGRITY_CHECK",
                            details = "PRAGMA integrity_check OK"
                        )
                    ),
                    adminLastSyncedAt = 1_760_000_000_000L,
                    language = AppLanguage.ENGLISH,
                    onVerifyDatabaseIntegrity = { verifiedClicked = true },
                    onOptimizeDatabase = {},
                    onRefreshDatabaseStats = {},
                    onForceSyncNow = { syncClicked = true },
                    onDismiss = {}
                )
            }
        }

        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("diagnostics_dialog").assertIsDisplayed()

        // Switch to DB & Sync tab and trigger PRAGMA Check & Force Sync
        composeTestRule.onNodeWithTag("diagnostics_tab_database").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("diagnostics_verify_db_btn")
            .performScrollTo()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeTestRule.onNodeWithTag("diagnostics_force_sync_btn")
            .performScrollTo()
            .assertHeightIsAtLeast(48.dp)
            .performClick()

        assertTrue(verifiedClicked)
        assertTrue(syncClicked)

        // Switch to Audit tab and verify unified entries render
        composeTestRule.onNodeWithTag("diagnostics_tab_audit").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Synced 3 sales to Supabase").assertIsDisplayed()
        composeTestRule.onNodeWithText("PRAGMA integrity_check OK").assertIsDisplayed()
    }
}
