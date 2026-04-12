import { useState, useEffect, useCallback } from "react";
import {
  getCharacters, createCharacter, updateCharacter, deleteCharacter,
  uploadCharacterPhoto, getCharacterPhotoUrl, type Character,
  getLocations, createLocation, updateLocation, deleteLocation,
  uploadLocationPhoto, deleteLocationPhoto, getLocationPhotoUrl,
  type LocationWithPhotos, type LocationPhoto,
} from "../api/client";
import { PhotoSourcePicker } from "../components/PhotoSourcePicker";

const MAX_LOCATION_PHOTOS = 3;

export function Featured() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<LocationWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [showCharacterForm, setShowCharacterForm] = useState(false);

  const [editingLocation, setEditingLocation] = useState<LocationWithPhotos | null>(null);
  const [showLocationForm, setShowLocationForm] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [chars, locs] = await Promise.all([getCharacters(), getLocations()]);
      setCharacters(chars);
      setLocations(locs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Character handlers
  const handleSaveCharacter = async (data: { name: string; type: string; notes: string; include_by_default: boolean; photo?: File }) => {
    let char: Character;
    if (editingCharacter) {
      char = await updateCharacter(editingCharacter.id, { name: data.name, type: data.type as "family" | "friend", notes: data.notes, include_by_default: data.include_by_default ? 1 : 0 });
    } else {
      char = await createCharacter({ name: data.name, type: data.type as "family" | "friend", notes: data.notes, include_by_default: data.include_by_default ? 1 : 0 });
    }
    if (data.photo) await uploadCharacterPhoto(char.id, data.photo);
    setShowCharacterForm(false);
    setEditingCharacter(null);
    loadAll();
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!confirm("Delete this character?")) return;
    await deleteCharacter(id);
    loadAll();
  };

  // Location handlers
  const handleSaveLocation = async (data: { name: string; description: string; newPhotos: File[] }) => {
    let loc: { id: string };
    if (editingLocation) {
      loc = await updateLocation(editingLocation.id, { name: data.name, description: data.description });
    } else {
      loc = await createLocation({ name: data.name, description: data.description });
    }
    for (const file of data.newPhotos) {
      await uploadLocationPhoto(loc.id, file);
    }
    setShowLocationForm(false);
    setEditingLocation(null);
    loadAll();
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm("Delete this location?")) return;
    await deleteLocation(id);
    loadAll();
  };

  if (loading) return <div className="empty-state">Loading…</div>;

  const family = characters.filter((c) => c.type === "family");
  const friends = characters.filter((c) => c.type === "friend");
  const hasCharacters = characters.length > 0;
  const hasLocations = locations.length > 0;

  return (
    <div>
      <div className="page-header">
        <h2>⭐ Featured</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => { setEditingCharacter(null); setShowCharacterForm(true); }}>
            + Character
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingLocation(null); setShowLocationForm(true); }}>
            + Location
          </button>
        </div>
      </div>

      {!hasCharacters && !hasLocations && (
        <div className="empty-state">
          <div className="emoji">⭐</div>
          <p>No characters or locations yet. Add family members, friends, and places for your stories!</p>
        </div>
      )}

      {/* Characters */}
      {hasCharacters && (
        <>
          {family.length > 0 && (
            <CharacterSection title="👤 Family" characters={family}
              onEdit={(c) => { setEditingCharacter(c); setShowCharacterForm(true); }}
              onDelete={handleDeleteCharacter} />
          )}
          {friends.length > 0 && (
            <CharacterSection title="👤 Friends" characters={friends}
              onEdit={(c) => { setEditingCharacter(c); setShowCharacterForm(true); }}
              onDelete={handleDeleteCharacter} />
          )}
        </>
      )}

      {/* Locations */}
      {hasLocations && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ marginBottom: 12, color: "var(--text-muted)" }}>📍 Locations</h3>
          <div className="card-grid">
            {locations.map((loc) => (
              <div key={loc.id} className="card" onClick={() => { setEditingLocation(loc); setShowLocationForm(true); }}>
                <div className="card-image">
                  {loc.photos.length > 0 ? (
                    <img src={getLocationPhotoUrl(loc.id, loc.photos[0].id)} alt={loc.name} />
                  ) : "📍"}
                </div>
                <div className="card-body">
                  <h3>{loc.name}</h3>
                  {loc.photos.length > 1 && (
                    <span className="badge badge-default">{loc.photos.length} photos</span>
                  )}
                  {loc.description && <p style={{ marginTop: 4 }}>{loc.description}</p>}
                  <button className="btn btn-danger" style={{ marginTop: 8, fontSize: "0.8rem", padding: "4px 8px" }}
                    onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id); }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCharacterForm && (
        <CharacterFormModal character={editingCharacter} onSave={handleSaveCharacter}
          onClose={() => { setShowCharacterForm(false); setEditingCharacter(null); }} />
      )}
      {showLocationForm && (
        <LocationFormModal location={editingLocation} onSave={handleSaveLocation}
          onClose={() => { setShowLocationForm(false); setEditingLocation(null); }} onReload={loadAll} />
      )}
    </div>
  );
}

/* ── Character sub-components ── */

function CharacterSection({ title, characters, onEdit, onDelete }: {
  title: string; characters: Character[];
  onEdit: (c: Character) => void; onDelete: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ marginBottom: 12, color: "var(--text-muted)" }}>{title}</h3>
      <div className="card-grid">
        {characters.map((c) => (
          <div key={c.id} className="card" onClick={() => onEdit(c)}>
            <div className="card-image">
              {c.photo_path ? <img src={getCharacterPhotoUrl(c.id)} alt={c.name} /> : "👤"}
            </div>
            <div className="card-body">
              <h3>{c.name}</h3>
              <span className={`badge badge-${c.type}`}>{c.type}</span>
              {c.include_by_default ? <span className="badge badge-default">⭐ default</span> : null}
              {c.notes && <p style={{ marginTop: 4 }}>{c.notes}</p>}
              <button className="btn btn-danger" style={{ marginTop: 8, fontSize: "0.8rem", padding: "4px 8px" }}
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CharacterFormModal({ character, onSave, onClose }: {
  character: Character | null;
  onSave: (data: { name: string; type: string; notes: string; include_by_default: boolean; photo?: File }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(character?.name || "");
  const [type, setType] = useState<"family" | "friend">(character?.type || "family");
  const [notes, setNotes] = useState(character?.notes || "");
  const [includeByDefault, setIncludeByDefault] = useState(!!character?.include_by_default);
  const [photo, setPhoto] = useState<File | undefined>();
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    character?.photo_path ? getCharacterPhotoUrl(character.id) : null
  );
  const [saving, setSaving] = useState(false);

  const handlePhotoChange = (files: File[]) => {
    const file = files[0];
    if (file) { setPhoto(file); setPhotoPreview(URL.createObjectURL(file)); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ name, type, notes, include_by_default: includeByDefault, photo }); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{character ? "Edit Character" : "New Character"}</h3>
        <form onSubmit={handleSubmit}>
          <PhotoSourcePicker onFiles={handlePhotoChange}>
            <div className="photo-upload">
              {photoPreview ? <img src={photoPreview} alt="Preview" /> : <span className="photo-upload-label">📷 Add Photo</span>}
            </div>
          </PhotoSourcePicker>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as "family" | "friend")}>
              <option value="family">Family</option>
              <option value="friend">Friend</option>
            </select>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Appearance, personality, favorite things…" />
          </div>
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={includeByDefault} onChange={(e) => setIncludeByDefault(e.target.checked)} />
              Include by default in new stories
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || saving}>
              {saving ? "Saving…" : character ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Location sub-components ── */

function LocationFormModal({ location, onSave, onClose, onReload }: {
  location: LocationWithPhotos | null;
  onSave: (data: { name: string; description: string; newPhotos: File[] }) => Promise<void>;
  onClose: () => void;
  onReload: () => void;
}) {
  const [name, setName] = useState(location?.name || "");
  const [description, setDescription] = useState(location?.description || "");
  const [existingPhotos, setExistingPhotos] = useState<LocationPhoto[]>(location?.photos || []);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const totalPhotos = existingPhotos.length + newPhotos.length;
  const canAddMore = totalPhotos < MAX_LOCATION_PHOTOS;

  const handleAddPhotos = (files: File[]) => {
    const remaining = MAX_LOCATION_PHOTOS - totalPhotos;
    const toAdd = files.slice(0, remaining);
    setNewPhotos((prev) => [...prev, ...toAdd]);
    setNewPreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
  };

  const handleRemoveExisting = async (photo: LocationPhoto) => {
    if (!location) return;
    await deleteLocationPhoto(location.id, photo.id);
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    onReload();
  };

  const handleRemoveNew = (index: number) => {
    URL.revokeObjectURL(newPreviews[index]);
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ name, description, newPhotos }); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{location ? "Edit Location" : "New Location"}</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Photos ({totalPhotos}/{MAX_LOCATION_PHOTOS})
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {existingPhotos.map((photo) => (
                <div key={photo.id} style={{ position: "relative", width: 100, height: 100 }}>
                  <img src={getLocationPhotoUrl(location!.id, photo.id)}
                    alt="" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8 }} />
                  <button type="button" onClick={() => handleRemoveExisting(photo)}
                    style={{
                      position: "absolute", top: -6, right: -6, background: "var(--danger)",
                      color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22,
                      fontSize: 12, cursor: "pointer", lineHeight: "22px", textAlign: "center",
                    }}>✕</button>
                </div>
              ))}
              {newPreviews.map((url, i) => (
                <div key={`new-${i}`} style={{ position: "relative", width: 100, height: 100 }}>
                  <img src={url} alt="" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8 }} />
                  <button type="button" onClick={() => handleRemoveNew(i)}
                    style={{
                      position: "absolute", top: -6, right: -6, background: "var(--danger)",
                      color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22,
                      fontSize: 12, cursor: "pointer", lineHeight: "22px", textAlign: "center",
                    }}>✕</button>
                </div>
              ))}
              {canAddMore && (
                <PhotoSourcePicker onFiles={handleAddPhotos} multiple>
                  <div style={{
                    width: 100, height: 100, border: "2px dashed var(--border)", borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    fontSize: 24, color: "var(--text-muted)",
                  }}>
                    +
                  </div>
                </PhotoSourcePicker>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus
              placeholder="e.g. Dana's Bedroom, Backyard" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this place look like? Key features, colors, decor…" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || saving}>
              {saving ? "Saving…" : location ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
