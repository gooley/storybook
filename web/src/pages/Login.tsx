import { useState } from "react";
import { login } from "../api/setup";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPasswordVal] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(password);
      onSuccess();
    } catch {
      setError("Incorrect password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <div className="setup-card">
        <div className="setup-emoji">📖</div>
        <h1>Storybook</h1>
        <p className="setup-subtitle">Enter your password to continue</p>
        <form onSubmit={handleSubmit} className="setup-form">
          <div className="form-group">
            <input
              type="password"
              value={password}
              onChange={(e) => setPasswordVal(e.target.value)}
              placeholder="Password"
              autoFocus
            />
          </div>
          {error && <div className="setup-error">{error}</div>}
          <button
            type="submit"
            className="btn btn-primary setup-btn"
            disabled={loading || !password}
          >
            {loading ? "Checking..." : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}
