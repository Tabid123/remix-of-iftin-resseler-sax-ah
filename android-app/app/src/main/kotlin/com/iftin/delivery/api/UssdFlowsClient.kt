package com.iftin.delivery.api

import android.os.Looper
import android.util.Log
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Fetches dynamic USSD flows + steps from Supabase.
 * Used by UssdAccessibilityService to drive multi-step interactive USSD menus.
 */
object UssdFlowsClient {
    private const val TAG = "UssdFlowsClient"
    private const val REST_URL = "https://zshzcuomdegeijqznvvu.supabase.co/rest/v1"
    private const val ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaHpjdW9tZGVnZWlqcXpudnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTY2MDEsImV4cCI6MjA5Mzk3MjYwMX0.82Bdtu_h-6qdM2my0OT7mxhbi2wFYHBcKJ654oizo3o"

    data class FlowStep(
        val order: Int,
        val keywords: List<String>,
        val responseTemplate: String,
        val isPinField: Boolean
    )

    data class Flow(
        val id: String,
        val triggerCode: String,
        val steps: List<FlowStep>
    )

    @Volatile private var byTrigger: Map<String, Flow> = emptyMap()
    @Volatile private var byId: Map<String, Flow> = emptyMap()
    @Volatile private var cacheLoadedAt: Long = 0L
    @Volatile private var preloadInFlight = false
    private const val CACHE_TTL_MS = 5 * 60 * 1000L

    /**
     * HARD-CODED fallback flows. Used when the network is unavailable, the remote
     * fetch fails, or the requested flow/trigger is missing from the server payload.
     * These guarantee Somtel + Somnet keep working 100% offline.
     */
    private val BUILTIN_FLOWS: List<Flow> = listOf(
        Flow(
            id = "a0204e0c-f82e-464a-93ae-eb901422ec39",
            triggerCode = "*300#",
            steps = listOf(
                FlowStep(1, listOf("reseller", "reseller service", "transfer", "wareeji"), "3", false),
                FlowStep(2, listOf("receiver", "reciver", "number", "phone", "lambar", "geli lambar", "telefoon", "enter number", "taleefan", "geli taleefan", "wareejineeso"), "{receiver}", false),
                FlowStep(3, listOf("amount", "lacag", "lacagta", "qiimo", "qiimaha", "wadarta", "enter amount", "dollar", "total"), "{amount}", false),
                FlowStep(4, listOf("pin", "furaha", "sirta", "password", "secret", "enter pin", "geli pin", "pin-kaaga", "ma hubtaa"), "{pin}", true)
            )
        ),
        Flow(
            id = "3f6a1d2e-9c44-4b81-a5c7-71e0b9d5c2a1",
            triggerCode = "*825#",
            steps = listOf(
                FlowStep(1, listOf("pin", "furaha", "sirta", "password", "secret", "geli pin", "geli furaha", "pin-kaaga", "enter pin"), "{pin}", true),
                FlowStep(2, listOf("dirid", "dirid lacag", "lacag dirid", "send money", "lacag", "menu", "xulo", "dooro"), "2", false),
                FlowStep(3, listOf("geli mobilka", "geli mobile", "fadlan geli mobilka", "mobilka", "mobile", "lambarka", "taleefan", "number"), "{receiver}", false),
                FlowStep(4, listOf("hubi mobilka", "fadlan hubi mobilka", "hubi mobil", "hubi", "confirm number", "xaqiiji lambarka"), "{receiver}", false),
                FlowStep(5, listOf("geli lacagta", "fadlan geli lacagta", "lacagta", "amount", "qiimaha", "enter amount"), "{amount}", false),
                FlowStep(6, listOf("mu hubtaa", "ma hubtaa", "wareejisid", "wareejiso", "haa", "maya", "confirm", "xaqiiji", "yes"), "1", false)
            )
        )
    )

    private val builtinByTrigger: Map<String, Flow> = BUILTIN_FLOWS.associateBy { normalizeTrigger(it.triggerCode) }
    private val builtinById: Map<String, Flow> = BUILTIN_FLOWS.associateBy { it.id }

    fun warmCacheAsync(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && byTrigger.isNotEmpty() && now - cacheLoadedAt < CACHE_TTL_MS) {
            return
        }
        if (preloadInFlight) return
        preloadInFlight = true
        thread(name = "UssdFlowsWarmup", isDaemon = true) {
            try {
                loadFlows(force = force)
            } finally {
                preloadInFlight = false
            }
        }
    }

    fun loadFlows(force: Boolean = false): Map<String, Flow> {
        val now = System.currentTimeMillis()
        if (!force && byTrigger.isNotEmpty() && now - cacheLoadedAt < CACHE_TTL_MS) {
            return byTrigger
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            Log.w(TAG, "loadFlows called on main thread; returning cache and warming async")
            warmCacheAsync(force = force)
            return byTrigger
        }
        return try {
            val req = Request.Builder()
                .url("$REST_URL/ussd_flows?select=id,trigger_code,is_enabled,ussd_flow_steps(step_order,match_keywords,response_template,is_pin_field)&is_enabled=eq.true&order=trigger_code")
                .header("apikey", ANON_KEY)
                .header("Authorization", "Bearer $ANON_KEY")
                .get()
                .build()
            DeliveryApiClient.sharedClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "Failed to load flows: ${resp.code}")
                    return byTrigger
                }
                val body = resp.body?.string() ?: return byTrigger
                val arr = JSONArray(body)
                val outTrigger = mutableMapOf<String, Flow>()
                val outId = mutableMapOf<String, Flow>()
                for (i in 0 until arr.length()) {
                    val f = arr.getJSONObject(i)
                    val id = f.optString("id").trim()
                    val trigger = f.optString("trigger_code").trim()
                    if (id.isBlank() || trigger.isBlank()) continue
                    val stepsArr = f.optJSONArray("ussd_flow_steps") ?: JSONArray()
                    val steps = mutableListOf<FlowStep>()
                    for (j in 0 until stepsArr.length()) {
                        val s = stepsArr.getJSONObject(j)
                        val kwArr = s.optJSONArray("match_keywords") ?: JSONArray()
                        val kws = (0 until kwArr.length()).map { kwArr.getString(it).trim() }.filter { it.isNotBlank() }
                        steps.add(
                            FlowStep(
                                order = s.optInt("step_order", j + 1),
                                keywords = kws,
                                responseTemplate = s.optString("response_template", ""),
                                isPinField = s.optBoolean("is_pin_field", false)
                            )
                        )
                    }
                    steps.sortBy { it.order }
                    val flow = Flow(id, trigger, steps)
                    outTrigger[normalizeTrigger(trigger)] = flow
                    outId[id] = flow
                }
                synchronized(this) {
                    // Remote wins, built-ins fill any gaps
                    byTrigger = builtinByTrigger + outTrigger
                    byId = builtinById + outId
                    cacheLoadedAt = now
                }
                Log.d(TAG, "Loaded ${outTrigger.size} USSD flows (+${builtinByTrigger.size} builtin fallbacks)")
                byTrigger
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading flows: ${e.message}")
            if (byTrigger.isEmpty()) builtinByTrigger else byTrigger
        }
    }

    fun findFlowForTrigger(trigger: String?): Flow? {
        if (trigger.isNullOrBlank()) return null
        loadFlows()
        val key = normalizeTrigger(trigger)
        byTrigger[key]?.let { return it }
        // Miss → force refresh once (new/updated flow may not be in cache yet)
        loadFlows(force = true)
        return byTrigger[key] ?: builtinByTrigger[key]?.also {
            Log.w(TAG, "Using BUILTIN hardcoded flow for trigger $key")
        }
    }

    fun findFlowById(id: String?): Flow? {
        if (id.isNullOrBlank()) return null
        loadFlows()
        byId[id]?.let { return it }
        // Miss → force refresh once (admin may have just enabled/edited this flow)
        loadFlows(force = true)
        return byId[id] ?: builtinById[id]?.also {
            Log.w(TAG, "Using BUILTIN hardcoded flow for id $id")
        }
    }

    /**
     * Log an unmatched dialog to Supabase so admins can teach the system new keywords.
     * Fire-and-forget, dedup by (flow_id, dialog_text) using a per-run in-memory set.
     */
    private val unmatchedSeen = java.util.Collections.newSetFromMap(java.util.concurrent.ConcurrentHashMap<String, Boolean>())
    fun logUnmatchedAsync(flowId: String?, stepOrder: Int?, dialogText: String?, deviceId: String?) {
        if (dialogText.isNullOrBlank()) return
        val key = "${flowId ?: ""}|${dialogText.take(120)}"
        if (!unmatchedSeen.add(key)) return
        thread(name = "UssdUnmatchedLog", isDaemon = true) {
            try {
                val payload = JSONObject()
                    .put("dialog_text", dialogText.take(1000))
                    .apply {
                        if (!flowId.isNullOrBlank()) put("flow_id", flowId)
                        if (stepOrder != null) put("step_order", stepOrder)
                        if (!deviceId.isNullOrBlank()) put("device_id", deviceId)
                    }
                val body = payload.toString().toRequestBody("application/json".toMediaType())
                val req = Request.Builder()
                    .url("$REST_URL/ussd_unmatched_dialogs")
                    .header("apikey", ANON_KEY)
                    .header("Authorization", "Bearer $ANON_KEY")
                    .header("Content-Type", "application/json")
                    .header("Prefer", "return=minimal")
                    .post(body)
                    .build()
                DeliveryApiClient.sharedClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        Log.w(TAG, "logUnmatched failed: ${resp.code}")
                    } else {
                        Log.d(TAG, "📝 Logged unmatched dialog for learning")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "logUnmatched error: ${e.message}")
            }
        }
    }

    /** Returns all enabled flows (loads if needed). Used for fallback content matching. */
    fun allFlows(): Collection<Flow> {
        loadFlows()
        return if (byTrigger.isEmpty()) builtinByTrigger.values else byTrigger.values
    }

    private fun normalizeTrigger(t: String): String = t.trim().lowercase()
}
