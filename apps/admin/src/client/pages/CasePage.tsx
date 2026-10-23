import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  errorAportante,
  formatBytes,
  labelCategory,
  nombreCarpetaExpediente,
  type CaseRecord,
  type EvidenceRecord,
  type PairingSession,
} from "@espejo/shared";
import { api } from "../api";
import { AportantePanel } from "./AportantePanel";
import { UsbPanel } from "./UsbPanel";

export function CasePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [cause, setCause] = useState<CaseRecord | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [sessions, setSessions] = useState<PairingSession[]>([]);
  const [hosts, setHosts] = useState<{ address: string; name: string; preferred: boolean }[]>([]);
  const [host, setHost] = useState("");
  const [error, setError] = useState("");
  const [packageHash, setPackageHash] = useState("");
  const [packing, setPacking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingAportante, setEditingAportante] = useState(false);
  const [wifiAbierta, setWifiAbierta] = useState(false);

  function reload() {
    api<{ cause: CaseRecord; evidence: EvidenceRecord[]; sessions: PairingSession[] }>(`/api/cases/${id}`)
      .then((data) => {
        setCause(data.cause);
        setEvidence(data.evidence);
        setSessions(data.sessions);
        if (errorAportante(data.cause.aportante) || !data.cause.aportante.dniFoto) setEditingAportante(true);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo abrir la causa."));
  }

  useEffect(() => {
    reload();
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

  async function pack() {
    setPacking(true);
    setError("");
    try {
      const data = await api<{ sha256: string }>(`/api/cases/${id}/package`, { method: "POST" });
      setPackageHash(data.sha256);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo armar el paquete.");
    } finally {
      setPacking(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await api(`/api/cases/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo eliminar la causa.");
      setDeleting(false);
    }
  }

  if (!cause && !error) return <p className="meta">Cargando causa…</p>;
  if (!cause) return <p className="error">{error}</p>;

  return (
    <>
      <div className="top">
        <div>
          {cause.proceso ? <div className="kicker">{cause.proceso}</div> : null}
          <h1>{cause.caratula}</h1>
          <p className="lede">
            {cause.expediente || "Sin número de expediente"}
            {cause.dependencia ? ` · ${cause.dependencia}` : ""}
            {cause.oficina ? ` · Carga en ${cause.oficina}` : ""}
            {cause.responsable ? ` · Recepción: ${cause.responsable}` : ""}
          </p>
        </div>
        <div className="row">
          <button
            className="btn-ghost"
            type="button"
            onClick={() => {
              setEditingAportante(true);
              document.getElementById("aportante")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Datos del aportante
          </button>
          <button className="btn-danger" type="button" onClick={() => setConfirming(true)}>
            Eliminar causa
          </button>
          <Link to="/" className="btn-ghost">
            Volver
          </Link>
        </div>
      </div>
      {confirming ? (
        <section className="panel" style={{ marginBottom: 18 }}>
          <h2>Eliminar causa</h2>
          <p className="error">Se eliminarán todos los registros de la causa y la causa.</p>
          <div className="row">
            <button className="btn-ghost" type="button" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancelar
            </button>
            <button className="btn-danger" type="button" onClick={() => void remove()} disabled={deleting}>
              {deleting ? "Eliminando…" : "Eliminar causa"}
            </button>
          </div>
        </section>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <AportantePanel
        cause={cause}
        editing={editingAportante}
        onEditing={setEditingAportante}
        onSaved={setCause}
      />
      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="section-head">
          <h2>Conectar un teléfono</h2>
          <button
            className="fold-arrow"
            type="button"
            aria-expanded={wifiAbierta}
            aria-controls="conexion-wifi"
            aria-label={wifiAbierta ? "Ocultar conexión por red" : "Mostrar conexión por red"}
            onClick={() => setWifiAbierta((abierta) => !abierta)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M6 3.5 11 8 6 12.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {wifiAbierta ? (
          <div id="conexion-wifi">
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
          </div>
        ) : null}
      </section>
      <UsbPanel caseId={id} onSaved={reload} />
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Archivos recibidos</h2>
          <button className="btn-ghost" onClick={pack} disabled={packing}>
            {packing ? "Armando paquete…" : "Armar paquete y huella"}
          </button>
        </div>
        {cause.notas ? <p className="meta">{cause.notas}</p> : null}
        {packageHash ? (
          <div className="meta">
            <div>Huella SHA-256 del paquete {nombreCarpetaExpediente(cause.expediente)}.zip</div>
            <div className="hash">{packageHash}</div>
            <div>
              <a href={`/api/cases/${id}/package/zip`}>Descargar zip</a>
              {" · "}
              <a href={`/api/cases/${id}/package/acta`}>Descargar acta (Word)</a>
              {" · "}
              <a href={`/api/cases/${id}/package/informe`}>Descargar informe PDF</a>
            </div>
          </div>
        ) : null}
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
                      {item.source === "pantalla" ? " · pantalla por USB" : item.source === "dispositivo" ? " · archivo del teléfono" : ""}
                    </div>
                    {item.note ? <div className="meta">{item.note}</div> : null}
                  </td>
                  <td>{labelCategory(item.category)}</td>
                  <td>
                    <div className="hash">{item.sha256}</div>
                    <div className={item.sha256Verified ? "ok" : "warn"}>
                      {item.source === "pantalla" || item.source === "dispositivo"
                        ? "Huella calculada en esta estación"
                        : item.sha256Verified
                          ? "Coincide con el teléfono"
                          : "No coincide con la huella del teléfono"}
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
