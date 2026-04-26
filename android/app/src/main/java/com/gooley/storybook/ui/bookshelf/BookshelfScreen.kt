package com.gooley.storybook.ui.bookshelf

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.repository.BookRepository

@Composable
fun BookshelfScreen(
    repository: BookRepository,
    onBookClick: (Long) -> Unit,
    onCreateClick: () -> Unit,
    onCharactersClick: () -> Unit,
    onLocationsClick: () -> Unit = {},
    onSyncClick: () -> Unit = {}
) {
    val viewModel = remember { BookshelfViewModel(repository) }
    val books by viewModel.books.collectAsState()
    val bookIdsWithAudio by viewModel.bookIdsWithAudio.collectAsState()
    var searchQuery by rememberSaveable { mutableStateOf("") }
    val trimmedSearchQuery = searchQuery.trim()
    val filteredBooks = if (trimmedSearchQuery.isBlank()) {
        books
    } else {
        books.filter { book ->
            book.title.contains(trimmedSearchQuery, ignoreCase = true) ||
                book.description.contains(trimmedSearchQuery, ignoreCase = true)
        }
    }

    Scaffold(
        floatingActionButton = {
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                FloatingActionButton(
                    onClick = onSyncClick,
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ) {
                    Text("🔄", fontSize = 22.sp)
                }
                FloatingActionButton(
                    onClick = onCharactersClick,
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ) {
                    Text("👤", fontSize = 22.sp)
                }
                FloatingActionButton(
                    onClick = onLocationsClick,
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ) {
                    Text("📍", fontSize = 22.sp)
                }
                FloatingActionButton(
                    onClick = onCreateClick,
                    containerColor = MaterialTheme.colorScheme.primary
                ) {
                    Text("＋", fontSize = 24.sp, color = MaterialTheme.colorScheme.onPrimary)
                }
            }
        }
    ) { innerPadding ->
        val configuration = LocalConfiguration.current
        val columns = if (configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) 3 else 2

        if (books.isEmpty()) {
            EmptyBookshelf(modifier = Modifier.padding(innerPadding))
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    label = { Text("Search stories") },
                    leadingIcon = { Text("🔎") },
                    singleLine = true
                )

                if (filteredBooks.isEmpty()) {
                    EmptySearchResults(modifier = Modifier.weight(1f))
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(columns),
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(filteredBooks, key = { it.id }) { book ->
                            BookCard(
                                book = book,
                                hasAudio = book.id in bookIdsWithAudio,
                                onClick = { onBookClick(book.id) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptySearchResults(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("🔎", fontSize = 64.sp, textAlign = TextAlign.Center)
        Text(
            text = "No stories match your search",
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp)
        )
        Text(
            text = "Try a different title or description",
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp)
        )
    }
}

@Composable
private fun BookCard(book: Book, hasAudio: Boolean, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        border = androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        // Cover image or placeholder
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(6.dp)
                .aspectRatio(0.75f)
                .clip(RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center
        ) {
            if (book.coverImagePath != null) {
                AsyncImage(
                    model = book.coverImagePath,
                    contentDescription = book.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            } else {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text("📖", fontSize = 48.sp)
                }
            }

            // Status badge
            if (book.status == Book.STATUS_GENERATING) {
                CircularProgressIndicator(
                    modifier = Modifier.padding(8.dp),
                    color = MaterialTheme.colorScheme.primary
                )
            }

            // Audio badge
            if (hasAudio) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(4.dp)
                        .size(24.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.Black.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text("🔊", fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun EmptyBookshelf(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("📚", fontSize = 72.sp, textAlign = TextAlign.Center)
        Text(
            text = "Your bookshelf is empty",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp)
        )
        Text(
            text = "Tap + to create your first story",
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp)
        )
    }
}
