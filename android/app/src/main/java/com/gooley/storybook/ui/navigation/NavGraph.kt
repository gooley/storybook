package com.gooley.storybook.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.gooley.storybook.data.db.StorybookDatabase
import com.gooley.storybook.data.repository.BookRepository
import com.gooley.storybook.data.sync.SyncWorker
import com.gooley.storybook.ui.bookshelf.BookshelfScreen
import com.gooley.storybook.ui.characters.CharactersScreen
import com.gooley.storybook.ui.characters.EditCharacterScreen
import com.gooley.storybook.ui.create.CreateBookScreen
import com.gooley.storybook.ui.reader.ReaderScreen

object Routes {
    const val BOOKSHELF = "bookshelf"
    const val READER = "reader/{bookId}"
    const val CREATE = "create"
    const val CHARACTERS = "characters"
    const val EDIT_CHARACTER = "character/edit/{characterId}"
    const val ADD_CHARACTER = "character/add"

    fun reader(bookId: Long) = "reader/$bookId"
    fun editCharacter(id: Long) = "character/edit/$id"
}

@Composable
fun NavGraph() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val repository = BookRepository(context)
    val db = StorybookDatabase.getInstance(context)
    val characterDao = db.characterDao()

    NavHost(navController = navController, startDestination = Routes.BOOKSHELF) {
        composable(Routes.BOOKSHELF) {
            BookshelfScreen(
                repository = repository,
                onBookClick = { bookId -> navController.navigate(Routes.reader(bookId)) },
                onCreateClick = { navController.navigate(Routes.CREATE) },
                onCharactersClick = { navController.navigate(Routes.CHARACTERS) },
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
    }
}
