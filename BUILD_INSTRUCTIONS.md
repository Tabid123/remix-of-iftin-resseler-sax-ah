# 🏗️ Sida Loo Build Gareeyo APK-ga

## 🚀 **Xulasho Degdeg ah**

```bash
# 1. Clone GitHub repository
git clone https://github.com/YOUR-USERNAME/iftin-internet.git
cd iftin-internet/android-app

# 2. Build APK
./gradlew assembleDebug

# 3. APK-gu wuxuu joogaa:
# app/build/outputs/apk/debug/app-debug.apk
```

---

## 🤖 **Automatic Build (Recommended)**

### Sidee Loo Shaqeeyo:

1. **Export Project to GitHub** (Lovable → GitHub button)
2. **Push Code to GitHub** (Automatic weeye!)
3. **GitHub Actions** automatically build garaynayaa APK-ga
4. **Download APK** from GitHub Actions artifacts

### GitHub Actions Setup:

✅ **Already configured!** File: `.github/workflows/build-apk.yml`

Waxay samaysaa:
- ✅ Build APK every time you push code
- ✅ Upload APK to GitHub Artifacts (downloadable)
- ✅ Copy APK to `public/downloads/` (website download)
- ✅ Automatic commit & push

### Downloading APK from GitHub Actions:

1. Aad **GitHub repository**-ga → **Actions** tab
2. Click latest **"Build Android APK"** workflow run
3. Scroll down to **Artifacts** section
4. Click **"iftin-delivery-apk"** to download
5. Extract ZIP → `app-debug.apk`
6. Copy to phone & install!

---

## 💻 **Manual Build (Local Computer)**

### Requirements:

1. **Java Development Kit (JDK) 17**
   ```bash
   # Check if installed:
   java -version
   
   # Download: https://adoptium.net/
   ```

2. **Android Studio** (Recommended) OR **Command Line Tools**
   - Download: https://developer.android.com/studio

### Method 1: Using Android Studio (Easier)

1. **Open Android Studio**
2. **File → Open** → Select `android-app` folder
3. **Wait for Gradle Sync** (5-10 minutes first time)
4. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. Click **"locate"** link in notification
6. APK: `app/build/outputs/apk/debug/app-debug.apk`

### Method 2: Using Command Line (Faster)

```bash
cd android-app

# Mac/Linux:
./gradlew assembleDebug

# Windows:
gradlew.bat assembleDebug
```

**Output**: `app/build/outputs/apk/debug/app-debug.apk`

---

## 📱 **Installing APK on Phone**

### Option 1: Direct USB Install

```bash
# Connect phone via USB (enable USB debugging)
cd android-app
./gradlew installDebug

# App installs automatically!
```

### Option 2: Manual Install

1. **Copy APK to phone** (USB, Bluetooth, or cloud)
2. **Open File Manager** on phone
3. **Tap APK file**
4. **Enable "Install from Unknown Sources"** if asked
5. **Tap Install**
6. **Open app** → Grant permissions

---

## 🔍 **Troubleshooting**

### Error: "JAVA_HOME not set"

```bash
# Mac/Linux:
export JAVA_HOME=/path/to/jdk-17
export PATH=$JAVA_HOME/bin:$PATH

# Windows:
set JAVA_HOME=C:\Program Files\Java\jdk-17
set PATH=%JAVA_HOME%\bin;%PATH%
```

### Error: "SDK location not found"

Create `android-app/local.properties`:
```properties
sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
# Windows: sdk.dir=C\:\\Users\\YOUR_USERNAME\\AppData\\Local\\Android\\Sdk
```

### Error: "Gradle sync failed"

```bash
cd android-app
./gradlew clean
./gradlew build --refresh-dependencies
```

### Build is Very Slow

First build takes 10-20 minutes (downloading dependencies). Subsequent builds are much faster (1-2 minutes).

---

## 🎯 **APK Versions**

### Debug APK (Current)
- **Purpose**: Development & Testing
- **Size**: ~8-10 MB
- **Signing**: Debug keystore (auto-generated)
- **Build Time**: 2-5 minutes

### Release APK (Production - Future)

```bash
# Generate signing key:
keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias iftin

# Build release APK:
./gradlew assembleRelease
```

---

## 📊 **Build Stats**

**Typical Build Time:**
- First build: 10-20 minutes (downloads ~500MB dependencies)
- Subsequent builds: 1-3 minutes
- GitHub Actions build: 5-8 minutes

**APK Size:**
- Debug: ~8-10 MB
- Release (optimized): ~5-7 MB

**Supported Devices:**
- Min SDK: Android 10 (API 29)
- Target SDK: Android 14 (API 34)
- Architecture: ARM64, ARMv7

---

## ✅ **Success Checklist**

After building APK:
- [ ] APK file exists: `app/build/outputs/apk/debug/app-debug.apk`
- [ ] APK size is 8-10 MB
- [ ] No build errors in console
- [ ] APK installs on phone without errors
- [ ] App opens successfully
- [ ] All permissions work (phone, SMS, internet)

---

## 📞 **Need Help?**

**Common Issues:**
- Read `ANDROID_APP_INSTRUCTIONS.md` for detailed setup
- Check GitHub Actions logs for build errors
- Run `./gradlew assembleDebug --stacktrace` for detailed errors

**Resources:**
- Android Studio Guide: https://developer.android.com/studio/intro
- Gradle Build Guide: https://developer.android.com/studio/build
- GitHub Actions Logs: Repository → Actions tab

---

**🎉 Guul! Your APK is ready for deployment!**
