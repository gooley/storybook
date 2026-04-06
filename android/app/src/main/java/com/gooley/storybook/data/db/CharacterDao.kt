package com.gooley.storybook.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.gooley.storybook.data.model.Character
import kotlinx.coroutines.flow.Flow

@Dao
interface CharacterDao {
    @Insert
    suspend fun insert(character: Character): Long

    @Update
    suspend fun update(character: Character)

    @Query("SELECT * FROM characters WHERE deletedAt IS NULL ORDER BY type, name")
    fun getAll(): Flow<List<Character>>

    @Query("SELECT * FROM characters WHERE id = :id AND deletedAt IS NULL")
    suspend fun getById(id: Long): Character?

    @Query("SELECT * FROM characters WHERE uuid = :uuid")
    suspend fun getByUuid(uuid: String): Character?

    @Query("SELECT uuid FROM characters WHERE id = :localId")
    suspend fun getUuidByLocalId(localId: Long): String?

    @Query("SELECT * FROM characters WHERE type = :type AND deletedAt IS NULL ORDER BY name")
    fun getByType(type: String): Flow<List<Character>>

    @Query("UPDATE characters SET deletedAt = :now, updatedAt = :now, dirty = 1 WHERE id = :id")
    suspend fun softDelete(id: Long, now: Long = System.currentTimeMillis())

    // Sync queries
    @Query("SELECT * FROM characters WHERE dirty = 1")
    suspend fun getDirty(): List<Character>

    @Query("UPDATE characters SET dirty = 0 WHERE uuid = :uuid")
    suspend fun markSynced(uuid: String)

    @Update
    suspend fun upsert(character: Character): Int
}
