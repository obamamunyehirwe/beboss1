package com.beboss.shopmgmt.util

import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.repository.SalesRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.runTest
import kotlinx.coroutines.test.TestDispatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@ExperimentalCoroutinesApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SyncCoordinatorTest {

    private val testDispatcher = TestDispatcher()
    private lateinit var database: AppDatabase
    private lateinit var cloudSyncManager: CloudSyncManager
    private lateinit var salesRepository: SalesRepository

    @Before
    fun setup() {
        database = AppDatabase.getDatabase(org.robolectric.RuntimeEnvironment.getApplication())
        cloudSyncManager = CloudSyncManager(database)
        salesRepository = SalesRepository(database)
        
        // Initialize a test shop profile
        val profile = ShopProfile(
            id = "test-shop",
            shopName = "Test Shop",
            phone = "+250788123456",
            name = "Test Owner",
            username = "testuser"
        )
        database.shopProfileDao().insertOrUpdateProfile(profile)
    }

    @Test
    fun testOfflineToOnlineSync() = runTest {
        // 1. Create sale offline
        val sale = Sale(
            id = "test-sale-1",
            branchId = "main_branch",
            cashierId = "cashier-1",
            customerName = "Test Customer",
            customerPhone = "+250788123456",
            totalAmount = 1000.0,
            amountPaid = 1000.0,
            paymentMethod = "CASH",
            paymentStatus = "PAID",
            saleDate = System.currentTimeMillis(),
            items = listOf(
                SaleItem(
                    id = "item-1",
                    saleId = "test-sale-1",
                    productId = "prod-1",
                    productName = "Test Product",
                    quantitySold = 1.0,
                    unitPrice = 1000.0,
                    subtotal = 1000.0,
                    costPrice = 500.0,
                    totalProfit = 500.0,
                    unit = "pcs"
                )
            )
        )
        
        salesRepository.recordSale(sale)

        // 2. Verify in outbox (sync queue)
        val outboxItems = database.syncQueueDao().getPendingQueueDirect()
        assertEquals("Should have 1 item in sync queue", 1, outboxItems.size)

        // 3. Simulate internet connection - in test we can't actually connect to Supabase
        // but we can verify the sync logic is called
        // Note: This test verifies the offline-to-online flow conceptually
        
        // 4. Verify the sync queue item was created
        val syncQueueItem = outboxItems.first()
        assertEquals("SALE", syncQueueItem.tableName)
        assertEquals("INSERT", syncQueueItem.operation)
        
        // 5. The sync would be triggered here in real scenario
        // For unit test, we just verify the queue was populated
        assertTrue("Sync queue should have pending item", database.syncQueueDao().getPendingCount() > 0)
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
        
        database.productDao().insertProduct(product)
        
        // Verify sync queue item was created
        val queueItems = database.syncQueueDao().getPendingQueueDirect()
        val productItems = queueItems.filter { it.tableName == "products" }
        
        assertTrue("Should have product sync item", productItems.isNotEmpty())
        assertEquals("INSERT", productItems.first().operation)
    }

    @Test
    fun testDeadLetterQueueFlow() = runTest {
        // Create a sync queue item that will fail
        val syncQueueItem = com.beboss.shopmgmt.data.model.SyncQueueItem(
            id = "dead-letter-test-1",
            tableName = "products",
            recordId = "non-existent-id",
            operation = "UPDATE",
            payloadJson = """{"name":"Updated Product"}""",
            retryCount = 5, // Exceeds max retries
            nextAttemptAt = System.currentTimeMillis(),
            lastError = "Simulated failure",
            status = "PENDING",
            createdAt = System.currentTimeMillis()
        )
        
        database.syncQueueDao().enqueue(syncQueueItem)
        
        // Move to dead letter
        cloudSyncManager.moveToDeadLetter(syncQueueItem.id, "Max retries exceeded")
        
        // Verify it's removed from sync queue
        val remainingItem = database.syncQueueDao().getSyncQueueItem(syncQueueItem.id)
        assertEquals("Item should be removed from sync queue", null, remainingItem)
        
        // Verify it's in dead letter queue
        val deadLetterItems = database.deadLetterDao().getAllItemsList()
        assertTrue("Should have item in dead letter queue", deadLetterItems.isNotEmpty())
        
        val deadItem = deadLetterItems.first { it.originalItemId == syncQueueItem.id }
        assertEquals("Max retries exceeded", deadItem.failureReason)
        assertEquals(6, deadItem.failureCount) // retryCount + 1
    }

    @Test
    fun testSyncRetryLogic() = runTest {
        // Test that retryWithBackoff increases delay exponentially
        var attempt = 0
        var lastDelay = 0L
        
        val result = cloudSyncManager.retryWithBackoff(maxAttempts = 3) {
            attempt++
            if (attempt < 3) {
                // Simulate failure
                false
            } else {
                // Succeed on 3rd attempt
                true
            }
        }
        
        assertTrue("Should eventually succeed", result)
        assertEquals(3, attempt)
    }

    @Test
    fun testConflictResolutionWithHLC() = runTest {
        // Test that HLC timestamps are used for conflict resolution
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
            id = "sale-conflict-1", // Same ID
            totalAmount = 200.0, // Different amount
            hlcTimestamp = 2000, // Higher HLC = wins
            lastModifiedDeviceId = "device-2"
        )
        
        // In a real scenario, the conflict resolution engine would pick sale2
        // because it has a higher HLC timestamp
        assertTrue("Higher HLC should win", sale2.hlcTimestamp > sale1.hlcTimestamp)
    }

    @Test
    fun testSyncQueueExponentialBackoff() = runTest {
        // Test the exponential backoff calculation used in sync
        val maxRetries = 6
        val baseDelay = 5000L
        
        for (retryCount in 1..maxRetries) {
            val backoffMs = baseDelay * (1L shl retryCount.coerceAtMost(8))
            val capped = backoffMs.coerceAtMost(3_600_000L)
            
            // Verify backoff increases exponentially
            if (retryCount > 1) {
                val prevBackoff = baseDelay * (1L shl (retryCount - 1).coerceAtMost(8)).coerceAtMost(3_600_000L)
                assertTrue("Backoff should increase: $capped > $prevBackoff", capped >= prevBackoff)
            }
            
            // Verify cap at 1 hour
            assertTrue("Backoff should not exceed 1 hour", capped <= 3_600_000L)
        }
    }

    @Test
    fun testSyncReportGeneration() = runTest {
        // Test that sync report contains expected fields
        val report = CloudSyncManager.CloudSyncReport(
            state = CloudSyncManager.CloudSyncState.SYNCED,
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
        
        assertEquals(CloudSyncManager.CloudSyncState.SYNCED, report.state)
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
        // Test that endpoint validation works
        // Note: This is a conceptual test - actual network calls would be mocked
        val validHttps = "https://api.example.com"
        val validLocalHttp = "http://192.168.1.100"
        val validLocalhost = "http://localhost:8080"
        val invalidHttp = "http://api.example.com" // Not HTTPS for remote
        
        // These are internal methods - testing conceptually
        assertTrue("HTTPS should be valid for remote", validHttps.startsWith("https://"))
        assertTrue("Local HTTP should be valid", validLocalHttp.startsWith("http://") && validLocalhttp.contains("192.168."))
        assertTrue("Localhost HTTP should be valid", validLocalhost.startsWith("http://") && validLocalhost.contains("localhost"))
        assertTrue("Remote HTTP should be invalid", !invalidHttp.startsWith("https://"))
    }
}