package com.gooley.storybook.data.auth

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

@Serializable
data class AuthCheckResponse(
    val authenticated: Boolean,
    val authMode: String
)

@Serializable
data class LoginResponse(
    val success: Boolean,
    val token: String? = null,
    val error: String? = null,
    val message: String? = null
)

@Serializable
data class SetupStatusResponse(
    val needsSetup: Boolean,
    val needsPassword: Boolean,
    val needsApiKey: Boolean,
    val authMode: String
)

class AuthClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Check server reachability and get auth mode.
     * Returns the setup status, or throws on network error.
     */
    suspend fun checkServer(baseUrl: String): SetupStatusResponse = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/api/setup/status")
            .get()
            .build()
        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: throw Exception("Empty response")
        if (!response.isSuccessful) throw Exception("Server error (${response.code})")
        json.decodeFromString(SetupStatusResponse.serializer(), body)
    }

    /**
     * Login with password (local auth mode).
     * Returns the session token on success.
     */
    suspend fun login(baseUrl: String, password: String): LoginResponse = withContext(Dispatchers.IO) {
        val payload = """{"password":"${password.replace("\"", "\\\"")}"}"""
        val request = Request.Builder()
            .url("$baseUrl/api/auth/login")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: throw Exception("Empty response")
        json.decodeFromString(LoginResponse.serializer(), body)
    }

    /**
     * Verify that a token is still valid.
     */
    suspend fun checkAuth(baseUrl: String, token: String): AuthCheckResponse = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/api/auth/check")
            .addHeader("Authorization", "Bearer $token")
            .get()
            .build()
        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: throw Exception("Empty response")
        json.decodeFromString(AuthCheckResponse.serializer(), body)
    }
}
