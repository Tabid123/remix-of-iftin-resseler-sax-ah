package com.iftin.delivery

import android.app.Application
import android.content.Intent
import android.os.Build
import androidx.work.*
import com.iftin.delivery.service.UssdDialerService
import com.iftin.delivery.worker.ServiceWatchdogWorker
import com.iftin.delivery.worker.UssdPollingWorker
import java.util.concurrent.TimeUnit

class IftinDeliveryApp : Application() {
    
    companion object {
        private const val POLLING_WORK_NAME = "ussd_polling_work"
        private const val WATCHDOG_WORK_NAME = "service_watchdog_work"
    }
    
    override fun onCreate() {
        super.onCreate()
        
        // Start USSD service automatically when app starts
        // This ensures the service is always running
        // SMS inbox polling now runs INSIDE UssdDialerService (24/7)
        val serviceIntent = Intent(this, UssdDialerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
        
        android.util.Log.d("IftinApp", "✅ App started - UssdDialerService launched (with SMS inbox polling)")
        
        // Schedule reliable WorkManager tasks for 24/7 operation
        scheduleReliablePolling()
        
        android.util.Log.d("IftinApp", "✅ All workers scheduled")
    }
    
    /**
     * Schedule WorkManager tasks for reliable background operation.
     * WorkManager survives Doze mode, app kills, and device reboots.
     */
    private fun scheduleReliablePolling() {
        val workManager = WorkManager.getInstance(this)
        
        // 1. Schedule UssdPollingWorker - runs every 15 minutes
        // Requires network connection to poll for orders
        val pollingConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        
        val pollingRequest = PeriodicWorkRequestBuilder<UssdPollingWorker>(
            15, TimeUnit.MINUTES  // Minimum interval for PeriodicWork
        )
            .setConstraints(pollingConstraints)
            .setInitialDelay(1, TimeUnit.MINUTES) // Start after 1 minute
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1, TimeUnit.MINUTES
            )
            .build()
        
        workManager.enqueueUniquePeriodicWork(
            POLLING_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP, // Keep existing if already scheduled
            pollingRequest
        )
        
        android.util.Log.d("IftinApp", "📅 UssdPollingWorker scheduled (every 15 min)")
        
        // 2. Schedule ServiceWatchdogWorker - runs every 15 minutes
        // No network constraint - just checks if service is alive
        val watchdogRequest = PeriodicWorkRequestBuilder<ServiceWatchdogWorker>(
            15, TimeUnit.MINUTES
        )
            .setInitialDelay(2, TimeUnit.MINUTES) // Start after 2 minutes (offset from polling)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1, TimeUnit.MINUTES
            )
            .build()
        
        workManager.enqueueUniquePeriodicWork(
            WATCHDOG_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            watchdogRequest
        )
        
        android.util.Log.d("IftinApp", "🐕 ServiceWatchdogWorker scheduled (every 15 min)")
    }
}
