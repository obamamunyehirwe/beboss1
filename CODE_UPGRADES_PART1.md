# BeBoss Code Upgrades — Part 1: Core Architecture Enhancements

## 1. ENHANCED VIEWMODEL WITH PROPER LIFECYCLE MANAGEMENT

### Current Issue
- ViewModel initialization has blocking operations
- No proper cleanup on destroy
- Memory leaks possible with long-running coroutines

### Upgrade: Robust ViewModel Base Class

```kotlin
// app/src/main/java/com/example/ui/viewmodel/BaseViewModel.kt
package com.example.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import java.util.concurrent.CopyOnWriteArrayList

abstract class BaseViewModel(application: Application) : AndroidViewModel(application) {
    
    private val _errorEvents = MutableSharedFlow<String>(replay = 0)
    val errorEvents = _errorEvents.asSharedFlow()
    
    private val _loadingState = MutableSharedFlow<Boolean>(replay = 1)
    val loadingState = _loadingState.asSharedFlow()
    
    private val activeJobs = CopyOnWriteArrayList<Job>()
    
    protected fun launchSafely(block: suspend () -> Unit) {
        val job = viewModelScope.launch {
            try {
                _loadingState.emit(true)
                block()
            } catch (e: Exception) {
                _errorEvents.emit(e.message ?: "Unknown error")
            } finally {
                _loadingState.emit(false)
            }
        }
        activeJobs.add(job)
        job.invokeOnCompletion { activeJobs.remove(job) }
    }
    
    protected fun emitError(message: String) {
        viewModelScope.launch {
            _errorEvents.emit(message)
        }
    }
    
    override fun onCleared() {
        super.onCleared()
        activeJobs.forEach { it.cancel() }
        activeJobs.clear()
        viewModelScope.cancel()
    }
}
```

---

## 2. ENHANCED DATABASE DAO WITH BATCH OPERATIONS

### Current Issue
- Individual inserts/updates are slow
- No batch operation support
- Missing transaction safety

### Upgrade: Batch DAO Operations

```kotlin
// app/src/main/java/com/example/data/dao/BatchOperationDao.kt
package com.example.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import com.example.data.model.Product
import com.example.data.model.Sale
import com.example.data.model.Customer

@Dao
interface BatchOperationDao {
    
    @Transaction
    suspend fun insertProductsBatch(products: List<Product>) {
        products.chunked(500).forEach { chunk ->
            insertProductsChunk(chunk)
        }
    }
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProductsChunk(products: List<Product>)
    
    @Transaction
    suspend fun updateProductsBatch(products: List<Product>) {
        products.chunked(500).forEach { chunk ->
            updateProductsChunk(chunk)
        }
    }
    
    @Update
    suspend fun updateProductsChunk(products: List<Product>)
    
    @Transaction
    suspend fun insertSalesBatch(sales: List<Sale>) {
        sales.chunked(100).forEach { chunk ->
            insertSalesChunk(chunk)
        }
    }
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSalesChunk(sales: List<Sale>)
    
    @Transaction
    suspend fun deleteCustomersBatch(customerIds: List<String>) {
        customerIds.chunked(500).forEach { chunk ->
            deleteCustomersChunk(chunk)
        }
    }
    
    @Query("DELETE FROM customers WHERE id IN (:ids)")
    suspend fun deleteCustomersChunk(ids: List<String>)
    
    @Transaction
    suspend fun syncBatch(
        productsToInsert: List<Product>,
        productsToUpdate: List<Product>,
        salesToInsert: List<Sale>,
        customersToDelete: List<String>
    ) {
        insertProductsBatch(productsToInsert)
        updateProductsBatch(productsToUpdate)
        insertSalesBatch(salesToInsert)
        deleteCustomersBatch(customersToDelete)
    }
}
```

---

## 3. ENHANCED REPOSITORY WITH CACHING LAYER

### Current Issue
- No caching strategy
- Repeated database queries
- No cache invalidation

### Upgrade: Smart Caching Repository

```kotlin
// app/src/main/java/com/example/data/repository/CachedBeBossRepository.kt
package com.example.data.repository

import android.util.LruCache
import com.example.data.db.AppDatabase
import com.example.data.model.Product
import com.example.data.model.Customer
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.concurrent.TimeUnit

class CachedBeBossRepository(private val db: AppDatabase) : BeBossRepository(db) {
    
    private val productCache = LruCache<String, Product>(500)
    private val customerCache = LruCache<String, Customer>(200)
    private val cacheTimestamps = mutableMapOf<String, Long>()
    
    private val CACHE_DURATION_MS = TimeUnit.MINUTES.toMillis(5)
    
    override suspend fun getProductById(id: String): Product? {
        val cached = productCache.get(id)
        if (cached != null && isCacheValid("product_$id")) {
            return cached
        }
        
        val product = super.getProductById(id)
        if (product != null) {
            productCache.put(id, product)
            cacheTimestamps["product_$id"] = System.currentTimeMillis()
        }
        return product
    }
    
    override suspend fun getCustomerById(id: String): Customer? {
        val cached = customerCache.get(id)
        if (cached != null && isCacheValid("customer_$id")) {
            return cached
        }
        
        val customer = super.getCustomerById(id)
        if (customer != null) {
            customerCache.put(id, customer)
            cacheTimestamps["customer_$id"] = System.currentTimeMillis()
        }
        return customer
    }
    
    override suspend fun saveProduct(product: Product, actor: User?) {
        super.saveProduct(product, actor)
        productCache.put(product.id, product)
        cacheTimestamps["product_${product.id}"] = System.currentTimeMillis()
    }
    
    override suspend fun saveCustomer(customer: Customer, actor: User?) {
        super.saveCustomer(customer, actor)
        customerCache.put(customer.id, customer)
        cacheTimestamps["customer_${customer.id}"] = System.currentTimeMillis()
    }
    
    override suspend fun deleteProduct(productId: String, actor: User?) {
        super.deleteProduct(productId, actor)
        productCache.remove(productId)
        cacheTimestamps.remove("product_$productId")
    }
    
    override suspend fun deleteCustomer(customerId: String, actor: User?) {
        super.deleteCustomer(customerId, actor)
        customerCache.remove(customerId)
        cacheTimestamps.remove("customer_$customerId")
    }
    
    fun clearCache() {
        productCache.evictAll()
        customerCache.evictAll()
        cacheTimestamps.clear()
    }
    
    private fun isCacheValid(key: String): Boolean {
        val timestamp = cacheTimestamps[key] ?: return false
        return System.currentTimeMillis() - timestamp < CACHE_DURATION_MS
    }
}
```

---

## 4. ENHANCED SYNC COORDINATOR WITH RETRY STRATEGY

### Current Issue
- No exponential backoff
- No dead-letter queue handling
- No sync state tracking

### Upgrade: Robust Sync with Retry Logic

```kotlin
// app/src/main/java/com/example/util/EnhancedSyncCoordinator.kt
package com.example.util

import android.util.Log
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicInteger

class EnhancedSyncCoordinator {
    
    private val _syncState = MutableStateFlow<SyncState>(SyncState.Idle)
    val syncState = _syncState.asStateFlow()
    
    private val retryCount = AtomicInteger(0)
    private val maxRetries = 5
    
    sealed class SyncState {
        object Idle : SyncState()
        object Syncing : SyncState()
        object Success : SyncState()
        data class Error(val message: String, val retryCount: Int) : SyncState()
        data class DeadLetter(val itemId: String, val reason: String) : SyncState()
    }
    
    suspend fun syncWithRetry(
        operation: suspend () -> Boolean,
        onDeadLetter: suspend (String) -> Unit = {}
    ): Boolean {
        var delay = 1000L  // Start with 1 second
        
        repeat(maxRetries) { attempt ->
            try {
                _syncState.emit(SyncState.Syncing)
                
                val success = operation()
                if (success) {
                    _syncState.emit(SyncState.Success)
                    retryCount.set(0)
                    return true
                }
                
                if (attempt < maxRetries - 1) {
                    _syncState.emit(SyncState.Error("Sync failed, retrying...", attempt + 1))
                    delay(delay)
                    delay = (delay * 1.5).toLong().coerceAtMost(60_000L)
                }
            } catch (e: Exception) {
                Log.e("SyncCoordinator", "Sync error on attempt ${attempt + 1}", e)
                
                if (attempt == maxRetries - 1) {
                    _syncState.emit(SyncState.DeadLetter("sync_${System.currentTimeMillis()}", e.message ?: "Unknown error"))
                    onDeadLetter("sync_${System.currentTimeMillis()}")
                    return false
                }
                
                _syncState.emit(SyncState.Error(e.message ?: "Unknown error", attempt + 1))
                delay(delay)
                delay = (delay * 1.5).toLong().coerceAtMost(60_000L)
            }
        }
        
        return false
    }
    
    fun resetRetryCount() {
        retryCount.set(0)
    }
    
    fun getRetryCount(): Int = retryCount.get()
}
```

---

## 5. ENHANCED SECURITY MANAGER WITH ENCRYPTION

### Current Issue
- No encryption for sensitive data in memory
- No secure string handling
- Missing key rotation

### Upgrade: Secure Data Handling

```kotlin
// app/src/main/java/com/example/util/SecureDataManager.kt
package com.example.util

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureDataManager(context: Context) {
    
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    
    private val encryptedPrefs = EncryptedSharedPreferences.create(
        context,
        "beboss_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    fun saveSecureString(key: String, value: String) {
        encryptedPrefs.edit().putString(key, value).apply()
    }
    
    fun getSecureString(key: String, default: String = ""): String {
        return encryptedPrefs.getString(key, default) ?: default
    }
    
    fun deleteSecureString(key: String) {
        encryptedPrefs.edit().remove(key).apply()
    }
    
    fun clearAllSecureData() {
        encryptedPrefs.edit().clear().apply()
    }
    
    fun encryptData(data: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        return cipher.doFinal(data)
    }
    
    fun decryptData(encryptedData: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey())
        return cipher.doFinal(encryptedData)
    }
    
    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        
        val existingKey = keyStore.getKey("beboss_master_key", null)
        if (existingKey != null) {
            return existingKey as SecretKey
        }
        
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                "beboss_master_key",
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setKeySize(256)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .build()
        )
        
        return keyGenerator.generateKey()
    }
}
```

---

## 6. ENHANCED ANALYTICS ENGINE WITH REAL-TIME CALCULATIONS

### Current Issue
- Analytics calculations are slow
- No incremental updates
- Missing real-time metrics

### Upgrade: Fast Analytics Engine

```kotlin
// app/src/main/java/com/example/domain/EnhancedAnalyticsEngine.kt
package com.example.domain

import com.example.data.model.Sale
import com.example.data.model.Product
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.concurrent.ConcurrentHashMap

class EnhancedAnalyticsEngine {
    
    private val metricsCache = ConcurrentHashMap<String, CachedMetric>()
    
    data class CachedMetric(
        val value: Double,
        val timestamp: Long,
        val ttlMs: Long
    ) {
        fun isExpired(): Boolean = System.currentTimeMillis() - timestamp > ttlMs
    }
    
    fun calculateDailyMetrics(sales: List<Sale>): DailyMetrics {
        val cacheKey = "daily_${System.currentTimeMillis() / 86_400_000}"
        
        metricsCache[cacheKey]?.let {
            if (!it.isExpired()) {
                return DailyMetrics(
                    totalRevenue = it.value,
                    totalCost = metricsCache["${cacheKey}_cost"]?.value ?: 0.0,
                    totalProfit = metricsCache["${cacheKey}_profit"]?.value ?: 0.0,
                    transactionCount = sales.size
                )
            }
        }
        
        val totalRevenue = sales.sumOf { it.totalAmount }
        val totalCost = sales.sumOf { it.totalCost }
        val totalProfit = totalRevenue - totalCost
        
        val ttl = 300_000L  // 5 minutes
        metricsCache[cacheKey] = CachedMetric(totalRevenue, System.currentTimeMillis(), ttl)
        metricsCache["${cacheKey}_cost"] = CachedMetric(totalCost, System.currentTimeMillis(), ttl)
        metricsCache["${cacheKey}_profit"] = CachedMetric(totalProfit, System.currentTimeMillis(), ttl)
        
        return DailyMetrics(
            totalRevenue = totalRevenue,
            totalCost = totalCost,
            totalProfit = totalProfit,
            transactionCount = sales.size
        )
    }
    
    fun calculateMovingAverage(values: List<Double>, window: Int = 7): List<Double> {
        if (values.size < window) return values
        
        return values.windowed(window) { it.average() }
    }
    
    fun predictDemand(historicalSales: List<Sale>, daysAhead: Int = 14): Map<String, Double> {
        val predictions = mutableMapOf<String, Double>()
        
        val groupedBySku = historicalSales.groupBy { it.productId }
        
        groupedBySku.forEach { (sku, sales) ->
            val dailyQuantities = sales
                .groupBy { it.saleDate / 86_400_000 }
                .map { it.value.sumOf { s -> s.quantity } }
            
            if (dailyQuantities.isNotEmpty()) {
                val average = dailyQuantities.average()
                val trend = calculateTrend(dailyQuantities)
                predictions[sku] = (average + trend) * daysAhead
            }
        }
        
        return predictions
    }
    
    private fun calculateTrend(values: List<Double>): Double {
        if (values.size < 2) return 0.0
        
        val n = values.size
        val xMean = (0 until n).average()
        val yMean = values.average()
        
        var numerator = 0.0
        var denominator = 0.0
        
        for (i in 0 until n) {
            numerator += (i - xMean) * (values[i] - yMean)
            denominator += (i - xMean) * (i - xMean)
        }
        
        return if (denominator != 0.0) numerator / denominator else 0.0
    }
    
    data class DailyMetrics(
        val totalRevenue: Double,
        val totalCost: Double,
        val totalProfit: Double,
        val transactionCount: Int
    )
}
```

---

## 7. ENHANCED NETWORK LAYER WITH CIRCUIT BREAKER

### Current Issue
- No circuit breaker pattern
- Cascading failures possible
- No request throttling

### Upgrade: Resilient Network Layer

```kotlin
// app/src/main/java/com/example/util/CircuitBreakerNetwork.kt
package com.example.util

import kotlinx.coroutines.delay
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class CircuitBreaker(
    private val failureThreshold: Int = 5,
    private val successThreshold: Int = 2,
    private val timeout: Long = 60_000L
) {
    
    enum class State {
        CLOSED,      // Normal operation
        OPEN,        // Failing, reject requests
        HALF_OPEN    // Testing if service recovered
    }
    
    private var state = State.CLOSED
    private val failureCount = AtomicInteger(0)
    private val successCount = AtomicInteger(0)
    private val lastFailureTime = AtomicLong(0)
    
    suspend fun <T> execute(operation: suspend () -> T): Result<T> {
        return when (state) {
            State.CLOSED -> executeClosed(operation)
            State.OPEN -> executeOpen()
            State.HALF_OPEN -> executeHalfOpen(operation)
        }
    }
    
    private suspend fun <T> executeClosed(operation: suspend () -> T): Result<T> {
        return try {
            val result = operation()
            failureCount.set(0)
            Result.success(result)
        } catch (e: Exception) {
            failureCount.incrementAndGet()
            if (failureCount.get() >= failureThreshold) {
                state = State.OPEN
                lastFailureTime.set(System.currentTimeMillis())
            }
            Result.failure(e)
        }
    }
    
    private suspend fun <T> executeOpen(): Result<T> {
        val timeSinceFailure = System.currentTimeMillis() - lastFailureTime.get()
        
        return if (timeSinceFailure > timeout) {
            state = State.HALF_OPEN
            successCount.set(0)
            Result.failure(Exception("Circuit breaker is OPEN"))
        } else {
            Result.failure(Exception("Circuit breaker is OPEN, retry after ${timeout - timeSinceFailure}ms"))
        }
    }
    
    private suspend fun <T> executeHalfOpen(operation: suspend () -> T): Result<T> {
        return try {
            val result = operation()
            successCount.incrementAndGet()
            
            if (successCount.get() >= successThreshold) {
                state = State.CLOSED
                failureCount.set(0)
            }
            
            Result.success(result)
        } catch (e: Exception) {
            state = State.OPEN
            lastFailureTime.set(System.currentTimeMillis())
            Result.failure(e)
        }
    }
    
    fun getState(): State = state
}
```

---

## Summary of Part 1 Upgrades

✅ **BaseViewModel** — Proper lifecycle management with error handling  
✅ **Batch DAO** — Efficient bulk operations with chunking  
✅ **Caching Repository** — Smart LRU cache with TTL  
✅ **Enhanced Sync** — Exponential backoff with dead-letter handling  
✅ **Secure Data Manager** — Encrypted preferences and data  
✅ **Analytics Engine** — Real-time metrics with caching  
✅ **Circuit Breaker** — Resilient network layer  

**Next**: Part 2 will cover Web Admin, Sync Engine, and Payment Processing upgrades.
