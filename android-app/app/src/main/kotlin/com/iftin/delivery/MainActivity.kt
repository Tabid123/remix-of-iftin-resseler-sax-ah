package com.iftin.delivery

import android.Manifest
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.core.view.WindowCompat
import com.google.accompanist.systemuicontroller.rememberSystemUiController
import androidx.compose.runtime.SideEffect
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.iftin.delivery.api.DeliveryApiClient
import com.iftin.delivery.auth.TenantSession
import com.iftin.delivery.data.DeliveryDatabase
import com.iftin.delivery.service.UssdDialerService
import com.iftin.delivery.ui.theme.IftinDeliveryTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : ComponentActivity() {
    private val PERMISSION_REQUEST_CODE = 100
    private lateinit var database: DeliveryDatabase
    private val apiClient = DeliveryApiClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Require tenant login before showing the dashboard
        if (!TenantSession.isLoggedIn(this)) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        database = DeliveryDatabase.getInstance(this)
        
        // Enable edge-to-edge display
        WindowCompat.setDecorFitsSystemWindows(window, false)
        
        // Show version toast on startup
        Toast.makeText(
            this,
            "Iftin Resellers v5.6 ⚡",
            Toast.LENGTH_LONG
        ).show()
        
        // Request permissions
        requestPermissions()
        
        // Register device
        registerDevice()
        
        // Always ensure service is running when MainActivity opens
        startDeliveryService()
        
        // CRITICAL: Force battery optimization exemption check
        ensureBatteryOptimizationExempted()
        
        setContent {
            IftinDeliveryTheme {
                // Control system bars with edge-to-edge
                val systemUiController = rememberSystemUiController()
                
                SideEffect {
                    systemUiController.setNavigationBarColor(
                        color = Color(0xFF0099FF),
                        darkIcons = false
                    )
                    systemUiController.setStatusBarColor(
                        color = Color(0xFF0099FF),
                        darkIcons = false
                    )
                }
                
                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .navigationBarsPadding(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen(
                        onRequestBatteryOptimization = { requestBatteryOptimization() },
                        onOpenAccessibilitySettings = { openAccessibilitySettings() },
                        checkServiceRunning = { isServiceRunning() },
                        onEnableOverlay = { openOverlayPermissionSettings() },
                        onLogout = { performLogout() }
                    )
                }
            }
        }
    }

    private fun requestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_PHONE_NUMBERS,
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE,
            Manifest.permission.WAKE_LOCK,
            Manifest.permission.FOREGROUND_SERVICE,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS  // OTP SMS sending permission
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val permissionsToRequest = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                PERMISSION_REQUEST_CODE
            )
        }
    }

    private fun requestBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                intent.data = Uri.parse("package:$packageName")
                startActivity(intent)
            }
        }
    }
    
    /**
     * CRITICAL: Force battery optimization exemption on startup.
     * Without this, WorkManager and foreground service will be killed in Doze mode.
     */
    private fun ensureBatteryOptimizationExempted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                // Show critical dialog explaining importance
                AlertDialog.Builder(this)
                    .setTitle("⚠️ Muhiim - Important!")
                    .setMessage(
                        "Si service-ka uu u shaqeeyo 24/7 marka phone-ka lock yahay, " +
                        "WAXAAD QABATAA inaad ka saarto battery optimization.\n\n" +
                        "For 24/7 reliable operation when phone is locked, " +
                        "you MUST disable battery optimization."
                    )
                    .setPositiveButton("OK - Ka Saar") { _, _ ->
                        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                        intent.data = Uri.parse("package:$packageName")
                        startActivity(intent)
                    }
                    .setCancelable(false)
                    .show()
            }
        }
    }
    
    private fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        startActivity(intent)
    }

    private fun openOverlayPermissionSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
                startActivity(intent)
            } else {
                Toast.makeText(this, "✅ PIN Debug Overlay already enabled", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun startDeliveryService() {
        val intent = Intent(this, UssdDialerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun stopDeliveryService() {
        val intent = Intent(this, UssdDialerService::class.java)
        stopService(intent)
    }

    private fun performLogout() {
        stopDeliveryService()
        TenantSession.logout(this)
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
    
    /**
     * Check if UssdDialerService is actually running using ActivityManager
     */
    @Suppress("DEPRECATION")
    private fun isServiceRunning(): Boolean {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (service in manager.getRunningServices(Integer.MAX_VALUE)) {
            if (UssdDialerService::class.java.name == service.service.className) {
                return true
            }
        }
        return false
    }

    private fun registerDevice() {
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
        
        // Get SIM card numbers
        val sim1Number = getSimNumber(0)
        val sim2Number = getSimNumber(1)
        
        kotlinx.coroutines.GlobalScope.launch {
            try {
                apiClient.registerDevice(deviceId, deviceName, sim1Number, sim2Number)
                println("✅ Device registered successfully")
                // Keep the device bound to the signed-in company (tenant)
                val link = TenantSession.linkDevice(this@MainActivity)
                println(if (link.ok) "✅ Device linked to tenant: ${link.tenantName}" else "⚠️ Tenant link failed: ${link.error}")
            } catch (e: Exception) {
                println("❌ Device registration failed: ${e.message}")
            }
        }
    }

    private fun getSimNumber(slotIndex: Int): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
                val subscriptionInfoList = subscriptionManager.activeSubscriptionInfoList
                
                if (subscriptionInfoList != null && subscriptionInfoList.size > slotIndex) {
                    return subscriptionInfoList[slotIndex].number
                }
            } catch (e: SecurityException) {
                println("⚠️ Permission denied for reading SIM info")
            }
        }
        return null
    }
}

@Composable
fun MainScreen(
    onRequestBatteryOptimization: () -> Unit,
    onOpenAccessibilitySettings: () -> Unit,
    checkServiceRunning: () -> Boolean,
    onEnableOverlay: () -> Unit = {},
    onLogout: () -> Unit = {}
) {
    var isServiceRunning by remember { mutableStateOf(true) } // Assume running initially
    var totalDeliveries by remember { mutableStateOf(0) }
    var successfulDeliveries by remember { mutableStateOf(0) }
    var failedDeliveries by remember { mutableStateOf(0) }
    var pendingDeliveries by remember { mutableStateOf(0) }

    var pinDebugSnapshot by remember { mutableStateOf("") }
    var pinDebugTime by remember { mutableStateOf(0L) }

    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val db = remember(context) { com.iftin.delivery.data.DeliveryDatabase.getInstance(context) }
    var tenantName by remember { mutableStateOf(TenantSession.tenantName(context).orEmpty()) }

    LaunchedEffect(Unit) {
        while (true) {
            tenantName = TenantSession.tenantName(context).orEmpty()
            delay(3000)
        }
    }

    // Continuously check actual service state
    LaunchedEffect(Unit) {
        while (true) {
            // Check actual service state
            isServiceRunning = checkServiceRunning()
            
            // Read counters from SharedPreferences (updated by service)
            val prefs = context.getSharedPreferences("iftin_delivery", Context.MODE_PRIVATE)
            totalDeliveries = prefs.getInt("total_deliveries", 0)
            successfulDeliveries = prefs.getInt("successful_deliveries", 0)
            failedDeliveries = prefs.getInt("failed_deliveries", 0)

            // Pending = tasks currently processing in local queue
            try {
                pendingDeliveries = db.deliveryTaskDao().getProcessingCount()
            } catch (e: Exception) {
                pendingDeliveries = 0
            }

            // Read last PIN debug snapshot from accessibility service prefs
            try {
                val pinPrefs = context.getSharedPreferences("iftin_ussd_prefs", Context.MODE_PRIVATE)
                pinDebugSnapshot = pinPrefs.getString("last_pin_debug_snapshot", "") ?: ""
                pinDebugTime = pinPrefs.getLong("last_pin_debug_time", 0L)
            } catch (_: Exception) {}

            delay(2000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF5F5F5))
    ) {
        // Header
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color(0xFF0099FF),
            shadowElevation = 4.dp
        ) {
            Column(
                modifier = Modifier
                    .statusBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 16.dp)
            ) {
                Text(
                    text = "IFTIN RESELLERS",
                    color = Color.White,
                    fontSize = 20.sp,
                    lineHeight = 26.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = tenantName.ifBlank { "Ma jiro shirkad" },
                    color = Color.White.copy(alpha = 0.92f),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .background(
                                if (isServiceRunning) Color(0xFF00FF00) else Color.Red,
                                CircleShape
                            )
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isServiceRunning) "ALWAYS ON ♾️" else "RESTARTING...",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        // Scrollable content
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
        ) {
            // Stats Cards
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StatCard(
                        title = "Total",
                        value = totalDeliveries.toString(),
                        color = Color(0xFF0099FF),
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        title = "Success",
                        value = successfulDeliveries.toString(),
                        color = Color(0xFF00C853),
                        modifier = Modifier.weight(1f)
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StatCard(
                        title = "Failed",
                        value = failedDeliveries.toString(),
                        color = Color(0xFFFF3D00),
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        title = "Pending",
                        value = pendingDeliveries.toString(),
                        color = Color(0xFFFFA726),
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // Status Card (instead of control buttons)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (isServiceRunning) Color(0xFFE8F5E9) else Color(0xFFFFF3E0)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (isServiceRunning) "✅" else "🔄",
                        fontSize = 24.sp
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = if (isServiceRunning) "Service Running" else "Service Restarting",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isServiceRunning) Color(0xFF2E7D32) else Color(0xFFE65100)
                        )
                        Text(
                            text = "Service runs automatically 24/7",
                            fontSize = 12.sp,
                            color = Color.Gray
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Setup Buttons
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                OutlinedButton(
                    onClick = onRequestBatteryOptimization,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = "DISABLE BATTERY OPTIMIZATION",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
                
                Spacer(modifier = Modifier.height(12.dp))

                OutlinedButton(
                    onClick = onOpenAccessibilitySettings,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = Color(0xFFFFF3E0)
                    )
                ) {
                    Text(
                        text = "ENABLE USSD ACCESSIBILITY SERVICE",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFFFF6F00)
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedButton(
                    onClick = onEnableOverlay,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = Color(0xFFFFF8E1)
                    )
                ) {
                    Text(
                        text = "🧪 ENABLE PIN DEBUG OVERLAY",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFFE65100)
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Instructions
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = "📱 Setup Instructions",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0099FF)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    InstructionItem("1. Insert Hormuud SIM in Slot 1")
                    InstructionItem("2. Insert Somnet SIM in Slot 2")
                    InstructionItem("3. Enable USSD Accessibility Service")
                    InstructionItem("4. Disable battery optimization")
                    InstructionItem("5. Keep phone charging 24/7")
                    InstructionItem("6. Service runs automatically ♾️")
                }
            }

            // PIN Debug snapshot card — surfaces last Accessibility PIN-write attempt
            // so the user can diagnose "Invalid PIN format" without adb logcat.
            if (pinDebugSnapshot.isNotBlank()) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF8E1))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "🧪 Last PIN Attempt",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFE65100)
                        )
                        if (pinDebugTime > 0L) {
                            val ago = ((System.currentTimeMillis() - pinDebugTime) / 1000L).coerceAtLeast(0)
                            Text(
                                text = "${ago}s ago",
                                fontSize = 12.sp,
                                color = Color.Gray
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = pinDebugSnapshot,
                            fontSize = 12.sp,
                            color = Color.DarkGray
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }

        // Bottom Logout Bar (always visible)
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding(),
            color = Color.White,
            shadowElevation = 8.dp
        ) {
            Button(
                onClick = onLogout,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .height(56.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD32F2F))
            ) {
                Text(
                    text = "LOGOUT / KA BAX",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
fun StatCard(
    title: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = title,
                fontSize = 14.sp,
                color = Color.Gray
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = value,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = color
            )
        }
    }
}

@Composable
fun InstructionItem(text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    ) {
        Text(
            text = text,
            fontSize = 14.sp,
            color = Color.DarkGray
        )
    }
}
