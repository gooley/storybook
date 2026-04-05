package com.gooley.storybook.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.gooley.storybook.data.model.Book
import com.gooley.storybook.data.model.Character
import com.gooley.storybook.data.model.Page

@Database(entities = [Book::class, Page::class, Character::class], version = 2, exportSchema = false)
abstract class StorybookDatabase : RoomDatabase() {
    abstract fun bookDao(): BookDao
    abstract fun pageDao(): PageDao
    abstract fun characterDao(): CharacterDao

    companion object {
        @Volatile
        private var INSTANCE: StorybookDatabase? = null

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS characters (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        name TEXT NOT NULL,
                        type TEXT NOT NULL DEFAULT 'family',
                        notes TEXT NOT NULL DEFAULT '',
                        photoPath TEXT,
                        createdAt INTEGER NOT NULL DEFAULT 0
                    )
                """.trimIndent())
            }
        }

        fun getInstance(context: Context): StorybookDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    StorybookDatabase::class.java,
                    "storybook.db"
                )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
