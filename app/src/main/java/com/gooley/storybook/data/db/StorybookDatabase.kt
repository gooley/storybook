package com.gooley.storybook.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.model.Page

@Database(entities = [Book::class, Page::class], version = 1, exportSchema = false)
abstract class StorybookDatabase : RoomDatabase() {
    abstract fun bookDao(): BookDao
    abstract fun pageDao(): PageDao

    companion object {
        @Volatile
        private var INSTANCE: StorybookDatabase? = null

        fun getInstance(context: Context): StorybookDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    StorybookDatabase::class.java,
                    "storybook.db"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
