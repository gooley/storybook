package com.gooley.storybook.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF4A6741),
    onPrimary = Color.White,
    background = Color(0xFFFFFBF5),
    onBackground = Color(0xFF1A1A1A),
    surface = Color(0xFFFFFBF5),
    onSurface = Color(0xFF1A1A1A),
    onSurfaceVariant = Color(0xFF5A5A5A),
)

@Composable
fun StorybookTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        content = content
    )
}
