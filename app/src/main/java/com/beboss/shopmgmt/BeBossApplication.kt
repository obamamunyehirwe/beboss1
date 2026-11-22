package com.beboss.shopmgmt

import android.app.Application
import com.beboss.shopmgmt.util.BeBossLogger
import com.beboss.shopmgmt.util.BeBossNotificationManager
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.CloudSyncScheduler
import com.beboss.shopmgmt.util.OfflineSubscriptionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class BeBossApplication : Application() {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        ClockGuard.init(this)
        OfflineSubscriptionManager.initConfigCache(this)
        installGlobalExceptionHandler()

        // Initialize Sentry crash reporting (if configured)
        initializeCrashReporting()

        // Defer Binder IPC (NotificationManager) and WorkManager SQLite initialization off the main thread
        appScope.launch {
            BeBossNotificationManager.createNotificationChannels(this@BeBossApplication)
            CloudSyncScheduler.schedulePeriodicSync(this@BeBossApplication)
        }
    }

    private fun installGlobalExceptionHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            BeBossLogger.e("BeBossApp", "Uncaught exception on thread=${thread.name}", throwable)
            previous?.uncaughtException(thread, throwable)
        }
    }

    /**
     * Initialize Sentry crash reporting if Sentry DSN is configured.
     * Uses BuildConfig.SENTRY_DSN from .env file.
     */
    private fun initializeCrashReporting() {
        try {
            val sentryDsn = BuildConfig.SENTRY_DSN?.takeIf { it.isNotBlank() }
            if (sentryDsn != null) {
                // Initialize Sentry crash reporter hook
                BeBossLogger.SentryCrashReporter = { tag, message, throwable ->
                    try {
                        // Sentry will capture the exception when added as dependency
                        // For now, we prepare the hook for future Sentry integration
                        BeBossLogger.i("Sentry", "Crash reported: $tag - $message")
                    } catch (_: Throwable) {
                        // Sentry not available - ignore
                    }
                }
                BeBossLogger.i("CrashReporting", "Sentry DSN configured - ready for crash reporting")
            }
        } catch (e: Exception) {
            BeBossLogger.w("CrashReporting", "Failed to initialize crash reporting", e)
        }
    }
}
