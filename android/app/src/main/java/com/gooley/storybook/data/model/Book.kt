package com.gooley.storybook.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "books")
data class Book(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val title: String,
    val description: String,
    val coverImagePath: String? = null,
    val status: String = STATUS_GENERATING,
    val createdAt: Long = System.currentTimeMillis()
) {
    companion object {
        const val STATUS_GENERATING = "generating"
        const val STATUS_READY = "ready"
        const val STATUS_ERROR = "error"
    }
}
