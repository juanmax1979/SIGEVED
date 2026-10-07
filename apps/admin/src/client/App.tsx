import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { bootstrap, type Bootstrap } from "./api";
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
        <h1>Espejo</h1>
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
      <aside className="rail">
        <Link to="/" className="mark">
          <div className="mark-badge">E</div>
          <div>
            <strong>Espejo</strong>
            <span>Estación local PJCH</span>
          </div>
        </Link>
        <p>
          Recibe fotos, videos y documentos que la persona aportante elige en su teléfono. Los archivos quedan en esta computadora.
        </p>
        <div className="rail-foot">
          Equipo {station.hostname}
          <br />
          Puerto {station.port}
          <br />
          {station.hosts[0] ? `Red ${station.hosts[0].address}` : "Sin red local detectada"}
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<CasesPage />} />
          <Route path="/causas/:id" element={<CasePage />} />
          <Route path="/causas/:id/sesion/:sessionId" element={<SessionPage />} />
        </Routes>
      </main>
    </div>
  );
}
