package com.gooley.storybook.data.api

import android.util.Log
import com.gooley.storybook.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class GenerationClient {
    private val baseUrl = BuildConfig.SYNC_API_URL.trimEnd('/')
    private val apiKey = BuildConfig.SYNC_API_KEY

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun startGeneration(request: GenerationRequest): GenerationStartResponse =
        withContext(Dispatchers.IO) {
            val body = json.encodeToString(GenerationRequest.serializer(), request)
            val httpRequest = Request.Builder()
                .url("$baseUrl/api/generate/book")
                .addHeader("Authorization", "Bearer $apiKey")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: throw Exception("Empty response")
            if (!response.isSuccessful) {
                throw Exception("Generation failed (${response.code}): $responseBody")
            }
            json.decodeFromString(GenerationStartResponse.serializer(), responseBody)
        }

    suspend fun pollStatus(jobId: String): GenerationStatus =
        withContext(Dispatchers.IO) {
            val httpRequest = Request.Builder()
                .url("$baseUrl/api/generate/$jobId/status")
                .addHeader("Authorization", "Bearer $apiKey")
                .get()
                .build()

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: throw Exception("Empty response")
            if (!response.isSuccessful) {
                throw Exception("Status check failed (${response.code}): $responseBody")
            }
            json.decodeFromString(GenerationStatus.serializer(), responseBody)
        }

    suspend fun getActiveJobs(): List<GenerationStatus> =
        withContext(Dispatchers.IO) {
            val httpRequest = Request.Builder()
                .url("$baseUrl/api/generate/active")
                .addHeader("Authorization", "Bearer $apiKey")
                .get()
                .build()

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: throw Exception("Empty response")
            if (!response.isSuccessful) {
                throw Exception("Active jobs check failed (${response.code}): $responseBody")
            }
            json.decodeFromString(responseBody)
        }

    suspend fun cancelJob(jobId: String): Unit =
        withContext(Dispatchers.IO) {
            val httpRequest = Request.Builder()
                .url("$baseUrl/api/generate/$jobId/cancel")
                .addHeader("Authorization", "Bearer $apiKey")
                .post("".toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(httpRequest).execute()
            if (!response.isSuccessful) {
                Log.w(TAG, "Cancel failed: ${response.code}")
            }
        }

    suspend fun regenerateIllustrations(bookUuid: String): GenerationStartResponse =
        withContext(Dispatchers.IO) {
            val httpRequest = Request.Builder()
                .url("$baseUrl/api/generate/$bookUuid/regenerate-illustrations")
                .addHeader("Authorization", "Bearer $apiKey")
                .post("".toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: throw Exception("Empty response")
            if (!response.isSuccessful) {
                throw Exception("Regeneration failed (${response.code}): $responseBody")
            }
            json.decodeFromString(GenerationStartResponse.serializer(), responseBody)
        }

    suspend fun regenerateCovers(): GenerationStartResponse =
        withContext(Dispatchers.IO) {
            val httpRequest = Request.Builder()
                .url("$baseUrl/api/generate/regenerate-covers")
                .addHeader("Authorization", "Bearer $apiKey")
                .post("".toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: throw Exception("Empty response")
            if (!response.isSuccessful) {
                throw Exception("Cover regeneration failed (${response.code}): $responseBody")
            }
            json.decodeFromString(GenerationStartResponse.serializer(), responseBody)
        }

    companion object {
        private const val TAG = "GenerationClient"
    }
}
