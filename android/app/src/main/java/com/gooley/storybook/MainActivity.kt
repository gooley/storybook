package com.gooley.storybook

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.gooley.storybook.data.auth.ServerConfig
import com.gooley.storybook.data.sync.SyncWorker
import com.gooley.storybook.ui.navigation.NavGraph
import com.gooley.storybook.ui.theme.StorybookTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        ServerConfig.init(this)

        // Schedule background sync if already configured
        if (ServerConfig.isConfigured) {
            SyncWorker.schedulePeriodicSync(this)
            SyncWorker.syncNow(this)
        }

        // Check for API key from deep link (storybook://callback?api_key=...)
        val apiKeyFromDeepLink = extractApiKeyFromIntent(intent)

        setContent {
            StorybookTheme {
                NavGraph(initialApiKey = apiKeyFromDeepLink)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Handle deep link when app is already running
        val apiKey = extractApiKeyFromIntent(intent)
        if (apiKey != null) {
            setIntent(intent)
            setContent {
                StorybookTheme {
                    NavGraph(initialApiKey = apiKey)
                }
            }
        }
    }

    private fun extractApiKeyFromIntent(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        if (uri.scheme == "storybook" && uri.host == "callback") {
            return uri.getQueryParameter("api_key")
        }
        return null
    }
}
