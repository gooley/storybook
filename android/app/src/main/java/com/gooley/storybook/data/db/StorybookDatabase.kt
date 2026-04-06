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

@Database(entities = [Book::class, Page::class, Character::class], version = 5, exportSchema = false)
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
                // Room requires columns have NO SQL-level DEFAULT, so we must
                // recreate tables rather than ALTER TABLE ADD COLUMN ... DEFAULT.

                // 1. Save existing data
                db.execSQL("CREATE TABLE temp_books AS SELECT * FROM books")
                db.execSQL("CREATE TABLE temp_pages AS SELECT * FROM pages")
                db.execSQL("CREATE TABLE temp_characters AS SELECT * FROM characters")

                // 2. Drop old tables (children first)
                db.execSQL("DROP TABLE IF EXISTS pages")
                db.execSQL("DROP TABLE IF EXISTS books")
                db.execSQL("DROP TABLE IF EXISTS characters")

                // 3. Create new tables with sync columns (no DEFAULT clauses)
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS books (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        uuid TEXT NOT NULL,
                        title TEXT NOT NULL,
                        description TEXT NOT NULL,
                        coverImagePath TEXT,
                        status TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        updatedAt INTEGER NOT NULL,
                        dirty INTEGER NOT NULL,
                        deletedAt INTEGER
                    )
                """.trimIndent())

                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS pages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        uuid TEXT NOT NULL,
                        bookId INTEGER NOT NULL,
                        pageNumber INTEGER NOT NULL,
                        text TEXT NOT NULL,
                        imagePath TEXT,
                        imageStatus TEXT NOT NULL,
                        updatedAt INTEGER NOT NULL,
                        dirty INTEGER NOT NULL,
                        deletedAt INTEGER,
                        FOREIGN KEY(bookId) REFERENCES books(id) ON DELETE CASCADE
                    )
                """.trimIndent())

                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS characters (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        uuid TEXT NOT NULL,
                        name TEXT NOT NULL,
                        type TEXT NOT NULL,
                        notes TEXT NOT NULL,
                        photoPath TEXT,
                        createdAt INTEGER NOT NULL,
                        updatedAt INTEGER NOT NULL,
                        dirty INTEGER NOT NULL,
                        deletedAt INTEGER
                    )
                """.trimIndent())

                // 4. Copy data with generated UUIDs
                val uuidExpr = "lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(6)))"

                db.execSQL("""
                    INSERT INTO books (id, uuid, title, description, coverImagePath, status, createdAt, updatedAt, dirty, deletedAt)
                    SELECT id, $uuidExpr, title, description, coverImagePath, status, createdAt, createdAt, 1, NULL
                    FROM temp_books
                """.trimIndent())

                db.execSQL("""
                    INSERT INTO pages (id, uuid, bookId, pageNumber, text, imagePath, imageStatus, updatedAt, dirty, deletedAt)
                    SELECT id, $uuidExpr, bookId, pageNumber, text, imagePath, imageStatus, COALESCE((SELECT createdAt FROM temp_books WHERE temp_books.id = temp_pages.bookId), 0), 1, NULL
                    FROM temp_pages
                """.trimIndent())

                db.execSQL("""
                    INSERT INTO characters (id, uuid, name, type, notes, photoPath, createdAt, updatedAt, dirty, deletedAt)
                    SELECT id, $uuidExpr, name, type, notes, photoPath, createdAt, createdAt, 1, NULL
                    FROM temp_characters
                """.trimIndent())

                // 5. Drop temp tables
                db.execSQL("DROP TABLE temp_books")
                db.execSQL("DROP TABLE temp_pages")
                db.execSQL("DROP TABLE temp_characters")

                // 6. Create indexes
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_books_uuid ON books(uuid)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_pages_bookId ON pages(bookId)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_pages_uuid ON pages(uuid)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_characters_uuid ON characters(uuid)")
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE books ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE characters ADD COLUMN includeByDefault INTEGER NOT NULL DEFAULT 0")
            }
        }

        fun getInstance(context: Context): StorybookDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    StorybookDatabase::class.java,
                    "storybook.db"
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
