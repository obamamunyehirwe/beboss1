package com.example

import android.app.Application
import com.example.util.BeBossLogger
import com.example.util.BeBossNotificationManager
import com.example.util.ClockGuard
import com.example.util.CloudSyncScheduler
import com.example.util.OfflineSubscriptionManager

class BeBossApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ClockGuard.init(this)
        OfflineSubscriptionManager.initConfigCache(this)
        BeBossNotificationManager.createNotificationChannels(this)
        CloudSyncScheduler.schedulePeriodicSync(this)
        installGlobalExceptionHandler()
        
        // Initialize Sentry crash reporting (if configured)
        initializeCrashReporting()
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
