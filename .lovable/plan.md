# Qorshaha xalka

## Waxa hadda dhab ahaan khaldan
- **HUD-ka ma muuqdo** sababtoo ah service-ku wuxuu isticmaalayaa `TYPE_APPLICATION_OVERLAY` isla markaana `showPinHud()` si toos ah ayuu u joojinayaa haddii `Settings.canDrawOverlays()` aanu true ahayn. USSD/STK dialogs badankood waxaa si ka fiican uga sarreeya `TYPE_ACCESSIBILITY_OVERLAY`, mana u baahna isla overlay permission-ka caadiga ah.
- **`invalid pin format` wali wuu dhici karaa** sababtoo ah code-ku weli wuxuu isticmaalayaa **`clipboard_paste` first** marka editable field la helo (non-Samsung), inkastoo dhibaatadii hore halkaas ka timid.
- **Verification-ku aad buu ugu tiirsan yahay `node.text`**, laakiin PIN/password fields qaar Android Accessibility waxay u soo celiyaan `""` ama masked value oo keliya. Sidaas darteed service-ku mararka qaar si khaldan ayuu u go'aamiyaa in field-ku sax yahay ama madhan yahay.

## Do I know what the issue is?
**Haa.** Dhibaatadu waa laba qaybood oo isku biiray:
1. HUD-ka laftiisa si qaldan ayaa loo sameeyay, markaa mobilka korkiisa kama soo muuqdo.
2. Qoraalka PIN-ka wali waxaa marin u ah clipboard path + verification aan ku filnayn password fields, taasina waxay keeni kartaa in carrier-ku helo PIN aan sax ahayn ama aan si buuxda u register-garin.

## Faylasha aan taaban doono
- `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdAccessibilityService.kt`
- `android-app/app/src/main/kotlin/com/iftin/delivery/MainActivity.kt`
- `android-app/app/src/main/AndroidManifest.xml`

## Waxa la beddeli doono

### 1) HUD-ka waxaan u wareejin doonaa accessibility overlay sax ah
- Ka beddel `TYPE_APPLICATION_OVERLAY` una wareeji **`TYPE_ACCESSIBILITY_OVERLAY`** gudaha `UssdAccessibilityService`.
- Ka saari doonaa dependency-ga adag ee `Settings.canDrawOverlays()` si HUD-ku uga shaqeeyo sida accessibility service overlay.
- Haddii addView fashilmo, waxaan kaydin doonaa sababta fashilka gudaha debug snapshot si aan indhaha uga aragno sababta uu u baaqday.

### 2) Clipboard path-ka waan ka saari doonaa PIN editable dialogs
- Marka PIN dialog uu leeyahay editable field, flow-gu wuxuu noqon doonaa **ACTION_CLICK -> ACTION_FOCUS -> ACTION_SET_TEXT only**.
- `rawPin` waxaa lagu mari doonaa `.trim()` ka hor qorista.
- Delay-ga qorista kadib waxaan ka dhigi doonaa mid cad oo joogto ah (`150ms–200ms`) ka hor verification/submit.
- `clipboard_paste` looma adeegsan doono PIN dialogs-ka caadiga ah.

### 3) Verification-ka waxaan ka dhigi doonaa mid la jaanqaada password fields
- Haddii field-ku yahay password/masked field, verification-ku kuma ekaan doono `node.text == pin` oo keliya.
- Waxaan hubin doonaa calaamado badan:
  - exact digits haddii ay muuqdaan
  - masked length haddii field-ku uu soo celiyo `••••`
  - tree-level masked length haddii selected node text uu madhan yahay
  - field focus/editable state waqtiga submit-ka
- Send lama riixi doono haddii field-ku wali u ekaado madhan ama length-ku aanu la mid ahayn PIN-ka la filayo.

### 4) Diagnostics-ka waxaan ka dhigi doonaa kuwo dhab ahaan wax sheegaya
- `KEY_LAST_PIN_DEBUG` waxaan ku dari doonaa:
  - `overlayShown=true/false`
  - `overlayError=...`
  - `fieldIsPassword=true/false`
  - `actualTextLen`
  - `maskedTreeLen`
  - `method=action_set_text_only`
  - `attempts=N/10`
- `MainActivity` debug card-ka waxaan ka dhigi doonaa inuu muujiyo xogtan si xitaa haddii HUD-ku mar kale bixi waayo, aad mobilka screen-ka app-ka gudihiisa uga aragto sababta.

### 5) Rebuild iyo xaqiijin
- Waxaan dhisi doonaa APK cusub.
- Markaan implement gareeyo, xaqiijinta aan sameyn doono waa:
  - HUD logic-ku mar dambe aanu ku xirnayn overlay permission-ka caadiga ah
  - method-ku aanu mar dambe ahayn `clipboard_paste`
  - debug snapshot-ku si cad u sheego haddii field-ku yahay password/masked
  - submit guard-ku aanu dirin Send ilaa length sax ahi muuqdo

## Faahfaahin farsamo
```text
Old path:
PIN dialog -> clipboard_paste or set_text -> weak verify(node.text) -> Send

New path:
PIN dialog -> click+focus -> ACTION_SET_TEXT(trimmed PIN) -> 180ms wait
-> verify via exact/masked/tree-length -> Send only if exact length confirmed

HUD:
TYPE_APPLICATION_OVERLAY + canDrawOverlays gate
becomes
TYPE_ACCESSIBILITY_OVERLAY + service-owned overlay diagnostics
```

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>