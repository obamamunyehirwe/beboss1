package com.beboss.shopmgmt.data.db

import android.content.Context
import android.util.Log
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import com.beboss.shopmgmt.data.dao.BranchDao
import com.beboss.shopmgmt.data.dao.CustomerDao
import com.beboss.shopmgmt.data.dao.CustomerPaymentDao
import com.beboss.shopmgmt.data.dao.DeadLetterDao
import com.beboss.shopmgmt.data.dao.LocalAuditLogDao
import com.beboss.shopmgmt.data.dao.PaymentVerificationDao
import com.beboss.shopmgmt.data.dao.ProductDao
import com.beboss.shopmgmt.data.dao.PurchaseDao
import com.beboss.shopmgmt.data.dao.RedeemedVoucherDao
import com.beboss.shopmgmt.data.dao.SaleDao
import com.beboss.shopmgmt.data.dao.ShopDeviceDao
import com.beboss.shopmgmt.data.dao.ShopProfileDao
import com.beboss.shopmgmt.data.dao.StockTransferDao
import com.beboss.shopmgmt.data.dao.SyncQueueDao
import com.beboss.shopmgmt.data.dao.SyncTombstoneDao
import com.beboss.shopmgmt.data.dao.UserDao
import com.beboss.shopmgmt.data.model.Branch
import com.beboss.shopmgmt.data.model.Customer
import com.beboss.shopmgmt.data.model.CustomerPayment
import com.beboss.shopmgmt.data.model.DeadLetterItem
import com.beboss.shopmgmt.data.model.LocalAuditLog
import com.beboss.shopmgmt.data.model.PaymentVerificationRequest
import com.beboss.shopmgmt.data.model.Product
import com.beboss.shopmgmt.data.model.PurchaseRecord
import com.beboss.shopmgmt.data.model.RedeemedVoucher
import com.beboss.shopmgmt.data.model.Sale
import com.beboss.shopmgmt.data.model.SaleItem
import com.beboss.shopmgmt.data.model.ShopDevice
import com.beboss.shopmgmt.data.model.ShopProfile
import com.beboss.shopmgmt.data.model.StockTransfer
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.data.model.SyncTombstone
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.util.CryptoKeyManager
import net.zetetic.database.sqlcipher.SQLiteDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory
import java.io.File
import java.util.concurrent.TimeUnit

@Database(
    entities = [
        ShopProfile::class,
        Product::class,
        Customer::class,
        Sale::class,
        SaleItem::class,
        SyncQueueItem::class,
        User::class,
        CustomerPayment::class,
        Branch::class,
        PurchaseRecord::class,
        StockTransfer::class,
        RedeemedVoucher::class,
        PaymentVerificationRequest::class,
        LocalAuditLog::class,
        SyncTombstone::class,
        ShopDevice::class,
        DeadLetterItem::class
    ],
    version = 17,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun productDao(): ProductDao
    abstract fun customerDao(): CustomerDao
    abstract fun customerPaymentDao(): CustomerPaymentDao
    abstract fun saleDao(): SaleDao
    abstract fun shopProfileDao(): ShopProfileDao
    abstract fun syncQueueDao(): SyncQueueDao
    abstract fun userDao(): UserDao
    abstract fun branchDao(): BranchDao
    abstract fun purchaseDao(): PurchaseDao
    abstract fun stockTransferDao(): StockTransferDao
    abstract fun redeemedVoucherDao(): RedeemedVoucherDao
    abstract fun paymentVerificationDao(): PaymentVerificationDao
    abstract fun localAuditLogDao(): LocalAuditLogDao
    abstract fun syncTombstoneDao(): SyncTombstoneDao
    abstract fun shopDeviceDao(): ShopDeviceDao
    abstract fun deadLetterDao(): DeadLetterDao

    companion object {
        const val DATABASE_NAME = "beboss_database.db"
        private const val TAG = "AppDatabase"
        private val SQLITE_HEADER = "SQLite format 3\u0000".toByteArray(Charsets.US_ASCII)

        @Volatile
        private var INSTANCE: AppDatabase? = null

        @OptIn(androidx.room.ExperimentalRoomApi::class)
        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE?.let { return@synchronized it }
                val appContext = context.applicationContext
                val builder = Room.databaseBuilder(
                    appContext,
                    AppDatabase::class.java,
                    DATABASE_NAME
                )
                    .addMigrations(*DatabaseMigrations.ALL_MIGRATIONS)
                    .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
                    .setAutoCloseTimeout(60, TimeUnit.SECONDS)
                    .allowMainThreadQueries()  // For emergency fallbacks only

                if (!CryptoKeyManager.isRobolectricJvm()) {
                    val lazyEncryptedFactory = SupportSQLiteOpenHelper.Factory { configuration ->
                        synchronized(this) {
                            System.loadLibrary("sqlcipher")
                            val passphrase = CryptoKeyManager.getOrCreateDatabasePassphrase(appContext)
                            migrateLegacyPlaintextDatabaseIfNeeded(appContext, passphrase)
                            SupportOpenHelperFactory(passphrase).create(configuration)
                        }
                    }
                    builder.openHelperFactory(lazyEncryptedFactory)
                }

                val instance = builder.build()
                INSTANCE = instance
                instance
            }
        }

        private fun migrateLegacyPlaintextDatabaseIfNeeded(context: Context, passphrase: ByteArray) {
            val dbFile = context.getDatabasePath(DATABASE_NAME)
            if (!dbFile.exists() || dbFile.length() < SQLITE_HEADER.size) return

            val header = ByteArray(SQLITE_HEADER.size)
            dbFile.inputStream().use { it.read(header) }
            if (!header.contentEquals(SQLITE_HEADER)) {
                // Already SQLCipher-encrypted
                return
            }

            Log.i(TAG, "Migrating legacy unencrypted database to SQLCipher AES-256...")
            val encryptedTmp = File(dbFile.parentFile, "$DATABASE_NAME.enc_tmp")
            if (encryptedTmp.exists()) encryptedTmp.delete()

            val plainDb = SQLiteDatabase.openDatabase(
                dbFile.absolutePath,
                null,
                SQLiteDatabase.OPEN_READWRITE
            )
            try {
                val hexKey = passphrase.joinToString("") { "%02x".format(it) }
                plainDb.rawExecSQL("ATTACH DATABASE '${encryptedTmp.absolutePath}' AS encrypted KEY \"x'$hexKey'\";")
                plainDb.rawExecSQL("SELECT sqlcipher_export('encrypted');")
                plainDb.rawExecSQL("DETACH DATABASE encrypted;")
            } finally {
                plainDb.close()
            }

            if (encryptedTmp.exists() && encryptedTmp.length() > 0L) {
                File(dbFile.parentFile, "$DATABASE_NAME-wal").delete()
                File(dbFile.parentFile, "$DATABASE_NAME-shm").delete()
                dbFile.delete()
                if (!encryptedTmp.renameTo(dbFile)) {
                    throw IllegalStateException("Unable to finalize encrypted database migration.")
                }
            }
        }
    }
}
