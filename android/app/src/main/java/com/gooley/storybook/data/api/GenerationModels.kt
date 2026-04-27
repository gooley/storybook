package com.gooley.storybook.data.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GenerationRequest(
    val description: String,
    @SerialName("pageCount") val pageCount: Int,
    @SerialName("storyMode") val storyMode: String? = null,
    @SerialName("characterIds") val characterIds: List<String>,
    @SerialName("locationIds") val locationIds: List<String> = emptyList(),
    @SerialName("bookId") val bookId: String? = null
)

@Serializable
data class GenerationStartResponse(
    @SerialName("jobId") val jobId: String,
    @SerialName("bookId") val bookId: String
)

@Serializable
data class GenerationStatus(
    val id: String,
    val status: String,
    @SerialName("bookId") val bookId: String? = null,
    @SerialName("progressMessage") val progressMessage: String? = null,
    @SerialName("progressFraction") val progressFraction: Float = 0f,
    @SerialName("completedSteps") val completedSteps: Int = 0,
    @SerialName("totalSteps") val totalSteps: Int = 0,
    @SerialName("firstIllustrationReady") val firstIllustrationReady: Boolean = false,
    @SerialName("completedPageIds") val completedPageIds: List<String> = emptyList(),
    @SerialName("errorMessage") val errorMessage: String? = null,
    @SerialName("createdAt") val createdAt: Long = 0,
    @SerialName("updatedAt") val updatedAt: Long = 0
) {
    val isDone: Boolean get() = status == "done"
    val isError: Boolean get() = status == "error"
    val isTerminal: Boolean get() = isDone || isError || status == "cancelled"
}
