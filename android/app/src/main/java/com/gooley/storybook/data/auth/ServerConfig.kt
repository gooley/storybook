package com.gooley.storybook.data.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Stores server connection config (URL + auth token) in encrypted storage.
 * Supports two auth modes:
 *   - "local": password-based login, token stored from login response
 *   - "external": API key obtained via gool3yhost OAuth flow
 */
object ServerConfig {
    private const val PREFS_NAME = "storybook_server_config"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_AUTH_TOKEN = "auth_token"
    private const val KEY_AUTH_MODE = "auth_mode"

    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs != null) return
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        migrateFromBuildConfig()
    }

    /**
     * If BuildConfig has SYNC_API_URL/SYNC_API_KEY baked in at build time
     * and ServerConfig hasn't been configured yet, auto-populate from those
     * values so the user skips the setup screen.
     */
    private fun migrateFromBuildConfig() {
        if (isConfigured) return
        val buildUrl = com.gooley.storybook.BuildConfig.SYNC_API_URL
        val buildKey = com.gooley.storybook.BuildConfig.SYNC_API_KEY
        if (buildUrl.isNotEmpty() && buildKey.isNotEmpty()) {
            serverUrl = buildUrl
            authToken = buildKey
        }
    }

    private fun requirePrefs(): SharedPreferences =
        prefs ?: throw IllegalStateException("ServerConfig.init() not called")

    var serverUrl: String
        get() = requirePrefs().getString(KEY_SERVER_URL, "") ?: ""
        set(value) = requirePrefs().edit().putString(KEY_SERVER_URL, value.trimEnd('/')).apply()

    var authToken: String
        get() = requirePrefs().getString(KEY_AUTH_TOKEN, "") ?: ""
        set(value) = requirePrefs().edit().putString(KEY_AUTH_TOKEN, value).apply()

    var authMode: String
        get() = requirePrefs().getString(KEY_AUTH_MODE, "") ?: ""
        set(value) = requirePrefs().edit().putString(KEY_AUTH_MODE, value).apply()

    val isConfigured: Boolean
        get() = serverUrl.isNotEmpty() && authToken.isNotEmpty()

    fun clear() {
        requirePrefs().edit().clear().apply()
    }
}
