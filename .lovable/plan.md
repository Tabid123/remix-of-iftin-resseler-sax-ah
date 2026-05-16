# UssdAccessibilityService Refactor — Eliminate "Invalid PIN format"

Goal: **one USSD dialog = one PIN entry = one submit**. Remove all duplicate execution paths in `UssdAccessibilityService.kt`.

> Note: a prior pass of this refactor was already written to the file. This plan re-confirms the architecture so it can be reviewed/approved cleanly. On approval I will verify each item is in place and patch anything missing or weak.

## File touched
- `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdAccessibilityService.kt`
- (light touch only if needed) `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdDialerService.kt` — only to ensure `KEY_LAST_USSD_TIME` is the canonical session token.

## Architecture

### 1. Single execution lock
- `@Volatile var isProcessingDialog: Boolean`
- `onAccessibilityEvent` returns immediately if already true
- Released in a `finally` block so exceptions cannot wedge the service

### 2. Event source filtering
- Process **only `TYPE_WINDOW_STATE_CHANGED`** for PIN/dynamic flow
- `TYPE_WINDOW_CONTENT_CHANGED` ignored (this is what `ACTION_SET_TEXT` echoes back and re-enters the handler)
- AndroidManifest accessibility config keeps both types declared, but runtime drops CONTENT_CHANGED

### 3. SET_TEXT loop suppression
- After every `ACTION_SET_TEXT`, set `setTextSuppressUntilMs = now + 1500ms`
- Any event arriving before that timestamp is ignored with a log line
- Belt-and-suspenders alongside #2 (covers OEMs that re-fire STATE_CHANGED on text writes)

### 4. Session state
Per-session, reset whenever `KEY_LAST_USSD_TIME` changes:
- `ussdSessionToken: Long`
- `pinSetCount`, `submitCount`, `ignoredEventCount`
- `pinFilledForSession: Boolean`
- `pinSubmittedForSession: Boolean`
- `completedFlowSteps: MutableSet<Int>`
- `scheduledSubmitRunnable: Runnable?`

### 5. `safeEnterPin(root, rawPin)`
- Strip non-digits, require length 4 (abort + log otherwise)
- If `pinFilledForSession` is true → skip, log
- Locate single PIN `EditText`; clear existing text first
- Single `ACTION_SET_TEXT` write (never append)
- Set `pinFilledForSession = true`, increment `pinSetCount`, arm SET_TEXT suppression window

### 6. `submitPinOnce(delayMs, source)`
- Cancel any prior `scheduledSubmitRunnable` on the handler
- If `pinSubmittedForSession` true → return, log dup-prevention
- `postDelayed` a single runnable that:
  - re-checks `pinSubmittedForSession`
  - performs the Send/OK click
  - flips `pinSubmittedForSession = true`, increments `submitCount`
  - clears `scheduledSubmitRunnable` in `finally`
- Used by **both** the legacy PIN-dialog branch and dynamic flow PIN steps — single submit codepath

### 7. Dynamic flow protection
- `tryHandleDynamicFlow` consults `completedFlowSteps` and `pinFilledForSession`
- PIN-typed steps route through `safeEnterPin` + `submitPinOnce`
- Non-PIN steps still allow one write per step (tracked in `completedFlowSteps`)
- No `handler.postDelayed` chains can stack: every scheduled action holds the single runnable reference

### 8. Production-safe debug logs
- Event type, package, session token
- Lock acquire/release
- SET_TEXT suppression window hits
- `pinSetCount`, `submitCount`, `ignoredEventCount`
- Completed flow steps
- PIN value **never** logged (only length and masked form)

## Expected result
- One STATE_CHANGED → at most one PIN write → exactly one submit
- CONTENT_CHANGED echoes from `ACTION_SET_TEXT` are dropped
- Delayed handlers cannot overlap (single runnable reference + idempotent flags)
- "Invalid PIN format" caused by double-writes or duplicate submits is eliminated

## Verification after implementation
- Re-grep for `isProcessingDialog`, `safeEnterPin`, `submitPinOnce`, `setTextSuppressUntilMs`, `ussdSessionToken` to confirm they are wired in every PIN/submit path
- Confirm `finally { isProcessingDialog = false }` wraps the full handler
- Confirm there is exactly **one** call site that performs the actual submit click

## Out of scope
- Backend / Supabase changes
- AndroidManifest changes (config already declares both event types; runtime filtering is enough)
- Any UI work
