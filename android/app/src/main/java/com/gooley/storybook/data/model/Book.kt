package com.gooley.storybook.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "books", indices = [Index(value = ["uuid"], unique = true)])
data class Book(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val uuid: String = UUID.randomUUID().toString(),
    val title: String,
    val description: String,
    val coverImagePath: String? = null,
    val status: String = STATUS_GENERATING,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val dirty: Boolean = true,
    val deletedAt: Long? = null
) {
    companion object {
        const val STATUS_GENERATING = "generating"
        const val STATUS_READY = "ready"
        const val STATUS_ERROR = "error"
    }
}
