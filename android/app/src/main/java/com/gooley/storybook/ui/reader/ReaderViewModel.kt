package com.gooley.storybook.ui.reader

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.model.Page
import com.gooley.storybook.data.model.PageAudio
import com.gooley.storybook.data.repository.BookRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ReaderViewModel(
    private val repository: BookRepository,
    private val bookId: Long
) : ViewModel() {
    private val _book = MutableStateFlow<Book?>(null)
    val book: StateFlow<Book?> = _book.asStateFlow()

    private val _isRegenerating = MutableStateFlow(false)
    val isRegenerating: StateFlow<Boolean> = _isRegenerating.asStateFlow()

    private val _progress = MutableStateFlow("")
    val progress: StateFlow<String> = _progress.asStateFlow()

    private val _soundEnabled = MutableStateFlow(true)
    val soundEnabled: StateFlow<Boolean> = _soundEnabled.asStateFlow()

    private val _textVisible = MutableStateFlow(true)
    val textVisible: StateFlow<Boolean> = _textVisible.asStateFlow()

    // Map of page local ID → list of audio entries
    private val _pageAudioMap = MutableStateFlow<Map<Long, List<PageAudio>>>(emptyMap())
    val pageAudioMap: StateFlow<Map<Long, List<PageAudio>>> = _pageAudioMap.asStateFlow()

    val pages: StateFlow<List<Page>> = repository.getPagesForBook(bookId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val audioManager = AudioManager()

    init {
        viewModelScope.launch {
            _book.value = repository.getBook(bookId)
        }
    }

    fun loadAudioForPages(pages: List<Page>) {
        viewModelScope.launch {
            val audioMap = mutableMapOf<Long, List<PageAudio>>()
            for (page in pages) {
                val audio = repository.getAudioForPage(page.id)
                if (audio.isNotEmpty()) audioMap[page.id] = audio
            }
            _pageAudioMap.value = audioMap
        }
    }

    fun toggleSound() {
        _soundEnabled.value = !_soundEnabled.value
        if (!_soundEnabled.value) {
            audioManager.stopAll()
        }
    }

    fun toggleText() {
        _textVisible.value = !_textVisible.value
    }

    fun showText() {
        _textVisible.value = true
    }

    fun onPageChange(page: Page) {
        _textVisible.value = true
        if (_soundEnabled.value) {
            val audioEntries = _pageAudioMap.value[page.id] ?: emptyList()
            val ambient = audioEntries.find { it.audioType == "ambient" }
            audioManager.playAmbient(ambient)
        }
    }

    fun onCenterTap(page: Page) {
        if (!_soundEnabled.value) return
        val audioEntries = _pageAudioMap.value[page.id] ?: emptyList()
        val sfxEntries = audioEntries.filter { it.audioType == "sfx" }

        if (_textVisible.value && sfxEntries.isNotEmpty()) {
            _textVisible.value = false
            audioManager.playSfx(sfxEntries)
        } else {
            _textVisible.value = true
        }
    }

    fun regenerateIllustrations() {
        if (_isRegenerating.value) return
        _isRegenerating.value = true
        viewModelScope.launch {
            try {
                repository.regenerateIllustrations(bookId) { progress, _ ->
                    _progress.value = progress
                }
            } finally {
                _isRegenerating.value = false
                _progress.value = ""
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        audioManager.release()
    }
}
