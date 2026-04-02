package com.gooley.storybook.data.repository

import android.content.Context
import android.util.Log
import com.gooley.storybook.data.api.OpenRouterClient
import com.gooley.storybook.data.db.StorybookDatabase
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.model.Page
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

    suspend fun deleteBook(book: Book) = bookDao.delete(book)

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

            // Retrieve saved pages (to get auto-generated IDs)
            val savedPages = pageDao.getPagesForBookOnce(bookId)

            // Generate illustrations for each page
            for ((index, page) in savedPages.withIndex()) {
                onProgress("Drawing illustration ${index + 1} of ${savedPages.size}...")
                val imageFile = File(imagesDir, "book_${bookId}_page_${page.pageNumber}.png")

                pageDao.updateImageStatus(page.id, Page.IMAGE_GENERATING)
                val success = apiClient.generateIllustration(page.text, title, imageFile)

                if (success) {
                    pageDao.updateImage(page.id, imageFile.absolutePath, Page.IMAGE_DONE)
                } else {
                    pageDao.updateImageStatus(page.id, Page.IMAGE_ERROR)
                }
            }

            // Generate cover image
            onProgress("Creating cover...")
            val coverFile = File(imagesDir, "book_${bookId}_cover.png")
            val coverSuccess = apiClient.generateIllustration(
                "Book cover for: $description",
                title,
                coverFile
            )
            if (coverSuccess) {
                bookDao.updateCoverImagePath(bookId, coverFile.absolutePath)
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

        for ((index, page) in pages.withIndex()) {
            if (page.imageStatus == Page.IMAGE_DONE && page.imagePath != null) continue
            onProgress("Drawing illustration ${index + 1} of ${pages.size}...")
            val imageFile = File(imagesDir, "book_${bookId}_page_${page.pageNumber}.png")

            pageDao.updateImageStatus(page.id, Page.IMAGE_GENERATING)
            val success = apiClient.generateIllustration(page.text, book.title, imageFile)

            if (success) {
                pageDao.updateImage(page.id, imageFile.absolutePath, Page.IMAGE_DONE)
            } else {
                pageDao.updateImageStatus(page.id, Page.IMAGE_ERROR)
            }
        }

        // Cover too if missing
        if (book.coverImagePath == null) {
            onProgress("Creating cover...")
            val coverFile = File(imagesDir, "book_${bookId}_cover.png")
            val success = apiClient.generateIllustration(
                "Book cover for: ${book.description}",
                book.title,
                coverFile
            )
            if (success) {
                bookDao.updateCoverImagePath(bookId, coverFile.absolutePath)
            }
        }
        onProgress("Done!")
    }

    companion object {
        private const val TAG = "BookRepository"
    }
}
