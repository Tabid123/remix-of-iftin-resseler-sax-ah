
## Dhibaatada dhabta ah

Kahor wax la beddelin, waxaan xaqiijiyay laba arrimood:

1. **App-ku durba leeyahay debug card** ("🧪 Last PIN Attempt") gudaha MainActivity, laakiin waxa uu kaliya muujiyaa `actualLen=…` iyo `failure=…` — uma muujiyo **PIN-ka la xushay** iyo **qoraalka dhabta ah ee field-ka** waqtigaas. Sidaa darteed mar walba lama oga sababta "Invalid PIN format" ka dhalatay.
2. **Submit guard-ku** wuu blokeeyaa Send haddii field-ku madhan yahay, **laakiin ma sugo** in field-ku si dhab ah u buuxsamo — wuxuu hal mar oo qura hubiyaa ka dib 600ms. Hadii TextWatcher-ka Hormuud/Somtel uu daahiyo, guard-ku wuxuu arkaa madhan, blok sameeyaa, oo ma jiro retry — sidaa darteed Send weligii lama riixo, taasoo carrier-ku ku celceliyo "Invalid PIN format".

## Plan-ka xalka

### 1) Live "PIN HUD" overlay (waqtiga-dhabta ah, mobilka kaga muuqda)

Ku dar **system overlay window** (TYPE_APPLICATION_OVERLAY) oo si toos ah uga muuqda korka USSD dialog-ka muddo 8 ilbiriqsi mar kasta oo PIN la qorayo. HUD-ku wuxuu muujinayaa:

- **Expected PIN** (tusaale: `5516`)
- **Field text now** (tusaale: `5516` ama `••••` ama `<empty>`)
- **Field length** vs expected length
- **Method** (`action_set_text` / `clipboard_paste` / `gesture_keypad`)
- **Status**: `WRITING…` → `VERIFYING…` → `SENT ✓` ama `BLOCKED: <reason>`

Sidatan, marka USSD dialog-gu furmo waxaad indhahaaga ku arki kartaa hadii PIN-ku galay si sax ah ama maya, iyadoon loo baahnayn `adb logcat`.

**Goobaha la beddelayo:**
- `UssdAccessibilityService.kt` — ku dar `PinHudOverlay` class oo isticmaala `WindowManager.addView()` + `TextView`. La cusbooneysii markasta oo `safeEnterPin` / `submitPinOnce` / submit guard ay shaqeeyaan. Auto-dismiss 8s ka dib.
- `AndroidManifest.xml` — ku dar `<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>`.
- `MainActivity.kt` — ku dar button "Enable PIN Debug Overlay" oo furaya `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` haddii aan la siin permission-ka.

### 2) Send-ka oo loo daahiyo ilaa field-ku si dhab ah u buuxsamo (retry-with-verify)

Bedel `submitPinOnce` hal-mar guard ah → **retry loop** oo ilaa 1500ms ah:

```
schedule submit attempt:
  every 150ms (max 10 attempts):
    re-collect editable field
    read node.text
    if text matches intendedPin OR (masked AND length == intendedLen) AND field still focused/editable:
      → click Send
      return
  after 10 failed checks:
    persist debug snapshot "submit_timeout actualLen=X intended=Y"
    update HUD with BLOCKED reason
```

Tani waxay xallinaysaa kiiska Somtel/Hormuud halkaas oo TextWatcher-ku ka daahayo 200-800ms `ACTION_SET_TEXT` ka dib — hadda waxaan sugaynaa ilaa field-ku saxsanaado halkii aan hal mar wax u hubin lahayn.

**Goobaha la beddelayo:**
- `UssdAccessibilityService.kt` `submitPinOnce()` — ku rogo poll loop oo ah Handler-based, ma'aha hal `postDelayed`.

### 3) Diagnostics oo la kordhinayo

Diagnostics snapshot-ka (`KEY_LAST_PIN_DEBUG`) ku dar:
- `attempts=N/10` (intii poll ah ee la sameeyay ka hor inta Send la riixayo)
- `firstReadLen` vs `finalReadLen` (ogow haddii field-ku gaabis u buuxsamayo)
- `intendedPin` iyo `finalActual` (kaliya marka debug overlay permission la siiyey, si looga ilaaliyo privacy production)

### 4) APK-ka oo dib loo dhiso

Ku samee Nix sandbox (JDK 17 + Android SDK 34, build-tools 34.0.0), kaydi `apk-output/iftin-delivery.apk`.

## Sida loo isticmaalo (user-facing)

1. Ku rakib APK-ga cusub.
2. Fur app-ka → riix **"Enable PIN Debug Overlay"** → sii permission-ka.
3. Sameey order USSD ah si caadi ah.
4. Marka PIN dialog-gu furmo, waxaad **mobilka ku arki doontaa** sanduuq jaalle ah oo leh:
   - `Expected: 5516`
   - `Actual: 5516` (ama `••••`)
   - `Status: SENT ✓` ama `BLOCKED: nullOrEmpty`
5. Hadii ay BLOCKED noqoto, waxaan si sax ah u garan doonaa sababta — markaas waxaan saxi karnaa root cause-ka (tusaale: field-ka qaarkood ma aha TextWatcher-based oo loo baahan yahay `dispatchGesture`).

## Faah-faahin farsamo (kooban)

- Overlay-gu wuxuu isticmaalaa `WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY` (API 26+) si uu ugu muuqdo korka SIM Toolkit dialog-ka, kaas oo aan caadi ahaan loo aqbalin Toast-yada Compose.
- Retry loop-ka wuxuu xushaa node cusub markasta oo uu `collectEditableFieldCandidates(root)` u yeero — ma kaydsho reference-yo duug ah oo Android dib u dhisi karo.
- Wax la mid ah `pinSubmittedForSession` la xafidayo si looga ilaaliyo Send laba jeer in la riixo.
