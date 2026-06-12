package com.iftin.delivery.service

import android.Manifest
import android.app.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.provider.Telephony
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.iftin.delivery.receiver.HeartbeatAlarmReceiver
import com.iftin.delivery.MainActivity
import com.iftin.delivery.R
import com.iftin.delivery.api.DeliveryApiClient
import com.iftin.delivery.api.DeliveryApiClient.DeviceSimConfig
import com.iftin.delivery.api.UssdFlowsClient
import com.iftin.delivery.data.DeliveryDatabase
import com.iftin.delivery.data.DeliveryTask
import kotlinx.coroutines.*
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.*
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

class UssdDialerService : Service() {
    companion object {
        private const val MAX_RETRIES = 3
        private const val CHANNEL_ID = "iftin_delivery_service"
        private const val NOTIFICATION_ID = 1001
        private const val SMS_PREFS_NAME = "sms_inbox_prefs"
        private const val PROCESSED_SMS_IDS_KEY = "processed_sms_ids"
        private const val SMS_POLL_INTERVAL_MS = 5000L // 5 seconds — fast payment detection
        private const val SMS_LOOKBACK_MS = 60000L // 1 minute only
        private const val DAYTIME_POLL_INTERVAL_MS = 12000L  // 05:01-23:59
        private const val NIGHT_POLL_INTERVAL_MS = 20000L   // 00:00-05:00
        private const val BUSY_POLL_INTERVAL_MS = 3000L     // when orders found
        private const val JITTER_MAX_MS = 2000L             // 1-2s random jitter
        private const val API_URL = "https://zshzcuomdegeijqznvvu.supabase.co/functions/v1/process-payment-receipt"
        private const val ORDER_COOLDOWN_MS = 8000L         // 8s cooldown between orders
        // HEARTBEAT_INTERVAL_MS removed — /pending poll already updates last_ping_at
    }
    
    // Use shared OkHttpClient with connection pooling from DeliveryApiClient
    private val httpClient = DeliveryApiClient.sharedClient
    
    private var serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private lateinit var wakeLock: PowerManager.WakeLock
    private lateinit var wifiLock: WifiManager.WifiLock
    private var lastWakeLockRenewal = 0L
    private lateinit var apiClient: DeliveryApiClient
    private lateinit var database: DeliveryDatabase
    private var isRunning = false
    
    // Device SIM configuration from server (dynamic per-device routing)
    @Volatile
    private var deviceSimConfig: DeviceSimConfig? = null
    
    // ===== SINGLE-FLIGHT ORDER PROCESSING GUARDS =====
    @Volatile
    private var isProcessingOrder = false
    @Volatile
    private var activeQueueId: String? = null
    @Volatile
    private var lastOrderCompletedAt = 0L
    private val recentlyProcessedIds = mutableSetOf<String>()
    
    
    // Smart SMS polling — track SMS count to skip when no new SMS
    @Volatile
    private var lastKnownSmsCount = -1
    
    // USSD completion detection
    @Volatile
    private var ussdClickReceived = false
    @Volatile
    private var ussdClickCount = 0
    
    private val ussdClickReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == UssdAccessibilityService.ACTION_USSD_CLICK_COMPLETE) {
                ussdClickReceived = true
                ussdClickCount = intent.getIntExtra("click_count", 1)
                android.util.Log.d("UssdDialer", "📢 Received USSD_CLICK_COMPLETE broadcast (click #$ussdClickCount)")
            }
        }
    }
    
    private val deviceId by lazy {
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
    }

    override fun onCreate() {
        super.onCreate()
        
        // Ensure fresh coroutine scope if previously cancelled
        if (!serviceScope.isActive) {
            serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
        }
        
        // Acquire wake lock with 24-hour timeout to keep CPU running when screen is off
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "IftinDelivery::UssdDialerLock"
        )
        wakeLock.acquire(24 * 60 * 60 * 1000L)  // 24 hours
        lastWakeLockRenewal = System.currentTimeMillis()
        
        // Acquire WiFi lock to keep WiFi radio active when screen is off
        // This prevents Samsung/Xiaomi aggressive WiFi sleep during screen lock
        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "IftinDelivery::WifiLock")
        wifiLock.acquire()
        android.util.Log.d("UssdDialer", "📶 WiFi lock acquired — WiFi stays active during screen off")
        
        // Schedule exact alarm heartbeat (Doze mode bypass) — pings every 5 min
        HeartbeatAlarmReceiver.scheduleHeartbeat(this)
        android.util.Log.d("UssdDialer", "⏰ Heartbeat alarm scheduled for Doze bypass")
        
        apiClient = DeliveryApiClient()
        database = DeliveryDatabase.getInstance(this)
        
        // Register broadcast receiver for USSD click completion
        registerUssdClickReceiver()
        
        // Create notification channel
        createNotificationChannel()
        
        // Auto-register device on service start
        registerDevice()
        
        // Fetch device SIM configuration from server
        fetchDeviceSimConfig()
        
        // Start foreground service
        startForeground(NOTIFICATION_ID, createNotification("Initializing...", 0, 0))
    }
    
    /**
     * Substitutes placeholders in a per-provider USSD short-code template.
     * Supported placeholders: {amount}, {receiver}, {pin}.
     * Amount is formatted using USSD-safe asterisk decimal separator (e.g. 11*60).
     */
    private fun buildSingleStepUssd(
        template: String,
        amount: Double?,
        receiver: String,
        pin: String
    ): String {
        val amountStr = amount?.let {
            val s = String.format("%.2f", it)
            // 11.60 -> 11*60   (USSD asterisk decimal). Drop *00 cents.
            if (s.endsWith(".00")) s.removeSuffix(".00") else s.replace('.', '*')
        } ?: ""
        // Strip leading + and any non-digit prefixes from receiver for USSD compatibility
        val receiverDigits = receiver.filter { it.isDigit() }.let {
            // normalize 252xxxxxxxxx → 9 digits
            if (it.startsWith("252") && it.length > 9) it.substring(3) else it
        }.takeLast(9)
        var out = template
            .replace("{amount}", amountStr, ignoreCase = true)
            .replace("{cost_price}", amountStr, ignoreCase = true)
            .replace("{topup_amount}", amountStr, ignoreCase = true)
            .replace("{receiver}", receiverDigits, ignoreCase = true)
            .replace("{phone}", receiverDigits, ignoreCase = true)
            .replace("{receiver_phone}", receiverDigits, ignoreCase = true)
            .replace("{number}", receiverDigits, ignoreCase = true)
            .replace("{pin}", pin, ignoreCase = true)
            .replace("{sim_password}", pin, ignoreCase = true)
        // Collapse stray asterisks and clean trailing
        out = out.replace(Regex("\\*+"), "*").replace("*#", "#")
        return out
    }

    private fun normalizePin(pin: String?): String {
        return (pin ?: "")
            .trim()
            .filter { it.isDigit() }
            .take(4)
    }

    private fun registerUssdClickReceiver() {
        try {
            val filter = IntentFilter(UssdAccessibilityService.ACTION_USSD_CLICK_COMPLETE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(ussdClickReceiver, filter, RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(ussdClickReceiver, filter)
            }
            android.util.Log.d("UssdDialer", "✅ Registered USSD click receiver")
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Failed to register USSD click receiver: ${e.message}")
        }
    }
    
    private fun registerDevice() {
        serviceScope.launch {
            try {
                val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
                val sim1Number = getSimNumber(0)
                val sim2Number = getSimNumber(1)
                
                android.util.Log.d("UssdDialer", "🔄 Auto-registering device: $deviceId")
                android.util.Log.d("UssdDialer", "📱 Device: $deviceName")
                android.util.Log.d("UssdDialer", "📞 SIM1: $sim1Number, SIM2: $sim2Number")
                
                val success = apiClient.registerDevice(deviceId, deviceName, sim1Number, sim2Number)
                
                if (success) {
                    android.util.Log.d("UssdDialer", "✅ Device auto-registered successfully")
                } else {
                    android.util.Log.e("UssdDialer", "❌ Device registration failed")
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Device registration error: ${e.message}")
                e.printStackTrace()
            }
        }
    }
    
    /**
     * Fetch device SIM configuration from server for dynamic SIM slot routing
     * This allows admin to configure which provider uses which SIM slot per device
     */
    private fun fetchDeviceSimConfig() {
        serviceScope.launch {
            try {
                android.util.Log.d("UssdDialer", "🔄 Fetching SIM config for device: $deviceId")
                
                val config = apiClient.getDeviceSimConfig(deviceId)
                
                if (config != null) {
                    deviceSimConfig = config
                    android.util.Log.d("UssdDialer", "✅ SIM config loaded: SIM1=${config.sim1Provider}, SIM2=${config.sim2Provider}")
                } else {
                    android.util.Log.w("UssdDialer", "⚠️ No SIM config returned from server, using fallback defaults")
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Failed to fetch SIM config: ${e.message}")
                e.printStackTrace()
            }
        }
    }
    
    private fun getSimNumber(slotIndex: Int): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
                    return null
                }
                
                val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
                val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList
                
                if (subscriptionInfoList != null && subscriptionInfoList.size > slotIndex) {
                    return subscriptionInfoList[slotIndex].number
                }
            } catch (e: SecurityException) {
                android.util.Log.w("UssdDialer", "⚠️ Permission denied for reading SIM info")
            }
        }
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!isRunning) {
            isRunning = true
            startPolling()
        } else if (intent?.getBooleanExtra("TRIGGER_IMMEDIATE_POLL", false) == true) {
            // Force immediate poll even if already running (triggered by SMS payment)
            // BUT respect the single-flight guard
            if (!isProcessingOrder) {
                serviceScope.launch {
                    pollPendingOrders()
                }
            } else {
                android.util.Log.d("UssdDialer", "⏳ TRIGGER_IMMEDIATE_POLL ignored: order already processing (queueId=$activeQueueId)")
            }
        }
        return START_STICKY
    }

    /**
     * Get base polling interval based on time of day
     * Daytime (05:01-23:59): 12s, Nighttime (00:00-05:00): 20s
     */
    private fun getBaseInterval(): Long {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return if (hour in 0..4) NIGHT_POLL_INTERVAL_MS else DAYTIME_POLL_INTERVAL_MS
    }

    /**
     * Add random jitter (0-2s) to prevent multiple devices hitting DB simultaneously
     */
    private fun addJitter(interval: Long): Long {
        return interval + (Random().nextDouble() * JITTER_MAX_MS).toLong()
    }

    private fun startPolling() {
        // Main order polling loop with dynamic interval + jitter
        serviceScope.launch {
            while (isRunning) {
                try {
                    // Sync any pending offline updates first
                    syncOfflineQueue()
                    
                    // Wake lock renewal — every 12 hours, release and re-acquire
                    if (System.currentTimeMillis() - lastWakeLockRenewal > 12 * 60 * 60 * 1000L) {
                        android.util.Log.d("UssdDialer", "🔄 Renewing wake lock (12h cycle)")
                        if (::wakeLock.isInitialized && wakeLock.isHeld) wakeLock.release()
                        wakeLock.acquire(24 * 60 * 60 * 1000L)
                        lastWakeLockRenewal = System.currentTimeMillis()
                    }
                    
                    // Poll for pending orders - battery info included in URL (replaces separate /ping)
                    val battery = getBatteryLevel()
                    val charging = isCharging()
                    val foundOrders = pollPendingOrders(battery, charging)
                    
                    // Dynamic polling: 3s busy, daytime 12s, nighttime 20s + jitter
                    val baseInterval = if (foundOrders) BUSY_POLL_INTERVAL_MS else getBaseInterval()
                    delay(addJitter(baseInterval))
                } catch (e: Exception) {
                    e.printStackTrace()
                    delay(addJitter(getBaseInterval()))
                }
            }
        }
        
        // HEARTBEAT LOOP REMOVED — /pending poll already updates last_ping_at on every call
        // This saves one network call every 45s = ~1920 calls/day eliminated
        
        // SMS INBOX POLLING - runs every 15 seconds, 24/7 (was 5s)
        // This catches ALL SMS including duplicates that BroadcastReceiver misses
        serviceScope.launch {
            android.util.Log.d("UssdDialer", "📨 Starting SMS inbox polling (every ${SMS_POLL_INTERVAL_MS/1000}s)")
            while (isRunning) {
                try {
                    pollSmsInbox()
                } catch (e: Exception) {
                    android.util.Log.e("UssdDialer", "❌ SMS poll error: ${e.message}")
                }
                delay(SMS_POLL_INTERVAL_MS)
            }
        }
        
        // BULK SMS - Supabase Realtime WebSocket + fallback polling
        // Listens for INSERT events on bulk_sms_queue in real-time
        serviceScope.launch {
            android.util.Log.d("UssdDialer", "📤 Starting Bulk SMS Realtime listener (WebSocket)")
            startBulkSmsRealtimeListener()
        }

        // DELIVERY QUEUE - Supabase Realtime WebSocket (instant order pickup)
        // Listens for INSERT events on delivery_queue → triggers pollPendingOrders() immediately.
        // This eliminates the 12-20s polling delay before a new order is picked up.
        serviceScope.launch {
            android.util.Log.d("UssdDialer", "🚚 Starting Delivery Queue Realtime listener (WebSocket)")
            startDeliveryQueueRealtimeListener()
        }
        
        // BULK SMS FALLBACK POLL - every 30s, in case Realtime WebSocket fails silently
        serviceScope.launch {
            android.util.Log.d("UssdDialer", "📤 Starting Bulk SMS fallback poll (every 30s)")
            delay(10000L) // Initial delay to let Realtime connect first
            while (isRunning) {
                try {
                    processPendingBulkSms()
                } catch (e: Exception) {
                    android.util.Log.e("UssdDialer", "❌ Bulk SMS fallback poll error: ${e.message}")
                }
                delay(30000L)
            }
        }
    }
    
    // ==================== BULK SMS via SUPABASE REALTIME ====================
    
    private var bulkSmsWebSocket: okhttp3.WebSocket? = null
    private val realtimeClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS) // Keep alive indefinitely
        .pingInterval(30, TimeUnit.SECONDS)     // Keep connection alive
        .build()
    
    /**
     * Connect to Supabase Realtime WebSocket and listen for bulk_sms_queue INSERTs.
     * Automatically reconnects on disconnect with exponential backoff.
     */
    private suspend fun startBulkSmsRealtimeListener() {
        var retryDelay = 3000L
        
        while (isRunning) {
            try {
                android.util.Log.d("UssdDialer", "🔌 Connecting to Supabase Realtime for Bulk SMS...")
                
                // First, process any already-pending items (catch up)
                processPendingBulkSms()
                
                val wsUrl = "wss://zshzcuomdegeijqznvvu.supabase.co/realtime/v1/websocket?apikey=${apiClient.getAnonKey()}&vsn=1.0.0"
                val request = Request.Builder().url(wsUrl).build()
                
                val connected = CompletableDeferred<Boolean>()
                
                bulkSmsWebSocket = realtimeClient.newWebSocket(request, object : okhttp3.WebSocketListener() {
                    
                    override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                        android.util.Log.d("UssdDialer", "✅ Realtime WebSocket connected")
                        retryDelay = 3000L // Reset backoff
                        
                        // Send heartbeat join
                        val joinPhoenix = JSONObject().apply {
                            put("topic", "phoenix")
                            put("event", "phx_join")
                            put("payload", JSONObject())
                            put("ref", "1")
                        }
                        webSocket.send(joinPhoenix.toString())
                        
                        // Subscribe to bulk_sms_queue inserts for this device
                        val subscribePayload = JSONObject().apply {
                            put("topic", "realtime:public:bulk_sms_queue")
                            put("event", "phx_join")
                            put("payload", JSONObject().apply {
                                put("config", JSONObject().apply {
                                    put("broadcast", JSONObject().put("self", false))
                                    put("presence", JSONObject().put("key", ""))
                                    put("postgres_changes", org.json.JSONArray().apply {
                                        put(JSONObject().apply {
                                            put("event", "INSERT")
                                            put("schema", "public")
                                            put("table", "bulk_sms_queue")
                                            put("filter", "device_id=eq.$deviceId")
                                        })
                                    })
                                })
                            })
                            put("ref", "2")
                        }
                        webSocket.send(subscribePayload.toString())
                        connected.complete(true)
                    }
                    
                    override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                        try {
                            val msg = JSONObject(text)
                            val event = msg.optString("event", "")
                            
                            // Phoenix heartbeat - respond to keep alive
                            if (event == "phx_reply" || event == "phx_close") return
                            
                            if (msg.optString("topic", "").startsWith("realtime:") && event == "postgres_changes") {
                                val payload = msg.optJSONObject("payload")
                                val data = payload?.optJSONObject("data")
                                val record = data?.optJSONObject("record")
                                
                                if (record != null && record.optString("device_id") == deviceId && record.optString("status") == "pending") {
                                    android.util.Log.d("UssdDialer", "📨 Realtime: New bulk SMS task received!")
                                    // Process all pending items (batch)
                                    serviceScope.launch {
                                        processPendingBulkSms()
                                    }
                                }
                            }
                            
                            // Handle heartbeat
                            if (event == "heartbeat" || msg.optString("topic") == "phoenix") {
                                val heartbeat = JSONObject().apply {
                                    put("topic", "phoenix")
                                    put("event", "heartbeat")
                                    put("payload", JSONObject())
                                    put("ref", System.currentTimeMillis().toString())
                                }
                                webSocket.send(heartbeat.toString())
                            }
                        } catch (e: Exception) {
                            android.util.Log.e("UssdDialer", "❌ Realtime message parse error: ${e.message}")
                        }
                    }
                    
                    override fun onFailure(webSocket: okhttp3.WebSocket, t: Throwable, response: okhttp3.Response?) {
                        android.util.Log.e("UssdDialer", "❌ Realtime WebSocket failed: ${t.message}")
                        connected.complete(false)
                    }
                    
                    override fun onClosed(webSocket: okhttp3.WebSocket, code: Int, reason: String) {
                        android.util.Log.w("UssdDialer", "🔌 Realtime WebSocket closed: $reason")
                        connected.complete(false)
                    }
                })
                
                // Wait for connection result
                val success = connected.await()
                if (success) {
                    // Send periodic heartbeats + fallback poll to keep connection alive
                    var heartbeatCount = 0
                    while (isRunning && bulkSmsWebSocket != null) {
                        delay(15000L) // 15s interval
                        heartbeatCount++
                        try {
                            val heartbeat = JSONObject().apply {
                                put("topic", "phoenix")
                                put("event", "heartbeat")
                                put("payload", JSONObject())
                                put("ref", System.currentTimeMillis().toString())
                            }
                            bulkSmsWebSocket?.send(heartbeat.toString()) ?: break
                            
                            // Fallback poll every ~45s (every 3rd heartbeat) in case Realtime missed events
                            if (heartbeatCount % 3 == 0) {
                                android.util.Log.d("UssdDialer", "🔄 Bulk SMS fallback poll")
                                processPendingBulkSms()
                            }
                        } catch (e: Exception) {
                            android.util.Log.e("UssdDialer", "❌ Heartbeat send failed: ${e.message}")
                            break
                        }
                    }
                }
                
                // Connection lost, cleanup
                bulkSmsWebSocket?.close(1000, "Reconnecting")
                bulkSmsWebSocket = null
                
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Realtime listener error: ${e.message}")
            }
            
            // Exponential backoff reconnect (max 60s)
            if (isRunning) {
                android.util.Log.d("UssdDialer", "🔄 Reconnecting Realtime in ${retryDelay / 1000}s...")
                delay(retryDelay)
                retryDelay = (retryDelay * 2).coerceAtMost(60000L)
            }
        }
    }
    
    @Volatile
    private var isBulkSmsProcessing = false

    /**
     * Process ALL pending bulk SMS items for this device in batches.
     * Loops until no more pending items remain (batch-by-batch).
     * Mutex prevents Realtime + fallback poll from running concurrently.
     * Maintains 2s delay between sends to avoid carrier throttling.
     */
    private suspend fun processPendingBulkSms() {
        if (isBulkSmsProcessing) {
            android.util.Log.d("UssdDialer", "⏳ Bulk SMS already processing, skipping")
            return
        }
        isBulkSmsProcessing = true
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
                isBulkSmsProcessing = false
                return
            }
            
            // Loop batch-by-batch until queue is empty
            while (true) {
                val tasks = apiClient.getPendingBulkSms(deviceId)
                if (tasks.isEmpty()) {
                    android.util.Log.d("UssdDialer", "✅ Bulk SMS queue empty, done")
                    break
                }
                
                android.util.Log.d("UssdDialer", "📤 Processing batch of ${tasks.size} pending bulk SMS")
            
            for (task in tasks) {
                try {
                    val message = apiClient.getBulkSmsCampaignMessage(task.campaignId)
                    if (message == null) {
                        apiClient.updateBulkSmsStatus(task.id, task.campaignId, "failed", "Campaign message not found")
                        continue
                    }
                    
                    val formattedPhone = task.phoneNumber
                        .replace("+252", "0")
                        .replace("+", "")
                        .let { if (!it.startsWith("0") && it.length == 9) "0$it" else it }
                    
                    val simSlotIndex = (task.simSlot ?: 1) - 1
                    val subscriptionId = getSubscriptionIdForSlot(simSlotIndex)
                    
                    val smsManager: SmsManager = if (subscriptionId > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            getSystemService(SmsManager::class.java).createForSubscriptionId(subscriptionId)
                        } else {
                            @Suppress("DEPRECATION")
                            SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
                        }
                    } else {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            getSystemService(SmsManager::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            SmsManager.getDefault()
                        }
                    }
                    
                    val parts = smsManager.divideMessage(message)
                    if (parts.size > 1) {
                        smsManager.sendMultipartTextMessage(formattedPhone, null, parts, null, null)
                    } else {
                        smsManager.sendTextMessage(formattedPhone, null, message, null, null)
                    }
                    
                    android.util.Log.d("UssdDialer", "✅ Bulk SMS sent to $formattedPhone from SIM${simSlotIndex + 1}")
                    apiClient.updateBulkSmsStatus(task.id, task.campaignId, "sent", null)
                    
                    // 2s delay between sends to avoid carrier throttling
                    delay(2000L)
                    
                } catch (e: Exception) {
                    android.util.Log.e("UssdDialer", "❌ Bulk SMS send error: ${e.message}")
                    apiClient.updateBulkSmsStatus(task.id, task.campaignId, "failed", e.message)
                }
            }
            } // end while batch loop
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Bulk SMS process error: ${e.message}")
        } finally {
            isBulkSmsProcessing = false
        }
    }
    
    // ==================== OTP SMS SENDING ====================
    
    /**
     * Poll for pending OTP tasks and send SMS directly from device
     */
    private suspend fun pollAndSendOtpSms() {
        try {
            // Check SEND_SMS permission
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
                android.util.Log.w("UssdDialer", "📱 No SEND_SMS permission for OTP sending")
                return
            }
            
            // Fetch pending OTP tasks from server
            val tasks = apiClient.getPendingOtpTasks(deviceId)
            
            if (tasks.isEmpty()) {
                return // No pending OTP tasks
            }
            
            android.util.Log.d("UssdDialer", "📱 Found ${tasks.size} pending OTP tasks")
            
            for (task in tasks) {
                try {
                    // Pass provider to sendOtpSms for SIM slot selection
                    val success = sendOtpSms(task.phoneNumber, task.otpCode, task.provider)
                    
                    if (success) {
                        android.util.Log.d("UssdDialer", "✅ OTP SMS sent to ${task.phoneNumber} via ${task.provider}")
                        apiClient.updateOtpStatus(task.id, "sent", null)
                    } else {
                        android.util.Log.e("UssdDialer", "❌ Failed to send OTP to ${task.phoneNumber}")
                        apiClient.updateOtpStatus(task.id, "failed", "SMS send failed")
                    }
                    
                    // Small delay between multiple SMS sends
                    delay(1000)
                } catch (e: Exception) {
                    android.util.Log.e("UssdDialer", "❌ OTP send error: ${e.message}")
                    apiClient.updateOtpStatus(task.id, "failed", e.message)
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ OTP poll error: ${e.message}")
        }
    }
    
    /**
     * Get subscription ID for a specific SIM slot
     * @param slotIndex 0 for SIM1, 1 for SIM2
     * @return subscriptionId or -1 if not found
     */
    private fun getSubscriptionIdForSlot(slotIndex: Int): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) 
                    != PackageManager.PERMISSION_GRANTED) {
                    android.util.Log.w("UssdDialer", "📱 No READ_PHONE_STATE permission for SIM selection")
                    return -1
                }
                
                val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) 
                    as SubscriptionManager
                val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList
                
                if (subscriptionInfoList != null && subscriptionInfoList.size > slotIndex) {
                    val subId = subscriptionInfoList[slotIndex].subscriptionId
                    android.util.Log.d("UssdDialer", "📱 SIM slot $slotIndex → subscriptionId: $subId")
                    return subId
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Error getting subscription ID: ${e.message}")
            }
        }
        return -1
    }

    /**
     * Get SIM slot for provider based on device config
     * DYNAMIC: Uses database config fetched from server
     * Fallback: M31-style defaults (Hormuud=SIM1, others=SIM2)
     * @param provider Provider name (hormuud, somnet, somtel, amtel)
     * @return 0 for SIM1, 1 for SIM2
     */
    private fun getSimSlotForProvider(provider: String): Int {
        val config = deviceSimConfig
        val providerLower = provider.lowercase()
        
        // Dynamic config from database (preferred) - per-device routing
        if (config != null) {
            // Check if provider matches SIM1
            if (config.sim1Provider?.lowercase() == providerLower) {
                android.util.Log.d("UssdDialer", "📱 $provider → SIM1 (from database config)")
                return 0
            }
            // Check if provider matches SIM2
            if (config.sim2Provider?.lowercase() == providerLower) {
                android.util.Log.d("UssdDialer", "📱 $provider → SIM2 (from database config)")
                return 1
            }
            android.util.Log.w("UssdDialer", "⚠️ Provider '$provider' not in config (SIM1=${config.sim1Provider}, SIM2=${config.sim2Provider}), using fallback")
        } else {
            android.util.Log.w("UssdDialer", "⚠️ No SIM config loaded for device, using hardcoded fallback")
        }
        
        // Fallback to M31-style defaults (maintains backward compatibility)
        return when (providerLower) {
            "hormuud" -> 0   // SIM1 - default primary
            else -> 1        // SIM2 - default secondary
        }
    }

    /**
     * Send OTP verification SMS using SmsManager with SIM slot selection
     * @param phoneNumber Full phone number with country code (+252XXXXXXXXX)
     * @param otpCode The 6-digit OTP code
     * @param provider Provider name for SIM routing (hormuud, somnet, etc.)
     * @return true if SMS was sent successfully
     */
    private fun sendOtpSms(phoneNumber: String, otpCode: String, provider: String): Boolean {
        return try {
            // Format phone number: remove +252 prefix, add 0
            val formattedPhone = phoneNumber
                .replace("+252", "0")
                .replace("+", "")
                .let { if (!it.startsWith("0") && it.length == 9) "0$it" else it }
            
            // Build SMS message in Somali
            val message = "Iftin Internet: Code-kaagu waa $otpCode. Wuxuu dhacayaa 5 daqiiqo kadib."
            
            // Determine which SIM slot to use based on provider
            val simSlot = getSimSlotForProvider(provider)
            val subscriptionId = getSubscriptionIdForSlot(simSlot)
            
            android.util.Log.d("UssdDialer", "📱 Sending OTP SMS to: $formattedPhone")
            android.util.Log.d("UssdDialer", "📱 Provider: $provider → SIM${simSlot + 1} (subscriptionId: $subscriptionId)")
            
            val smsManager: SmsManager = if (subscriptionId > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                // ✅ Use specific SIM based on provider
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    getSystemService(SmsManager::class.java).createForSubscriptionId(subscriptionId)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
                }
            } else {
                // Fallback to default SIM if subscription ID not found
                android.util.Log.w("UssdDialer", "⚠️ Falling back to default SIM (subscriptionId not found)")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    getSystemService(SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }
            }
            
            smsManager.sendTextMessage(
                formattedPhone,  // Destination phone number
                null,            // Service center address (null = default)
                message,         // SMS message
                null,            // Sent intent
                null             // Delivery intent
            )
            
            android.util.Log.d("UssdDialer", "✅ OTP SMS dispatched from SIM${simSlot + 1} to $formattedPhone")
            true
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ SMS send error: ${e.message}")
            e.printStackTrace()
            false
        }
    }
    
    // ==================== SMS INBOX POLLING ====================
    
    /**
     * Read SMS inbox directly using Content Provider.
     * Each SMS has a unique _id, so we track by _id to catch ALL messages
     * including duplicates with identical body content.
     */
    private fun pollSmsInbox() {
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
                android.util.Log.w("UssdDialer", "📨 No READ_SMS permission")
                return
            }
            
            // SMART SMS POLLING: Check SMS count first — skip full inbox read if no new SMS
            val cutoffTime = System.currentTimeMillis() - SMS_LOOKBACK_MS
            val countCursor = contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf("count(*) AS count"),
                "${Telephony.Sms.DATE} > ?",
                arrayOf(cutoffTime.toString()),
                null
            )
            val currentCount = countCursor?.use {
                if (it.moveToFirst()) it.getInt(0) else 0
            } ?: 0
            
            if (currentCount == lastKnownSmsCount) {
                // No new SMS — skip full inbox read (saves CPU + battery)
                return
            }
            lastKnownSmsCount = currentCount
            
            val cursor: Cursor? = contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf(
                    Telephony.Sms._ID,
                    Telephony.Sms.ADDRESS,
                    Telephony.Sms.BODY,
                    Telephony.Sms.DATE,
                    Telephony.Sms.SUBSCRIPTION_ID
                ),
                "${Telephony.Sms.DATE} > ?",
                arrayOf(cutoffTime.toString()),
                "${Telephony.Sms.DATE} DESC"
            )
            
            cursor?.use {
                var newCount = 0
                while (it.moveToNext()) {
                    val smsId = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms._ID))
                    val address = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)) ?: ""
                    val body = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.BODY)) ?: ""
                    val date = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms.DATE))
                    val subscriptionId = it.getInt(it.getColumnIndexOrThrow(Telephony.Sms.SUBSCRIPTION_ID))
                    
                    // Create TRIPLE unique key: _id + timestamp + bodyHash
                    val uniqueKey = "${smsId}_${date}_${body.hashCode()}"
                    
                    // Check if we already processed this SMS by unique key
                    if (!isSmsPreviouslyProcessed(uniqueKey)) {
                        // Mark as processed FIRST to prevent duplicates
                        markSmsAsProcessed(uniqueKey)
                        
                        // Parse and process
                        val receiverSim = getSimNameBySubscriptionId(subscriptionId)
                        val paymentInfo = parsePaymentSms(body, address, receiverSim)
                        
                        if (paymentInfo != null) {
                            // Generate unique tx_id for server-side dedup
                            val txId = "${System.nanoTime()}_${smsId}_${body.hashCode()}"
                            android.util.Log.d("UssdDialer", "📨 NEW PAYMENT SMS (ID: $smsId, tx: $txId): sender=${paymentInfo.senderPhone}, amount=${paymentInfo.amount}")
                            sendPaymentToApi(paymentInfo, txId, date)
                            newCount++
                        }
                    }
                }
                
                if (newCount > 0) {
                    android.util.Log.d("UssdDialer", "📨 Processed $newCount new payment SMS from inbox")
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ SMS inbox read error: ${e.message}")
            e.printStackTrace()
        }
    }
    
    private fun isSmsPreviouslyProcessed(uniqueKey: String): Boolean {
        val prefs = getSharedPreferences(SMS_PREFS_NAME, Context.MODE_PRIVATE)
        val processedIds = prefs.getStringSet(PROCESSED_SMS_IDS_KEY, emptySet()) ?: emptySet()
        return processedIds.contains(uniqueKey)
    }
    
    private fun markSmsAsProcessed(uniqueKey: String) {
        val prefs = getSharedPreferences(SMS_PREFS_NAME, Context.MODE_PRIVATE)
        val processedIds = prefs.getStringSet(PROCESSED_SMS_IDS_KEY, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
        processedIds.add(uniqueKey)
        
        // Keep only last 1000 IDs to avoid memory issues
        val trimmedIds = if (processedIds.size > 1000) {
            processedIds.toList().takeLast(1000).toMutableSet()
        } else {
            processedIds
        }
        
        prefs.edit().putStringSet(PROCESSED_SMS_IDS_KEY, trimmedIds).apply()
    }
    
    private fun getSimNameBySubscriptionId(subscriptionId: Int): String {
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
                val info = subscriptionManager.getActiveSubscriptionInfo(subscriptionId)
                val slotIndex = info?.simSlotIndex ?: 0
                return if (slotIndex == 0) "hormuud" else "somnet"
            }
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "Error getting SIM name: ${e.message}")
        }
        return "hormuud" // Default to slot 0
    }
    
    private fun parsePaymentSms(body: String, sender: String, receiverSim: String): PaymentInfo? {
        val bodyLower = body.lowercase()
        
        // Ignore SEND confirmations
        if (bodyLower.contains("uwareejisay") || 
            bodyLower.contains("you have sent") || 
            bodyLower.contains("sent to")) {
            return null
        }
        
        // Ignore SubAccount/internal transfers
        if (bodyLower.contains("subaccount") || 
            bodyLower.contains("sub account") ||
            bodyLower.contains("ku shubashada")) {
            return null
        }
        
        // CRITICAL: Only process SMS with "ka heshay" or "received from" patterns
        val hasKaHeshay = bodyLower.contains("ka heshay")
        val hasReceivedFrom = bodyLower.contains("received from")
        val hasLacagKaHeshay = bodyLower.contains("lacag ayaad ka heshay")
        
        if (!hasKaHeshay && !hasReceivedFrom && !hasLacagKaHeshay) {
            return null
        }
        
        val amount = extractAmount(body) ?: return null
        val actualSender = extractSenderPhone(body) ?: return null
        
        return PaymentInfo(
            senderPhone = actualSender,
            receiverSim = receiverSim,
            amount = amount,
            smsBody = body
        )
    }
    
    private fun extractAmount(body: String): Double? {
        val patterns = listOf(
            """\$(\d+\.?\d*)""".toRegex(),
            """(\d+\.?\d*)\s*USD""".toRegex(RegexOption.IGNORE_CASE),
            """(\d+\.?\d*)\s*DOLLAR""".toRegex(RegexOption.IGNORE_CASE),
            """lacag.*?(\d+\.?\d*)""".toRegex(RegexOption.IGNORE_CASE)
        )
        
        for (pattern in patterns) {
            val match = pattern.find(body)
            if (match != null) {
                return match.groupValues[1].toDoubleOrNull()
            }
        }
        return null
    }
    
    /**
     * Normalize Somali phone to canonical 9-digit local format
     * 252685837139 -> 685837139, 0685837139 -> 685837139, 685837139 -> 685837139
     */
    private fun normalizeSomaliPhone(phone: String): String {
        var digits = phone.replace(Regex("\\D"), "")
        if (digits.startsWith("252") && digits.length >= 12) {
            digits = digits.substring(3)
        }
        if (digits.startsWith("0") && digits.length == 10) {
            digits = digits.substring(1)
        }
        return if (digits.length >= 9) digits.takeLast(9) else digits
    }

    private fun extractSenderPhone(body: String): String? {
        // Captures 9, 10, or 12 digit Somali phone numbers
        val phoneCapture = """(\+?252\d{9}|0\d{9}|\d{9})"""
        
        // Pattern 1: "ka heshay 252685837139"
        val kaHeshayPattern = """ka\s+heshay\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        kaHeshayPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Pattern 2: "waxaad...ka heshay"
        val waxaadKaPattern = """waxaad.*?ka\s+heshay\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        waxaadKaPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Pattern 3: "received from"
        val receivedFromPattern = """received\s+from\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        receivedFromPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Pattern 4: "lacag ayaad ka heshay"
        val lacagPattern = """lacag\s+ayaad\s+ka\s+heshay\s*[:\s]*$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        lacagPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Fallback
        val fallbackPattern = """ka.*?heshay.*?$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        fallbackPattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        // Amtel: "received Airtime from 252710000040"
        val receivedAirtimePattern = """received\s+airtime\s+from\s+$phoneCapture""".toRegex(RegexOption.IGNORE_CASE)
        receivedAirtimePattern.find(body)?.let { return normalizeSomaliPhone(it.groupValues[1]) }
        
        return null
    }
    
    private fun sendPaymentToApi(paymentInfo: PaymentInfo, txId: String, smsTimestamp: Long) {
        serviceScope.launch(Dispatchers.IO) {
            try {
                val json = JSONObject().apply {
                    put("sender_phone", paymentInfo.senderPhone)
                    put("receiver_sim", paymentInfo.receiverSim)
                    put("amount", paymentInfo.amount)
                    put("sms_body", paymentInfo.smsBody)
                    put("tx_id", txId)  // Unique transaction ID
                    put("sms_timestamp", smsTimestamp)  // Exact SMS timestamp
                }
                
                android.util.Log.d("UssdDialer", "⚡ Sending to API with tx_id: $txId")
                
                val requestBody = json.toString().toRequestBody("application/json".toMediaType())
                
                val request = Request.Builder()
                    .url(API_URL)
                    .post(requestBody)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaHpjdW9tZGVnZWlqcXpudnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTY2MDEsImV4cCI6MjA5Mzk3MjYwMX0.82Bdtu_h-6qdM2my0OT7mxhbi2wFYHBcKJ654oizo3o")
                    .build()
                
                val response = httpClient.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""
                
                if (response.isSuccessful) {
                    android.util.Log.d("UssdDialer", "📨 Payment sent to API: $responseBody")
                    
                    // Set flag for AccessibilityService
                    setExpectingUssdDialogs()
                    
                    // Trigger immediate order poll (respecting single-flight guard)
                    if (!isProcessingOrder) {
                        pollPendingOrders()
                    } else {
                        android.util.Log.d("UssdDialer", "⏳ SMS trigger: poll skipped, order already processing")
                    }
                } else {
                    android.util.Log.e("UssdDialer", "📨 API error: ${response.code} - $responseBody")
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "📨 Error sending to API: ${e.message}")
            }
        }
    }
    
    private fun setExpectingUssdDialogs() {
        try {
            val prefs = getSharedPreferences("iftin_ussd_prefs", Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean("expecting_ussd_dialogs", true)
                .putLong("last_ussd_time", System.currentTimeMillis())
                .apply()
            android.util.Log.d("UssdDialer", "🚩 Set expecting_ussd_dialogs = true")
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "Failed to set USSD flag: ${e.message}")
        }
    }
    
    data class PaymentInfo(
        val senderPhone: String,
        val receiverSim: String,
        val amount: Double,
        val smsBody: String
    )
    
    // ==================== END SMS INBOX POLLING ====================

    private suspend fun pollPendingOrders(batteryLevel: Int = -1, charging: Boolean = false): Boolean {
        // ===== SINGLE-FLIGHT GUARD: Skip if already processing an order =====
        if (isProcessingOrder) {
            android.util.Log.d("UssdDialer", "⏳ pollPendingOrders SKIPPED: order already processing (queueId=$activeQueueId)")
            return false
        }
        
        // ===== COOLDOWN GUARD: Wait between orders =====
        val timeSinceLastOrder = System.currentTimeMillis() - lastOrderCompletedAt
        if (lastOrderCompletedAt > 0 && timeSinceLastOrder < ORDER_COOLDOWN_MS) {
            android.util.Log.d("UssdDialer", "⏳ pollPendingOrders SKIPPED: cooldown (${timeSinceLastOrder}ms / ${ORDER_COOLDOWN_MS}ms)")
            return false
        }
        
        try {
            val orders = apiClient.getPendingOrders(deviceId, batteryLevel, charging)
            if (orders.orders.isNotEmpty()) {
                // Process ONLY the first order (strict sequential processing)
                val order = orders.orders.first()
                
                // Duplicate protection: skip if recently processed
                if (recentlyProcessedIds.contains(order.id)) {
                    android.util.Log.w("UssdDialer", "⚠️ Skipping duplicate order: ${order.id}")
                    return false
                }
                
                processOrder(order, order.provider)
                return true
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return false
    }

    private suspend fun processOrder(order: DeliveryApiClient.DeliveryOrder, provider: String) {
        // ===== ACQUIRE SINGLE-FLIGHT LOCK =====
        if (isProcessingOrder) {
            android.util.Log.w("UssdDialer", "⚠️ processOrder REJECTED: already processing ${activeQueueId}")
            return
        }
        isProcessingOrder = true
        activeQueueId = order.id
        android.util.Log.d("UssdDialer", "🔒 Order lock ACQUIRED: ${order.id}")
        
        try {
            // Track this order ID to prevent re-processing
            recentlyProcessedIds.add(order.id)
            // Keep set bounded
            if (recentlyProcessedIds.size > 50) {
                val oldest = recentlyProcessedIds.first()
                recentlyProcessedIds.remove(oldest)
            }
            
            // Save to local database
            val task = DeliveryTask(
                id = order.id,
                orderId = order.orderId,
                providerName = provider,
                ussdCode = order.ussdCode,
                receiverPhone = order.receiverPhone,
                packageCode = order.packageCode,
                status = "processing",
                attempts = order.attempts,
                createdAt = System.currentTimeMillis()
            )
            database.deliveryTaskDao().insert(task)
            
            // Update notification
            updateNotification("Processing order...", 1, 0)
            
            // Save PIN to SharedPreferences for AccessibilityService to use
            // Strip any non-numeric characters from the raw PIN before use
            val rawPin = order.pinCode.trim()
            val cleanPin = normalizePin(rawPin)
            if (rawPin.isNotBlank() && cleanPin.isEmpty()) {
                android.util.Log.e("UssdDialer", "❌ Invalid PIN format for order ${order.orderId}: raw='${rawPin.take(2)}***' cleaned='${cleanPin.take(2)}***'")
                val statusUpdated = updateDeliveryStatusWithRetry(
                    queueId = order.id,
                    status = "failed",
                    errorMessage = "Invalid PIN: non-numeric characters found",
                    providerResponse = null
                )
                database.deliveryTaskDao().updateStatus(order.id, "failed")
                if (statusUpdated) {
                    updateStats(success = false)
                } else {
                    saveToOfflineQueue(order.id, "failed", "Invalid PIN: non-numeric characters found", null)
                }
                return
            }
            val pinToUse = cleanPin.take(4)
            // Compute trigger code from USSD (e.g. *725*..#  ->  *725#) for flow lookup
            val triggerCode = run {
                val u = order.ussdCode
                val firstStar = u.indexOf('*')
                val secondStar = if (firstStar >= 0) u.indexOf('*', firstStar + 1) else -1
                if (firstStar >= 0 && secondStar > firstStar) "${u.substring(firstStar, secondStar)}#" else u
            }
            getSharedPreferences("iftin_ussd_prefs", Context.MODE_PRIVATE)
                .edit()
                .putString("current_pin_code", pinToUse)
                .putString("current_receiver", order.receiverPhone)
                .putString("current_topup_amount", order.topupAmount?.let { String.format("%.2f", it) } ?: "")
                .putString("current_trigger_code", triggerCode)
                .putString("current_provider", order.provider)
                .putString("current_ussd_method", order.ussdMethod ?: "")
                .putString("current_ussd_single_template", order.ussdSingleTemplate ?: "")
                .putString("current_ussd_flow_id", order.ussdFlowId?.takeIf { it.isNotBlank() })
                .putString("current_delivery_id", order.id)
                .apply()
            android.util.Log.d("UssdDialer", "🔐 Flow context saved: pin=${pinToUse.take(2)}***, receiver=${order.receiverPhone}, topup=${order.topupAmount}, trigger=$triggerCode, method=${order.ussdMethod}, flowId=${order.ussdFlowId}")
            withContext(Dispatchers.IO) {
                UssdFlowsClient.loadFlows(force = true)
            }
            
            // Clear any stale USSD response before dialing
            getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE)
                .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME)
                .apply()
            
            // 500ms settle time before USSD
            android.util.Log.d("UssdDialer", "⚡ Quick 0.5s settle time before USSD...")
            delay(500)
            
            // ===== Build the actual USSD code to dial =====
            // For single_step providers with a custom template, substitute placeholders
            // and use the template instead of the legacy server-built ussdCode.
            val ussdToDial = if (
                (order.ussdMethod ?: "") == "single_step" &&
                !order.ussdSingleTemplate.isNullOrBlank()
            ) {
                buildSingleStepUssd(order.ussdSingleTemplate, order.topupAmount, order.receiverPhone, pinToUse).also {
                    android.util.Log.d("UssdDialer", "📞 Using per-provider single-step template -> $it")
                }
            } else {
                order.ussdCode
            }

            // Dial USSD code
            val orderProvider = order.provider.ifEmpty { provider }
            val dialSuccess = dialUssdCode(ussdToDial, order.receiverPhone, order.packageCode, orderProvider, order.simSlot)
            
            if (dialSuccess) {
                // Get the captured USSD response from AccessibilityService
                val ussdResponse = getLastUssdResponse()
                
                // ===== DETERMINE STATUS BASED ON REAL RESPONSE =====
                val finalStatus: String
                val finalResponse: String
                
                if (ussdResponse != null && ussdResponse.isNotBlank()) {
                    val responseText = ussdResponse.lowercase()
                    
                    // Check for provider SUCCESS keywords first
                    val providerSuccess = listOf(
                        "ugu shubtay", "u shubtay", "ku guulaysatay", "u wareejiso",
                        "u dirto", "haraagaagu waa", "transcation id", "transaction id",
                        "jeeb", "dhammays", "abaal", "e-voucher"
                    ).any { responseText.contains(it) }
                    
                    // Check for provider FAILURE keywords
                    val providerFailed = listOf(
                        "error", "failed", "khalad", "service error", "try again",
                        "insufficient", "invalid", "unavailable", "not available",
                        "waxba kama dhicin", "temporarily", "internal", "denied",
                        "declined", "rejected", "time out", "network error"
                    ).any { responseText.contains(it) }
                    
                    if (providerSuccess) {
                        finalStatus = "completed"
                        finalResponse = ussdResponse
                        android.util.Log.d("UssdDialer", "✅ Provider SUCCESS detected: ${ussdResponse.take(100)}")
                    } else if (providerFailed) {
                        finalStatus = "failed"
                        finalResponse = ussdResponse
                        android.util.Log.w("UssdDialer", "❌ Provider FAILURE detected: ${ussdResponse.take(100)} - server will auto-retry")
                    } else {
                        // Unknown response text - assume OK
                        finalStatus = "completed"
                        finalResponse = ussdResponse
                        android.util.Log.d("UssdDialer", "📝 Unknown USSD response, assuming OK: ${ussdResponse.take(100)}")
                    }
                } else {
                    // No response captured - report as timeout, NOT success
                    finalStatus = "timeout"
                    finalResponse = "USSD dialed but no provider response captured. Needs manual verification."
                    android.util.Log.w("UssdDialer", "⚠️ No USSD response captured - reporting as TIMEOUT (not success)")
                }
                
                val statusUpdated = updateDeliveryStatusWithRetry(
                    queueId = order.id,
                    status = finalStatus,
                    errorMessage = if (finalStatus == "timeout") "No provider response captured" else null,
                    providerResponse = finalResponse
                )
                database.deliveryTaskDao().updateStatus(order.id, finalStatus)
                if (statusUpdated) {
                    updateStats(success = finalStatus == "completed")
                } else {
                    saveToOfflineQueue(order.id, finalStatus, null, finalResponse)
                }
                android.util.Log.d("UssdDialer", "✅ Order ${order.orderId} finished with status: $finalStatus")
            } else {
                // Dial failed (permission issue or no SIM) - mark as failed
                val statusUpdated = updateDeliveryStatusWithRetry(
                    queueId = order.id,
                    status = "failed",
                    errorMessage = "USSD dial failed - check permissions and SIM",
                    providerResponse = null
                )
                database.deliveryTaskDao().updateStatus(order.id, "failed")
                if (statusUpdated) {
                    updateStats(success = false)
                } else {
                    saveToOfflineQueue(order.id, "failed", "USSD dial failed", null)
                }
                android.util.Log.e("UssdDialer", "❌ Order ${order.orderId} failed - could not dial USSD")
            }
            
        } catch (e: Exception) {
            e.printStackTrace()
            updateDeliveryStatusWithRetry(
                queueId = order.id,
                status = "failed",
                errorMessage = e.message ?: "Unknown error",
                providerResponse = null
            )
        } finally {
            // ===== RELEASE SINGLE-FLIGHT LOCK + START COOLDOWN =====
            recentlyProcessedIds.remove(order.id) // allow scheduled retries for the same queue row
            android.util.Log.d("UssdDialer", "🔓 Order lock RELEASED: ${order.id} (cooldown ${ORDER_COOLDOWN_MS}ms)")
            lastOrderCompletedAt = System.currentTimeMillis()
            activeQueueId = null
            isProcessingOrder = false
        }
    }

    /**
     * Update delivery status with exponential backoff retry (3 attempts)
     * Returns true if update succeeded, false if all retries failed
     */
    private suspend fun updateDeliveryStatusWithRetry(
        queueId: String,
        status: String,
        errorMessage: String?,
        providerResponse: String?
    ): Boolean {
        val delays = listOf(2000L, 4000L, 8000L, 16000L, 32000L) // Exponential backoff: 2s, 4s, 8s, 16s, 32s (62s total)
        
        for ((attempt, delayMs) in delays.withIndex()) {
            try {
                android.util.Log.d("UssdDialer", "📡 Updating status (attempt ${attempt + 1}/5): $queueId -> $status")
                
                val success = apiClient.updateDeliveryStatus(queueId, status, errorMessage, providerResponse)
                
                if (success) {
                    android.util.Log.d("UssdDialer", "✅ Status update succeeded on attempt ${attempt + 1}")
                    return true
                } else {
                    android.util.Log.w("UssdDialer", "⚠️ Status update returned false, retrying...")
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Status update error (attempt ${attempt + 1}): ${e.message}")
            }
            
            if (attempt < delays.size - 1) {
                android.util.Log.d("UssdDialer", "⏳ Waiting ${delayMs}ms before retry...")
                delay(delayMs)
            }
        }
        
        android.util.Log.e("UssdDialer", "❌ All 3 status update attempts failed for $queueId")
        return false
    }

    /**
     * Save failed API updates to offline queue for later sync
     */
    private fun saveToOfflineQueue(
        queueId: String,
        status: String,
        errorMessage: String?,
        providerResponse: String?
    ) {
        try {
            val prefs = getSharedPreferences("iftin_offline_queue", Context.MODE_PRIVATE)
            val existingQueue = prefs.getString("pending_updates", "") ?: ""
            
            // Format: queueId|status|errorMessage|providerResponse;
            val newEntry = "$queueId|$status|${errorMessage ?: ""}|${providerResponse ?: ""};"
            val updatedQueue = existingQueue + newEntry
            
            prefs.edit().putString("pending_updates", updatedQueue).apply()
            
            android.util.Log.d("UssdDialer", "💾 Saved to offline queue: $queueId -> $status")
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Failed to save to offline queue: ${e.message}")
        }
    }

    /**
     * Sync offline queue to server (called when network is available)
     */
    private suspend fun syncOfflineQueue() {
        try {
            val prefs = getSharedPreferences("iftin_offline_queue", Context.MODE_PRIVATE)
            val queue = prefs.getString("pending_updates", "") ?: ""
            
            if (queue.isEmpty()) return
            
            android.util.Log.d("UssdDialer", "🔄 Syncing offline queue...")
            
            val entries = queue.split(";").filter { it.isNotBlank() }
            val failedEntries = mutableListOf<String>()
            
            for (entry in entries) {
                val parts = entry.split("|")
                if (parts.size >= 2) {
                    val queueId = parts[0]
                    val status = parts[1]
                    val errorMessage = parts.getOrNull(2)?.takeIf { it.isNotBlank() }
                    val providerResponse = parts.getOrNull(3)?.takeIf { it.isNotBlank() }
                    
                    val success = apiClient.updateDeliveryStatus(queueId, status, errorMessage, providerResponse)
                    
                    if (!success) {
                        failedEntries.add(entry)
                    } else {
                        android.util.Log.d("UssdDialer", "✅ Synced offline update: $queueId -> $status")
                    }
                }
            }
            
            // Save failed entries back to queue
            prefs.edit().putString("pending_updates", failedEntries.joinToString(";")).apply()
            
            android.util.Log.d("UssdDialer", "🔄 Offline sync complete. ${entries.size - failedEntries.size} synced, ${failedEntries.size} remaining")
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Offline sync error: ${e.message}")
        }
    }
    
    /**
     * Get the last USSD response captured by AccessibilityService
     * Waits up to 2 seconds with retries for response to be captured
     * Only returns response if captured within last 30 seconds
     */
    private suspend fun getLastUssdResponse(): String? {
        try {
            val prefs = getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
            
            // Wait 1 second for AccessibilityService to capture response
            android.util.Log.d("UssdDialer", "⏳ Waiting 1s for USSD response capture...")
            delay(1000)
            
            // Retry up to 3 times with 500ms delay
            repeat(3) { attempt ->
                val response = prefs.getString(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE, null)
                val responseTime = prefs.getLong(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME, 0)
                
                // Only use response if it was captured within the last 30 seconds
                val ageMs = System.currentTimeMillis() - responseTime
                if (ageMs < 30000 && !response.isNullOrBlank()) {
                    android.util.Log.d("UssdDialer", "📥 Retrieved USSD response (age: ${ageMs}ms, attempt: ${attempt+1})")
                    android.util.Log.d("UssdDialer", "📝 Response content: ${response.take(150)}")
                    
                    // Clear the response after reading to prevent reuse
                    prefs.edit()
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE)
                        .remove(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME)
                        .apply()

                    // Attach PIN diagnostic snapshot if carrier rejected PIN — surfaces
                    // root cause in admin delivery_notes without needing adb logcat.
                    val mentionsInvalidPin = response.contains("invalid pin", ignoreCase = true) ||
                        response.contains("pin khaldan", ignoreCase = true) ||
                        response.contains("pin format", ignoreCase = true) ||
                        response.contains("wrong pin", ignoreCase = true)
                    return if (mentionsInvalidPin) {
                        val debug = prefs.getString(UssdAccessibilityService.KEY_LAST_PIN_DEBUG, null)
                        if (!debug.isNullOrBlank()) {
                            "$response\n\n--- PIN DEBUG ---\n$debug"
                        } else response
                    } else response
                }
                
                if (attempt < 2) {
                    android.util.Log.d("UssdDialer", "⏳ No response yet, retrying in 500ms (attempt ${attempt+1}/3)")
                    delay(500)
                }
            }
            
            android.util.Log.d("UssdDialer", "⚠️ No USSD response captured after 3 attempts")
            return null
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Error reading USSD response: ${e.message}")
            return null
        }
    }

    private fun findSubscriptionIdByCarrierName(providerName: String, fallbackSlot: Int? = null): Int? {
        try {
            val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
                return null
            }
            
            val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList
            if (subscriptionInfoList.isNullOrEmpty()) {
                return null
            }
            
            val searchName = providerName.lowercase(Locale.getDefault())
            
            // Define flexible patterns for each provider
            val patterns = when (searchName) {
                "hormuud" -> listOf("hormuud", "hor", "hmd", "hormud")
                "somnet" -> listOf("somnet", "som", "somalink")
                "somtel" -> listOf("somtel", "tel")
                "amtel" -> listOf("amtel", "amt")
                else -> listOf(searchName)
            }
            
            android.util.Log.d("UssdDialer", "🔍 Searching with patterns: ${patterns.joinToString()} among ${subscriptionInfoList.size} SIMs")
            
            for (info in subscriptionInfoList) {
                val carrierName = info.carrierName?.toString()?.lowercase(Locale.getDefault()) ?: ""
                val displayName = info.displayName?.toString()?.lowercase(Locale.getDefault()) ?: ""
                
                android.util.Log.d("UssdDialer", "📱 Slot ${info.simSlotIndex}: carrier='$carrierName', display='$displayName', subId=${info.subscriptionId}")
                
                // Check if ANY pattern matches
                for (pattern in patterns) {
                    if (carrierName.contains(pattern) || displayName.contains(pattern)) {
                        android.util.Log.d("UssdDialer", "✅ MATCHED pattern '$pattern' in slot ${info.simSlotIndex}")
                        return info.subscriptionId
                    }
                }
            }
            
            // If no carrier match and we have a fallback slot from database, use it
            if (fallbackSlot != null) {
                android.util.Log.w("UssdDialer", "⚠️ No carrier match for '$providerName', using database fallback slot: $fallbackSlot")
                val fallbackInfo = subscriptionInfoList.find { it.simSlotIndex == fallbackSlot }
                if (fallbackInfo != null) {
                    android.util.Log.d("UssdDialer", "✅ Using fallback SIM slot $fallbackSlot (subId=${fallbackInfo.subscriptionId})")
                    return fallbackInfo.subscriptionId
                }
            }
            
            // If no match, log ALL available SIMs for debugging
            android.util.Log.e("UssdDialer", "❌ NO SIM MATCH for '$providerName'")
            return null
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Error finding SIM: ${e.message}")
            e.printStackTrace()
            return null
        }
    }

    /**
     * USSD dialing with Silent mode (TelephonyManager) first, Intent fallback
     * Silent mode works on Android 8.0+ and doesn't show dialer UI
     */
    private suspend fun dialUssdCode(
        ussdCode: String,
        receiverPhone: String,
        packageCode: String?,
        provider: String,
        simSlot: Int? = null
    ): Boolean {
        try {
            val finalUssd = ussdCode.trim()
            
            android.util.Log.d("UssdDialer", "========== USSD DIAL ==========")
            android.util.Log.d("UssdDialer", "Provider: $provider")
            android.util.Log.d("UssdDialer", "Final USSD: $finalUssd")
            android.util.Log.d("UssdDialer", "Database simSlot: $simSlot")

            // Check permissions
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED ||
                ActivityCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
                android.util.Log.e("UssdDialer", "❌ Missing permissions")
                return false
            }

            // Find SIM for provider with fallback to database slot
            val subscriptionId = findSubscriptionIdByCarrierName(provider, simSlot)
            if (subscriptionId == null) {
                android.util.Log.e("UssdDialer", "❌ No SIM found for: $provider (even with fallback slot $simSlot)")
                return false
            }
            
            android.util.Log.d("UssdDialer", "🎯 Using subscriptionId: $subscriptionId")
            
            // 🔇 TRY SILENT USSD FIRST (Android 8.0+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.util.Log.d("UssdDialer", "🔇 Trying SILENT USSD via TelephonyManager...")
                
                val silentSuccess = trySilentUssd(finalUssd, subscriptionId)
                if (silentSuccess) {
                    android.util.Log.d("UssdDialer", "✅ Silent USSD completed successfully!")
                    return true
                }
                
                // BACKGROUND-ONLY MODE: do NOT open the dialer if silent USSD fails.
                // The order stays in the queue and will be retried on the next claim cycle.
                // This prevents the dialer screen from ever showing on the device (even when locked).
                android.util.Log.w("UssdDialer", "⚠️ Silent USSD failed — background-only mode, NOT opening dialer. Will retry.")
                return false
            }

            // Pre-Android 8.0 devices: no silent USSD API available — last-resort dialer fallback.
            android.util.Log.w("UssdDialer", "⚠️ Android <8.0 detected, silent USSD unavailable. Falling back to dialer Intent.")
            return dialUssdViaIntent(finalUssd, subscriptionId, provider)
            
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Exception: ${e.message}")
            e.printStackTrace()
            return false
        }
    }
    
    /**
     * Silent USSD using TelephonyManager.sendUssdRequest()
     * Works on Android 8.0+ and doesn't show dialer UI
     */
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.O)
    private suspend fun trySilentUssd(ussdCode: String, subscriptionId: Int): Boolean {
        return suspendCancellableCoroutine { continuation ->
            try {
                val telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
                val managerForSim = telephonyManager.createForSubscriptionId(subscriptionId)
                
                val callback = object : android.telephony.TelephonyManager.UssdResponseCallback() {
                    override fun onReceiveUssdResponse(
                        tm: android.telephony.TelephonyManager,
                        request: String,
                        response: CharSequence
                    ) {
                        android.util.Log.d("UssdDialer", "🔇 SILENT USSD Success! Response: $response")
                        
                        // Save response for delivery notes
                        saveUssdResponse(response.toString())
                        
                        if (continuation.isActive) {
                            continuation.resume(true)
                        }
                    }
                    
                    override fun onReceiveUssdResponseFailed(
                        tm: android.telephony.TelephonyManager,
                        request: String,
                        failureCode: Int
                    ) {
                        val reason = when(failureCode) {
                            android.telephony.TelephonyManager.USSD_RETURN_FAILURE -> "USSD_RETURN_FAILURE"
                            android.telephony.TelephonyManager.USSD_ERROR_SERVICE_UNAVAIL -> "SERVICE_UNAVAILABLE"
                            else -> "UNKNOWN ($failureCode)"
                        }
                        android.util.Log.e("UssdDialer", "🔇 SILENT USSD Failed: $reason")
                        
                        if (continuation.isActive) {
                            continuation.resume(false)
                        }
                    }
                }
                
                // Keep # at end - Hormuud requires it for silent USSD!
                val cleanUssd = ussdCode
                android.util.Log.d("UssdDialer", "🔇 Sending silent USSD: $cleanUssd")
                
                managerForSim.sendUssdRequest(
                    cleanUssd,
                    callback,
                    android.os.Handler(android.os.Looper.getMainLooper())
                )
                
                // Timeout after 10 seconds
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    if (continuation.isActive) {
                        android.util.Log.w("UssdDialer", "⏱️ Silent USSD timeout (10s)")
                        continuation.resume(false)
                    }
                }, 10000)
                
            } catch (e: SecurityException) {
                android.util.Log.e("UssdDialer", "🔒 Silent USSD permission denied: ${e.message}")
                if (continuation.isActive) continuation.resume(false)
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "❌ Silent USSD exception: ${e.message}")
                if (continuation.isActive) continuation.resume(false)
            }
        }
    }
    
    private fun saveUssdResponse(response: String) {
        val prefs = getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE, response)
            .putLong(UssdAccessibilityService.KEY_LAST_USSD_RESPONSE_TIME, System.currentTimeMillis())
            .apply()
    }
    
    /**
     * Fallback USSD dialing using Intent.ACTION_CALL
     * Shows dialer UI - used when silent mode fails
     */
    private suspend fun dialUssdViaIntent(
        finalUssd: String,
        subscriptionId: Int,
        provider: String
    ): Boolean {
        try {
            android.util.Log.d("UssdDialer", "📞 Using Intent.ACTION_CALL fallback...")
            
            val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList ?: return false
            
            val simSlot = subscriptionInfoList.indexOfFirst { it.subscriptionId == subscriptionId }
            android.util.Log.d("UssdDialer", "🎯 Using SIM slot $simSlot (subscriptionId: $subscriptionId)")
            
            val encodedUssd = finalUssd.replace("#", Uri.encode("#"))
            
            // Build PhoneAccountHandle for automatic SIM selection (prevents SIM chooser dialog)
            var phoneAccountHandle: android.telecom.PhoneAccountHandle? = null
            try {
                val telecomManager = getSystemService(Context.TELECOM_SERVICE) as android.telecom.TelecomManager
                val accounts = telecomManager.callCapablePhoneAccounts
                android.util.Log.d("UssdDialer", "📱 Available phone accounts: ${accounts.size}")
                
                if (accounts.size > simSlot && simSlot >= 0) {
                    phoneAccountHandle = accounts[simSlot]
                    android.util.Log.d("UssdDialer", "✅ Auto-selecting SIM${simSlot + 1} via PhoneAccountHandle: $phoneAccountHandle")
                } else {
                    android.util.Log.w("UssdDialer", "⚠️ SIM slot $simSlot not in accounts list (size=${accounts.size})")
                }
            } catch (e: Exception) {
                android.util.Log.e("UssdDialer", "⚠️ Failed to get PhoneAccountHandle: ${e.message}")
            }
            
            val intent = Intent(Intent.ACTION_CALL).apply {
                data = Uri.parse("tel:$encodedUssd")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                putExtra("simSlot", simSlot)
                putExtra("com.android.phone.extra.slot", simSlot)
                putExtra("subscription", subscriptionId)
                // Critical: This is the standard Android extra for auto-selecting SIM
                if (phoneAccountHandle != null) {
                    putExtra("android.telecom.extra.PHONE_ACCOUNT_HANDLE", phoneAccountHandle)
                }
            }
            
            // Set expecting_ussd flag for AccessibilityService
            val ussdPrefs = getSharedPreferences(UssdAccessibilityService.PREFS_NAME, Context.MODE_PRIVATE)
            ussdPrefs.edit()
                .putBoolean(UssdAccessibilityService.KEY_EXPECTING_USSD, true)
                .putLong(UssdAccessibilityService.KEY_LAST_USSD_TIME, System.currentTimeMillis())
                .apply()
            
            startActivity(intent)
            android.util.Log.d("UssdDialer", "📞 USSD dialed via Intent.ACTION_CALL")
            
            // Show toast message on main thread while in USSD dialer
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                android.widget.Toast.makeText(
                    this@UssdDialerService,
                    "WAX HAKA BEDELIN 😊",
                    android.widget.Toast.LENGTH_LONG
                ).show()
            }
            
            // Reset click detection
            ussdClickReceived = false
            ussdClickCount = 0
            
            // Wait for completion - DO NOT assume success on timeout
            var waitedMs = 0
            val maxWaitMs = 15000
            
            while (waitedMs < maxWaitMs) {
                delay(500)
                waitedMs += 500
                
                if (ussdClickReceived) {
                    android.util.Log.d("UssdDialer", "✅ USSD completed via AccessibilityService")
                    delay(2000)
                    return true
                }
            }
            
            // IMPORTANT: Timeout does NOT mean success!
            // Return true to indicate "dial happened" but processOrder will check for real response
            android.util.Log.w("UssdDialer", "⚠️ USSD timeout (${maxWaitMs}ms) - dial sent but no click confirmation")
            return true
            
        } catch (e: Exception) {
            android.util.Log.e("UssdDialer", "❌ Intent fallback failed: ${e.message}")
            return false
        }
    }

    private fun buildFinalUssd(template: String, receiverPhone: String, packageCode: String?): String {
        val phone = sanitizePhoneNumber(receiverPhone)
        var ussd = template.trim()

        // Prepare a safe package code (digits only)
        val pkgCode = packageCode?.filter { it.isDigit() } ?: ""

        val hasPlaceholders = listOf("{phone}", "{receiver}", "{number}", "{code}", "{package}", "{pkg}", "{receiver_phone}", "{data_amount}", "{sim_password}")
            .any { ph -> ussd.contains(ph, ignoreCase = true) }

        if (hasPlaceholders) {
            if (phone.isNotBlank()) {
                ussd = ussd.replace("{phone}", phone, true)
                    .replace("{receiver}", phone, true)
                    .replace("{number}", phone, true)
                    .replace("{receiver_phone}", phone, true)
            }
            if (pkgCode.isNotBlank()) {
                ussd = ussd.replace("{code}", pkgCode, true)
                    .replace("{package}", pkgCode, true)
                    .replace("{pkg}", pkgCode, true)
                    .replace("{data_amount}", pkgCode, true)
            }
            // Remove unresolved placeholders
            ussd = ussd.replace("*{code}", "", true)
                .replace("{code}", "", true)
                .replace("*{package}", "", true)
                .replace("{package}", "", true)
                .replace("*{pkg}", "", true)
                .replace("{pkg}", "", true)
                .replace("*{data_amount}", "", true)
                .replace("{data_amount}", "", true)
                .replace("*{sim_password}", "", true)
                .replace("{sim_password}", "", true)
        } else {
            val parts = mutableListOf<String>()
            val phoneAlreadyIncluded = phone.isNotBlank() && ussd.contains(phone)
            if (phone.isNotBlank() && !phoneAlreadyIncluded) parts.add(phone)
            if (pkgCode.isNotBlank()) parts.add(pkgCode)

            if (parts.isNotEmpty()) {
                ussd = if (ussd.contains("#")) {
                    val idx = ussd.lastIndexOf('#')
                    ussd.substring(0, idx).trimEnd('*') + "*" + parts.joinToString("*") + "#"
                } else {
                    ussd.trimEnd('*') + "*" + parts.joinToString("*") + "#"
                }
            }
        }

        // Sanitize: collapse consecutive asterisks and remove stray asterisk before '#'
        ussd = ussd.replace(" ", "")
            .replace(Regex("\\*+"), "*")
            .replace("*#", "#")
        return ussd
    }

    private fun sanitizePhoneNumber(raw: String): String {
        var digits = raw.filter { it.isDigit() }
        if (digits.startsWith("252")) digits = digits.removePrefix("252")
        if (digits.startsWith("0")) digits = digits.removePrefix("0")
        if (digits.length > 9) digits = digits.takeLast(9)
        return digits
    }

    // Battery helpers - used by startPolling() to include battery in /pending URL
    private fun getBatteryLevel(): Int {
        return try {
            val bm = getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
            bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) { -1 }
    }

    private fun isCharging(): Boolean {
        return try {
            val batteryIntent = registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val status = batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1) ?: -1
            status == android.os.BatteryManager.BATTERY_STATUS_CHARGING || status == android.os.BatteryManager.BATTERY_STATUS_FULL
        } catch (e: Exception) { false }
    }

    private fun updateStats(success: Boolean) {
        val prefs = getSharedPreferences("iftin_delivery", Context.MODE_PRIVATE)
        val totalKey = "total_deliveries"
        val successKey = "successful_deliveries"
        val failedKey = "failed_deliveries"
        
        val total = prefs.getInt(totalKey, 0) + 1
        val successful = prefs.getInt(successKey, 0) + if (success) 1 else 0
        val failed = prefs.getInt(failedKey, 0) + if (!success) 1 else 0
        
        prefs.edit()
            .putInt(totalKey, total)
            .putInt(successKey, successful)
            .putInt(failedKey, failed)
            .apply()
        
        updateNotification("Active - $successful successful, $failed failed", successful, failed)
    }

    private fun updateNotification(text: String, successful: Int, failed: Int) {
        val notification = createNotification(text, successful, failed)
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun createNotification(text: String, successful: Int, failed: Int): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Iftin Delivery Active")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Delivery Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Iftin Delivery background service"
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    /**
     * Restart service immediately when app is removed from recent apps
     * This ensures the service keeps running even if user swipes away the app
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        android.util.Log.d("UssdDialer", "🔄 Task removed - restarting service immediately")
        
        // Immediate restart instead of AlarmManager (more reliable on Android 12+)
        val restartIntent = Intent(applicationContext, UssdDialerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            applicationContext.startForegroundService(restartIntent)
        } else {
            applicationContext.startService(restartIntent)
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        android.util.Log.d("UssdDialer", "🔄 Service onDestroy - will restart")
        
        // Close Realtime WebSocket
        try {
            bulkSmsWebSocket?.close(1000, "Service destroyed")
            bulkSmsWebSocket = null
        } catch (e: Exception) { }
        
        // Unregister broadcast receiver
        try {
            unregisterReceiver(ussdClickReceiver)
        } catch (e: Exception) { }
        
        // Release WiFi lock on destroy (will be re-acquired on restart)
        try {
            if (::wifiLock.isInitialized && wifiLock.isHeld) wifiLock.release()
        } catch (e: Exception) { }
        
        // DON'T release wake lock here! Keep CPU active during restart
        // DON'T cancel serviceScope or set isRunning = false!
        
        // Re-schedule heartbeat alarm (survives service restart)
        HeartbeatAlarmReceiver.scheduleHeartbeat(applicationContext)
        
        // Immediately restart service to keep it running
        val restartIntent = Intent(applicationContext, UssdDialerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            applicationContext.startForegroundService(restartIntent)
        } else {
            applicationContext.startService(restartIntent)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
