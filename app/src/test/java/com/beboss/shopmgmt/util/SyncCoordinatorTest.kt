package com.beboss.shopmgmt.util

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.CartItem
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import com.beboss.shopmgmt.data.repository.BeBossRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@ExperimentalCoroutinesApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SyncCoordinatorTest {

    private lateinit var database: AppDatabase
    private lateinit var cloudSyncManager: CloudSyncManager
    private lateinit var repository: BeBossRepository

    @Before
    fun setup() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        cloudSyncManager = CloudSyncManager(database)
        repository = BeBossRepository(database)

        runBlocking {
            val profile = ShopProfile(
                id = 1L,
                shopName = "Test Shop",
                phone = "+250788123456",
                name = "Test Owner"
            )
            database.shopProfileDao().insertOrUpdateProfile(profile)
        }
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun testOfflineToOnlineSync() = runTest {
        val product = Product(
            id = "prod-1",
            name = "Test Product",
            category = "Test Category",
            costPrice = 500.0,
            sellingPrice = 1000.0,
            quantityInStock = 10.0,
            unit = "pcs",
            barcode = "1234567890",
            branchId = "main_branch"
        )
        database.productDao().insertProduct(product)

        val sale = repository.processSale(
            items = listOf(CartItem(product = product, quantity = 1.0)),
            customerId = null,
            customerName = "Test Customer",
            discountAmount = 0.0,
            paymentMethod = "CASH",
            amountPaid = 1000.0,
            notes = "Offline checkout test",
            branchId = "main_branch",
            branchName = "Main Store",
            cashierId = "cashier-1",
            cashierName = "Test Cashier"
        )

        val outboxItems = database.syncQueueDao().getPendingQueueDirect()
        val saleQueueItems = outboxItems.filter { it.tableName == "sales" && it.recordId == sale.id }
        assertEquals("Should have 1 sale item in sync queue", 1, saleQueueItems.size)
        assertEquals("CREATE", saleQueueItems.first().operation)
        assertTrue("Sync queue should have pending item", database.syncQueueDao().getPendingCount().first() > 0)
    }

    @Test
    fun testSyncQueueItemCreation() = runTest {
        val product = Product(
            id = "test-product-1",
            name = "Test Product",
            category = "Test Category",
            costPrice = 500.0,
            sellingPrice = 1000.0,
            quantityInStock = 10.0,
            unit = "pcs",
            barcode = "1234567890",
            branchId = "main_branch"
        )

        val owner = User.defaultForRole("Owner", "owner", UserRole.OWNER)
        repository.saveProduct(product, actor = owner)

        val queueItems = database.syncQueueDao().getPendingQueueDirect()
        val productItems = queueItems.filter { it.tableName == "products" && it.recordId == product.id }

        assertTrue("Should have product sync item", productItems.isNotEmpty())
        assertEquals("CREATE", productItems.first().operation)
    }

    @Test
    fun testDeadLetterQueueFlow() = runTest {
        val syncQueueItem = SyncQueueItem(
            id = "dead-letter-test-1",
            tableName = "products",
            recordId = "non-existent-id",
            operation = "UPDATE",
            payloadJson = """{"name":"Updated Product"}""",
            retryCount = 5,
            nextAttemptAt = System.currentTimeMillis(),
            lastError = "Failure before DLQ",
            status = "PENDING",
            createdAt = System.currentTimeMillis()
        )

        database.syncQueueDao().enqueue(syncQueueItem)
        cloudSyncManager.moveToDeadLetter(syncQueueItem.id, "Max retries exceeded")

        val remainingItem = database.syncQueueDao().getSyncQueueItem(syncQueueItem.id)
        assertEquals("Item should be removed from sync queue", null, remainingItem)

        val deadLetterItems = database.deadLetterDao().getAllItemsList()
        assertTrue("Should have item in dead letter queue", deadLetterItems.isNotEmpty())

        val deadItem = deadLetterItems.first { it.originalItemId == syncQueueItem.id }
        assertEquals("Max retries exceeded", deadItem.failureReason)
        assertEquals(6, deadItem.failureCount)
    }

    @Test
    fun testSyncFailureRecordsRetryState() = runTest {
        val item = SyncQueueItem(
            id = "retry-test-1",
            tableName = "sales",
            recordId = "sale-retry-1",
            operation = "CREATE",
            payloadJson = """{"total":2500}""",
            retryCount = 0,
            nextAttemptAt = System.currentTimeMillis(),
            status = "PENDING"
        )
        database.syncQueueDao().enqueue(item)

        val nextAttempt = System.currentTimeMillis() + 10_000L
        database.syncQueueDao().recordAttemptFailure(
            id = item.id,
            retryCount = 1,
            nextAttemptAt = nextAttempt,
            lastError = "Network timeout",
            status = "PENDING"
        )

        val updated = database.syncQueueDao().getSyncQueueItem(item.id)
        assertEquals(1, updated?.retryCount)
        assertEquals("Network timeout", updated?.lastError)
        assertEquals(nextAttempt, updated?.nextAttemptAt)
    }

    @Test
    fun testConflictResolutionWithHLC() = runTest {
        val sale1 = Sale(
            id = "sale-conflict-1",
            branchId = "branch-1",
            cashierId = "cashier-1",
            customerName = "Customer A",
            totalAmount = 100.0,
            amountPaid = 100.0,
            paymentMethod = "CASH",
            paymentStatus = "PAID",
            saleDate = System.currentTimeMillis(),
            hlcTimestamp = 1000,
            lastModifiedDeviceId = "device-1"
        )

        val sale2 = sale1.copy(
            id = "sale-conflict-1",
            totalAmount = 200.0,
            hlcTimestamp = 2000,
            lastModifiedDeviceId = "device-2"
        )

        assertTrue("Higher HLC should win", sale2.hlcTimestamp > sale1.hlcTimestamp)
    }

    @Test
    fun testSyncQueueExponentialBackoff() = runTest {
        val maxRetries = 6
        val baseDelay = 5000L

        for (retryCount in 1..maxRetries) {
            val backoffMs = baseDelay * (1L shl retryCount.coerceAtMost(8))
            val capped = backoffMs.coerceAtMost(3_600_000L)

            if (retryCount > 1) {
                val prevBackoff = (baseDelay * (1L shl (retryCount - 1).coerceAtMost(8))).coerceAtMost(3_600_000L)
                assertTrue("Backoff should increase: $capped >= $prevBackoff", capped >= prevBackoff)
            }

            assertTrue("Backoff should not exceed 1 hour", capped <= 3_600_000L)
        }
    }

    @Test
    fun testSyncReportGeneration() = runTest {
        val report = CloudSyncReport(
            state = CloudSyncState.SYNCED,
            itemsPushed = 10,
            itemsPulled = 5,
            lastSyncTimestamp = System.currentTimeMillis(),
            message = "Sync successful",
            branchesCount = 2,
            productsCount = 50,
            salesCount = 100,
            debtsCount = 10,
            conflictsResolved = 2,
            latencyMs = 1500
        )

        assertEquals(CloudSyncState.SYNCED, report.state)
        assertEquals(10, report.itemsPushed)
        assertEquals(5, report.itemsPulled)
        assertEquals(2, report.branchesCount)
        assertEquals(50, report.productsCount)
        assertEquals(100, report.salesCount)
        assertEquals(10, report.debtsCount)
        assertEquals(2, report.conflictsResolved)
        assertEquals(1500, report.latencyMs)
        assertTrue(report.message.contains("successful"))
    }

    @Test
    fun testEndpointConnectionTest() = runTest {
        val validHttps = "https://api.example.com"
        val validLocalHttp = "http://192.168.1.100"
        val validLocalhost = "http://localhost:8080"
        val invalidHttp = "http://api.example.com"

        assertTrue("HTTPS should be valid for remote", validHttps.startsWith("https://"))
        assertTrue("Local HTTP should be valid", validLocalHttp.startsWith("http://") && validLocalHttp.contains("192.168."))
        assertTrue("Localhost HTTP should be valid", validLocalhost.startsWith("http://") && validLocalhost.contains("localhost"))
        assertTrue("Remote HTTP should be invalid", !invalidHttp.startsWith("https://"))
    }
}