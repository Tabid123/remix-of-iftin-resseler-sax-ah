@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Build Android APK locally without CI credits
REM Prerequisites: JDK 17, Android SDK (Platform 34, Build-tools 34.0.0)

REM --- Check JAVA ---
where java >nul 2>nul
if errorlevel 1 (
  if not defined JAVA_HOME (
    echo [ERROR] Java not found. Install JDK 17 and/or set JAVA_HOME/Path.
    exit /b 1
  ) else (
    set "PATH=%JAVA_HOME%\bin;%PATH%"
  )
)

REM --- Resolve SDK path ---
if not defined ANDROID_SDK_ROOT (
  if defined ANDROID_HOME (
    set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
  ) else (
    echo [ERROR] ANDROID_SDK_ROOT not set. Please set it to your Android SDK folder.
    echo Example: set ANDROID_SDK_ROOT=C:\Android\Sdk
    exit /b 1
  )
)

REM --- Create local.properties ---
if not exist android-app mkdir android-app
(
  echo sdk.dir=%ANDROID_SDK_ROOT%
) > android-app\local.properties

echo [INFO] Using SDK: %ANDROID_SDK_ROOT%

REM --- Make sure gradlew exists ---
if not exist android-app\gradlew (
  echo [ERROR] android-app\gradlew not found.
  exit /b 1
)

REM --- Build ---
pushd android-app
call gradlew --version || (echo [WARN] Gradle version command failed & rem continue)
call gradlew -p . clean :app:assembleDebug -x test -x lint --no-daemon --stacktrace --warning-mode all --max-workers=1
if errorlevel 1 (
  popd
  echo [ERROR] Build failed. See gradle-build.log for details.
  exit /b 1
)
popd

REM --- Copy APK to output ---
if not exist apk-output mkdir apk-output
copy /Y android-app\app\build\outputs\apk\debug\app-debug.apk apk-output\iftin-delivery.apk >nul

REM --- Save log ---
if exist gradle-build.log del /q gradle-build.log >nul 2>nul
call android-app\gradlew -p android-app -q help > gradle-build.log 2>&1

echo.
echo [SUCCESS] APK is ready: apk-output\iftin-delivery.apk
exit /b 0
