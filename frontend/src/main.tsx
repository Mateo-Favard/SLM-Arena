import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import "./style.css";

const Nav: React.FC = () => (
  <nav className="nav">
    <span className="nav-brand">SLM Arena</span>
    <div className="nav-links">
      <NavLink to="/" end>Matches</NavLink>
      <NavLink to="/models">Models</NavLink>
    </div>
  </nav>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/models" element={<LeaderboardPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  </React.StrictMode>
);
