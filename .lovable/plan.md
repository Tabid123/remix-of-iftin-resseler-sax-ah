## Hadafka

Somnet flow-ga (`*825#`) waa la dhaafayaa. Meeshiisa waxaan u rogayaa **Somtel** oo isticmaala `*300#`, doorashada **3** = dir lacag, ka dib **receiver → amount → PIN**. PIN-ka wuxuu sii ahaan doonaa **hard-stop manual** (sida hadda) — user-ka ayaa gacanta ku galiya 4 digits oo riixa Send.

## Isbedelka

### 1) DB: Migration cusub oo wax ka beddesha flow-ga jirta

Faylka jira:
- Flow ID: `a0204e0c-f82e-464a-93ae-eb901422ec39`
- Trigger hadda: `*825#` (Somnet, 5 talaabo)

Migration cusub waxay:
- Cusboonaysiineysa `ussd_flows`-ga:
  - `trigger_code = '*300#'`
  - `flow_name = 'Somtel'` (haddii column-ka uu jiro — UssdFlowsManager wuxuu adeegsadaa)
- Tirtireysa `ussd_flow_steps` hore (5 row) ee flow-gan.
- Geliyaa 4 talaabo cusub oo Somtel ah:

```text
Step 1 — Main menu (xul doorashada 3 = Send Credit)
  match_keywords: ['send credit','transfer','dir','lacag','airtime','select','menu','sii wad','option','xulo']
  response_template: '3'
  is_pin_field: false

Step 2 — Receiver number
  match_keywords: ['receiver','reciver','number','phone','lambar','geli lambar','telefoon','enter number','raac']
  response_template: '{receiver}'
  is_pin_field: false

Step 3 — Amount
  match_keywords: ['amount','lacag','qiimo','wadarta','enter amount','geli lacagta','dollar','mount']
  response_template: '{amount}'
  is_pin_field: false

Step 4 — PIN (HARD STOP — user-ka gacanta ku galiya)
  match_keywords: ['pin','furaha','sirta','password','secret','enter pin','geli pin','fadlan geli pin']
  response_template: '{pin}'
  is_pin_field: true
```

> Step 5 (auto-confirm "1") hadda lagama hayo Somtel — Somtel marka aad gasho PIN-ka sax ah ayuu si toos ah u dhammeysanaayaa, mar danbe haddii loo baahdo confirm step waan ku dari karnaa.

### 2) Provider mapping
`providers_config` row-ga `Somnet` (`d7e33079-…`) hadda ayaa la xidhan flow-gan. Migration-ka isla mid ah waxaan ku:
- Ka saaraya `ussd_flow_id` Somnet provider-ka (`SET ussd_flow_id = NULL WHERE provider_name = 'Somnet'`), si aan Somnet packages u dhicin in si khalad ah loogu diro Somtel `*300#`.
- Haddii row Somtel ah uu ka jiro `providers_config`, waxaan u xidhayaa flow-ga cusub (`UPDATE … SET ussd_flow_id = 'a0204e0c-…' WHERE provider_name = 'Somtel'`). Haddii uusan jirin, lama abuurayo row cusub — admin ayaa UI-ga uga abuuri kara.

### 3) Android automation
Faylka `UssdAccessibilityService.kt` **wax lagama beddelayo**. Hard-stop PIN logic-ga hore u jira ayaa sii shaqaynaaya: marka step-ka `is_pin_field = true` la gaaro, app-ku wuu joojinayaa auto-typing/auto-click, HUD-ka `MANUAL PIN` ayaa muuqanaya, user-kuna gacanta ayuu PIN-ka ku galiyay oo riixay Send.

### 4) Wax aan la taabanayn
- `BalanceManagement.tsx` (EVC send money) lama taabanayo — taasi waa Hormuud `*712*` oo gaar ah, kuma xidhna ussd_flows.
- Hormuud, Jeeb, iyo `payment_providers_config` lama taabanayo.
- UI provider list (`PaymentProviders.tsx`, `ProviderSelection.tsx`) lama taabanayo — Somnet-ka labelka u ah package-yada wuu sii muuqdaa, laakiin automation USSD-ga hadda Somtel `*300#` ayuu adeegsadaa marka flow-ga la xidho.

## Verification
1. Hubi `ussd_flows.trigger_code = '*300#'` iyo 4 talaabo `ussd_flow_steps`-ka ah.
2. Hubi `providers_config.Somnet.ussd_flow_id IS NULL`.
3. Geli dynamic test: USSD dialer-ka ku shido `*300#` → Android-ku waa inuu si toos ah u galiyaa `3`, kadibna receiver, kadibna amount, kadibna **istaago** PIN-ka, HUD `MANUAL PIN` muuqdo, user-kuna gacanta uu PIN-ka galiyo.

## Farsamada gudaha (technical)

- `ussd_flows` ID `a0204e0c-f82e-464a-93ae-eb901422ec39` lama beddelayo (UUID isku mid ah si references aysan u jabin); wax la beddelayaa waa `trigger_code` + steps.
- `UssdFlowsClient.kt` cache-ka 5min ah ayuu haystaa — debug-ka guriga, ku qasab refresh adoo dib u rakibaya app-ka ama sug 5min ka dib migration-ka.
- Cache-key normalization-ka waa `trim().lowercase()`, sidaa `*300#` waa la ogan doonaa marka `current_trigger_code` la set-gareeyo.
