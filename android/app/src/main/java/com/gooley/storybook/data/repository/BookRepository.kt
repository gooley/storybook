package com.gooley.storybook.data.repository

import android.content.Context
import android.util.Log
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
    private val apiClient = OpenRouterClient()
    private val imagesDir = File(context.filesDir, "illustrations").also { it.mkdirs() }

    fun getAllBooks(): Flow<List<Book>> = bookDao.getAll()

    suspend fun getBook(id: Long): Book? = bookDao.getById(id)

    fun getPagesForBook(bookId: Long): Flow<List<Page>> = pageDao.getPagesForBook(bookId)

    suspend fun deleteBook(book: Book) = bookDao.softDelete(book.id)

    suspend fun generateBook(
        title: String,
        description: String,
        onProgress: (String) -> Unit
    ): Long {
        // Create book entry
        onProgress("Creating book...")
        val book = Book(title = title, description = description)
        val bookId = bookDao.insert(book)

        try {
            // Generate story text
            onProgress("Writing story with AI...")
            val storyPages = apiClient.generateStory(title, description)

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
            val firstSuccess = apiClient.generateIllustration(firstPage.text, title, firstImageFile, null)
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
                        val success = apiClient.generateIllustration(page.text, title, imageFile, referenceImage)
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
                        "Book cover for: $description", title, coverFile, referenceImage
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
