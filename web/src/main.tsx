import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Characters } from "./pages/Characters";
import { Books } from "./pages/Books";
import { CreateBook } from "./pages/CreateBook";
import { Reader } from "./pages/Reader";
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="nav">
          <h1 className="nav-title">📖 Storybook</h1>
          <div className="nav-links">
            <NavLink to="/">Books</NavLink>
            <NavLink to="/create">Create</NavLink>
            <NavLink to="/characters">Characters</NavLink>
          </div>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Books />} />
            <Route path="/create" element={<CreateBook />} />
            <Route path="/characters" element={<Characters />} />
            <Route path="/reader/:bookId" element={<Reader />} />
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
