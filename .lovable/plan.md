## Plan

1. Verify `android-app/app/src/main/kotlin/com/iftin/delivery/service/UssdAccessibilityService.kt` in `onServiceConnected()` to confirm `eventTypes` is set to only `AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED`.
2. Make no other source changes unless that exact line is different from the requested value.
3. Rebuild the Android debug APK using the existing Android build workflow/script.
4. Report the build result and, if the APK succeeds but the PIN issue remains, use the fresh build as the baseline for the next targeted PIN-format investigation.

## Technical details

- Target method: `onServiceConnected()` in `UssdAccessibilityService.kt`
- Required runtime setting:
  ```kotlin
  eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
  ```
- Scope guard: no other edits in the file, and no unrelated code changes
- Output: rebuilt APK artifact for retesting the USSD PIN flow