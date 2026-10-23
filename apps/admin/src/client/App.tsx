import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { bootstrap, type Bootstrap } from "./api";
import { Logo } from "./Logo";
import { CasePage } from "./pages/CasePage";
import { CasesPage } from "./pages/CasesPage";
import { SessionPage } from "./pages/SessionPage";

export function App() {
  const [station, setStation] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    bootstrap()
      .then(setStation)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo abrir la estación."));
  }, []);

  if (error) {
    return (
      <main className="main">
        <h1>S.I.G.E.V.E.D.</h1>
        <p className="error">{error}</p>
      </main>
    );
  }

  if (!station) {
    return (
      <main className="main">
        <p className="meta">Abriendo la estación…</p>
      </main>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <Logo />
          <div>
            <strong>S.I.G.E.V.E.D.</strong>
            <span>Sistema Integral de Gestión y Extracción Voluntaria de Evidencia Digital</span>
            <span>Poder Judicial del Chaco</span>
          </div>
        </Link>
        <div className="topbar-side">
          <a className="btn-ghost" href="/api/manual">
            Ayuda
          </a>
          <div className="topbar-meta">
            Equipo {station.hostname}
            <br />
            Puerto {station.port}
            {station.hosts[0] ? ` · Red ${station.hosts[0].address}` : ""}
          </div>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<CasesPage />} />
          <Route path="/causas/:id" element={<CasePage />} />
          <Route path="/causas/:id/sesion/:sessionId" element={<SessionPage />} />
        </Routes>
      </main>
      <footer className="foot">© 2026 Poder Judicial del Chaco</footer>
    </div>
  );
}
