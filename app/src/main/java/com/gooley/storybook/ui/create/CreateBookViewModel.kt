package com.gooley.storybook.ui.create

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gooley.storybook.data.repository.BookRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CreateBookUiState(
    val title: String = "",
    val description: String = "",
    val isGenerating: Boolean = false,
    val progress: String = "",
    val error: String? = null,
    val createdBookId: Long? = null
)

class CreateBookViewModel(private val repository: BookRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(CreateBookUiState())
    val uiState: StateFlow<CreateBookUiState> = _uiState.asStateFlow()

    fun updateTitle(title: String) {
        _uiState.value = _uiState.value.copy(title = title)
    }

    fun updateDescription(description: String) {
        _uiState.value = _uiState.value.copy(description = description)
    }

    fun generateBook() {
        val state = _uiState.value
        if (state.title.isBlank() || state.description.isBlank()) return
        if (state.isGenerating) return

        _uiState.value = state.copy(isGenerating = true, error = null)

        viewModelScope.launch {
            try {
                val bookId = repository.generateBook(
                    title = state.title,
                    description = state.description,
                    onProgress = { progress ->
                        _uiState.value = _uiState.value.copy(progress = progress)
                    }
                )
                _uiState.value = _uiState.value.copy(
                    isGenerating = false,
                    createdBookId = bookId
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isGenerating = false,
                    error = e.message ?: "Generation failed"
                )
            }
        }
    }
}
