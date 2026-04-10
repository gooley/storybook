package com.gooley.storybook.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.gooley.storybook.data.model.Location
import com.gooley.storybook.data.model.LocationPhoto
import kotlinx.coroutines.flow.Flow

@Dao
interface LocationDao {
    @Insert
    suspend fun insert(location: Location): Long

    @Update
    suspend fun update(location: Location)

    @Query("SELECT * FROM locations WHERE deletedAt IS NULL ORDER BY name")
    fun getAll(): Flow<List<Location>>

    @Query("SELECT * FROM locations WHERE id = :id AND deletedAt IS NULL")
    suspend fun getById(id: Long): Location?

    @Query("SELECT * FROM locations WHERE uuid = :uuid")
    suspend fun getByUuid(uuid: String): Location?

    @Query("SELECT uuid FROM locations WHERE id = :localId")
    suspend fun getUuidByLocalId(localId: Long): String?

    @Query("UPDATE locations SET deletedAt = :now, updatedAt = :now, dirty = 1 WHERE id = :id")
    suspend fun softDelete(id: Long, now: Long = System.currentTimeMillis())

    // Sync queries
    @Query("SELECT * FROM locations WHERE dirty = 1")
    suspend fun getDirty(): List<Location>

    @Query("UPDATE locations SET dirty = 0 WHERE uuid = :uuid")
    suspend fun markSynced(uuid: String)

    @Update
    suspend fun upsert(location: Location): Int

    // Location photos
    @Insert
    suspend fun insertPhoto(photo: LocationPhoto): Long

    @Query("SELECT * FROM location_photos WHERE locationId = :locationId ORDER BY sortOrder")
    fun getPhotosForLocation(locationId: Long): Flow<List<LocationPhoto>>

    @Query("SELECT * FROM location_photos WHERE locationId = :locationId ORDER BY sortOrder")
    suspend fun getPhotosForLocationSync(locationId: Long): List<LocationPhoto>

    @Query("SELECT * FROM location_photos WHERE uuid = :uuid")
    suspend fun getPhotoByUuid(uuid: String): LocationPhoto?

    @Query("DELETE FROM location_photos WHERE id = :id")
    suspend fun deletePhoto(id: Long)

    @Query("SELECT COUNT(*) FROM location_photos WHERE locationId = :locationId")
    suspend fun getPhotoCount(locationId: Long): Int

    @Query("SELECT * FROM location_photos WHERE dirty = 1")
    suspend fun getDirtyPhotos(): List<LocationPhoto>

    @Query("UPDATE location_photos SET dirty = 0 WHERE uuid = :uuid")
    suspend fun markPhotoSynced(uuid: String)
}
