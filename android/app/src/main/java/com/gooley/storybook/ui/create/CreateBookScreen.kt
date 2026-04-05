package com.gooley.storybook.ui.create

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.gooley.storybook.data.db.CharacterDao
import com.gooley.storybook.data.model.Character
import com.gooley.storybook.data.repository.BookRepository

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CreateBookScreen(
    repository: BookRepository,
    characterDao: CharacterDao,
    onBookCreated: (Long) -> Unit,
    onBack: () -> Unit
) {
    val viewModel = remember { CreateBookViewModel(repository, characterDao) }
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.createdBookId) {
        uiState.createdBookId?.let { onBookCreated(it) }
    }

    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Top bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack, enabled = !uiState.isGenerating) {
                    Text("←", fontSize = 24.sp)
                }
                Text(
                    text = "Create a Story",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
            }

            if (uiState.isGenerating) {
                // Generation progress view
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Spacer(modifier = Modifier.height(16.dp))

                    // First illustration preview
                    if (uiState.firstIllustrationPath != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(4f / 3f)
                                .clip(MaterialTheme.shapes.large),
                            contentAlignment = Alignment.Center
                        ) {
                            AsyncImage(
                                model = uiState.firstIllustrationPath,
                                contentDescription = "First page illustration",
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Fit
                            )
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    Text(
                        text = uiState.progress,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    LinearProgressIndicator(
                        progress = { uiState.progressFraction },
                        modifier = Modifier.fillMaxWidth(),
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            } else {
                // Form view
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 24.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.Top
                ) {
                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedTextField(
                        value = uiState.description,
                        onValueChange = viewModel::updateDescription,
                        label = { Text("What's the story about?") },
                        placeholder = { Text("Describe the gist — characters, setting, what happens...") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(140.dp),
                        maxLines = 6
                    )

                    // Page count selection
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Story length:",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(2 to "Short (2)", 4 to "Medium (4)", 8 to "Long (8)").forEach { (count, label) ->
                            FilterChip(
                                selected = uiState.pageCount == count,
                                onClick = { viewModel.updatePageCount(count) },
                                label = { Text(label) }
                            )
                        }
                    }

                    // Character selection
                    if (uiState.availableCharacters.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Include characters:",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        val family = uiState.availableCharacters.filter { it.type == Character.TYPE_FAMILY }
                        val friends = uiState.availableCharacters.filter { it.type == Character.TYPE_FRIEND }

                        if (family.isNotEmpty()) {
                            Text("Family", style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.padding(vertical = 4.dp)
                            ) {
                                family.forEach { character ->
                                    val selected = character.id in uiState.selectedCharacterIds
                                    FilterChip(
                                        selected = selected,
                                        onClick = { viewModel.toggleCharacter(character.id) },
                                        label = { Text(character.name) }
                                    )
                                }
                            }
                        }

                        if (friends.isNotEmpty()) {
                            Text("Friends", style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.padding(vertical = 4.dp)
                            ) {
                                friends.forEach { character ->
                                    val selected = character.id in uiState.selectedCharacterIds
                                    FilterChip(
                                        selected = selected,
                                        onClick = { viewModel.toggleCharacter(character.id) },
                                        label = { Text(character.name) }
                                    )
                                }
                            }
                        }
                    }

                    uiState.error?.let { error ->
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = error,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Generate button pinned to bottom
                Button(
                    onClick = viewModel::generateBook,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 12.dp),
                    enabled = uiState.description.isNotBlank()
                ) {
                    Text("✨ Generate Story", fontSize = 18.sp)
                }
            }
        }
    }
}
