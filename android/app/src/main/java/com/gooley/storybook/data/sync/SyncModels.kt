package com.gooley.storybook.data.sync

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SyncPushRequest(
    val characters: List<SyncCharacter> = emptyList(),
    val books: List<SyncBook> = emptyList(),
    val pages: List<SyncPage> = emptyList()
)

@Serializable
data class SyncPullResponse(
    val characters: List<SyncCharacter> = emptyList(),
    val books: List<SyncBook> = emptyList(),
    val pages: List<SyncPage> = emptyList(),
    @SerialName("server_time") val serverTime: Long = 0
)

@Serializable
data class SyncPushResponse(
    val synced: SyncCounts = SyncCounts(),
    @SerialName("server_time") val serverTime: Long = 0
)

@Serializable
data class SyncCounts(
    val characters: Int = 0,
    val books: Int = 0,
    val pages: Int = 0
)

@Serializable
data class SyncCharacter(
    val id: String,
    val name: String,
    val type: String = "family",
    val notes: String = "",
    @SerialName("photo_path") val photoPath: String? = null,
    @SerialName("include_by_default") val includeByDefault: Int = 0,
    @SerialName("created_at") val createdAt: Long,
    @SerialName("updated_at") val updatedAt: Long,
    @SerialName("deleted_at") val deletedAt: Long? = null
)

@Serializable
data class SyncBook(
    val id: String,
    val title: String,
    val description: String = "",
    @SerialName("cover_image_path") val coverImagePath: String? = null,
    val status: String = "ready",
    val hidden: Int = 0,
    @SerialName("created_at") val createdAt: Long,
    @SerialName("updated_at") val updatedAt: Long,
    @SerialName("deleted_at") val deletedAt: Long? = null
)

@Serializable
data class SyncPage(
    val id: String,
    @SerialName("book_id") val bookId: String,
    @SerialName("page_number") val pageNumber: Int,
    val text: String,
    @SerialName("image_path") val imagePath: String? = null,
    @SerialName("image_status") val imageStatus: String = "done",
    @SerialName("created_at") val createdAt: Long,
    @SerialName("updated_at") val updatedAt: Long,
    @SerialName("deleted_at") val deletedAt: Long? = null
)
