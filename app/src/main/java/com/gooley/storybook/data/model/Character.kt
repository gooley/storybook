package com.gooley.storybook.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "characters")
data class Character(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val name: String,
    val type: String = TYPE_FAMILY,
    val notes: String = "",
    val photoPath: String? = null,
    val createdAt: Long = System.currentTimeMillis()
) {
    companion object {
        const val TYPE_FAMILY = "family"
        const val TYPE_FRIEND = "friend"
    }
}
