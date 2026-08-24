package com.iftin.delivery.auth

import android.content.Context
import android.provider.Settings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import com.iftin.delivery.api.DeliveryApiClient

/**
 * Supabase email/password session for the delivery device.
 *
 * Each company (tenant) logs in with its own account. After login the device is
 * linked to that tenant, so `claim_next_delivery` only hands out that tenant's
 * orders and the SIM PIN comes from that tenant's settings.
 */
object TenantSession {

    private const val PREFS = "iftin_tenant_session"
    private const val KEY_ACCESS = "access_token"
    private const val KEY_REFRESH = "refresh_token"
    private const val KEY_EMAIL = "email"
    private const val KEY_TENANT_ID = "tenant_id"
    private const val KEY_TENANT_NAME = "tenant_name"

    private const val SUPABASE_URL = "https://zshzcuomdegeijqznvvu.supabase.co"
    private val ANON_KEY: String by lazy { DeliveryApiClient().getAnonKey() }

    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    private val http = DeliveryApiClient.sharedClient

    data class Result(val ok: Boolean, val error: String? = null, val tenantName: String? = null)

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isLoggedIn(context: Context): Boolean =
        !prefs(context).getString(KEY_ACCESS, null).isNullOrBlank() &&
            !prefs(context).getString(KEY_TENANT_ID, null).isNullOrBlank()

    fun accessToken(context: Context): String? = prefs(context).getString(KEY_ACCESS, null)
    fun email(context: Context): String? = prefs(context).getString(KEY_EMAIL, null)
    fun tenantId(context: Context): String? = prefs(context).getString(KEY_TENANT_ID, null)
    fun tenantName(context: Context): String? = prefs(context).getString(KEY_TENANT_NAME, null)

    fun logout(context: Context) {
        prefs(context).edit().clear().apply()
    }

    fun deviceId(context: Context): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"

    /** Sign in with email + password, then link this device to the account's tenant. */
    suspend fun signIn(context: Context, email: String, password: String): Result =
        withContext(Dispatchers.IO) {
            try {
                val body = JSONObject()
                    .put("email", email.trim())
                    .put("password", password)
                    .toString()
                    .toRequestBody(JSON_MEDIA)

                val request = Request.Builder()
                    .url("$SUPABASE_URL/auth/v1/token?grant_type=password")
                    .addHeader("apikey", ANON_KEY)
                    .addHeader("Content-Type", "application/json")
                    .post(body)
                    .build()

                http.newCall(request).execute().use { response ->
                    val raw = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        val msg = runCatching { JSONObject(raw).optString("error_description").ifEmpty { JSONObject(raw).optString("msg") } }
                            .getOrNull()
                            .orEmpty()
                        return@withContext Result(false, msg.ifEmpty { "Email ama password khalad ah" })
                    }

                    val json = JSONObject(raw)
                    val access = json.optString("access_token")
                    val refresh = json.optString("refresh_token")
                    if (access.isEmpty()) return@withContext Result(false, "Session lama helin")

                    prefs(context).edit()
                        .putString(KEY_ACCESS, access)
                        .putString(KEY_REFRESH, refresh)
                        .putString(KEY_EMAIL, email.trim())
                        .apply()

                    return@withContext linkDevice(context, access)
                }
            } catch (e: Exception) {
                Result(false, e.message ?: "Internet ma jiro")
            }
        }

    /** Links the device to the tenant of the signed-in user. Safe to call on every app start. */
    suspend fun linkDevice(context: Context, token: String? = null): Result =
        withContext(Dispatchers.IO) {
            val access = token ?: accessToken(context) ?: return@withContext Result(false, "not_authenticated")
            try {
                val payload = JSONObject()
                    .put("p_device_id", deviceId(context))
                    .put("p_device_name", android.os.Build.MODEL ?: "Android device")
                    .toString()
                    .toRequestBody(JSON_MEDIA)

                val request = Request.Builder()
                    .url("$SUPABASE_URL/rest/v1/rpc/link_device_to_tenant")
                    .addHeader("apikey", ANON_KEY)
                    .addHeader("Authorization", "Bearer $access")
                    .addHeader("Content-Type", "application/json")
                    .post(payload)
                    .build()

                http.newCall(request).execute().use { response ->
                    val raw = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        return@withContext Result(false, "Device lama xirin (${response.code})")
                    }
                    val json = JSONObject(raw)
                    if (!json.optBoolean("ok", false)) {
                        val err = json.optString("error")
                        val msg = when (err) {
                            "no_tenant" -> "Akoonkan shirkad ma laha"
                            "not_authenticated" -> "Fadlan mar kale gal"
                            else -> "Device lama xirin"
                        }
                        return@withContext Result(false, msg)
                    }
                    val name = json.optString("tenant_name")
                    prefs(context).edit()
                        .putString(KEY_TENANT_ID, json.optString("tenant_id"))
                        .putString(KEY_TENANT_NAME, name)
                        .apply()
                    Result(true, tenantName = name)
                }
            } catch (e: Exception) {
                Result(false, e.message ?: "Internet ma jiro")
            }
        }
}
