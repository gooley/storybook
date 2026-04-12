package com.gooley.storybook.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.gooley.storybook.data.model.PageAudio
import kotlinx.coroutines.flow.Flow

@Dao
interface PageAudioDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(audio: PageAudio): Long

    @Query("SELECT * FROM page_audio WHERE pageLocalId = :pageLocalId AND status = 'done' ORDER BY audioType DESC, sortOrder ASC")
    suspend fun getForPage(pageLocalId: Long): List<PageAudio>

    @Query("SELECT * FROM page_audio WHERE uuid = :uuid")
    suspend fun getByUuid(uuid: String): PageAudio?

    @Query("UPDATE page_audio SET audioPath = :path WHERE id = :id")
    suspend fun updateAudioPath(id: Long, path: String)

    @Query("""
        SELECT DISTINCT p.bookId FROM page_audio pa
        JOIN pages p ON pa.pageLocalId = p.id
        WHERE pa.status = 'done'
    """)
    fun getBookIdsWithAudio(): Flow<List<Long>>
}
