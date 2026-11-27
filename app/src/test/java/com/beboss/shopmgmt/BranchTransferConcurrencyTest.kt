package com.beboss.shopmgmt

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.beboss.shopmgmt.data.db.AppDatabase
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.StockTransfer
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
}
