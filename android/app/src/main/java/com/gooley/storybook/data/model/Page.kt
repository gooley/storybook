package com.gooley.storybook.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(
    tableName = "pages",
    foreignKeys = [
        ForeignKey(
            entity = Book::class,
            parentColumns = ["id"],
            childColumns = ["bookId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("bookId"), Index(value = ["uuid"], unique = true)]
)
data class Page(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val uuid: String = UUID.randomUUID().toString(),
    val bookId: Long,
    val pageNumber: Int,
    val text: String,
    val imagePath: String? = null,
    val imageStatus: String = IMAGE_PENDING,
    val updatedAt: Long = System.currentTimeMillis(),
    val dirty: Boolean = true,
    val deletedAt: Long? = null
) {
    companion object {
        const val IMAGE_PENDING = "pending"
        const val IMAGE_GENERATING = "generating"
        const val IMAGE_DONE = "done"
        const val IMAGE_ERROR = "error"
    }
}
