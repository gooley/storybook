package com.gooley.storybook.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.gooley.storybook.data.model.Page
import kotlinx.coroutines.flow.Flow

@Dao
interface PageDao {
    @Insert
    suspend fun insert(page: Page): Long

    @Insert
    suspend fun insertAll(pages: List<Page>)

    @Query("SELECT * FROM pages WHERE bookId = :bookId ORDER BY pageNumber")
    fun getPagesForBook(bookId: Long): Flow<List<Page>>

    @Query("SELECT * FROM pages WHERE bookId = :bookId ORDER BY pageNumber")
    suspend fun getPagesForBookOnce(bookId: Long): List<Page>

    @Query("UPDATE pages SET imagePath = :path, imageStatus = :status WHERE id = :id")
    suspend fun updateImage(id: Long, path: String, status: String)

    @Query("UPDATE pages SET imageStatus = :status WHERE id = :id")
    suspend fun updateImageStatus(id: Long, status: String)

    @Query("UPDATE pages SET imagePath = NULL, imageStatus = 'pending' WHERE bookId = :bookId AND pageNumber != 1")
    suspend fun resetImagesExceptFirst(bookId: Long)
}
