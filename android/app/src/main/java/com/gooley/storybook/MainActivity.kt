package com.gooley.storybook

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.gooley.storybook.data.sync.SyncWorker
import com.gooley.storybook.ui.navigation.NavGraph
import com.gooley.storybook.ui.theme.StorybookTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Schedule background sync every 15 minutes + run one immediately
        SyncWorker.schedulePeriodicSync(this)
        SyncWorker.syncNow(this)

        setContent {
            StorybookTheme {
                NavGraph()
            }
        }
    }
}
