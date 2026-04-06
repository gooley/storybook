import { useState, useEffect, useCallback } from "react";
import {
  getCharacters, createCharacter, updateCharacter, deleteCharacter,
  uploadCharacterPhoto, getCharacterPhotoUrl, type Character,
} from "../api/client";

export function Characters() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Character | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try { setCharacters(await getCharacters()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: { name: string; type: string; notes: string; include_by_default: boolean; photo?: File }) => {
    let char: Character;
    if (editing) {
      char = await updateCharacter(editing.id, { name: data.name, type: data.type as "family" | "friend", notes: data.notes, include_by_default: data.include_by_default ? 1 : 0 });
    } else {
      char = await createCharacter({ name: data.name, type: data.type as "family" | "friend", notes: data.notes, include_by_default: data.include_by_default ? 1 : 0 });
    }
    if (data.photo) await uploadCharacterPhoto(char.id, data.photo);
    setShowForm(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this character?")) return;
    await deleteCharacter(id);
    load();
  };

  if (loading) return <div className="empty-state">Loading…</div>;

  const family = characters.filter((c) => c.type === "family");
  const friends = characters.filter((c) => c.type === "friend");

  return (
    <div>
      <div className="page-header">
        <h2>👤 Characters</h2>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Add Character
        </button>
      </div>
      {characters.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">👤</div>
          <p>No characters yet. Add family members and friends for your stories!</p>
        </div>
      ) : (
        <>
          {family.length > 0 && (
            <Section title="Family" characters={family}
              onEdit={(c) => { setEditing(c); setShowForm(true); }} onDelete={handleDelete} />
          )}
          {friends.length > 0 && (
            <Section title="Friends" characters={friends}
              onEdit={(c) => { setEditing(c); setShowForm(true); }} onDelete={handleDelete} />
          )}
        </>
      )}
      {showForm && (
        <FormModal character={editing} onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }} />
      )}
    </div>
  );
}

function Section({ title, characters, onEdit, onDelete }: {
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

function FormModal({ character, onSave, onClose }: {
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

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
          <div className="photo-upload">
            {photoPreview ? <img src={photoPreview} alt="Preview" /> : <span className="photo-upload-label">📷 Add Photo</span>}
            <input type="file" accept="image/*" onChange={handlePhotoChange} />
          </div>
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
