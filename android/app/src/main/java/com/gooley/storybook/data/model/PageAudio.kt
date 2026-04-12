package com.gooley.storybook.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(
    tableName = "page_audio",
    foreignKeys = [
        ForeignKey(
            entity = Page::class,
            parentColumns = ["id"],
            childColumns = ["pageLocalId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("pageLocalId"), Index(value = ["uuid"], unique = true)]
)
data class PageAudio(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val uuid: String = UUID.randomUUID().toString(),
    val pageLocalId: Long,
    val pageUuid: String,
    val audioType: String, // "ambient" or "sfx"
    val description: String,
    val audioPath: String? = null,
    val durationSeconds: Double? = null,
    val sortOrder: Int = 0,
    val status: String = "done",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
