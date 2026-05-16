package com.iftin.delivery.worker

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.iftin.delivery.api.DeliveryApiClient
import com.iftin.delivery.service.UssdDialerService

/**
 * WorkManager worker that ensures UssdDialerService is running and sends heartbeat.
 * Runs every 15 minutes even in Doze mode, providing reliable background operation.
 * NO LONGER triggers immediate polls to prevent concurrency issues.
 */
class UssdPollingWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        android.util.Log.d("UssdPollingWorker", "⏰ WorkManager triggered - checking service status")
        
        try {
            // 1. Ensure UssdDialerService is running
            if (!isServiceRunning()) {
                android.util.Log.d("UssdPollingWorker", "🔄 Service not running, starting...")
                startService()
            } else {
                android.util.Log.d("UssdPollingWorker", "✅ Service already running")
            }
            
            // 2. Send independent heartbeat ping (prevents false offline)
            try {
                val deviceId = android.provider.Settings.Secure.getString(
                    context.contentResolver, android.provider.Settings.Secure.ANDROID_ID
                )
                val apiClient = DeliveryApiClient()
                apiClient.devicePing(deviceId, -1, false, 0)
                android.util.Log.d("UssdPollingWorker", "💓 WorkManager heartbeat sent")
            } catch (e: Exception) {
                android.util.Log.e("UssdPollingWorker", "💓 WorkManager heartbeat failed: ${e.message}")
            }
            
            android.util.Log.d("UssdPollingWorker", "✅ WorkManager task completed successfully")
            return Result.success()
            
        } catch (e: Exception) {
            android.util.Log.e("UssdPollingWorker", "❌ WorkManager task failed: ${e.message}")
            e.printStackTrace()
            return Result.retry()
        }
    }
    
    @Suppress("DEPRECATION")
    private fun isServiceRunning(): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (service in manager.getRunningServices(Integer.MAX_VALUE)) {
            if (UssdDialerService::class.java.name == service.service.className) {
                return true
            }
        }
        return false
    }
    
    private fun startService() {
        try {
            val intent = Intent(context, UssdDialerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            android.util.Log.d("UssdPollingWorker", "✅ Service started from WorkManager")
        } catch (e: Exception) {
            android.util.Log.e("UssdPollingWorker", "❌ Failed to start service: ${e.message}")
        }
    }
}
