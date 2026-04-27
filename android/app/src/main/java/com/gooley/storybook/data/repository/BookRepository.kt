package com.gooley.storybook.data.repository

import android.content.Context
import android.util.Log
import com.gooley.storybook.data.api.GenerationClient
import com.gooley.storybook.data.api.GenerationRequest
import com.gooley.storybook.data.api.GenerationStatus
import com.gooley.storybook.data.db.StorybookDatabase
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.model.Page
import com.gooley.storybook.data.model.PageAudio
import com.gooley.storybook.data.sync.SyncClient
import com.gooley.storybook.data.sync.SyncManager
import com.gooley.storybook.data.sync.SyncWorker
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import java.security.SecureRandom

class BookRepository(private val context: Context) {
    private val db = StorybookDatabase.getInstance(context)
    private val bookDao = db.bookDao()
    private val pageDao = db.pageDao()
    private val characterDao = db.characterDao()
    private val locationDao = db.locationDao()
    private val pageAudioDao = db.pageAudioDao()
    private val generationClient = GenerationClient()
    private val syncManager = SyncManager(context)
    private val prefs = context.getSharedPreferences("generation", Context.MODE_PRIVATE)

    fun getAllBooks(): Flow<List<Book>> = bookDao.getAll()

    fun getBookIdsWithAudio(): Flow<List<Long>> = pageAudioDao.getBookIdsWithAudio()

    suspend fun getBook(id: Long): Book? = bookDao.getById(id)

    fun getPagesForBook(bookId: Long): Flow<List<Page>> = pageDao.getPagesForBook(bookId)

    suspend fun deleteBook(book: Book) = bookDao.softDelete(book.id)

    suspend fun getAudioForPage(pageId: Long): List<PageAudio> = pageAudioDao.getForPage(pageId)

    /** Generate a nanoid-style short random ID (21 chars, URL-safe). */
    private fun generateId(): String {
        val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
        val random = SecureRandom()
        return (1..21).map { alphabet[random.nextInt(alphabet.length)] }.joinToString("")
    }

    /** Save active job for resume on app restart. */
    private fun saveActiveJob(jobId: String, bookId: String) {
        prefs.edit()
            .putString("active_job_id", jobId)
            .putString("active_book_id", bookId)
            .apply()
    }

    /** Clear saved job after completion or error. */
    private fun clearActiveJob() {
        prefs.edit()
            .remove("active_job_id")
            .remove("active_book_id")
            .apply()
    }

    /** Get saved active job ID (for resuming after app restart). */
    fun getActiveJobId(): String? = prefs.getString("active_job_id", null)
    fun getActiveBookId(): String? = prefs.getString("active_book_id", null)

    /**
     * Generate a book via the server-side generation API.
     * 1. Sync push characters (ensure photos are on server)
     * 2. Submit generation request
     * 3. Poll for status with progress callbacks
     * 4. When done, sync pull to get the completed book locally
     */
    suspend fun generateBook(
        description: String,
        pageCount: Int = 4,
        storyMode: String? = null,
        selectedCharacterIds: Set<Long> = emptySet(),
        selectedLocationIds: Set<Long> = emptySet(),
        onProgress: (String, Float) -> Unit,
        onFirstIllustration: ((String) -> Unit)? = null
    ): Long {
        // Translate local IDs to server UUIDs
        val characterUuids = selectedCharacterIds.mapNotNull { localId ->
            characterDao.getUuidByLocalId(localId)
        }
        val locationUuids = selectedLocationIds.mapNotNull { localId ->
            locationDao.getUuidByLocalId(localId)
        }

        // Ensure characters and locations are synced to server (photos included)
        onProgress("Syncing...", 0f)
        try {
            syncManager.sync()
        } catch (e: Exception) {
            Log.w(TAG, "Pre-generation sync failed: ${e.message}")
        }

        // Generate a bookId client-side for idempotency
        val bookId = generateId()

        // Submit generation request
        onProgress("Starting story generation...", 0.05f)
        val response = generationClient.startGeneration(
            GenerationRequest(
                description = description,
                pageCount = pageCount,
                storyMode = storyMode,
                characterIds = characterUuids,
                locationIds = locationUuids,
                bookId = bookId
            )
        )

        saveActiveJob(response.jobId, response.bookId)

        // Poll for status
        val localBookId = pollForCompletion(
            jobId = response.jobId,
            bookId = response.bookId,
            onProgress = onProgress,
            onFirstIllustration = onFirstIllustration
        )

        clearActiveJob()
        return localBookId
    }

    /**
     * Poll a generation job until completion, updating progress callbacks.
     * Returns the local book ID after sync pull.
     */
    suspend fun pollForCompletion(
        jobId: String,
        bookId: String,
        onProgress: (String, Float) -> Unit,
        onFirstIllustration: ((String) -> Unit)? = null
    ): Long {
        val syncClient = SyncClient()
        var firstIllustrationShown = false
        var pollCount = 0

        while (true) {
            val status = generationClient.pollStatus(jobId)
            pollCount++

            // Update progress
            onProgress(
                status.progressMessage ?: "Generating...",
                status.progressFraction
            )

            // Show first illustration preview
            if (status.firstIllustrationReady && !firstIllustrationShown &&
                status.completedPageIds.isNotEmpty() && onFirstIllustration != null
            ) {
                firstIllustrationShown = true
                // Download first page image directly for preview
                val pageId = status.completedPageIds.first()
                val previewUrl = syncClient.getPageImageUrl(pageId)
                val previewFile = java.io.File(context.cacheDir, "preview_$pageId.png")
                try {
                    if (syncClient.downloadFile(previewUrl, previewFile)) {
                        onFirstIllustration(previewFile.absolutePath)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to download preview: ${e.message}")
                }
            }

            // Check terminal states
            if (status.isDone) {
                onProgress("Done! Syncing...", 1f)
                syncManager.sync()
                val localId = bookDao.getLocalIdByUuid(bookId)
                    ?: throw Exception("Book not found after sync (uuid=$bookId)")
                return localId
            }

            if (status.isError) {
                clearActiveJob()
                throw Exception(status.errorMessage ?: "Generation failed")
            }

            if (status.status == "cancelled") {
                clearActiveJob()
                throw Exception("Generation was cancelled")
            }

            // Adaptive polling: 2s for first 15 polls (~30s), then 5s
            delay(if (pollCount < 15) 2000L else 5000L)
        }
    }

    /**
     * Regenerate illustrations for an existing book via the server.
     */
    suspend fun regenerateIllustrations(
        bookId: Long,
        onProgress: (String, Float) -> Unit
    ) {
        val bookUuid = bookDao.getUuidByLocalId(bookId)
            ?: throw Exception("Book UUID not found for local ID $bookId")

        onProgress("Starting illustration regeneration...", 0f)
        val response = generationClient.regenerateIllustrations(bookUuid)
        saveActiveJob(response.jobId, response.bookId)

        pollForCompletion(
            jobId = response.jobId,
            bookId = response.bookId,
            onProgress = onProgress
        )

        clearActiveJob()
    }

    /**
     * Regenerate covers for all ready books via the server.
     */
    suspend fun regenerateCovers(
        onProgress: (String, Float) -> Unit
    ) {
        onProgress("Starting cover regeneration...", 0f)
        val response = generationClient.regenerateCovers()
        saveActiveJob(response.jobId, "covers")

        var pollCount = 0
        while (true) {
            val status = generationClient.pollStatus(response.jobId)
            pollCount++
            onProgress(
                status.progressMessage ?: "Regenerating covers...",
                status.progressFraction
            )

            if (status.isTerminal) {
                clearActiveJob()
                if (status.isError) {
                    throw Exception(status.errorMessage ?: "Cover regeneration failed")
                }
                onProgress("Done! Syncing...", 1f)
                syncManager.sync()
                return
            }

            delay(if (pollCount < 15) 2000L else 5000L)
        }
    }

    companion object {
        private const val TAG = "BookRepository"
    }
}
