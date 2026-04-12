package com.gooley.storybook.ui.setup

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupScreen(
    viewModel: SetupViewModel = viewModel(),
    onSetupComplete: () -> Unit,
    initialApiKey: String? = null
) {
    val context = LocalContext.current

    // If we got an API key from a deep link, auto-fill once we reach the PASSWORD step
    var apiKeyApplied by remember { mutableStateOf(false) }
    LaunchedEffect(initialApiKey, viewModel.step, viewModel.authMode) {
        if (!apiKeyApplied &&
            initialApiKey != null &&
            viewModel.step == SetupStep.PASSWORD &&
            viewModel.authMode == "external"
        ) {
            apiKeyApplied = true
            viewModel.password = initialApiKey
            viewModel.login()
        }
    }

    LaunchedEffect(viewModel.step) {
        if (viewModel.step == SetupStep.DONE) {
            onSetupComplete()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Connect to Storybook") })
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = "📚",
                style = MaterialTheme.typography.displayLarge,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            Text(
                text = "Storybook",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(bottom = 32.dp)
            )

            when (viewModel.step) {
                SetupStep.SERVER_URL -> ServerUrlStep(viewModel)
                SetupStep.PASSWORD -> PasswordStep(viewModel, context)
                SetupStep.CONNECTING -> ConnectingStep()
                SetupStep.DONE -> {} // Handled by LaunchedEffect
            }
        }
    }
}

@Composable
private fun ServerUrlStep(viewModel: SetupViewModel) {
    Text(
        text = "Enter your Storybook server URL",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(bottom = 16.dp)
    )

    OutlinedTextField(
        value = viewModel.serverUrl,
        onValueChange = { viewModel.serverUrl = it },
        label = { Text("Server URL") },
        placeholder = { Text("https://my-storybook.railway.app") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Uri,
            imeAction = ImeAction.Go
        ),
        keyboardActions = KeyboardActions(onGo = { viewModel.connectToServer() }),
        modifier = Modifier.fillMaxWidth(),
        isError = viewModel.errorMessage != null
    )

    AnimatedVisibility(visible = viewModel.errorMessage != null) {
        Text(
            text = viewModel.errorMessage ?: "",
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp)
        )
    }

    Spacer(modifier = Modifier.height(16.dp))

    Button(
        onClick = { viewModel.connectToServer() },
        modifier = Modifier.fillMaxWidth(),
        enabled = !viewModel.isLoading && viewModel.serverUrl.isNotBlank()
    ) {
        if (viewModel.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary
            )
        } else {
            Text("Connect")
        }
    }
}

@Composable
private fun PasswordStep(viewModel: SetupViewModel, context: android.content.Context) {
    val isExternal = viewModel.authMode == "external"

    Text(
        text = if (isExternal) "Enter API Key" else "Enter Password",
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(bottom = 8.dp)
    )

    Text(
        text = if (isExternal) {
            "This server uses external authentication. Enter a gool3yhost API key, or tap below to create one."
        } else {
            "Enter the password you set during server setup."
        },
        style = MaterialTheme.typography.bodyMedium,
        textAlign = TextAlign.Center,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 16.dp)
    )

    var passwordVisible by remember { mutableStateOf(false) }

    OutlinedTextField(
        value = viewModel.password,
        onValueChange = { viewModel.password = it },
        label = { Text(if (isExternal) "API Key" else "Password") },
        singleLine = true,
        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(
            keyboardType = if (isExternal) KeyboardType.Text else KeyboardType.Password,
            imeAction = ImeAction.Done
        ),
        keyboardActions = KeyboardActions(onDone = { viewModel.login() }),
        trailingIcon = {
            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                Text(if (passwordVisible) "🙈" else "👁")
            }
        },
        modifier = Modifier.fillMaxWidth(),
        isError = viewModel.errorMessage != null
    )

    AnimatedVisibility(visible = viewModel.errorMessage != null) {
        Text(
            text = viewModel.errorMessage ?: "",
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp)
        )
    }

    Spacer(modifier = Modifier.height(16.dp))

    Button(
        onClick = { viewModel.login() },
        modifier = Modifier.fillMaxWidth(),
        enabled = !viewModel.isLoading && viewModel.password.isNotBlank()
    ) {
        if (viewModel.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary
            )
        } else {
            Text(if (isExternal) "Save API Key" else "Login")
        }
    }

    if (isExternal) {
        val intent = viewModel.buildApiKeyIntent()
        if (intent != null) {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(
                onClick = { context.startActivity(intent) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Create API Key in Browser")
            }
        }
    }

    Spacer(modifier = Modifier.height(8.dp))

    TextButton(
        onClick = { viewModel.disconnect() }
    ) {
        Text("← Back to server URL")
    }
}

@Composable
private fun ConnectingStep() {
    CircularProgressIndicator(modifier = Modifier.padding(16.dp))
    Text(
        text = "Connecting to server…",
        style = MaterialTheme.typography.bodyLarge
    )
}
