package com.gooley.storybook.ui.locations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.gooley.storybook.data.db.LocationDao
import com.gooley.storybook.data.model.Location
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class LocationsViewModel(private val locationDao: LocationDao) : ViewModel() {
    val locations: StateFlow<List<Location>> = locationDao.getAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun deleteLocation(location: Location) {
        viewModelScope.launch { locationDao.softDelete(location.id) }
    }
}
