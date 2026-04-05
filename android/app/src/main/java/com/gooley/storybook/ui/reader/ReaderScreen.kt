package com.gooley.storybook.ui.reader

import android.util.Log
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.gooley.storybook.data.model.Page
import com.gooley.storybook.data.repository.BookRepository
import kotlinx.coroutines.launch

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

    Log.d("ReaderScreen", "Render: bookId=$bookId, pages.size=${pages.size}, pages=${pages.map { "p${it.pageNumber}(${it.imageStatus})" }}")

    // Auto-regenerate illustrations if any are missing
    LaunchedEffect(pages.map { it.imageStatus }) {
        if (pages.isNotEmpty() && pages.any { it.imageStatus != Page.IMAGE_DONE }) {
            viewModel.regenerateIllustrations()
        }
    }

    Scaffold { innerPadding ->
        if (pages.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
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
            // key() forces pager state recreation when page count changes
            key(pages.size) {
                val pagerState = rememberPagerState(pageCount = { pages.size })
                val scope = rememberCoroutineScope()

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    // Top bar with back button, title, and page nav
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = onBack) {
                            Text("←", fontSize = 24.sp)
                        }
                        Text(
                            text = book?.title ?: "",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        // Prev/Next buttons (better for e-ink than swiping)
                        IconButton(
                            onClick = { scope.launch { pagerState.animateScrollToPage(pagerState.currentPage - 1) } },
                            enabled = pagerState.currentPage > 0
                        ) {
                            Text("‹", fontSize = 28.sp)
                        }
                        Text(
                            text = "${pagerState.currentPage + 1}/${pages.size}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        IconButton(
                            onClick = { scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) } },
                            enabled = pagerState.currentPage < pages.size - 1
                        ) {
                            Text("›", fontSize = 28.sp)
                        }
                    }

                    // Page content with swipe
                    HorizontalPager(
                        state = pagerState,
                        modifier = Modifier.fillMaxSize()
                    ) { pageIndex ->
                        PageContent(page = pages[pageIndex])
                    }
                }
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
