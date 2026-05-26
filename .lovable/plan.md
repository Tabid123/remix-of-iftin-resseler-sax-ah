## Jawaabta tooska ah

Maya — **ma ballan qaadi karo 100%** in hal beddelkan keliya uu si buuxda u tirtirayo `Invalid PIN format` dhammaan Samsung-yada iyo dhammaan dialogs-ka USSD.

## Waxa hadda si cad u muuqda

Ciladdu ma aha oo keliya in PIN-ku muuqdo ama dhererkiisu sax yahay. Dhibaatadu waxay u badan tahay in:

1. `EditText`-ka USSD uu **muujinayo** PIN-ka ama mask-giisa,
2. laakiin Samsung dialog-ku aanu si sax ah ugu **bind-gareyn** qiimaha marka `Send` la riixo,
3. ama mararka qaar fallback-ku uu sababo **duplicate digits** sida `551655` halkii uu ka ahaan lahaa `5516`.

Taasi waxay la jaanqaadaysaa waxa aad sheegtay: mar PIN-ku wuu qaldamaa, marna wuu laba-jibbaarmaa.

## Xalka ugu macquulsan ee xiga

Waxaan qorshaynayaa in la sameeyo hal fix oo bartilmaameed leh:

### 1. PIN write path-ka in la adkeeyo
`writeWithActionSetText()` iyo `writeWithClipboardPaste()` waxaa loo beddeli doonaa hab Samsung-friendly ah:
- marka hore field-ka madhan lagu qoro
- kadib PIN-ka saxda ah lagu qoro
- kadib cursor-ka dhamaadka la geeyo

Ujeedadu waa in Samsung dialog-ku u arko in text-ku dhab ahaan is beddelay, halkii uu ka ahaan lahaa qiime kaliya oo muuqda.

### 2. Submit-ka in la xiro ilaa field-ku dhab ahaan sax noqdo
Ka hor `Send`, guard-ka waxaa lagu adkeyn doonaa inuusan ku ekaan length/mask oo keliya, balse uu xaqiijiyo in field-ka la bartilmaameedsaday aanu ahayn state been-abuur ah.

### 3. Gesture fallback-ka in aan la oggolaan marka EditText jiro
Si looga hortago `551655` noocaas duplication-ka ah, gesture keypad looma oggolaan doono haddii dialog-ku leeyahay editable field dhab ah.

### 4. On-device diagnostics in la ballaariyo
Waxaan isticmaali doonaa snapshot-ka PIN debug ee hadda jira si build-ka xiga uu si cad noogu tuso:
- habka la isticmaalay
- text length-ka dhabta ah
- masked tree length
- field focus/editable state
- sababta submit-ka loo oggolaaday ama loo diiday

## Rajada saxda ah

- **Fursad fiican ayuu leeyahay** inuu xalliyo dhibaatada ugu weyn.
- **Laakiin 100% dammaanad ma aha** ilaa aan ku tijaabino build-ka cusub ee isla Samsung/device-ka dhibaatadu ka dhacday.
- Haddii build-kaas kadib wali qalad jiro, markaas waxaan heli doonaa diagnostics nagu filan oo si hal mar ah u tilmaamaya halka saxda ah ee uu ka jabayo.

## Technical details

File-ka la beegsanayo:
- `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdAccessibilityService.kt`

Qaybaha la hagaajinayo:
- `writeWithActionSetText()`
- `writeWithClipboardPaste()`
- `submitPinOnce()` guard-ka
- `persistPinDebugSnapshot()` si submit-state dheeri ah loo kaydiyo

Wax aanan taabanayn:
- dynamic flow matching logic-ka intiisa kale
- `onServiceConnected()` event config
- web admin UI

## Natiijada la filayo

Marka la implement gareeyo, build-ka cusub wuxuu noqon doonaa midka ugu adag ee ilaa hadda lagu beegsaday `Invalid PIN format`, balse xaqiijinta ugu dambeysa waxay ku xirnaan doontaa tijaabada device-ka dhibaatadu ka dhacdo.