package com.gooley.storybook.ui.reader

import android.app.Activity
import android.content.res.Configuration
import android.util.Log
import android.view.WindowManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import coil3.compose.AsyncImage
import com.gooley.storybook.data.model.Page
import com.gooley.storybook.data.repository.BookRepository

@OptIn(ExperimentalFoundationApi::class)
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
    val soundEnabled by viewModel.soundEnabled.collectAsState()
    val textVisible by viewModel.textVisible.collectAsState()
    val pageAudioMap by viewModel.pageAudioMap.collectAsState()

    var currentPage by remember { mutableIntStateOf(0) }
    var showExitOverlay by remember { mutableStateOf(false) }

    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

    val hasAudio = pageAudioMap.isNotEmpty()

    Log.d("ReaderScreen", "Render: bookId=$bookId, pages.size=${pages.size}, landscape=$isLandscape, pages=${pages.map { "p${it.pageNumber}(${it.imageStatus})" }}")

    // Load audio when pages change
    LaunchedEffect(pages) {
        if (pages.isNotEmpty()) {
            viewModel.loadAudioForPages(pages)
        }
    }

    // Auto-regenerate illustrations if any are missing
    LaunchedEffect(pages.map { it.imageStatus }) {
        if (pages.isNotEmpty() && pages.any { it.imageStatus != Page.IMAGE_DONE }) {
            viewModel.regenerateIllustrations()
        }
    }

    // Play ambient on page change or when audio data loads
    LaunchedEffect(currentPage, soundEnabled, pageAudioMap) {
        if (pages.isNotEmpty() && currentPage < pages.size) {
            viewModel.onPageChange(pages[currentPage])
        }
    }

    // Cleanup audio on dispose
    DisposableEffect(viewModel) {
        onDispose { viewModel.audioManager.release() }
    }

    // Immersive sticky mode
    val view = LocalView.current
    DisposableEffect(Unit) {
        val window = (view.context as Activity).window
        val controller = WindowCompat.getInsetsController(window, view)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

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
            // Layer 1: page content
            if (isLandscape) {
                LandscapePageContent(page = pages[currentPage])
            } else {
                PortraitPageContent(page = pages[currentPage], textVisible = textVisible)
            }

            // Layer 2: invisible tap zones with top dead zone
            Column(modifier = Modifier.fillMaxSize()) {
                // Top 10% dead zone
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
                                    viewModel.showText()
                                }
                            }
                    )
                    // Center 60% — tap: toggle text/SFX, long-press: exit overlay
                    Box(
                        modifier = Modifier
                            .weight(3f)
                            .fillMaxHeight()
                            .combinedClickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                onClick = {
                                    viewModel.onCenterTap(pages[currentPage])
                                },
                                onLongClick = {
                                    showExitOverlay = !showExitOverlay
                                }
                            )
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
                                    viewModel.showText()
                                }
                            }
                    )
                }
            }

            // Layer 3: landscape bottom text bar
            if (isLandscape) {
                AnimatedVisibility(
                    visible = textVisible,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.align(Alignment.BottomCenter)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.Black.copy(alpha = 0.65f))
                            .padding(horizontal = 32.dp, vertical = 16.dp)
                    ) {
                        Text(
                            text = pages[currentPage].text,
                            fontSize = 18.sp,
                            lineHeight = 26.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            color = Color.White,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            // Layer 4: exit overlay
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        FilledTonalButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ExitToApp,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.padding(horizontal = 4.dp))
                            Text("Exit Book")
                        }
                        if (hasAudio) {
                            Spacer(modifier = Modifier.padding(horizontal = 4.dp))
                            FilledTonalButton(onClick = { viewModel.toggleSound() }) {
                                Text(if (soundEnabled) "🔊" else "🔇")
                            }
                        }
                    }
                }
            }

            // Audio indicator — top-left when sound is enabled (always visible)
            if (hasAudio && soundEnabled) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(start = 16.dp, top = 16.dp)
                        .background(
                            Color.Black.copy(alpha = 0.4f),
                            RoundedCornerShape(12.dp)
                        )
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "🔊",
                        fontSize = 16.sp
                    )
                }
            }

            // Page indicator
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
 * Portrait: full-bleed image with animated text overlay at bottom.
 */
@Composable
private fun PortraitPageContent(page: Page, textVisible: Boolean) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        PageIllustration(
            page = page,
            contentScale = ContentScale.Crop
        )

        // Text overlay at bottom
        AnimatedVisibility(
            visible = textVisible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.Black.copy(alpha = 0.65f))
                    .padding(horizontal = 32.dp, vertical = 20.dp)
            ) {
                Text(
                    text = page.text,
                    fontSize = 20.sp,
                    lineHeight = 28.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    color = Color.White,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
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
