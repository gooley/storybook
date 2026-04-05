package com.gooley.storybook.data.repository

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import com.gooley.storybook.data.api.CharacterRef
import com.gooley.storybook.data.api.OpenRouterClient
import com.gooley.storybook.data.db.StorybookDatabase
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.model.Page
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import java.io.File

class BookRepository(context: Context) {
    private val db = StorybookDatabase.getInstance(context)
    private val bookDao = db.bookDao()
    private val pageDao = db.pageDao()
    private val characterDao = db.characterDao()
    private val apiClient = OpenRouterClient()
    private val imagesDir = File(context.filesDir, "illustrations").also { it.mkdirs() }
    private val scaledPhotosDir = File(context.cacheDir, "scaled_photos").also { it.mkdirs() }

    fun getAllBooks(): Flow<List<Book>> = bookDao.getAll()

    suspend fun getBook(id: Long): Book? = bookDao.getById(id)

    fun getPagesForBook(bookId: Long): Flow<List<Page>> = pageDao.getPagesForBook(bookId)

    suspend fun deleteBook(book: Book) = bookDao.softDelete(book.id)

    /**
     * Scales a photo to max 512px on the longest edge, saves to cache dir.
     * Returns the scaled file, or null if the original doesn't exist.
     */
    private fun scalePhoto(originalPath: String, id: String): File? {
        val original = File(originalPath)
        if (!original.exists()) return null

        return try {
            val bitmap = BitmapFactory.decodeFile(original.absolutePath) ?: return null
            val maxDim = 512
            val scale = maxDim.toFloat() / maxOf(bitmap.width, bitmap.height)
            val scaled = if (scale < 1f) {
                Bitmap.createScaledBitmap(
                    bitmap,
                    (bitmap.width * scale).toInt(),
                    (bitmap.height * scale).toInt(),
                    true
                )
            } else {
                bitmap
            }

            val outFile = File(scaledPhotosDir, "ref_$id.jpg")
            outFile.outputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, 80, it) }
            if (scaled !== bitmap) scaled.recycle()
            bitmap.recycle()
            outFile
        } catch (e: Exception) {
            Log.w(TAG, "Failed to scale photo: ${e.message}")
            null
        }
    }

    /**
     * Load selected characters and build CharacterRef list with scaled photos.
     */
    private suspend fun buildCharacterRefs(selectedCharacterIds: Set<Long>): List<CharacterRef> {
        if (selectedCharacterIds.isEmpty()) return emptyList()
        return selectedCharacterIds.mapNotNull { id ->
            characterDao.getById(id)?.let { c ->
                val description = buildString {
                    val typeLabel = if (c.type == "family") "family member" else "friend"
                    append("$typeLabel")
                    if (c.notes.isNotBlank()) append(". ${c.notes}")
                }
                val scaledPhoto = c.photoPath?.let { scalePhoto(it, c.uuid) }
                CharacterRef(name = c.name, description = description, photoFile = scaledPhoto)
            }
        }
    }

    suspend fun generateBook(
        title: String,
        description: String,
        pageCount: Int = 4,
        selectedCharacterIds: Set<Long> = emptySet(),
        onProgress: (String) -> Unit
    ): Long {
        // Load characters and build references
        val characterRefs = buildCharacterRefs(selectedCharacterIds)

        // Build enriched description for story text generation
        val enrichedDescription = buildString {
            append(description)
            if (characterRefs.isNotEmpty()) {
                append("\n\nCharacters to feature in the story:")
                characterRefs.forEach { c ->
                    append("\n- ${c.name} (${c.description})")
                }
            }
        }

        // Create book entry
        onProgress("Creating book...")
        val book = Book(title = title, description = description)
        val bookId = bookDao.insert(book)

        try {
            // Generate story text
            onProgress("Writing story with AI...")
            val storyPages = apiClient.generateStory(title, enrichedDescription, pageCount)

            // Save pages to DB
            val pages = storyPages.map { sp ->
                Page(
                    bookId = bookId,
                    pageNumber = sp.pageNumber,
                    text = sp.text
                )
            }
            pageDao.insertAll(pages)
            onProgress("Story written! Generating illustrations...")

            // Generate page 1 first as the style reference
            val savedPages = pageDao.getPagesForBookOnce(bookId)
            val firstPage = savedPages.first()
            val firstImageFile = File(imagesDir, "book_${bookId}_page_${firstPage.pageNumber}.png")

            onProgress("Drawing illustration 1 of ${savedPages.size}...")
            pageDao.updateImageStatus(firstPage.id, Page.IMAGE_GENERATING)
            val firstSuccess = apiClient.generateIllustration(firstPage.text, title, firstImageFile, null, characterRefs)
            if (firstSuccess) {
                pageDao.updateImage(firstPage.id, firstImageFile.absolutePath, Page.IMAGE_DONE)
            } else {
                pageDao.updateImageStatus(firstPage.id, Page.IMAGE_ERROR)
            }

            // Generate remaining pages + cover in parallel, all using page 1 as reference
            val referenceImage = if (firstSuccess) firstImageFile else null
            val remainingPages = savedPages.drop(1)
            onProgress("Drawing illustrations 2-${savedPages.size} in parallel...")

            coroutineScope {
                val pageJobs = remainingPages.map { page ->
                    async {
                        val imageFile = File(imagesDir, "book_${bookId}_page_${page.pageNumber}.png")
                        pageDao.updateImageStatus(page.id, Page.IMAGE_GENERATING)
                        val success = apiClient.generateIllustration(page.text, title, imageFile, referenceImage, characterRefs)
                        if (success) {
                            pageDao.updateImage(page.id, imageFile.absolutePath, Page.IMAGE_DONE)
                        } else {
                            pageDao.updateImageStatus(page.id, Page.IMAGE_ERROR)
                        }
                    }
                }

                val coverJob = async {
                    val coverFile = File(imagesDir, "book_${bookId}_cover.png")
                    val coverSuccess = apiClient.generateIllustration(
                        "Book cover for: $description", title, coverFile, referenceImage, characterRefs
                    )
                    if (coverSuccess) {
                        bookDao.updateCoverImagePath(bookId, coverFile.absolutePath)
                    }
                }

                pageJobs.awaitAll()
                coverJob.await()
            }

            bookDao.updateStatus(bookId, Book.STATUS_READY)
            onProgress("Done!")
        } catch (e: Exception) {
            Log.e(TAG, "Book generation failed", e)
            bookDao.updateStatus(bookId, Book.STATUS_ERROR)
            onProgress("Error: ${e.message}")
            throw e
        }

        return bookId
    }

    suspend fun regenerateIllustrations(
        bookId: Long,
        onProgress: (String) -> Unit
    ) {
        val book = bookDao.getById(bookId) ?: return
        val pages = pageDao.getPagesForBookOnce(bookId)

        // Find or generate page 1 as reference
        val firstPage = pages.first()
        val firstImageFile = File(imagesDir, "book_${bookId}_page_${firstPage.pageNumber}.png")
        if (firstPage.imageStatus != Page.IMAGE_DONE || firstPage.imagePath == null) {
            onProgress("Drawing illustration 1 of ${pages.size}...")
            pageDao.updateImageStatus(firstPage.id, Page.IMAGE_GENERATING)
            val success = apiClient.generateIllustration(firstPage.text, book.title, firstImageFile, null)
            if (success) {
                pageDao.updateImage(firstPage.id, firstImageFile.absolutePath, Page.IMAGE_DONE)
            } else {
                pageDao.updateImageStatus(firstPage.id, Page.IMAGE_ERROR)
            }
        }

        val referenceImage = if (firstImageFile.exists()) firstImageFile else null
        val remaining = pages.drop(1).filter { it.imageStatus != Page.IMAGE_DONE || it.imagePath == null }
        val needsCover = book.coverImagePath == null

        if (remaining.isNotEmpty() || needsCover) {
            onProgress("Drawing ${remaining.size} illustrations in parallel...")
            coroutineScope {
                val pageJobs = remaining.map { page ->
                    async {
                        val imageFile = File(imagesDir, "book_${bookId}_page_${page.pageNumber}.png")
                        pageDao.updateImageStatus(page.id, Page.IMAGE_GENERATING)
                        val success = apiClient.generateIllustration(page.text, book.title, imageFile, referenceImage)
                        if (success) {
                            pageDao.updateImage(page.id, imageFile.absolutePath, Page.IMAGE_DONE)
                        } else {
                            pageDao.updateImageStatus(page.id, Page.IMAGE_ERROR)
                        }
                    }
                }

                if (needsCover) {
                    async {
                        val coverFile = File(imagesDir, "book_${bookId}_cover.png")
                        val success = apiClient.generateIllustration(
                            "Book cover for: ${book.description}", book.title, coverFile, referenceImage
                        )
                        if (success) bookDao.updateCoverImagePath(bookId, coverFile.absolutePath)
                    }
                }

                pageJobs.awaitAll()
            }
        }
        onProgress("Done!")
    }

    companion object {
        private const val TAG = "BookRepository"
    }
}
