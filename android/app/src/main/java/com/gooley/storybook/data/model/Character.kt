package com.gooley.storybook.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "characters", indices = [Index(value = ["uuid"], unique = true)])
data class Character(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val uuid: String = UUID.randomUUID().toString(),
    val name: String,
    val type: String = TYPE_FAMILY,
    val notes: String = "",
    val photoPath: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val dirty: Boolean = true,
    val deletedAt: Long? = null
) {
    companion object {
        const val TYPE_FAMILY = "family"
        const val TYPE_FRIEND = "friend"
    }
}
