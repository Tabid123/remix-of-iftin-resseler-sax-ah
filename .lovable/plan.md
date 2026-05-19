## Ujeeddo
Joojinta joogtada ah ee qaladka `Invalid PIN format` marka 4-digit PIN lagu gelinayo USSD dialog-ka Android, iyadoo aan dib loo soo celin duplicate-submit ama re-entry bugs-kii hore.

## Qorshaha
1. **Ka dhigo dialog processing-ku inuu ku shaqeeyo root-ka saxda ah**
   - `tryClickConfirmButton` iyo PIN flow-ka waxaan u wareejin doonaa `rootInActiveWindow` halkii ay kaga tiirsanaan lahaayeen `event.source`.
   - Tani waxay xaqiijinaysaa in service-ku arko EditText-ka saxda ah iyo Send button-ka saxda ah, gaar ahaan Samsung Phone dialogs.

2. **Adkeeyo xulashada field-ka PIN-ka**
   - Waxaan sifayn doonaa `collectEditableFieldCandidates`/`selectBestEditableCandidate` si ay uga reebaan keyboard/IME nodes, hidden nodes, iyo candidates aan prompt-ka la xiriirin.
   - Mudnaanta waxaa la siin doonaa focused EditText-ka prompt-ka ku dhex jira, kadib kan u dhow prompt text-ka iyo Send/Dir button-ka.

3. **Bedelo habka qorista PIN-ka ee editable dialog-ka**
   - Waxaan ka saari doonaa `clearEditableField(ACTION_SET_TEXT="")` ee hadda si indho-la’aan ah u shaqeeya, sababtoo ah wuxuu taaban karaa password field-ka ka hor qorista.
   - Habka cusub wuxuu noqon doonaa: focus/click field -> qorid hab ammaan ah -> re-focus -> dib u xaqiijin.
   - Order-ka qorista waxaan ka dhigi doonaa mid carrier/dialog-friendly: `clipboard_paste` marka hore, kadib `ACTION_SET_TEXT` fallback haddii loo baahdo.

4. **Adkeeyo verify-ga si aan false success loo aqbalin**
   - Verify-gu wuxuu ku koobnaan doonaa field-kii la doortay ama refreshed match-kiisa saxda ah; tree-level ama masked heuristics laguma aamini doono marka EditText jiro.
   - Haddii 4 digits field-ka saxda ah aan lagu helin, submit lama samayn doono.

5. **Xakameeyo submit-ka inuu dhaco marka field-ku dhab ahaan diyaar yahay**
   - `submitPinOnce` wuxuu heli doonaa re-check ka hor click-ga Send: field-ku wali ha ahaado kii saxda ahaa, write-gu ha noqdo verified, focus/visibility-na ha saxnaadaan.
   - Waxaan ku dari doonaa dib-u-eegis gaaban ka hor submit si loo yareeyo xaaladaha ay field-ku focus lumiso kadib write.

6. **Soo bandhigo diagnostics gudaha app-ka**
   - `last_pin_debug_snapshot` oo hadda la keydiyo ayaan ka dhigi doonaa mid laga arki karo `MainActivity` iyo/ama admin view si aan logcat dambe ugu xirnaan.
   - Waxaa la tusi doonaa method-ka la adeegsaday, field la doortay, exactMatch, failure reason, focused/editable/visible state, iyo waqtiga attempt-ka.

7. **Hubin is-waafajin event strategy-ga**
   - XML-ka hadda waa `typeWindowStateChanged` oo keliya, laakiin service-ka Kotlin weli internally ayuu u diiwaan-gashan yahay `TYPE_WINDOW_CONTENT_CHANGED` sidoo kale.
   - Waxaan qorshaha ku dari doonaa in la waafajiyo config-ka iyo runtime strategy-ga si aan re-entry noise loo soo celin, balse aan weli lumin updates-ka muhiimka ah ee dialog-ka.

8. **Dib u dhis APK kadib**
   - Marka isbeddelladaas la sameeyo, APK cusub ayaa la dhisi doonaa si aad isla markiiba ugu tijaabiso device-ka dhibaatadu ka jirto.

## Technical details
- Qaladka hadda u badan wuxuu ka imanayaa isku darka saddex arrimood:
  1. dialog-ka waxaa laga yaabaa in laga qabto subtree khaldan (`event.source`),
  2. field-ka password-ka waxaa si aan ammaan ahayn loo `clear` gareeyaa ka hor qorista,
  3. submit-ka mararka qaar wuxuu ku tiirsan yahay state uu verify-gu si xadidan u xaqiijiyey.
- `normalizePin(...).take(4)` ma aha dhibaatadaada hadda, maadaama aad xaqiijisay PIN-ku inuu yahay 4-digit.
- Beddelka XML keligii xal ma aha, sababtoo ah `onServiceConnected()` weli runtime ahaan ayuu ku daraa `TYPE_WINDOW_CONTENT_CHANGED`.

## Natiijada la filayo
- PIN-ka 4-digit wuxuu geli doonaa EditText-ka saxda ah ee USSD dialog-ka.
- Send lama riixi doono ilaa field-ka saxda ahi dhab ahaan hayo PIN-ka.
- Haddii ay wali dhacdo, gudaha app-ka ayaa laga arki doonaa sababta saxda ah halkii logcat looga baahan lahaa.
- Waxaan heli doonaa APK cusub oo si toos ah loogu tijaabiyo Somtel/Jeeb.