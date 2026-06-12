## Goal
1. Dalabka cusub si DEG-DEG ah loo qaado (ma sugin 15 daqiiqo polling) — istcimaal Supabase Realtime WebSocket.
2. USSD-ka oo si qarsoodi ah background-ka uga shaqeeya iyadoo dialer-ka uusan u muuqan macaamiisha — xitaa marka mobile-ku lock yahay.

## Part 1 — Realtime delivery claiming (Android)

**Hadda:** `UssdPollingWorker` waxay shaqaysaa kasta 15 daqiiqo (WorkManager minimum). `UssdDialerService` sidoo kale waxay leedahay handler-polling gudaha ah. Tani waxay keentaa daahitaan weyn.

**Beddel:**
- Ku dar Supabase Realtime client `UssdDialerService` gudaheeda (ku xidh `delivery_queue` table — `INSERT` events where `provider_name` ka mid yahay device providers + `status='pending'`).
- Marka event la helo → isla markaas `claim_next_delivery` RPC u dir (zero delay).
- Ilaali safety fallback polling laakin u beddel 60 ilbiriqsi (oo aysan ahayn 15 daqiiqo) si dalabyada lumay loo soo qabto haddii WebSocket jabto.
- Heartbeat polling (sim balance, etc.) ha taabanin.

**Faylasha la beddelayo:**
- `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdDialerService.kt` — ku dar Realtime listener oo trigger-gareey `processNextDelivery()`.
- `android-app/app/src/main/kotlin/com/iftin/delivery/IftinDeliveryApp.kt` — `UssdPollingWorker` interval kasii 15 daqiiqo (safety net), oo ku dar log cusub.
- `android-app/app/build.gradle.kts` — haddii loo baahdo ku dar `io.github.jan-tennert.supabase:realtime-kt` ama isticmaal raw OkHttp WebSocket → `wss://zshzcuomdegeijqznvvu.supabase.co/realtime/v1/websocket`.

**Database:** Hubi in `delivery_queue` ku jirto `supabase_realtime` publication. Haddii kale, migration cusub:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_queue;
```

## Part 2 — Silent background USSD (hide dialer)

**Hadda:** `UssdAccessibilityService` waxay isticmaashaa `TelephonyManager.sendUssdRequest()` ama `ACTION_CALL` intent oo dialer-ka u furaya — taas oo screen-ka soo bandhigaysa.

**Beddel — Background-only (silent USSD):**
- Isticmaal `TelephonyManager.sendUssdRequest(ussdCode, callback, handler)` API (Android 8.0+) kaas oo USSD u dira iyadoo dialer-ka aan la furin. Response-ka wuxuu ku yimaadaa callback (`UssdResponseCallback.onReceiveUssdResponse`).
- Tani way shaqaysaa xitaa screen lock yahay (service-ku wuxuu hayaa `PARTIAL_WAKE_LOCK` mar hore — la xaqiijinaayo).
- Multi-step USSD flows (sida send money oo PIN u baahan) → isticmaal `sendUssdRequestOnSubscription` oo ku xambaar PIN-ka qaybta hore (mid kasta `*712*phone*amount*PIN#`) si aan loogu baahnayn EditText typing.

**Faylasha la beddelayo:**
- `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdAccessibilityService.kt`:
  - Ku dar `executeUssdSilently(ussdCode, simSlot, callback)` oo isticmaala `TelephonyManager.createForSubscriptionId(subId).sendUssdRequest(...)`.
  - Marka USSD-ku qaadanayo balance check ama send money oo PIN ka mid yahay code-ka → ka tag `ACTION_CALL` dialer flow-ka.
  - Ka reeb dialer-fallback kaliya kaararka aan taageerin `sendUssdRequest` (Android < 8 ama OEM khallad).
- `android-app/app/src/main/AndroidManifest.xml` — xaqiiji `CALL_PHONE`, `READ_PHONE_STATE`, `MODIFY_PHONE_STATE` permissions.
- `BalanceManagement.tsx` (web) — wax ma beddelayno; USSD-ku waa isku mid oo PIN-ka durba waxaa la geeyaa.

**Daah lock screen:**
- `UssdDialerService` mar hore wuxuu leeyahay `PARTIAL_WAKE_LOCK` (memory: Android Persistence). Xaqiiji oo ku dar `FLAG_KEEP_SCREEN_ON` HA loo isticmaalin (waxaynu rabnaa screen-ku xirnaado).
- Marka `sendUssdRequest` la isticmaalo, ma jiraan UI mar walba — kaliya callback.

## Technical Section

**Realtime channel filter:**
```kotlin
// pseudo
realtimeClient.channel("delivery_queue_inserts")
  .on("postgres_changes", filter = "event=INSERT,schema=public,table=delivery_queue,status=eq.pending") {
    processNextDelivery()
  }
```

**Silent USSD (Android 8+):**
```kotlin
val tm = getSystemService(TelephonyManager::class.java)
  .createForSubscriptionId(subIdForSlot(simSlot))
tm.sendUssdRequest(ussdCode, object : TelephonyManager.UssdResponseCallback() {
  override fun onReceiveUssdResponse(tm: TelephonyManager, req: String, resp: CharSequence) {
    handleUssdResponse(queueId, resp.toString())
  }
  override fun onReceiveUssdResponseFailed(tm: TelephonyManager, req: String, failureCode: Int) {
    markFailed(queueId, "USSD failed code=$failureCode")
  }
}, Handler(Looper.getMainLooper()))
```

**Multi-step PIN flow:** USSD-ka send-money waxaa loo qori `*712*61XXXX*0*12*PIN#` (kowaad → PIN tilmaame), si loo helo hal `sendUssdRequest` call oo dialer la'aan ah.

## Risks
- `sendUssdRequest` qaar ka mid ah OEMs (Xiaomi/Huawei) si liidata ayuu ugu shaqeeya — sidaa awgeed waxaynu kaydinaynaa `ACTION_CALL` dialer fallback marka silent uu fashilmo (auto-retry hal jeer).
- Realtime WebSocket egress: postgres_changes events fudud yihiin (~1KB/event) — xadka egress-ka waa lagu jirayaa.