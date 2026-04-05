package com.gooley.storybook.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.gooley.storybook.data.model.Page
import kotlinx.coroutines.flow.Flow

@Dao
interface PageDao {
    @Insert
    suspend fun insert(page: Page): Long

    @Insert
    suspend fun insertAll(pages: List<Page>)

    @Update
    suspend fun update(page: Page)

    @Query("SELECT * FROM pages WHERE bookId = :bookId AND deletedAt IS NULL ORDER BY pageNumber")
    fun getPagesForBook(bookId: Long): Flow<List<Page>>

    @Query("SELECT * FROM pages WHERE bookId = :bookId AND deletedAt IS NULL ORDER BY pageNumber")
    suspend fun getPagesForBookOnce(bookId: Long): List<Page>

    @Query("UPDATE pages SET imagePath = :path, imageStatus = :status, updatedAt = :now, dirty = 1 WHERE id = :id")
    suspend fun updateImage(id: Long, path: String, status: String, now: Long = System.currentTimeMillis())

    @Query("UPDATE pages SET imageStatus = :status, updatedAt = :now, dirty = 1 WHERE id = :id")
    suspend fun updateImageStatus(id: Long, status: String, now: Long = System.currentTimeMillis())

    @Query("UPDATE pages SET imagePath = NULL, imageStatus = 'pending', updatedAt = :now, dirty = 1 WHERE bookId = :bookId AND pageNumber != 1")
    suspend fun resetImagesExceptFirst(bookId: Long, now: Long = System.currentTimeMillis())

    @Query("SELECT * FROM pages WHERE uuid = :uuid")
    suspend fun getByUuid(uuid: String): Page?

    // Sync queries
    @Query("SELECT * FROM pages WHERE dirty = 1")
    suspend fun getDirty(): List<Page>

    @Query("UPDATE pages SET dirty = 0 WHERE uuid = :uuid")
    suspend fun markSynced(uuid: String)

    @Update
    suspend fun upsert(page: Page): Int
}
