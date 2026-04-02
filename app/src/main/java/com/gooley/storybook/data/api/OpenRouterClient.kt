package com.gooley.storybook.data.api

import android.util.Base64
import android.util.Log
import com.gooley.storybook.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit

class OpenRouterClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val apiKey = BuildConfig.OPENROUTER_API_KEY
    private val baseUrl = "https://openrouter.ai/api/v1/chat/completions"

    suspend fun generateStory(title: String, description: String, pageCount: Int = 8): List<StoryPage> =
        withContext(Dispatchers.IO) {
            val systemPrompt = """
                You are a children's storybook author. Write a short, engaging story for young children (ages 3-7).
                
                Rules:
                - The story must have exactly $pageCount pages
                - Each page should have 2-3 short sentences (suitable for reading aloud)
                - Use simple, vivid language that children enjoy
                - The story should have a clear beginning, middle, and end
                - Include descriptive scenes that would make good illustrations
                
                Format your response as a JSON array of objects with "pageNumber" and "text" fields.
                Example: [{"pageNumber": 1, "text": "Once upon a time..."}, {"pageNumber": 2, "text": "The next thing..."}]
                
                Return ONLY the JSON array, no other text.
            """.trimIndent()

            val userPrompt = "Write a children's story called \"$title\". Here's the idea: $description"

            val request = ChatRequest(
                model = "anthropic/claude-sonnet-4.6",
                messages = listOf(
                    ChatMessage(role = "system", content = systemPrompt),
                    ChatMessage(role = "user", content = userPrompt)
                )
            )

            val response = makeRequest(request)
            val content = response.choices.firstOrNull()?.message?.content
                ?: throw Exception("No response from LLM")

            parseStoryPages(content)
        }

    suspend fun generateIllustration(
        pageText: String,
        bookTitle: String,
        outputFile: File
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val prompt = """Generate an illustration for a children's storybook page.

Book title: "$bookTitle"
Page text: "$pageText"

Style: Sharp pen and ink illustration with bold lines. Use a limited palette of 6 highly saturated colors suitable for a color e-ink display. The illustration should be simple, clear, and appealing to young children. No text in the image."""

            val request = ChatRequest(
                model = "google/gemini-3.1-flash-image-preview",
                messages = listOf(
                    ChatMessage(role = "user", content = prompt)
                ),
                maxTokens = 4096
            )

            val body = json.encodeToString(request)
            Log.d(TAG, "Image generation request for: ${pageText.take(50)}...")

            val httpRequest = Request.Builder()
                .url(baseUrl)
                .addHeader("Authorization", "Bearer $apiKey")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: throw Exception("Empty response")

            if (!response.isSuccessful) {
                Log.e(TAG, "Image gen failed: ${response.code} - $responseBody")
                return@withContext false
            }

            // Parse the response - Gemini returns inline_data with base64 image
            Log.d(TAG, "Image response (first 500): ${responseBody.take(500)}")
            val imageData = extractImageData(responseBody)
            if (imageData != null) {
                val bytes = Base64.decode(imageData, Base64.DEFAULT)
                outputFile.writeBytes(bytes)
                Log.d(TAG, "Saved illustration to ${outputFile.absolutePath}")
                true
            } else {
                Log.w(TAG, "No image data in response")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Image generation error", e)
            false
        }
    }

    private fun extractImageData(responseJson: String): String? {
        // OpenRouter returns image data in message.images[0].image_url.url
        // as a data URI: "data:image/png;base64,<data>"
        return try {
            val parsed = json.parseToJsonElement(responseJson)
            val choices = parsed.asObject()["choices"]?.asArray() ?: return null
            val message = choices.firstOrNull()?.asObject()?.get("message")?.asObject() ?: return null

            // Check message.images array (OpenRouter image model format)
            val images = message["images"]?.asArray()
            if (images != null && images.isNotEmpty()) {
                val imageObj = images.first().asObject()
                val imageUrl = imageObj["image_url"]?.asObject()
                val url = imageUrl?.get("url")?.let {
                    (it as? kotlinx.serialization.json.JsonPrimitive)?.content
                }
                if (url != null && url.contains("base64,")) {
                    return url.substringAfter("base64,")
                }
            }

            // Fallback: check content for base64 data URI
            val content = message["content"]
            if (content != null) {
                val contentStr = content.toString()
                val base64Regex = Regex("""data:image/[^;]+;base64,([A-Za-z0-9+/=]+)""")
                val match = base64Regex.find(contentStr)
                if (match != null) {
                    return match.groupValues[1]
                }
            }

            null
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing image response", e)
            null
        }
    }

    private fun makeRequest(request: ChatRequest): ChatResponse {
        val body = json.encodeToString(request)

        val httpRequest = Request.Builder()
            .url(baseUrl)
            .addHeader("Authorization", "Bearer $apiKey")
            .addHeader("Content-Type", "application/json")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(httpRequest).execute()
        val responseBody = response.body?.string() ?: throw Exception("Empty response")

        if (!response.isSuccessful) {
            throw Exception("API error ${response.code}: $responseBody")
        }

        return json.decodeFromString<ChatResponse>(responseBody)
    }

    private fun parseStoryPages(content: String): List<StoryPage> {
        // Extract JSON array from response (may be wrapped in markdown code block)
        val jsonStr = content
            .replace(Regex("```json\\s*"), "")
            .replace(Regex("```\\s*"), "")
            .trim()

        return json.decodeFromString<List<StoryPage>>(jsonStr)
    }

    // Helper extensions for kotlinx JsonElement
    private fun kotlinx.serialization.json.JsonElement.asObject() =
        this as? kotlinx.serialization.json.JsonObject ?: kotlinx.serialization.json.JsonObject(emptyMap())
    private fun kotlinx.serialization.json.JsonElement.asArray() =
        (this as? kotlinx.serialization.json.JsonArray)?.toList()

    companion object {
        private const val TAG = "OpenRouterClient"
    }
}

@kotlinx.serialization.Serializable
data class StoryPage(
    val pageNumber: Int,
    val text: String
)
