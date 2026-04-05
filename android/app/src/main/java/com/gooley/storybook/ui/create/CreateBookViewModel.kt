package com.gooley.storybook.ui.create

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gooley.storybook.data.db.CharacterDao
import com.gooley.storybook.data.model.Character
import com.gooley.storybook.data.repository.BookRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class CreateBookUiState(
    val description: String = "",
    val pageCount: Int = 4,
    val isGenerating: Boolean = false,
    val progress: String = "",
    val progressFraction: Float = 0f,
    val firstIllustrationPath: String? = null,
    val error: String? = null,
    val createdBookId: Long? = null,
    val availableCharacters: List<Character> = emptyList(),
    val selectedCharacterIds: Set<Long> = emptySet()
)

class CreateBookViewModel(
    private val repository: BookRepository,
    private val characterDao: CharacterDao
) : ViewModel() {
    private val _uiState = MutableStateFlow(CreateBookUiState())
    val uiState: StateFlow<CreateBookUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val characters = characterDao.getAll().first()
            _uiState.value = _uiState.value.copy(availableCharacters = characters)
        }
    }

    fun updateDescription(description: String) {
        _uiState.value = _uiState.value.copy(description = description)
    }

    fun updatePageCount(count: Int) {
        _uiState.value = _uiState.value.copy(pageCount = count)
    }

    fun toggleCharacter(id: Long) {
        val current = _uiState.value.selectedCharacterIds
        _uiState.value = _uiState.value.copy(
            selectedCharacterIds = if (id in current) current - id else current + id
        )
    }

    fun generateBook() {
        val state = _uiState.value
        if (state.description.isBlank()) return
        if (state.isGenerating) return

        _uiState.value = state.copy(isGenerating = true, error = null, firstIllustrationPath = null)

        viewModelScope.launch {
            try {
                val totalSteps = state.pageCount + 2 // story + first illus + remaining + cover
                var currentStep = 0
                val bookId = repository.generateBook(
                    description = state.description,
                    pageCount = state.pageCount,
                    selectedCharacterIds = state.selectedCharacterIds,
                    onProgress = { progress ->
                        currentStep++
                        _uiState.value = _uiState.value.copy(
                            progress = progress,
                            progressFraction = (currentStep.toFloat() / totalSteps).coerceIn(0f, 1f)
                        )
                    },
                    onFirstIllustration = { path ->
                        _uiState.value = _uiState.value.copy(firstIllustrationPath = path)
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
