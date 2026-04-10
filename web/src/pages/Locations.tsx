import { useState, useEffect, useCallback } from "react";
import {
  getLocations, createLocation, updateLocation, deleteLocation,
  uploadLocationPhoto, deleteLocationPhoto, getLocationPhotoUrl,
  type LocationWithPhotos, type LocationPhoto,
} from "../api/client";

const MAX_PHOTOS = 3;

export function Locations() {
  const [locations, setLocations] = useState<LocationWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LocationWithPhotos | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try { setLocations(await getLocations()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: { name: string; description: string; newPhotos: File[] }) => {
    let loc: { id: string };
    if (editing) {
      loc = await updateLocation(editing.id, { name: data.name, description: data.description });
    } else {
      loc = await createLocation({ name: data.name, description: data.description });
    }
    for (const file of data.newPhotos) {
      await uploadLocationPhoto(loc.id, file);
    }
    setShowForm(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this location?")) return;
    await deleteLocation(id);
    load();
  };

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>📍 Locations</h2>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Add Location
        </button>
      </div>
      {locations.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📍</div>
          <p>No locations yet. Add places like bedrooms, backyards, or schools for your stories!</p>
        </div>
      ) : (
        <div className="card-grid">
          {locations.map((loc) => (
            <div key={loc.id} className="card" onClick={() => { setEditing(loc); setShowForm(true); }}>
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
                  onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <LocationFormModal location={editing} onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }} onReload={load} />
      )}
    </div>
  );
}

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
  const canAddMore = totalPhotos < MAX_PHOTOS;

  const handleAddPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_PHOTOS - totalPhotos;
    const toAdd = files.slice(0, remaining);
    setNewPhotos((prev) => [...prev, ...toAdd]);
    setNewPreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
    e.target.value = "";
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
          {/* Photo gallery */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Photos ({totalPhotos}/{MAX_PHOTOS})
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
                <label style={{
                  width: 100, height: 100, border: "2px dashed var(--border)", borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                  fontSize: 24, color: "var(--text-muted)",
                }}>
                  +
                  <input type="file" accept="image/*" onChange={handleAddPhotos} style={{ display: "none" }} />
                </label>
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
