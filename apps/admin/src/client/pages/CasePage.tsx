import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  formatBytes,
  labelCaseType,
  labelCategory,
  type CaseRecord,
  type EvidenceRecord,
  type PairingSession,
} from "@espejo/shared";
import { api } from "../api";

export function CasePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [cause, setCause] = useState<CaseRecord | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [sessions, setSessions] = useState<PairingSession[]>([]);
  const [hosts, setHosts] = useState<{ address: string; name: string; preferred: boolean }[]>([]);
  const [host, setHost] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ cause: CaseRecord; evidence: EvidenceRecord[]; sessions: PairingSession[] }>(`/api/cases/${id}`)
      .then((data) => {
        setCause(data.cause);
        setEvidence(data.evidence);
        setSessions(data.sessions);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo abrir la causa."));
    api<{ hosts: { address: string; name: string; preferred: boolean }[] }>("/api/bootstrap")
      .then((data) => {
        setHosts(data.hosts);
        setHost(data.hosts[0]?.address ?? "");
      })
      .catch(() => undefined);
  }, [id]);

  async function openSession() {
    setError("");
    try {
      const data = await api<{ session: PairingSession }>(`/api/cases/${id}/sessions`, {
        method: "POST",
        body: JSON.stringify({ host }),
      });
      navigate(`/causas/${id}/sesion/${data.session.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir la sesión.");
    }
  }

  if (!cause && !error) return <p className="meta">Cargando causa…</p>;
  if (!cause) return <p className="error">{error}</p>;

  return (
    <>
      <div className="top">
        <div>
          <div className="kicker">{labelCaseType(cause.tipo)}</div>
          <h1>{cause.caratula}</h1>
          <p className="lede">
            {cause.expediente || "Sin número de expediente"}
            {cause.dependencia ? ` · ${cause.dependencia}` : ""}
            {cause.responsable ? ` · Recepción: ${cause.responsable}` : ""}
          </p>
        </div>
        <Link to="/" className="btn-ghost">
          Volver
        </Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <section className="panel" style={{ marginBottom: 18 }}>
        <h2>Conectar un teléfono</h2>
        <p className="meta">
          El teléfono y esta computadora tienen que estar en la misma red. La persona aportante confirma en la app qué archivos comparte.
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <label style={{ minWidth: 260 }}>
            Red de esta PC
            <select value={host} onChange={(event) => setHost(event.target.value)}>
              {hosts.length === 0 ? <option value="">Sin red local</option> : null}
              {hosts.map((item) => (
                <option key={item.address} value={item.address}>
                  {item.name} · {item.address}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={openSession} disabled={!host}>
            Abrir sesión de descarga
          </button>
        </div>
        {sessions.find((item) => item.status !== "closed") ? (
          <p className="meta">
            Hay una sesión abierta.{" "}
            <Link to={`/causas/${id}/sesion/${sessions.find((item) => item.status !== "closed")!.id}`}>Continuar</Link>
          </p>
        ) : null}
      </section>
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Archivos recibidos</h2>
          <a className="btn-ghost" href={`/api/cases/${id}/export`}>
            Exportar paquete
          </a>
        </div>
        {cause.notas ? <p className="meta">{cause.notas}</p> : null}
        {evidence.length === 0 ? (
          <p className="meta">Cuando el teléfono envíe archivos, van a aparecer acá con su huella SHA-256.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Categoría</th>
                <th>Huella</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.mime.startsWith("image/") ? (
                      <img className="preview" alt="" src={`/api/evidence/${item.id}/file`} />
                    ) : null}
                    <div>{item.filename}</div>
                    <div className="meta">
                      {formatBytes(item.size)} · {new Date(item.receivedAt).toLocaleString()}
                    </div>
                    {item.note ? <div className="meta">{item.note}</div> : null}
                  </td>
                  <td>{labelCategory(item.category)}</td>
                  <td>
                    <div className="hash">{item.sha256}</div>
                    <div className={item.sha256Verified ? "ok" : "warn"}>
                      {item.sha256Verified ? "Coincide con el teléfono" : "No coincide con la huella del teléfono"}
                    </div>
                  </td>
                  <td>
                    <a href={`/api/evidence/${item.id}/file`} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
