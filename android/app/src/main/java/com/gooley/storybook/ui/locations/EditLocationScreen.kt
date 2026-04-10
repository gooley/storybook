package com.gooley.storybook.ui.locations

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.gooley.storybook.data.db.LocationDao
import com.gooley.storybook.data.model.Location
import com.gooley.storybook.data.model.LocationPhoto
import kotlinx.coroutines.launch
import java.io.File

@Composable
fun EditLocationScreen(
    locationDao: LocationDao,
    locationId: Long?,
    onSaved: () -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val photosDir = remember { File(context.filesDir, "location_photos").also { it.mkdirs() } }

    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var existingLocation by remember { mutableStateOf<Location?>(null) }
    val photos = remember { mutableStateListOf<LocationPhoto>() }
    val newPhotoPaths = remember { mutableStateListOf<String>() }

    LaunchedEffect(locationId) {
        if (locationId != null && locationId > 0) {
            locationDao.getById(locationId)?.let { loc ->
                existingLocation = loc
                name = loc.name
                description = loc.description
            }
            photos.clear()
            photos.addAll(locationDao.getPhotosForLocation(locationId))
        }
    }

    val photoLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            if (photos.size + newPhotoPaths.size >= 3) return@let
            scope.launch {
                val destFile = File(photosDir, "loc_${System.currentTimeMillis()}.jpg")
                context.contentResolver.openInputStream(it)?.use { input ->
                    destFile.outputStream().use { output -> input.copyTo(output) }
                }
                newPhotoPaths.add(destFile.absolutePath)
            }
        }
    }

    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
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
                    text = if (locationId != null) "Edit Location" else "Add Location",
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

                // Photo gallery
                Text(
                    text = "Photos (${photos.size + newPhotoPaths.size}/3)",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))

                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Existing photos
                    items(photos, key = { it.id }) { photo ->
                        Box(modifier = Modifier.size(100.dp)) {
                            AsyncImage(
                                model = photo.photoPath,
                                contentDescription = "Location photo",
                                modifier = Modifier
                                    .fillMaxSize()
                                    .clip(RoundedCornerShape(8.dp)),
                                contentScale = ContentScale.Crop
                            )
                            Text(
                                text = "✕",
                                fontSize = 16.sp,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(4.dp)
                                    .clickable {
                                        scope.launch {
                                            locationDao.deletePhoto(photo.id)
                                            photos.remove(photo)
                                        }
                                    }
                            )
                        }
                    }

                    // New photos (not yet saved)
                    items(newPhotoPaths.size) { index ->
                        Box(modifier = Modifier.size(100.dp)) {
                            AsyncImage(
                                model = newPhotoPaths[index],
                                contentDescription = "New photo",
                                modifier = Modifier
                                    .fillMaxSize()
                                    .clip(RoundedCornerShape(8.dp)),
                                contentScale = ContentScale.Crop
                            )
                            Text(
                                text = "✕",
                                fontSize = 16.sp,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(4.dp)
                                    .clickable { newPhotoPaths.removeAt(index) }
                            )
                        }
                    }

                    // Add button
                    if (photos.size + newPhotoPaths.size < 3) {
                        item {
                            Card(
                                modifier = Modifier
                                    .size(100.dp)
                                    .clickable { photoLauncher.launch("image/*") },
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                                ),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Box(
                                    modifier = Modifier.fillMaxSize(),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("📷", fontSize = 28.sp)
                                        Text(
                                            "Add",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    placeholder = { Text("e.g., Dana's Bedroom, Backyard") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Description") },
                    placeholder = { Text("What does this place look like?") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    maxLines = 4
                )

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = {
                        scope.launch {
                            val location = Location(
                                id = existingLocation?.id ?: 0,
                                uuid = existingLocation?.uuid ?: java.util.UUID.randomUUID().toString(),
                                name = name,
                                description = description,
                                createdAt = existingLocation?.createdAt ?: System.currentTimeMillis(),
                                updatedAt = System.currentTimeMillis(),
                                dirty = true
                            )
                            val locId = if (existingLocation != null) {
                                locationDao.update(location)
                                location.id
                            } else {
                                locationDao.insert(location)
                            }

                            // Save new photos
                            val existingCount = photos.size
                            for ((i, path) in newPhotoPaths.withIndex()) {
                                val photo = LocationPhoto(
                                    locationId = locId,
                                    photoPath = path,
                                    sortOrder = existingCount + i,
                                    createdAt = System.currentTimeMillis()
                                )
                                locationDao.insertPhoto(photo)
                            }

                            onSaved()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = name.isNotBlank()
                ) {
                    Text(if (locationId != null) "Save" else "Add Location", fontSize = 18.sp)
                }

                if (existingLocation != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    TextButton(
                        onClick = {
                            scope.launch {
                                existingLocation?.let { locationDao.softDelete(it.id) }
                                onSaved()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.textButtonColors(
                            contentColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Text("Delete Location")
                    }
                }
            }
        }
    }
}
