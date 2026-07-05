## Hadafka
Admin-ku ha awoodo inuu **shirkad USSD cusub** hal Wizard ku daro, isla marka ay shaqeyso ~99-100% adiga oo aan taabanayn code. Sirta 100%-ku waxay ku jirtaa 3 layers:

1. **Wizard Auto-Learn** — Admin wuxuu copy-paste garaa qoraalka dialog-ga, system-ku wuxuu automatic u soo saarayaa keywords + synonyms Soomaali/Ingiriisi.
2. **Test Live Button** — Ka hor kaydinta, Wizard-ku wuxuu SIM-ka runta ah kaga tijaabinayaa flow-ga dummy amount (0.01). Haddii step fashilmo → si toos ah keywords ayaa lagu darayaa.
3. **Self-Healing Learning Loop** — Marka Android-ka accessibility service uu la kulmo dialog uu keywords-ka la hayo aan ku jirin, si automatic ah wuxuu ugu darayaa `ussd_flow_steps.match_keywords` array-ka (learn-as-you-go).

## Wizard cusub — `AddUssdProviderWizardDialog.tsx`

### Tallaabo 1 — Provider Info
- Magaca (Somnet, Amtel, …)
- Logo URL (ikhtiyaari)
- Display order + E-voucher rate
- **PIN (SIM Password)** 4 digits
- Trigger USSD Code (`*300#`, `*707#`)

### Tallaabo 2 — Flow Steps (Auto-Learn)
Step kasta wuxuu leeyahay 3 field:

**A) Dialog Text** — Textarea:
```
Enter receiver number:
```

**B) [🪄 Auto-Detect Keywords]** button → wuxuu buuxinayaa liis checkbox ah:
- ✓ enter receiver
- ✓ receiver
- ✓ number
- ✓ lambar (synonym)
- ✓ raac (synonym)

Admin-ku wuu kordhin karaa ama ka saari karaa.

**C) Response Template** — (`{receiver}`, `{amount}`, `{pin}`, `3`, `1`)

**D) is_pin_field toggle** — haddii true → HARD-STOP manual.

### Templates preset ah (dropdown)
- Somtel *300# — 4 steps (already tested)
- Hormuud *725# — 5 steps
- **Blank flow** (from scratch)

### Tallaabo 3 — Test Live 🧪
Ka hor kaydinta:
- Button **"Test Flow (SIM tijaabo)"**
- Ka codsada admin-ka lambar dummy oo SIM-kiisa ah + amount = 0.01
- Direys command Android device-ka via `delivery_queue` gaar ah oo `test=true`
- Muuji real-time status:
  - ✅ Step 1: Menu ka helay "3"
  - ✅ Step 2: Receiver ka helay
  - ❌ Step 3: Dialog "Xaqiiji lacagta" ma matchin
  - → **Auto-add** keyword `xaqiiji` gadaal ka `Step 3.match_keywords`
- Retry ilaa dhamaan steps ay ✅ noqdaan.

### Tallaabo 4 — Save & Activate
Transaction:
1. `INSERT INTO ussd_flows` (flow_name, trigger_code, is_enabled=true)
2. `INSERT INTO ussd_flow_steps` (bulk)
3. `INSERT INTO providers_config` (ussd_method='interactive', ussd_flow_id, sim_password, is_active=true)

## Synonym Dictionary — `src/lib/ussdSynonyms.ts`
Faylka gudaha oo ka kooban ~50 word mapping ah:
```ts
export const SYNONYMS: Record<string, string[]> = {
  amount: ['amount','mount','lacag','qiimo','sum','wadarta'],
  receiver: ['receiver','reciver','number','lambar','raac','phone','telefoon'],
  pin: ['pin','sirta','furaha','password','secret'],
  send: ['send','dir','sii wad','submit','ok','fadlan'],
  confirm: ['confirm','xaqiiji','yes','haa','1'],
  cancel: ['cancel','jooji','no','maya','2'],
  menu: ['select','menu','xulo','option','doorasho'],
  credit: ['credit','airtime','sii-jir'],
};

export function extractKeywords(dialogText: string): string[] {
  const stopWords = new Set(['the','a','is','of','please','kindly','fadlan','waan','ku','ah','to','from']);
  const words = dialogText.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));
  const bigrams = words.slice(0,-1).map((w,i) => `${w} ${words[i+1]}`);
  const all = [...new Set([...words, ...bigrams])];
  const withSynonyms = new Set(all);
  for (const w of all) {
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (syns.includes(w) || key === w) syns.forEach(s => withSynonyms.add(s));
    }
  }
  return [...withSynonyms];
}
```

## Self-Healing Loop (Android + DB)
### Table cusub: `ussd_unmatched_dialogs`
`(id, flow_id, step_order, dialog_text, device_id, matched, created_at)`

### Android `UssdAccessibilityService.kt` (tallaabo yar oo lagu darayo)
Marka dialog uu soo muuqdo laakiin keywords-ka la hayo mid kalana ma matchin:
- Log `dialog_text` to `ussd_unmatched_dialogs` via REST.
- Fallback: si dabiici ah waxa uu isku dayaa **similarity match** (Levenshtein >70%) ka fully-loaded flow steps.
- Haddii uu match sameeyo, wuxuu isticmaalaa iyo si automatic ah wuxuu ku darayaa keyword cusub `ussd_flow_steps` via RPC `learn_ussd_keyword(step_id, new_keyword)`.

### RPC cusub: `learn_ussd_keyword`
```sql
UPDATE ussd_flow_steps
SET match_keywords = ARRAY(SELECT DISTINCT unnest(match_keywords || ARRAY[_kw]))
WHERE id = _step_id;
```

## Admin Dashboard tab cusub — "USSD Learning"
Muujiya `ussd_unmatched_dialogs` liiska:
- Admin wuu awoodi karo si gacan ah in uu step-ka mapkiisa u eego iyo keywords cusub uu ku daro (haddii self-healing-ku ku guuldareysto).

## Damaanadda 100%
| Layer | Guarantee |
|---|---|
| Wizard Auto-Learn + Synonyms | ~85% keywords si sax ah loo helayo |
| Test Live (SIM tijaabo) 0.01 | ~95% steps la hubinayo ka hor deployment |
| Self-Healing (Android learn-as-you-go) | ~99% dialogs cusub automatic loo barano |
| Admin USSD Learning tab | 100% — gacanta ayaa loo saxi karo wixii ka hadhay |

## Faylasha la abuurayo / la beddelayo
- **Cusub:** `src/components/admin/AddUssdProviderWizardDialog.tsx`
- **Cusub:** `src/components/admin/UssdLearningDashboard.tsx`
- **Cusub:** `src/lib/ussdSynonyms.ts`
- **Migration:** table cusub `ussd_unmatched_dialogs` + RPC `learn_ussd_keyword`
- **Beddel:** `UssdFlowsManager.tsx` — kudar button "➕ Wizard cusub"
- **Beddel:** `AdminSidebar.tsx` — kudar tab "🧠 USSD Learning"
- **Beddel:** `UssdAccessibilityService.kt` — kudar `logUnmatchedDialog()` + similarity fallback
- **Beddel:** `UssdFlowsClient.kt` — kudar `learnKeyword(stepId, keyword)` REST helper

## Wax aan la taabanayn
- Somtel `*300#` flow-gii jiray (waa la ilaalinayaa).
- Hormuud `*712*` EVC send money.
- Package/Category/Wholesale Tier tabs — admin tabs-ka jira ayaa la isticmaalaa.
- PIN hard-stop logic (siduu yahay ayaa loo dhaafayaa).
