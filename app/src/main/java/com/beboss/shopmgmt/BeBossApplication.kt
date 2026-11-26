package com.beboss.shopmgmt

import android.app.Application
import com.beboss.shopmgmt.util.BeBossLogger
import com.beboss.shopmgmt.util.BeBossNotificationManager
import com.beboss.shopmgmt.util.ClockGuard
import com.beboss.shopmgmt.util.CloudSyncScheduler
import com.beboss.shopmgmt.util.OfflineSubscriptionManager
import com.beboss.shopmgmt.util.LegacyCredentialPepperStore
import io.sentry.Sentry
import io.sentry.SentryLevel
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class BeBossApplication : Application() {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        // Seal the old credential pepper before any local staff authentication runs.
        // The Secure flavor has no embedded pepper and reads only this Keystore envelope.
        LegacyCredentialPepperStore.initialize(this)
        if (LegacyCredentialPepperStore.migrationStatus() == "TRANSITION_VALUE_AVAILABLE_BUT_NOT_PERSISTED") {
            BeBossLogger.w(
                "CredentialMigration",
                "The legacy offline credential key is available for this session but was not persisted to Android Keystore. Keep this transition build installed and retry the migration before upgrading to Secure."
            )
        }
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
     * Initializes the real Sentry Android SDK only when a DSN is configured.
     * Default PII, screenshots, and view-hierarchy attachments remain disabled.
     * Sentry also installs its uncaught-exception and ANR integrations.
     */
    private fun initializeCrashReporting() {
        val sentryDsn = BuildConfig.SENTRY_DSN?.trim()?.takeIf { it.isNotEmpty() }
        if (sentryDsn == null) {
            BeBossLogger.i("CrashReporting", "Crash reporting is disabled because no Sentry DSN is configured.")
            return
        }

        try {
            SentryAndroid.init(this) { options ->
                options.dsn = sentryDsn
                options.environment = if (BuildConfig.DEBUG) "development" else "production"
                options.release = "${BuildConfig.APPLICATION_ID}@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"
                options.isSendDefaultPii = false
                options.isAttachScreenshot = false
                options.isAttachViewHierarchy = false
                options.tracesSampleRate = 0.0
                options.isDebug = BuildConfig.DEBUG

                // POS/network breadcrumbs may contain sale references, customer
                // details, local file paths or request metadata. Keep stack traces,
                // release/environment and sanitized component messages; discard
                // automatic breadcrumbs and request/user/extra context.
                options.beforeBreadcrumb = SentryOptions.BeforeBreadcrumbCallback { _, _ -> null }
                options.beforeSend = SentryOptions.BeforeSendCallback { event, _ ->
                    event.setUser(null)
                    event.setRequest(null)
                    event.setExtras(emptyMap())
                    event.setBreadcrumbs(null)
                    event.exceptions?.forEach { exception ->
                        exception.value = "Exception details redacted."
                        exception.setUnknown(null)
                    }
                    event
                }
            }

            BeBossLogger.SentryCrashReporter = { tag, message, throwable ->
                try {
                    Sentry.withScope { scope ->
                        scope.setTag("component", tag.take(64))
                        scope.setExtra("beboss_diagnostic", BeBossLogger.scrub(message).take(1_000))
                        if (throwable != null) {
                            // Preserve the original stack without attaching the original
                            // potentially sensitive message/cause chain to production telemetry.
                            val sanitized = RuntimeException(
                                BeBossLogger.scrub(throwable.message ?: message).take(1_000)
                            )
                            sanitized.stackTrace = throwable.stackTrace
                            Sentry.captureException(sanitized)
                        } else {
                            Sentry.captureMessage(
                                BeBossLogger.scrub(message).take(1_000),
                                SentryLevel.ERROR
                            )
                        }
                    }
                } catch (_: Throwable) {
                    // Diagnostics must never crash the POS or interrupt a business operation.
                }
            }
            BeBossLogger.i("CrashReporting", "Sentry Android SDK initialized.")
        } catch (e: Exception) {
            BeBossLogger.w("CrashReporting", "Sentry initialization failed; local logging remains active.", e)
        }
    }
}
