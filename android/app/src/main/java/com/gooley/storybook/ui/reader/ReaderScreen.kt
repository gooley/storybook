package com.gooley.storybook.ui.reader

import android.app.Activity
import android.content.res.Configuration
import android.util.Log
import android.view.WindowManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import coil3.compose.AsyncImage
import com.gooley.storybook.data.model.Page
import com.gooley.storybook.data.repository.BookRepository

@Composable
fun ReaderScreen(
    bookId: Long,
    repository: BookRepository,
    onBack: () -> Unit
) {
    val viewModel = remember { ReaderViewModel(repository, bookId) }
    val book by viewModel.book.collectAsState()
    val pages by viewModel.pages.collectAsState()
    val isRegenerating by viewModel.isRegenerating.collectAsState()
    val progress by viewModel.progress.collectAsState()

    var currentPage by remember { mutableIntStateOf(0) }
    var showExitOverlay by remember { mutableStateOf(false) }

    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

    Log.d("ReaderScreen", "Render: bookId=$bookId, pages.size=${pages.size}, landscape=$isLandscape, pages=${pages.map { "p${it.pageNumber}(${it.imageStatus})" }}")

    // Auto-regenerate illustrations if any are missing
    LaunchedEffect(pages.map { it.imageStatus }) {
        if (pages.isNotEmpty() && pages.any { it.imageStatus != Page.IMAGE_DONE }) {
            viewModel.regenerateIllustrations()
        }
    }

    // Immersive sticky mode: hides status bar and nav bar to prevent kids
    // from accidentally pulling down notifications or triggering back gestures.
    // Bars briefly reappear on edge swipe then auto-hide.
    val view = LocalView.current
    DisposableEffect(Unit) {
        val window = (view.context as Activity).window
        val controller = WindowCompat.getInsetsController(window, view)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        // Prevent touches near the top from revealing the status bar
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)

        onDispose {
            controller.show(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
            WindowCompat.setDecorFitsSystemWindows(window, true)
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        }
    }

    if (pages.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
                Text(
                    "Loading story...",
                    modifier = Modifier.padding(top = 16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    } else {
        // Clamp page index if pages list changes
        if (currentPage >= pages.size) currentPage = pages.size - 1

        Box(modifier = Modifier.fillMaxSize()) {
            // Layer 1: page content (image + text in portrait, image only in landscape)
            if (isLandscape) {
                LandscapePageContent(page = pages[currentPage])
            } else {
                PortraitPageContent(page = pages[currentPage])
            }

            // Layer 2: invisible tap zones with top dead zone
            Column(modifier = Modifier.fillMaxSize()) {
                // Top 10% dead zone — lets the Android control bar pull-down through
                Spacer(modifier = Modifier.fillMaxWidth().fillMaxHeight(0.1f))

                // Tap zones fill the remaining 90%
                Row(modifier = Modifier.fillMaxSize()) {
                    // Left 20% — previous page
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) {
                                if (currentPage > 0) {
                                    currentPage--
                                    showExitOverlay = false
                                }
                            }
                    )
                    // Center 60% — toggle exit overlay
                    Box(
                        modifier = Modifier
                            .weight(3f)
                            .fillMaxHeight()
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) {
                                showExitOverlay = !showExitOverlay
                            }
                    )
                    // Right 20% — next page
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) {
                                if (currentPage < pages.size - 1) {
                                    currentPage++
                                    showExitOverlay = false
                                }
                            }
                    )
                }
            }

            // Layer 3: landscape bottom text bar — always visible, semi-transparent
            if (isLandscape) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.55f))
                        .padding(horizontal = 32.dp, vertical = 16.dp)
                ) {
                    Text(
                        text = pages[currentPage].text,
                        fontSize = 18.sp,
                        lineHeight = 26.sp,
                        textAlign = TextAlign.Center,
                        color = Color.White,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            // Layer 4: exit overlay — above tap zones, works in both orientations
            AnimatedVisibility(
                visible = showExitOverlay,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.align(Alignment.TopCenter)
            ) {
                Box(
                    modifier = Modifier
                        .padding(top = 24.dp)
                        .background(
                            Color.Black.copy(alpha = 0.6f),
                            RoundedCornerShape(16.dp)
                        )
                        .padding(8.dp)
                ) {
                    FilledTonalButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ExitToApp,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.padding(horizontal = 4.dp))
                        Text("Exit Book")
                    }
                }
            }

            // Page indicator — top-right in landscape, bottom-center in portrait
            Box(
                modifier = Modifier
                    .align(if (isLandscape) Alignment.TopEnd else Alignment.BottomCenter)
                    .padding(
                        top = if (isLandscape) 16.dp else 0.dp,
                        end = if (isLandscape) 16.dp else 0.dp,
                        bottom = if (isLandscape) 0.dp else 16.dp
                    )
                    .background(
                        Color.Black.copy(alpha = 0.4f),
                        RoundedCornerShape(12.dp)
                    )
                    .padding(horizontal = 14.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "${currentPage + 1} / ${pages.size}",
                    fontSize = 14.sp,
                    color = Color.White
                )
            }
        }
    }
}

/**
 * Portrait: full-bleed image edge-to-edge at top, text below.
 */
@Composable
private fun PortraitPageContent(page: Page) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Full-bleed illustration — no padding, no rounded corners
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(4f / 3f),
            contentAlignment = Alignment.Center
        ) {
            PageIllustration(
                page = page,
                contentScale = ContentScale.Crop
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Story text
        Text(
            text = page.text,
            fontSize = 22.sp,
            lineHeight = 32.sp,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 8.dp)
        )
    }
}

/**
 * Landscape: full-screen image only. Text panel is handled separately above tap zones.
 */
@Composable
private fun LandscapePageContent(page: Page) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        PageIllustration(
            page = page,
            contentScale = ContentScale.Crop
        )
    }
}

/**
 * Shared illustration rendering — handles all image states.
 */
@Composable
private fun PageIllustration(page: Page, contentScale: ContentScale) {
    if (page.imagePath != null && page.imageStatus == Page.IMAGE_DONE) {
        AsyncImage(
            model = page.imagePath,
            contentDescription = "Illustration for page ${page.pageNumber}",
            modifier = Modifier.fillMaxSize(),
            contentScale = contentScale
        )
    } else if (page.imageStatus == Page.IMAGE_GENERATING) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Text("Drawing...", modifier = Modifier.padding(top = 8.dp))
        }
    } else {
        Text("🎨", fontSize = 64.sp)
    }
}
