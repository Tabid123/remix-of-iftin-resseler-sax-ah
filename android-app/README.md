# Iftin Internet Delivery - Android App

## 🎯 Overview

This Android app automates data package delivery by:
- Polling the Iftin API every 5 seconds for new orders
- Automatically dialing USSD codes on the correct SIM (Hormuud Slot 1, Somnet Slot 2)
- Running 24/7 as a background service
- Reporting delivery status back to the server

**Perfect for**: Samsung Galaxy M31 with dual SIM (Hormuud + Somnet)

---

## 📁 Project Structure

```
android-app/
├── app/
│   ├── src/main/
│   │   ├── kotlin/com/iftin/delivery/
│   │   │   ├── MainActivity.kt              # Main UI with dashboard
│   │   │   ├── IftinDeliveryApp.kt         # Application class
│   │   │   ├── service/
│   │   │   │   └── UssdDialerService.kt    # Background service (24/7)
│   │   │   ├── api/
│   │   │   │   └── DeliveryApiClient.kt    # API communication
│   │   │   ├── data/
│   │   │   │   └── DeliveryDatabase.kt     # Room database
│   │   │   ├── receiver/
│   │   │   │   └── BootReceiver.kt         # Auto-start on boot
│   │   │   └── ui/theme/
│   │   │       └── Theme.kt                # Material 3 theme
│   │   └── AndroidManifest.xml             # Permissions & config
│   └── build.gradle.kts                     # Dependencies
├── SETUP_GUIDE.md                           # Detailed setup instructions
└── README.md                                # This file
```

---

## 🚀 Quick Start

### Prerequisites
1. Computer with Android Studio installed
2. Samsung Galaxy M31 (or Android 6.0+ phone)
3. USB cable
4. Hormuud SIM (Slot 1) + Somnet SIM (Slot 2)

### Installation
1. Download this entire `android-app` folder
2. Open Android Studio
3. File → Open → Select `android-app` folder
4. Wait for Gradle sync to complete
5. Connect your phone via USB
6. Enable USB Debugging on phone
7. Click Run button in Android Studio
8. App installs and opens automatically

### Configuration
1. Open app and tap "DISABLE BATTERY OPTIMIZATION"
2. Insert SIMs: Hormuud in Slot 1, Somnet in Slot 2
3. Tap "START SERVICE"
4. Keep phone charging 24/7

**📖 For detailed instructions, see [SETUP_GUIDE.md](./SETUP_GUIDE.md)**

---

## 🏗️ Architecture

### Core Components

#### 1. **UssdDialerService** (Background Service)
- Runs 24/7 with wake lock
- Polls API every 5 seconds
- Processes orders one-by-one
- Auto-restarts if killed
- Sends heartbeat every 30 seconds

#### 2. **DeliveryApiClient** (API Layer)
- **GET /pending**: Fetch new orders
- **POST /status**: Report completion
- **POST /ping**: Device heartbeat
- Base URL: `https://tsjqvhddjfuecwxpcuil.supabase.co/functions/v1/activate-package`

#### 3. **DeliveryDatabase** (Room DB)
- Stores delivery tasks locally
- Tracks success/failure
- Enables retry logic
- Auto-cleanup old records

#### 4. **MainActivity** (UI)
- Dashboard with stats (Total, Success, Failed, Pending)
- Start/Stop service button
- Battery optimization settings
- Setup instructions

---

## 🔄 Data Flow

```
1. Payment Success (Website)
   ↓
2. Order Queued (Supabase)
   ↓
3. Android Polls API (/pending)
   ↓
4. Receive Order { ussdCode, receiverPhone, provider }
   ↓
5. Select SIM Slot (Hormuud=1, Somnet=2)
   ↓
6. Dial USSD Code Automatically
   ↓
7. Wait 15 seconds (USSD completion)
   ↓
8. Report Status (/status)
   ↓
9. Update Dashboard Stats
```

---

## 🔐 Permissions Required

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CALL_PHONE" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
```

---

## ⚙️ Configuration

### API Endpoint
File: `app/src/main/kotlin/com/iftin/delivery/api/DeliveryApiClient.kt`
```kotlin
private val baseUrl = "https://tsjqvhddjfuecwxpcuil.supabase.co/functions/v1/activate-package"
```

### Provider → SIM Slot Mapping
File: `app/src/main/kotlin/com/iftin/delivery/service/UssdDialerService.kt`
```kotlin
val simSlot = when (provider.lowercase()) {
    "hormuud" -> 0  // SIM Slot 1
    "somnet" -> 1   // SIM Slot 2
    else -> 0
}
```

### Polling Interval
File: `app/src/main/kotlin/com/iftin/delivery/service/UssdDialerService.kt`
```kotlin
delay(5000) // Poll every 5 seconds
```

---

## 📊 Features

### Implemented ✅
- [x] Background service with wake lock
- [x] Dual SIM support (auto-select based on provider)
- [x] USSD dialing automation
- [x] API polling (5-second intervals)
- [x] Delivery status reporting
- [x] Device heartbeat/ping
- [x] Auto-start on boot
- [x] Battery optimization bypass
- [x] Local database (Room)
- [x] Material 3 UI
- [x] Stats dashboard

### Future Enhancements 🚀
- [ ] Push notifications for new orders
- [ ] USSD response parsing (confirm activation)
- [ ] Multiple device management
- [ ] Network retry logic
- [ ] Admin remote control
- [ ] Order history view
- [ ] Real-time logs in UI

---

## 🧪 Testing

### Local Testing
1. Start the service
2. Check notification: "Iftin Delivery Active"
3. Create test order from website
4. Watch phone dial USSD automatically
5. Check dashboard stats update

### API Testing
```bash
# Check pending orders
curl "https://tsjqvhddjfuecwxpcuil.supabase.co/functions/v1/activate-package/pending?deviceId=test&provider=hormuud"

# Simulate status update
curl -X POST "https://tsjqvhddjfuecwxpcuil.supabase.co/functions/v1/activate-package/status" \
  -H "Content-Type: application/json" \
  -d '{"queueId":"xxx","status":"completed","providerResponse":"Success"}'
```

---

## 📱 Supported Devices

- **Minimum**: Android 6.0 (API 23)
- **Target**: Android 14 (API 34)
- **Tested**: Samsung Galaxy M31 (Android 11)
- **Recommended RAM**: 1GB+ (works with 512MB)

---

## 🐛 Known Issues

1. **USSD Menu Navigation**: Currently waits 15 seconds (fixed timeout). Future: Parse USSD response for dynamic navigation.
2. **Samsung-Specific**: SIM slot selection uses Samsung's API. May need adjustment for other brands.
3. **Network Errors**: Basic retry (no exponential backoff yet).

---

## 🔧 Development

### Build APK
```bash
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

### Install via ADB
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### View Logs
```bash
adb logcat -s IftinDelivery
```

---

## 📝 Dependencies

```kotlin
// Core
implementation("androidx.core:core-ktx:1.12.0")
implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")

// Compose UI
implementation("androidx.compose.material3:material3")

// Coroutines
implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

// Room Database
implementation("androidx.room:room-runtime:2.6.1")
implementation("androidx.room:room-ktx:2.6.1")

// Networking
implementation("com.squareup.okhttp3:okhttp:4.12.0")
```

---

## 📄 License

Proprietary - Iftin Internet © 2025

---

## 👥 Credits

**Developed for**: Iftin Internet (Somalia)  
**Platform**: Android (Kotlin)  
**Backend**: Supabase Edge Functions  
**Target Device**: Samsung Galaxy M31  

---

## 📞 Support

For issues or questions:
1. Check [SETUP_GUIDE.md](./SETUP_GUIDE.md)
2. Review Supabase logs
3. Check Android Logcat output
4. Contact developer

---

**Status**: ✅ Ready for Production  
**Last Updated**: January 2025  
**Version**: 1.0.0
