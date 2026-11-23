package com.beboss.shopmgmt

import android.app.Application
import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.CartItem
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerPayment
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import com.beboss.shopmgmt.data.repository.BeBossRepository
import com.beboss.shopmgmt.ui.viewmodel.coordinators.AuthSessionCoordinator
import com.beboss.shopmgmt.util.AppLanguage
import com.beboss.shopmgmt.util.normalizeUnlockCodeInput
import com.beboss.shopmgmt.util.optCleanString
import com.beboss.shopmgmt.util.safeMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class AsyncSyncAndNullSafetyTest {

    @Test
    fun `optCleanString never leaks literal null strings and respects fallback`() {
        val json = JSONObject()
            .put("jsonNull", JSONObject.NULL)
            .put("literalNull", "null")
            .put("upperNull", " NULL ")
            .put("blankVal", "   ")
            .put("validVal", "Kigali HQ")

        assertEquals("", json.optCleanString("missingKey"))
        assertEquals("fallback", json.optCleanString("missingKey", "fallback"))
        assertEquals("", json.optCleanString("jsonNull"))
        assertEquals("default", json.optCleanString("jsonNull", "default"))
        assertEquals("", json.optCleanString("literalNull"))
        assertEquals("", json.optCleanString("upperNull"))
        assertEquals("default", json.optCleanString("blankVal", "default"))
        assertEquals("Kigali HQ", json.optCleanString("validVal", "default"))
    }

    @Test
    fun `safeMessage eliminates null and literal null messages across exception chains`() {
        val nullMsgException = RuntimeException(null as String?)
        val literalNullException = IllegalStateException("  null ")
        val nestedCauseException = RuntimeException(null, IllegalArgumentException("Invalid branch payload"))
        val directException = IllegalStateException("Network timeout")

        assertEquals("Unexpected error occurred", nullMsgException.safeMessage())
        assertEquals("Sync failed", literalNullException.safeMessage("Sync failed"))
        assertEquals("Invalid branch payload", nestedCauseException.safeMessage("Fallback"))
        assertEquals("Network timeout", directException.safeMessage("Fallback"))
        assertFalse(nullMsgException.safeMessage("Custom fallback").contains("null", ignoreCase = true))
    }

    @Test
    fun `normalizeUnlockCodeInput preserves BB3 Base64 case while uppercasing legacy codes`() {
        val bb3 = "  bb3-AbCdEf123XyZ+=/  "
        val legacy = "  bb2-ab12-cd34  "

        assertEquals("BB3-AbCdEf123XyZ+=/", normalizeUnlockCodeInput(bb3))
        assertEquals("BB2-AB12-CD34", normalizeUnlockCodeInput(legacy))
    }

    @Test
    fun `domain managers produce valid JSON outbox payloads even with quotes and newlines`() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        try {
            val repo = BeBossRepository(db)
            val owner = User(
                id = "owner-1",
                name = "Owner \"BeBoss\"\nHQ",
                username = "owner_hq",
                phone = "+250788123456",
                role = UserRole.OWNER
            )
            val mainBranch = Branch(
                id = "main_branch",
                name = "Branch \"A\"\nKigali",
                code = "HQ-01",
                isMainBranch = true
            )
            val secondBranch = Branch(
                id = "branch_2",
                name = "Outlet \"B\"",
                code = "BR-02",
                isMainBranch = false
            )
            repo.saveUser(owner)
            repo.saveBranch(mainBranch, actor = owner)
            repo.saveBranch(secondBranch, actor = owner)

            val product = Product(
                id = "prod-quote-1",
                name = "Inyange \"Special\"\nMilk 500ml",
                category = "Dairy & Drinks",
                costPrice = 400.0,
                sellingPrice = 600.0,
                quantityInStock = 25.0,
                branchId = mainBranch.id
            )
            repo.saveProduct(product, actor = owner)

            val customer = Customer(
                id = "cust-quote-1",
                name = "Jean \"Kigali\"\nClient",
                phone = "+250788999888",
                debtBalance = 0.0
            )
            repo.saveCustomer(customer, actor = owner)

            repo.processSale(
                items = listOf(CartItem(product = product, quantity = 2.0)),
                customerId = customer.id,
                customerName = customer.name,
                discountAmount = 0.0,
                paymentMethod = "CREDIT_DEBT",
                amountPaid = 0.0,
                notes = "Note with \"quotes\" and\nnewline",
                branchId = mainBranch.id,
                branchName = mainBranch.name,
                cashierId = owner.id,
                cashierName = owner.name
            )

            repo.recordCustomerPayment(
                CustomerPayment(
                    customerId = customer.id,
                    customerName = customer.name,
                    amount = 500.0,
                    paymentMethod = "Cash",
                    notes = "Repayment \"partial\"\ncheck",
                    recordedBy = owner.name,
                    branchId = mainBranch.id,
                    branchName = mainBranch.name
                )
            )

            repo.createStockTransfer(
                productId = product.id,
                fromBranchId = mainBranch.id,
                fromBranchName = mainBranch.name,
                toBranchId = secondBranch.id,
                toBranchName = secondBranch.name,
                quantity = 3.0,
                notes = "Transfer \"urgent\"\nvan",
                transferredBy = owner.name
            )

            repo.updateShopProfile(
                ShopProfile(
                    id = 1L,
                    name = owner.name,
                    phone = owner.phone,
                    email = "owner_hq@beboss.rw",
                    shopName = "Shop \"Empire\"\nRW",
                    businessType = "Retail"
                )
            )

            val outboxItems = db.syncQueueDao().getDueQueueItems(Long.MAX_VALUE, 100)
            assertTrue("Expected outbox queue items from all domain mutations", outboxItems.size >= 8)

            outboxItems.forEach { item ->
                val parsed = JSONObject(item.payloadJson)
                assertTrue(
                    "Expected valid JSON object keys for ${item.tableName}:${item.recordId}",
                    parsed.length() > 0
                )
                assertFalse(
                    "Payload must not contain literal null string leak for ${item.tableName}",
                    item.payloadJson.contains(":null\"")
                )
            }
        } finally {
            db.close()
        }
    }

    @Test
    fun `requeueDeadLetters resets DEAD_LETTER entries back to PENDING`() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()

        try {
            val now = System.currentTimeMillis()
            db.syncQueueDao().enqueue(
                SyncQueueItem(
                    id = "dlq-item-1",
                    tableName = "sales",
                    recordId = "sale-1",
                    operation = "UPSERT",
                    payloadJson = "{\"id\":\"sale-1\"}",
                    retryCount = 8,
                    status = "DEAD_LETTER",
                    lastError = "HTTP 503",
                    nextAttemptAt = now + 999_999L
                )
            )
            assertEquals(1, db.syncQueueDao().getDeadLetterCountFlow().first())

            val resetCount = db.syncQueueDao().requeueDeadLetters(now)
            assertEquals(1, resetCount)
            assertEquals(0, db.syncQueueDao().getDeadLetterCountFlow().first())

            val due = db.syncQueueDao().getDueQueueItems(now, 10)
            assertEquals(1, due.size)
            assertEquals("PENDING", due.first().status)
            assertEquals(0, due.first().retryCount)
            assertEquals("", due.first().lastError)
        } finally {
            db.close()
        }
    }

    @Test
    fun `AuthSessionCoordinator checkAuthenticationAndInit completes cleanly without errors`() = runBlocking {
        val app = ApplicationProvider.getApplicationContext<Application>()
        val db = Room.inMemoryDatabaseBuilder(app, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        val prefs = app.getSharedPreferences("test_auth_prefs_${System.nanoTime()}", Context.MODE_PRIVATE)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

        try {
            val repo = BeBossRepository(db)
            val coordinator = AuthSessionCoordinator(
                application = app,
                prefs = prefs,
                db = db,
                repository = repo,
                scope = scope,
                language = MutableStateFlow(AppLanguage.ENGLISH),
                emitSnackbar = {}
            )

            coordinator.checkAuthenticationAndInit()
            assertTrue(coordinator.isRegistrationNeeded.value)
            assertTrue(coordinator.isLocked.value)
            assertNull(coordinator.authError.value)

            val owner = User(
                id = "owner-init-1",
                name = "Test Owner",
                username = "testowner",
                phone = "+250788111222",
                role = UserRole.OWNER,
                isActive = true
            )
            repo.saveUser(owner)

            coordinator.checkAuthenticationAndInit()
            assertFalse(coordinator.isRegistrationNeeded.value)
            assertTrue(coordinator.isLocked.value)
            assertEquals(owner.id, coordinator.currentUser.value?.id)
            assertNull(coordinator.authError.value)
        } finally {
            scope.cancel()
            prefs.edit().clear().commit()
            db.close()
        }
    }
}
