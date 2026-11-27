package com.beboss.shopmgmt

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.StockTransfer
import com.beboss.shopmgmt.data.model.ShopDevice
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.data.model.UserRole
import com.beboss.shopmgmt.data.repository.BeBossRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class BranchTransferConcurrencyTest {

    private fun inMemoryDatabase(): AppDatabase {
        val context = ApplicationProvider.getApplicationContext<Context>()
        return Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @Test
    fun `concurrent transfers cannot oversell source inventory`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            db.branchDao().insertAllBranches(
                listOf(
                    Branch(id = "source", name = "Source", code = "SRC"),
                    Branch(id = "destination", name = "Destination", code = "DST")
                )
            )
            db.productDao().insertProduct(
                Product(
                    id = "stock-race",
                    name = "Rice",
                    costPrice = 700.0,
                    sellingPrice = 900.0,
                    quantityInStock = 10.0,
                    branchId = "source"
                )
            )

            val results = coroutineScope {
                listOf(
                    async(Dispatchers.IO) {
                        runCatching {
                            repository.branchTransferManager.recordStockTransfer(
                                "stock-race", "source", "Source", "destination", "Destination",
                                6.0, "Concurrent transfer A", "Manager A"
                            )
                        }
                    },
                    async(Dispatchers.IO) {
                        runCatching {
                            repository.branchTransferManager.recordStockTransfer(
                                "stock-race", "source", "Source", "destination", "Destination",
                                6.0, "Concurrent transfer B", "Manager B"
                            )
                        }
                    }
                ).awaitAll()
            }

            assertEquals("Only one transfer can consume the available ten units", 1, results.count { it.isSuccess })
            assertEquals(1, db.stockTransferDao().getAllTransfersList().size)
            assertEquals(4.0, db.productDao().getProductById("stock-race")!!.quantityInStock, 0.001)
        } finally {
            db.close()
        }
    }

    @Test
    fun `concurrent receipt confirmations credit destination stock once`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            db.branchDao().insertAllBranches(
                listOf(
                    Branch(id = "source", name = "Source", code = "SRC"),
                    Branch(id = "destination", name = "Destination", code = "DST")
                )
            )
            db.productDao().insertProduct(
                Product(
                    id = "source-rice",
                    name = "Rice",
                    quantityInStock = 7.0,
                    branchId = "source"
                )
            )
            db.stockTransferDao().insertTransfer(
                StockTransfer(
                    id = "receipt-race",
                    transferNumber = "TRF-RECEIPT-RACE",
                    productId = "source-rice",
                    productName = "Rice",
                    fromBranchId = "source",
                    fromBranchName = "Source",
                    toBranchId = "destination",
                    toBranchName = "Destination",
                    quantity = 3.0,
                    status = "IN_TRANSIT"
                )
            )

            val results = coroutineScope {
                listOf(
                    async(Dispatchers.IO) {
                        repository.branchTransferManager.confirmTransferReceived("receipt-race", "Receiver A")
                    },
                    async(Dispatchers.IO) {
                        repository.branchTransferManager.confirmTransferReceived("receipt-race", "Receiver B")
                    }
                ).awaitAll()
            }

            assertTrue(results.all { it.status == "COMPLETED" })
            val destinationProducts = db.productDao().getAllProductsList().filter { it.branchId == "destination" }
            assertEquals(1, destinationProducts.size)
            assertEquals(3.0, destinationProducts.single().quantityInStock, 0.001)
            assertEquals("COMPLETED", db.stockTransferDao().getTransferById("receipt-race")!!.status)
        } finally {
            db.close()
        }
    }

    @Test
    fun `warehouse cannot be saved as the main retail branch`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            val result = runCatching {
                repository.branchTransferManager.saveBranch(
                    Branch(
                        id = "warehouse-main",
                        name = "Central Warehouse",
                        code = "WH-01",
                        locationType = "WAREHOUSE",
                        isMainBranch = true
                    )
                )
            }
            assertTrue("A warehouse must never become the main POS branch", result.isFailure)
            assertEquals(null, db.branchDao().getBranchById("warehouse-main"))
        } finally {
            db.close()
        }
    }

    @Test
    fun `stock transfers support an active warehouse destination and use verified location names`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            db.branchDao().insertAllBranches(
                listOf(
                    Branch(id = "retail", name = "Retail Store", code = "ST-01"),
                    Branch(id = "warehouse", name = "Central Warehouse", code = "WH-01", locationType = "WAREHOUSE")
                )
            )
            db.productDao().insertProduct(
                Product(
                    id = "warehouse-rice",
                    name = "Rice",
                    costPrice = 700.0,
                    sellingPrice = 900.0,
                    quantityInStock = 10.0,
                    branchId = "retail"
                )
            )

            val transfer = repository.branchTransferManager.recordStockTransfer(
                productId = "warehouse-rice",
                fromBranchId = "retail",
                fromBranchName = "Untrusted caller name",
                toBranchId = "warehouse",
                toBranchName = "Wrong destination label",
                quantity = 3.0,
                notes = "Warehouse replenishment",
                transferredBy = "Store Manager"
            )

            assertEquals("Retail Store", transfer.fromBranchName)
            assertEquals("Central Warehouse", transfer.toBranchName)
            assertEquals("IN_TRANSIT", transfer.status)
            assertEquals(7.0, db.productDao().getProductById("warehouse-rice")!!.quantityInStock, 0.001)
        } finally {
            db.close()
        }
    }

    @Test
    fun `concurrent cancellation restores source inventory once`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            db.branchDao().insertAllBranches(
                listOf(Branch(id = "source", name = "Source", code = "SRC"))
            )
            db.productDao().insertProduct(
                Product(
                    id = "cancel-rice",
                    name = "Rice",
                    quantityInStock = 7.0,
                    branchId = "source"
                )
            )
            db.stockTransferDao().insertTransfer(
                StockTransfer(
                    id = "cancel-race",
                    transferNumber = "TRF-CANCEL-RACE",
                    productId = "cancel-rice",
                    productName = "Rice",
                    fromBranchId = "source",
                    fromBranchName = "Source",
                    toBranchId = "destination",
                    toBranchName = "Destination",
                    quantity = 3.0,
                    status = "IN_TRANSIT"
                )
            )

            val results = coroutineScope {
                listOf(
                    async(Dispatchers.IO) {
                        repository.branchTransferManager.rejectOrCancelTransfer("cancel-race", "Manager A")
                    },
                    async(Dispatchers.IO) {
                        repository.branchTransferManager.rejectOrCancelTransfer("cancel-race", "Manager B")
                    }
                ).awaitAll()
            }

            assertTrue(results.all { it.status == "CANCELLED" })
            assertEquals(10.0, db.productDao().getProductById("cancel-rice")!!.quantityInStock, 0.001)
            assertEquals("CANCELLED", db.stockTransferDao().getTransferById("cancel-race")!!.status)
        } finally {
            db.close()
        }
    }

    @Test
    fun `main branch cannot be archived`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            db.branchDao().insertBranch(
                Branch(id = "main", name = "Main Store", code = "HQ", isMainBranch = true)
            )

            val result = runCatching { repository.branchTransferManager.deleteBranch("main") }

            assertTrue("The main POS branch must remain active", result.isFailure)
            assertTrue(db.branchDao().getBranchById("main")!!.isActive)
        } finally {
            db.close()
        }
    }

    @Test
    fun `branch archive is blocked while active staff or devices are assigned`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            db.branchDao().insertBranch(Branch(id = "branch", name = "Retail", code = "BR-01"))
            db.userDao().insertUser(
                User(name = "Cashier", username = "cashier", role = UserRole.CASHIER, assignedBranchId = "branch")
            )

            val staffResult = runCatching { repository.branchTransferManager.deleteBranch("branch") }
            assertTrue("Active assigned staff must block branch archival", staffResult.isFailure)
            assertTrue(db.branchDao().getBranchById("branch")!!.isActive)

            db.userDao().setUserActive(db.userDao().getUserByUsername("cashier")!!.id, false)
            db.shopDeviceDao().insertOrUpdate(
                ShopDevice(id = "device-1", deviceId = "DESKTOP:test", deviceName = "POS", branchId = "branch", isActive = true)
            )

            val deviceResult = runCatching { repository.branchTransferManager.deleteBranch("branch") }
            assertTrue("Active assigned devices must block branch archival", deviceResult.isFailure)
            assertTrue(db.branchDao().getBranchById("branch")!!.isActive)
        } finally {
            db.close()
        }
    }

    @Test
    fun `branch archive is blocked while products or transfers remain`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            db.branchDao().insertBranch(Branch(id = "branch", name = "Retail", code = "BR-01"))
            db.productDao().insertProduct(
                Product(id = "branch-stock", name = "Rice", quantityInStock = 2.0, branchId = "branch")
            )

            val productResult = runCatching { repository.branchTransferManager.deleteBranch("branch") }
            assertTrue("Active inventory must be moved or archived first", productResult.isFailure)

            db.productDao().deleteProductPermanently("branch-stock")
            db.stockTransferDao().insertTransfer(
                StockTransfer(
                    id = "branch-open-transfer",
                    productId = "old-product",
                    productName = "Old item",
                    fromBranchId = "branch",
                    fromBranchName = "Retail",
                    toBranchId = "other",
                    toBranchName = "Other",
                    quantity = 1.0,
                    status = "IN_TRANSIT"
                )
            )
            val transferResult = runCatching { repository.branchTransferManager.deleteBranch("branch") }
            assertTrue("Unresolved stock transfers must block branch archival", transferResult.isFailure)
            assertTrue(db.branchDao().getBranchById("branch")!!.isActive)
        } finally {
            db.close()
        }
    }

    @Test
    fun `requested or rejected transfers cannot complete or restore stock`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            db.productDao().insertProduct(
                Product(id = "request-stock", name = "Sugar", quantityInStock = 7.0, branchId = "source")
            )
            db.stockTransferDao().insertTransfers(
                listOf(
                    StockTransfer(
                        id = "requested", productId = "request-stock", productName = "Sugar",
                        fromBranchId = "source", fromBranchName = "Source",
                        toBranchId = "destination", toBranchName = "Destination",
                        quantity = 3.0, status = "REQUESTED"
                    ),
                    StockTransfer(
                        id = "rejected", productId = "request-stock", productName = "Sugar",
                        fromBranchId = "source", fromBranchName = "Source",
                        toBranchId = "destination", toBranchName = "Destination",
                        quantity = 4.0, status = "REJECTED"
                    )
                )
            )

            val receiveResult = runCatching {
                repository.branchTransferManager.confirmTransferReceived("requested", "Receiver")
            }
            val cancelResult = runCatching {
                repository.branchTransferManager.rejectOrCancelTransfer("rejected", "Manager")
            }

            assertTrue("Unvalidated requests cannot be received", receiveResult.isFailure)
            assertTrue("Rejected requests cannot restore source stock again", cancelResult.isFailure)
            assertEquals(7.0, db.productDao().getProductById("request-stock")!!.quantityInStock, 0.001)
            assertEquals("REQUESTED", db.stockTransferDao().getTransferById("requested")!!.status)
            assertEquals("REJECTED", db.stockTransferDao().getTransferById("rejected")!!.status)
        } finally {
            db.close()
        }
    }

    @Test
    fun `stock transfer ledger records cannot be deleted`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            val transfer = StockTransfer(
                id = "immutable-transfer",
                productId = "rice",
                productName = "Rice",
                fromBranchId = "source",
                fromBranchName = "Source",
                toBranchId = "destination",
                toBranchName = "Destination",
                quantity = 2.0,
                status = "COMPLETED"
            )
            db.stockTransferDao().insertTransfer(transfer)

            val result = runCatching { repository.branchTransferManager.deleteStockTransfer(transfer.id) }

            assertTrue("Deleting transfer evidence must be rejected", result.isFailure)
            assertEquals(transfer.id, db.stockTransferDao().getTransferById(transfer.id)!!.id)
        } finally {
            db.close()
        }
    }


    @Test
    fun `branch and stock transfer mutations produce local audit events`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            repository.branchTransferManager.saveBranch(
                Branch(id = "audit-source", name = "Audit Store", code = "AUD-01"),
                actorName = "Shop Owner",
                actorRole = "OWNER"
            )
            db.branchDao().insertBranch(Branch(id = "audit-destination", name = "Destination", code = "DST-01"))
            db.productDao().insertProduct(
                Product(id = "audit-rice", name = "Rice", quantityInStock = 5.0, branchId = "audit-source")
            )
            repository.branchTransferManager.recordStockTransfer(
                productId = "audit-rice",
                fromBranchId = "audit-source",
                fromBranchName = "ignored",
                toBranchId = "audit-destination",
                toBranchName = "ignored",
                quantity = 1.0,
                notes = "Audit proof",
                transferredBy = "Branch Manager",
                transferredByRole = "MANAGER"
            )

            val logs = db.localAuditLogDao().getRecentLogsDirect(20)

            assertTrue(logs.any { it.action == "BRANCH_CREATED" && it.actorName == "Shop Owner" && it.actorRole == "OWNER" })
            assertTrue(logs.any { it.action == "STOCK_TRANSFER_CREATED" && it.actorName == "Branch Manager" && it.actorRole == "MANAGER" })
        } finally {
            db.close()
        }
    }


    @Test
    fun `cashier cannot create stock transfers or change branch status`() = runBlocking {
        val db = inMemoryDatabase()
        try {
            val repository = BeBossRepository(db)
            db.branchDao().insertAllBranches(
                listOf(
                    Branch(id = "source", name = "Source", code = "SRC"),
                    Branch(id = "destination", name = "Destination", code = "DST")
                )
            )
            db.productDao().insertProduct(
                Product(id = "cashier-rice", name = "Rice", quantityInStock = 5.0, branchId = "source")
            )
            val cashier = User(
                id = "cashier-user",
                name = "Cashier",
                username = "cashier-ops",
                role = UserRole.CASHIER,
                assignedBranchId = "source",
                canManageInventory = false,
                canManageShopSettings = false
            )

            val transferResult = runCatching {
                repository.createStockTransfer(
                    productId = "cashier-rice",
                    fromBranchId = "source",
                    fromBranchName = "Source",
                    toBranchId = "destination",
                    toBranchName = "Destination",
                    quantity = 1.0,
                    notes = "Permission test",
                    transferredBy = cashier.name,
                    transferredByRole = cashier.role.name,
                    actor = cashier
                )
            }
            val branchResult = runCatching {
                repository.updateBranchOperationalStatus("source", "CLOSED", actor = cashier)
            }

            assertTrue("Cashiers without inventory permission cannot create transfers", transferResult.isFailure)
            assertTrue("Cashiers without shop settings permission cannot change branch status", branchResult.isFailure)
            assertEquals(5.0, db.productDao().getProductById("cashier-rice")!!.quantityInStock, 0.001)
            assertTrue(db.stockTransferDao().getAllTransfersList().isEmpty())
            assertEquals("OPEN", db.branchDao().getBranchById("source")!!.operationalStatus)
        } finally {
            db.close()
        }
    }

}
