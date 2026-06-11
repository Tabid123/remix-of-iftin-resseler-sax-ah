package com.iftin.delivery.api

import android.util.Log
import okhttp3.Request
import org.json.JSONArray

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
    private const val CACHE_TTL_MS = 5 * 60 * 1000L

    fun loadFlows(force: Boolean = false): Map<String, Flow> {
        val now = System.currentTimeMillis()
        if (!force && byTrigger.isNotEmpty() && now - cacheLoadedAt < CACHE_TTL_MS) {
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
                    val stepsArr = f.optJSONArray("ussd_flow_steps") ?: continue
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
                byTrigger = outTrigger
                byId = outId
                cacheLoadedAt = now
                Log.d(TAG, "Loaded ${outTrigger.size} USSD flows")
                outTrigger
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading flows: ${e.message}")
            byTrigger
        }
    }

    fun findFlowForTrigger(trigger: String?): Flow? {
        if (trigger.isNullOrBlank()) return null
        loadFlows()
        return byTrigger[normalizeTrigger(trigger)]
    }

    fun findFlowById(id: String?): Flow? {
        if (id.isNullOrBlank()) return null
        loadFlows()
        return byId[id]
    }

    /** Returns all enabled flows (loads if needed). Used for fallback content matching. */
    fun allFlows(): Collection<Flow> {
        loadFlows()
        return byTrigger.values
    }

    private fun normalizeTrigger(t: String): String = t.trim().lowercase()
}
