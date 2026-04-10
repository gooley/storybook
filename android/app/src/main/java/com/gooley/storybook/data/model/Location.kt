package com.gooley.storybook.data.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "locations", indices = [Index(value = ["uuid"], unique = true)])
data class Location(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val uuid: String = UUID.randomUUID().toString(),
    val name: String,
    val description: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val dirty: Boolean = true,
    val deletedAt: Long? = null
)
