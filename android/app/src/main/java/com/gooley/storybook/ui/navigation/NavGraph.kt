package com.gooley.storybook.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.gooley.storybook.data.auth.ServerConfig
import com.gooley.storybook.data.db.StorybookDatabase
import com.gooley.storybook.data.repository.BookRepository
import com.gooley.storybook.data.sync.SyncWorker
import com.gooley.storybook.ui.bookshelf.BookshelfScreen
import com.gooley.storybook.ui.characters.CharactersScreen
import com.gooley.storybook.ui.characters.EditCharacterScreen
import com.gooley.storybook.ui.create.CreateBookScreen
import com.gooley.storybook.ui.locations.EditLocationScreen
import com.gooley.storybook.ui.locations.LocationsScreen
import com.gooley.storybook.ui.reader.ReaderScreen
import com.gooley.storybook.ui.setup.SetupScreen

object Routes {
    const val SETUP = "setup"
    const val BOOKSHELF = "bookshelf"
    const val READER = "reader/{bookId}"
    const val CREATE = "create"
    const val CHARACTERS = "characters"
    const val EDIT_CHARACTER = "character/edit/{characterId}"
    const val ADD_CHARACTER = "character/add"
    const val LOCATIONS = "locations"
    const val ADD_LOCATION = "location/add"
    const val EDIT_LOCATION = "location/edit/{locationId}"

    fun reader(bookId: Long) = "reader/$bookId"
    fun editCharacter(id: Long) = "character/edit/$id"
    fun editLocation(id: Long) = "location/edit/$id"
}

@Composable
fun NavGraph(initialApiKey: String? = null) {
    val navController = rememberNavController()
    val context = LocalContext.current
    val repository = BookRepository(context)
    val db = StorybookDatabase.getInstance(context)
    val characterDao = db.characterDao()
    val locationDao = db.locationDao()

    val startDestination = if (ServerConfig.isConfigured) Routes.BOOKSHELF else Routes.SETUP

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Routes.SETUP) {
            SetupScreen(
                onSetupComplete = {
                    // Start sync now that we're configured
                    SyncWorker.schedulePeriodicSync(context)
                    SyncWorker.syncNow(context)
                    navController.navigate(Routes.BOOKSHELF) {
                        popUpTo(Routes.SETUP) { inclusive = true }
                    }
                },
                initialApiKey = initialApiKey
            )
        }

        composable(Routes.BOOKSHELF) { backStackEntry ->
            // Sync every time the bookshelf becomes active (initial load + returning from other screens)
            DisposableEffect(backStackEntry) {
                val observer = LifecycleEventObserver { _, event ->
                    if (event == Lifecycle.Event.ON_RESUME) {
                        SyncWorker.syncNow(context)
                    }
                }
                backStackEntry.lifecycle.addObserver(observer)
                onDispose { backStackEntry.lifecycle.removeObserver(observer) }
            }

            BookshelfScreen(
                repository = repository,
                onBookClick = { bookId -> navController.navigate(Routes.reader(bookId)) },
                onCreateClick = { navController.navigate(Routes.CREATE) },
                onCharactersClick = { navController.navigate(Routes.CHARACTERS) },
                onLocationsClick = { navController.navigate(Routes.LOCATIONS) },
                onSyncClick = { SyncWorker.syncNow(context) }
            )
        }

        composable(
            route = Routes.READER,
            arguments = listOf(navArgument("bookId") { type = NavType.LongType })
        ) { backStackEntry ->
            val bookId = backStackEntry.arguments?.getLong("bookId") ?: return@composable
            ReaderScreen(
                bookId = bookId,
                repository = repository,
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.CREATE) {
            CreateBookScreen(
                repository = repository,
                characterDao = characterDao,
                locationDao = locationDao,
                onBookCreated = { bookId ->
                    navController.navigate(Routes.reader(bookId)) {
                        popUpTo(Routes.BOOKSHELF)
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.CHARACTERS) {
            CharactersScreen(
                characterDao = characterDao,
                onAddClick = { navController.navigate(Routes.ADD_CHARACTER) },
                onEditClick = { id -> navController.navigate(Routes.editCharacter(id)) },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.ADD_CHARACTER) {
            EditCharacterScreen(
                characterDao = characterDao,
                characterId = null,
                onSaved = { navController.popBackStack() },
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Routes.EDIT_CHARACTER,
            arguments = listOf(navArgument("characterId") { type = NavType.LongType })
        ) { backStackEntry ->
            val characterId = backStackEntry.arguments?.getLong("characterId") ?: return@composable
            EditCharacterScreen(
                characterDao = characterDao,
                characterId = characterId,
                onSaved = { navController.popBackStack() },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.LOCATIONS) {
            LocationsScreen(
                locationDao = locationDao,
                onAddClick = { navController.navigate(Routes.ADD_LOCATION) },
                onEditClick = { id -> navController.navigate(Routes.editLocation(id)) },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Routes.ADD_LOCATION) {
            EditLocationScreen(
                locationDao = locationDao,
                locationId = null,
                onSaved = { navController.popBackStack() },
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Routes.EDIT_LOCATION,
            arguments = listOf(navArgument("locationId") { type = NavType.LongType })
        ) { backStackEntry ->
            val locationId = backStackEntry.arguments?.getLong("locationId") ?: return@composable
            EditLocationScreen(
                locationDao = locationDao,
                locationId = locationId,
                onSaved = { navController.popBackStack() },
                onBack = { navController.popBackStack() }
            )
        }
    }
}
