import { useState } from "react";
import {
  SetupStatus,
  setPassword,
  validateApiKey,
  saveApiKey,
  login,
} from "../api/setup";

type Step = "welcome" | "password" | "apikey" | "done";

export function SetupWizard({
  status,
  onComplete,
}: {
  status: SetupStatus;
  onComplete: () => void;
}) {
  const initialStep: Step = status.needsPassword
    ? "welcome"
    : status.needsApiKey
    ? "apikey"
    : "done";

  const [step, setStep] = useState<Step>(initialStep);
  const [passwordVal, setPasswordVal] = useState("");
  const [confirmVal, setConfirmVal] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (passwordVal.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    if (passwordVal !== confirmVal) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      await setPassword(passwordVal);
      // Auto-login after setting password
      await login(passwordVal);
      if (status.needsApiKey) {
        setStep("apikey");
      } else {
        setStep("done");
      }
    } catch (err: any) {
      setError(err.message || "Failed to set password");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!apiKey.trim()) {
      setError("Please paste your API key");
      return;
    }
    setLoading(true);
    try {
      const result = await validateApiKey(apiKey.trim());
      if (!result.valid) {
        setError(result.error || "Invalid API key");
        setLoading(false);
        return;
      }
      await saveApiKey(apiKey.trim());
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Failed to save API key");
    } finally {
      setLoading(false);
    }
  };

  if (step === "welcome") {
    return (
      <div className="setup-page">
        <div className="setup-card">
          <div className="setup-emoji">📖✨</div>
          <h1>Welcome to Storybook!</h1>
          <p className="setup-subtitle">
            Let's get your storybook maker ready. This takes about 2 minutes.
          </p>
          <ul className="setup-checklist">
            <li>
              <span className="check">1</span> Set a password to keep your
              stories private
            </li>
            <li>
              <span className="check">2</span> Connect to OpenRouter for AI
              story generation
            </li>
          </ul>
          <button
            className="btn btn-primary setup-btn"
            onClick={() => setStep("password")}
          >
            Let's Go →
          </button>
        </div>
      </div>
    );
  }

  if (step === "password") {
    return (
      <div className="setup-page">
        <div className="setup-card">
          <div className="setup-step">Step 1 of 2</div>
          <div className="setup-emoji">🔒</div>
          <h2>Set Your Password</h2>
          <p className="setup-subtitle">
            This password protects your storybook. You'll use it to log in.
          </p>
          <form onSubmit={handleSetPassword} className="setup-form">
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={passwordVal}
                onChange={(e) => setPasswordVal(e.target.value)}
                placeholder="Choose a password"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmVal}
                onChange={(e) => setConfirmVal(e.target.value)}
                placeholder="Type it again"
              />
            </div>
            {error && <div className="setup-error">{error}</div>}
            <button
              type="submit"
              className="btn btn-primary setup-btn"
              disabled={loading || !passwordVal || !confirmVal}
            >
              {loading ? "Setting up..." : "Set Password →"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === "apikey") {
    return (
      <div className="setup-page">
        <div className="setup-card">
          <div className="setup-step">
            {status.needsPassword ? "Step 2 of 2" : "Setup"}
          </div>
          <div className="setup-emoji">🔑</div>
          <h2>Connect to OpenRouter</h2>
          <p className="setup-subtitle">
            Storybook uses{" "}
            <a
              href="https://openrouter.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenRouter
            </a>{" "}
            to generate stories and illustrations with AI.
          </p>

          <div className="setup-instructions">
            <h3>How to get your API key:</h3>
            <ol>
              <li>
                Go to{" "}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  openrouter.ai/keys
                </a>
              </li>
              <li>Create an account (or sign in)</li>
              <li>Click "Create Key"</li>
              <li>Copy the key and paste it below</li>
            </ol>
            <p className="setup-cost-note">
              💡 OpenRouter charges per story generated. A typical story costs
              $0.02–$0.10. Add $5 of credit to get started — that's 50–250
              stories!
            </p>
          </div>

          <form onSubmit={handleSaveKey} className="setup-form">
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-..."
                autoFocus
              />
            </div>
            {error && <div className="setup-error">{error}</div>}
            <button
              type="submit"
              className="btn btn-primary setup-btn"
              disabled={loading || !apiKey.trim()}
            >
              {loading ? "Validating..." : "Save & Continue →"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Done step
  return (
    <div className="setup-page">
      <div className="setup-card">
        <div className="setup-emoji">🎉</div>
        <h1>You're All Set!</h1>
        <p className="setup-subtitle">
          Start by adding your family members as characters, then create your
          first story.
        </p>
        <button className="btn btn-primary setup-btn" onClick={onComplete}>
          Start Making Stories →
        </button>
      </div>
    </div>
  );
}
