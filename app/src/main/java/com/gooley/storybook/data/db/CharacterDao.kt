package com.gooley.storybook.data.db

import androidx.room.Dao
import androidx.room.Delete
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

    @Delete
    suspend fun delete(character: Character)

    @Query("SELECT * FROM characters ORDER BY type, name")
    fun getAll(): Flow<List<Character>>

    @Query("SELECT * FROM characters WHERE id = :id")
    suspend fun getById(id: Long): Character?

    @Query("SELECT * FROM characters WHERE type = :type ORDER BY name")
    fun getByType(type: String): Flow<List<Character>>
}
