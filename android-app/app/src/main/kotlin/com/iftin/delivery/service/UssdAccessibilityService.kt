package com.iftin.delivery.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Rect
import android.graphics.Color as AndroidColor
import android.graphics.drawable.GradientDrawable
import android.graphics.Path
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView
import android.util.Log
import com.iftin.delivery.api.UssdFlowsClient
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * AccessibilityService to auto-click "OK/Confirm" dialogs on USSD responses
 * 
 * IMPORTANT: User must manually enable this service in:
 * Settings > Accessibility > Installed Services > Iftin Delivery > Enable
 * 
 * Features:
 * - Auto-clicks OK/Confirm/Dismiss buttons on USSD dialogs
 * - Handles multiple consecutive dialogs (Hormuud sends 2-3)
 * - Communicates with SmsReceiver via SharedPreferences
 * - Sends broadcast when clicks complete for UssdDialerService
 * - CAPTURES ALL DIALOG TEXT for delivery_notes
 */
class UssdAccessibilityService : AccessibilityService() {

    private data class EditableFieldCandidate(
        val node: AccessibilityNodeInfo,
        val className: String,
        val viewId: String,
        val bounds: Rect,
        val isFocused: Boolean,
        val isAccessibilityFocused: Boolean,
        val isEditable: Boolean,
        val isEnabled: Boolean,
        val isVisible: Boolean,
        val existingTextLength: Int,
        val isPassword: Boolean
    )

    private data class PinWriteDiagnostics(
        val method: String,
        val totalCandidates: Int,
        val selectedIndex: Int,
        val selectedClassName: String,
        val selectedViewId: String,
        val bounds: Rect,
        val isFocused: Boolean,
        val isAccessibilityFocused: Boolean,
        val isEditable: Boolean,
        val isEnabled: Boolean,
        val isVisible: Boolean,
        val actualValueLength: Int,
        val exactMatch: Boolean,
        val failureReason: String? = null,
        val isPassword: Boolean = false,
        val maskedTreeLength: Int = 0
    )

    companion object {
        private const val TAG = "UssdAccessibility"
        const val ACTION_USSD_CLICK_COMPLETE = "com.iftin.delivery.USSD_CLICK_COMPLETE"
        const val PREFS_NAME = "iftin_ussd_prefs"
        const val KEY_EXPECTING_USSD = "expecting_ussd_dialogs"
        const val KEY_LAST_USSD_TIME = "last_ussd_time"
        const val KEY_LAST_USSD_RESPONSE = "last_ussd_response"
        const val KEY_LAST_USSD_RESPONSE_TIME = "last_ussd_response_time"
        /** Text of the LAST dialog of the session (no input field, only OK) — authoritative result. */
        const val KEY_FINAL_USSD_RESPONSE = "final_ussd_response"
        const val KEY_FINAL_USSD_RESPONSE_TIME = "final_ussd_response_time"
        /** Set by UssdDialerService when a SILENT (TelephonyManager) reply was received. */
        const val KEY_SILENT_RESPONSE_AT = "silent_ussd_response_at"
        const val KEY_USSD_SESSION_ID = "ussd_session_id"  // Session ID to bind responses
        // In-app diagnostics for PIN entry (visible without adb logcat)
        const val KEY_LAST_PIN_DEBUG = "last_pin_debug_snapshot"
        const val KEY_LAST_PIN_DEBUG_TIME = "last_pin_debug_time"
        
        // Button texts to auto-click (Somali and English) - EXPANDED LIST
        private val CONFIRM_BUTTONS = listOf(
            // English
            "ok", "OK", "Ok", "O.K.", "okay", "Okay", "OKAY",
            "yes", "Yes", "YES",
            "confirm", "Confirm", "CONFIRM",
            "send", "Send", "SEND",
            "dismiss", "Dismiss", "DISMISS",
            "cancel", "Cancel", "CANCEL",
            "close", "Close", "CLOSE",
            "done", "Done", "DONE",
            "continue", "Continue", "CONTINUE",
            "next", "Next", "NEXT",
            "accept", "Accept", "ACCEPT",
            "agree", "Agree", "AGREE",
            // Somali - EXPANDED with Haye!
            "haa", "Haa", "HAA",
            "haye", "Haye", "HAYE",           // ← ADDED: Common Somali OK
            "hagaag", "Hagaag", "HAGAAG",     // ← ADDED: "Fine/OK" in Somali
            "xaq", "Xaq", "XAQ",
            "kulan", "Kulan", "KULAN",
            "dhamaad", "Dhamaad", "DHAMAAD",
            "xayn", "Xayn", "XAYN",
            "sii wad", "Sii Wad", "SII WAD",
            "raali", "Raali", "RAALI",
            "ogolow", "Ogolow", "OGOLOW",
            // Symbols & Emojis
            "✓", "✔", "☑", "👍", "🆗"
        )
        
        // USSD-related package names (including Somali carriers and common dialers)
        private val USSD_PACKAGES = listOf(
            // ✅ SIM TOOLKIT - CRITICAL for Hormuud USSD dialogs!
            "com.android.stk",              // Standard SIM Toolkit
            "com.mediatek.stk",             // MediaTek SIM Toolkit
            "com.sec.android.app.stk",      // Samsung SIM Toolkit
            "com.qualcomm.simtoolkit",      // Qualcomm SIM Toolkit
            // Phone/Dialer apps
            "com.android.phone",
            "com.samsung.android.phone",
            "com.android.server.telecom",
            "com.mediatek.phone",
            "com.hormuud.phone",
            "com.somnet.dialer",
            "com.somtel.phone",
            "com.huawei.phone",
            "com.xiaomi.phone",
            "com.oppo.phone",
            "com.vivo.phone",
            // Additional common dialer packages
            "com.google.android.dialer",
            "com.android.incallui",
            "com.samsung.android.incallui",
            "com.sec.android.app.samsungapps",
            "com.lge.phone",
            "com.asus.contacts",
            "com.oneplus.dialer",
            "com.coloros.phone",
            "com.realme.phone"
        )

        /** Text fragments that prove we are reading the launcher, not a USSD dialog. */
        private val LAUNCHER_MARKERS = listOf(
            "double tap and drag", "home screen", "play store", "google search",
            "google app", "voice search", "apps list", "page 1 of", "page 2 of",
            "current page is", "notification shade", "quick settings", "widget"
        )

        fun isPhoneLikePackage(pkg: String): Boolean {
            val p = pkg.lowercase()
            // NOTE: launchers must never match here.
            if (p.contains("launcher") || p.contains("home")) return false
            return p.contains("phone") || p.contains("dialer") || p.contains("stk") ||
                p.contains("toolkit") || p.contains("telecom") || p.contains("incall") ||
                p.contains("ussd") || p.contains("call")
        }

        fun isUssdRelatedPackage(pkg: String): Boolean =
            USSD_PACKAGES.any { pkg.contains(it, ignoreCase = true) } || isPhoneLikePackage(pkg)
        
        // Timeout for expecting USSD flag (30 seconds - INCREASED from 15s)
        private const val EXPECTING_USSD_TIMEOUT_MS = 30000L
        private const val DEBOUNCE_MS = 800L
        private const val CLICK_DELAY_MS = 2200L
        private const val NON_PIN_SUBMIT_DELAY_MS = 3200L
        // Extra wait applied when a scheduled Send finds the input field still empty.
        private const val SUBMIT_RECHECK_DELAY_MS = 1500L

        /** Resource-id fragments that identify the dialer keypad (NOT a USSD dialog). */
        private val DIALPAD_ID_MARKERS = listOf(
            "dialpad", "digits", "keypad", "dialButton", "one", "two", "three",
            "zero", "deleteButton", "searchview"
        )
        private const val MAX_PIN_REWRITE_ATTEMPTS = 2
        private const val MULTI_DIALOG_TIMEOUT_MS = 10000L
    }
    
    private val handler = Handler(Looper.getMainLooper())
    private var clickCount = 0
    private var lastClickTime = 0L
    private var lastDialogFingerprint = ""
    private var multiDialogRunnable: Runnable? = null

    // Session guards to prevent duplicate PIN entry
    @Volatile private var ussdSessionToken = 0L
    @Volatile private var pinFilledForSession = false
    @Volatile private var pinVerifiedForSession = false
    @Volatile private var pinSubmittedForSession = false
    @Volatile private var pinWriteFailedForSession = false
    @Volatile private var pinFieldFocusedForSession = false
    @Volatile private var pinFieldEditableForSession = false
    @Volatile private var lastPinWriteAtMs = 0L
    private var lastPinWriteDiagnostics: PinWriteDiagnostics? = null
    @Volatile private var lastIntendedPinForSession = ""
    @Volatile private var pinRewriteAttempts = 0

    // Track which dynamic flow steps have already been answered in this session
    private val completedFlowSteps = mutableSetOf<Int>()

    // ===== HARDENED EXECUTION GUARDS =====
    // Single in-flight processing lock — only one event handler runs at a time
    @Volatile private var isProcessingDialog = false
    // After ACTION_SET_TEXT we ignore CONTENT_CHANGED echo events for this window
    @Volatile private var setTextSuppressUntilMs = 0L
    // Single scheduled submit Runnable — replaces all parallel postDelayed submits
    private var scheduledSubmitRunnable: Runnable? = null
    // Delayed generic confirm runnable from onAccessibilityEvent.
    // Must be cancellable when a PIN dialog appears.
    private var pendingConfirmRunnable: Runnable? = null
    // Diagnostic counters per session
    @Volatile private var pinSetCount = 0
    @Volatile private var submitCount = 0
    @Volatile private var ignoredEventCount = 0

    // ===== PIN HUD OVERLAY =====
    // Debug-only overlay. Permanently disabled in production builds.
    private val HUD_ENABLED = false
    private var hudView: TextView? = null
    private var hudAttached = false
    private val hudDismissRunnable = Runnable { hidePinHud() }
    private var hudFirstReadLen = -1
    private var hudAttemptCount = 0
    @Volatile private var lastHudShown = false
    @Volatile private var lastHudError: String = ""

    private fun showPinHud(status: String, expected: String, actual: String, method: String, extra: String = "") {
        // HUD DISABLED: the yellow "PIN DEBUG" overlay must never be visible to users.
        // Diagnostics are still written to logcat / SharedPreferences elsewhere.
        if (!HUD_ENABLED) {
            hidePinHud()
            return
        }
        try {
            val wm = getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
            val maskedActual = if (actual.isEmpty()) "<empty>" else actual
            val text = buildString {
                append("🧪 PIN DEBUG\n")
                append("Status: ").append(status).append('\n')
                append("Expected: ").append(expected).append(" (len=").append(expected.length).append(")\n")
                append("Actual:   ").append(maskedActual).append(" (len=").append(actual.length).append(")\n")
                append("Method:   ").append(method)
                if (extra.isNotBlank()) { append('\n').append(extra) }
            }
            handler.post {
                try {
                    if (hudView == null) {
                        val tv = TextView(this)
                        val bg = GradientDrawable().apply {
                            cornerRadius = 18f
                            setColor(AndroidColor.parseColor("#EE000000"))
                            setStroke(3, AndroidColor.parseColor("#FFC107"))
                        }
                        tv.background = bg
                        tv.setPadding(28, 24, 28, 24)
                        tv.setTextColor(AndroidColor.parseColor("#FFEB3B"))
                        tv.textSize = 13f
                        tv.typeface = android.graphics.Typeface.MONOSPACE
                        hudView = tv
                    }
                    hudView?.text = text
                    if (!hudAttached) {
                        // TYPE_ACCESSIBILITY_OVERLAY draws on top of system dialogs (USSD/STK)
                        // and does NOT require SYSTEM_ALERT_WINDOW. The accessibility service
                        // permission alone is sufficient.
                        val type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
                        val lp = WindowManager.LayoutParams(
                            WindowManager.LayoutParams.WRAP_CONTENT,
                            WindowManager.LayoutParams.WRAP_CONTENT,
                            type,
                            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                            android.graphics.PixelFormat.TRANSLUCENT
                        )
                        lp.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                        lp.y = 80
                        wm.addView(hudView, lp)
                        hudAttached = true
                        lastHudShown = true
                        lastHudError = ""
                    }
                    handler.removeCallbacks(hudDismissRunnable)
                    handler.postDelayed(hudDismissRunnable, 8000L)
                } catch (e: Exception) {
                    lastHudShown = false
                    lastHudError = e.javaClass.simpleName + ":" + (e.message ?: "?")
                    Log.w(TAG, "HUD attach failed: ${e.message}")
                    // Fallback: try TYPE_APPLICATION_OVERLAY if accessibility overlay was rejected
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(this@UssdAccessibilityService)) {
                            val lp2 = WindowManager.LayoutParams(
                                WindowManager.LayoutParams.WRAP_CONTENT,
                                WindowManager.LayoutParams.WRAP_CONTENT,
                                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                                android.graphics.PixelFormat.TRANSLUCENT
                            )
                            lp2.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                            lp2.y = 80
                            wm.addView(hudView, lp2)
                            hudAttached = true
                            lastHudShown = true
                            lastHudError = "fallback_app_overlay"
                        }
                    } catch (e2: Exception) {
                        lastHudError = lastHudError + "|fallback:" + (e2.message ?: "?")
                    }
                }
            }
        } catch (e: Exception) {
            lastHudShown = false
            lastHudError = "outer:" + (e.message ?: "?")
            Log.w(TAG, "showPinHud error: ${e.message}")
        }
    }

    private fun hidePinHud() {
        try {
            if (hudAttached && hudView != null) {
                val wm = getSystemService(Context.WINDOW_SERVICE) as? WindowManager
                wm?.removeView(hudView)
            }
        } catch (_: Exception) {}
        hudAttached = false
    }

    private fun resetSessionState(reason: String) {
        pinFilledForSession = false
        pinVerifiedForSession = false
        pinSubmittedForSession = false
        pinWriteFailedForSession = false
        pinFieldFocusedForSession = false
        pinFieldEditableForSession = false
        lastPinWriteAtMs = 0L
        lastPinWriteDiagnostics = null
        lastIntendedPinForSession = ""
        pinRewriteAttempts = 0
        completedFlowSteps.clear()
        cancelPendingAutoActions("session-reset:$reason")
        setTextSuppressUntilMs = 0L
        pinSetCount = 0
        submitCount = 0
        ignoredEventCount = 0
        isProcessingDialog = false
        lastDialogFingerprint = ""
        hudFirstReadLen = -1
        hudAttemptCount = 0
        Log.d(TAG, "♻️ Session state reset ($reason)")
    }

    private fun cancelPendingAutoActions(reason: String) {
        pendingConfirmRunnable?.let { handler.removeCallbacks(it) }
        pendingConfirmRunnable = null
        scheduledSubmitRunnable?.let { handler.removeCallbacks(it) }
        scheduledSubmitRunnable = null
        multiDialogRunnable?.let { handler.removeCallbacks(it) }
        multiDialogRunnable = null
        isProcessingDialog = false
        Log.d(TAG, "🛑 Cancelled pending auto-actions ($reason)")
    }

    /**
     * Schedule a single Send/OK click for the current PIN entry.
     * Idempotent: only one submit per session, cancels any prior scheduled runnable.
     */
    private fun submitPinOnce(delayMs: Long = 300L, source: String) {
        if (pinSubmittedForSession) {
            Log.d(TAG, "🛑 submitPinOnce[$source] ignored — already submitted (submitCount=$submitCount)")
            return
        }
        if (!pinFilledForSession || !pinVerifiedForSession || pinWriteFailedForSession) {
            Log.w(TAG, "✋ submitPinOnce[$source] blocked — PIN not safely verified yet")
            return
        }
        scheduledSubmitRunnable?.let { handler.removeCallbacks(it) }
        val r = Runnable {
            val rt = rootInActiveWindow ?: return@Runnable
            try {
                if (!pinFilledForSession || !pinVerifiedForSession || pinWriteFailedForSession) {
                    Log.w(TAG, "✋ submitPinOnce[$source] aborted at runtime — PIN verification lost")
                    return@Runnable
                }
                // LAST-MILE GUARD (same behaviour as the working Somtel path):
                // re-read the live field right before pressing Send. Some carriers
                // (Somnet/Jeeb) clear or re-render the input after the first write,
                // and sending an empty/partial field produces "Invalid PIN format".
                val expected = lastIntendedPinForSession
                val live = readActivePinFieldText(rt)
                val committed = isPinCommittedInActiveField(rt, expected)
                if (expected.isNotBlank() && !committed) {
                    Log.w(TAG, "🔁 submitPinOnce[$source] field not committed (live='${live.length} chars' expected len=${expected.length}) — rewriting PIN")
                    if (pinRewriteAttempts < MAX_PIN_REWRITE_ATTEMPTS) {
                        pinRewriteAttempts++
                        pinFilledForSession = false
                        pinVerifiedForSession = false
                        pinWriteFailedForSession = false
                        pinSetCount = 0
                        if (safeEnterPin(rt, expected)) {
                            submitPinOnce(delayMs = 1200L, source = "$source-rewrite$pinRewriteAttempts")
                        }
                    } else {
                        // Never click Send on an unreadable/empty field. The previous
                        // deadlock escape submitted anyway and could make Somnet return
                        // "Invalid PIN format" when its dialog silently discarded the
                        // programmatic write.
                        pinWriteFailedForSession = true
                        Log.e(TAG, "❌ submitPinOnce[$source] blocked after $pinRewriteAttempts rewrites — PIN is not visibly committed; Send will NOT be clicked")
                    }
                    return@Runnable
                }
                pinSubmittedForSession = true
                submitCount++
                Log.i(TAG, "✅ submitPinOnce[$source] auto-sending verified PIN (submitCount=$submitCount)")
                clickSendOrOkButton(rt, requiredCommittedValue = expected)
            } finally {
                rt.recycle()
                scheduledSubmitRunnable = null
            }
        }
        scheduledSubmitRunnable = r
        handler.postDelayed(r, delayMs)
    }

    /** Reads the current text of the best editable (PIN) field on screen. */
    private fun readActivePinFieldText(root: AccessibilityNodeInfo): String {
        val candidates = collectEditableFieldCandidates(root)
        try {
            val best = selectBestEditableCandidate(candidates) ?: return ""
            return best.node.text?.toString()?.trim().orEmpty()
        } catch (e: Exception) {
            Log.w(TAG, "readActivePinFieldText error: ${e.message}")
            return ""
        } finally {
            candidates.forEach { try { it.node.recycle() } catch (_: Exception) {} }
        }
    }

    /** Password EditTexts may expose bullets instead of the real digits. */
    private fun isPinCommittedInActiveField(root: AccessibilityNodeInfo, expected: String): Boolean {
        return isValueCommittedInActiveField(root, expected)
    }

    /** True when the active EditText really holds [expected] (or its masked form). */
    private fun isValueCommittedInActiveField(root: AccessibilityNodeInfo, expected: String): Boolean {
        if (expected.isBlank()) return false
        val candidates = collectEditableFieldCandidates(root)
        return try {
            val best = selectBestEditableCandidate(candidates) ?: return false
            try { best.node.refresh() } catch (_: Exception) {}
            val actual = best.node.text?.toString()?.trim().orEmpty()
            val maskedValue = actual.length == expected.length && actual.all { it == '•' || it == '*' }
            // Only trust the selected EditText itself. A masked string elsewhere in
            // the window (debug overlay, stale node, another field) must never unlock
            // Send while the active PIN field is empty.
            actual == expected || maskedValue
        } finally {
            candidates.forEach { try { it.node.recycle() } catch (_: Exception) {} }
        }
    }

    /**
     * Safe PIN entry: validates, clears existing text, writes exact PIN once.
     * Returns true if PIN was successfully written this call.
     */
    private fun safeEnterPin(root: AccessibilityNodeInfo, rawPin: String): Boolean {
        if (pinFilledForSession) {
            Log.d(TAG, "⏭️ safeEnterPin skipped — pin already written this session (pinSetCount=$pinSetCount)")
            return false
        }
        val cleanPin = rawPin.trim().filter { it.isDigit() }.take(4)
        lastIntendedPinForSession = cleanPin
        if (cleanPin.isEmpty() || cleanPin.length != 4) {
            Log.e(TAG, "❌ safeEnterPin aborted — invalid PIN length=${cleanPin.length}")
            return false
        }
        pinWriteFailedForSession = false
        pinFieldFocusedForSession = false
        pinFieldEditableForSession = false
        pinVerifiedForSession = false
        lastPinWriteDiagnostics = null

        val candidates = collectEditableFieldCandidates(root)
        if (candidates.isEmpty()) {
            pinWriteFailedForSession = true
            Log.w(TAG, "⚠️ safeEnterPin — no visible editable field found")
            return false
        }

        logEditableCandidates(candidates)

        val preferred = selectBestEditableCandidate(candidates)
        if (preferred == null) {
            pinWriteFailedForSession = true
            Log.w(TAG, "⚠️ safeEnterPin — no suitable active editable field after filtering")
            candidates.forEach { it.node.recycle() }
            return false
        }

        val selectionIndex = candidates.indexOf(preferred)
        val activePackage = root.packageName?.toString().orEmpty()
        // Detect whether a real editable dialog field is present.
        // If yes — write into the field FIRST (ACTION_SET_TEXT → paste). Gesture taps on
        // dialer/IME digits while the dialog is open send DTMF tones and corrupt the
        // EditText input, which is what produces "Invalid PIN format" from Somtel/Jeeb.
        val hasRealEditableField = candidates.any { it.isVisible && it.isEnabled && it.isEditable }
        val methods = mutableListOf<Pair<String, (AccessibilityNodeInfo, String) -> Boolean>>()
        if (hasRealEditableField) {
            val provider = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString("current_provider", "")
                .orEmpty()
            if (provider.contains("somnet", ignoreCase = true)) {
                methods += "visible_ime_keypad" to { node: AccessibilityNodeInfo, pin: String ->
                    writeWithVisibleImeKeypad(node, pin)
                }
            }
            // Somnet's first PIN dialog visually accepts ACTION_SET_TEXT but its
            // carrier TextWatcher can still receive an empty value. PASTE fires the
            // same input/commit path as user typing; retain SET_TEXT as fallback.
            methods += "clipboard_paste" to { node: AccessibilityNodeInfo, pin: String ->
                writeWithClipboardPaste(node, pin, requireFocus = true)
            }
            methods += "action_set_text" to { node: AccessibilityNodeInfo, pin: String ->
                writeWithActionSetText(node, pin)
            }
            Log.d(TAG, "🧭 PIN path = ${methods.joinToString(" → ") { it.first }} (EditText present, package=$activePackage)")
        } else {
            pinWriteFailedForSession = true
            Log.w(TAG, "⚠️ safeEnterPin — no real editable field available, refusing gesture/click fallback for PIN entry")
            candidates.forEach { it.node.recycle() }
            return false
        }

        var ok = false
        try {
            for ((methodName, writer) in methods) {
                if (methodName == "action_set_text" || methodName == "clipboard_paste" || methodName == "visible_ime_keypad") {
                    val existing = preferred.node.text?.toString().orEmpty()
                    if (existing.isNotEmpty() && existing != cleanPin) {
                        clearEditableField(preferred.node)
                    } else {
                        focusEditableField(preferred.node, requireAccessibilityFocus = true)
                    }
                } else {
                    Log.w(TAG, "⚠️ Unexpected PIN writer '$methodName' skipped")
                    continue
                }
                val wrote = writer(preferred.node, cleanPin)
                val verification = verifyPinFieldValue(
                    root = root,
                    candidate = preferred,
                    method = methodName,
                    intendedPin = cleanPin,
                    totalCandidates = candidates.size,
                    selectedIndex = selectionIndex,
                    writeAttempted = wrote,
                    hasRealEditableField = hasRealEditableField
                )
                lastPinWriteDiagnostics = verification
                logPinWriteDiagnostics(verification)
                persistPinDebugSnapshot(verification, activePackage, hasRealEditableField, candidates.size)
                if (verification.exactMatch) {
                    pinFieldFocusedForSession = verification.isFocused || verification.isAccessibilityFocused
                    pinFieldEditableForSession = verification.isEditable && verification.isEnabled && verification.isVisible
                    pinVerifiedForSession = true
                    ok = true
                    break
                }
            }
        } finally {
            candidates.forEach { it.node.recycle() }
        }
        if (ok) {
            pinFilledForSession = true
            pinSetCount++
            lastPinWriteAtMs = System.currentTimeMillis()
            // Suppress the CONTENT_CHANGED echo from the write action.
            // 1800ms covers both SET_TEXT echo and gesture tap queue + IME settle.
            setTextSuppressUntilMs = System.currentTimeMillis() + 1800L
            Log.d(
                TAG,
                "✅ safeEnterPin wrote and verified PIN (len=${cleanPin.length}, pinSetCount=$pinSetCount, suppress=1800ms, method=${lastPinWriteDiagnostics?.method})"
            )
            showPinHud(
                status = "WRITING ✓",
                expected = cleanPin,
                actual = lastPinWriteDiagnostics?.let { d ->
                    // diagnostics doesn't store text; we just show length match
                    if (d.exactMatch) cleanPin else "len=${d.actualValueLength}"
                } ?: "?",
                method = lastPinWriteDiagnostics?.method ?: "?",
                extra = "pkg=$activePackage candidates=${candidates.size}"
            )
        } else {
            pinWriteFailedForSession = true
            Log.w(TAG, "⚠️ safeEnterPin failed — no input method produced an exact 4-digit match")
            showPinHud(
                status = "WRITE FAIL",
                expected = cleanPin,
                actual = "",
                method = lastPinWriteDiagnostics?.method ?: "?",
                extra = "pkg=$activePackage candidates=${candidates.size} reason=${lastPinWriteDiagnostics?.failureReason ?: "?"}"
            )
        }
        return ok
    }

    private fun collectEditableFieldCandidates(root: AccessibilityNodeInfo): MutableList<EditableFieldCandidate> {
        val results = mutableListOf<EditableFieldCandidate>()
        val screenBounds = Rect(0, 0, resources.displayMetrics.widthPixels, resources.displayMetrics.heightPixels)

        fun walk(node: AccessibilityNodeInfo) {
            try {
                val className = node.className?.toString().orEmpty()
                val isEditableNode = className.contains("EditText", ignoreCase = true) || node.isEditable
                if (isEditableNode) {
                    val bounds = Rect().also { node.getBoundsInScreen(it) }
                    val visible = node.isVisibleToUser && bounds.width() > 0 && bounds.height() > 0 && Rect.intersects(bounds, screenBounds)
                    if (visible && node.isEnabled) {
                        results.add(
                            EditableFieldCandidate(
                                node = AccessibilityNodeInfo.obtain(node),
                                className = className,
                                viewId = node.viewIdResourceName.orEmpty(),
                                bounds = bounds,
                                isFocused = node.isFocused,
                                isAccessibilityFocused = node.isAccessibilityFocused,
                                isEditable = node.isEditable || className.contains("EditText", ignoreCase = true),
                                isEnabled = node.isEnabled,
                                isVisible = visible,
                                existingTextLength = node.text?.length ?: 0,
                                isPassword = try { node.isPassword } catch (_: Exception) { false }
                            )
                        )
                    }
                }

                for (i in 0 until node.childCount) {
                    node.getChild(i)?.let { child ->
                        try {
                            walk(child)
                        } finally {
                            child.recycle()
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error collecting editable candidates: ${e.message}")
            }
        }

        walk(root)
        return results
    }

    private fun logEditableCandidates(candidates: List<EditableFieldCandidate>) {
        Log.d(TAG, "🧮 PIN editable candidates found=${candidates.size}")
        candidates.forEachIndexed { index, candidate ->
            Log.d(
                TAG,
                "🧮 Candidate[$index] class=${candidate.className.ifBlank { "unknown" }} viewId=${candidate.viewId.ifBlank { "n/a" }} " +
                    "visible=${candidate.isVisible} enabled=${candidate.isEnabled} editable=${candidate.isEditable} " +
                    "focused=${candidate.isFocused} a11yFocused=${candidate.isAccessibilityFocused} " +
                    "textLen=${candidate.existingTextLength} password=${candidate.isPassword} bounds=${formatRect(candidate.bounds)}"
            )
        }
    }

    private fun selectBestEditableCandidate(candidates: List<EditableFieldCandidate>): EditableFieldCandidate? {
        return candidates
            .filter { it.isVisible && it.isEnabled && it.isEditable }
            .sortedWith(
                compareByDescending<EditableFieldCandidate> { it.isFocused }
                    .thenByDescending { it.isAccessibilityFocused }
                    .thenByDescending { it.existingTextLength == 0 }
                    .thenBy { it.bounds.top }
                    .thenByDescending { it.bounds.width() * it.bounds.height() }
            )
            .firstOrNull()
    }

    private fun clearEditableField(node: AccessibilityNodeInfo): Boolean {
        focusEditableField(node)
        val clearArgs = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
        }
        val cleared = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, clearArgs)
        Log.d(TAG, "🧹 Clear editable field result=$cleared")
        return cleared
    }

    private fun focusEditableField(node: AccessibilityNodeInfo, requireAccessibilityFocus: Boolean = false): Boolean {
        // Samsung USSD/STK fields may report focus without opening a real input
        // connection. Click the field first, just like a user, before typing.
        val clickResult = try { node.performAction(AccessibilityNodeInfo.ACTION_CLICK) } catch (_: Exception) { false }
        val focusResult = if (node.isFocused) true else node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val a11yResult = if (!requireAccessibilityFocus) node.isAccessibilityFocused else if (node.isAccessibilityFocused) true else node.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        if (clickResult) try { SystemClock.sleep(180L) } catch (_: Exception) {}
        Log.d(TAG, "🎯 focusEditableField click=$clickResult focus=$focusResult a11y=$a11yResult requireA11y=$requireAccessibilityFocus")
        return clickResult || focusResult || a11yResult
    }

    private fun writeWithActionSetText(node: AccessibilityNodeInfo, pin: String): Boolean {
        // ACTION_CLICK is intentionally forbidden for PIN entry. Only focus +
        // ACTION_SET_TEXT are allowed so the user manually presses Send.
        try { if (!node.isFocused) node.performAction(AccessibilityNodeInfo.ACTION_FOCUS) } catch (_: Exception) {}
        focusEditableField(node)
        // Trim any hidden whitespace/newlines from the PIN before insertion.
        val safePin = pin.trim()
        // Samsung-friendly "dirty-loop": first set to empty (forces beforeTextChanged),
        // then set to the PIN (forces onTextChanged + afterTextChanged), then move
        // the cursor to the end. Without the empty pre-step, Samsung's numberPassword
        // EditText accepts ACTION_SET_TEXT but never fires the TextWatcher/KeyListener,
        // so the carrier receives an empty value → "Invalid PIN format".
        val emptyArgs = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
        }
        val clearedOk = try { node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, emptyArgs) } catch (_: Exception) { false }
        try { SystemClock.sleep(40L) } catch (_: Exception) {}

        val args = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, safePin)
        }
        val result = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        // Give Android OS ~180ms to register the characters in the EditText
        // before any verification or submit can fire. Without this, fast
        // submits can race ahead of the TextWatcher and the carrier receives
        // an empty value → "Invalid PIN format".
        try { SystemClock.sleep(180L) } catch (_: Exception) {}

        // Move the cursor to the end so the IME/dialog treats the value as committed.
        try {
            val selArgs = android.os.Bundle().apply {
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, safePin.length)
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, safePin.length)
            }
            node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, selArgs)
        } catch (_: Exception) { /* selection not critical */ }

        Log.d(TAG, "⌨️ PIN write via ACTION_SET_TEXT dirtyLoop cleared=$clearedOk result=$result")
        return result
    }

    /**
     * REAL keypad tap injection via dispatchGesture — appears to the carrier
     * SIM Toolkit as physical key presses, bypassing IME/ACTION_SET_TEXT rejection.
     * Locates dialer keypad number buttons by text ("0".."9") and taps their bounds.
     */
    private fun extractKeypadDigit(value: String?): Char? {
        val trimmed = value?.trim().orEmpty()
        return trimmed.firstOrNull { it.isDigit() }
    }

    private fun resolveGestureTapBounds(node: AccessibilityNodeInfo): Rect {
        val ownBounds = Rect().also { node.getBoundsInScreen(it) }
        val parent = node.parent
        if (parent != null) {
            try {
                if (parent.isVisibleToUser && parent.isClickable) {
                    val parentBounds = Rect().also { parent.getBoundsInScreen(it) }
                    if (parentBounds.width() * parentBounds.height() > ownBounds.width() * ownBounds.height()) {
                        return parentBounds
                    }
                }
            } finally {
                parent.recycle()
            }
        }
        return ownBounds
    }

    private fun dispatchGestureKeypad(root: AccessibilityNodeInfo, pin: String): Boolean {
        val keyNodes = mutableMapOf<Char, Rect>()
        for (digit in '0'..'9') {
            val matches = root.findAccessibilityNodeInfosByText(digit.toString()) ?: continue
            for (n in matches) {
                try {
                    val matchedDigit = extractKeypadDigit(n.text?.toString()) ?: extractKeypadDigit(n.contentDescription?.toString())
                    if (matchedDigit == digit) {
                        val b = resolveGestureTapBounds(n)
                        if (b.width() > 30 && b.height() > 30 && n.isVisibleToUser) {
                            // Prefer the largest tappable node (keypad button, not label)
                            val prev = keyNodes[digit]
                            if (prev == null || (b.width() * b.height()) > (prev.width() * prev.height())) {
                                keyNodes[digit] = b
                            }
                        }
                    }
                } finally { n.recycle() }
            }
        }
        // Need every digit of the PIN mapped to a keypad button
        val missing = pin.toSet().filter { keyNodes[it] == null }
        if (missing.isNotEmpty()) {
            Log.w(TAG, "🎮 dispatchGestureKeypad — missing keypad nodes for digits=$missing (found=${keyNodes.keys})")
            return false
        }
        val builder = GestureDescription.Builder()
        val interDigitDelayMs = 180L
        val strokeDurationMs = 70L
        for ((i, digit) in pin.withIndex()) {
            val b = keyNodes[digit] ?: return false
            val cx = b.exactCenterX()
            val cy = b.exactCenterY()
            val path = Path().apply { moveTo(cx, cy) }
            val startTime = i * interDigitDelayMs
            builder.addStroke(GestureDescription.StrokeDescription(path, startTime, strokeDurationMs))
            Log.d(TAG, "🎮 Queued gesture tap digit='$digit' idx=$i at ($cx,$cy) start=${startTime}ms")
        }
        val gesture = builder.build()
        val dispatched = dispatchGesture(gesture, null, null)
        Log.d(TAG, "🎮 dispatchGestureKeypad sent single multi-stroke gesture dispatched=$dispatched digits=${pin.length}")
        if (dispatched) {
            val settleDelay = (pin.length * interDigitDelayMs) + strokeDurationMs + 220L
            SystemClock.sleep(settleDelay)
        }
        return dispatched
    }

    /**
     * Type through the visible Android numeric keyboard. Somnet's first PIN dialog
     * can ignore SET_TEXT/PASTE even when Accessibility reports success; real IME
     * taps use the same input path as manual typing.
     */
    private fun writeWithVisibleImeKeypad(node: AccessibilityNodeInfo, pin: String): Boolean {
        clearEditableField(node)
        focusEditableField(node, requireAccessibilityFocus = true)
        try { SystemClock.sleep(350L) } catch (_: Exception) {}

        val imeRoots = windows
            .filter { it.type == android.view.accessibility.AccessibilityWindowInfo.TYPE_INPUT_METHOD }
            .mapNotNull { window -> try { window.root } catch (_: Exception) { null } }
        if (imeRoots.isEmpty()) {
            Log.w(TAG, "🎹 Somnet IME keypad not visible after clicking PIN field")
            return false
        }
        return try {
            imeRoots.any { imeRoot -> dispatchGestureKeypad(imeRoot, pin) }
        } finally {
            imeRoots.forEach { try { it.recycle() } catch (_: Exception) {} }
        }
    }

    private fun writeWithClipboardPaste(node: AccessibilityNodeInfo, pin: String, requireFocus: Boolean): Boolean {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        if (clipboard == null) {
            Log.w(TAG, "📋 Clipboard unavailable for PIN paste")
            return false
        }
        focusEditableField(node, requireAccessibilityFocus = requireFocus)
        clipboard.setPrimaryClip(ClipData.newPlainText("ussd-pin", pin))

        val pasteSupported = node.actionList.any { it.id == AccessibilityNodeInfo.ACTION_PASTE }
        val pasteResult = if (pasteSupported) node.performAction(AccessibilityNodeInfo.ACTION_PASTE) else false
        // After paste, verify length. If the field still doesn't reflect the PIN,
        // fall back to the dirty-loop SET_TEXT path so the TextWatcher fires.
        try { SystemClock.sleep(60L) } catch (_: Exception) {}
        try { node.refresh() } catch (_: Exception) {}
        val pastedLen = node.text?.toString()?.length ?: 0
        val pasteOk = pasteResult && pastedLen == pin.length
        if (pasteOk) {
            try {
                val selArgs = android.os.Bundle().apply {
                    putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, pin.length)
                    putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, pin.length)
                }
                node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, selArgs)
            } catch (_: Exception) {}
            Log.d(TAG, "📋 PIN paste OK requireFocus=$requireFocus len=$pastedLen")
            return true
        }
        Log.w(TAG, "📋 PIN paste insufficient (supported=$pasteSupported result=$pasteResult len=$pastedLen) — falling back to SET_TEXT dirty-loop")
        return writeWithActionSetText(node, pin)
    }

    private fun findMaskedPinLengthInTree(node: AccessibilityNodeInfo?): Int {
        if (node == null) return 0
        var maxMaskedLength = 0
        try {
            val text = node.text?.toString().orEmpty()
            val contentDesc = node.contentDescription?.toString().orEmpty()
            val values = listOf(text, contentDesc)
            values.forEach { value ->
                val trimmed = value.trim()
                if (trimmed.isNotEmpty() && trimmed.all { it == '•' || it == '*' }) {
                    maxMaskedLength = maxOf(maxMaskedLength, trimmed.length)
                }
            }

            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    try {
                        maxMaskedLength = maxOf(maxMaskedLength, findMaskedPinLengthInTree(child))
                    } finally {
                        child.recycle()
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Masked PIN tree scan failed: ${e.message}")
        }
        return maxMaskedLength
    }

    // (writeCharacterByCharacter / writeWithKeyEventSimulation removed —
    //  both were ACTION_SET_TEXT variants that Somtel rejects as "Invalid PIN format".)

    private fun verifyPinFieldValue(
        root: AccessibilityNodeInfo,
        candidate: EditableFieldCandidate,
        method: String,
        intendedPin: String,
        totalCandidates: Int,
        selectedIndex: Int,
        writeAttempted: Boolean,
        hasRealEditableField: Boolean = true
    ): PinWriteDiagnostics {
        val freshCandidates = collectEditableFieldCandidates(root)
        var resolvedClassName = candidate.node.className?.toString().orEmpty()
        var resolvedViewId = candidate.node.viewIdResourceName.orEmpty()
        var resolvedBounds = Rect().also { candidate.node.getBoundsInScreen(it) }
        var resolvedFocused = candidate.node.isFocused
        var resolvedA11yFocused = candidate.node.isAccessibilityFocused
        var resolvedEditable = candidate.node.isEditable || (candidate.node.className?.toString()?.contains("EditText", ignoreCase = true) == true)
        var resolvedEnabled = candidate.node.isEnabled
        var resolvedVisible = candidate.node.isVisibleToUser
        var refreshed = try { candidate.node.refresh() } catch (_: Exception) { false }
        var actual = candidate.node.text?.toString().orEmpty()

        try {
            val refreshedCandidate = freshCandidates
                .sortedWith(
                    compareByDescending<EditableFieldCandidate> { candidate.viewId.isNotBlank() && it.viewId == candidate.viewId }
                        .thenByDescending { Rect.intersects(it.bounds, candidate.bounds) }
                        .thenByDescending { it.isFocused }
                        .thenByDescending { it.isAccessibilityFocused }
                        .thenBy { kotlin.math.abs(it.bounds.top - candidate.bounds.top) }
                )
                .firstOrNull()

            if (refreshedCandidate != null) {
                refreshed = try { refreshedCandidate.node.refresh() } catch (_: Exception) { false }
                actual = refreshedCandidate.node.text?.toString().orEmpty()
                resolvedClassName = refreshedCandidate.node.className?.toString().orEmpty()
                resolvedViewId = refreshedCandidate.node.viewIdResourceName.orEmpty()
                resolvedBounds = Rect().also { refreshedCandidate.node.getBoundsInScreen(it) }
                resolvedFocused = refreshedCandidate.node.isFocused
                resolvedA11yFocused = refreshedCandidate.node.isAccessibilityFocused
                resolvedEditable = refreshedCandidate.node.isEditable || (refreshedCandidate.node.className?.toString()?.contains("EditText", ignoreCase = true) == true)
                resolvedEnabled = refreshedCandidate.node.isEnabled
                resolvedVisible = refreshedCandidate.node.isVisibleToUser
            }
        } finally {
            freshCandidates.forEach { it.node.recycle() }
        }

        // Masked-text match is ONLY trusted when no real editable field exists
        // (pure dialpad screen). When a dialog EditText is present, we require exact
        // digit match in the selected field — otherwise Somtel/Jeeb returns
        // "Invalid PIN format" because the visible field never received the PIN.
        // For password fields the Accessibility API often returns empty/masked text by
        // design (Android intentionally hides the value). We MUST trust length-based
        // signals in those cases, otherwise the field looks empty and Send is blocked
        // forever — leading to repeated "Invalid PIN format" loops.
        val isPasswordField = try { candidate.node.isPassword } catch (_: Exception) { false }
        val maskedTreeLength = findMaskedPinLengthInTree(root)
        val maskedSelected = actual.isNotEmpty() && actual.all { it == '•' || it == '*' } && actual.length == intendedPin.length
        val exactDigitMatch = actual == intendedPin
        val selectedPasswordLengthOk = isPasswordField && actual.length == intendedPin.length && actual.isNotBlank()
        val exactMatch = writeAttempted && (exactDigitMatch || maskedSelected || selectedPasswordLengthOk)

        return PinWriteDiagnostics(
            method = method,
            totalCandidates = totalCandidates,
            selectedIndex = selectedIndex,
            selectedClassName = resolvedClassName,
            selectedViewId = resolvedViewId,
            bounds = resolvedBounds,
            isFocused = resolvedFocused,
            isAccessibilityFocused = resolvedA11yFocused,
            isEditable = resolvedEditable,
            isEnabled = resolvedEnabled,
            isVisible = resolvedVisible,
            actualValueLength = actual.length,
            exactMatch = exactMatch,
            failureReason = when {
                !writeAttempted -> "write_action_failed"
                !refreshed -> "refresh_failed"
                !exactMatch -> "value_mismatch_len:${actual.length}:maskedTree=$maskedTreeLength"
                else -> null
            },
            isPassword = isPasswordField,
            maskedTreeLength = maskedTreeLength
        )
    }

    /**
     * Persist a compact PIN diagnostic snapshot to SharedPreferences so the user can
     * inspect what happened on the device without needing adb logcat. The snapshot
     * is overwritten on every PIN attempt.
     */
    private fun persistPinDebugSnapshot(
        diagnostics: PinWriteDiagnostics,
        activePackage: String,
        hasRealEditableField: Boolean,
        candidateCount: Int
    ) {
        try {
            val snapshot = buildString {
                append("ts=").append(System.currentTimeMillis()).append('\n')
                append("pkg=").append(activePackage).append('\n')
                append("editableFieldPresent=").append(hasRealEditableField).append('\n')
                append("candidates=").append(candidateCount).append('\n')
                append("method=").append(diagnostics.method).append('\n')
                append("selectedClass=").append(diagnostics.selectedClassName).append('\n')
                append("selectedViewId=").append(diagnostics.selectedViewId.ifBlank { "n/a" }).append('\n')
                append("focused=").append(diagnostics.isFocused).append('\n')
                append("a11yFocused=").append(diagnostics.isAccessibilityFocused).append('\n')
                append("editable=").append(diagnostics.isEditable).append('\n')
                append("enabled=").append(diagnostics.isEnabled).append('\n')
                append("visible=").append(diagnostics.isVisible).append('\n')
                append("isPassword=").append(diagnostics.isPassword).append('\n')
                append("maskedTreeLen=").append(diagnostics.maskedTreeLength).append('\n')
                append("actualLen=").append(diagnostics.actualValueLength).append('\n')
                append("exactMatch=").append(diagnostics.exactMatch).append('\n')
                append("hudShown=").append(lastHudShown).append('\n')
                append("hudError=").append(lastHudError.ifBlank { "none" }).append('\n')
                append("intendedPin=").append(lastIntendedPinForSession).append('\n')
                append("failure=").append(diagnostics.failureReason ?: "none")
            }
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_LAST_PIN_DEBUG, snapshot)
                .putLong(KEY_LAST_PIN_DEBUG_TIME, System.currentTimeMillis())
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to persist PIN debug snapshot: ${e.message}")
        }
    }

    private fun logPinWriteDiagnostics(diagnostics: PinWriteDiagnostics) {
        Log.d(
            TAG,
            "🧪 PIN diagnostics method=${diagnostics.method} candidates=${diagnostics.totalCandidates} selected=${diagnostics.selectedIndex} " +
                "class=${diagnostics.selectedClassName.ifBlank { "unknown" }} viewId=${diagnostics.selectedViewId.ifBlank { "n/a" }} " +
                "visible=${diagnostics.isVisible} enabled=${diagnostics.isEnabled} editable=${diagnostics.isEditable} " +
                "focused=${diagnostics.isFocused} a11yFocused=${diagnostics.isAccessibilityFocused} valueLen=${diagnostics.actualValueLength} " +
                "exactMatch=${diagnostics.exactMatch} bounds=${formatRect(diagnostics.bounds)} failure=${diagnostics.failureReason ?: "none"}"
        )
    }

    private fun formatRect(rect: Rect): String = "[${rect.left},${rect.top},${rect.right},${rect.bottom}]"

    private fun isPinPromptText(dialogText: String?): Boolean {
        val raw = dialogText.orEmpty()
        if (raw.isBlank()) return false

        val lower = raw.lowercase()
        val normalized = raw
            .lowercase()
            .replace(Regex("\\s+"), " ")
            .trim()

        val exactPromptMatch = normalized.contains("fadlan geli pin-kaaga") ||
            normalized.contains("enter pin")

        if (exactPromptMatch) {
            Log.i(TAG, "🔐 Exact PIN prompt detected — forcing hard stop for manual PIN entry")
            return true
        }

        // If the dialog is a numbered menu list (e.g. "1. Reseller  2. Transfer  ...
        // 5. Change Password"), treat it as a menu — NOT a PIN prompt — even if it
        // happens to mention "password" or "pin" as an option label.
        if (looksLikeNumberedMenu(raw)) {
            return false
        }

        return lower.contains("pin") ||
            lower.contains("password") ||
            lower.contains("furaha")
    }

    private fun looksLikeNumberedMenu(text: String): Boolean {
        if (text.isBlank()) return false
        // Count occurrences of "1." / "2)" etc. — 2+ means it's a menu list.
        val matches = Regex("(?m)(?:^|\\s)[1-9][.)]\\s+\\S").findAll(text).count()
        return matches >= 2
    }

    private fun matchesPendingPinFlowStep(dialogText: String?): Boolean {
        if (dialogText.isNullOrBlank()) return false
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val flowId = prefs.getString("current_ussd_flow_id", null)
        val trigger = prefs.getString("current_trigger_code", null)
        val flow = try {
            UssdFlowsClient.findFlowById(flowId) ?: UssdFlowsClient.findFlowForTrigger(trigger)
        } catch (e: Exception) {
            Log.e(TAG, "PIN flow lookup error: ${e.message}")
            null
        } ?: return false

        val lower = dialogText.lowercase()
        val pendingStep = flow.steps.firstOrNull { step ->
            step.order !in completedFlowSteps &&
                step.keywords.isNotEmpty() &&
                step.keywords.any { kw -> lower.contains(kw.lowercase()) }
        }

        return pendingStep?.isPinField == true
    }

    private fun hasStoredPinForAutoEntry(): Boolean {
        val pin = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString("current_pin_code", "")
            .orEmpty()
            .trim()
        return pin.length == 4 && pin.all { it.isDigit() }
    }

    private fun matchesConfiguredPinFlowStep(dialogText: String?): Boolean {
        if (dialogText.isNullOrBlank()) return false
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val flowId = prefs.getString("current_ussd_flow_id", null)
        val trigger = prefs.getString("current_trigger_code", null)
        val flow = try {
            UssdFlowsClient.findFlowById(flowId) ?: UssdFlowsClient.findFlowForTrigger(trigger)
        } catch (e: Exception) {
            Log.e(TAG, "Configured PIN flow lookup error: ${e.message}")
            null
        } ?: return false

        val lower = dialogText.lowercase()
        return flow.steps.any { step ->
            step.isPinField &&
                step.keywords.isNotEmpty() &&
                step.keywords.any { kw -> lower.contains(kw.lowercase()) }
        }
    }

    private fun shouldHardStopForPinStage(root: AccessibilityNodeInfo?, dialogText: String?): Boolean {
        val resolvedText = dialogText?.takeIf { it.isNotBlank() } ?: root?.let { extractDialogText(it) }
        if (looksLikeNumberedMenu(resolvedText.orEmpty())) return false
        if (matchesConfiguredPinFlowStep(resolvedText) && hasStoredPinForAutoEntry()) {
            Log.i(TAG, "🔓 Configured PIN flow detected — skipping hard stop so auto PIN can run")
            return false
        }
        if (isPinPromptText(resolvedText)) return true
        return matchesPendingPinFlowStep(resolvedText)
    }

    private fun shouldBypassPinHardStop(dialogText: String?): Boolean {
        if (!pinFilledForSession || !pinVerifiedForSession || pinWriteFailedForSession) return false
        val normalized = dialogText.orEmpty().lowercase()
        return normalized.isBlank() ||
            normalized.contains("pin") ||
            normalized.contains("password") ||
            normalized.contains("furaha") ||
            lastIntendedPinForSession.isNotBlank()
    }

    private fun engagePinHardStop(dialogText: String?) {
        cancelPendingAutoActions("pin-hard-stop")
        Log.i(TAG, "✋ PIN hard stop active — accessibility service will not type or click on this dialog")
        showPinHud(
            status = "MANUAL PIN",
            expected = "",
            actual = "",
            method = "hard_stop",
            extra = "pinHardStop=true autoInput=false autoClick=false userMustTypeAndSend=true"
        )
        if (!dialogText.isNullOrBlank()) {
            Log.d(TAG, "🔐 Hard-stop PIN dialog snapshot: ${dialogText.take(200)}")
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        
        Log.d(TAG, "✅ UssdAccessibilityService connected and active")
        
        // Configure service - NO packageNames filter to listen to ALL apps
        val info = AccessibilityServiceInfo().apply {
            // Listen to both STATE_CHANGED and WINDOW_CONTENT_CHANGED.
            // Some carriers render the next USSD step by updating the same dialog
            // instead of opening a brand-new window, so receiver/amount prompts only
            // arrive as content changes.
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                   AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                   AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 10  // FASTER: 10ms instead of 50ms
            
            // REMOVED: packageNames filter - now listens to ALL apps for USSD dialogs
        }
        
        serviceInfo = info
        UssdFlowsClient.warmCacheAsync()
        Log.d(TAG, "🎯 Listening to ALL apps for USSD dialogs (no package filter)")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val packageName = event.packageName?.toString() ?: return

        // Check if we're expecting USSD dialogs (set by SmsReceiver)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val expectingUssd = prefs.getBoolean(KEY_EXPECTING_USSD, false)
        val lastUssdTime = prefs.getLong(KEY_LAST_USSD_TIME, 0)

        // Auto-reset expecting flag after timeout
        if (expectingUssd && System.currentTimeMillis() - lastUssdTime > EXPECTING_USSD_TIMEOUT_MS) {
            prefs.edit().putBoolean(KEY_EXPECTING_USSD, false).apply()
            ussdSessionToken = 0L
            resetSessionState("timeout")
            return
        }

        // New USSD session started: reset one-time PIN guards
        if (expectingUssd && lastUssdTime != 0L && lastUssdTime != ussdSessionToken) {
            ussdSessionToken = lastUssdTime
            resetSessionState("new-session token=$ussdSessionToken")
            Log.d(TAG, "🆕 New USSD session detected token=$ussdSessionToken")
        }

        // Check if event is from a phone/dialer-related app
        val isUssdPackage = USSD_PACKAGES.any { packageName.contains(it, ignoreCase = true) }
        val isPhonePackage = isPhoneLikePackage(packageName)

        if (!expectingUssd) {
            ussdSessionToken = 0L
            return
        }

        if (!isUssdPackage && !isPhonePackage) return

        // ===== HARDENED EVENT FILTERING =====
        // 1. Process only USSD dialog transitions we care about.
        val isRelevantEvent = event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        if (!isRelevantEvent) {
            ignoredEventCount++
            if (ignoredEventCount % 10 == 1) {
                Log.d(TAG, "🚫 Ignoring non-STATE event type=${event.eventType} (total ignored=$ignoredEventCount)")
            }
            return
        }

        val pinCheckRoot = rootInActiveWindow
        val eventDialogText = event.text
            ?.mapNotNull { it?.toString() }
            ?.joinToString(" | ")
            ?.takeIf { it.isNotBlank() }
            ?: pinCheckRoot?.let { extractDialogText(it) }
        val dialogFingerprint = eventDialogText
            ?.lowercase()
            ?.replace(Regex("\\s+"), " ")
            ?.take(220)
            .orEmpty()

        if (shouldHardStopForPinStage(pinCheckRoot, eventDialogText) && !shouldBypassPinHardStop(eventDialogText)) {
            cancelPendingAutoActions("onAccessibilityEvent-pin-top")
            if (!eventDialogText.isNullOrBlank()) {
                saveUssdResponse(eventDialogText)
            }
            engagePinHardStop(eventDialogText)
            pinCheckRoot?.recycle()
            return
        }
        pinCheckRoot?.recycle()

        // 2. SET_TEXT suppression is only for content echoes caused by our own write.
        // Real carrier navigation to the next USSD page must still be handled.
        val now = System.currentTimeMillis()
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED && now < setTextSuppressUntilMs) {
            Log.d(TAG, "🤫 SET_TEXT suppression active (${setTextSuppressUntilMs - now}ms left) — ignoring content echo")
            return
        }

        // 3. Debounce
        if (now - lastClickTime < DEBOUNCE_MS && dialogFingerprint.isNotBlank() && dialogFingerprint == lastDialogFingerprint) {
            Log.d(TAG, "⏳ Debounce: ignoring event (${now - lastClickTime}ms since last click)")
            return
        }
        if (dialogFingerprint.isNotBlank()) {
            lastDialogFingerprint = dialogFingerprint
        }

        // 4. Single in-flight processing lock
        if (isProcessingDialog) {
            Log.d(TAG, "🔒 Processing lock busy — ignoring re-entrant event from $packageName")
            return
        }
        isProcessingDialog = true

        Log.d(TAG, "📱 STATE event from $packageName session=$ussdSessionToken pinSet=$pinSetCount submit=$submitCount")

        pendingConfirmRunnable?.let { handler.removeCallbacks(it) }
        val confirmRunnable = Runnable {
            try {
                tryClickConfirmButton(event)
            } catch (e: Exception) {
                Log.e(TAG, "❌ tryClickConfirmButton crashed: ${e.message}")
            } finally {
                pendingConfirmRunnable = null
                isProcessingDialog = false
            }
        }
        pendingConfirmRunnable = confirmRunnable
        handler.postDelayed(confirmRunnable, CLICK_DELAY_MS)
    }

    private fun tryClickConfirmButton(event: AccessibilityEvent) {
        try {
            // IMPORTANT: prefer rootInActiveWindow because this runs inside a
            // postDelayed runnable — by the time we execute, the original
            // AccessibilityEvent has usually been recycled by the framework
            // and event.source returns an unsealed/recycled node which throws
            // "Cannot perform this action on a not sealed instance".
            val source = rootInActiveWindow ?: try { event.source } catch (_: Exception) { null } ?: return
            if (!source.refresh()) {
                Log.d(TAG, "⚠️ source.refresh() returned false — node may be stale")
            }

            // The dialog may already be gone by the time this delayed runnable fires.
            // If the active window now belongs to the launcher (or any non-phone app),
            // do NOT read it — otherwise we capture the home screen as the USSD reply.
            val activePkg = source.packageName?.toString().orEmpty()
            if (activePkg.isNotBlank() && !isUssdRelatedPackage(activePkg)) {
                Log.d(TAG, "🚪 Active window is '$activePkg' (not a USSD/phone app) — skipping capture")
                source.recycle()
                return
            }

            // HARD GUARD: only act when a real USSD dialog is on screen.
            // Without this the service types flow answers into the dialer keypad
            // (e.g. "001" left in the dial pad) or presses Send on an empty screen.
            if (!isRealUssdDialog(source)) {
                Log.i(TAG, "🛑 No real USSD dialog on screen (pkg=$activePkg) — no typing / no clicking")
                source.recycle()
                return
            }
            
            // CAPTURE ALL DIALOG TEXT FIRST - before any filtering
            val dialogText = extractDialogText(source)
            
            // ALWAYS save dialog text if not empty - for delivery_notes
            if (!dialogText.isNullOrBlank()) {
                Log.d(TAG, "📝 Dialog text captured: ${dialogText.take(200)}")
                saveUssdResponse(dialogText, isFinal = isTerminalResultDialog(source, dialogText))
            }

            // ===== TERMINAL RESULT DIALOG =====
            // No editable field => carrier is only showing the outcome. Store it as
            // the authoritative FINAL result and dismiss it with OK/Close so the
            // session ends cleanly (no lingering dialog, no stale intermediate text).
            if (isTerminalResultDialog(source, dialogText)) {
                if (!dialogText.isNullOrBlank()) {
                    saveUssdResponse(dialogText, isFinal = true)
                }
                val dismissed = clickTerminalDismissButton(source)
                Log.i(TAG, "🏁 Terminal USSD result dialog handled (dismissed=$dismissed)")
                if (dismissed) {
                    resetSessionState("terminal_result_dialog")
                } else {
                    retryTerminalDismiss(attempt = 1)
                }
                source.recycle()
                return
            }

            val hardStopRoot = rootInActiveWindow ?: source
            if (shouldHardStopForPinStage(hardStopRoot, dialogText) && !shouldBypassPinHardStop(dialogText)) {
                if (!dialogText.isNullOrBlank()) {
                    saveUssdResponse(dialogText)
                }
                engagePinHardStop(dialogText)
                if (hardStopRoot !== source) hardStopRoot.recycle()
                source.recycle()
                return
            }

            // ===== DYNAMIC USSD FLOW HANDLER =====
            // Try to match the current dialog against admin-defined ussd_flow_steps.
            // If a step matches, type the response_template and submit — overrides legacy logic.
            if (!dialogText.isNullOrBlank() && tryHandleDynamicFlow(source, dialogText)) {
                source.recycle()
                return
            }
            
            // Hard-stop generic auto-confirm on PIN/input dialogs. Without this,
            // a carrier dialog can evade the simple text matcher above and the
            // generic Send/OK loop below would still press Send after we filled.
            val rootForGuard = rootInActiveWindow ?: source
            if (shouldSuppressAutoClickForDialog(rootForGuard, dialogText)) {
                Log.i(TAG, "✋ Generic confirm suppressed — PIN/input dialog awaiting manual Send")
                showPinHud(
                    status = "FILLED — press Send",
                    expected = lastIntendedPinForSession,
                    actual = "",
                    method = lastPinWriteDiagnostics?.method ?: "none",
                    extra = "genericConfirmSuppressed=true awaitingUserConfirm=true"
                )
                if (rootForGuard !== source) rootForGuard.recycle()
                source.recycle()
                return
            }

            // Search only for dismiss/continuation buttons here. Submit buttons such
            // as Send/Confirm are owned exclusively by the verified flow scheduler;
            // allowing this generic event path to click them can submit an empty field.
            for (buttonText in CONFIRM_BUTTONS) {
                if (isSubmitButtonLabel(buttonText)) continue
                val nodes = source.findAccessibilityNodeInfosByText(buttonText)
                
                for (node in nodes) {
                    if (isClickableButton(node)) {
                        val nodeText = node.text?.toString() ?: buttonText
                        Log.d(TAG, "🎯 Found button: '$nodeText' - clicking...")
                        
                        val clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        
                        if (clicked) {
                            clickCount++
                            lastClickTime = System.currentTimeMillis()
                            Log.d(TAG, "✅ Successfully clicked '$nodeText' button (click #$clickCount)")
                            
                            // Start multi-dialog listener
                            startMultiDialogListener()
                            
                            // Notify completion
                            notifyClickComplete()
                            
                            node.recycle()
                            source.recycle()
                            return
                        } else {
                            // Try clicking parent if button itself isn't clickable
                            val parent = node.parent
                            if (parent != null && parent.isClickable) {
                                val parentClicked = parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                                if (parentClicked) {
                                    clickCount++
                                    lastClickTime = System.currentTimeMillis()
                                    Log.d(TAG, "✅ Successfully clicked parent of '$nodeText' (click #$clickCount)")
                                    startMultiDialogListener()
                                    notifyClickComplete()
                                    parent.recycle()
                                    node.recycle()
                                    source.recycle()
                                    return
                                }
                                parent.recycle()
                            }
                        }
                    }
                    node.recycle()
                }
            }
            
            // IMPORTANT: avoid unsafe fallback clicks on dialer keypad (can type extra digits)
            Log.d(TAG, "ℹ️ No known confirm button found; skipping unsafe fallback click")
            
            source.recycle()
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error handling event: ${e.message}")
        }
    }
    
    /**
     * Match the current USSD dialog against the admin-defined dynamic flow steps.
     * If a step's keywords are present in the dialog text, type its response_template
     * (with {amount}/{receiver}/{pin} substituted) into the EditText and submit.
     *
     * Returns true if a flow step was matched and handled.
     */
    private fun tryHandleDynamicFlow(root: AccessibilityNodeInfo, dialogText: String): Boolean {
        if (!isRealUssdDialog(root)) {
            Log.i(TAG, "🛑 tryHandleDynamicFlow aborted — not a USSD dialog window")
            return false
        }
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        // Prefer the explicit flow_id assigned to this provider (admin-configured),
        // fall back to trigger-code lookup for backward compatibility.
        val flowId = prefs.getString("current_ussd_flow_id", null)
        val trigger = prefs.getString("current_trigger_code", null)
        var flow = try {
            UssdFlowsClient.findFlowById(flowId) ?: UssdFlowsClient.findFlowForTrigger(trigger)
        } catch (e: Exception) {
            Log.e(TAG, "Flow lookup error: ${e.message}"); null
        }

        // Fallback: no flow context (e.g. manual *300# dial or order missing flow_id).
        // Scan all enabled flows and pick the first whose any step keyword matches the dialog.
        if (flow == null) {
            val lowerForScan = dialogText.lowercase()
            flow = try {
                UssdFlowsClient.allFlows().firstOrNull { f ->
                    f.steps.any { s ->
                        s.keywords.any { kw -> kw.isNotBlank() && lowerForScan.contains(kw.lowercase()) }
                    }
                }
            } catch (_: Exception) { null }
            if (flow != null) {
                Log.i(TAG, "🔎 Flow context missing — fallback matched flow ${flow.triggerCode} by dialog content")
            }
        }
        if (flow == null) {
            Log.d(TAG, "ℹ️ No matching USSD flow (flowId=$flowId trigger=$trigger). Dialog: ${dialogText.take(120)}")
            return false
        }

        val lower = dialogText.lowercase()
        // Numbered menu lists (e.g. "1. Reseller  2. Transfer  5. Change Password")
        // contain the word "password"/"pin" as option labels — they are NOT PIN prompts.
        val isMenuList = looksLikeNumberedMenu(dialogText)
        // Carrier rejected the PIN (empty/partial write). Reset PIN session state so
        // the same PIN step can be re-entered cleanly instead of being skipped.
        val isInvalidPinPrompt = !isMenuList && (
            lower.contains("invalid pin") ||
                lower.contains("pin format") ||
                lower.contains("wrong pin") ||
                lower.contains("pin khaldan") ||
                lower.contains("sirta khaldan")
        )
        if (isInvalidPinPrompt) {
            Log.w(TAG, "🔁 Carrier reported invalid PIN — resetting PIN state for retry")
            flow.steps.filter { it.isPinField }.forEach { completedFlowSteps.remove(it.order) }
            pinFilledForSession = false
            pinVerifiedForSession = false
            pinSubmittedForSession = false
            pinWriteFailedForSession = false
            pinSetCount = 0
        }
        val looksLikePinDialog = !isMenuList && (
            lower.contains("pin") ||
                lower.contains("password") ||
                lower.contains("furaha")
        )
        val matchedStep = flow.steps.firstOrNull { s ->
            s.order !in completedFlowSteps &&
            s.keywords.isNotEmpty() &&
            s.keywords.any { kw -> lower.contains(kw.lowercase()) }
        }
        val step = matchedStep ?: flow.steps.firstOrNull { s ->
            s.order !in completedFlowSteps &&
                !s.isPinField &&
                completedFlowSteps.isNotEmpty() &&
                !looksLikePinDialog &&
                // A confirmation menu ("1. Haa / 2. Maya") sometimes exposes no
                // EditText to Accessibility; still allow the numeric answer there.
                (hasVisibleEditableInput(root) || isMenuList) &&
                // Numbered menus (incl. the final "1. Haa / 2. Maya" confirmation)
                // may be auto-answered ONLY when the pending step is a short menu
                // selection like "1" or "2" — never free text such as a phone number.
                (!isMenuList || s.responseTemplate.trim().trim('{', '}').let { t ->
                    t.isNotEmpty() && t.length <= 2 && t.all(Char::isDigit)
                })
        }?.also { fallbackStep ->
            Log.w(
                TAG,
                "🧭 Flow ${flow.triggerCode}: no keyword matched for dialog; using sequential fallback step #${fallbackStep.order}. completed=$completedFlowSteps dialog=${dialogText.take(120)}"
            )
        }
        if (step == null) {
            Log.d(TAG, "ℹ️ Flow ${flow.triggerCode}: no step matched. completed=$completedFlowSteps dialog=${dialogText.take(120)}")
            // Self-healing: log this unmatched dialog so admin can teach the system.
            try {
                val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                val nextOrder = (completedFlowSteps.maxOrNull() ?: 0) + 1
                UssdFlowsClient.logUnmatchedAsync(flow.id, nextOrder, dialogText, deviceId)
            } catch (_: Exception) {}
            return false
        }

        if (looksLikePinDialog && !step.isPinField) {
            Log.w(TAG, "⚠️ Dynamic flow step #${step.order} matched on PIN dialog but isPinField=false; deferring to PIN handler")
            return false
        }

        // PIN guard: do NOT re-enter PIN if already filled this session.
        // Prevents Somnet "Invalid PIN format" loops where the carrier re-prompts.
        if (step.isPinField && pinFilledForSession) {
            Log.d(TAG, "⏭️ Flow PIN step #${step.order} already filled this session; skipping")
            completedFlowSteps.add(step.order)
            return false
        }

        // Substitute placeholders with current order context
        val rawAmount = prefs.getString("current_topup_amount", "") ?: ""
        val rawReceiver = prefs.getString("current_receiver", "") ?: ""
        // Normalize receiver to 9 digits (strip +, 252, leading 0) — carriers reject prefixed numbers
        val receiver = rawReceiver.filter { it.isDigit() }.let {
            if (it.startsWith("252") && it.length > 9) it.substring(3) else it
        }.takeLast(9)
        val pin = (prefs.getString("current_pin_code", "") ?: "").trim()
        if (pin.isNotEmpty() && !pin.all { it.isDigit() }) {
            Log.e(TAG, "❌ Stored PIN contains non-numeric characters; aborting flow step")
            return false
        }
        val amountForUssd = formatAmountForUssd(rawAmount)
        var response = step.responseTemplate
            .replace("{amount}", amountForUssd, ignoreCase = true)
            .replace("{cost_price}", amountForUssd, ignoreCase = true)
            .replace("{topup_amount}", amountForUssd, ignoreCase = true)
            .replace("{receiver}", receiver, ignoreCase = true)
            .replace("{phone}", receiver, ignoreCase = true)
            .replace("{receiver_phone}", receiver, ignoreCase = true)
            .replace("{number}", receiver, ignoreCase = true)
            .replace("{pin}", pin, ignoreCase = true)
            .replace("{sim_password}", pin, ignoreCase = true)
        // Tolerate admin entries like "{5516}", "{2}", "{1}" — strip remaining
        // braces around literal values so they're typed as the value, not "{value}".
        response = response.replace(Regex("\\{([^{}]*)\\}"), "$1").trim()

        if (response.isBlank()) {
            Log.w(TAG, "⚠️ Flow step #${step.order} matched but response is empty")
            return false
        }

        // Validate PIN: only proceed if response is purely numeric for PIN steps
        if (step.isPinField && (response.isEmpty() || !response.all { it.isDigit() })) {
            Log.e(TAG, "❌ Flow step #${step.order} is PIN field but response contains non-numeric characters; aborting entry")
            return false
        }

        Log.d(TAG, "🧭 Flow step #${step.order} matched (kw=${step.keywords}) isPin=${step.isPinField}")

        // ===== PIN STEPS GO THROUGH safeEnterPin (single-write + suppression) =====
        if (step.isPinField) {
            if (!safeEnterPin(root, response)) {
                Log.w(TAG, "⚠️ Flow PIN step #${step.order} write skipped/failed")
                return false
            }
            completedFlowSteps.add(step.order)
            reportFlowProgress(
                stepOrder = step.order,
                totalSteps = flow.steps.size,
                keywords = step.keywords,
                response = response,
                dialogText = dialogText.take(200),
                isPin = true
            )
            // Somnet opens with the PIN prompt; allow its first-dialog input watcher
            // extra time to commit before Send. Somtel remains on the proven delay.
            val provider = prefs.getString("current_provider", "").orEmpty()
            val pinSubmitDelay = if (provider.contains("somnet", ignoreCase = true)) 3000L else CLICK_DELAY_MS
            submitPinOnce(delayMs = pinSubmitDelay, source = "flow-step-${step.order}")
            return true
        }

        // ===== Non-PIN flow step: clear + write once, then submit =====
        val originDialogFingerprint = dialogFingerprintFor(dialogText)
        val edits = mutableListOf<AccessibilityNodeInfo>()
        findEditTexts(root, edits)
        if (edits.isEmpty()) {
            // Confirmation menus ("1. Haa / 2. Maya") can hide their input field.
            // Try clicking the matching menu option directly instead of pressing
            // Send with nothing selected.
            val shortNumeric = response.length <= 2 && response.all(Char::isDigit)
            if (shortNumeric && clickNumberedMenuOption(root, response)) {
                completedFlowSteps.add(step.order)
                Log.i(TAG, "✅ Selected menu option '$response' by click (no EditText available)")
                return true
            }
            Log.w(TAG, "⚠️ Flow step matched but no EditText to type into")
            return false
        }

        var typed = false
        try {
            for (et in edits) {
                et.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                // Clear existing text first to prevent appending
                val clearArgs = android.os.Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
                }
                et.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, clearArgs)
                val args = android.os.Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, response)
                }
                if (et.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
                    typed = true
                    // Verify the dot wasn't stripped by a numeric input filter
                    // (some carrier dialers use inputType=number which removes '.').
                    // If stripped, fall back to clipboard PASTE which bypasses filters.
                    if (response.contains('.')) {
                        val current = et.text?.toString() ?: ""
                        if (!current.contains('.')) {
                            Log.w(TAG, "⚠️ Dot stripped from '$response' (got '$current') — retrying via clipboard PASTE")
                            try {
                                val cm = getSystemService(android.content.Context.CLIPBOARD_SERVICE)
                                    as android.content.ClipboardManager
                                cm.setPrimaryClip(android.content.ClipData.newPlainText("ussd_amount", response))
                                // Clear then paste
                                et.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, clearArgs)
                                et.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                                et.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                            } catch (e: Exception) {
                                Log.e(TAG, "❌ Clipboard paste fallback failed: ${e.message}")
                            }
                        }
                    }
                    break
                }
            }
        } finally {
            edits.forEach { it.recycle() }
        }

        if (!typed) {
            Log.w(TAG, "⚠️ Failed to type flow response into EditText")
            return false
        }

        // Keep a short marker for potential SET_TEXT echo events only.
        // onAccessibilityEvent no longer suppresses TYPE_WINDOW_STATE_CHANGED using this,
        // so the next USSD screen can still be processed immediately.
        setTextSuppressUntilMs = System.currentTimeMillis() + 1500L
        completedFlowSteps.add(step.order)

        reportFlowProgress(
            stepOrder = step.order,
            totalSteps = flow.steps.size,
            keywords = step.keywords,
            response = response,
            dialogText = dialogText.take(200),
            isPin = false
        )

        // Schedule a single Send/OK click for this non-PIN step.
        // Reuse the same serialized scheduler — but allow it to fire even after
        // a previous non-PIN submit, since each menu page = its own submit.
        // For non-PIN steps we use a fresh runnable that doesn't gate on pinSubmittedForSession.
        scheduledSubmitRunnable?.let { handler.removeCallbacks(it) }
        var submitAttempt = 0
        lateinit var submitRunnable: Runnable
        submitRunnable = Runnable {
            val rt = rootInActiveWindow ?: return@Runnable
            var rescheduled = false
            try {
                // Never press Send while the dialog input is still empty — carriers
                // answer "Input required. Try again" and the whole order dies.
                val liveDialogText = extractDialogText(rt)
                if (dialogFingerprintFor(liveDialogText) != originDialogFingerprint) {
                    Log.i(TAG, "🛑 Skipping stale Send — carrier dialog changed before step ${step.order} submit")
                    return@Runnable
                }
                if (!isValueCommittedInActiveField(rt, response)) {
                    submitAttempt++
                    if (submitAttempt <= 3) {
                        Log.w(TAG, "⏳ Field not committed yet (attempt $submitAttempt) — retyping '$response' and waiting")
                        typeIntoActiveEditableField(rt, response)
                        handler.postDelayed(submitRunnable, SUBMIT_RECHECK_DELAY_MS)
                        rescheduled = true
                        return@Runnable
                    }
                    Log.e(TAG, "❌ Skipping Send — input field still empty after $submitAttempt attempts")
                    return@Runnable
                }
                submitCount++
                Log.d(TAG, "📨 Non-PIN flow submit step=${step.order} submitCount=$submitCount")
                clickSendOrOkButton(rt, requiredCommittedValue = response)
            } finally {
                if (!rescheduled) { try { rt.recycle() } catch (_: Exception) {} } else { try { rt.recycle() } catch (_: Exception) {} }
            }
        }
        scheduledSubmitRunnable = submitRunnable
        // Give the EditText enough time to commit the typed value before pressing
        // Send. Some carrier dialogs (Somtel/Hormuud) fire "Input required, Try again"
        // if Send is dispatched too quickly after ACTION_SET_TEXT / PASTE.
        handler.postDelayed(submitRunnable, NON_PIN_SUBMIT_DELAY_MS)
        return true
    }

    /** Re-write [value] into the currently active editable field (SET_TEXT + paste fallback). */
    private fun typeIntoActiveEditableField(root: AccessibilityNodeInfo, value: String): Boolean {
        val candidates = collectEditableFieldCandidates(root)
        return try {
            val best = selectBestEditableCandidate(candidates) ?: return false
            val node = best.node
            focusEditableField(node)
            val args = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
            }
            var ok = try { node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args) } catch (_: Exception) { false }
            if (!ok) {
                ok = try {
                    val cm = getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cm.setPrimaryClip(android.content.ClipData.newPlainText("ussd_value", value))
                    node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                    node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                } catch (_: Exception) { false }
            }
            setTextSuppressUntilMs = System.currentTimeMillis() + 1500L
            ok
        } finally {
            candidates.forEach { try { it.node.recycle() } catch (_: Exception) {} }
        }
    }

    /** Format amount typed into a USSD dialog EditText: keep decimal as-is.
     *  "20" -> "20", "11.60" -> "11.60", "0.12" -> "0.12" */
    private fun formatAmountForUssd(raw: String): String {
        if (raw.isBlank()) return ""
        val n = raw.toDoubleOrNull() ?: return raw
        if (n == n.toLong().toDouble()) return n.toLong().toString()
        // EditText prompts expect a normal decimal number — NOT the asterisk
        // USSD-code form. e.g. "0.12" stays "0.12" so Somtel reads $0.12 (not $12).
        return String.format("%.2f", n)
    }
    
    /**
     * Extract ALL text content from the USSD dialog
     * This captures the Hormuud confirmation message for delivery_notes
     * IMPROVED: Captures all text including short strings and button labels
     */
    private fun extractDialogText(root: AccessibilityNodeInfo): String? {
        val textParts = mutableListOf<String>()
        extractTextRecursively(root, textParts)
        
        if (textParts.isNotEmpty()) {
            val fullText = textParts.joinToString(" | ")
            Log.d(TAG, "📄 Extracted dialog texts: $fullText")
            return fullText
        }
        return null
    }
    
    /**
     * Recursively extract text from ALL nodes in the dialog
     * IMPROVED: Captures ALL text regardless of length, including button labels and content descriptions
     */
    private fun extractTextRecursively(node: AccessibilityNodeInfo, texts: MutableList<String>) {
        try {
            // Capture ALL text - no length filter
            val text = node.text?.toString()
            if (!text.isNullOrBlank()) {
                texts.add(text.trim())
            }
            
            // Also capture content description (important for some dialogs)
            val contentDesc = node.contentDescription?.toString()
            if (!contentDesc.isNullOrBlank() && contentDesc != text) {
                texts.add(contentDesc.trim())
            }
            
            // Recurse into all children
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    extractTextRecursively(child, texts)
                    child.recycle()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error extracting text: ${e.message}")
        }
    }
    
    /**
     * Save captured USSD response to SharedPreferences
     * UssdDialerService will read this and send to backend as delivery_notes
     */
    /**
     * A terminal USSD result dialog has NO editable input field — the carrier is
     * only showing the outcome with an OK/Close button.
     */
    private fun isTerminalResultDialog(root: AccessibilityNodeInfo?, dialogText: String? = null): Boolean {
        if (root == null) return false
        val candidates = collectEditableFieldCandidates(root)
        val hasEditable = try {
            candidates.isNotEmpty()
        } finally {
            candidates.forEach { try { it.node.recycle() } catch (_: Exception) {} }
        }
        if (hasEditable) return false

        // A carrier prompt can hide its EditText from Accessibility. In that case the
        // dialog still expects input (it shows Send/Cancel) and pressing the positive
        // button submits an EMPTY value. Only treat it as terminal when the buttons
        // are dismiss-only and the text is not a question/prompt.
        if (hasInputAwaitingButtons(root)) {
            Log.i(TAG, "🛑 Not terminal — dialog exposes Send/Cancel (input still expected)")
            return false
        }
        val text = (dialogText ?: extractDialogText(root)).orEmpty().lowercase()
        if (text.isNotBlank()) {
            val promptMarkers = listOf(
                "geli", "fadlan", "hubi", "enter", "xulo", "dooro", "select",
                "ma hubtaa", "mu hubtaa", "pin", "input required", "try again"
            )
            if (promptMarkers.any { text.contains(it) } || looksLikeNumberedMenu(text)) {
                Log.i(TAG, "🛑 Not terminal — dialog text still looks like a prompt")
                return false
            }
        }
        return true
    }

    /** True when the dialog shows a Send/Dir (submit) button — i.e. it wants input. */
    private fun hasInputAwaitingButtons(root: AccessibilityNodeInfo): Boolean {
        val submitLabels = listOf("Send", "send", "SEND", "Dir", "dir", "DIR", "Soo dir", "Submit", "submit")
        for (label in submitLabels) {
            val nodes = try { root.findAccessibilityNodeInfosByText(label) } catch (_: Exception) { null } ?: continue
            var found = false
            for (n in nodes) {
                val t = (n.text?.toString() ?: n.contentDescription?.toString() ?: "").trim()
                if (t.equals(label, ignoreCase = true) && isClickableButton(n)) found = true
                try { n.recycle() } catch (_: Exception) {}
            }
            if (found) return true
        }
        return false
    }

    /**
     * Dismiss a terminal USSD result dialog by pressing OK / Close / Haye.
     * Never presses Cancel-like buttons first, and falls back to the standard
     * android:id/button1 positive button when the label is unknown.
     */
    private fun clickTerminalDismissButton(root: AccessibilityNodeInfo?): Boolean {
        if (root == null) return false
        val labels = listOf(
            "OK", "Ok", "ok", "OKAY", "Okay", "okay",
            "Close", "close", "CLOSE",
            "Dismiss", "dismiss", "DISMISS",
            "Done", "done", "DONE",
            "Haye", "haye", "HAYE", "Haa", "haa", "HAA", "Hagaag", "hagaag"
        )
        for (label in labels) {
            if (label.equals("Haa", ignoreCase = true)) continue // that's a choice, not a dismiss
            val nodes = try { root.findAccessibilityNodeInfosByText(label) } catch (_: Exception) { null } ?: continue
            for (node in nodes) {
                try {
                    if (isClickableButton(node)) {
                        if (node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                            Log.d(TAG, "✅ Terminal dialog dismissed via '$label'")
                            nodes.forEach { n -> try { if (n !== node) n.recycle() } catch (_: Exception) {} }
                            try { node.recycle() } catch (_: Exception) {}
                            return true
                        }
                        val parent = try { node.parent } catch (_: Exception) { null }
                        try {
                            if (parent?.isClickable == true && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                                Log.d(TAG, "✅ Terminal dialog dismissed via parent of '$label'")
                                nodes.forEach { n -> try { if (n !== node) n.recycle() } catch (_: Exception) {} }
                                try { node.recycle() } catch (_: Exception) {}
                                return true
                            }
                        } finally {
                            try { parent?.recycle() } catch (_: Exception) {}
                        }
                    }
                } catch (_: Exception) {}
            }
            nodes.forEach { n -> try { n.recycle() } catch (_: Exception) {} }
        }
        // Fallback: the AlertDialog positive button — ONLY when its label is a
        // dismiss label. On carrier prompts button1 is "Send", and clicking it
        // would submit an empty field.
        val positive = try {
            root.findAccessibilityNodeInfosByViewId("android:id/button1")?.firstOrNull()
        } catch (_: Exception) { null }
        if (positive != null) {
            val plabel = (positive.text?.toString() ?: positive.contentDescription?.toString() ?: "").trim()
            val dismissLike = plabel.isNotBlank() && labels.any { it.equals(plabel, ignoreCase = true) }
            val ok = if (dismissLike) {
                try { positive.performAction(AccessibilityNodeInfo.ACTION_CLICK) } catch (_: Exception) { false }
            } else {
                Log.i(TAG, "🛑 Skipping button1 dismiss — label='$plabel' is not a dismiss button")
                false
            }
            try { positive.recycle() } catch (_: Exception) {}
            if (ok) {
                Log.d(TAG, "✅ Terminal dialog dismissed via android:id/button1")
                return true
            }
        }
        return false
    }

    /** Retry OK dismissal against a fresh node tree; carrier result dialogs often
     * replace their button node shortly after appearing, making the first node stale. */
    private fun retryTerminalDismiss(attempt: Int) {
        if (attempt > 4) {
            Log.e(TAG, "❌ Terminal result saved, but OK could not be dismissed after retries")
            return
        }
        handler.postDelayed({
            val freshRoot = rootInActiveWindow ?: return@postDelayed
            try {
                if (!isRealUssdDialog(freshRoot)) return@postDelayed
                val freshText = extractDialogText(freshRoot)
                if (!isTerminalResultDialog(freshRoot, freshText)) return@postDelayed
                if (!freshText.isNullOrBlank()) saveUssdResponse(freshText, isFinal = true)
                if (clickTerminalDismissButton(freshRoot)) {
                    Log.i(TAG, "✅ Terminal OK dismissed on retry $attempt")
                    resetSessionState("terminal_result_retry_$attempt")
                } else {
                    retryTerminalDismiss(attempt + 1)
                }
            } finally {
                try { freshRoot.recycle() } catch (_: Exception) {}
            }
        }, 700L * attempt)
    }

    private fun saveUssdResponse(text: String, isFinal: Boolean = false) {
        // (see clickTerminalDismissButton below for terminal dialog handling)
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // 1) A silent (TelephonyManager) carrier reply is authoritative — never
            //    overwrite it with on-screen text.
            val silentAt = prefs.getLong(KEY_SILENT_RESPONSE_AT, 0L)
            if (silentAt > 0L && System.currentTimeMillis() - silentAt < 120_000L) {
                Log.d(TAG, "🔇 Silent USSD reply already stored — skipping screen capture")
                return
            }

            // 2) Reject anything that is clearly NOT a USSD dialog (launcher / home
            //    screen text captured after the dialog was dismissed).
            if (!looksLikeUssdResponse(text)) {
                Log.w(TAG, "🚮 Ignoring non-USSD screen text: ${text.take(80)}")
                return
            }

            prefs
                .edit()
                .putString(KEY_LAST_USSD_RESPONSE, text)
                .putLong(KEY_LAST_USSD_RESPONSE_TIME, System.currentTimeMillis())
                .apply()
            if (isFinal) {
                prefs.edit()
                    .putString(KEY_FINAL_USSD_RESPONSE, text)
                    .putLong(KEY_FINAL_USSD_RESPONSE_TIME, System.currentTimeMillis())
                    .apply()
                Log.d(TAG, "🏁 Saved FINAL USSD result dialog: ${text.take(100)}")
            }
            Log.d(TAG, "💾 Saved USSD response to SharedPreferences: ${text.take(100)}")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to save USSD response: ${e.message}")
        }
    }

    /**
     * Heuristic guard: the delayed runnables read `rootInActiveWindow`, which can be the
     * launcher/home screen once the USSD dialog is dismissed. Storing that as the carrier
     * reply produced garbage delivery notes ("Google Search | Play Store | Camera ...").
     */
    private fun looksLikeUssdResponse(text: String): Boolean {
        return isPlausibleUssdText(text)
    }

    /**
     * True only when the active window really is a carrier USSD dialog
     * (AlertDialog with a message + OK/Send buttons), NOT the dialer keypad,
     * the in-call screen, or the launcher.
     */
    private fun isRealUssdDialog(root: AccessibilityNodeInfo?): Boolean {
        if (root == null) return false
        var hasDialogMarker = false
        var hasDialpadMarker = false

        fun walk(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || depth > 25 || hasDialogMarker && hasDialpadMarker) return
            val viewId = try { node.viewIdResourceName.orEmpty() } catch (_: Exception) { "" }
            val cls = node.className?.toString().orEmpty()
            val idTail = viewId.substringAfterLast('/')

            if (viewId.startsWith("android:id/") &&
                (idTail == "message" || idTail == "alertTitle" || idTail == "button1" ||
                    idTail == "button2" || idTail == "custom" || idTail == "parentPanel")
            ) {
                hasDialogMarker = true
            }
            if (cls.contains("AlertDialog", ignoreCase = true) || cls.contains("Dialog", ignoreCase = true)) {
                hasDialogMarker = true
            }
            if (idTail.isNotBlank() && DIALPAD_ID_MARKERS.any { idTail.equals(it, ignoreCase = true) }) {
                hasDialpadMarker = true
            }

            for (i in 0 until node.childCount) {
                walk(node.getChild(i), depth + 1)
            }
        }

        try { walk(root, 0) } catch (e: Exception) {
            Log.w(TAG, "isRealUssdDialog walk error: ${e.message}")
        }

        if (!hasDialogMarker) {
            Log.d(TAG, "🔍 Window has no dialog markers (dialpad=$hasDialpadMarker)")
            return false
        }
        return true
    }

    private fun isPlausibleUssdText(text: String): Boolean {
        val t = text.lowercase()
        return !LAUNCHER_MARKERS.any { t.contains(it) } && run {
            val parts = text.split(" | ").filter { it.isNotBlank() }
            !(parts.size >= 12 && parts.none { it.length > 30 })
        } && text.trim().length >= 3
    }

    
    /**
     * Start listening for additional dialogs for 10 seconds
     * Hormuud often sends 2-3 consecutive USSD dialogs
     */
    private fun startMultiDialogListener() {
        // Cancel any existing runnable
        multiDialogRunnable?.let { handler.removeCallbacks(it) }
        
        multiDialogRunnable = Runnable {
            Log.d(TAG, "🏁 Multi-dialog listener ended. Total clicks: $clickCount")
            
            // Reset click count for next session
            clickCount = 0
            
            // Reset expecting flag
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_EXPECTING_USSD, false)
                .apply()
            
            // Send final completion broadcast with package name for Android 13+
            sendBroadcast(Intent(ACTION_USSD_CLICK_COMPLETE).apply {
                setPackage("com.iftin.delivery")
                putExtra("total_clicks", clickCount)
                putExtra("success", true)
            })
        }
        
        handler.postDelayed(multiDialogRunnable!!, MULTI_DIALOG_TIMEOUT_MS)
        Log.d(TAG, "⏳ Started multi-dialog listener for ${MULTI_DIALOG_TIMEOUT_MS/1000}s")
    }
    
    /**
     * Enter PIN into an EditText/input field in the USSD dialog
     * Hormuud sends a PIN prompt after *712*phone*amount# - we auto-enter "5516"
     */
    private fun enterPinInDialog(root: AccessibilityNodeInfo, pin: String): Boolean {
        return try {
            safeEnterPin(root, pin)
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to enter PIN: ${e.message}")
            false
        }
    }
    
    /**
     * Recursively find all EditText fields in the view hierarchy
     */
    private fun findEditTexts(node: AccessibilityNodeInfo, results: MutableList<AccessibilityNodeInfo>) {
        try {
            val className = node.className?.toString() ?: ""
            val bounds = Rect().also { node.getBoundsInScreen(it) }
            val isVisibleCandidate = node.isVisibleToUser && node.isEnabled && bounds.width() > 0 && bounds.height() > 0
            if ((className.contains("EditText", ignoreCase = true) || node.isEditable) && isVisibleCandidate) {
                results.add(AccessibilityNodeInfo.obtain(node))
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { child ->
                    findEditTexts(child, results)
                    child.recycle()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error finding EditTexts: ${e.message}")
        }
    }

    private fun hasVisibleEditableInput(root: AccessibilityNodeInfo): Boolean {
        val edits = mutableListOf<AccessibilityNodeInfo>()
        return try {
            findEditTexts(root, edits)
            edits.any { it.isVisibleToUser && it.isEnabled }
        } finally {
            edits.forEach { it.recycle() }
        }
    }

    /**
     * Click a numbered menu entry (e.g. "1. Haa") when the carrier dialog exposes
     * the options as clickable rows instead of an input field.
     */
    private fun clickNumberedMenuOption(root: AccessibilityNodeInfo, choice: String): Boolean {
        val nodes = try { root.findAccessibilityNodeInfosByText(choice) } catch (_: Exception) { null } ?: return false
        return try {
            nodes.any { n ->
                val label = (n.text?.toString() ?: n.contentDescription?.toString()).orEmpty().trim()
                val isOption = Regex("^$choice\\s*[.)-]").containsMatchIn(label)
                if (isOption && n.isVisibleToUser) {
                    var target: AccessibilityNodeInfo? = n
                    while (target != null && !target.isClickable) target = target.parent
                    target?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
                } else false
            }
        } catch (_: Exception) {
            false
        } finally {
            nodes.forEach { try { it.recycle() } catch (_: Exception) {} }
        }
    }

    /**
     * True when the on-screen dialog is a choice prompt ("1. Haa / 2. Maya" or a
     * numbered menu) and the active flow still has an unanswered numeric step.
     * In that state the generic Send/OK clicker must stay away — otherwise Send is
     * pressed without a choice and the carrier cancels the transfer.
     */
    private fun hasUnansweredChoiceStep(dialogText: String?): Boolean {
        if (dialogText.isNullOrBlank()) return false
        val lower = dialogText.lowercase()
        val looksLikeChoice = looksLikeNumberedMenu(dialogText) ||
            (lower.contains("haa") && lower.contains("maya")) ||
            lower.contains("ma hubtaa")
        if (!looksLikeChoice) return false
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val flow = try {
            UssdFlowsClient.findFlowById(prefs.getString("current_ussd_flow_id", null))
                ?: UssdFlowsClient.findFlowForTrigger(prefs.getString("current_trigger_code", null))
        } catch (_: Exception) { null } ?: return false
        return flow.steps.any { s ->
            s.order !in completedFlowSteps && !s.isPinField &&
                s.responseTemplate.trim().trim('{', '}').let { t ->
                    t.isNotEmpty() && t.length <= 2 && t.all(Char::isDigit)
                }
        }
    }

    private fun shouldSuppressAutoClickForDialog(root: AccessibilityNodeInfo, dialogText: String?): Boolean {
        if (shouldHardStopForPinStage(root, dialogText)) {
            return true
        }

        // Never press Send on a "1. Haa / 2. Maya" style prompt before the choice
        // has actually been entered/selected.
        if (hasUnansweredChoiceStep(dialogText)) {
            Log.i(TAG, "🛑 Suppressing auto-click — confirmation choice not selected yet")
            return true
        }

        // Fail closed when this screen is a configured PIN step. A carrier may hide
        // its EditText from Accessibility, so "no candidate found" must never mean
        // that the generic Send/OK clicker is allowed to submit an empty PIN.
        if (matchesConfiguredPinFlowStep(dialogText) &&
            (!pinFilledForSession || !pinVerifiedForSession || pinWriteFailedForSession)
        ) {
            Log.i(TAG, "🛑 Suppressing auto-click — configured PIN step is not safely committed")
            return true
        }

        // Inspect editable inputs: if dialog has a visible editable field, we must
        // NOT click Send/OK unless something has actually been typed. Otherwise the
        // carrier responds with "Input required. Try again." (seen on Hormuud
        // numbered menus like 1.Reseller / 2.Transfer where the dynamic flow step
        // didn't match and the generic Send loop fired blindly).
        val inputState = try {
            val candidates = collectEditableFieldCandidates(root)
            try {
                val visibleEditables = candidates.filter { it.isVisible && it.isEnabled && it.isEditable }
                val hasAny = visibleEditables.isNotEmpty()
                val hasEmpty = visibleEditables.any { it.existingTextLength == 0 }
                val hasFilled = visibleEditables.any { it.existingTextLength > 0 }
                Triple(hasAny, hasEmpty, hasFilled)
            } finally {
                candidates.forEach { it.node.recycle() }
            }
        } catch (_: Exception) { Triple(false, false, false) }

        val hasEditableInput = inputState.first
        val hasEmptyEditableInput = inputState.second
        val hasFilledEditableInput = inputState.third

        // 1. Before verified PIN auto-submit starts, keep the generic loop away from Send.
        if (pinFilledForSession && hasEditableInput && !pinSubmittedForSession) return true

        // 1b. For generic/non-PIN dialogs, never auto-click while an editable field exists
        // but still has no committed text yet. This avoids racing ACTION_SET_TEXT/PASTE
        // and pressing Send before the carrier dialog actually receives the value.
        if (hasEditableInput && !hasFilledEditableInput) {
            Log.i(TAG, "🛑 Suppressing auto-click — editable dialog has no committed text yet")
            return true
        }

        // 2. If the dialog still has an empty input box, refuse to click Send/OK —
        //    something must be typed first (either by a dynamic flow step or the user).
        if (hasEmptyEditableInput) {
            Log.i(TAG, "🛑 Suppressing auto-click — dialog has empty input field (would trigger 'Input required')")
            return true
        }

        // 3. Hidden input case: no editable node is exposed to Accessibility, but the
        //    dialog still shows a Send button and prompt text. Pressing Send there
        //    submits an empty value, so stay away.
        if (!hasEditableInput && hasInputAwaitingButtons(root)) {
            val lower = dialogText.orEmpty().lowercase()
            val promptLike = lower.isBlank() || listOf(
                "geli", "fadlan", "hubi", "enter", "xulo", "dooro", "select", "pin"
            ).any { lower.contains(it) } || looksLikeNumberedMenu(lower)
            if (promptLike) {
                Log.i(TAG, "🛑 Suppressing auto-click — Send visible but no value entered (hidden input)")
                return true
            }
        }

        return false
    }
    
    /**
     * Click Send/OK button after entering PIN
     */
    private fun clickSendOrOkButton(root: AccessibilityNodeInfo, requiredCommittedValue: String) {
        try {
            val dialogText = extractDialogText(root)
            if (shouldHardStopForPinStage(root, dialogText) && !shouldBypassPinHardStop(dialogText)) {
                engagePinHardStop(dialogText)
                Log.i(TAG, "✋ clickSendOrOkButton hard-stopped — PIN dialog requires full manual control")
                return
            }
            // Absolute last-mile invariant: this method may submit only the exact
            // value requested by the current flow step. ACTION_SET_TEXT returning
            // true is insufficient; some carrier dialogs re-render and clear it.
            if (requiredCommittedValue.isBlank() || !isValueCommittedInActiveField(root, requiredCommittedValue)) {
                Log.e(TAG, "🛑 Send blocked — required value is not committed in the live input field")
                return
            }
            if (shouldSuppressAutoClickForDialog(root, dialogText)) {
                Log.i(TAG, "✋ clickSendOrOkButton suppressed — editable dialog awaiting manual action")
                return
            }
            // Priority order: Send > OK > Confirm
            val sendButtons = listOf("Send", "send", "SEND", "Dir", "dir", "DIR", "OK", "ok", "Ok", "Confirm", "confirm")
            
            for (buttonText in sendButtons) {
                val nodes = root.findAccessibilityNodeInfosByText(buttonText)
                for (node in nodes) {
                    val nodeText = node.text?.toString()?.trim().orEmpty()
                    val contentDesc = node.contentDescription?.toString()?.trim().orEmpty()
                    val label = nodeText.ifBlank { contentDesc }
                    val looksLikeKeypadKey = label.length == 1 && label.firstOrNull()?.isDigit() == true
                    if (isClickableButton(node) && !looksLikeKeypadKey) {
                        val clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        if (clicked) {
                            clickCount++
                            lastClickTime = System.currentTimeMillis()
                            Log.d(TAG, "✅ Clicked '$buttonText' after PIN entry (click #$clickCount label='$label')")
                            startMultiDialogListener()
                            notifyClickComplete()
                            node.recycle()
                            return
                        }
                    }
                    node.recycle()
                }
            }
            
            // IMPORTANT: do not click random buttons/keys in PIN dialog
            Log.w(TAG, "⚠️ No Send/OK button found after PIN set; skipping unsafe fallback click")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error clicking send after PIN: ${e.message}")
        }
    }

    private fun isSubmitButtonLabel(label: String): Boolean {
        val normalized = label.trim().lowercase()
        return normalized in setOf(
            "send", "dir", "soo dir", "submit", "confirm", "yes", "haa",
            "cancel", "next", "continue", "accept", "agree", "ogolow", "sii wad"
        )
    }

    private fun dialogFingerprintFor(text: String?): String = text.orEmpty()
        .lowercase()
        .replace(Regex("\\s+"), " ")
        .trim()
        .take(220)
    
    /**
     * Send broadcast to notify UssdDialerService that we clicked a button
     */
    private fun notifyClickComplete() {
        try {
            val intent = Intent(ACTION_USSD_CLICK_COMPLETE).apply {
                setPackage("com.iftin.delivery")  // Required for Android 13+
                putExtra("click_count", clickCount)
                putExtra("timestamp", System.currentTimeMillis())
            }
            sendBroadcast(intent)
            Log.d(TAG, "📢 Sent USSD_CLICK_COMPLETE broadcast with setPackage (click #$clickCount)")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to send broadcast: ${e.message}")
        }
    }

    private fun isClickableButton(node: AccessibilityNodeInfo?): Boolean {
        if (node == null) return false
        
        val className = node.className?.toString() ?: ""
        val isButton = className.contains("Button", ignoreCase = true) ||
                      className.contains("TextView", ignoreCase = true)
        
        return node.isClickable || (isButton && node.isEnabled)
    }

    private fun findAndClickAnyButton(root: AccessibilityNodeInfo): Boolean {
        try {
            // Recursively search for any button in the view hierarchy
            for (i in 0 until root.childCount) {
                val child = root.getChild(i) ?: continue
                
                val className = child.className?.toString() ?: ""
                
                if (className.contains("Button", ignoreCase = true) && child.isClickable) {
                    val text = child.text?.toString() ?: ""
                    Log.d(TAG, "🔍 Found button: '$text' - attempting click...")
                    
                    if (child.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        clickCount++
                        lastClickTime = System.currentTimeMillis()
                        Log.d(TAG, "✅ Clicked button: '$text' (click #$clickCount)")
                        startMultiDialogListener()
                        notifyClickComplete()
                        child.recycle()
                        return true
                    }
                }
                
                // Recurse into children
                if (findAndClickAnyButton(child)) {
                    child.recycle()
                    return true
                }
                child.recycle()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error searching for buttons: ${e.message}")
        }
        return false
    }
    
    /**
     * FALLBACK: Use GLOBAL_ACTION_BACK to dismiss dialog if no button found
     */
    private fun dismissDialogWithBack() {
        Log.d(TAG, "⚠️ No button found, using GLOBAL_ACTION_BACK fallback to dismiss dialog")
        val result = performGlobalAction(GLOBAL_ACTION_BACK)
        if (result) {
            clickCount++
            lastClickTime = System.currentTimeMillis()
            Log.d(TAG, "✅ GLOBAL_ACTION_BACK successful (click #$clickCount)")
            startMultiDialogListener()
            notifyClickComplete()
        } else {
            Log.e(TAG, "❌ GLOBAL_ACTION_BACK failed")
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "UssdAccessibilityService interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        cancelPendingAutoActions("service-destroy")
        hidePinHud()
        Log.d(TAG, "UssdAccessibilityService destroyed")
    }

    // ==================== LIVE FLOW PROGRESS REPORTING ====================
    private val httpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .writeTimeout(8, TimeUnit.SECONDS)
            .build()
    }
    private val SUPABASE_URL = "https://zshzcuomdegeijqznvvu.supabase.co"
    private val SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaHpjdW9tZGVnZWlqcXpudnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTY2MDEsImV4cCI6MjA5Mzk3MjYwMX0.82Bdtu_h-6qdM2my0OT7mxhbi2wFYHBcKJ654oizo3o"

    /** Append a flow_progress entry to the current delivery_queue row (best-effort, async). */
    private fun reportFlowProgress(
        stepOrder: Int,
        totalSteps: Int,
        keywords: List<String>,
        response: String,
        dialogText: String,
        isPin: Boolean
    ) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val deliveryId = prefs.getString("current_delivery_id", null) ?: return
        if (deliveryId.isBlank()) return

        // Mask PIN content so it never reaches the dashboard
        val safeResponse = if (isPin) "••••" else response

        thread(start = true, isDaemon = true, name = "flow-progress") {
            try {
                // 1. Read existing flow_progress array
                val getReq = Request.Builder()
                    .url("$SUPABASE_URL/rest/v1/delivery_queue?id=eq.$deliveryId&select=flow_progress")
                    .addHeader("apikey", SUPABASE_ANON)
                    .addHeader("Authorization", "Bearer $SUPABASE_ANON")
                    .get()
                    .build()
                val existing: JSONArray = httpClient.newCall(getReq).execute().use { r ->
                    if (!r.isSuccessful) return@thread
                    val body = r.body?.string() ?: "[]"
                    val arr = JSONArray(body)
                    if (arr.length() > 0) arr.getJSONObject(0).optJSONArray("flow_progress") ?: JSONArray()
                    else JSONArray()
                }

                // Avoid duplicate step entries
                for (i in 0 until existing.length()) {
                    if (existing.getJSONObject(i).optInt("step") == stepOrder) return@thread
                }

                val entry = JSONObject().apply {
                    put("step", stepOrder)
                    put("total", totalSteps)
                    put("keywords", JSONArray(keywords))
                    put("response", safeResponse)
                    put("dialog", dialogText)
                    put("is_pin", isPin)
                    put("ts", System.currentTimeMillis())
                }
                existing.put(entry)

                val patchBody = JSONObject().put("flow_progress", existing).toString()
                    .toRequestBody("application/json".toMediaType())
                val patchReq = Request.Builder()
                    .url("$SUPABASE_URL/rest/v1/delivery_queue?id=eq.$deliveryId")
                    .addHeader("apikey", SUPABASE_ANON)
                    .addHeader("Authorization", "Bearer $SUPABASE_ANON")
                    .addHeader("Content-Type", "application/json")
                    .addHeader("Prefer", "return=minimal")
                    .patch(patchBody)
                    .build()
                httpClient.newCall(patchReq).execute().use { r ->
                    Log.d(TAG, "📡 flow_progress step=$stepOrder/$totalSteps → ${r.code}")
                }
            } catch (e: Exception) {
                Log.w(TAG, "flow_progress report failed: ${e.message}")
            }
        }
    }
}
