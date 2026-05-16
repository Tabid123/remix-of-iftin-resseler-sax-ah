# 📥 APK Download Folder

## 🤖 Automatic APK Builds

This folder contains the latest Android APK, automatically built by GitHub Actions.

### Download Latest APK:
- **Filename**: `iftin-delivery.apk`
- **Auto-updated**: Every push to `android-app/` folder
- **Website URL**: `https://yourdomain.com/downloads/iftin-delivery.apk`

---

## 📦 How to Get the APK

### Method 1: Download from Website
1. Visit: `/download-app` page
2. Click **"Download APK"** button
3. File downloads automatically

### Method 2: Download from GitHub Actions
1. Go to: https://github.com/YOUR-USERNAME/iftin-internet
2. Click **Actions** tab
3. Click latest **"Build Android APK"** workflow
4. Scroll to **Artifacts** section
5. Download **"iftin-delivery-apk"** (ZIP file)
6. Extract → `app-debug.apk`

### Method 3: Direct Link (After First Build)
```
https://github.com/YOUR-USERNAME/iftin-internet/raw/main/public/downloads/iftin-delivery.apk
```

---

## ℹ️ Build Information

**Current Version:**
- Build Type: Debug APK
- Min Android: Android 10 (API 29)
- Target Android: Android 14 (API 34)
- Approximate Size: 8-10 MB

**Features:**
- ✅ Dual-SIM USSD Dialing
- ✅ Automatic Order Processing
- ✅ SMS Payment Detection
- ✅ Background Service
- ✅ Battery Optimization Control

---

## 📱 Installation Guide

1. Download `iftin-delivery.apk`
2. Enable **"Install from Unknown Sources"**:
   - Settings → Security → Unknown Sources → ON
3. Open APK file
4. Tap **Install**
5. Open app → Grant permissions
6. Insert SIMs (Hormuud Slot 1, Somnet Slot 2)
7. Start service

For detailed setup: Visit `/download-app` page

---

## 🔄 Build Process

**Triggered by:**
- Push to `main` or `master` branch
- Changes in `android-app/` folder
- Manual workflow dispatch

**Build Steps:**
1. Checkout code
2. Setup Java & Android SDK
3. Build debug APK
4. Upload to GitHub Artifacts
5. Copy to `public/downloads/`
6. Commit & push APK

**View Build Logs:**
Repository → Actions → Latest workflow run

---

## 🚨 First Build Setup

**Important:** APK file will NOT exist until first GitHub Actions build completes!

### Initial Setup:
1. Export project to GitHub (Lovable → GitHub button)
2. GitHub Actions automatically runs
3. Wait 5-10 minutes for first build
4. APK appears in this folder
5. Download link becomes active

### Check Build Status:
- GitHub → Actions tab → "Build Android APK" workflow
- Green ✅ = Success
- Red ❌ = Failed (check logs)

---

## 📝 Notes

- APK is **debug signed** (for testing only)
- For production: Use **release signing** with proper keystore
- APK updates automatically on code changes
- Old APK is overwritten by new builds
- Users must manually update APK on their phones

---

**Last Updated**: Auto-updated by GitHub Actions
**Maintainer**: Iftin Internet Development Team
