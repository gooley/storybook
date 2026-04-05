package com.gooley.storybook.data.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class ChatRequest(
    val model: String,
    val messages: List<ChatMessage>,
    val temperature: Double = 0.8,
    @SerialName("max_tokens")
    val maxTokens: Int = 4096,
    val modalities: List<String>? = null
)

@Serializable
data class ChatMessage(
    val role: String,
    val content: JsonElement // String or array of content parts
)

@Serializable
data class ChatResponse(
    val id: String = "",
    val choices: List<Choice> = emptyList()
)

@Serializable
data class Choice(
    val message: ChatMessageResponse? = null,
    @SerialName("finish_reason")
    val finishReason: String? = null
)

@Serializable
data class ChatMessageResponse(
    val role: String = "",
    val content: String? = null
)
