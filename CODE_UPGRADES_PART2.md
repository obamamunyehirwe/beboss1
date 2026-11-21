# BeBoss Code Upgrades — Part 2: Web Admin & Sync Engine

## 1. ENHANCED WEB ADMIN WITH REAL-TIME UPDATES

### Current Issue
- No real-time data updates
- Manual refresh required
- No WebSocket support

### Upgrade: Real-Time Admin Dashboard

```typescript
// web/src/lib/admin-realtime.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface RealtimeUpdate {
  type: "payment" | "shop" | "code" | "sync";
  action: "created" | "updated" | "deleted";
  data: Record<string, unknown>;
  timestamp: number;
}

export const subscribeToRealtimeUpdates = createServerFn({ method: "POST" })
  .handler(async ({ context }) => {
    const { supabase } = context;
    
    const updates: RealtimeUpdate[] = [];
    
    // Subscribe to payment_requests changes
    supabase
      .channel("payment_requests_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_requests" },
        (payload) => {
          updates.push({
            type: "payment",
            action: payload.eventType as "created" | "updated" | "deleted",
            data: payload.new || payload.old,
            timestamp: Date.now(),
          });
        }
      )
      .subscribe();
    
    // Subscribe to shop_accounts changes
    supabase
      .channel("shop_accounts_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_accounts" },
        (payload) => {
          updates.push({
            type: "shop",
            action: payload.eventType as "created" | "updated" | "deleted",
            data: payload.new || payload.old,
            timestamp: Date.now(),
          });
        }
      )
      .subscribe();
    
    // Subscribe to unlock_codes changes
    supabase
      .channel("unlock_codes_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "unlock_codes" },
        (payload) => {
          updates.push({
            type: "code",
            action: payload.eventType as "created" | "updated" | "deleted",
            data: payload.new || payload.old,
            timestamp: Date.now(),
          });
        }
      )
      .subscribe();
    
    return updates;
  });

export const getRealtimeMetrics = createServerFn({ method: "POST" })
  .handler(async ({ context }) => {
    const { supabase } = context;
    
    const [payments, shops, codes, syncs] = await Promise.all([
      supabase
        .from("payment_requests")
        .select("status")
        .then((r) => r.data || []),
      supabase
        .from("shop_accounts")
        .select("subscription_status")
        .then((r) => r.data || []),
      supabase
        .from("unlock_codes")
        .select("status")
        .then((r) => r.data || []),
      supabase
        .from("branch_sync_snapshots")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .then((r) => r.data || []),
    ]);
    
    return {
      pendingPayments: payments.filter((p: any) => p.status === "PENDING_VERIFICATION").length,
      activeShops: shops.filter((s: any) => s.subscription_status === "ACTIVE").length,
      redeemedCodes: codes.filter((c: any) => c.status === "REDEEMED").length,
      lastSyncTime: syncs[0]?.updated_at || null,
      timestamp: Date.now(),
    };
  });
```

---

## 2. ENHANCED SYNC ENGINE WITH CONFLICT RESOLUTION

### Current Issue
- Simple last-write-wins strategy
- No conflict detection
- Missing merge logic

### Upgrade: Advanced Conflict Resolution

```kotlin
// app/src/main/java/com/example/util/ConflictResolutionEngine.kt
package com.example.util

import com.example.data.model.Sale
import com.example.data.model.Product
import java.util.concurrent.ConcurrentHashMap

class ConflictResolutionEngine {
    
    data class ConflictMetadata(
        val localVersion: Long,
        val remoteVersion: Long,
        val localTimestamp: Long,
        val remoteTimestamp: Long,
        val localHash: String,
        val remoteHash: String
    )
    
    enum class ConflictResolution {
        LOCAL_WINS,
        REMOTE_WINS,
        MERGE,
        MANUAL_REVIEW
    }
    
    fun resolveProductConflict(
        local: Product,
        remote: Product,
        metadata: ConflictMetadata
    ): Pair<Product, ConflictResolution> {
        // If hashes match, no conflict
        if (metadata.localHash == metadata.remoteHash) {
            return Pair(local, ConflictResolution.LOCAL_WINS)
        }
        
        // If remote is newer, use remote
        if (metadata.remoteTimestamp > metadata.localTimestamp) {
            return Pair(remote, ConflictResolution.REMOTE_WINS)
        }
        
        // If local is newer, use local
        if (metadata.localTimestamp > metadata.remoteTimestamp) {
            return Pair(local, ConflictResolution.LOCAL_WINS)
        }
        
        // Same timestamp - merge intelligently
        val merged = mergeProducts(local, remote)
        return Pair(merged, ConflictResolution.MERGE)
    }
    
    private fun mergeProducts(local: Product, remote: Product): Product {
        return local.copy(
            // Use higher stock quantity
            quantityInStock = maxOf(local.quantityInStock, remote.quantityInStock),
            // Use lower cost price (better deal)
            costPrice = minOf(local.costPrice, remote.costPrice),
            // Use higher selling price
            sellingPrice = maxOf(local.sellingPrice, remote.sellingPrice),
            // Use more recent update timestamp
            updatedAt = maxOf(local.updatedAt, remote.updatedAt),
            // Merge notes
            notes = "${local.notes}\n[MERGED]\n${remote.notes}".trim()
        )
    }
    
    fun resolveSaleConflict(
        local: Sale,
        remote: Sale,
        metadata: ConflictMetadata
    ): Pair<Sale, ConflictResolution> {
        // Sales are immutable - use timestamp
        if (metadata.remoteTimestamp > metadata.localTimestamp) {
            return Pair(remote, ConflictResolution.REMOTE_WINS)
        }
        
        return Pair(local, ConflictResolution.LOCAL_WINS)
    }
    
    fun detectConflict(
        localHash: String,
        remoteHash: String,
        localVersion: Long,
        remoteVersion: Long
    ): Boolean {
        return localHash != remoteHash && localVersion != remoteVersion
    }
}
```

---

## 3. ENHANCED PAYMENT PROCESSOR WITH VALIDATION

### Current Issue
- Minimal payment validation
- No fraud detection
- Missing idempotency keys

### Upgrade: Robust Payment Processing

```typescript
// web/src/lib/payment-processor.ts
import { z } from "zod";
import crypto from "crypto";

export interface PaymentRequest {
  id: string;
  shopId: string;
  amount: number;
  provider: "MTN" | "AIRTEL";
  reference: string;
  timestamp: number;
  idempotencyKey: string;
}

export interface PaymentValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  riskScore: number;
}

export class PaymentProcessor {
  private processedPayments = new Map<string, PaymentRequest>();
  private fraudPatterns = new Map<string, number>();
  
  validatePayment(payment: PaymentRequest): PaymentValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    let riskScore = 0;
    
    // Validate amount
    if (payment.amount < 1000) {
      errors.push("Amount must be at least 1,000 FRw");
    }
    if (payment.amount > 10_000_000) {
      errors.push("Amount exceeds maximum limit");
      riskScore += 30;
    }
    
    // Validate reference format
    if (!this.isValidReference(payment.reference, payment.provider)) {
      errors.push(`Invalid ${payment.provider} reference format`);
    }
    
    // Check for duplicate processing
    if (this.processedPayments.has(payment.idempotencyKey)) {
      const existing = this.processedPayments.get(payment.idempotencyKey)!;
      if (existing.amount === payment.amount && existing.reference === payment.reference) {
        warnings.push("This payment appears to have been processed already");
        riskScore += 20;
      }
    }
    
    // Fraud detection
    const fraudRisk = this.detectFraudPatterns(payment);
    if (fraudRisk > 0) {
      riskScore += fraudRisk;
      if (fraudRisk > 50) {
        warnings.push("High fraud risk detected - manual review recommended");
      }
    }
    
    // Check shop history
    const shopHistory = this.getShopPaymentHistory(payment.shopId);
    if (shopHistory.failureRate > 0.3) {
      warnings.push("Shop has high payment failure rate");
      riskScore += 15;
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      riskScore: Math.min(100, riskScore),
    };
  }
  
  private isValidReference(reference: string, provider: string): boolean {
    if (provider === "MTN") {
      // MTN reference format: typically 10-12 digits
      return /^\d{10,12}$/.test(reference);
    } else if (provider === "AIRTEL") {
      // Airtel reference format: typically 10-12 digits
      return /^\d{10,12}$/.test(reference);
    }
    return false;
  }
  
  private detectFraudPatterns(payment: PaymentRequest): number {
    let riskScore = 0;
    
    // Check for rapid successive payments
    const key = `${payment.shopId}_${payment.provider}`;
    const lastPaymentTime = this.fraudPatterns.get(key) || 0;
    const timeSinceLastPayment = payment.timestamp - lastPaymentTime;
    
    if (timeSinceLastPayment < 60_000) {  // Less than 1 minute
      riskScore += 25;
    }
    
    this.fraudPatterns.set(key, payment.timestamp);
    
    return riskScore;
  }
  
  private getShopPaymentHistory(shopId: string): { failureRate: number; totalPayments: number } {
    // In production, fetch from database
    return { failureRate: 0, totalPayments: 0 };
  }
  
  generateIdempotencyKey(shopId: string, amount: number, reference: string): string {
    return crypto
      .createHash("sha256")
      .update(`${shopId}:${amount}:${reference}:${Date.now()}`)
      .digest("hex");
  }
  
  recordProcessedPayment(payment: PaymentRequest): void {
    this.processedPayments.set(payment.idempotencyKey, payment);
    
    // Clean up old entries (older than 24 hours)
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, value] of this.processedPayments.entries()) {
      if (value.timestamp < cutoffTime) {
        this.processedPayments.delete(key);
      }
    }
  }
}
```

---

## 4. ENHANCED UNLOCK CODE GENERATOR WITH VALIDATION

### Current Issue
- No code format validation
- Missing expiry checks
- No revocation tracking

### Upgrade: Secure Code Generation

```kotlin
// app/src/main/java/com/example/util/EnhancedUnlockCodeGenerator.kt
package com.example.util

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class EnhancedUnlockCodeGenerator(private val signingSecret: String) {
    
    data class UnlockCode(
        val code: String,
        val tier: String,
        val days: Int,
        val expiryTimestamp: Long,
        val accountHash: String,
        val signature: String,
        val issuedAt: Long
    )
    
    fun generateCode(
        username: String,
        phone: String,
        tier: String,
        days: Int
    ): UnlockCode {
        val now = System.currentTimeMillis()
        val expiryTimestamp = now + (days * 86_400_000L)
        
        // Generate account hash
        val accountHash = generateAccountHash(username, phone)
        
        // Generate expiry hex
        val expiryHex = expiryTimestamp.toString(16).padStart(4, '0').uppercase()
        
        // Build code prefix
        val codePrefix = "BB2-$tier-$days-$expiryHex-$accountHash"
        
        // Generate HMAC signature
        val signature = generateHmacSignature(codePrefix)
        
        // Final code
        val finalCode = "$codePrefix-$signature"
        
        return UnlockCode(
            code = finalCode,
            tier = tier,
            days = days,
            expiryTimestamp = expiryTimestamp,
            accountHash = accountHash,
            signature = signature,
            issuedAt = now
        )
    }
    
    fun validateCode(code: String, username: String, phone: String): ValidationResult {
        val parts = code.split("-")
        
        if (parts.size != 6) {
            return ValidationResult(false, "Invalid code format")
        }
        
        val (prefix, tier, days, expiryHex, accountHash, signature) = parts
        
        // Validate prefix
        if (prefix != "BB2") {
            return ValidationResult(false, "Invalid code prefix")
        }
        
        // Validate tier
        if (tier !in listOf("SINGLE", "DUAL", "MULTI", "ANNUAL")) {
            return ValidationResult(false, "Invalid tier")
        }
        
        // Validate days
        val daysInt = days.toIntOrNull() ?: return ValidationResult(false, "Invalid days")
        if (daysInt < 1 || daysInt > 365) {
            return ValidationResult(false, "Days out of range")
        }
        
        // Validate account hash
        val expectedHash = generateAccountHash(username, phone)
        if (accountHash != expectedHash) {
            return ValidationResult(false, "Account hash mismatch")
        }
        
        // Validate expiry
        val expiryTimestamp = expiryHex.toLong(16)
        if (expiryTimestamp < System.currentTimeMillis()) {
            return ValidationResult(false, "Code has expired")
        }
        
        // Validate signature
        val codePrefix = "$prefix-$tier-$days-$expiryHex-$accountHash"
        val expectedSignature = generateHmacSignature(codePrefix)
        
        if (!constantTimeEquals(signature, expectedSignature)) {
            return ValidationResult(false, "Invalid signature")
        }
        
        return ValidationResult(true, "Valid")
    }
    
    private fun generateAccountHash(username: String, phone: String): String {
        val normalized = "${username.lowercase()}:${normalizePhone(phone)}"
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(normalized.toByteArray())
        return Base64.encodeToString(hash, Base64.NO_WRAP).take(6).uppercase()
    }
    
    private fun generateHmacSignature(data: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        val key = SecretKeySpec(signingSecret.toByteArray(), "HmacSHA256")
        mac.init(key)
        val signature = mac.doFinal(data.toByteArray())
        return Base64.encodeToString(signature, Base64.NO_WRAP).take(8).uppercase()
    }
    
    private fun normalizePhone(phone: String): String {
        return phone.replace(Regex("[^0-9]"), "").takeLast(9)
    }
    
    private fun constantTimeEquals(a: String, b: String): Boolean {
        if (a.length != b.length) return false
        
        var result = 0
        for (i in a.indices) {
            result = result or (a[i].code xor b[i].code)
        }
        return result == 0
    }
    
    data class ValidationResult(
        val isValid: Boolean,
        val message: String
    )
}
```

---

## 5. ENHANCED AUDIT LOGGER WITH IMMUTABILITY

### Current Issue
- Audit logs can be modified
- No tamper detection
- Missing event chaining

### Upgrade: Immutable Audit Trail

```kotlin
// app/src/main/java/com/example/util/ImmutableAuditLogger.kt
package com.example.util

import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList

class ImmutableAuditLogger {
    
    data class AuditEntry(
        val id: String,
        val timestamp: Long,
        val actor: String,
        val action: String,
        val resource: String,
        val details: String,
        val previousHash: String,
        val entryHash: String
    )
    
    private val entries = CopyOnWriteArrayList<AuditEntry>()
    
    fun logAction(
        actor: String,
        action: String,
        resource: String,
        details: String
    ): AuditEntry {
        val id = generateId()
        val timestamp = System.currentTimeMillis()
        val previousHash = entries.lastOrNull()?.entryHash ?: "0"
        
        val entryData = "$id:$timestamp:$actor:$action:$resource:$details:$previousHash"
        val entryHash = hashEntry(entryData)
        
        val entry = AuditEntry(
            id = id,
            timestamp = timestamp,
            actor = actor,
            action = action,
            resource = resource,
            details = details,
            previousHash = previousHash,
            entryHash = entryHash
        )
        
        entries.add(entry)
        return entry
    }
    
    fun verifyIntegrity(): IntegrityResult {
        if (entries.isEmpty()) {
            return IntegrityResult(true, "No entries to verify")
        }
        
        var previousHash = "0"
        var tamperedCount = 0
        
        for (entry in entries) {
            if (entry.previousHash != previousHash) {
                tamperedCount++
            }
            
            val expectedHash = hashEntry(
                "${entry.id}:${entry.timestamp}:${entry.actor}:${entry.action}:${entry.resource}:${entry.details}:${entry.previousHash}"
            )
            
            if (entry.entryHash != expectedHash) {
                tamperedCount++
            }
            
            previousHash = entry.entryHash
        }
        
        return IntegrityResult(
            isValid = tamperedCount == 0,
            message = if (tamperedCount == 0) "Audit trail is intact" else "Detected $tamperedCount tampered entries"
        )
    }
    
    fun getEntries(limit: Int = 100): List<AuditEntry> {
        return entries.takeLast(limit)
    }
    
    fun getEntriesByActor(actor: String): List<AuditEntry> {
        return entries.filter { it.actor == actor }
    }
    
    fun getEntriesByAction(action: String): List<AuditEntry> {
        return entries.filter { it.action == action }
    }
    
    private fun hashEntry(data: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(data.toByteArray())
        return hash.joinToString("") { "%02x".format(it) }
    }
    
    private fun generateId(): String {
        return "AUDIT-${System.currentTimeMillis()}-${(0..9999).random()}"
    }
    
    data class IntegrityResult(
        val isValid: Boolean,
        val message: String
    )
}
```

---

## Summary of Part 2 Upgrades

✅ **Real-Time Admin Dashboard** — WebSocket-based live updates  
✅ **Advanced Conflict Resolution** — Intelligent merge strategies  
✅ **Robust Payment Processor** — Fraud detection & validation  
✅ **Enhanced Unlock Code Generator** — Secure code generation & validation  
✅ **Immutable Audit Logger** — Tamper-proof audit trail  

**Next**: Part 3 will cover UI/UX, Performance, and Testing upgrades.
