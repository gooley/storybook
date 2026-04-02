package com.gooley.storybook.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.gooley.storybook.data.repository.BookRepository
import com.gooley.storybook.ui.bookshelf.BookshelfScreen
import com.gooley.storybook.ui.create.CreateBookScreen
import com.gooley.storybook.ui.reader.ReaderScreen

object Routes {
    const val BOOKSHELF = "bookshelf"
    const val READER = "reader/{bookId}"
    const val CREATE = "create"

    fun reader(bookId: Long) = "reader/$bookId"
}

@Composable
fun NavGraph() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val repository = BookRepository(context)

    NavHost(navController = navController, startDestination = Routes.BOOKSHELF) {
        composable(Routes.BOOKSHELF) {
            BookshelfScreen(
                repository = repository,
                onBookClick = { bookId -> navController.navigate(Routes.reader(bookId)) },
                onCreateClick = { navController.navigate(Routes.CREATE) }
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
                onBookCreated = { bookId ->
                    navController.navigate(Routes.reader(bookId)) {
                        popUpTo(Routes.BOOKSHELF)
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }
    }
}
