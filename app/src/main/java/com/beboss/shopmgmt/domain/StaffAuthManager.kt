package com.beboss.shopmgmt.domain

import com.beboss.shopmgmt.data.dao.SyncQueueDao
import com.beboss.shopmgmt.data.dao.SyncTombstoneDao
import com.beboss.shopmgmt.data.dao.UserDao
import com.beboss.shopmgmt.data.model.SyncQueueItem
import com.beboss.shopmgmt.data.model.SyncTombstone
import com.beboss.shopmgmt.data.model.User
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.HlcClock
import com.beboss.shopmgmt.util.SecurityUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.util.Locale

/**
 * Domain Manager handling User Authentication, Role-based Access Control, and PBKDF2 credential upgrades.
 */
class StaffAuthManager(
    private val userDao: UserDao,
    private val syncQueueDao: SyncQueueDao,
    private val syncTombstoneDao: SyncTombstoneDao? = null
) {
    val allActiveUsers: Flow<List<User>> = userDao.getAllActiveUsers()

    suspend fun getUserByPin(pin: String): User? = withContext(Dispatchers.IO) {
        val trimmed = pin.trim()
        val allUsers = userDao.getAllActiveUsersList()
        for (user in allUsers) {
            if (SecurityUtils.verifyPin(trimmed, user.pinHash)) {
                // If stored PIN was using legacy hash or plain format, transparently upgrade to PBKDF2
                if (SecurityUtils.needsUpgrade(user.pinHash)) {
                    val upgradedUser = user.copy(
                        pinHash = SecurityUtils.hashPin(trimmed),
                        updatedAt = System.currentTimeMillis()
                    )
                    userDao.updateUser(upgradedUser)
                    return@withContext upgradedUser
                }
                return@withContext user
            }
        }
        null
    }

    suspend fun getUserByUsername(username: String): User? = withContext(Dispatchers.IO) {
        userDao.getUserByUsername(username.trim().lowercase(Locale.getDefault()))
    }

    suspend fun verifyUserPassword(username: String, passwordAttempt: String): User? = withContext(Dispatchers.IO) {
        val user = userDao.getUserByUsername(username.trim().lowercase(Locale.getDefault())) ?: return@withContext null
        if (SecurityUtils.verifyPassword(passwordAttempt.trim(), user.password)) {
            if (SecurityUtils.needsUpgrade(user.password)) {
                val upgradedUser = user.copy(
                    password = SecurityUtils.hashPassword(passwordAttempt.trim()),
                    updatedAt = System.currentTimeMillis()
                )
                userDao.updateUser(upgradedUser)
                return@withContext upgradedUser
            }
            return@withContext user
        }
        null
    }

    suspend fun saveUser(user: User) = withContext(Dispatchers.IO) {
        val securedPin = if (user.pinHash.isNotBlank() && SecurityUtils.needsUpgrade(user.pinHash)) {
            SecurityUtils.hashPin(user.pinHash)
        } else {
            user.pinHash
        }

        val securedPassword = if (user.password.isNotBlank() && SecurityUtils.needsUpgrade(user.password)) {
            SecurityUtils.hashPassword(user.password)
        } else {
            user.password
        }

        val normalizedUsername = user.username.trim().lowercase(Locale.ROOT)
        require(normalizedUsername.matches(Regex("[a-z0-9._-]{2,80}"))) {
            "Choose a username using 2–80 letters, numbers, dots, underscores or hyphens."
        }
        val duplicate = userDao.getUserByUsernameExcept(normalizedUsername, user.id)
        require(duplicate == null) {
            "The username @$normalizedUsername is already assigned to ${duplicate?.name ?: "another staff member"}. Choose a unique username."
        }

        val userToSave = user.copy(
            username = normalizedUsername,
            pinHash = securedPin,
            password = securedPassword,
            updatedAt = System.currentTimeMillis()
        )

        userDao.insertUser(userToSave)
        syncQueueDao.enqueue(
            SyncQueueItem(
                tableName = "users",
                recordId = userToSave.id,
                operation = "UPDATE",
                payloadJson = """{"id":"${userToSave.id}","name":"${userToSave.name}","username":"${userToSave.username}","role":"${userToSave.role.name}","branchId":"${userToSave.assignedBranchId}","phone":"${userToSave.phone}","isActive":${userToSave.isActive}}"""
            )
        )
    }

    suspend fun deleteUser(userId: String) = withContext(Dispatchers.IO) {
        val now = ClockGuard.effectiveNowMs()
        userDao.deleteUser(userId)
        syncTombstoneDao?.insertTombstone(
            SyncTombstone(
                id = SyncTombstone.keyFor("users", userId),
                tableName = "users",
                recordId = userId,
                deletedAt = now,
                hlcTimestamp = HlcClock.tick(now)
            )
        )
        syncQueueDao.enqueue(
            SyncQueueItem(
                tableName = "users",
                recordId = userId,
                operation = "DELETE",
                payloadJson = """{"id":"$userId"}"""
            )
        )
    }

    suspend fun updateLastLogin(userId: String) = withContext(Dispatchers.IO) {
        userDao.updateLastLogin(userId)
    }

    /**
     * Legacy compatibility only. First-run accounts are created exclusively through
     * the explicit shop-registration flow; never seed demonstration workers or PINs.
     */
    suspend fun ensureDefaultAdminUser(): User = withContext(Dispatchers.IO) {
        userDao.getAllActiveUsersList().firstOrNull()
            ?: throw IllegalStateException("No active shop user exists. Register the shop owner to create the first account.")
    }
}
