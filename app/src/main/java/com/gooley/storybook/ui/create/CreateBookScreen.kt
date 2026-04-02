package com.gooley.storybook.ui.create

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gooley.storybook.data.repository.BookRepository

@Composable
fun CreateBookScreen(
    repository: BookRepository,
    onBookCreated: (Long) -> Unit,
    onBack: () -> Unit
) {
    val viewModel = remember { CreateBookViewModel(repository) }
    val uiState by viewModel.uiState.collectAsState()

    // Navigate when book is created
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
                    fontWeight = FontWeight.Bold
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.Top
            ) {
                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = uiState.title,
                    onValueChange = viewModel::updateTitle,
                    label = { Text("Story Title") },
                    placeholder = { Text("e.g., The Brave Little Fox") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !uiState.isGenerating,
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = uiState.description,
                    onValueChange = viewModel::updateDescription,
                    label = { Text("What's the story about?") },
                    placeholder = { Text("Describe the gist of the story — characters, setting, what happens...") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                    enabled = !uiState.isGenerating,
                    maxLines = 6
                )

                Spacer(modifier = Modifier.height(24.dp))

                if (uiState.isGenerating) {
                    // Progress display
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = uiState.progress,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth(),
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                } else {
                    Button(
                        onClick = viewModel::generateBook,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = uiState.title.isNotBlank() && uiState.description.isNotBlank()
                    ) {
                        Text("✨ Generate Story", fontSize = 18.sp)
                    }
                }

                // Error display
                uiState.error?.let { error ->
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}
