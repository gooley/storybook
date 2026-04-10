package com.gooley.storybook.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(
    tableName = "location_photos",
    foreignKeys = [
        ForeignKey(
            entity = Location::class,
            parentColumns = ["id"],
            childColumns = ["locationId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["uuid"], unique = true),
        Index(value = ["locationId"])
    ]
)
data class LocationPhoto(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val uuid: String = UUID.randomUUID().toString(),
    val locationId: Long,
    val photoPath: String,
    val sortOrder: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val dirty: Boolean = true
)
