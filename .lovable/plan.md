# Plan

## What I’ll change
1. Update the PIN input path in `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdAccessibilityService.kt` so the editable field is explicitly prepared with both `ACTION_CLICK` and `ACTION_FOCUS` before text entry.
2. Keep `ACTION_SET_TEXT` as the write method, but pass a sanitized PIN using `.trim()` before inserting into the field.
3. Add a short post-write delay (about 150–200ms) immediately after `ACTION_SET_TEXT` so Android has time to register the value before any submit action can run.
4. Tighten the final submit guard so `Send` / `OK` is clicked only when the input field text is non-null and its length exactly matches the expected PIN length; if the field is empty or short, submission is blocked.
5. Rebuild the APK after the code change.

## Expected outcome
- The service will stop submitting when the PIN field is blank or not fully registered.
- The flow will better match Android USSD dialog timing by waiting briefly after text insertion.
- The APK will be regenerated with only this targeted fix applied.

## Technical details
- Target functions are the existing PIN-entry helpers and submit guard around:
  - `safeEnterPin()`
  - `focusEditableField()` / `writeWithActionSetText()`
  - `submitPinOnce()`
- I will keep the change scoped to your requested behavior and avoid unrelated refactors.