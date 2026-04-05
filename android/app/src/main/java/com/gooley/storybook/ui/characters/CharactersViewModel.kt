package com.gooley.storybook.ui.characters

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gooley.storybook.data.db.CharacterDao
import com.gooley.storybook.data.model.Character
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CharactersViewModel(private val characterDao: CharacterDao) : ViewModel() {
    val characters: StateFlow<List<Character>> = characterDao.getAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun deleteCharacter(character: Character) {
        viewModelScope.launch { characterDao.softDelete(character.id) }
    }
}
