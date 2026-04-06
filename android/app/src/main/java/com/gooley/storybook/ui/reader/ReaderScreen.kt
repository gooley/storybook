package com.gooley.storybook.ui.reader

import android.app.Activity
import android.util.Log
import android.view.WindowManager
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
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

    Log.d("ReaderScreen", "Render: bookId=$bookId, pages.size=${pages.size}, pages=${pages.map { "p${it.pageNumber}(${it.imageStatus})" }}")

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
            // Page content fills the screen
            PageContent(page = pages[currentPage])

            // Invisible tap zones overlaid on left/right thirds
            Row(modifier = Modifier.fillMaxSize()) {
                // Left third — previous page (or exit on first page)
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
                            } else {
                                onBack()
                            }
                        }
                )
                // Middle third — no action (dead zone)
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                )
                // Right third — next page
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
                            }
                        }
                )
            }

            // Page indicator pill at bottom center
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 16.dp)
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

@Composable
private fun PageContent(page: Page) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Illustration
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(4f / 3f)
                .clip(MaterialTheme.shapes.large),
            contentAlignment = Alignment.Center
        ) {
            if (page.imagePath != null && page.imageStatus == Page.IMAGE_DONE) {
                AsyncImage(
                    model = page.imagePath,
                    contentDescription = "Illustration for page ${page.pageNumber}",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit
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
                .padding(horizontal = 8.dp, vertical = 8.dp)
        )
    }
}
