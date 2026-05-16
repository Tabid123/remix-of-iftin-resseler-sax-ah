package com.iftin.delivery.receiver

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.iftin.delivery.api.DeliveryApiClient
import kotlinx.coroutines.*

/**
 * HeartbeatAlarmReceiver — Sends a ping to the server every 5 minutes using exact alarms.
 * This works EVEN in Doze mode, ensuring the device never appears "Offline" when screen is locked.
 * 
 * AlarmManager.setExactAndAllowWhileIdle() is the ONLY reliable way to execute
 * network tasks during Android Doze mode.
 */
class HeartbeatAlarmReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "HeartbeatAlarm"
        const val ACTION_HEARTBEAT = "com.iftin.delivery.HEARTBEAT_PING"
        private const val HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000L // 5 minutes
        
        /**
         * Schedule the first heartbeat alarm. Call from UssdDialerService.onCreate()
         */
        fun scheduleHeartbeat(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, HeartbeatAlarmReceiver::class.java).apply {
                action = ACTION_HEARTBEAT
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            
            val triggerAt = System.currentTimeMillis() + HEARTBEAT_INTERVAL_MS
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAt,
                    pendingIntent
                )
            } else {
                alarmManager.setExact(
                    AlarmManager.RTC_WAKEUP,
                    triggerAt,
                    pendingIntent
                )
            }
            
            android.util.Log.d(TAG, "⏰ Heartbeat alarm scheduled in ${HEARTBEAT_INTERVAL_MS / 1000}s")
        }
        
        /**
         * Cancel heartbeat alarms
         */
        fun cancelHeartbeat(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, HeartbeatAlarmReceiver::class.java).apply {
                action = ACTION_HEARTBEAT
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(pendingIntent)
        }
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_HEARTBEAT) return
        
        android.util.Log.d(TAG, "💓 Heartbeat alarm fired — sending ping")
        
        // Acquire a temporary wake lock for the network call
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "IftinDelivery::HeartbeatWakeLock"
        )
        wakeLock.acquire(30_000L) // 30 second max
        
        // Send ping in background coroutine
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val deviceId = Settings.Secure.getString(
                    context.contentResolver, Settings.Secure.ANDROID_ID
                )
                val apiClient = DeliveryApiClient()
                
                // Use devicePing which updates last_ping_at
                val battery = getBatteryLevel(context)
                val charging = isCharging(context)
                apiClient.devicePing(deviceId, battery, charging, 0)
                
                android.util.Log.d(TAG, "✅ Heartbeat ping sent successfully")
            } catch (e: Exception) {
                android.util.Log.e(TAG, "❌ Heartbeat ping failed: ${e.message}")
            } finally {
                // Re-schedule next heartbeat
                scheduleHeartbeat(context)
                
                // Release wake lock
                if (wakeLock.isHeld) wakeLock.release()
                pendingResult.finish()
            }
        }
    }
    
    private fun getBatteryLevel(context: Context): Int {
        return try {
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
            batteryManager.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) { -1 }
    }
    
    private fun isCharging(context: Context): Boolean {
        return try {
            val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
            batteryManager.isCharging
        } catch (e: Exception) { false }
    }
}
