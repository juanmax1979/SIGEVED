import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import {
  formatBytes,
  labelCategory,
  type CaseRecord,
  type CatalogItem,
  type EvidenceRecord,
  type PairPayload,
  type PairingSession,
  type PullRequest,
} from "@espejo/shared";
import { api } from "../api";

type SessionResponse = {
  session: PairingSession;
  cause: CaseRecord;
  catalog: CatalogItem[];
  pulls: PullRequest[];
  evidence: EvidenceRecord[];
};

export function SessionPage() {
  const { id = "", sessionId = "" } = useParams();
  const [view, setView] = useState<SessionResponse | null>(null);
  const [qr, setQr] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const qrReady = useRef(false);

  async function load() {
    const data = await api<SessionResponse>(`/api/sessions/${sessionId}`);
    setView(data);
    if (!qrReady.current) {
      const payload: PairPayload = {
        v: 1,
        host: data.session.host,
        token: data.session.token,
        code: data.session.code,
        caratula: data.cause.caratula,
      };
      setQr(await QRCode.toDataURL(JSON.stringify(payload), { margin: 1, width: 280 }));
      qrReady.current = true;
    }
  }

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo abrir la sesión."));
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  function toggle(localId: string) {
    setSelected((current) =>
      current.includes(localId) ? current.filter((item) => item !== localId) : [...current, localId],
    );
  }

  async function downloadSelected() {
    setError("");
    try {
      await api(`/api/sessions/${sessionId}/pull`, {
        method: "POST",
        body: JSON.stringify({ localIds: selected }),
      });
      setSelected([]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo pedir la descarga.");
    }
  }

  async function close() {
    await api(`/api/sessions/${sessionId}/close`, { method: "POST" });
    await load();
  }

  if (!view && error) return <p className="error">{error}</p>;
  if (!view) return <p className="meta">Preparando la sesión…</p>;

  const received = new Set(view.evidence.map((item) => item.sha256));
  const connected = view.session.status === "connected";

  return (
    <>
      <div className="top">
        <div>
          <div className="kicker">Sesión de descarga</div>
          <h1>{view.cause.caratula}</h1>
          <p className="lede">
            {connected
              ? `Teléfono conectado: ${view.session.deviceName}${view.session.contributorName ? ` · ${view.session.contributorName}` : ""}${view.session.imei ? ` · IMEI ${view.session.imei}` : ""}`
              : "Esperando que la persona aportante escanee el código desde SIGVED."}
          </p>
        </div>
        <div className="row">
          <Link className="btn-ghost" to={`/causas/${id}`}>
            Volver a la causa
          </Link>
          {view.session.status !== "closed" ? (
            <button className="btn-danger" onClick={() => close().catch((reason: unknown) => setError(String(reason)))}>
              Cerrar sesión
            </button>
          ) : (
            <span className="meta">Sesión cerrada</span>
          )}
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="session">
        <section className="panel">
          <div className="kicker">Código</div>
          {qr ? <img className="qr" alt="Código QR de la sesión" src={qr} /> : null}
          <div className="code">{view.session.code}</div>
          <p className="meta">
            También puede escribir la dirección {view.session.host} y este código. La sesión vence a las {new Date(view.session.expiresAt).toLocaleTimeString()}.
          </p>
        </section>
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>En el teléfono</h2>
            <button className="btn" disabled={!connected || selected.length === 0} onClick={downloadSelected}>
              Descargar seleccionados
            </button>
          </div>
          {!connected ? <p className="banner">Cuando el teléfono se conecte, vas a ver acá los archivos que la persona tiene listos.</p> : null}
          {connected && view.catalog.length === 0 ? (
            <p className="meta">El teléfono está conectado y todavía no tiene archivos en SIGVED.</p>
          ) : null}
          {view.catalog.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Archivo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {view.catalog.map((item) => {
                  const pull = view.pulls.find((entry) => entry.localId === item.localId);
                  const done = received.has(item.sha256) || pull?.status === "done";
                  return (
                    <tr key={item.localId}>
                      <td>
                        <input
                          className="check"
                          type="checkbox"
                          aria-label={`Seleccionar ${item.filename}`}
                          checked={selected.includes(item.localId)}
                          disabled={done || view.session.status === "closed"}
                          onChange={() => toggle(item.localId)}
                        />
                      </td>
                      <td>
                        <div>{item.filename}</div>
                        <div className="meta">
                          {labelCategory(item.category)} · {formatBytes(item.size)}
                        </div>
                        {item.note ? <div className="meta">{item.note}</div> : null}
                      </td>
                      <td className={done ? "ok" : ""}>
                        {done ? "Recibido" : pull?.status === "pending" ? "Descargando…" : "En el teléfono"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </section>
      </div>
    </>
  );
}
