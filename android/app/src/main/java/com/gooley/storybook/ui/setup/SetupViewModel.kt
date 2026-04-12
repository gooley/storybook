package com.gooley.storybook.ui.setup

import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gooley.storybook.data.auth.AuthClient
import com.gooley.storybook.data.auth.ServerConfig
import kotlinx.coroutines.launch

enum class SetupStep {
    SERVER_URL,
    PASSWORD,
    CONNECTING,
    DONE
}

class SetupViewModel : ViewModel() {
    var serverUrl by mutableStateOf("")
    var password by mutableStateOf("")
    var step by mutableStateOf(SetupStep.SERVER_URL)
    var errorMessage by mutableStateOf<String?>(null)
    var isLoading by mutableStateOf(false)
    var authMode by mutableStateOf("")

    private val authClient = AuthClient()

    fun connectToServer() {
        val url = serverUrl.trim().trimEnd('/')
        if (url.isEmpty()) {
            errorMessage = "Enter a server URL"
            return
        }
        // Ensure https:// prefix
        val normalizedUrl = if (!url.startsWith("http://") && !url.startsWith("https://")) {
            "https://$url"
        } else {
            url
        }
        serverUrl = normalizedUrl

        isLoading = true
        errorMessage = null
        step = SetupStep.CONNECTING

        viewModelScope.launch {
            try {
                val status = authClient.checkServer(normalizedUrl)
                authMode = status.authMode

                when (status.authMode) {
                    "external" -> {
                        // gool3yhost: skip password, server handles auth via proxy
                        // User needs an API key from gool3yhost
                        ServerConfig.serverUrl = normalizedUrl
                        ServerConfig.authMode = "external"
                        step = SetupStep.PASSWORD  // Reuse for API key entry
                    }
                    "local" -> {
                        if (status.needsSetup) {
                            errorMessage = "This server hasn't been set up yet. Complete setup in the web app first."
                            step = SetupStep.SERVER_URL
                        } else {
                            ServerConfig.serverUrl = normalizedUrl
                            ServerConfig.authMode = "local"
                            step = SetupStep.PASSWORD
                        }
                    }
                    else -> {
                        errorMessage = "Unknown auth mode: ${status.authMode}"
                        step = SetupStep.SERVER_URL
                    }
                }
            } catch (e: Exception) {
                errorMessage = "Can't reach server: ${e.message}"
                step = SetupStep.SERVER_URL
            } finally {
                isLoading = false
            }
        }
    }

    fun login() {
        if (password.isEmpty()) {
            errorMessage = if (authMode == "external") "Enter your API key" else "Enter your password"
            return
        }

        isLoading = true
        errorMessage = null

        viewModelScope.launch {
            try {
                if (authMode == "external") {
                    // For external auth, the "password" field is actually a gool3yhost API key.
                    // Verify it works by calling auth/check with it as a Bearer token.
                    val check = authClient.checkAuth(serverUrl, password)
                    if (check.authenticated) {
                        ServerConfig.authToken = password
                        step = SetupStep.DONE
                    } else {
                        errorMessage = "API key not accepted. Check that it's valid and scoped to this app."
                    }
                } else {
                    // Local auth: POST password to get session token
                    val result = authClient.login(serverUrl, password)
                    if (result.success && result.token != null) {
                        ServerConfig.authToken = result.token
                        step = SetupStep.DONE
                    } else {
                        errorMessage = result.error ?: "Login failed"
                    }
                }
            } catch (e: Exception) {
                errorMessage = "Connection error: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }

    /**
     * Build an intent to create a gool3yhost API key via the browser.
     * The auth service will redirect back to storybook://callback?api_key=...
     */
    fun buildApiKeyIntent(): Intent? {
        if (authMode != "external") return null
        try {
            val host = Uri.parse(serverUrl).host ?: return null
            // Derive auth URL: if app is at app.gool3y.com, auth is at auth.gool3y.com
            val parts = host.split(".")
            if (parts.size < 3) return null
            val authHost = "auth.${parts.drop(1).joinToString(".")}"
            val createUrl = "https://$authHost/keys/create?app_host=$host&callback_uri=storybook://callback&label=Android+App"
            return Intent(Intent.ACTION_VIEW, Uri.parse(createUrl))
        } catch (_: Exception) {
            return null
        }
    }

    fun disconnect() {
        ServerConfig.clear()
        serverUrl = ""
        password = ""
        authMode = ""
        errorMessage = null
        step = SetupStep.SERVER_URL
    }
}
