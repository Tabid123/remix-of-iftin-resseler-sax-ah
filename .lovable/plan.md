## Ujeeddo
Xallinta joogtada ah ee qaladka Somtel/Jeeb ee `Invalid PIN format` marka USSD PIN lagu gelinayo Android AccessibilityService, iyadoo aan dib loo soo celin duplicate-execution bugs-kii hore.

## Waxa dhibaatadu dhab ahaantii tahay
Sawirka ugu dambeeya wuxuu caddeeyay in prompt-ku yahay **USSD dialog leh EditText + Send**, ee aanu ahayn dialpad-only screen.

Taasi waxay muujinaysaa in path-ka hadda mudnaanta koowaad leh ee `gesture_keypad` uu qaldan yahay xaaladdan:
- wuxuu raadinayaa digit nodes guud ahaan root-ka,
- wuxuu taaban karaa keypad/dialer/IME digits halkii uu ku qori lahaa EditText-ka USSD,
- kadib verification-ku wuxuu u qaadan karaa in PIN la qoray iyadoo masked text ama geed kale laga helay,
- ugu dambayn carrier-ku wuxuu helayaa input aan sax ahayn ama aan ka iman field-ka saxda ah, markaasna wuxuu soo celinayaa `Invalid PIN format`.

## Files-ka la saameynayo
- `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdAccessibilityService.kt`
- Haddii loo baahdo oo keliya config/telemetry:
  - `android-app/app/src/main/res/xml/accessibility_service_config.xml`
  - `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdDialerService.kt`

## Qorshaha fulinta
### 1) Ku dar diagnostics gudaha app-ka ah oo aan u baahnayn adb logcat
Waxaan ku dari doonaa debug capture rasmi ah gudaha `UssdAccessibilityService` si baaritaanka xiga aanu ugu xirnaan logcat:
- keydin `last_pin_debug_snapshot` gudaha `SharedPreferences` ama local file,
- snapshot-ku ha qoro:
  - `packageName`, `windowId`, event type,
  - dialog text oo dhan,
  - editable candidates oo dhan: class, viewId, bounds, focused/editable/enabled/visible,
  - input method la isku dayay,
  - natiijada verify-ga,
  - button la click-gareeyay,
  - carrier response text haddii uu yimaado.

Tani waxay naga saari doontaa “wax logcat ah ma hayo” blocker-ka, oo wareegga xiga xog dhab ah ayeynu heli doonaa gudaha app-ka laftiisa.

### 2) Bedel logic-ka PIN entry-ga: “editable-first”, ma aha “gesture-first”
Waxaan dib u habeyn doonaa `safeEnterPin` si xaaladda Somtel/Jeeb ee sawirkaaga u noqoto sidan:
- haddii **editable field muuqdo**, ha la isticmaalo **field-only path**,
- `gesture_keypad` ha noqdo fallback kaliya marka **wax EditText ah jirin**,
- Somtel/Jeeb prompt-kan gaarka ah lagama oggolaan doono keypad gesture priority.

Go’aanka cusub wuxuu noqon doonaa:
```text
if focused/visible editable field exists:
  use dialog field input path
else:
  use keypad gesture fallback
```

### 3) Adkee field selection-ka si uu u doorto input-ka saxda ah
Waxaan hagaajin doonaa xulashada candidate-ka si loo doorto field-ka prompt-ka Jeeb/Somtel:
- mudnaan sare: focused input,
- kadib: input-ka ugu dhow text-ka prompt-ka iyo Send button-ka,
- hoos loo dhigo candidates ka iman kara IME/keyboard ama hidden nodes,
- haddii viewId la helo, waxaa loo isticmaali doonaa xulasho deggan.

### 4) Ka saar verification-ka been-abuurka ah ee gesture path-ka xaaladdan
Hadda verification-ku wuxuu aqbali karaa masked match tree-level ah. Taasi waxay u muuqataa inay siin karto false positive.

Waxaan kala saari doonaa verify-ga sidan:
- **editable dialog path**: waa inuu ka xaqiijiyaa field-ka la doortay laftiisa ama refreshed matching candidate,
- **keypad fallback**: waxaa loo oggolaan karaa masked/tree heuristics oo keliya marka aan EditText jirin.

Sidaas ayaan uga hortagi doonaa in service-ku yiraahdo “PIN wrote and verified” iyadoo field-ka saxda ahi maran yahay.

### 5) Bedel habka qorista field-ka Somtel/Jeeb
Waxaan tijaabo ahaan u kala hormarin doonaa hababka qorista ee editable dialog-ka:
1. focus + click field + direct field write hal mar,
2. haddii clear loo baahdo, clear aan taint-gareyn field-ka,
3. paste/setText fallback oo keliya marka xaaladdu u oggolaato,
4. gesture keypad **maya** haddii EditText jiro.

Waxaan sidoo kale ilaalin doonaa:
- hal mar oo kaliya PIN write per session,
- hal mar oo kaliya submit runnable,
- suppression against duplicate re-entry.

### 6) Hagaaji event strategy-ga si content updates muhiim ahi aanay u lumin
Hadda service-ku wuxuu aad ugu tiirsan yahay `TYPE_WINDOW_STATE_CHANGED` oo keliya. Waxaan dib u qaabeyn doonaa si:
- PIN dialog active yahay marka content/focus updates muhiim ah la aqbalo si xaddidan,
- balse session/window guards-ka la adkeeyo si duplicate execution uusan u soo laaban.

Tani waxay muhiim u tahay Samsung Phone USSD dialogs oo mararka qaar focus/value updates ku dira `WINDOW_CONTENT_CHANGED` halkii `WINDOW_STATE_CHANGED` kaliya.

### 7) Xaddid submit-ka inuu dhaco kaliya marka field-ku dhab ahaan sax yahay
`submitPinOnce` lama ordi doono ilaa diagnostics-ku cadeeyo:
- field sax ah ayaa la doortay,
- writeAttempted = true,
- verify = true on selected field,
- Send/Dir button-ka saxda ah ayaa la helay.

Haddii verify-ku fashilmo, service-ku wuxuu qori doonaa snapshot-ka oo submit ma sameyn doono.

## Technical details
### Root cause-ka la filayo
- `safeEnterPin()` wuxuu hadda Somtel/STK ku bilaabaa `gesture_keypad`.
- Sawirkaagu wuxuu muujinayaa **dialog input field** oo keyboard/phone UI ka sarreeya.
- `dispatchGestureKeypad()` wuxuu ka baarayaa digit text root-ka oo dhan, taasoo si sahlan ugu dhacaysa digit nodes aan ahayn field input proper.
- `verifyPinFieldValue()` wuxuu oggolaan karaa masked/tree match, sidaas darteed false success ayaa dhici karta.
- `submitPinOnce()` kadib carrier-ku wuxuu helayaa input aan sax ahayn, wuxuuna soo celiyaa `Invalid PIN format`.

### Do I know what the issue is?
Haa — hadda dhibaatada ugu weyn waa in **code-ku u treat-gareynayo Somtel prompt-ka sidii keypad-driven input**, halka sawirkaagu muujinayo **editable USSD dialog field**. Xalka waara waa in logic-ka loo rogo **editable-field-first + strict verification + in-app diagnostics**.

## Natiijada la filayo kadib fulinta
- Somtel/Jeeb PIN waxa lagu qori doonaa field-ka saxda ah,
- `gesture_keypad` looma adeegsan doono marka EditText jiro,
- false verification lama aqbali doono,
- duplicate execution guards way sii jiri doonaan,
- haddii wax wali qaldamaan, app-ku wuxuu hayn doonaa debug snapshot aan adb u baahnayn si wareegga xiga si degdeg ah loo xalliyo.