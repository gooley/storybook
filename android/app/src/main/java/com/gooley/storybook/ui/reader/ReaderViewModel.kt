package com.gooley.storybook.ui.reader

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.model.Page
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

    val pages: StateFlow<List<Page>> = repository.getPagesForBook(bookId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            _book.value = repository.getBook(bookId)
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
}
