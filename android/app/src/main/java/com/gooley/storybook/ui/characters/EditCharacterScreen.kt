package com.gooley.storybook.ui.characters

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.gooley.storybook.data.db.CharacterDao
import com.gooley.storybook.data.model.Character
import kotlinx.coroutines.launch
import java.io.File

@Composable
fun EditCharacterScreen(
    characterDao: CharacterDao,
    characterId: Long?,
    onSaved: () -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val photosDir = remember { File(context.filesDir, "character_photos").also { it.mkdirs() } }

    var name by remember { mutableStateOf("") }
    var type by remember { mutableStateOf(Character.TYPE_FAMILY) }
    var notes by remember { mutableStateOf("") }
    var includeByDefault by remember { mutableStateOf(false) }
    var photoPath by remember { mutableStateOf<String?>(null) }
    var existingCharacter by remember { mutableStateOf<Character?>(null) }

    // Load existing character if editing
    LaunchedEffect(characterId) {
        if (characterId != null && characterId > 0) {
            characterDao.getById(characterId)?.let { c ->
                existingCharacter = c
                name = c.name
                type = c.type
                notes = c.notes
                includeByDefault = c.includeByDefault
                photoPath = c.photoPath
            }
        }
    }

    // Photo picker
    val photoLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            scope.launch {
                val destFile = File(photosDir, "char_${System.currentTimeMillis()}.jpg")
                context.contentResolver.openInputStream(it)?.use { input ->
                    destFile.outputStream().use { output -> input.copyTo(output) }
                }
                photoPath = destFile.absolutePath
            }
        }
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
                IconButton(onClick = onBack) {
                    Text("←", fontSize = 24.sp)
                }
                Text(
                    text = if (characterId != null) "Edit Character" else "Add Character",
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

                // Photo
                Box(
                    modifier = Modifier
                        .size(120.dp)
                        .clip(CircleShape)
                        .clickable { photoLauncher.launch("image/*") }
                        .align(Alignment.CenterHorizontally),
                    contentAlignment = Alignment.Center
                ) {
                    if (photoPath != null) {
                        AsyncImage(
                            model = photoPath,
                            contentDescription = "Character photo",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("📷", fontSize = 36.sp)
                            Text("Add Photo", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Type selector
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = type == Character.TYPE_FAMILY,
                        onClick = { type = Character.TYPE_FAMILY },
                        shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
                    ) {
                        Text("👨‍👩‍👧‍👦 Family")
                    }
                    SegmentedButton(
                        selected = type == Character.TYPE_FRIEND,
                        onClick = { type = Character.TYPE_FRIEND },
                        shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
                    ) {
                        Text("🧸 Friend")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    placeholder = { Text("e.g., Grandma Rose, Mr. Bear") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes") },
                    placeholder = { Text("Description, personality, appearance...") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    maxLines = 4
                )

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Include by default in new stories",
                        style = MaterialTheme.typography.bodyLarge
                    )
                    Switch(
                        checked = includeByDefault,
                        onCheckedChange = { includeByDefault = it }
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = {
                        scope.launch {
                            val character = Character(
                                id = existingCharacter?.id ?: 0,
                                uuid = existingCharacter?.uuid ?: java.util.UUID.randomUUID().toString(),
                                name = name,
                                type = type,
                                notes = notes,
                                photoPath = photoPath,
                                includeByDefault = includeByDefault,
                                createdAt = existingCharacter?.createdAt ?: System.currentTimeMillis(),
                                updatedAt = System.currentTimeMillis(),
                                dirty = true
                            )
                            if (existingCharacter != null) {
                                characterDao.update(character)
                            } else {
                                characterDao.insert(character)
                            }
                            onSaved()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = name.isNotBlank()
                ) {
                    Text(if (characterId != null) "Save" else "Add Character", fontSize = 18.sp)
                }

                // Delete button for existing characters
                if (existingCharacter != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    TextButton(
                        onClick = {
                            scope.launch {
                                existingCharacter?.let { characterDao.softDelete(it.id) }
                                onSaved()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.textButtonColors(
                            contentColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Text("Delete Character")
                    }
                }
            }
        }
    }
}
