#!/usr/bin/env bash
set -euo pipefail

# Build Android APK locally without CI credits
# Prerequisites: JDK 17, Android SDK (Platform 34, Build-tools 34.0.0)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT_DIR"

# --- Check Java ---
if ! command -v java >/dev/null 2>&1; then
  if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
    export PATH="$JAVA_HOME/bin:$PATH"
  else
    echo "[ERROR] Java not found. Install JDK 17 and ensure it's on PATH or JAVA_HOME is set." >&2
    exit 1
  fi
fi

# --- Resolve SDK path ---
if [[ -z "${ANDROID_SDK_ROOT:-}" ]]; then
  if [[ -n "${ANDROID_HOME:-}" ]]; then
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
  else
    echo "[ERROR] ANDROID_SDK_ROOT not set. Please export it to your Android SDK folder." >&2
    echo "Example (macOS): export ANDROID_SDK_ROOT=\"$HOME/Library/Android/sdk\"" >&2
    echo "Example (Linux): export ANDROID_SDK_ROOT=\"$HOME/Android/Sdk\"" >&2
    exit 1
  fi
fi

# --- Create local.properties ---
mkdir -p android-app
printf "sdk.dir=%s\n" "$ANDROID_SDK_ROOT" > android-app/local.properties

echo "[INFO] Using SDK: $ANDROID_SDK_ROOT"

# --- Build ---
chmod +x android-app/gradlew || true
set +e
./android-app/gradlew --version
set -e

set +e
./android-app/gradlew -p android-app clean :app:assembleDebug -x test -x lint --no-daemon --stacktrace --warning-mode all --max-workers=1 | tee gradle-build.log
GRADLE_STATUS=${PIPESTATUS[0]}
set -e

if [[ $GRADLE_STATUS -ne 0 ]]; then
  echo "[ERROR] Build failed. See gradle-build.log for details." >&2
  exit $GRADLE_STATUS
fi

# --- Copy APK to output ---
mkdir -p apk-output
cp android-app/app/build/outputs/apk/debug/app-debug.apk apk-output/iftin-delivery.apk

echo
echo "[SUCCESS] APK is ready: apk-output/iftin-delivery.apk"
