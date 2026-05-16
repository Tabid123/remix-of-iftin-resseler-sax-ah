package com.iftin.delivery.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
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
        val existingTextLength: Int
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
        val failureReason: String? = null
    )

    companion object {
        private const val TAG = "UssdAccessibility"
        const val ACTION_USSD_CLICK_COMPLETE = "com.iftin.delivery.USSD_CLICK_COMPLETE"
        const val PREFS_NAME = "iftin_ussd_prefs"
        const val KEY_EXPECTING_USSD = "expecting_ussd_dialogs"
        const val KEY_LAST_USSD_TIME = "last_ussd_time"
        const val KEY_LAST_USSD_RESPONSE = "last_ussd_response"
        const val KEY_LAST_USSD_RESPONSE_TIME = "last_ussd_response_time"
        const val KEY_USSD_SESSION_ID = "ussd_session_id"  // Session ID to bind responses
        
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
        
        // Timeout for expecting USSD flag (30 seconds - INCREASED from 15s)
        private const val EXPECTING_USSD_TIMEOUT_MS = 30000L
        private const val DEBOUNCE_MS = 800L
        private const val CLICK_DELAY_MS = 350L
        private const val MULTI_DIALOG_TIMEOUT_MS = 10000L
    }
    
    private val handler = Handler(Looper.getMainLooper())
    private var clickCount = 0
    private var lastClickTime = 0L
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

    // Track which dynamic flow steps have already been answered in this session
    private val completedFlowSteps = mutableSetOf<Int>()

    // ===== HARDENED EXECUTION GUARDS =====
    // Single in-flight processing lock — only one event handler runs at a time
    @Volatile private var isProcessingDialog = false
    // After ACTION_SET_TEXT we ignore CONTENT_CHANGED echo events for this window
    @Volatile private var setTextSuppressUntilMs = 0L
    // Single scheduled submit Runnable — replaces all parallel postDelayed submits
    private var scheduledSubmitRunnable: Runnable? = null
    // Diagnostic counters per session
    @Volatile private var pinSetCount = 0
    @Volatile private var submitCount = 0
    @Volatile private var ignoredEventCount = 0

    private fun resetSessionState(reason: String) {
        pinFilledForSession = false
        pinVerifiedForSession = false
        pinSubmittedForSession = false
        pinWriteFailedForSession = false
        pinFieldFocusedForSession = false
        pinFieldEditableForSession = false
        lastPinWriteAtMs = 0L
        lastPinWriteDiagnostics = null
        completedFlowSteps.clear()
        scheduledSubmitRunnable?.let { handler.removeCallbacks(it) }
        scheduledSubmitRunnable = null
        setTextSuppressUntilMs = 0L
        pinSetCount = 0
        submitCount = 0
        ignoredEventCount = 0
        isProcessingDialog = false
        Log.d(TAG, "♻️ Session state reset ($reason)")
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
        val diag = lastPinWriteDiagnostics
        if (!pinFilledForSession || !pinVerifiedForSession || pinWriteFailedForSession || !pinFieldFocusedForSession || !pinFieldEditableForSession) {
            Log.w(
                TAG,
                "🛑 submitPinOnce[$source] blocked — filled=$pinFilledForSession verified=$pinVerifiedForSession " +
                    "writeFailed=$pinWriteFailedForSession focused=$pinFieldFocusedForSession editable=$pinFieldEditableForSession " +
                    "diag=${diag?.method ?: "none"}/${diag?.actualValueLength ?: -1}"
            )
            return
        }
        scheduledSubmitRunnable?.let {
            handler.removeCallbacks(it)
            Log.d(TAG, "🧹 Cancelled prior scheduled submit before re-scheduling [$source]")
        }
        val r = Runnable {
            if (pinSubmittedForSession) {
                Log.d(TAG, "🛑 Scheduled submit aborted — already submitted")
                return@Runnable
            }
            pinSubmittedForSession = true
            submitCount++
            val root = rootInActiveWindow
            if (root == null) {
                Log.w(TAG, "⚠️ Submit fired but rootInActiveWindow=null")
                return@Runnable
            }
            try {
                val submitLag = if (lastPinWriteAtMs > 0L) System.currentTimeMillis() - lastPinWriteAtMs else -1L
                Log.d(
                    TAG,
                    "📨 Executing single submit [$source] submitCount=$submitCount sessionToken=$ussdSessionToken " +
                        "submitLagMs=$submitLag verified=${lastPinWriteDiagnostics?.exactMatch == true}"
                )
                clickSendOrOkButton(root)
            } finally {
                root.recycle()
            }
        }
        scheduledSubmitRunnable = r
        handler.postDelayed(r, delayMs)
        Log.d(TAG, "⏱️ Scheduled single submit in ${delayMs}ms [$source]")
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
        if (cleanPin.length != 4) {
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
        val methods = listOf(
            "action_set_text" to { node: AccessibilityNodeInfo, pin: String -> writeWithActionSetText(node, pin) },
            "char_by_char" to { node: AccessibilityNodeInfo, pin: String -> writeCharacterByCharacter(node, pin) },
            "clipboard_paste" to { node: AccessibilityNodeInfo, pin: String -> writeWithClipboardPaste(node, pin, requireFocus = false) },
            "focus_clipboard_paste" to { node: AccessibilityNodeInfo, pin: String -> writeWithClipboardPaste(node, pin, requireFocus = true) },
            "key_event_simulation" to { node: AccessibilityNodeInfo, pin: String -> writeWithKeyEventSimulation(node, pin) }
        )

        var ok = false
        try {
            for ((methodName, writer) in methods) {
                clearEditableField(preferred.node)
                val wrote = writer(preferred.node, cleanPin)
                val verification = verifyPinFieldValue(
                    candidate = preferred,
                    method = methodName,
                    intendedPin = cleanPin,
                    totalCandidates = candidates.size,
                    selectedIndex = selectionIndex,
                    writeAttempted = wrote
                )
                lastPinWriteDiagnostics = verification
                logPinWriteDiagnostics(verification)
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
            // Suppress the CONTENT_CHANGED echo from ACTION_SET_TEXT
            setTextSuppressUntilMs = System.currentTimeMillis() + 1500L
            Log.d(
                TAG,
                "✅ safeEnterPin wrote and verified PIN (len=${cleanPin.length}, pinSetCount=$pinSetCount, suppress=1500ms, method=${lastPinWriteDiagnostics?.method})"
            )
        } else {
            pinWriteFailedForSession = true
            Log.w(TAG, "⚠️ safeEnterPin failed — no input method produced an exact 4-digit match")
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
                                existingTextLength = node.text?.length ?: 0
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
                    "textLen=${candidate.existingTextLength} bounds=${formatRect(candidate.bounds)}"
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
        val focusResult = if (node.isFocused) true else node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val clickResult = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        val a11yResult = if (!requireAccessibilityFocus) node.isAccessibilityFocused else if (node.isAccessibilityFocused) true else node.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        Log.d(TAG, "🎯 focusEditableField focus=$focusResult click=$clickResult a11y=$a11yResult requireA11y=$requireAccessibilityFocus")
        return focusResult || clickResult || a11yResult
    }

    private fun writeWithActionSetText(node: AccessibilityNodeInfo, pin: String): Boolean {
        focusEditableField(node)
        val args = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, pin)
        }
        val result = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        Log.d(TAG, "⌨️ PIN write via ACTION_SET_TEXT result=$result")
        return result
    }

    private fun writeCharacterByCharacter(node: AccessibilityNodeInfo, pin: String): Boolean {
        focusEditableField(node)
        var cumulative = ""
        var success = true
        for (digit in pin) {
            cumulative += digit
            val args = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, cumulative)
            }
            val stepResult = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            Log.d(TAG, "⌨️ PIN char-by-char step len=${cumulative.length} result=$stepResult")
            success = success && stepResult
            SystemClock.sleep(35)
        }
        return success
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
        Log.d(TAG, "📋 PIN paste requireFocus=$requireFocus supported=$pasteSupported result=$pasteResult")
        return pasteResult
    }

    private fun writeWithKeyEventSimulation(node: AccessibilityNodeInfo, pin: String): Boolean {
        focusEditableField(node, requireAccessibilityFocus = true)
        var cumulative = ""
        var success = true
        for (digit in pin) {
            cumulative += digit
            val args = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, cumulative)
            }
            val clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            val stepResult = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            Log.d(TAG, "⌨️ PIN key-event simulation step len=${cumulative.length} click=$clicked result=$stepResult")
            success = success && stepResult
            SystemClock.sleep(50)
        }
        return success
    }

    private fun verifyPinFieldValue(
        candidate: EditableFieldCandidate,
        method: String,
        intendedPin: String,
        totalCandidates: Int,
        selectedIndex: Int,
        writeAttempted: Boolean
    ): PinWriteDiagnostics {
        val refreshed = try { candidate.node.refresh() } catch (_: Exception) { false }
        val actual = candidate.node.text?.toString().orEmpty()
        val bounds = Rect().also { candidate.node.getBoundsInScreen(it) }
        val exactMatch = writeAttempted && actual == intendedPin
        return PinWriteDiagnostics(
            method = method,
            totalCandidates = totalCandidates,
            selectedIndex = selectedIndex,
            selectedClassName = candidate.node.className?.toString().orEmpty(),
            selectedViewId = candidate.node.viewIdResourceName.orEmpty(),
            bounds = bounds,
            isFocused = candidate.node.isFocused,
            isAccessibilityFocused = candidate.node.isAccessibilityFocused,
            isEditable = candidate.node.isEditable || (candidate.node.className?.toString()?.contains("EditText", ignoreCase = true) == true),
            isEnabled = candidate.node.isEnabled,
            isVisible = candidate.node.isVisibleToUser,
            actualValueLength = actual.length,
            exactMatch = exactMatch,
            failureReason = when {
                !writeAttempted -> "write_action_failed"
                !refreshed -> "refresh_failed"
                actual != intendedPin -> "value_mismatch:$actual"
                else -> null
            }
        )
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

    override fun onServiceConnected() {
        super.onServiceConnected()
        
        Log.d(TAG, "✅ UssdAccessibilityService connected and active")
        
        // Configure service - NO packageNames filter to listen to ALL apps
        val info = AccessibilityServiceInfo().apply {
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
        val isPhonePackage = packageName.contains("phone", ignoreCase = true) ||
                            packageName.contains("dialer", ignoreCase = true) ||
                            packageName.contains("stk", ignoreCase = true) ||
                            packageName.contains("toolkit", ignoreCase = true) ||
                            packageName.contains("telecom", ignoreCase = true) ||
                            packageName.contains("incall", ignoreCase = true) ||
                            packageName.contains("ussd", ignoreCase = true) ||
                            packageName.contains("call", ignoreCase = true)

        if (!expectingUssd) {
            ussdSessionToken = 0L
            return
        }

        if (!isUssdPackage && !isPhonePackage) return

        // ===== HARDENED EVENT FILTERING =====
        // 1. Process ONLY TYPE_WINDOW_STATE_CHANGED — content_changed echoes from
        //    ACTION_SET_TEXT cause re-entry → duplicate PIN write → "Invalid PIN format".
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            ignoredEventCount++
            if (ignoredEventCount % 10 == 1) {
                Log.d(TAG, "🚫 Ignoring non-STATE event type=${event.eventType} (total ignored=$ignoredEventCount)")
            }
            return
        }

        // 2. SET_TEXT echo suppression window
        val now = System.currentTimeMillis()
        if (now < setTextSuppressUntilMs) {
            Log.d(TAG, "🤫 SET_TEXT suppression active (${setTextSuppressUntilMs - now}ms left) — ignoring event")
            return
        }

        // 3. Debounce
        if (now - lastClickTime < DEBOUNCE_MS) {
            Log.d(TAG, "⏳ Debounce: ignoring event (${now - lastClickTime}ms since last click)")
            return
        }

        // 4. Single in-flight processing lock
        if (isProcessingDialog) {
            Log.d(TAG, "🔒 Processing lock busy — ignoring re-entrant event from $packageName")
            return
        }
        isProcessingDialog = true

        Log.d(TAG, "📱 STATE event from $packageName session=$ussdSessionToken pinSet=$pinSetCount submit=$submitCount")

        handler.postDelayed({
            try {
                tryClickConfirmButton(event)
            } catch (e: Exception) {
                Log.e(TAG, "❌ tryClickConfirmButton crashed: ${e.message}")
            } finally {
                isProcessingDialog = false
            }
        }, CLICK_DELAY_MS)
    }

    private fun tryClickConfirmButton(event: AccessibilityEvent) {
        try {
            val source = event.source ?: rootInActiveWindow ?: return
            
            // CAPTURE ALL DIALOG TEXT FIRST - before any filtering
            val dialogText = extractDialogText(source)
            
            // ALWAYS save dialog text if not empty - for delivery_notes
            if (!dialogText.isNullOrBlank()) {
                Log.d(TAG, "📝 Dialog text captured: ${dialogText.take(200)}")
                saveUssdResponse(dialogText)
            }

            // ===== DYNAMIC USSD FLOW HANDLER =====
            // Try to match the current dialog against admin-defined ussd_flow_steps.
            // If a step matches, type the response_template and submit — overrides legacy logic.
            if (!dialogText.isNullOrBlank() && tryHandleDynamicFlow(source, dialogText)) {
                source.recycle()
                return
            }

            // CHECK FOR PIN INPUT DIALOG - only enter PIN once per USSD session
            val isPinDialog = dialogText?.contains("PIN", ignoreCase = true) == true ||
                             dialogText?.contains("pin", ignoreCase = true) == true ||
                             dialogText?.contains("password", ignoreCase = true) == true ||
                             dialogText?.contains("furaha", ignoreCase = true) == true
            
            if (isPinDialog) {
                Log.d(TAG, "🔐 PIN dialog detected (legacy path) pinSet=$pinSetCount submit=$submitCount")

                val rawPin = (getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getString("current_pin_code", "") ?: "").trim()

                if (!pinFilledForSession) {
                    if (!safeEnterPin(source, rawPin)) {
                        Log.w(TAG, "⚠️ Legacy PIN entry skipped or failed (already filled or invalid)")
                        source.recycle()
                        return
                    }
                } else {
                    Log.d(TAG, "⏭️ PIN already filled for this session, skipping re-entry")
                }

                // Single submit guarantee — replaces inline postDelayed
                submitPinOnce(delayMs = 300L, source = "legacy-pin-dialog")

                source.recycle()
                return
            }
            
            // Search for clickable buttons with confirm text
            for (buttonText in CONFIRM_BUTTONS) {
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
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        // Prefer the explicit flow_id assigned to this provider (admin-configured),
        // fall back to trigger-code lookup for backward compatibility.
        val flowId = prefs.getString("current_ussd_flow_id", null)
        val trigger = prefs.getString("current_trigger_code", null)
        val flow = try {
            UssdFlowsClient.findFlowById(flowId) ?: UssdFlowsClient.findFlowForTrigger(trigger)
        } catch (e: Exception) {
            Log.e(TAG, "Flow lookup error: ${e.message}"); null
        } ?: return false

        val lower = dialogText.lowercase()
        val step = flow.steps.firstOrNull { s ->
            s.order !in completedFlowSteps &&
            s.keywords.isNotEmpty() &&
            s.keywords.any { kw -> lower.contains(kw.lowercase()) }
        } ?: return false

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
            submitPinOnce(delayMs = 300L, source = "flow-step-${step.order}")
            return true
        }

        // ===== Non-PIN flow step: clear + write once, then submit =====
        val edits = mutableListOf<AccessibilityNodeInfo>()
        findEditTexts(root, edits)
        if (edits.isEmpty()) {
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

        // Suppress the CONTENT_CHANGED echo from this SET_TEXT
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
        val r = Runnable {
            val rt = rootInActiveWindow ?: return@Runnable
            try {
                submitCount++
                Log.d(TAG, "📨 Non-PIN flow submit step=${step.order} submitCount=$submitCount")
                clickSendOrOkButton(rt)
            } finally { rt.recycle() }
        }
        scheduledSubmitRunnable = r
        handler.postDelayed(r, 300)
        return true
    }

    /** Format amount string for USSD: "11.60" -> "11*60", "20" -> "20", "0.10" -> "010" */
    private fun formatAmountForUssd(raw: String): String {
        if (raw.isBlank()) return ""
        val n = raw.toDoubleOrNull() ?: return raw
        if (n == n.toLong().toDouble()) return n.toLong().toString()
        val f = String.format("%.2f", n)
        return if (n < 1) f.replace(".", "") else f.replace(".", "*")
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
    private fun saveUssdResponse(text: String) {
        try {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_LAST_USSD_RESPONSE, text)
                .putLong(KEY_LAST_USSD_RESPONSE_TIME, System.currentTimeMillis())
                .apply()
            Log.d(TAG, "💾 Saved USSD response to SharedPreferences: ${text.take(100)}")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to save USSD response: ${e.message}")
        }
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
        try {
            val editTexts = mutableListOf<AccessibilityNodeInfo>()
            findEditTexts(root, editTexts)
            
            Log.d(TAG, "🔐 Found ${editTexts.size} EditText fields in PIN dialog")
            if (editTexts.isEmpty()) return false

            var setSuccess = false
            for (editText in editTexts) {
                val existing = editText.text?.toString()?.trim().orEmpty()

                // Force replace existing text with exact PIN value (no appending)
                editText.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                val arguments = android.os.Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, pin)
                }
                val success = editText.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)

                if (success) {
                    setSuccess = true
                    Log.d(TAG, "✅ PIN '$pin' set successfully (replaced previous value='$existing')")
                }
            }

            editTexts.forEach { it.recycle() }
            return setSuccess
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to enter PIN: ${e.message}")
        }
        return false
    }
    
    /**
     * Recursively find all EditText fields in the view hierarchy
     */
    private fun findEditTexts(node: AccessibilityNodeInfo, results: MutableList<AccessibilityNodeInfo>) {
        try {
            val className = node.className?.toString() ?: ""
            if (className.contains("EditText", ignoreCase = true) || node.isEditable) {
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
    
    /**
     * Click Send/OK button after entering PIN
     */
    private fun clickSendOrOkButton(root: AccessibilityNodeInfo) {
        try {
            // Priority order: Send > OK > Confirm
            val sendButtons = listOf("Send", "send", "SEND", "Dir", "dir", "DIR", "OK", "ok", "Ok", "Confirm", "confirm")
            
            for (buttonText in sendButtons) {
                val nodes = root.findAccessibilityNodeInfosByText(buttonText)
                for (node in nodes) {
                    if (isClickableButton(node)) {
                        val clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        if (clicked) {
                            clickCount++
                            lastClickTime = System.currentTimeMillis()
                            Log.d(TAG, "✅ Clicked '$buttonText' after PIN entry (click #$clickCount)")
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
        multiDialogRunnable?.let { handler.removeCallbacks(it) }
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
