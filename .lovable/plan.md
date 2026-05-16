# Xal Waara: Somtel "Invalid PIN format"

## Sababta dhabta ah

Somtel SIM Toolkit / USSD dialog-ka **ma aamino** `ACTION_SET_TEXT` (iyo char-by-char oo isagana ah `SET_TEXT`). Inkasta oo qiimaha la arko field-ka dhexdiisa, IME-ka carrier-ka ayaa u arka `programmatic text` oo aan ka iman keypad — sidaas darteed wuxuu ku celiyaa `Invalid PIN format`. Code-ka hadda jira shan "fallback" wuu leeyahay, laakiin **afar ka mid ah ayaa ah SET_TEXT isku mid** — kaliya `clipboard_paste` ayaa xal kale ah, isaguna wuxuu ku xirnaa `ACTION_PASTE` oo SIM Toolkit-ka inta badan **aanu taageerin** (`actionList` ma keeno PASTE).

Sidoo kale, `accessibility_service_config.xml` ma laha `flagRequestFilterKeyEvents` ama `canPerformGestures`, sidaas darteed key-event simulation dhab ah lama awoodi karo.

## Hagaajinta

### 1. Config (`accessibility_service_config.xml`)
- Ku dar `canPerformGestures="true"` — looga baahan yahay tap gestures dhabta ah keypad-ka USSD.
- Iska saar `typeViewClicked` event-ka aan loo baahnayn (waxay keentaa noise).

### 2. Refactor PIN injection (`UssdAccessibilityService.kt`)

**Hierarchy cusub oo gestures dhab ah ku saleysan** (kala saar SET_TEXT-ka SET_TEXT-ka kale):

1. **`dispatchGestureKeypad`** (CUSUB - sare ugu mudan):
   - Hel keypad buttons (`1` `2` `3` ... `*` `#`) oo ah `Button`/`TextView` clickable `com.android.stk`/dialer-ka dhexdiisa via `findAccessibilityNodeInfosByText`.
   - PIN digit kasta: hel node-ka lambarka (e.g. "5"), `getBoundsInScreen`, ka dibna `dispatchGesture` ku samee `GestureDescription` (StrokeDescription tap 60ms) bartamaha bounds-ka.
   - Inter-digit delay 120–180ms si carrier-ku ugu sheego "true keypress".
   - Tani waa shaqeysa SIM Toolkit/dialer keypad ah sababtoo ah waxay u muuqataa physical taps — ma adeegsaneyso IME/SET_TEXT gabi ahaanba.

2. **`clipboardPaste`** (haddii field-ka uu taageero `ACTION_PASTE`):
   - Sida hadda, laakiin xaqiiji `actionList.any { it.id == ACTION_PASTE }` ka hor.

3. **`actionSetText`** (kaliya fallback ah haddii labadii sare fashilmaan):
   - Ku noqo hawsha jirta.

**Iska saar** `writeCharacterByCharacter` iyo `writeWithKeyEventSimulation` (labaduba waa SET_TEXT, kuma daraan wax cusub — waxay keenaan inay cilad sidii hore u soo noqoto).

### 3. Verification & submit timing
- Kadib `dispatchGesture`, **HA isku dayin** in laga akhriyo `node.text` — keypad-ka USSD field-ka qaarkood waxay muujiyaan `••••` oo aan match-eyn 4-digit PIN-ka. Taa beddelkeeda hubi:
  - Tirinta `text.length` waa 4 (ama `*` ku jiraan), AMA
  - 4ta gesture oo dhan ay soo celiyeen `onCompleted` (track `GestureResultCallback`).
- Hadii gesture path-ka la istcimaalo, ka beddel `pinVerifiedForSession = true` kaliya kadib `onCompleted` 4-jeer.
- Kor u qaad delay-ga submit-ka 300ms → **600ms** kadib gesture-ka u dambeeyay, si carrier IME-ku u helo waqti uu ugu xaqiijiyo input-ka.

### 4. Carrier response logging (Somtel diagnostic)
Kadib submit, ku daba qor `KEY_LAST_USSD_RESPONSE` oo log-garee:
- Habka la isticmaalay (`gesture` / `paste` / `set_text`)
- 4ta gesture status-kooda (`onCompleted` / `onCancelled`)
- Field-ka qiimihiisa kahor & kadib
- Qoraalka carrier-ka soo celiyay (e.g. "Invalid PIN format" vs "Mahadsanid")

### 5. Ilaali guards-ka jira
**Wax la beddeli maayo:**
- `isProcessingDialog` lock
- `setTextSuppressUntilMs` (sii deji 2500ms si suppression-ku u daboolo dispatchGesture queue-ka)
- `pinFilledForSession` / `pinSubmittedForSession`
- Single `scheduledSubmitRunnable`
- `TYPE_WINDOW_STATE_CHANGED` kaliya event filter

## Faylasha la beddelayo
- `android-app/app/src/main/res/xml/accessibility_service_config.xml` — `canPerformGestures="true"`, ka saar `typeViewClicked`.
- `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdAccessibilityService.kt`:
  - Ku dar `dispatchGestureKeypad(root, pin)` helper (uses `dispatchGesture` + `GestureDescription`).
  - Beddel `safeEnterPin` hierarchy-ga: gesture → paste → set_text.
  - Iska saar `writeCharacterByCharacter` + `writeWithKeyEventSimulation`.
  - Cusboonaysii `verifyPinFieldValue` si uu u aqbalo masked text (`•` / `*`) marka length-ku saxan yahay.
  - Kor u qaad submit delay 300ms → 600ms.
  - Logging cusub oo carrier response leh.

## Talaabada xigta
Kadib build, fadlan `adb logcat -s UssdAccessibility` daawo marka aad isku daydo Somtel topup — log-yadu waxay muujin doonaan habka ugu horreeya ee shaqeeyay (`gesture` la rajeynayo).
