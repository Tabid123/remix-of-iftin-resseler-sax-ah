## Hadafka

Marka USSD dialog-ga PIN-ka uu soo baxo, app-ku **wuxuu kaliya buuxin doonaa PIN-ka** ee ma riixi doono badhanka **Send/OK**. Adiga ayaa gacanta ku riixaya Send markaad aragto in PIN-ku si sax ah u soo galay. Tani waxay baabi'in doontaa "invalid pin format" sababtoo ah:

- Carrier-ka wuxuu helayaa PIN-ka oo si dhammeystiran u soo galay (ma jiro race condition u dhexeeya set_text iyo click Send).
- Haddii field-ku yahay masked/password oo accessibility-gu si khaldan u verify gareeyo, mar dambe Send lama riixayo kahor inta aanad adigu hubin.
- Adiga ayaa noqonaya verification-ka ugu dambeeya — taas oo 100% sax ah.

## Wax la beddelayo

Faylka kaliya: `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdAccessibilityService.kt`

### 1) Auto-press Send waa la xidhayaa PIN dialogs
- Marka dialog la aqoonsado inuu yahay PIN/password prompt:
  - Geli PIN-ka (`ACTION_SET_TEXT` ama gesture keypad sida hadda).
  - **Ka boodi** qaybta `clickSendButton()` / submit gesture.
  - Ku dar HUD/notification gaaban: "PIN waa la buuxiyay — fadlan riix Send".
- Dialogs aan ahayn PIN (tusaale confirmation "1. Yes") way sii shaqayn doonaan sida hadda (auto-confirm).

### 2) Setting/flag cusub: `auto_send_pin = false` (default)
- Lagu kaydin doono `SharedPreferences` (`auto_send_pin`).
- Default = `false` (auto-fill only).
- Hadii mustaqbalka loo baahdo, mid kale ayaa la furi karaa, laakiin **default-ka waa OFF**.
- Logic-ga: haddii `auto_send_pin == false`, ka boodi click-ka Send button-ka kaliya PIN screens.

### 3) Diagnostics-ka HUD/`KEY_LAST_PIN_DEBUG`
- Ku dar `autoSend=false` iyo `awaitingUserConfirm=true` si aad screen-ka uga aragto in app-ku si ula kac ah u sugayo gacanta user-ka.

### 4) Retry/timeout
- Haddii 60 ilbiriqsi gudahood user-ku riixin Send, mark order-ka `awaiting_user_confirm` si delivery worker uusan u retry gareyn dialog-ka furan.

## Waxa aan la beddelin
- Logic-ga PIN cleaning/`.take(4)` ee hadda jirta way sii socon doontaa.
- Provider routing, SIM selection, iyo bulk SMS flow midna lama taabanayo.
- Confirmation dialogs (Yes/No) wali si automatic ah ayaa loo riixayaa — kaliya PIN entry ayaa user-ka loo daayay.

## Tallaabada Somtel (mustaqbalka)
Codsigaaga labaad (Somtel inuu PIN-ka galiyo tallaabada ugu dambeeysa kadib amount/number) wuxuu u baahan yahay provider flow editor / `ussd_flow_steps` rework. Tani waa qorshe gaar ah oo ka weyn; haddii aad rabto, kadib markaan dhamayno auto-fill-only fix-ka, ayaan u qaadan karnaa qorshe labaad oo gaar ah.

## Farsamada gudaha

```text
Hadda:
PIN dialog -> setText(PIN) -> verify -> clickSend  (khalad halkan)

Cusub:
PIN dialog -> setText(PIN) -> verify -> STOP
            -> HUD: "Riix Send"
            -> sug user-ka
```

Tallaabooyinka rebuild-ka: `scripts/build-android.sh` kadibna `apk-output/iftin-delivery.apk` ayaa cusboonaysiineysa.
