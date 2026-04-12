import { useState, useEffect } from "react";
import {
  SystemInfo,
  getSystemInfo,
  changePassword,
  validateApiKey,
  saveApiKey,
  validateElevenLabsKey,
  saveElevenLabsKey,
  logout,
} from "../api/setup";

export function Settings({ onLogout }: { onLogout: () => void }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // API key change
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [keyLoading, setKeyLoading] = useState(false);

  // ElevenLabs key
  const [showElevenLabsForm, setShowElevenLabsForm] = useState(false);
  const [newElevenLabsKey, setNewElevenLabsKey] = useState("");
  const [elevenLabsLoading, setElevenLabsLoading] = useState(false);

  useEffect(() => {
    loadInfo();
  }, []);

  const loadInfo = async () => {
    try {
      setInfo(await getSystemInfo());
    } catch {
      setError("Failed to load system info");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPw.length < 4) {
      setError("New password must be at least 4 characters");
      return;
    }
    if (newPw !== confirmPw) {
      setError("New passwords don't match");
      return;
    }
    try {
      await changePassword(currentPw, newPw);
      setSuccess("Password changed successfully");
      setShowPasswordForm(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch {
      setError("Current password is incorrect");
    }
  };

  const handleChangeKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setKeyLoading(true);
    try {
      const result = await validateApiKey(newKey.trim());
      if (!result.valid) {
        setError(result.error || "Invalid API key");
        setKeyLoading(false);
        return;
      }
      await saveApiKey(newKey.trim());
      setSuccess("API key updated successfully");
      setShowKeyForm(false);
      setNewKey("");
      loadInfo();
    } catch (err: any) {
      setError(err.message || "Failed to update key");
    } finally {
      setKeyLoading(false);
    }
  };

  const handleChangeElevenLabsKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setElevenLabsLoading(true);
    try {
      const result = await validateElevenLabsKey(newElevenLabsKey.trim());
      if (!result.valid) {
        setError(result.error || "Invalid ElevenLabs API key");
        setElevenLabsLoading(false);
        return;
      }
      await saveElevenLabsKey(newElevenLabsKey.trim());
      setSuccess("ElevenLabs API key updated successfully");
      setShowElevenLabsForm(false);
      setNewElevenLabsKey("");
      loadInfo();
    } catch (err: any) {
      setError(err.message || "Failed to update key");
    } finally {
      setElevenLabsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore errors
    }
    onLogout();
  };

  if (!info) {
    return (
      <div className="create-page">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="create-page">
      <h2 style={{ marginBottom: 24 }}>⚙️ Settings</h2>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}
      {success && (
        <div
          className="error-banner"
          style={{ marginBottom: 16, background: "#efe", color: "#2a7a2a", borderColor: "#cec" }}
        >
          {success}
        </div>
      )}

      {/* API Key Status */}
      <div className="card" style={{ cursor: "default", marginBottom: 16 }}>
        <div className="card-body">
          <h3 style={{ marginBottom: 8 }}>🔑 OpenRouter API Key</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: 8 }}>
            Status:{" "}
            <strong style={{ color: info.apiKeyConfigured ? "#2a7a2a" : "#c44" }}>
              {info.apiKeyConfigured ? "Connected" : "Not configured"}
            </strong>
            {info.apiKeyConfigured && (
              <>
                {" "}· Source: {info.apiKeySource} · Key: {info.apiKeyPreview}
              </>
            )}
          </p>
          {!showKeyForm ? (
            <button
              className="btn btn-secondary"
              onClick={() => setShowKeyForm(true)}
            >
              {info.apiKeyConfigured ? "Change API Key" : "Add API Key"}
            </button>
          ) : (
            <form onSubmit={handleChangeKey}>
              <div className="form-group">
                <input
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="sk-or-..."
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={keyLoading || !newKey.trim()}
                >
                  {keyLoading ? "Validating..." : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowKeyForm(false);
                    setNewKey("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ElevenLabs Key Status (Optional) */}
      <div className="card" style={{ cursor: "default", marginBottom: 16 }}>
        <div className="card-body">
          <h3 style={{ marginBottom: 8 }}>🔊 ElevenLabs API Key <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "normal" }}>(optional — for sound effects)</span></h3>
          <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: 8 }}>
            Status:{" "}
            <strong style={{ color: info.elevenLabsKeyConfigured ? "#2a7a2a" : "var(--text-muted)" }}>
              {info.elevenLabsKeyConfigured ? "Connected" : "Not configured"}
            </strong>
            {info.elevenLabsKeyConfigured && (
              <>
                {" "}· Source: {info.elevenLabsKeySource} · Key: {info.elevenLabsKeyPreview}
              </>
            )}
          </p>
          {!info.elevenLabsKeyConfigured && (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 8 }}>
              Add an ElevenLabs key to generate ambient soundscapes and sound effects for your stories.
            </p>
          )}
          {!showElevenLabsForm ? (
            <button
              className="btn btn-secondary"
              onClick={() => setShowElevenLabsForm(true)}
            >
              {info.elevenLabsKeyConfigured ? "Change Key" : "Add Key"}
            </button>
          ) : (
            <form onSubmit={handleChangeElevenLabsKey}>
              <div className="form-group">
                <input
                  type="password"
                  value={newElevenLabsKey}
                  onChange={(e) => setNewElevenLabsKey(e.target.value)}
                  placeholder="sk_..."
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={elevenLabsLoading || !newElevenLabsKey.trim()}
                >
                  {elevenLabsLoading ? "Validating..." : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowElevenLabsForm(false);
                    setNewElevenLabsKey("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Password */}
      {info.authMode === "local" && (
        <div className="card" style={{ cursor: "default", marginBottom: 16 }}>
          <div className="card-body">
            <h3 style={{ marginBottom: 8 }}>🔒 Password</h3>
            {!showPasswordForm ? (
              <button
                className="btn btn-secondary"
                onClick={() => setShowPasswordForm(true)}
              >
                Change Password
              </button>
            ) : (
              <form onSubmit={handleChangePassword}>
                <div className="form-group">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn btn-primary">
                    Update Password
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowPasswordForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Logout */}
      {info.authMode === "local" && (
        <button className="btn btn-danger" onClick={handleLogout}>
          Log Out
        </button>
      )}
    </div>
  );
}
