package com.gooley.storybook.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.gooley.storybook.data.model.Book
import kotlinx.coroutines.flow.Flow

@Dao
interface BookDao {
    @Insert
    suspend fun insert(book: Book): Long

    @Update
    suspend fun update(book: Book)

    @Query("SELECT * FROM books WHERE deletedAt IS NULL ORDER BY createdAt DESC")
    fun getAll(): Flow<List<Book>>

    @Query("SELECT * FROM books WHERE id = :id AND deletedAt IS NULL")
    suspend fun getById(id: Long): Book?

    @Query("SELECT * FROM books WHERE uuid = :uuid")
    suspend fun getByUuid(uuid: String): Book?

    @Query("SELECT uuid FROM books WHERE id = :localId")
    suspend fun getUuidByLocalId(localId: Long): String?

    @Query("SELECT id FROM books WHERE uuid = :uuid")
    suspend fun getLocalIdByUuid(uuid: String): Long?

    @Query("UPDATE books SET status = :status, updatedAt = :now, dirty = 1 WHERE id = :id")
    suspend fun updateStatus(id: Long, status: String, now: Long = System.currentTimeMillis())

    @Query("UPDATE books SET coverImagePath = :path, updatedAt = :now, dirty = 1 WHERE id = :id")
    suspend fun updateCoverImagePath(id: Long, path: String?, now: Long = System.currentTimeMillis())

    @Query("UPDATE books SET deletedAt = :now, updatedAt = :now, dirty = 1 WHERE id = :id")
    suspend fun softDelete(id: Long, now: Long = System.currentTimeMillis())

    // Sync queries
    @Query("SELECT * FROM books WHERE dirty = 1")
    suspend fun getDirty(): List<Book>

    @Query("UPDATE books SET dirty = 0 WHERE uuid = :uuid")
    suspend fun markSynced(uuid: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(book: Book): Long
}
