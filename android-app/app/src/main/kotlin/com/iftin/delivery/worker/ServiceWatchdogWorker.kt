package com.iftin.delivery.worker

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.iftin.delivery.service.UssdDialerService

/**
 * Watchdog worker that monitors UssdDialerService and restarts it if stopped.
 * This runs independently of the main polling worker as a safety net.
 * Runs every 15 minutes even in Doze mode.
 */
class ServiceWatchdogWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        android.util.Log.d("ServiceWatchdog", "🐕 Watchdog checking service health...")
        
        try {
            val isRunning = isServiceRunning()
            val prefs = context.getSharedPreferences("iftin_watchdog", Context.MODE_PRIVATE)
            
            // Track consecutive failures
            var consecutiveFailures = prefs.getInt("consecutive_failures", 0)
            
            if (!isRunning) {
                consecutiveFailures++
                prefs.edit().putInt("consecutive_failures", consecutiveFailures).apply()
                
                android.util.Log.w("ServiceWatchdog", "⚠️ Service NOT running! Failure #$consecutiveFailures - Restarting...")
                
                // Force restart service
                restartService()
                
                // If too many consecutive failures, log critical warning
                if (consecutiveFailures >= 3) {
                    android.util.Log.e("ServiceWatchdog", "🚨 CRITICAL: Service failed $consecutiveFailures times in a row!")
                }
            } else {
                // Reset failure counter on success
                if (consecutiveFailures > 0) {
                    android.util.Log.d("ServiceWatchdog", "✅ Service recovered after $consecutiveFailures failures")
                    prefs.edit().putInt("consecutive_failures", 0).apply()
                } else {
                    android.util.Log.d("ServiceWatchdog", "✅ Service healthy")
                }
            }
            
            // Update last check time
            prefs.edit().putLong("last_watchdog_check", System.currentTimeMillis()).apply()
            
            return Result.success()
            
        } catch (e: Exception) {
            android.util.Log.e("ServiceWatchdog", "❌ Watchdog error: ${e.message}")
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
    
    private fun restartService() {
        try {
            // Try to stop existing service first
            val stopIntent = Intent(context, UssdDialerService::class.java)
            context.stopService(stopIntent)
            
            // Small delay before restart
            Thread.sleep(500)
            
            // Start fresh
            val startIntent = Intent(context, UssdDialerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(startIntent)
            } else {
                context.startService(startIntent)
            }
            
            android.util.Log.d("ServiceWatchdog", "✅ Service restarted by watchdog")
        } catch (e: Exception) {
            android.util.Log.e("ServiceWatchdog", "❌ Failed to restart service: ${e.message}")
        }
    }
}
