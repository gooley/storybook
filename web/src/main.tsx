import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Featured } from "./pages/Featured";
import { Books } from "./pages/Books";
import { CreateBook } from "./pages/CreateBook";
import { Reader } from "./pages/Reader";
import { BookDebug } from "./pages/BookDebug";
import { AllImages } from "./pages/AllImages";
import { SetupWizard } from "./pages/SetupWizard";
import { Login } from "./pages/Login";
import { Settings } from "./pages/Settings";
import { getSetupStatus, checkAuth, SetupStatus } from "./api/setup";
import "./index.css";

type AppState = "loading" | "setup" | "login" | "ready";

function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const status = await getSetupStatus();
      setSetupStatus(status);

      if (status.needsSetup) {
        setAppState("setup");
        return;
      }

      // Setup complete — check auth
      if (status.authMode === "external") {
        setAppState("ready");
        return;
      }

      try {
        const auth = await checkAuth();
        setAppState(auth.authenticated ? "ready" : "login");
      } catch {
        setAppState("login");
      }
    } catch {
      // If setup status fails, show login (server might require auth)
      setAppState("login");
    }
  };

  if (appState === "loading") {
    return (
      <div className="setup-page">
        <div className="setup-card">
          <div className="setup-emoji">📖</div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (appState === "setup" && setupStatus) {
    return (
      <SetupWizard
        status={setupStatus}
        onComplete={() => setAppState("ready")}
      />
    );
  }

  if (appState === "login") {
    return <Login onSuccess={() => setAppState("ready")} />;
  }

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="nav">
          <h1 className="nav-title">📖 Storybook</h1>
          <div className="nav-links">
            <NavLink to="/">Books</NavLink>
            <NavLink to="/create">Create</NavLink>
            <NavLink to="/featured">Featured</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </div>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Books />} />
            <Route path="/create" element={<CreateBook />} />
            <Route path="/featured" element={<Featured />} />
            <Route path="/reader/:bookId" element={<Reader />} />
            <Route path="/reader/:bookId/debug" element={<BookDebug />} />
            <Route path="/reader/:bookId/images" element={<AllImages />} />
            <Route
              path="/settings"
              element={
                <Settings
                  onLogout={() => setAppState("login")}
                />
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
