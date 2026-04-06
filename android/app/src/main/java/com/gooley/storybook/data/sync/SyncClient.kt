package com.gooley.storybook.data.sync

import android.util.Log
import com.gooley.storybook.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit

class SyncClient {
    private val baseUrl = BuildConfig.SYNC_API_URL.trimEnd('/')

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    fun isConfigured(): Boolean = baseUrl.isNotEmpty()

    suspend fun pushChanges(request: SyncPushRequest): SyncPushResponse = withContext(Dispatchers.IO) {
        val body = json.encodeToString(SyncPushRequest.serializer(), request)
        val httpRequest = Request.Builder()
            .url("$baseUrl/api/sync/push")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(httpRequest).execute()
        val responseBody = response.body?.string() ?: throw Exception("Empty response")
        if (!response.isSuccessful) throw Exception("Push failed (${response.code}): $responseBody")
        json.decodeFromString(SyncPushResponse.serializer(), responseBody)
    }

    suspend fun pullChanges(since: Long): SyncPullResponse = withContext(Dispatchers.IO) {
        val httpRequest = Request.Builder()
            .url("$baseUrl/api/sync/changes?since=$since")
            .get()
            .build()

        val response = client.newCall(httpRequest).execute()
        val responseBody = response.body?.string() ?: throw Exception("Empty response")
        if (!response.isSuccessful) throw Exception("Pull failed (${response.code}): $responseBody")
        json.decodeFromString(SyncPullResponse.serializer(), responseBody)
    }

    suspend fun uploadCharacterPhoto(uuid: String, file: File): Boolean = withContext(Dispatchers.IO) {
        uploadFile("$baseUrl/api/characters/$uuid/photo", "photo", file)
    }

    suspend fun uploadBookCover(uuid: String, file: File): Boolean = withContext(Dispatchers.IO) {
        uploadFile("$baseUrl/api/books/$uuid/cover", "cover", file)
    }

    suspend fun uploadPageImage(pageUuid: String, file: File): Boolean = withContext(Dispatchers.IO) {
        uploadFile("$baseUrl/api/books/pages/$pageUuid/image", "image", file)
    }

    suspend fun downloadFile(url: String, destFile: File): Boolean = withContext(Dispatchers.IO) {
        try {
            val httpRequest = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(httpRequest).execute()
            if (!response.isSuccessful) return@withContext false

            response.body?.byteStream()?.use { input ->
                destFile.parentFile?.mkdirs()
                destFile.outputStream().use { output -> input.copyTo(output) }
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Download failed: ${e.message}")
            false
        }
    }

    fun getCharacterPhotoUrl(uuid: String) = "$baseUrl/api/characters/$uuid/photo"
    fun getBookCoverUrl(uuid: String) = "$baseUrl/api/books/$uuid/cover"
    fun getPageImageUrl(pageUuid: String) = "$baseUrl/api/books/pages/$pageUuid/image"

    private fun uploadFile(url: String, fieldName: String, file: File): Boolean {
        return try {
            val body = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(fieldName, file.name, file.asRequestBody("image/*".toMediaType()))
                .build()

            val request = Request.Builder()
                .url(url)
                .post(body)
                .build()

            val response = client.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            Log.e(TAG, "Upload failed: ${e.message}")
            false
        }
    }

    companion object {
        private const val TAG = "SyncClient"
    }
}
