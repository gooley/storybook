package com.gooley.storybook.data.sync

import android.content.Context
import android.util.Log
import com.gooley.storybook.data.db.StorybookDatabase
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.model.Character
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
    private val prefs = context.getSharedPreferences("sync", Context.MODE_PRIVATE)
    private val illustrationsDir = File(context.filesDir, "illustrations").also { it.mkdirs() }
    private val photosDir = File(context.filesDir, "character_photos").also { it.mkdirs() }

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

        if (dirtyBooks.isEmpty() && dirtyPages.isEmpty() && dirtyCharacters.isEmpty()) {
            Log.d(TAG, "Nothing to push")
            return
        }

        Log.d(TAG, "Pushing ${dirtyBooks.size} books, ${dirtyPages.size} pages, ${dirtyCharacters.size} characters")

        // Convert to sync models
        val syncBooks = dirtyBooks.map { it.toSyncBook() }
        val syncPages = dirtyPages.mapNotNull { it.toSyncPage() }
        val syncCharacters = dirtyCharacters.map { it.toSyncCharacter() }

        // Push metadata
        val request = SyncPushRequest(
            characters = syncCharacters,
            books = syncBooks,
            pages = syncPages
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

        Log.d(TAG, "Push complete")
    }

    private suspend fun pull() {
        val lastSyncTime = prefs.getLong("last_sync_time", 0)

        val response = client.pullChanges(lastSyncTime)
        Log.d(TAG, "Pulled ${response.characters.size} characters, ${response.books.size} books, ${response.pages.size} pages")

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

    private fun Book.toSyncBook() = SyncBook(
        id = uuid,
        title = title,
        description = description,
        coverImagePath = null, // Images uploaded separately
        status = status,
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
        createdAt = createdAt,
        updatedAt = updatedAt,
        deletedAt = deletedAt
    )

    companion object {
        private const val TAG = "SyncManager"
    }
}
