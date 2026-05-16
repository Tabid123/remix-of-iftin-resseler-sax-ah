# 📱 How to Get the Android App on Your Samsung M31

## 🎯 Overview

Waxaan sameyney Android app oo dhamaystiran oo automatic u shaqeeya delivery system-ka. The complete source code is now in the `android-app/` folder in this project.

---

## 📥 **Option 1: Build from Source (Recommended)**

### Step 1: Export Project to GitHub

1. Click the **GitHub** icon in the top-right corner of Lovable
2. Click **"Transfer project to GitHub"**
3. Your project will be uploaded to your GitHub account
4. Note the repository URL (e.g., `https://github.com/yourusername/iftin-internet`)

### Step 2: Clone to Your Computer

Open terminal/command prompt and run:
```bash
git clone https://github.com/yourusername/iftin-internet.git
cd iftin-internet/android-app
```

### Step 3: Install Android Studio

1. Download from: https://developer.android.com/studio
2. Install and complete setup wizard
3. Install Android SDK (API 34)

### Step 4: Open Project

1. Open Android Studio
2. Click **File → Open**
3. Navigate to `iftin-internet/android-app` folder
4. Click **OK**
5. Wait for Gradle sync (5-10 minutes first time)

### Step 5: Build APK

**Option A: Run Directly on Phone (Easier)**
1. Connect Samsung M31 to computer via USB
2. Enable USB Debugging on phone:
   - Settings → About Phone
   - Tap "Build Number" 7 times
   - Go to Settings → Developer Options
   - Enable "USB Debugging"
3. Click green **Run** button in Android Studio
4. Select your Samsung M31
5. App installs automatically! 🎉

**Option B: Build APK File**
1. Click **Build → Generate Signed Bundle / APK**
2. Select **APK**
3. Click **Next**
4. Choose **debug** (no signing needed for testing)
5. Click **Finish**
6. APK location: `app/build/outputs/apk/debug/app-debug.apk`
7. Copy APK to phone via USB or Bluetooth
8. Install on phone (enable "Install from Unknown Sources")

---

## 📥 **Option 2: Download Pre-Built APK (If Available)**

If someone has already built the APK, you can:

1. Copy `app-debug.apk` to your phone
2. Open file manager on phone
3. Tap the APK file
4. Tap **Install**
5. Enable "Install from unknown sources" if prompted
6. Open the app!

---

## ⚙️ **After Installation - Phone Setup**

### 1. Insert SIM Cards
- **Slot 1**: Hormuud SIM
- **Slot 2**: Somnet SIM

### 2. Grant Permissions
Open app and grant all permissions when asked:
- ✅ Phone calls
- ✅ Read phone state  
- ✅ Internet access
- ✅ Background running

### 3. Disable Battery Optimization
1. Open Iftin Delivery app
2. Tap **"DISABLE BATTERY OPTIMIZATION"** button
3. Select "Allow" when prompted

### 4. Enable Developer Options (Keep Awake)
1. Go to **Settings → About Phone**
2. Tap **Build Number** 7 times
3. Go back to **Settings → Developer Options**
4. Enable **"Stay awake while charging"**

### 5. Start the Service
1. Open Iftin Delivery app
2. Tap the green **"START SERVICE"** button
3. You'll see notification: **"Iftin Delivery Active"**
4. Done! Service is now running 24/7 🎉

### 6. Keep Phone Charging
- Plug into charger
- Keep charging 24/7
- Place in well-ventilated area

---

## 🧪 **Testing the Setup**

### Test 1: Check Service Status
1. Open Iftin Delivery app
2. Look for **green dot** next to "ACTIVE"
3. Should show: "Iftin Delivery Active"

### Test 2: Create Test Order
1. Go to your Iftin website
2. Make a test purchase (Hormuud or Somnet)
3. Wait 5-10 seconds
4. Phone should automatically dial USSD code!
5. Check app dashboard - **Success** count increases

### Test 3: Check Supabase Logs
1. Visit: https://supabase.com/dashboard/project/tsjqvhddjfuecwxpcuil/functions/activate-package/logs
2. You'll see:
   - `GET /pending` - Phone checking for orders
   - `POST /status` - Phone reporting success

---

## 📊 **How to Monitor**

### In the App
- **Total**: All orders processed
- **Success**: Successfully activated packages
- **Failed**: Failed activations  
- **Pending**: Orders waiting in queue

### In Supabase Dashboard
- Check `delivery_queue` table for order status
- Check `android_devices` table for phone status
- Check edge function logs for API calls

---

## 🔧 **Troubleshooting**

### Problem: Can't Build in Android Studio
**Solution**:
- Make sure you have Android SDK installed
- File → Sync Project with Gradle Files
- Clean project: Build → Clean Project
- Rebuild: Build → Rebuild Project

### Problem: USB Debugging Not Working
**Solution**:
- Install Samsung USB drivers
- Try different USB cable
- Enable "Transfer files" mode (not just charging)

### Problem: APK Won't Install
**Solution**:
- Enable "Install from unknown sources"
- Make sure it's a `.apk` file (not `.aab`)
- Try clearing old version first

### Problem: Service Stops After Phone Sleeps
**Solution**:
- Disable battery optimization (most important!)
- Enable "Stay awake" in Developer Options
- Check if "Battery Saver" is off

---

## 📁 **Project Files You Need**

All files are in the `android-app/` folder:

```
android-app/
├── app/
│   ├── src/main/
│   │   ├── kotlin/           # All Kotlin source code
│   │   ├── AndroidManifest.xml
│   │   └── res/              # Resources (icons, strings)
│   └── build.gradle.kts      # Dependencies
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── SETUP_GUIDE.md           # Detailed setup guide
└── README.md                # Technical documentation
```

---

## 🎓 **Learning Resources**

If you want to understand the code:

1. **MainActivity.kt**: UI and dashboard
2. **UssdDialerService.kt**: Background service (main logic)
3. **DeliveryApiClient.kt**: API communication
4. **AndroidManifest.xml**: Permissions and configuration

---

## 💡 **Tips**

1. **Keep Phone Cool**: Remove case, place in open area
2. **Monitor First 24 Hours**: Check stats regularly initially
3. **Test Both Providers**: Make test orders for Hormuud AND Somnet
4. **Battery Health**: Modern phones handle 24/7 charging well
5. **Backup Phone**: Consider getting a second phone for redundancy

---

## 📞 **Need Help?**

If you're stuck:
1. Read `android-app/SETUP_GUIDE.md` for detailed instructions
2. Check Android Studio error messages
3. Look at Supabase logs for API issues
4. Reboot phone and try again

---

## ✅ **Final Checklist**

Before going live, make sure:
- [ ] App installed on Samsung M31
- [ ] Both SIMs inserted (Hormuud Slot 1, Somnet Slot 2)
- [ ] Battery optimization disabled
- [ ] Stay awake enabled
- [ ] Service started (green dot)
- [ ] Phone charging 24/7
- [ ] Test order successful
- [ ] Supabase logs showing activity
- [ ] Dashboard updating correctly

---

**Congratulations! Your automatic delivery system is ready! 🚀**

The phone will now work 24/7 automatically, even while you sleep. No manual intervention needed!
