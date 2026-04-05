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

@Database(entities = [Book::class, Page::class, Character::class], version = 3, exportSchema = false)
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

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Add sync columns to books
                db.execSQL("ALTER TABLE books ADD COLUMN uuid TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE books ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE books ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1")
                db.execSQL("ALTER TABLE books ADD COLUMN deletedAt INTEGER")

                // Add sync columns to pages
                db.execSQL("ALTER TABLE pages ADD COLUMN uuid TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE pages ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE pages ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1")
                db.execSQL("ALTER TABLE pages ADD COLUMN deletedAt INTEGER")

                // Add sync columns to characters
                db.execSQL("ALTER TABLE characters ADD COLUMN uuid TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE characters ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE characters ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1")
                db.execSQL("ALTER TABLE characters ADD COLUMN deletedAt INTEGER")

                // Generate UUIDs for existing records
                db.execSQL("""
                    UPDATE books SET uuid = lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
                    updatedAt = createdAt WHERE uuid = ''
                """.trimIndent())
                db.execSQL("""
                    UPDATE pages SET uuid = lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
                    updatedAt = (SELECT createdAt FROM books WHERE books.id = pages.bookId) WHERE uuid = ''
                """.trimIndent())
                db.execSQL("""
                    UPDATE characters SET uuid = lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
                    updatedAt = createdAt WHERE uuid = ''
                """.trimIndent())

                // Create unique indexes on uuid
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_books_uuid ON books(uuid)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_uuid ON pages(uuid)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_uuid ON characters(uuid)")
            }
        }

        fun getInstance(context: Context): StorybookDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    StorybookDatabase::class.java,
                    "storybook.db"
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
