package com.gooley.storybook.data.sync

import android.content.Context
import android.util.Log
import com.gooley.storybook.data.db.StorybookDatabase
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.model.Character
import com.gooley.storybook.data.model.Location
import com.gooley.storybook.data.model.LocationPhoto
import com.gooley.storybook.data.model.Page
import java.io.File

class SyncManager(
    private val context: Context,
    private val db: StorybookDatabase = StorybookDatabase.getInstance(context),
    private val client: SyncClient = SyncClient()
) {
    private val bookDao = db.bookDao()
    private val pageDao = db.pageDao()
    private val characterDao = db.characterDao()
    private val locationDao = db.locationDao()
    private val prefs = context.getSharedPreferences("sync", Context.MODE_PRIVATE)
    private val illustrationsDir = File(context.filesDir, "illustrations").also { it.mkdirs() }
    private val photosDir = File(context.filesDir, "character_photos").also { it.mkdirs() }
    private val locationPhotosDir = File(context.filesDir, "location_photos").also { it.mkdirs() }

    suspend fun sync() {
        if (!client.isConfigured()) {
            Log.w(TAG, "Sync not configured (no API URL or key)")
            return
        }

        push()
        pull()
    }

    private suspend fun push() {
        // Gather dirty entities
        val dirtyBooks = bookDao.getDirty()
        val dirtyPages = pageDao.getDirty()
        val dirtyCharacters = characterDao.getDirty()
        val dirtyLocations = locationDao.getDirty()
        val dirtyLocationPhotos = locationDao.getDirtyPhotos()

        if (dirtyBooks.isEmpty() && dirtyPages.isEmpty() && dirtyCharacters.isEmpty() &&
            dirtyLocations.isEmpty() && dirtyLocationPhotos.isEmpty()) {
            Log.d(TAG, "Nothing to push")
            return
        }

        Log.d(TAG, "Pushing ${dirtyBooks.size} books, ${dirtyPages.size} pages, ${dirtyCharacters.size} characters, ${dirtyLocations.size} locations")

        // Convert to sync models
        val syncBooks = dirtyBooks.map { it.toSyncBook() }
        val syncPages = dirtyPages.mapNotNull { it.toSyncPage() }
        val syncCharacters = dirtyCharacters.map { it.toSyncCharacter() }
        val syncLocations = dirtyLocations.map { it.toSyncLocation() }
        val syncLocationPhotos = dirtyLocationPhotos.mapNotNull { it.toSyncLocationPhoto() }

        // Push metadata
        val request = SyncPushRequest(
            characters = syncCharacters,
            books = syncBooks,
            pages = syncPages,
            locations = syncLocations,
            locationPhotos = syncLocationPhotos
        )
        client.pushChanges(request)

        // Upload images for dirty entities
        for (character in dirtyCharacters) {
            if (character.photoPath != null && character.deletedAt == null) {
                val file = File(character.photoPath)
                if (file.exists()) {
                    client.uploadCharacterPhoto(character.uuid, file)
                }
            }
            characterDao.markSynced(character.uuid)
        }

        for (book in dirtyBooks) {
            if (book.coverImagePath != null && book.deletedAt == null) {
                val file = File(book.coverImagePath)
                if (file.exists()) {
                    client.uploadBookCover(book.uuid, file)
                }
            }
            bookDao.markSynced(book.uuid)
        }

        for (page in dirtyPages) {
            if (page.imagePath != null && page.deletedAt == null) {
                val file = File(page.imagePath)
                if (file.exists()) {
                    client.uploadPageImage(page.uuid, file)
                }
            }
            pageDao.markSynced(page.uuid)
        }

        for (location in dirtyLocations) {
            locationDao.markSynced(location.uuid)
        }

        for (photo in dirtyLocationPhotos) {
            val locationUuid = locationDao.getUuidByLocalId(photo.locationId)
            if (locationUuid != null && photo.photoPath.isNotEmpty()) {
                val file = File(photo.photoPath)
                if (file.exists()) {
                    client.uploadLocationPhoto(locationUuid, file)
                }
            }
            locationDao.markPhotoSynced(photo.uuid)
        }

        Log.d(TAG, "Push complete")
    }

    private suspend fun pull() {
        val lastSyncTime = prefs.getLong("last_sync_time", 0)

        val response = client.pullChanges(lastSyncTime)
        Log.d(TAG, "Pulled ${response.characters.size} characters, ${response.books.size} books, ${response.pages.size} pages, ${response.locations.size} locations")

        // Upsert characters
        for (sc in response.characters) {
            val existing = characterDao.getByUuid(sc.id)
            if (existing != null) {
                // Only update if server version is newer
                if (sc.updatedAt > existing.updatedAt) {
                    characterDao.upsert(existing.copy(
                        name = sc.name,
                        type = sc.type,
                        notes = sc.notes,
                        includeByDefault = sc.includeByDefault != 0,
                        updatedAt = sc.updatedAt,
                        deletedAt = sc.deletedAt,
                        dirty = false
                    ))
                    // Download photo if server has one
                    if (sc.photoPath != null && sc.deletedAt == null) {
                        downloadCharacterPhoto(sc.id, existing.id)
                    }
                }
            } else if (sc.deletedAt == null) {
                // New character from server
                val localId = characterDao.insert(Character(
                    uuid = sc.id,
                    name = sc.name,
                    type = sc.type,
                    notes = sc.notes,
                    includeByDefault = sc.includeByDefault != 0,
                    createdAt = sc.createdAt,
                    updatedAt = sc.updatedAt,
                    dirty = false
                ))
                if (sc.photoPath != null) {
                    downloadCharacterPhoto(sc.id, localId)
                }
            }
        }

        // Upsert books
        for (sb in response.books) {
            val existing = bookDao.getByUuid(sb.id)
            if (existing != null) {
                if (sb.updatedAt > existing.updatedAt) {
                    bookDao.upsert(existing.copy(
                        title = sb.title,
                        description = sb.description,
                        status = sb.status,
                        hidden = sb.hidden != 0,
                        updatedAt = sb.updatedAt,
                        deletedAt = sb.deletedAt,
                        dirty = false
                    ))
                    if (sb.coverImagePath != null && sb.deletedAt == null) {
                        downloadBookCover(sb.id, existing.id)
                    }
                }
            } else if (sb.deletedAt == null) {
                val localId = bookDao.insert(Book(
                    uuid = sb.id,
                    title = sb.title,
                    description = sb.description,
                    status = sb.status,
                    hidden = sb.hidden != 0,
                    createdAt = sb.createdAt,
                    updatedAt = sb.updatedAt,
                    dirty = false
                ))
                if (sb.coverImagePath != null) {
                    downloadBookCover(sb.id, localId)
                }
            }
        }

        // Upsert pages
        for (sp in response.pages) {
            val bookLocalId = bookDao.getLocalIdByUuid(sp.bookId) ?: continue
            val existing = pageDao.getByUuid(sp.id)
            if (existing != null) {
                if (sp.updatedAt > existing.updatedAt) {
                    pageDao.upsert(existing.copy(
                        pageNumber = sp.pageNumber,
                        text = sp.text,
                        imageStatus = sp.imageStatus,
                        updatedAt = sp.updatedAt,
                        deletedAt = sp.deletedAt,
                        dirty = false
                    ))
                    if (sp.imagePath != null && sp.deletedAt == null) {
                        downloadPageImage(sp.id, bookLocalId, sp.pageNumber)
                    }
                } else if (sp.imagePath != null && existing.imageStatus == Page.IMAGE_DONE) {
                    // Repair: re-download if local file is missing
                    val localFile = existing.imagePath?.let { File(it) }
                    if (localFile == null || !localFile.exists()) {
                        Log.d(TAG, "Repairing missing image for page ${sp.id}")
                        downloadPageImage(sp.id, bookLocalId, sp.pageNumber)
                    }
                }
            } else if (sp.deletedAt == null) {
                val localId = pageDao.insert(Page(
                    uuid = sp.id,
                    bookId = bookLocalId,
                    pageNumber = sp.pageNumber,
                    text = sp.text,
                    imageStatus = sp.imageStatus,
                    updatedAt = sp.updatedAt,
                    dirty = false
                ))
                if (sp.imagePath != null) {
                    downloadPageImage(sp.id, bookLocalId, sp.pageNumber)
                }
            }
        }

        // Upsert locations
        for (sl in response.locations) {
            val existing = locationDao.getByUuid(sl.id)
            if (existing != null) {
                if (sl.updatedAt > existing.updatedAt) {
                    locationDao.upsert(existing.copy(
                        name = sl.name,
                        description = sl.description,
                        updatedAt = sl.updatedAt,
                        deletedAt = sl.deletedAt,
                        dirty = false
                    ))
                }
            } else if (sl.deletedAt == null) {
                locationDao.insert(Location(
                    uuid = sl.id,
                    name = sl.name,
                    description = sl.description,
                    createdAt = sl.createdAt,
                    updatedAt = sl.updatedAt,
                    dirty = false
                ))
            }
        }

        // Upsert location photos
        for (slp in response.locationPhotos) {
            val locationLocalId = locationDao.getByUuid(slp.locationId)?.id ?: continue
            val existing = locationDao.getPhotoByUuid(slp.id)
            if (existing == null) {
                val localId = locationDao.insertPhoto(LocationPhoto(
                    uuid = slp.id,
                    locationId = locationLocalId,
                    photoPath = "",
                    sortOrder = slp.sortOrder,
                    createdAt = slp.createdAt,
                    dirty = false
                ))
                if (slp.photoPath != null) {
                    downloadLocationPhoto(slp.locationId, slp.id, localId)
                }
            }
        }

        // Update last sync time
        prefs.edit().putLong("last_sync_time", response.serverTime).apply()
        Log.d(TAG, "Pull complete, server_time=${response.serverTime}")
    }

    private suspend fun downloadCharacterPhoto(uuid: String, localId: Long) {
        val destFile = File(photosDir, "char_${localId}_synced.jpg")
        if (client.downloadFile(client.getCharacterPhotoUrl(uuid), destFile)) {
            val char = characterDao.getByUuid(uuid)
            if (char != null) {
                characterDao.update(char.copy(photoPath = destFile.absolutePath, dirty = false))
            }
        }
    }

    private suspend fun downloadBookCover(uuid: String, localId: Long) {
        val destFile = File(illustrationsDir, "book_${localId}_cover_synced.png")
        if (client.downloadFile(client.getBookCoverUrl(uuid), destFile)) {
            bookDao.updateCoverImagePath(localId, destFile.absolutePath)
            // Mark not dirty since this came from server
            val book = bookDao.getByUuid(uuid)
            if (book != null) bookDao.markSynced(uuid)
        }
    }

    private suspend fun downloadPageImage(pageUuid: String, bookLocalId: Long, pageNumber: Int) {
        val destFile = File(illustrationsDir, "book_${bookLocalId}_page_${pageNumber}_synced.png")
        if (client.downloadFile(client.getPageImageUrl(pageUuid), destFile)) {
            val page = pageDao.getByUuid(pageUuid)
            if (page != null) {
                pageDao.update(page.copy(
                    imagePath = destFile.absolutePath,
                    imageStatus = Page.IMAGE_DONE,
                    dirty = false
                ))
            }
        }
    }

    private suspend fun downloadLocationPhoto(locationUuid: String, photoUuid: String, localId: Long) {
        val destFile = File(locationPhotosDir, "loc_photo_${localId}_synced.jpg")
        if (client.downloadFile(client.getLocationPhotoUrl(locationUuid, photoUuid), destFile)) {
            val photo = locationDao.getPhotoByUuid(photoUuid)
            if (photo != null) {
                locationDao.insertPhoto(photo.copy(
                    photoPath = destFile.absolutePath,
                    dirty = false
                ))
            }
        }
    }

    private fun Book.toSyncBook() = SyncBook(
        id = uuid,
        title = title,
        description = description,
        coverImagePath = null, // Images uploaded separately
        status = status,
        hidden = if (hidden) 1 else 0,
        createdAt = createdAt,
        updatedAt = updatedAt,
        deletedAt = deletedAt
    )

    private suspend fun Page.toSyncPage(): SyncPage? {
        val bookUuid = bookDao.getUuidByLocalId(bookId) ?: return null
        return SyncPage(
            id = uuid,
            bookId = bookUuid,
            pageNumber = pageNumber,
            text = text,
            imagePath = null,
            imageStatus = imageStatus,
            createdAt = updatedAt, // Pages don't have createdAt
            updatedAt = updatedAt,
            deletedAt = deletedAt
        )
    }

    private fun Character.toSyncCharacter() = SyncCharacter(
        id = uuid,
        name = name,
        type = type,
        notes = notes,
        photoPath = null,
        includeByDefault = if (includeByDefault) 1 else 0,
        createdAt = createdAt,
        updatedAt = updatedAt,
        deletedAt = deletedAt
    )

    private fun Location.toSyncLocation() = SyncLocation(
        id = uuid,
        name = name,
        description = description,
        createdAt = createdAt,
        updatedAt = updatedAt,
        deletedAt = deletedAt
    )

    private suspend fun LocationPhoto.toSyncLocationPhoto(): SyncLocationPhoto? {
        val locationUuid = locationDao.getUuidByLocalId(locationId) ?: return null
        return SyncLocationPhoto(
            id = uuid,
            locationId = locationUuid,
            photoPath = null,
            sortOrder = sortOrder,
            createdAt = createdAt
        )
    }

    companion object {
        private const val TAG = "SyncManager"
    }
}
